import { Argv, ArgumentsCamelCase } from "yargs";
import confirm from "@inquirer/confirm";

import { JobParameters, render } from "../renderer/index.js";
import { createLogger } from "../util/index.js";
import { GlobalArgs } from "../index.js";

export type RenderArgs = GlobalArgs & {
  style: string;
  store: string;
  tms: string;
  minZoom: number;
  maxZoom: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  ratio: 1 | 2 | 4 | 8;
  concurrency: 1 | 2 | 4 | 8 | 16 | 32;
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
    .option("tms", {
      alias: "t",
      type: "string",
      nargs: 1,
      description: "tile matrix set",
      default: "WebMercatorQuad",
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
    .option("min-x", {
      alias: "x",
      type: "number",
      nargs: 1,
      description: "min col",
      default: 0,
      group: "Render options:",
    })
    .option("max-x", {
      alias: "X",
      type: "number",
      nargs: 1,
      description: "max col",
      default: -1,
      defaultDescription: "minx",
      group: "Render options:",
    })
    .option("min-y", {
      alias: "y",
      type: "number",
      nargs: 1,
      description: "min row",
      default: 0,
      group: "Render options:",
    })
    .option("max-y", {
      alias: "Y",
      type: "number",
      nargs: 1,
      description: "max row",
      default: -1,
      defaultDescription: "miny",
      group: "Render options:",
    })
    .option("ratio", {
      alias: "r",
      type: "number",
      nargs: 1,
      description: "image pixel ratio",
      default: 1,
      choices: [1, 2, 4, 8],
      group: "Render options:",
    })
    .option("concurrency", {
      alias: "c",
      type: "number",
      nargs: 1,
      description: "number of tiles rendered concurrently",
      default: 1,
      choices: [1, 2, 4, 8, 16, 32],
      group: "Render options:",
    })
    .example([
      ['$0 --config "~/config.json"', "Use custom config"],
      ["$0 --safe", "Start in safe mode"],
    ]);
};

export const handler = async (argv: ArgumentsCamelCase<{}>) => {
  const argv2 = argv as ArgumentsCamelCase<RenderArgs>;

  const eight = { z: 8, minX: 153, maxX: 154, minY: 102, maxY: 103 };
  const nine = { z: 9, minX: 306, maxX: 308, minY: 205, maxY: 207 };

  const job: JobParameters = {
    id: 1,
    stylePath: argv2.style,
    storePath: argv2.store,
    tms: argv2.tms,
    minZ: argv2.minZoom,
    maxZ: argv2.maxZoom === -1 ? argv2.minZoom : argv2.maxZoom,
    minX: argv2.minX,
    maxX: argv2.maxX === -1 ? argv2.minX : argv2.maxX,
    minY: argv2.minY,
    maxY: argv2.maxY === -1 ? argv2.minY : argv2.maxY,
    ratio: argv2.ratio,
    concurrency: argv2.concurrency,
  };

  const proceed = argv.yes || (await confirmRender(job));

  if (!proceed) {
    console.log("Aborted");
    return;
  }

  await render(job, createLogger(argv2.verbose));
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
