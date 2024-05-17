import fs from "fs/promises";
import { join, dirname } from "path";
import { Logger } from "../util/index.js";
import { Cache, ResourceType, resourceTypeToDir } from "./common.js";
import { getCaches, getProvider } from "./provider.js";
import { MBTiles, openMbtiles } from "../util/mbtiles.js";
import { Store, StoreType } from "./index.js";

export const createStoreFs = async (
  storeDir: string,
  api: string,
  tileset: string,
  logger: Logger
): Promise<Store> => {
  const providerId = `${api}-tiles`;
  const provider: any = await getProvider(storeDir, providerId, logger);

  const caches = await getCaches(storeDir, api, provider);

  if (caches.length === 0) {
    throw new Error(`No seeded tile cache found for provider "${providerId}".`);
  }

  const cachePaths = caches.reduce((acc, cache) => {
    acc[`${cache.tms}/${cache.level}`] = cache;
    return acc;
  }, {} as { [key: string]: Cache });

  const findCache = (tile: string) => {
    const key = Object.keys(cachePaths).find((key) => tile.startsWith(key));
    return key ? cachePaths[key].path : undefined;
  };

  const findCache2 = (tms: string, z: number) => {
    const key = Object.keys(cachePaths).find((key) => key === `${tms}/${z}`);
    return key ? cachePaths[key].path : undefined;
  };

  const findCache3 = (tile: string) => {
    const key = Object.keys(cachePaths).find((key) => tile.startsWith(key));
    return key ? cachePaths[key] : undefined;
  };

  const findCache4 = (tms: string, z: number) => {
    const key = Object.keys(cachePaths).find((key) => key === `${tms}/${z}`);
    return key ? cachePaths[key] : undefined;
  };

  //logger.debug(`Provider: ${JSON.stringify(cachePaths, null, 2)}`);

  const writeTile = async (
    styleId: string,
    tms: string,
    z: number,
    x: number,
    y: number,
    png: Buffer,
    forceXyz: boolean
  ): Promise<void> => {
    const cache = findCache4(tms, Math.max(z - 1, 0));

    if (!cache) {
      throw new Error(`No cache found for tms "${tms}" and level "${z}".`);
    }

    const styleTileset = `${tileset}_${styleId}`;

    if (cache.storage === "PLAIN") {
      const tilePath = join(
        cache.path,
        styleTileset,
        `${tms}/${z}/${y}/${x}.png`
      );

      await fs.mkdir(dirname(tilePath), {
        recursive: true,
      });
      await fs.writeFile(tilePath, png);

      logger.debug(`Stored tile ${z}/${x}/${y} at: ${tilePath}`);
      return;
    }

    const tilePath = join(cache.path, styleTileset, `${tms}.mbtiles`);

    await fs.mkdir(dirname(tilePath), {
      recursive: true,
    });

    const mbt = await getMbtiles(tilePath, true, forceXyz);

    logger.debug(`Stored tile ${z}/${x}/${y} at: ${tilePath}`);

    await mbt.putTile(z, x, y, png);
  };

  const path: Store["path"] = (type, relPath) => {
    let storePath = relPath;

    if (type === ResourceType.Tile) {
      const cache = findCache(relPath);

      storePath = cache ? join(cache, tileset, relPath) : "";

      return storePath;
    }

    return join(storeDir, resourceTypeToDir[type], storePath);
  };

  const read: Store["read"] = async (type, relPath) => {
    if (type === ResourceType.Tile) {
      return readTile(relPath);
    }

    return fs.readFile(path(type, relPath));
  };

  const readJson: Store["readJson"] = async (type, relPath) => {
    return fs
      .readFile(path(type, relPath), { encoding: "utf-8" })
      .then((data) => {
        return JSON.parse(data);
      });
  };

  const readTile = async (relPath: string) => {
    const cache = findCache3(relPath);

    if (cache === undefined) {
      throw new Error(`No cache found for tile "${relPath}".`);
    }

    if (cache.storage === "PLAIN") {
      return fs.readFile(path(ResourceType.Tile, relPath));
    }

    const tile = relPath.split("/");
    const zyx = tile.slice(1).map((d) => parseInt(d));

    const mbt = await getMbtiles(
      join(cache.path, tileset, `${tile[0]}.mbtiles`)
    );

    //TODO
    return mbt.getTile(zyx[0], zyx[2], zyx[1]);
  };

  const mbtiles = new Map<string, MBTiles>();

  const getMbtiles = async (
    path: string,
    writable?: boolean,
    forceXyz?: boolean
  ): Promise<MBTiles> => {
    if (mbtiles.has(path)) {
      return mbtiles.get(path) as MBTiles;
    }

    const mbt = await openMbtiles(path, writable, forceXyz);
    mbtiles.set(path, mbt);

    if (writable) {
      await mbt.putInfo({
        name: path.substring(path.lastIndexOf("/") + 1),
        format: "png",
      });
    }

    const info = await mbt.getInfo();
    //console.log("INFO", info);

    return mbt;
  };

  const close = async () => {
    await Promise.all(
      Array.from(mbtiles.values()).map(async (mbt) => await mbt.close())
    );
    mbtiles.clear();
  };

  return {
    type: StoreType.FS,
    api,
    read,
    readJson,
    path,
    writeTile,
    close,
  };
};
