import { Logger } from "../util/index.js";
import { ResourceType } from "./common.js";
import { createStoreFs, createStoreFsExplicit } from "./fs.js";

export const enum StoreType {
  FS,
}

export enum StorageType {
  DETECT = "detect",
  EXPLICIT = "explicit",
}

export type Storage = {
  type: StorageType;
};

export type StorageDetect = Storage & {
  type: StorageType.DETECT;
  store: string;
  styleRel: string;
};

export type StorageExplicit = Storage & {
  type: StorageType.EXPLICIT;
  tileStorage: string;
  jobSize: number;
  vector: string;
  raster: string;
  style: string;
};

export interface Store {
  type: StoreType;
  api: string;
  perTile: boolean;
  perJob: boolean;
  perTileset: boolean;
  read: (type: ResourceType, path: string) => Promise<Buffer | undefined>;
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

export const createStore = async (
  type: StoreType,
  storeLocation: string,
  api: string,
  tileset: string,
  storageHint: string | undefined,
  logger: Logger
): Promise<Store> => {
  if (type === StoreType.FS) {
    return await createStoreFs(
      storeLocation,
      api,
      tileset,
      storageHint,
      logger
    );
  }

  throw new Error(`Unsupported store type: ${type}`);
};

export const createStoreExplicit = async (
  type: StoreType,
  api: string,
  storage: StorageExplicit,
  logger: Logger
): Promise<Store> => {
  if (type === StoreType.FS) {
    return await createStoreFsExplicit(api, storage, logger);
  }

  throw new Error(`Unsupported store type: ${type}`);
};
