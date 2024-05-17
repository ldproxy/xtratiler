import { Logger } from "../util/index.js";
import { ResourceType } from "./common.js";
import { createStoreFs } from "./fs.js";

export const enum StoreType {
  FS,
}

export interface Store {
  type: StoreType;
  api: string;
  read: (type: ResourceType, path: string) => Promise<Buffer>;
  readJson: (type: ResourceType, path: string) => Promise<object>;
  path: (type: ResourceType, path: string) => string;
  writeTile: (
    styleId: string,
    tms: string,
    z: number,
    x: number,
    y: number,
    png: Buffer,
    forceXyz: boolean
  ) => Promise<void>;
  close: () => Promise<void>;
}

export const createStore = async (
  type: StoreType,
  storeLocation: string,
  api: string,
  tileset: string,
  logger: Logger
): Promise<Store> => {
  if (type === StoreType.FS) {
    return createStoreFs(storeLocation, api, tileset, logger);
  }

  throw new Error(`Unsupported store type: ${type}`);
};
