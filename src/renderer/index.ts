import fs from "fs/promises";
import type { IntRange } from "type-fest";

import { logger } from "../util/index.js";
import { ResourceType, Store, createStoreFs } from "../store/index.js";
import readStyle, { cleanupStyle } from "../style/index.js";
import { renderImage } from "./image.js";
import { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { getTileCenter, isEdgeTile } from "../util/coordinates.js";

export type JobParameters = {
  stylePath: string;
  storePath: string;
  z: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  size: 256 | 512;
  ratio: IntRange<0, 8>;
};

type TileParameters = {
  style: StyleSpecification;
  store: Store;
  z: number;
  x: number;
  y: number;
  size: 256 | 512;
  ratio: IntRange<0, 8>;
};

export const render = async ({
  stylePath,
  storePath,
  z,
  minX,
  maxX,
  minY,
  maxY,
  size,
  ratio,
}: JobParameters) => {
  try {
    const store = createStoreFs(
      storePath,
      stylePath.substring(0, stylePath.indexOf("/"))
    );

    const styleRaw = await store.read(ResourceType.Style, stylePath);

    logger.debug(
      "Render map with style: " + store.path(ResourceType.Style, stylePath)
    );

    const style = cleanupStyle(readStyle(styleRaw));

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        //TODO: parallelize
        await renderTile({ style, store, z, x, y, size, ratio });
      }
    }
  } catch (e) {
    logger.error(e);
    process.exit(1);
  }
};

export const renderTile = async ({
  style,
  store,
  z,
  x,
  y,
  size,
  ratio,
}: TileParameters) => {
  logger.info(`Rendering tile ${z}/${x}/${y} with size ${size}`);
  try {
    const resultEdgeTile = isEdgeTile(z, x, y);
    const bufferX = z === 0 ? 0 : size;
    const bufferY = resultEdgeTile.y ? 0 : size;

    const png = await renderImage({
      style,
      store,
      zoom: z,
      center: getTileCenter(z, y, x, size),
      width: size + bufferX * 2,
      height: size + bufferY * 2,
      bufferX,
      bufferY,
      ratio: ratio,
    });

    await fs.writeFile(`output_${z}_${x}_${y}.png`, png);
  } catch (e) {
    //TODO
    logger.error(e);
    process.exit(1);
  }
};
