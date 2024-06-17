import { asyncForEach } from "modern-async";

import { renderImage } from "./image.js";
import { getTileCenterLonLat, isEdgeTile } from "../util/coordinates.js";
import { JobContext } from "./index.js";
import { createAssetReader, AssetReader } from "../store/assets.js";

export const renderTiles = async (jobContext: JobContext) => {
  const { store, z, minX, maxX, minY, maxY, concurrency, logger, incProgress } =
    jobContext;
  const assetReader = createAssetReader(store, logger);

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
      await renderTile(z, xy[0], xy[1], assetReader, jobContext);
      incProgress();
    },
    concurrency
  );
};

const renderTile = async (
  z: number,
  x: number,
  y: number,
  assetReader: AssetReader,
  { style, store, tms, ratio, overwrite, mbtilesForceXyz, logger }: JobContext
) => {
  if (!overwrite) {
    const exists = await store.hasTile(
      style.id,
      tms.name,
      z,
      x,
      y,
      mbtilesForceXyz
    );

    if (exists) {
      logger.debug(`Tile ${z}/${x}/${y} already exists, skipping`);
      return;
    }
  }

  logger.debug(
    `Rendering tile ${z}/${x}/${y} with size ${tms.tileSize * ratio}px`
  );

  try {
    const resultEdgeTile = isEdgeTile(z, x, y);
    const bufferX = z === 0 ? 0 : tms.tileSize;
    const bufferY = resultEdgeTile.y ? 0 : tms.tileSize;

    const png = await renderImage(
      {
        assetReader,
        style: style.spec,
        zoom: Math.max(z - 1, 0),
        center: getTileCenterLonLat(z, x, y, tms.tileSize),
        width: tms.tileSize + bufferX * 2,
        height: tms.tileSize + bufferY * 2,
        bufferX,
        bufferY,
        ratio,
      },
      logger
    );

    await store.writeTile(style.id, tms.name, z, x, y, png, mbtilesForceXyz);
  } catch (e) {
    logger.warn("Error rendering tile %s/%s/%s: %s", z, x, y, e);
  }
};
