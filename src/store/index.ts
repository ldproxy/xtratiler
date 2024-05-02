import fs from "fs/promises";
import { join } from "path";

import { RequestResponse, ResourceKind } from "@maplibre/maplibre-gl-native";
import { logger } from "../util/index.js";

export interface Store {
  read: (type: ResourceType, path: string) => Promise<Buffer>;
  readJson: (type: ResourceType, path: string) => Promise<object>;
  path: (type: ResourceType, path: string) => string;
  mapLibreHandler: AssetRequestHandler;
}

export const enum ResourceType {
  Style,
  TileJson,
  Tile,
  ApiResource,
}

type AssetRequestHandler = (
  input: { url: string; kind: ResourceKind },
  callback: (error?: Error, response?: RequestResponse) => void
) => void;

// TODO: for tiles, we have to read services and tile providers configuration to get cache type and tileset
export const createStoreFs = (storeDir: string, api: string): Store => {
  const path: Store["path"] = (type, relPath) => {
    let storePath = relPath;

    if (type === ResourceType.TileJson) {
      storePath = storePath
        .replace("{serviceUrl}/tiles/", api + "_")
        .replace("?f=tile", ".");
    } else if (type === ResourceType.Tile) {
      storePath = storePath
        .replace("{serviceUrl}/tiles", api + "/cache_dyn/__all__/")
        .replace("?f=", ".");
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
    logger.debug(`Map request (kind ${kind}): ${url}`);

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
      logger.debug(`-> fetch ${url}`);

      fetch(url)
        .then((response) => response.arrayBuffer())
        .then((arrayBuffer) => {
          assets.set(url, Buffer.from(arrayBuffer));
          callback(undefined, { data: Buffer.from(arrayBuffer) });
        });
      return;
    }

    logger.debug(`-> ${path(resourceType, url)}`);

    read(resourceType, url)
      .then((data) => {
        callback(undefined, { data });
      })
      .catch((error) => {
        if (error.code === "ENOENT") {
          logger.warn(`Resource not found: ${url}`);
          callback();
          return;
        }
        logger.error(
          `Error while making resource request to: ${url}\n${error}`
        );
        callback(error);
      });
  };

  return {
    read,
    readJson,
    path,
    mapLibreHandler,
  };
};

const resourceTypeToDir = {
  [ResourceType.Style]: "values/maplibre-styles",
  [ResourceType.TileJson]: "resources/tilejson",
  [ResourceType.Tile]: "resources/tiles",
  [ResourceType.ApiResource]: "resources/api-resources",
};

const getResourceType = (kind: ResourceKind): ResourceType => {
  switch (kind) {
    case 1:
      return ResourceType.Style;
    case 2:
      return ResourceType.TileJson;
    case 3:
      return ResourceType.Tile;
    case 4:
      return ResourceType.ApiResource;
    case 5:
      return ResourceType.ApiResource;
    case 6:
      return ResourceType.ApiResource;
    default:
      throw new Error(`Unknown resource kind: ${kind}`);
  }
};
