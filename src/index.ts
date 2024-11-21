if (process.env.XTRATILER_INSTRUMENTATION === "true") {
  (async () => {
    await import("./util/instrumentation.js");
  })();
}

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import cmds from "./cmd/index.js";

export type GlobalArgs = {
  verbose: number;
  yes: boolean;
};

const version = process.env.NODE_ENV === "production" ? "$$VERSION$$" : "DEV";
const args =
  process.argv.length > 2 && process.argv[2] === process.argv[1]
    ? hideBin(process.argv.slice(1))
    : hideBin(process.argv);

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
