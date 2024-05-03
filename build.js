import { build } from "esbuild";
import { clean } from "esbuild-plugin-clean";
import { replace } from "esbuild-plugin-replace";
import { copy } from "esbuild-plugin-copy";

const platform = `${process.platform}-${process.arch}`;
const nodeVersion = process.versions.node.split(".")[0];

if (nodeVersion !== "20") {
  console.error(
    `Node.js version ${nodeVersion} is not supported, please use Node.js version 20.`
  );
  process.exit(1);
}

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  //logLevel: "debug",
  /*loader: {
    ".node": "copy",
  },*/
  outdir: "build",
  outbase: "node_modules",
  entryNames: "[name]",
  assetNames: "lib/[dir]/[name]",
  outExtension: {
    ".js": ".cjs",
  },
  banner: {
    //js: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
    js: "const require2 = require('node:sea').isSea() ? require('node:module').createRequire(__filename) : require;",
  },
  plugins: [
    clean({
      patterns: ["./build/*"],
    }),
    replace({
      delimiters: ["", ""],
      values: {
        "require('../../lib/node-v'":
          "require2('../lib/@maplibre/maplibre-gl-native/lib/node-v'",
        "process.versions.modules": `"${process.versions.modules}"`,
        "${runtimePlatform}": platform,
        "/mbgl": "/mbgl.node",
        "if (sharp) {": `sharp = require2('../lib/@img/sharp-${platform}/lib/sharp-${platform}.node'); if (sharp) {`,
      },
    }),
    copy({
      assets: [
        {
          from: ["./node_modules/@maplibre/**/*.node"],
          to: ["./lib/@maplibre"],
        },
        {
          from: [
            "./node_modules/@img/**/*.node",
            "./node_modules/@img/**/*.dylib",
            "./node_modules/@img/**/*.so.42",
          ],
          to: ["./lib/@img"],
        },
      ],
    }),
  ],
});
