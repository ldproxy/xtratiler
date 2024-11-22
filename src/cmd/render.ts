import { Argv, ArgumentsCamelCase } from "yargs";
import confirm from "@inquirer/confirm";

import { JobParameters, render } from "../renderer/index.js";
import { createLogger } from "../util/logger.js";
import { GlobalArgs } from "../index.js";
import { StorageDetect, StorageType } from "../store/index.js";

export type RenderArgs = GlobalArgs & {
  style: string;
  store: string;
  tms: string;
  zoom: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  ratio: 1 | 2 | 4 | 8;
  concurrency: 1 | 2 | 4 | 8 | 16 | 32;
  overwrite: boolean;
  mbtilesForceXyz: boolean;
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
    .option("zoom", {
      alias: "z",
      type: "number",
      nargs: 1,
      description: "zoom level",
      default: 0,
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
    .option("overwrite", {
      alias: "o",
      type: "boolean",
      default: false,
      description: "overwrite existing tiles instead of skipping them",
      group: "Render options:",
    })
    .option("mbtiles-force-xyz", {
      type: "boolean",
      default: false,
      description:
        "when writing to mbtiles, use XYZ instead of TMS tiling scheme",
      group: "Render options:",
    });
  /*.example([
      ['$0 --config "~/config.json"', "Use custom config"],
      ["$0 --safe", "Start in safe mode"],
    ])*/
};

export const handler = async (argv: ArgumentsCamelCase<{}>) => {
  const argv2 = argv as ArgumentsCamelCase<RenderArgs>;

  const apiId = argv2.style.substring(0, argv2.style.indexOf("/"));

  const storage: StorageDetect = {
    type: StorageType.DETECT,
    store: argv2.store,
    styleRel: argv2.style,
  };

  const job: JobParameters = {
    id: "1",
    api: apiId,
    tileset: "__all__",
    tmsId: argv2.tms,
    z: argv2.zoom,
    minX: argv2.minX,
    maxX: argv2.maxX === -1 ? argv2.minX : argv2.maxX,
    minY: argv2.minY,
    maxY: argv2.maxY === -1 ? argv2.minY : argv2.maxY,
    ratio: argv2.ratio,
    concurrency: argv2.concurrency,
    overwrite: argv2.overwrite,
    mbtilesForceXyz: argv2.mbtilesForceXyz,
    storage,
    agent: false,
    verbosity: argv2.verbose,
    debugOnlyCompute: false,
    updateProgress: async () => {},
  };

  const proceed = argv.yes || (await confirmRender(job));

  if (!proceed) {
    console.log("Aborted");
    return;
  }

  await render(job, await createLogger(argv2.verbose));
};

const confirmRender = async (job: JobParameters) => {
  console.log("Submitting rendering job:");
  console.log(job);
  console.log();

  return await confirm({
    message: "Are you sure?",
    default: true,
  });
};
