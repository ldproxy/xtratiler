import mapLibre, { Map, RenderOptions } from "@maplibre/maplibre-gl-native";
import { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import sharp from "sharp";

import { Store } from "../store/index.js";
import { Logger } from "../util/index.js";
import { AssetReader } from "../store/assets.js";
import { context, propagation, Tracer } from "@opentelemetry/api";
import EventEmitter from "node:events";

const ml: EventEmitter = mapLibre as unknown as EventEmitter;
ml.on("message", (msg) => {
  console.log(msg);
});

type RenderParameters = {
  assetReader: AssetReader;
  style: StyleSpecification;
  zoom: number;
  center: [number, number];
  width: number;
  height: number;
  bufferX: number;
  bufferY: number;
  ratio: number;
};

interface TraceContext {
  traceparent?: string;
  tracestate?: string;
}

export const renderImage = async (
  params: RenderParameters,
  logger: Logger,
  tracer: Tracer
): Promise<Buffer> => {
  let resizeFactor = 1;

  // For raster zoom 0 create image with double size in raster zoom 1 and resize it.
  if (params.zoom === -1) {
    resizeFactor = 0.5;
    params.width = params.width * 2;
    params.height = params.height * 2;
    params.zoom = 0;
  }

  const img = await tracer.startActiveSpan("renderMapLibre", (span) =>
    renderMapLibre(params, logger).finally(() => span.end())
  );

  const span = tracer.startSpan("toPNG");
  const png = await toPNG(img, resizeFactor, params, logger);
  span.end();

  return png;
};

const renderMapLibre = async (
  { style, assetReader, zoom, center, width, height, ratio }: RenderParameters,
  logger: Logger
): Promise<Uint8Array> => {
  const traceContext: TraceContext = {};
  propagation.inject(context.active(), traceContext);

  //TODO: only create on Map per job?
  const map = new mapLibre.Map({
    request: (request, callback) => {
      const activeContext = propagation.extract(context.active(), traceContext);
      context.with(activeContext, () => {
        assetReader(request, callback);
      });
    },
    ratio,
  });

  //logger.debug("Render map with style: \n" + JSON.stringify(style, null, 2));

  map.load(style);

  const options: RenderOptions = {
    zoom,
    center,
    width,
    height,
    bearing: 0,
    pitch: 0,
  };

  logger.trace("Rendering using MapLibre with options: %o", options);

  return await renderMapLibrePromise(map, options);
};

const renderMapLibrePromise = async (
  map: Map,
  options: RenderOptions
): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    map.render(options, (error, buffer) => {
      try {
        map.release();
      } catch (e) {
        // ignore
      }

      if (error) {
        return reject(error);
      }

      return resolve(buffer);
    });
  });
};

/**
 * Convert premultiplied image buffer from MapLibre GL to RGBA PNG format.
 * @param {Uint8Array} imgBuffer - image data buffer
 * @param {number} width - image width
 * @param {number} height - image height
 * @param {number} ratio - image pixel ratio
 * @param {number} bufferWidth - buffer for map width
 * @param {number} bufferHeight - buffer for map height
 * @param {number} resizeFactor - factor to reduce the size of the image (used for zoom level 0)
 * @returns
 */
const toPNG = async (
  imgBuffer: Uint8Array,
  resizeFactor: number,
  { width, height, bufferX, bufferY, ratio }: RenderParameters,
  logger: Logger
): Promise<Buffer> => {
  // Un-premultiply pixel values
  // Mapbox GL buffer contains premultiplied values, which are not handled correctly by sharp
  // https://github.com/mapbox/mapbox-gl-native/issues/9124
  // since we are dealing with 8-bit RGBA values, normalize alpha onto 0-255 scale and divide
  // it out of RGB values

  logger.trace("Convert image buffer to png");

  for (let i = 0; i < imgBuffer.length; i += 4) {
    const alpha = imgBuffer[i + 3];
    const norm = alpha / 255;
    if (alpha === 0) {
      imgBuffer[i] = 0;
      imgBuffer[i + 1] = 0;
      imgBuffer[i + 2] = 0;
    } else {
      imgBuffer[i] /= norm;
      imgBuffer[i + 1] = imgBuffer[i + 1] / norm;
      imgBuffer[i + 2] = imgBuffer[i + 2] / norm;
    }
  }

  const tileImage = sharp(imgBuffer, {
    raw: {
      width: width * ratio,
      height: height * ratio,
      channels: 4,
    },
  });

  // Remove buffer
  if (bufferX > 0 || bufferY > 0) {
    logger.trace(
      `Extract image from buffer with width ${
        width * ratio - bufferX * ratio * 2
      } and height ${height * ratio - bufferY * ratio * 2}`
    );
    tileImage.extract({
      width: width * ratio - bufferX * ratio * 2,
      height: height * ratio - bufferY * ratio * 2,
      left: bufferX * ratio,
      top: bufferY * ratio,
    });
  }

  // Resize image (for zoom 0)
  if (resizeFactor != 1) {
    logger.trace(
      `Resize image to width ${width * ratio * resizeFactor} and height ${
        height * ratio * resizeFactor
      }`
    );
    tileImage.resize(
      width * ratio * resizeFactor,
      height * ratio * resizeFactor
    );
  }

  return tileImage.png().toBuffer();
};
