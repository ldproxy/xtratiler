import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { exec } from "promisify-child-process";
import fs, { copy, ensureDir } from "fs-extra";
import deb from "debian-packaging";
import download from "download";

import pkg from "./package.json" assert { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));

const dist = join(__dirname, "dist");
const distApp = join(dist, "app");
const distDebCtrl = join(dist, "deb/ctrl");
const distDebData = join(dist, "deb/data");
const distDebLib = join(dist, "deb/lib");
const distDebInstallDir = "/opt/xtraserver/webapi";
const distDebSystemdDir = "/lib/systemd/system";
const distDebTarget = join(distDebData, distDebInstallDir);
const distDebSystemdTarget = join(distDebData, distDebSystemdDir);
const pkgDeb = join(dist, `${pkg.name}_${pkg.version}-1_amd64.deb`);

await ensureDir(distDebCtrl);
await ensureDir(distDebLib);
await ensureDir(distDebTarget);
await ensureDir(distDebSystemdTarget);

await copy(join(distApp, "bin"), join(distDebTarget, "bin"));
await copy(join(distApp, "lib"), join(distDebTarget, "lib"));

await getMissingLibs();

await copy(
  join(distDebLib, "usr/lib/x86_64-linux-gnu"),
  join(distDebTarget, "lib/debian")
);

await fs.writeFile(
  join(distDebTarget, "bin/xt"),
  `#!/bin/bash\nNODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt LD_LIBRARY_PATH="${join(
    distDebInstallDir,
    "lib/debian"
  )}" xvfb-run -a /opt/xtraserver/webapi/bin/xtratiler $@\n`,
  { mode: 0o755 }
);

await fs.writeFile(
  join(distDebSystemdTarget, "xtratiler.service"),
  createSystemd()
);

const control = {
  Package: pkg.name,
  Architecture: "amd64",
  Version: pkg.version,
  Description: pkg.description,
  Maintainer: {
    Name: pkg.author,
  },
  Depends: [
    "libglx0",
    "libopengl0",
    "libuv1",
    "libcurl4",
    "libwebp7",
    "xvfb",
    "xtraserver-webapi",
  ],
};

console.log("Creating package...", pkgDeb, distDebData, control);

await fs.writeFile(join(distDebCtrl, "control"), createControl(control));
await fs.writeFile(join(distDebCtrl, "preinst"), createPreInst(), {
  mode: 0o755,
});
await fs.writeFile(join(distDebCtrl, "postinst"), createPostInst(), {
  mode: 0o755,
});
await fs.writeFile(join(distDebCtrl, "prerm"), createPreRm(), {
  mode: 0o755,
});

await deb.createPackage({
  control: distDebCtrl,
  data: distDebData,
  dest: pkgDeb,
});

async function getMissingLibs() {
  const libs = {
    jpeg: "http://mirrors.kernel.org/ubuntu/pool/main/libj/libjpeg-turbo/libjpeg-turbo8_2.1.2-0ubuntu1_amd64.deb",
    png: "http://mirrors.kernel.org/ubuntu/pool/main/libp/libpng1.6/libpng16-16_1.6.37-3build5_amd64.deb",
    icu: "http://mirrors.kernel.org/ubuntu/pool/main/i/icu/libicu70_70.1-2_amd64.deb",
  };

  await Promise.all(
    Object.keys(libs).map((lib) => {
      console.log("Downloading", libs[lib]);

      return download(libs[lib], distDebLib, { filename: `${lib}.deb` }).then(
        () =>
          exec(`dpkg-deb -x ${join(distDebLib, `${lib}.deb`)} ${distDebLib}`)
      );
    })
  );
}

function createControl(ctrl) {
  if (
    !(
      ctrl.Package &&
      ctrl.Architecture &&
      ctrl.Version &&
      ctrl.Maintainer &&
      ctrl.Description
    )
  )
    throw new Error("Control file is invalid");
  //if (!archTest.includes(controlConfig.Architecture))
  //  throw new Error("Invalid package architecture!");

  let controlFile = [];

  Object.keys(ctrl).forEach((keyName) => {
    let keyString = keyName + ": ";
    if (
      ctrl[keyName] === undefined ||
      ctrl[keyName] === null ||
      ctrl[keyName] === ""
    ) {
      return;
    } else if (keyName === "Description") {
      controlFile.push(
        keyString +
          ctrl[keyName]
            .trim()
            .split("\n")
            .map((line, index) => {
              if (index === 0) return line.trim();
              if ((line = line.trimEnd()).length === 0 || line === ".")
                return ` .`;
              return ` ${line.trimEnd()}`;
            })
            .join("\n")
            .trim()
      );
    } else if (keyName === "Maintainer" || keyName === "Original-Maintainer") {
      const { Name, Email } = ctrl[keyName];
      if (!Email) {
        controlFile.push(keyString + Name);
      } else {
        controlFile.push(keyString + `${Name} <${Email}>`);
      }
    } else {
      const data = ctrl[keyName];

      if (typeof data === "boolean") {
        keyString += data ? "yes" : "no";
      } else if (Array.isArray(data)) {
        keyString += data.join(", ");
      } else {
        keyString += String(data);
      }

      controlFile.push(keyString);
    }
  });

  return controlFile.join("\n") + "\n";
}

function createSystemd() {
  return `[Unit]
Description=xtratiler
After=xtraserver-webapi.target

[Service]
ExecStart=/bin/sh /opt/xtraserver/webapi/bin/xt agent -c 32 -r 2 -f
Restart=always
RestartSec=30
WorkingDirectory=/opt/xtraserver/webapi/data
User=xtraserver

[Install]
WantedBy=multi-user.target
`;
}

function createPreInst() {
  return `#!/bin/sh

${createUtils()}

# stop service 
serv=/lib/systemd/system/xtratiler.service

if test -f "$serv" && command -v systemctl >/dev/null 2>&1 ; then
  log_info "Stopping service xtratiler"
  systemctl stop xtratiler
else
  log_info "Service xtratiler was not installed or there was another problem so the service could not be stopped."
fi

# because of peculiar reasons, the script will exit 1 otherwise
exit 0
`;
}

function createPostInst() {
  return `#!/bin/sh

${createUtils()}

if [ "$1" = "configure" -o "$1" = "install" -o "$1" = "1" ]; then
  log_info "Installing xtratiler systemd service"
  if [ -f /lib/systemd/system/xtratiler.service ]; then
    if command -v systemctl >/dev/null 2>&1 ; then
      log_info "Enabling xtratiler service"
      systemctl enable xtratiler
      log_info "Installing xtratiler systemd service completed"
    else
      log_warn "Systemd is not installed, the xtratiler service will not be enabled"
    fi
  else
    log_error "xtratiler service could not be enabled. Please make sure the package is installed correctly."
    #exit 1
  fi
fi

# But always restart the service
if [ -f /lib/systemd/system/xtratiler.service ]; then
  if command -v systemctl >/dev/null 2>&1 ; then
    systemctl daemon-reload
    systemctl restart xtratiler || echo "The service xtratiler could not be (re-)started: $?"
  fi
fi

# because of peculiar reasons, the script will exit 1 otherwise
exit 0
`;
}

function createPreRm() {
  return `#!/bin/sh

${createUtils()}

# only when removing, not when just upgrading the package 
if [ "$1" = "remove" -o "$1" = "purge" -o "$1" = "0" ]; then

  log_info "Uninstalling xtratiler service"
  if test -f "/lib/systemd/system/xtratiler.service" && command -v systemctl >/dev/null 2>&1 ; then
    log_info "Stopping xtratiler service"
    systemctl stop xtratiler
    systemctl disable xtratiler
    if [ $? != 0 ]; then
      log_warn "The service xtratiler could not be disabled: $?"
    fi
    systemctl daemon-reload
    log_info "Uninstalling xtratiler service completed."
  else
    log_info "The service xtratiler was not installed."
  fi
fi

# because of peculiar reasons, the script will exit 1 otherwise
exit 0
`;
}

function createUtils() {
  return `
log_info() {
	printf "$1\n"
}

log_warn() {
  printf "\x1b[1;33mWarning:\x1b[0m $1\n"
}

log_error() {
  printf "\x1b[1;33mError:\x1b[0m $1\n"
}
`;
}
