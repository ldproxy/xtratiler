import fs from "fs/promises";
import fss from "fs";
import { join } from "path";
import filehound from "filehound";
import yaml from "js-yaml";

import { Cache, ResourceType, resourceTypeToDir } from "./common.js";
import { Logger } from "../util/index.js";

const findEntityPath = async (
  storeDir: string,
  entityId: string
): Promise<string[]> => {
  const entityPaths = [
    join(storeDir, `entities/instances`),
    join(storeDir, `store/entities`),
  ].filter(fss.existsSync);

  return filehound.create().paths(entityPaths).match(`${entityId}.yml`).find();
};

export const findEntityPaths = async (storeDir: string): Promise<string[]> => {
  const entityPaths = [
    join(storeDir, `entities/instances`),
    join(storeDir, `store/entities`),
  ].filter(fss.existsSync);

  return filehound.create().paths(entityPaths).match(`*-tiles.yml`).find();
};

export const getProvider = async (
  storeDir: string,
  id: string,
  logger: Logger
): Promise<any> => {
  const providerFile = await findEntityPath(storeDir, id);

  if (providerFile.length === 0) {
    throw new Error(`No tile provider configuration found for id "${id}".`);
  }

  logger.debug(`Tile provider: ${providerFile[0]}`);

  const providerYaml = await fs.readFile(providerFile[0], "utf8");
  const provider: any = yaml.load(providerYaml);

  return provider;
};

export const getProviderByPath = async (providerFile: string): Promise<any> => {
  const providerYaml = await fs.readFile(providerFile, "utf8");
  const provider: any = yaml.load(providerYaml);

  return provider;
};

const tileCacheDir = async (
  storeDir: string,
  api: string,
  immutable: boolean,
  mbtiles: boolean
): Promise<string> => {
  const path = join(
    storeDir,
    resourceTypeToDir[ResourceType.Tile],
    api,
    immutable ? "cache_imm" : "cache_dyn"
  );

  if (immutable) {
    const stages = await filehound
      .create()
      .paths(path)
      .directory()
      .depth(1)
      .addFilter((dir: any) => !fss.existsSync(join(dir._pathname, ".staging")))
      .find();
    return stages[0] || path;
  }

  return path;
};

const fanoutLevels = async (
  storeDir: string,
  api: string,
  tms: string,
  type: string,
  storage: string,
  levels: { min: number; max: number },
  hasRaster: boolean
): Promise<Cache[]> =>
  Promise.all(
    new Array(levels.max - levels.min + 1)
      .fill(1)
      .map((d, i) => i + levels.min)
      .map(async (level) => {
        return {
          tms,
          level,
          storage,
          path: await tileCacheDir(
            storeDir,
            api,
            type === "IMMUTABLE",
            storage === "MBTILES"
          ),
          hasRaster,
        };
      })
  );

const fanoutTms = async (
  storeDir: string,
  api: string,
  type: string,
  storage: string,
  levels: { [tms: string]: { min: number; max: number } },
  hasRaster: boolean
): Promise<Cache[]> =>
  (
    await Promise.all(
      Object.keys(levels).flatMap(async (tms) =>
        fanoutLevels(storeDir, api, tms, type, storage, levels[tms], hasRaster)
      )
    )
  ).flat();

export const getCaches = async (
  storeDir: string,
  api: string,
  provider: any
): Promise<Cache[]> =>
  (
    await Promise.all(
      ((provider.caches as any[]) || [])
        .filter((cache) => cache.seeded !== false)
        .slice(0, 1)
        .flatMap(async (cache) => {
          return await fanoutTms(
            storeDir,
            api,
            cache.type,
            cache.storage,
            cache.levels,
            !!provider.rasterTilesets
          );
        })
    )
  ).flat();
