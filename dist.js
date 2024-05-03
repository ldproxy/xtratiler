import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import fs, { copy, remove, ensureDir } from "fs-extra";
import postject from "postject";

const __dirname = dirname(fileURLToPath(import.meta.url));
const binary = join(__dirname, "dist/app/bin/xtratiler");
const build = join(__dirname, "build");
const seaCfg = join(build, "sea-config.json");

if (process.argv[2] === "--bin-path") {
  process.stdout.write(binary);
  process.exit(0);
}

if (process.argv[2] === "--sea-path") {
  process.stdout.write(seaCfg);
  process.exit(0);
}

if (process.argv[2] === "--pre") {
  await remove(join(__dirname, "dist"));

  await ensureDir(join(__dirname, "dist/app/bin"));

  await copy(process.argv[0], binary);

  await fs.chmod(binary, 0o755);

  await copy(join(__dirname, "build/lib"), join(__dirname, "dist/app/lib"));

  await fs.writeJSON(seaCfg, {
    main: join(build, "index.cjs"),
    output: join(build, "sea-prep.blob"),
    disableExperimentalSEAWarning: true,
  });

  process.exit(0);
}

const blob = await fs.readFile(join(__dirname, "build/sea-prep.blob"));
const isMac = process.argv[2] === "--mac";

await postject.inject(binary, "NODE_SEA_BLOB", blob, {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  machoSegmentName: isMac ? "NODE_SEA" : undefined,
});
