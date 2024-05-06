import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import cmds from "./cmd/index.js";

export type GlobalArgs = {
  verbose: boolean;
  yes: boolean;
};

const cli = yargs(hideBin(process.argv))
  .scriptName("xtratiler")
  .strict()
  .detectLocale(false)
  .demandCommand(1, "")
  .command(cmds)
  .alias("help", "h")
  .option("verbose", {
    alias: "v",
    type: "boolean",
    description: "Run with verbose logging",
  })
  .option("yes", {
    type: "boolean",
    description: "Do not ask for confirmation",
  });
/*.epilogue("for more information, find our manual at http://example.com")*/

cli.wrap(Math.min(100, cli.terminalWidth())).parse();
