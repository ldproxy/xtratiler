import { Argv, ArgumentsCamelCase } from "yargs";
import { basename } from "path";

import { GlobalArgs } from "../index.js";
import { Logger, createLogger } from "../util/index.js";
import { JobParameters, render } from "../renderer/index.js";
import { asyncForEach } from "modern-async";
import {
  findEntityPaths,
  getCaches,
  getProviderByPath,
} from "../store/provider.js";

export type AgentArgs = GlobalArgs & {
  queueUrl: string;
  store: string;
  ratio: 1 | 2 | 4 | 8;
  concurrency: 1 | 2 | 4 | 8 | 16 | 32;
};

export const command = "agent";

export const describe =
  "connect to job queue and process raster tile rendering jobs";

export const builder = (yargs: Argv<{}>) => {
  return yargs
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
      description: "number of jobs processed concurrently",
      default: 1,
      choices: [1, 2, 4, 8, 16, 32],
      group: "Agent options:",
    });
  /*.example([
      ['$0 --config "~/config.json"', "Use custom config"],
      ["$0 --safe", "Start in safe mode"],
    ])*/
};

type Agent = {
  queueUrl: string;
  storePath: string;
  ratio: 1 | 2 | 4 | 8;
  concurrency: 1 | 2 | 4 | 8 | 16 | 32;
  concurrencyEnabled: boolean;
  logger: Logger;
};

export const handler = async (argv: ArgumentsCamelCase<{}>) => {
  const argv2 = argv as ArgumentsCamelCase<AgentArgs>;

  const agent: Agent = {
    queueUrl: `${argv2.queueUrl}/api/jobs`,
    storePath: argv2.store,
    ratio: argv2.ratio,
    concurrency: argv2.concurrency,
    concurrencyEnabled: true,
    logger: createLogger(argv2.verbose),
  };

  const tps = await findEntityPaths(agent.storePath);
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
  }

  readFromQueue(agent)
    .then(() => agent.logger.info("Disconnected from job queue"))
    .catch((err) => agent.logger.error(err));
};

async function readFromQueue(agent: Agent) {
  await asyncForEach(
    getJob(agent),
    async (job: any) => {
      await processJob(agent, job);
    },
    agent.concurrencyEnabled ? agent.concurrency : 1
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
      return await response.json();
    }

    if (response.status !== 204) {
      agent.logger.warn(
        `Polling job queue failed: ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
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
  const styleId = job.details.tileSet.substring(
    job.details.tileSet.lastIndexOf("_") + 1
  );
  const perJob = job.details.storageHint !== job.details.tileSet;

  const job2: JobParameters = {
    id: job.id,
    stylePath: `${apiId}/${styleId}.mbs`,
    storePath: agent.storePath,
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
    storageHint: agent.concurrencyEnabled ? job.details.storageHint : undefined,
    agent: true,
  };

  agent.logger.debug("Submitting rendering job: %o", job2);

  try {
    await render(job2, agent.logger);
  } catch (error) {
    agent.logger.error(`Error rendering job with id ${job2.id}: ${error}`);
  }

  try {
    const response = await fetch(agent.queueUrl, {
      method: "DELETE",
      body: JSON.stringify({ id: job.id }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    //const del = response.status === 204;
    //console.log(del);
  } catch (error) {}
};
