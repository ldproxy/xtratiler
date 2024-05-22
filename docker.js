import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import fs, { ensureDir } from "fs-extra";

const __dirname = dirname(fileURLToPath(import.meta.url));

const dist = join(__dirname, "dist/app/bin");

await ensureDir(dist);

await fs.writeFile(
  join(dist, "xt"),
  `#!/bin/bash\nNODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt xvfb-run -a /app/bin/xtratiler $@\n`,
  { mode: 0o755 }
);
