import fs from "fs/promises";
import { join, dirname } from "path";
import { Logger } from "../util/index.js";
import { Cache, ResourceType, resourceTypeToDir } from "./common.js";
import { getCaches, getProvider } from "./provider.js";
import { MBTiles, openMbtiles } from "../util/mbtiles.js";
import { StorageExplicit, Store, StoreType } from "./index.js";

const isPerTile = (cache: Cache) =>
  cache.storage === "PLAIN" || cache.storage === "PER_TILE";

const isPerTile2 = (storage: StorageExplicit) =>
  storage.tileStorage === "PLAIN" || storage.tileStorage === "PER_TILE";

const getSeedingDetect = async (
  storeDir: string,
  api: string,
  storageHint: string | undefined,
  logger: Logger
) => {
  const providerId = `${api}-tiles`;
  const provider: any = await getProvider(storeDir, providerId, logger);

  const caches = await getCaches(storeDir, api, provider);

  if (caches.length === 0) {
    throw new Error(`No seeded tile cache found for provider "${providerId}".`);
  }

  const jobSizeLetter = (provider.seeding && provider.seeding.jobSize) || "M";
  const perJob =
    storageHint === "detect"
      ? caches.every((cache) => cache.storage === "PER_JOB")
      : !!storageHint;
  const perTile = caches.every(isPerTile);
  const perTileset = caches.every(
    (cache) => cache.storage === "MBTILES" || cache.storage === "PER_TILESET"
  );
  const jobSize = !perJob
    ? 0
    : jobSizeLetter === "S"
    ? 256
    : jobSizeLetter === "L"
    ? 16384
    : jobSizeLetter === "XL"
    ? 65536
    : 1024;

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

  return {
    perTile,
    perJob,
    perTileset,
    jobSize,
    findCache,
    findCache2,
    findCache3,
    findCache4,
  };
};

export const createStoreFs = async (
  storeDir: string,
  api: string,
  tileset: string,
  storageHint: string | undefined,
  logger: Logger
): Promise<Store> => {
  const seeding = await getSeedingDetect(storeDir, api, storageHint, logger);

  const path: Store["path"] = (type, relPath) => {
    let storePath = relPath;

    if (type === ResourceType.Tile) {
      const cache = seeding.findCache(relPath);

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

  const singleRowCol = seeding.jobSize > 0 ? Math.sqrt(seeding.jobSize) : 0;
  const singlePartitionLevel =
    seeding.jobSize > 0 ? Math.log(singleRowCol) / Math.log(2) : 0;

  const getPartition = (z: number, x: number, y: number): string => {
    if (z <= singlePartitionLevel) {
      return `${z}`;
    }

    const rowPartition = Math.floor(y / singleRowCol);
    const colPartition = Math.floor(x / singleRowCol);
    const rowMin = rowPartition * singleRowCol;
    const rowMax = (rowPartition + 1) * singleRowCol - 1;
    const colMin = colPartition * singleRowCol;
    const colMax = (colPartition + 1) * singleRowCol - 1;

    return `${z}_${rowMin}-${rowMax}_${colMin}-${colMax}`;
  };

  const readTile = async (relPath: string) => {
    const cache = seeding.findCache3(relPath);

    if (cache === undefined) {
      throw new Error(`No cache found for tile "${relPath}".`);
    }

    if (isPerTile(cache)) {
      return fs.readFile(path(ResourceType.Tile, relPath));
    }

    const tile = relPath.split("/");
    const zyx = tile.slice(1).map((d) => parseInt(d));
    const mbtilesName =
      seeding.jobSize > 0
        ? `${tile[0]}/${getPartition(zyx[0], zyx[2], zyx[1])}.mbtiles`
        : `${tile[0]}.mbtiles`;

    const tilePath = join(cache.path, tileset, mbtilesName);

    logger.trace(`-> mbtiles ${tilePath}:${zyx[0]}/${zyx[1]}/${zyx[2]}`);
    try {
      const mbt = await getMbtiles(tilePath);

      //TODO
      return mbt.getTile(zyx[0], zyx[2], zyx[1]);
    } catch (err) {
      if (seeding.perJob) {
        return undefined;
      }

      throw err;
    }
  };

  const hasTile = async (
    styleId: string,
    tms: string,
    z: number,
    x: number,
    y: number,
    forceXyz: boolean
  ): Promise<boolean> => {
    const cache = seeding.findCache4(tms, Math.max(z - 1, 0));

    if (!cache) {
      throw new Error(`No cache found for tms "${tms}" and level "${z}".`);
    }

    const styleTileset = `${tileset}_${styleId}`;

    if (isPerTile(cache)) {
      const tilePath = join(
        cache.path,
        styleTileset,
        `${tms}/${z}/${y}/${x}.png`
      );

      let exists = false;

      try {
        await fs.access(tilePath, fs.constants.F_OK);
        exists = true;
      } catch (err) {
        // Handle error
      }

      return exists;
    }

    const mbtilesName =
      seeding.jobSize > 0
        ? `${tms}/${getPartition(z, x, y)}.mbtiles`
        : `${tms}.mbtiles`;

    const tilePath = join(cache.path, styleTileset, mbtilesName);

    let exists = false;

    try {
      await fs.access(tilePath, fs.constants.F_OK);
      exists = true;
    } catch (err) {
      // ignore
    }

    if (!exists) {
      return false;
    }

    // since hasTile is only used by writeTile and mbtiles instances are cached, we need to set writable to true
    const mbt = await getMbtiles(tilePath, true, forceXyz);

    exists = await mbt.hasTile(z, x, y);

    return exists;
  };

  const writeTile = async (
    styleId: string,
    tms: string,
    z: number,
    x: number,
    y: number,
    png: Buffer,
    forceXyz: boolean
  ): Promise<void> => {
    const cache = seeding.findCache4(tms, Math.max(z - 1, 0));

    if (!cache) {
      throw new Error(`No cache found for tms "${tms}" and level "${z}".`);
    }

    const styleTileset = `${tileset}_${styleId}`;

    if (isPerTile(cache)) {
      const tilePath = join(
        cache.path,
        styleTileset,
        `${tms}/${z}/${y}/${x}.png`
      );

      await fs.mkdir(dirname(tilePath), {
        recursive: true,
      });
      await fs.writeFile(tilePath, png);

      logger.debug(`Stored tile ${z}/${y}/${x} at: ${tilePath}`);
      return;
    }

    const mbtilesName =
      seeding.jobSize > 0
        ? `${tms}/${getPartition(z, x, y)}.mbtiles`
        : `${tms}.mbtiles`;

    const tilePath = join(cache.path, styleTileset, mbtilesName);

    await fs.mkdir(dirname(tilePath), {
      recursive: true,
    });

    const mbt = await getMbtiles(tilePath, true, forceXyz);
    await mbt.putTile(z, x, y, png);

    logger.debug(`Stored tile ${z}/${y}/${x} at: ${tilePath}`);
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
    perTile: seeding.perTile,
    perJob: seeding.perJob,
    perTileset: seeding.perTileset,
    read,
    path,
    hasTile,
    writeTile,
    close,
  };
};

export const createStoreFsExplicit = async (
  storeDir: string,
  api: string,
  storage: StorageExplicit,
  logger: Logger
): Promise<Store> => {
  const path: Store["path"] = (type, relPath) => {
    if (type === ResourceType.Tile) {
      return join(storeDir, storage.vector);
    }
    if (type === ResourceType.Style) {
      return join(storeDir, storage.style);
    }

    return join(storeDir, resourceTypeToDir[type], relPath);
  };

  const read: Store["read"] = async (type, relPath) => {
    if (type === ResourceType.Tile) {
      return readTile(relPath);
    }

    return fs.readFile(path(type, relPath));
  };

  const singleRowCol = storage.jobSize > 0 ? Math.sqrt(storage.jobSize) : 0;
  const singlePartitionLevel =
    storage.jobSize > 0 ? Math.log(singleRowCol) / Math.log(2) : 0;

  const getPartition = (z: number, x: number, y: number): string => {
    if (z <= singlePartitionLevel) {
      return `${z}`;
    }

    const rowPartition = Math.floor(y / singleRowCol);
    const colPartition = Math.floor(x / singleRowCol);
    const rowMin = rowPartition * singleRowCol;
    const rowMax = (rowPartition + 1) * singleRowCol - 1;
    const colMin = colPartition * singleRowCol;
    const colMax = (colPartition + 1) * singleRowCol - 1;

    return `${z}_${rowMin}-${rowMax}_${colMin}-${colMax}`;
  };

  const readTile = async (relPath: string) => {
    const tile = relPath.split("/");
    const zyx = tile.slice(1).map((d) => parseInt(d));
    let tilePath = join(storeDir, storage.vector);

    //TODO
    if (isPerTile2(storage)) {
      return fs.readFile(
        tilePath.replace("{row}", `${zyx[1]}`).replace("{col}", `${zyx[2]}`)
      );
    }

    if (tilePath.includes("{partition}")) {
      const partition = getPartition(zyx[0], zyx[2], zyx[1]);
      tilePath = tilePath.replace("{partition}", partition);
    }

    logger.trace(`-> mbtiles ${tilePath}:${zyx[0]}/${zyx[1]}/${zyx[2]}`);

    try {
      const mbt = await getMbtiles(tilePath);

      return mbt.getTile(zyx[0], zyx[2], zyx[1]);
    } catch (err: any) {
      //TODO
      if (storage.tileStorage === "PER_JOB") {
        err.code = "ENOENT";
        throw err;
      }

      throw err;
    }
  };

  const hasTile = async (
    styleId: string,
    tms: string,
    z: number,
    x: number,
    y: number,
    forceXyz: boolean
  ): Promise<boolean> => {
    if (isPerTile2(storage)) {
      const tilePath = join(storeDir, storage.raster)
        .replace("{row}", `${y}`)
        .replace("{col}", `${x}`);

      let exists = false;

      try {
        await fs.access(tilePath, fs.constants.F_OK);
        exists = true;
      } catch (err) {
        // Handle error
      }

      return exists;
    }

    const tilePath = join(storeDir, storage.raster);

    let exists = false;

    try {
      await fs.access(tilePath, fs.constants.F_OK);
      exists = true;
    } catch (err) {
      // ignore
    }

    if (!exists) {
      return false;
    }

    // since hasTile is only used by writeTile and mbtiles instances are cached, we need to set writable to true
    const mbt = await getMbtiles(tilePath, true, forceXyz);

    exists = await mbt.hasTile(z, x, y);

    return exists;
  };

  const writeTile = async (
    styleId: string,
    tms: string,
    z: number,
    x: number,
    y: number,
    png: Buffer,
    forceXyz: boolean
  ): Promise<void> => {
    if (isPerTile2(storage)) {
      const tilePath = join(storeDir, storage.raster)
        .replace("{row}", `${y}`)
        .replace("{col}", `${x}`);

      await fs.mkdir(dirname(tilePath), {
        recursive: true,
      });
      await fs.writeFile(tilePath, png);

      logger.debug(`Stored tile ${z}/${y}/${x} at: ${tilePath}`);
      return;
    }

    const tilePath = join(storeDir, storage.raster);

    await fs.mkdir(dirname(tilePath), {
      recursive: true,
    });

    const mbt = await getMbtiles(tilePath, true, forceXyz);
    await mbt.putTile(z, x, y, png);

    logger.debug(`Stored tile ${z}/${y}/${x} at: ${tilePath}`);
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
    perTile: storage.tileStorage === "PER_TILE",
    perJob: storage.tileStorage === "PER_JOB",
    perTileset: storage.tileStorage === "PER_TILESET",
    read,
    path,
    hasTile,
    writeTile,
    close,
  };
};
