import { RequestResponse, ResourceKind } from "@maplibre/maplibre-gl-native";
import { ResourceType, Store } from "../store/index.js";
import { logger } from "../util/index.js";

type AssetRequestHandler = (
  input: { url: string; kind: ResourceKind },
  callback: (error?: Error, response?: RequestResponse) => void
) => void;

/**
 * Constructs a request handler for the map to load resources.
 * @param {*} tilePath - path containing mbtiles files
 * @returns requestHandler AssetRequestHandler
 */
export const createRequestHandler =
  (store: Store, api: string): AssetRequestHandler =>
  ({ url, kind }, callback) => {
    logger.debug(`Map request (kind ${kind}): ${url}`);

    const resourceType = getResourceType(kind);

    store
      .read(api, resourceType, url)
      .then((data) => {
        callback(undefined, { data });
      })
      .catch((error) => {
        logger.error(
          `Error while making resource request to: ${url}\n${error}`
        );
        callback(error);
      });
  };

const getResourceType = (kind: ResourceKind): ResourceType => {
  switch (kind) {
    case 1:
      return ResourceType.Style;
    case 2:
      return ResourceType.TileJson;
    case 3:
      return ResourceType.Tile;
    case 4:
      return ResourceType.ApiResource;
    case 5:
      return ResourceType.ApiResource;
    case 6:
      return ResourceType.ApiResource;
    default:
      throw new Error(`Unknown resource kind: ${kind}`);
  }
};
