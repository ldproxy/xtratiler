import pretty from "pretty-time";
import { trace, Tracer } from "@opentelemetry/api";

import { Logger } from "../util/logger.js";
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
  getStyleId,
} from "../style/index.js";
import { renderTiles } from "./tiles.js";

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
  verbosity: number;
  debugOnlyCompute: boolean;
  updateProgress: (progress: Progress, last?: boolean) => Promise<void>;
  addError: (string) => void;
};

export type JobContext = JobParameters & {
  store: Store;
  tms: TileMatrixSet;
  style: Style;
  logger: Logger;
  tracer: Tracer;
  incProgress: () => void;
};

type Progress = {
  jobId: string;
  started: [number, number];
  total: number;
  current: number;
  last: number;
  msg: string;
  jobInfo: {
    api: string;
    tileset: string;
    tmsId: string;
    z: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
};

const tracer = trace.getTracer("renderer");

export const render = async (parameters: JobParameters, logger: Logger) => {
  const {
    id,
    api,
    tileset,
    tmsId,
    z,
    minX,
    maxX,
    minY,
    maxY,
    agent,
    storage,
    verbosity,
  } = parameters;

  const styleId = getStyleId(
    storage.type === StorageType.DETECT
      ? (storage as StorageDetect).styleRel
      : (storage as StorageExplicit).style
  );
  const jobInfo = {
    api,
    tileset: `${tileset}_${styleId}`,
    tmsId,
    z,
    minX,
    maxX,
    minY,
    maxY,
  };

  await tracer.startActiveSpan(
    "render",
    { attributes: jobInfo },
    async (span) => {
      const progress: Progress = {
        jobId: id,
        started: process.hrtime(),
        total: (maxX - minX + 1) * (maxY - minY + 1),
        current: 0,
        last: 0,
        msg: "",
        jobInfo,
      };

      logger.info("Starting rendering job: %o", jobInfo);

      const progressLogger = setInterval(
        () => logger.info(progressMessage(progress, "Running"), jobInfo),
        verbosity === 0 ? 10000 : verbosity === 1 ? 5000 : 1000
      );
      let progressUpdater: NodeJS.Timeout | undefined;
      let lastUpdate: Promise<void> = Promise.resolve();

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

        //TODO: if style.sources.any(source => source.maxzoom < parameters.z-1) -> skip

        progressUpdater = setInterval(
          () => (lastUpdate = jobContext.updateProgress(progress)),
          5000
        );

        await renderTiles(jobContext);

        clearInterval(progressLogger);
        clearInterval(progressUpdater);

        const duration = process.hrtime(progress.started);
        logger.info(
          `Finished rendering job in ${pretty(duration)}: %o`,
          jobInfo
        );

        await lastUpdate.finally(() =>
          jobContext.updateProgress(progress, true)
        );

        if (!agent) {
          process.exitCode = 0;
        }
      } catch (e) {
        clearInterval(progressLogger);
        clearInterval(progressUpdater);

        logger.error(progressMessage(progress, "Aborted"), jobInfo);
        logger.error(`Rendering job failed with error "${e}": %o`, jobInfo);

        if (!agent) {
          process.exitCode = 1;
        } else {
          throw e;
        }
      } finally {
        if (store2) {
          try {
            await store2.close();
          } catch (e) {}
        }
        span.end();
      }
    }
  );
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

  return {
    ...parameters,
    store,
    tms,
    style,
    logger,
    tracer,
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

  const store = await createStoreExplicit(
    StoreType.FS,
    storage.store,
    api,
    storage,
    logger
  );

  const tms = getTileMatrixSet(tmsId);
  const style = await getStyle(store, storage.style, tmsId, logger);

  return {
    ...parameters,
    store,
    tms,
    style,
    logger,
    tracer,
    incProgress: () => progress.current++,
  };
};

const percentDone = (progress: Progress) =>
  Math.round((progress.current / progress.total) * 100);

const progressMessage = (progress: Progress, prefix: string) =>
  `${prefix} rendering job at ${percentDone(progress)}%% (${progress.current}/${
    progress.total
  }): %o`;
