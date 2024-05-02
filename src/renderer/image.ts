import mapLibre, { Map, RenderOptions } from "@maplibre/maplibre-gl-native";
import { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import sharp from "sharp";

import { Store } from "../store/index.js";
import { logger } from "../util/index.js";

type RenderParameters = {
  style: StyleSpecification;
  store: Store;
  zoom: number;
  center: [number, number];
  width: number;
  height: number;
  bufferX: number;
  bufferY: number;
  ratio: number;
};

export const renderImage = async (
  params: RenderParameters
): Promise<Buffer> => {
  const resizeFactor = 1;

  const img = await renderMapLibre(params);

  return await toPNG(img, resizeFactor, params);
};

const renderMapLibre = async ({
  style,
  store,
  zoom,
  center,
  width,
  height,
  ratio,
}: RenderParameters): Promise<Uint8Array> => {
  const map = new mapLibre.Map({
    request: store.mapLibreHandler.bind(store),
    ratio,
  });

  //logger.debug("Render map with style: \n" + JSON.stringify(style, null, 2));

  map.load(style);

  const imgBuffer = await renderMapLibrePromise(map, {
    zoom,
    center,
    width,
    height,
    bearing: 0,
    pitch: 0,
  });

  return imgBuffer;
};

const renderMapLibrePromise = async (
  map: Map,
  options: RenderOptions
): Promise<Uint8Array> => {
  logger.debug(
    "Render map with options: \n" + JSON.stringify(options, null, 2)
  );
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
  { width, height, bufferX, bufferY, ratio }: RenderParameters
): Promise<Buffer> => {
  // Un-premultiply pixel values
  // Mapbox GL buffer contains premultiplied values, which are not handled correctly by sharp
  // https://github.com/mapbox/mapbox-gl-native/issues/9124
  // since we are dealing with 8-bit RGBA values, normalize alpha onto 0-255 scale and divide
  // it out of RGB values

  logger.debug("Convert image buffer to png");

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
    logger.debug(
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
    logger.debug(
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
