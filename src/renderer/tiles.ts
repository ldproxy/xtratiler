import { asyncForEach } from "modern-async";

import { renderImage } from "./image.js";
import { getTileCenterLonLat, isEdgeTile } from "../util/coordinates.js";
import { JobContext } from "./index.js";
import { createAssetReader, AssetReader } from "../store/assets.js";

let shouldBreak = false;
process.on("SIGINT", () => (shouldBreak = true));
process.on("SIGTERM", () => (shouldBreak = true));

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
      if (shouldBreak) {
        return;
      }
      await renderTile(z, xy[0], xy[1], assetReader, jobContext);
      incProgress();
    },
    1 //concurrency
  );
};

const renderTile = async (
  z: number,
  x: number,
  y: number,
  assetReader: AssetReader,
  {
    style,
    store,
    tms,
    ratio,
    overwrite,
    mbtilesForceXyz,
    debugOnlyCompute,
    logger,
    tracer,
  }: JobContext
) => {
  return await tracer.startActiveSpan(
    "renderTile",
    { attributes: { x, y, overwrite } },
    async (span) => {
      if (!overwrite && !debugOnlyCompute) {
        let exists = false;
        try {
          exists = await store.hasTile(
            style.id,
            tms.name,
            z,
            x,
            y,
            mbtilesForceXyz
          );
        } catch (e) {
          exists = false;
        }
        if (exists) {
          logger.debug(`Tile ${z}/${y}/${x} already exists, skipping`);
          span.end();

          return;
        }
      }

      logger.debug(
        `Rendering tile ${z}/${y}/${x} with size ${tms.tileSize * ratio}px`
      );

      try {
        const resultEdgeTile = isEdgeTile(z, x, y);
        const bufferX = z === 0 ? 0 : tms.tileSize;
        const bufferY = z === 0 || resultEdgeTile.y ? 0 : tms.tileSize;

        const png = await renderImage(
          {
            assetReader,
            styleId: store.api + "/" + style.id + "/" + tms.name,
            style: style.spec,
            zoom: z - 1,
            center: getTileCenterLonLat(z, x, y, tms.tileSize),
            width: tms.tileSize + bufferX * 2,
            height: tms.tileSize + bufferY * 2,
            bufferX,
            bufferY,
            ratio,
          },
          logger,
          tracer
        );

        if (!debugOnlyCompute) {
          await store.writeTile(
            style.id,
            tms.name,
            z,
            x,
            y,
            png,
            mbtilesForceXyz
          );
        }
      } catch (e) {
        logger.warn("Error rendering tile %s/%s/%s: %s", z, y, x, e);
      } finally {
        span.end();
      }
    }
  );
};
