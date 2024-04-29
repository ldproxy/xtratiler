import { Argv, Arguments, ArgumentsCamelCase, CommandBuilder } from "yargs";
import confirm from "@inquirer/confirm";

import { JobParameters, render } from "../renderer/index.js";
import { logger } from "../util/index.js";
import { GlobalArgs } from "../index.js";

export type RenderArgs = GlobalArgs & {
  style: string;
  store: string;
  minZoom: number;
  maxZoom: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export const command = "render <style>";

export const describe = "submit a raster tile rendering job";

export const builder = (yargs: Argv<{}>) => {
  return yargs
    .positional("style", {
      describe: "mablibre style to render",
      normalize: true,
      demandOption: true,
    })
    .option("store", {
      alias: "s",
      type: "string",
      normalize: true,
      nargs: 1,
      demandOption: true,
      requiresArg: true,
      //demandOption: true,
      description: "ldproxy store directory",
      //defaultDescription: "current directory",
      default: "./",
      group: "Render options:",
    })
    .option("min-zoom", {
      alias: "z",
      type: "number",
      nargs: 1,
      description: "min zoom level",
      default: 0,
      group: "Render options:",
    })
    .option("max-zoom", {
      alias: "Z",
      type: "number",
      nargs: 1,
      description: "max zoom level",
      default: -1,
      defaultDescription: "min-zoom",
      group: "Render options:",
    })
    .option("minx", {
      alias: "x",
      type: "number",
      nargs: 1,
      description: "min col",
      default: 0,
      group: "Render options:",
    })
    .option("maxx", {
      alias: "X",
      type: "number",
      nargs: 1,
      description: "max col",
      default: -1,
      defaultDescription: "minx",
      group: "Render options:",
    })
    .option("miny", {
      alias: "y",
      type: "number",
      nargs: 1,
      description: "min row",
      default: 0,
      group: "Render options:",
    })
    .option("maxy", {
      alias: "Y",
      type: "number",
      nargs: 1,
      description: "max row",
      default: -1,
      defaultDescription: "miny",
      group: "Render options:",
    })
    .example([
      ['$0 --config "~/config.json"', "Use custom config"],
      ["$0 --safe", "Start in safe mode"],
    ]);
};

export const handler = async (argv: ArgumentsCamelCase<{}>) => {
  const argv2 = argv as ArgumentsCamelCase<RenderArgs>;
  //TODO: validate input, parse other
  const job: JobParameters = {
    stylePath: argv2.style,
    storePath: argv2.store,
    z: 8,
    minX: 102, //86,
    maxX: 103, //87,
    minY: 153, //132,
    maxY: 154, //133,
    //TODO: is this defined in the tms?
    size: 256,
    ratio: 2,
  };

  const proceed = argv.yes || (await confirmRender(job));

  if (!proceed) {
    logger.info("Aborted");
    return;
  }

  if (argv.verbose) {
    logger.info(`style: ${argv.style}, store: ${argv.store}`);
  }

  await render(job);

  logger.info("Rendered map");
};

const confirmRender = async (job: JobParameters) => {
  console.log("Render job summary:");
  console.log(job);
  console.log();

  return await confirm({
    message: "Are you sure?",
    default: true,
  });
};
