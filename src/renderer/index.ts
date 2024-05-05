import fs from "fs/promises";
import { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import {
  asyncMap,
  asyncSleep,
  asyncGeneratorMap,
  asyncForEach,
} from "modern-async";
import pretty from "pretty-time";

import { Logger } from "../util/index.js";
import { Store, createStoreFs } from "../store/index.js";
import { readStyle, adjustStyle, tileMatrixSets } from "../style/index.js";
import { renderImage } from "./image.js";
import { getTileCenterLonLat, isEdgeTile } from "../util/coordinates.js";
import { ResourceType } from "../store/common.js";

export type JobParameters = {
  id: number;
  stylePath: string;
  storePath: string;
  tms: string;
  minZ: number;
  maxZ: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  ratio: 1 | 2 | 4 | 8;
  concurrency: 1 | 2 | 4 | 8 | 16 | 32;
};

type TileParameters = {
  style: StyleSpecification;
  store: Store;
  tms: string;
  z: number;
  x: number;
  y: number;
  size: number;
  ratio: 1 | 2 | 4 | 8;
};

export const render = async (
  {
    id,
    stylePath,
    storePath,
    tms: tmsKey,
    minZ,
    maxZ,
    minX,
    maxX,
    minY,
    maxY,
    ratio,
    concurrency,
  }: JobParameters,
  logger: Logger
) => {
  const progress = {
    started: process.hrtime(),
    total: (maxX - minX + 1) * (maxY - minY + 1),
    current: 0,
    msg: "",
  };

  logger.info(`Starting rendering job with id ${id}`);

  const progressLogger = setInterval(() => {
    const percentDone = Math.round((progress.current / progress.total) * 100);
    logger.info(
      `Running rendering job with id ${id}: ${percentDone}% (${progress.current}/${progress.total})`
    );
  }, 1000);

  try {
    const store = await createStoreFs(
      storePath,
      stylePath.substring(0, stylePath.indexOf("/")),
      logger
    );

    const tms = tileMatrixSets[tmsKey];

    const styleRaw = await store.read(ResourceType.Style, stylePath);

    logger.debug(
      "MapLibre style: " + store.path(ResourceType.Style, stylePath)
    );

    const style = adjustStyle(readStyle(styleRaw), tms);

    await fs.writeFile(`out/output_style.json`, JSON.stringify(style, null, 2));

    //TODO: cap zoom levels to vector tiles

    const iterator = function* (): Generator<[number, number]> {
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          yield [x, y];
        }
      }
    };

    await asyncForEach(
      iterator(),
      async (xy: [number, number]) => {
        await renderTile(
          {
            style,
            store,
            tms: tms.name,
            z: minZ,
            x: xy[0],
            y: xy[1],
            size: tms.tileSize,
            ratio,
          },
          logger
        );
        progress.current++;
      },
      concurrency
    );
  } catch (e) {
    clearInterval(progressLogger);
    const percentDone = Math.round((progress.current / progress.total) * 100);

    logger.error(`Aborted rendering job at ${percentDone}% with error: ${e}`);
    process.exit(1);
  }
  clearInterval(progressLogger);
  const duration = process.hrtime(progress.started);

  logger.info(`Finished rendering job with id ${id} in ${pretty(duration)}`);
};

export const renderTile = async (
  { style, store, tms, z, x, y, size, ratio }: TileParameters,
  logger: Logger
) => {
  logger.debug(`Rendering tile ${z}/${x}/${y} with size ${size}`);

  try {
    const resultEdgeTile = isEdgeTile(z, x, y);
    const bufferX = z === 0 ? 0 : size;
    const bufferY = resultEdgeTile.y ? 0 : size;
    //logger.debug(`Buffer: ${bufferX}, ${bufferY}`);

    const png = await renderImage(
      {
        style,
        store,
        zoom: Math.max(z - 1, 0),
        center: getTileCenterLonLat(z, x, y, size),
        width: size + bufferX * 2,
        height: size + bufferY * 2,
        bufferX,
        bufferY,
        ratio: ratio,
      },
      logger
    );

    await store.writeTile(tms, z, x, y, png);
  } catch (e) {
    logger.warn("Error rendering tile %s/%s/%s: %s", z, x, y, e);
  }
};
