import { Argv, ArgumentsCamelCase } from "yargs";
import { asyncForEach } from "modern-async";
import cluster from "node:cluster";
import { availableParallelism } from "node:os";
import process from "node:process";

import { GlobalArgs } from "../index.js";
import { Logger, createLogger } from "../util/logger.js";
import { JobParameters, render } from "../renderer/index.js";
import {
  findEntityPaths,
  getCaches,
  getProviderByPath,
} from "../store/provider.js";
import { StorageExplicit, StorageType } from "../store/index.js";

export type AgentArgs = GlobalArgs & {
  queueUrl: string;
  store: string;
  ratio: 1 | 2 | 4 | 8;
  concurrency: 1 | 2 | 4 | 8 | 16 | 32;
  fileLog: boolean;
  debugOnlyCompute: boolean;
};

export const command = "agent";

export const describe =
  "connect to job queue and process raster tile rendering jobs";

export const builder = (yargs: Argv<{}>) => {
  const options = yargs
    .option("queue-url", {
      alias: "q",
      type: "string",
      nargs: 1,
      demandOption: true,
      requiresArg: true,
      description: "URL of the job queue",
      //defaultDescription: "current directory",
      default: "http://localhost:7081",
      group: "Agent options:",
    })
    .option("store", {
      alias: "s",
      type: "string",
      normalize: true,
      nargs: 1,
      demandOption: true,
      requiresArg: true,
      //demandOption: true,
      description: "ldproxy store directory",
      //defaultDescription: "current directory",
      default: "./",
      group: "Agent options:",
    })
    .option("ratio", {
      alias: "r",
      type: "number",
      nargs: 1,
      description: "image pixel ratio",
      default: 1,
      choices: [1, 2, 4, 8],
      group: "Agent options:",
    })
    .option("concurrency", {
      alias: "c",
      type: "number",
      nargs: 1,
      description:
        "number of jobs processed concurrently (max: number of CPU cores)",
      default: 1,
      choices: [1, 2, 4, 8, 16, 32],
      group: "Agent options:",
    })
    .option("debug-only-compute", {
      alias: "d",
      type: "boolean",
      default: false,
      hidden: true,
    });
  /*.example([
      ['$0 --config "~/config.json"', "Use custom config"],
      ["$0 --safe", "Start in safe mode"],
    ])*/

  if (process.env.XTRAPLATFORM_ENV !== "CONTAINER") {
    options.option("file-log", {
      alias: "f",
      type: "boolean",
      default: false,
      description: "log to file instead of stdout",
      group: "Agent options:",
    });
  }

  return options;
};

type Agent = {
  queueUrl: string;
  storePath: string;
  ratio: 1 | 2 | 4 | 8;
  concurrency: 1 | 2 | 4 | 8 | 16 | 32;
  concurrencyEnabled: boolean;
  connected: boolean;
  debugOnlyCompute: boolean;
  verbosity: number;
  logger: Logger;
};

export const handler = async (argv: ArgumentsCamelCase<{}>) => {
  const argv2 = argv as ArgumentsCamelCase<AgentArgs>;
  const logger = await createLogger(argv2.verbose, argv2.fileLog, argv2.store);

  if (cluster.isPrimary) {
    const numWorkers = Math.min(availableParallelism() - 1, argv2.concurrency);

    logger.info("Starting %d workers", numWorkers);

    for (let i = 0; i < numWorkers; i++) {
      const worker = cluster.fork();
      worker.on("error", (err) => {
        logger.error("Error from worker: %s)", err);
      });
    }

    cluster.on("exit", (worker, code, signal) => {
      logger.debug(
        "Worker with pid %d stopped (exit code: %d, signal: %s)",
        worker.process.pid,
        code,
        signal
      );
      if (code !== 0) {
        logger.debug(
          "Worker was stopped unexpectedly, starting a new one",
          worker
        );
        cluster.fork();
      }
    });
  } else {
    const agent: Agent = {
      queueUrl: `${argv2.queueUrl}/api/jobs`,
      storePath: argv2.store,
      ratio: argv2.ratio,
      concurrency: argv2.concurrency,
      concurrencyEnabled: true,
      connected: false,
      debugOnlyCompute: argv2.debugOnlyCompute,
      verbosity: argv2.verbose,
      logger,
    };

    /*const tps = await findEntityPaths(agent.storePath);
  for (const tp of tps) {
    const api = basename(tp, "-tiles.yml");
    const provider = await getProviderByPath(tp);
    const caches = await getCaches(agent.storePath, api, provider);
    for (const cache of caches) {
      if (cache.hasRaster && cache.storage !== "PER_JOB") {
        agent.logger.warn(
          `Cache storage is not PER_JOB, disabling agent concurrency (${tp}, ${cache.storage})`
        );
        agent.concurrencyEnabled = false;

        break;
      }
    }
  }*/

    readFromQueue(agent)
      .then(() => {
        logger.info("Disconnected from job queue: %s", agent.queueUrl);
        process.exit(0);
      })
      .catch((err) => {
        logger.error(err);
        process.exit(1);
      });

    logger.debug("Worker with pid %d started", process.pid);
  }
};

async function readFromQueue(agent: Agent) {
  await asyncForEach(
    getJob(agent),
    async (job: any) => {
      await processJob(agent, job);
    },
    1 //agent.concurrencyEnabled ? agent.concurrency : 1
  );
}

async function* getJob(agent: Agent) {
  let shouldBreak = false;
  let job;
  process.on("SIGINT", () => (shouldBreak = true));
  process.on("SIGTERM", () => (shouldBreak = true));
  while (!shouldBreak) {
    job = await pollQueue(agent);
    if (!job) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    yield job;
  }
}

const pollQueue = async (agent: Agent): Promise<any> => {
  try {
    const response = await fetch(agent.queueUrl, {
      method: "POST",
      body: JSON.stringify({
        id: "xtratiler", //TODO: hostname
        type: "tile-seeding:raster:png",
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (response.status === 200) {
      if (!agent.connected) {
        agent.logger.info("Connected to job queue: %s", agent.queueUrl);
        agent.connected = true;
      }
      return await response.json();
    }

    if (response.status !== 204) {
      agent.connected = false;
      agent.logger.warn(
        `Polling job queue failed: ${response.status} ${response.statusText}`
      );
    } else {
      if (!agent.connected) {
        agent.logger.info("Connected to job queue: %s", agent.queueUrl);
        agent.connected = true;
      }
    }
  } catch (error) {
    agent.connected = false;
    agent.logger.error(`Polling job queue failed: ${error}`);
  }

  return null;
};

const processJob = async (agent: Agent, job: any) => {
  agent.logger.trace("Received job from queue: %o", job);

  const apiId = job.details.tileProvider.replace("-tiles", "");
  const tileset = job.details.tileSet.substring(
    0,
    job.details.tileSet.lastIndexOf("_")
  );
  const errors: string[] = [];

  const storage: StorageExplicit = {
    type: StorageType.EXPLICIT,
    store: agent.storePath,
    tileStorage: job.details.storage.type,
    jobSize: parseInt(job.details.storage.jobSize),
    vector: job.details.storage.vector,
    raster: job.details.storage.raster,
    style: job.details.storage.style,
  };

  const job2: JobParameters = {
    id: job.id,
    api: apiId,
    tileset: tileset,
    tmsId: job.details.tileMatrixSet,
    z: job.details.subMatrices[0].level,
    minX: job.details.subMatrices[0].colMin,
    maxX: job.details.subMatrices[0].colMax,
    minY: job.details.subMatrices[0].rowMin,
    maxY: job.details.subMatrices[0].rowMax,
    ratio: agent.ratio,
    concurrency: agent.concurrencyEnabled ? 1 : agent.concurrency,
    overwrite: job.details.reseed,
    mbtilesForceXyz: false,
    storage,
    agent: true,
    verbosity: agent.verbosity,
    debugOnlyCompute: agent.debugOnlyCompute,
    addError: (err) => errors.push(err),
    updateProgress: (progress, last) => {
      agent.logger.debug("Updating job progress: %s", job.id);

      const current = last ? progress.total : progress.current;
      const delta = current - progress.last;
      progress.last = current;

      return fetch(`${agent.queueUrl}/${job.id}`, {
        method: "POST",
        body: JSON.stringify({
          tileSet: progress.jobInfo.tileset,
          tileMatrixSet: progress.jobInfo.tmsId,
          level: progress.jobInfo.z,
          delta: delta,
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
        .then(() => {
          agent.logger.debug("Updated job progress: %s", job.id);
        })
        .catch(() => {
          agent.logger.error("Failed to update job progress: %s", job.id);
        });
    },
  };

  agent.logger.debug("Submitting rendering job: %o", job2);

  let error;
  try {
    await render(job2, agent.logger.child({ name: job2.id }));

    if (errors.length > 0) {
      error = errors.join(" | ");
    }
  } catch (err) {
    agent.logger.error(`Error rendering job with id ${job2.id}: ${err}`);
    error = err;
  }

  try {
    const response = await fetch(`${agent.queueUrl}/${job.id}`, {
      method: "DELETE",
      body: JSON.stringify({ error, retry: true }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    //const del = response.status === 204;
    //console.log(del);
  } catch (error) {
    agent.logger.error(`Error finishing job with id ${job2.id}: ${error}`);
  }
};
