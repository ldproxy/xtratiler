import {
  StyleSpecification,
  visit,
  StylePropertySpecification,
  VectorSourceSpecification,
  LayerSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { TileMatrixSet } from "./index.js";

export const adjustStyle = (
  style: StyleSpecification,
  tms: TileMatrixSet
): StyleSpecification => {
  const adjusted = {
    ...style,
    metadata: undefined,
    sources: Object.keys(style.sources).reduce((acc, key) => {
      const source = style.sources[key];

      // do not use !==, as source.type is not a string
      if (source.type != "vector") {
        return acc;
      }

      return {
        ...acc,
        [key]: adjustSource(source as VectorSourceSpecification, tms),
      };
    }, {}),
    layers: style.layers
      // do not use !==, as layer.type is not a string
      .filter((layer) => layer.type != "raster")
      .map((layer) => adjustLayer(layer, tms)),
  };

  //TODO: adjust layer filters

  return adjustProperties(adjusted, tms.zoomDelta);
};

function adjustSource(
  source: VectorSourceSpecification,
  tms: TileMatrixSet
): VectorSourceSpecification {
  return {
    ...source,
    tiles: source.tiles
      ? source.tiles.map((url) => url.replace("WebMercatorQuad", tms.name))
      : source.url
      ? [
          source.url
            .replace("?f=tilejson", "/{z}/{y}/{x}?f=mvt")
            .replace("WebMercatorQuad", tms.name),
        ]
      : undefined,
    url: undefined,
    minzoom: source.minzoom
      ? Math.max(source.minzoom + tms.zoomDelta, 0)
      : undefined,
    maxzoom: source.maxzoom
      ? Math.max(source.maxzoom + tms.zoomDelta, 0)
      : undefined,
  };
}

function adjustLayer(
  layer: LayerSpecification,
  tms: TileMatrixSet
): LayerSpecification {
  if (tms.zoomDelta === 0) {
    return layer;
  }

  return {
    ...layer,
    minzoom: layer.minzoom
      ? Math.max(layer.minzoom + tms.zoomDelta, 0)
      : undefined,
    maxzoom: layer.maxzoom
      ? Math.max(layer.maxzoom + tms.zoomDelta, 0)
      : undefined,
  };
}

function adjustProperties(
  style: StyleSpecification,
  zoomDelta: number
): StyleSpecification {
  if (zoomDelta === 0) {
    return style;
  }

  visit.eachProperty(
    style,
    { paint: true, layout: true },
    ({ key, value, reference, set }) => {
      const val = JSON.parse(JSON.stringify(value));

      if (supportsZoomExpression(reference)) {
        if (typeof val === "object" && Object.hasOwn(val, "stops")) {
          const adj = adjustZoomFunction(val, zoomDelta);
          set(adj);
          //console.log("STOPS", val, adj);
          return;
        }

        const zoomIndex = findZoom(val);

        if (zoomIndex > -1) {
          const adj = adjustZoomExpression(val, zoomIndex, zoomDelta);
          set(adj);
          /*console.log(
              "STYLE",
              key,
              reference,
              JSON.stringify(val, null, 2),
              JSON.stringify(adj, null, 2),
              zoomIndex
            );*/
        }
      }
    }
  );

  return style;
}

function supportsZoomExpression(spec: StylePropertySpecification): boolean {
  return !!spec.expression && spec.expression.parameters.indexOf("zoom") > -1;
}

function isZoomExpression(value: any): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (entry) =>
        Array.isArray(entry) && entry.length === 1 && entry[0] === "zoom"
    )
  );
}

function findZoom(expression: any): number {
  if (!Array.isArray(expression)) {
    return -1;
  }
  return expression.findIndex(
    (entry) => Array.isArray(entry) && entry.length === 1 && entry[0] === "zoom"
  );
}

function adjustZoomExpression(
  expression: any[],
  zoomIndex: number,
  zoomDelta: number
): any[] {
  const result: any[] = [];
  const even = zoomIndex % 2 === 0;

  for (let i = 0; i < expression.length; i++) {
    if (
      i <= zoomIndex ||
      (i - zoomIndex) % 2 === 0 ||
      typeof expression[i] !== "number"
    ) {
      result.push(expression[i]);
    } else {
      result.push(Math.max(expression[i] + zoomDelta, 0));
    }
  }

  return result;
}

function adjustZoomFunction(
  expression: { stops: any[] },
  zoomDelta: number
): { stops: any[] } {
  const stops: any[] = [];

  for (let i = 0; i < expression.stops.length; i++) {
    if (
      Array.isArray(expression.stops[i]) &&
      expression.stops[i].length === 2 &&
      typeof expression.stops[i][0] === "number"
    ) {
      stops.push([
        Math.max(expression.stops[i][0] + zoomDelta, 0),
        expression.stops[i][1],
      ]);
    } else {
      stops.push(expression.stops[i]);
    }
  }

  return { ...expression, stops };
}
