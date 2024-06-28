import pretty from "pretty-time";
import { Mutex } from "async-mutex";

import { Logger } from "../util/index.js";
import { Store, StoreType, createStore } from "../store/index.js";
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
  stylePath: string;
  storePath: string;
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
  storageHint: string | undefined;
  agent: boolean;
};

type Progress = {
  jobId: string;
  started: [number, number];
  total: number;
  current: number;
  msg: string;
};

export type JobContext = JobParameters & {
  store: Store;
  tms: TileMatrixSet;
  style: Style;
  mutex: Mutex | undefined;
  logger: Logger;
  incProgress: () => void;
};

export const render = async (parameters: JobParameters, logger: Logger) => {
  const {
    id,
    stylePath,
    storePath,
    tileset,
    tmsId,
    minX,
    maxX,
    minY,
    maxY,
    agent,
    storageHint,
    concurrency,
  } = parameters;

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

  let store2: Store | undefined;
  try {
    const store = await createStore(
      StoreType.FS,
      storePath,
      stylePath.substring(0, stylePath.indexOf("/")),
      tileset,
      agent ? storageHint : "detect",
      logger
    );
    store2 = store;

    const tms = getTileMatrixSet(tmsId);

    const style = await getStyle(store, stylePath, tmsId, logger);

    const key = storePath + stylePath + tileset + tmsId;
    const mutex =
      concurrency > 1 && !store.perTile ? await getMutex(key) : undefined;

    const jobContext: JobContext = {
      ...parameters,
      store,
      tms,
      style,
      mutex,
      logger,
      incProgress: () => progress.current++,
    };

    await renderTiles(jobContext);

    clearInterval(progressLogger);

    const duration = process.hrtime(progress.started);
    logger.info(`Finished rendering job with id ${id} in ${pretty(duration)}`);

    if (!agent) {
      process.exitCode = 0;
    }
  } catch (e) {
    clearInterval(progressLogger);

    logger.error(progressMessage(progress, "Aborted"));
    logger.error(`Rendering job with id ${id} failed: ${e}`);

    if (!agent) {
      process.exitCode = 1;
    }
  } finally {
    if (store2) {
      await store2.close();
    }
  }
};

const percentDone = (progress: Progress) =>
  Math.round((progress.current / progress.total) * 100);

const progressMessage = (progress: Progress, prefix: string) =>
  `${prefix} rendering job with id ${progress.jobId}: ${percentDone(
    progress
  )}% (${progress.current}/${progress.total})`;
