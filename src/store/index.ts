import fs from "fs/promises";
import { join } from "path";

export interface Store {
  read: (api: string, type: ResourceType, path: string) => Promise<Buffer>;
  readJson: (type: ResourceType, path: string) => Promise<object>;
  path: (type: ResourceType, path: string) => string;
}

export const enum ResourceType {
  Style,
  TileJson,
  Tile,
  ApiResource,
}

const resourceTypeToDir = {
  [ResourceType.Style]: "values/maplibre-styles",
  [ResourceType.TileJson]: "resources/tilejson",
  [ResourceType.Tile]: "resources/tiles",
  [ResourceType.ApiResource]: "resources/api-resources",
};

// TODO: for tiles, we have to read services and tile providers configuration to get cache type and tileset
export const createStoreFs = (storeDir: string): Store => {
  const path: Store["path"] = (type, relPath) => {
    let storePath = relPath;
    const api = "vineyards";

    if (type === ResourceType.TileJson) {
      storePath = storePath
        .replace("{serviceUrl}/tiles", "")
        .replace("?f=tile", ".");
    }
    if (type === ResourceType.Tile) {
      storePath = storePath
        .substring(storePath.indexOf(api))
        .replace("/tiles/", "/cache_dyn/vineyards/")
        .replace("?f=", ".");
    }

    return join(storeDir, resourceTypeToDir[type], storePath);
  };

  const read: Store["read"] = async (api, type, relPath) => {
    return fs.readFile(path(type, relPath));
  };

  const readJson: Store["readJson"] = async (type, relPath) => {
    return fs
      .readFile(path(type, relPath), { encoding: "utf-8" })
      .then((data) => {
        return JSON.parse(data);
      });
  };

  return {
    read,
    readJson,
    path,
  };
};
