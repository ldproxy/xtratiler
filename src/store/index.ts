import { Logger } from "../util/index.js";
import { ResourceType } from "./common.js";
import { createStoreFs } from "./fs.js";

export const enum StoreType {
  FS,
}

export interface Store {
  type: StoreType;
  api: string;
  read: (type: ResourceType, path: string) => Promise<Buffer | undefined>;
  readJson: (type: ResourceType, path: string) => Promise<object>;
  path: (type: ResourceType, path: string) => string;
  hasTile: (
    styleId: string,
    tms: string,
    z: number,
    x: number,
    y: number,
    forceXyz: boolean
  ) => Promise<boolean>;
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

const stores: Map<StoreType, Map<string, Store>> = new Map([
  [StoreType.FS, new Map<string, Store>()],
]);

export const createStore = async (
  type: StoreType,
  storeLocation: string,
  api: string,
  tileset: string,
  storageHint: string | undefined,
  logger: Logger
): Promise<Store> => {
  if (type === StoreType.FS) {
    const key = storeLocation + api + tileset + (storageHint || "");

    if (stores.get(StoreType.FS)?.has(key)) {
      return stores.get(StoreType.FS)?.get(key) as Store;
    }

    logger.error(`Create FS store: ${key}`);

    const store = await createStoreFs(
      storeLocation,
      api,
      tileset,
      storageHint,
      logger
    );

    stores.get(StoreType.FS)?.set(key, store);

    return store;
  }

  throw new Error(`Unsupported store type: ${type}`);
};
