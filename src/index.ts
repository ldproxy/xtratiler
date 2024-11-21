if (process.env.XTRATILER_INSTRUMENTATION === "true") {
  (async () => {
    await import("./util/instrumentation.js");
  })();
}

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import cmds from "./cmd/index.js";
import cluster from "cluster";

export type GlobalArgs = {
  verbose: number;
  yes: boolean;
};

const version = process.env.NODE_ENV === "production" ? "$$VERSION$$" : "DEV";
//TODO
const args = cluster.isPrimary
  ? hideBin(process.argv)
  : hideBin(process.argv.slice(1));

const cli = yargs(args)
  .scriptName("xtratiler")
  .strict()
  .detectLocale(false)
  .demandCommand(1, "")
  .command(cmds)
  .alias("help", "h")
  .version(version)
  .option("verbose", {
    alias: "v",
    type: "count",
    description: "Run with verbose logging",
  })
  .option("yes", {
    type: "boolean",
    description: "Do not ask for confirmation",
  });
/*.epilogue("for more information, find our manual at http://example.com")*/

cli.wrap(Math.min(100, cli.terminalWidth())).parse();
