import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import cmds from "./cmd/index.js";

const cli = yargs(hideBin(process.argv))
  .scriptName("maptiler")
  .strict()
  .detectLocale(false)
  .demandCommand(1, "")
  .command(cmds)
  .option("verbose", {
    alias: "v",
    type: "boolean",
    description: "Run with verbose logging",
  });

cli.parse();
