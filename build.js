import { build } from "esbuild";
import { clean } from "esbuild-plugin-clean";
import { replace } from "esbuild-plugin-replace";
import { copy } from "esbuild-plugin-copy";
import pkg from "./package.json" assert { type: "json" };

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
  minify: true,
  //logLevel: "debug",
  /*loader: {
    ".node": "copy",
  },*/
  outdir: "build",
  outbase: "node_modules",
  entryNames: "bin/[name]",
  assetNames: "lib/[dir]/[name]",
  outExtension: {
    ".js": ".cjs",
  },
  banner: {
    //js: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
    js: "const require2 = require('node:sea').isSea() ? require('node:module').createRequire(__filename) : require;",
  },
  define: {
    "process.env.NODE_ENV": '"production"',
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
        "require('bindings')('node_sqlite3.node')":
          "require2('../lib/sqlite3/build/Release/node_sqlite3.node')",
        "./schema.sql": "../lib/@mapbox/mbtiles/lib/schema.sql",
        $$VERSION$$: pkg.version,
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
        {
          from: ["./node_modules/sqlite3/**/*.node"],
          to: ["./lib/sqlite3"],
        },
        {
          from: ["./node_modules/@mapbox/**/*.sql"],
          to: ["./lib/@mapbox"],
        },
      ],
    }),
  ],
});
