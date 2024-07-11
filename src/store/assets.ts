import { RequestResponse, ResourceKind } from "@maplibre/maplibre-gl-native";
import { Store } from "./index.js";
import { Logger } from "../util/index.js";
import { ResourceType, getResourceType } from "./common.js";

export type AssetReader = (
  input: { url: string; kind: ResourceKind },
  callback: (error?: Error, response?: RequestResponse) => void
) => void;

export const createAssetReader = (
  store: Store,
  logger: Logger
): AssetReader => {
  const assets = new Map<string, Buffer>();

  return ({ url, kind }, callback) => {
    logger.trace(`MapLibre resource request (kind ${kind}): ${url}`);

    const resourceType = getResourceType(kind);

    if (resourceType === ResourceType.ApiResource && url.startsWith("http")) {
      if (assets.has(url)) {
        const data = assets.get(url);
        if (data) {
          logger.trace(`-> cache ${url}`);
          callback(undefined, { data });
          return;
        }
      }
      logger.trace(`-> fetch ${url}`);

      fetch(url)
        .then((response) => response.arrayBuffer())
        .then((arrayBuffer) => {
          assets.set(url, Buffer.from(arrayBuffer));
          callback(undefined, { data: Buffer.from(arrayBuffer) });
        })
        .catch((error) => {
          logger.error(
            `Error while making resource request to: ${url}\n${error}`
          );
          callback(error);
        });
      return;
    }

    let relPath = url;
    if (resourceType === ResourceType.TileJson) {
      relPath = url
        .replace("{serviceUrl}/tiles/", store.api + "_")
        .replace("?f=tile", ".");
    } else if (resourceType === ResourceType.Tile) {
      relPath = url.replace("{serviceUrl}/tiles/", "").replace("?f=", ".");
    } else if (resourceType === ResourceType.ApiResource) {
      relPath = url.replace("{serviceUrl}/resources", store.api);
    }

    logger.trace(`-> store ${store.path(resourceType, relPath)}`);

    store
      .read(resourceType, relPath)
      .then((data) => {
        if (data !== undefined) {
          callback(undefined, { data });
        } else {
          callback();
        }
      })
      .catch((error) => {
        if (error.code === "ENOENT") {
          logger.trace(`MapLibre resource not found or empty: ${url}`);
          callback();
          return;
        }
        logger.error(
          `Error while making resource request to: ${url}\n${error}`
        );
        callback(error);
      });
  };
};
