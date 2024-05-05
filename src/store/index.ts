import fs from "fs/promises";
import { join } from "path";
import { RequestResponse, ResourceKind } from "@maplibre/maplibre-gl-native";
import { Logger } from "../util/index.js";
import { ResourceType, getResourceType, resourceTypeToDir } from "./common.js";
import { getCaches, getProvider } from "./provider.js";

export const enum StoreType {
  FS,
}

export interface Store {
  type: StoreType;
  api: string;
  read: (type: ResourceType, path: string) => Promise<Buffer>;
  readJson: (type: ResourceType, path: string) => Promise<object>;
  path: (type: ResourceType, path: string) => string;
  mapLibreHandler: AssetRequestHandler;
  tileCache: () => string;
  writeTile: (
    tms: string,
    z: number,
    x: number,
    y: number,
    png: Buffer
  ) => Promise<void>;
}

type AssetRequestHandler = (
  input: { url: string; kind: ResourceKind },
  callback: (error?: Error, response?: RequestResponse) => void
) => void;

// TODO: for tiles, we have to read services and tile providers configuration to get cache type and tileset
export const createStoreFs = async (
  storeDir: string,
  api: string,
  logger: Logger
): Promise<Store> => {
  const tileset = "__all__";
  const providerId = `${api}-tiles`;
  const provider: any = await getProvider(storeDir, providerId, logger);

  const caches = await getCaches(storeDir, api, provider);

  if (caches.length === 0) {
    throw new Error(`No seeded tile cache found for provider "${providerId}".`);
  }

  const cachePaths = caches.reduce((acc, cache) => {
    acc[`${cache.tms}/${cache.level}`] = cache;
    return acc;
  }, {} as any);

  const findCache = (tile: string) => {
    const key = Object.keys(cachePaths).find((key) => tile.startsWith(key));
    return key ? cachePaths[key].path : undefined;
  };

  const findCache2 = (tms: string, z: number) => {
    const key = Object.keys(cachePaths).find((key) => key === `${tms}/${z}`);
    return key ? cachePaths[key].path : undefined;
  };

  //logger.debug(`Provider: ${JSON.stringify(cachePaths, null, 2)}`);

  const writeTile = async (
    tms: string,
    z: number,
    x: number,
    y: number,
    png: Buffer
  ): Promise<void> => {
    const cache = findCache2(tms, Math.max(z - 1, 0));

    if (!cache) {
      throw new Error(`No cache found for tms "${tms}" and level "${z}".`);
    }

    const tilePath = join(cache, tileset, `${tms}/${z}/${y}/${x}.png`);

    await fs.mkdir(join(cache, tileset, `${tms}/${z}/${y}`), {
      recursive: true,
    });
    await fs.writeFile(tilePath, png);

    logger.debug(`Tile stored at: ${tilePath}`);
  };

  const path: Store["path"] = (type, relPath) => {
    let storePath = relPath;

    if (type === ResourceType.TileJson) {
      storePath = storePath
        .replace("{serviceUrl}/tiles/", api + "_")
        .replace("?f=tile", ".");
    } else if (type === ResourceType.Tile) {
      const tile = relPath
        .replace("{serviceUrl}/tiles/", "")
        .replace("WebMercatorQuad", "merc")
        .replace("?f=", ".");
      const cache = findCache(tile);

      storePath = cache ? join(cache, tileset, tile) : "";

      return storePath;
    } else if (type === ResourceType.ApiResource) {
      storePath = storePath.replace("{serviceUrl}/resources", api);
    }

    return join(storeDir, resourceTypeToDir[type], storePath);
  };

  const read: Store["read"] = async (type, relPath) => {
    return fs.readFile(path(type, relPath));
  };

  const readJson: Store["readJson"] = async (type, relPath) => {
    return fs
      .readFile(path(type, relPath), { encoding: "utf-8" })
      .then((data) => {
        return JSON.parse(data);
      });
  };

  const assets = new Map<string, Buffer>();

  const mapLibreHandler: AssetRequestHandler = ({ url, kind }, callback) => {
    logger.trace(`Map request (kind ${kind}): ${url}`);

    const resourceType = getResourceType(kind);

    //TODO: might be moved to wrapper, not really a store concern
    if (resourceType === ResourceType.ApiResource && url.startsWith("http")) {
      if (assets.has(url)) {
        const data = assets.get(url);
        if (data) {
          logger.debug(`-> cache ${url}`);
          callback(undefined, { data });
          return;
        }
      }
      logger.trace(`-> fetch ${url}`);

      fetch(url)
        .then((response) => response.arrayBuffer())
        .then((arrayBuffer) => {
          assets.set(url, Buffer.from(arrayBuffer));
          callback(undefined, { data: Buffer.from(arrayBuffer) });
        });
      return;
    }

    logger.trace(`-> ${path(resourceType, url)}`);

    read(resourceType, url)
      .then((data) => {
        callback(undefined, { data });
      })
      .catch((error) => {
        if (error.code === "ENOENT") {
          logger.trace(`Resource not found: ${url}`);
          callback();
          return;
        }
        logger.error(
          `Error while making resource request to: ${url}\n${error}`
        );
        callback(error);
      });
  };

  //TODO
  const tileCache = (): string => {
    return join(storeDir, "resources/tiles");
  };

  return {
    type: StoreType.FS,
    api,
    read,
    readJson,
    path,
    mapLibreHandler,
    tileCache,
    writeTile,
  };
};
