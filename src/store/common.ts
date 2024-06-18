import { ResourceKind } from "@maplibre/maplibre-gl-native";

export type Cache = {
  tms: string;
  level: number;
  storage: string;
  path: string;
  hasRaster: boolean;
};

export const enum ResourceType {
  Style,
  TileJson,
  Tile,
  ApiResource,
}

export const resourceTypeToDir = {
  [ResourceType.Style]: "values/maplibre-styles",
  [ResourceType.TileJson]: "resources/tilejson",
  [ResourceType.Tile]: "resources/tiles",
  [ResourceType.ApiResource]: "resources/api-resources",
};

export const getResourceType = (kind: ResourceKind): ResourceType => {
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
