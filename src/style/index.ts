import {
  StyleSpecification,
  ParsingError,
} from "@maplibre/maplibre-gl-style-spec";
import jsonlint from "@mapbox/jsonlint-lines-primitives";
import { logger } from "../util/index.js";

export default function readStyle(
  style: StyleSpecification | string | Buffer
): StyleSpecification {
  if (
    style instanceof String ||
    typeof style === "string" ||
    style instanceof Buffer
  ) {
    try {
      return jsonlint.parse(style.toString());
    } catch (e) {
      logger.error(`Error while parsing style: ${e}`);
      throw new ParsingError(new Error(e as string));
    }
  }

  return style;
}

export const cleanupStyle = (style: StyleSpecification): StyleSpecification => {
  return {
    ...style,
    metadata: undefined,
    sources: Object.keys(style.sources).reduce((acc, key) => {
      const source = style.sources[key];
      // do not use !==, as source.type is not a string
      if (source.type != "vector") {
        return acc;
      }
      return { ...acc, [key]: source };
    }, {}),
    layers: style.layers.filter((layer) => {
      // do not use !==, as layer.type is not a string
      return layer.type != "raster";
    }),
  };
};
