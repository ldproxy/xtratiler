import pretty from "pretty-time";
import { Mutex } from "async-mutex";

import { Logger } from "../util/index.js";
import {
  Storage,
  StorageDetect,
  StorageExplicit,
  StorageType,
  Store,
  StoreType,
  createStore,
  createStoreExplicit,
} from "../store/index.js";
import {
  getTileMatrixSet,
  TileMatrixSet,
  getStyle,
  Style,
} from "../style/index.js";
import { ResourceType } from "../store/common.js";
import { renderTiles } from "./tiles.js";

const metaMutex = new Mutex();
const mutexes: Map<string, Mutex> = new Map();

const getMutex = async (identifier: string) =>
  metaMutex.runExclusive(async () => {
    let mutex = mutexes.get(identifier);
    if (!mutex) {
      mutex = new Mutex();
      mutexes.set(identifier, mutex);
    }
    return mutex;
  });

export type JobParameters = {
  id: string;
  api: string;
  tileset: string;
  tmsId: string;
  z: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  ratio: 1 | 2 | 4 | 8;
  concurrency: 1 | 2 | 4 | 8 | 16 | 32;
  overwrite: boolean;
  mbtilesForceXyz: boolean;
  storage: Storage;
  agent: boolean;
  updateProgress: (progress: Progress) => void;
};

export type JobContext = JobParameters & {
  store: Store;
  tms: TileMatrixSet;
  style: Style;
  mutex: Mutex | undefined;
  logger: Logger;
  incProgress: () => void;
};

type Progress = {
  jobId: string;
  started: [number, number];
  total: number;
  current: number;
  msg: string;
};

export const render = async (parameters: JobParameters, logger: Logger) => {
  const { id, minX, maxX, minY, maxY, agent, storage } = parameters;

  const progress: Progress = {
    jobId: id,
    started: process.hrtime(),
    total: (maxX - minX + 1) * (maxY - minY + 1),
    current: 0,
    msg: "",
  };

  logger.info(`Starting rendering job with id ${id}`);

  const progressLogger = setInterval(
    () => logger.info(progressMessage(progress, "Running")),
    1000
  );
  let progressUpdater;

  let store2: Store | undefined;
  try {
    const jobContext =
      storage.type === StorageType.DETECT
        ? await createContextDetect(
            parameters,
            logger,
            progress,
            storage as StorageDetect
          )
        : await createContextExplicit(
            parameters,
            logger,
            progress,
            storage as StorageExplicit
          );
    store2 = jobContext.store;

    progressUpdater = setInterval(
      () => jobContext.updateProgress(progress),
      5000
    );

    await renderTiles(jobContext);

    clearInterval(progressLogger);
    clearInterval(progressUpdater);

    const duration = process.hrtime(progress.started);
    logger.info(`Finished rendering job with id ${id} in ${pretty(duration)}`);

    if (!agent) {
      process.exitCode = 0;
    }
  } catch (e) {
    clearInterval(progressLogger);
    clearInterval(progressUpdater);

    logger.error(progressMessage(progress, "Aborted"));
    logger.error(`Rendering job with id ${id} failed: ${e}`);

    if (!agent) {
      process.exitCode = 1;
    } else {
      throw e;
    }
  } finally {
    if (store2) {
      await store2.close();
    }
  }
};

const createContextDetect = async (
  parameters: JobParameters,
  logger: Logger,
  progress: Progress,
  storage: StorageDetect
): Promise<JobContext> => {
  const { api, tileset, tmsId } = parameters;

  const store = await createStore(
    StoreType.FS,
    storage.store,
    api,
    tileset,
    "detect",
    logger
  );

  const tms = getTileMatrixSet(tmsId);
  const style = await getStyle(store, storage.styleRel, tmsId, logger);
  const mutex = undefined;

  return {
    ...parameters,
    store,
    tms,
    style,
    mutex,
    logger,
    incProgress: () => progress.current++,
  };
};

const createContextExplicit = async (
  parameters: JobParameters,
  logger: Logger,
  progress: Progress,
  storage: StorageExplicit
): Promise<JobContext> => {
  const { api, tileset, tmsId, concurrency } = parameters;

  const store = await createStoreExplicit(StoreType.FS, api, storage, logger);

  const tms = getTileMatrixSet(tmsId);
  const style = await getStyle(store, storage.style, tmsId, logger);
  const key = storage.style + tileset + tmsId;
  const mutex =
    concurrency > 1 && !store.perTile ? await getMutex(key) : undefined;

  return {
    ...parameters,
    store,
    tms,
    style,
    mutex,
    logger,
    incProgress: () => progress.current++,
  };
};

const percentDone = (progress: Progress) =>
  Math.round((progress.current / progress.total) * 100);

const progressMessage = (progress: Progress, prefix: string) =>
  `${prefix} rendering job with id ${progress.jobId}: ${percentDone(
    progress
  )}% (${progress.current}/${progress.total})`;
