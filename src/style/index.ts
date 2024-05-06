import {
  StyleSpecification,
  ParsingError,
} from "@maplibre/maplibre-gl-style-spec";
import jsonlint from "@mapbox/jsonlint-lines-primitives";

import { Store } from "../store/index.js";
import { ResourceType } from "../store/common.js";
import { adjustStyle } from "./adjust.js";
import { Logger } from "../util/index.js";

export type Style = {
  id: string;
  spec: StyleSpecification;
};

export type TileMatrixSet = {
  name: string;
  tileSize: number;
  zoomDelta: number;
};

const tileMatrixSets: { [key: string]: TileMatrixSet } = {
  WebMercatorQuad: { name: "WebMercatorQuad", tileSize: 256, zoomDelta: 0 },
  AdV_25832: { name: "AdV_25832", tileSize: 256, zoomDelta: -5 },
  AdV_25833: { name: "AdV_25833", tileSize: 256, zoomDelta: -5 },
};

export const getTileMatrixSet = (tmsId: string): TileMatrixSet => {
  const tms = tileMatrixSets[tmsId];

  if (!tms) {
    throw new Error(`Unsupported TileMatrixSet: ${tmsId}`);
  }

  return tms;
};

export const getStyle = async (
  store: Store,
  stylePath: string,
  tmsId: string,
  logger: Logger
): Promise<Style> => {
  const styleId = stylePath.substring(
    stylePath.indexOf("/") + 1,
    stylePath.indexOf(".")
  );

  const tms = tileMatrixSets[tmsId];

  //TODO: cap zoom levels to vector tiles

  const styleRaw = await store.read(ResourceType.Style, stylePath);

  const style = adjustStyle(parseStyle(styleRaw), tms);

  //await fs.writeFile(`out/output_style.json`, JSON.stringify(style, null, 2));

  logger.debug("MapLibre style: " + store.path(ResourceType.Style, stylePath));

  return { id: styleId, spec: style };
};

const parseStyle = (
  style: StyleSpecification | string | Buffer
): StyleSpecification => {
  if (
    style instanceof String ||
    typeof style === "string" ||
    style instanceof Buffer
  ) {
    try {
      return jsonlint.parse(style.toString());
    } catch (e) {
      throw new ParsingError(new Error(e as string));
    }
  }

  return style;
};
