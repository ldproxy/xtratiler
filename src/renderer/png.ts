import sharp from "sharp";

const logger = console;

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
export const toPNG = async (
  imgBuffer: Uint8Array,
  width: number,
  height: number,
  ratio: number,
  bufferWidth: number,
  bufferHeight: number,
  resizeFactor: number
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
  if (bufferWidth > 0 || bufferHeight > 0) {
    logger.debug(
      `Extract image from buffer with width ${
        width * ratio - bufferWidth * ratio * 2
      } and height ${height * ratio - bufferHeight * ratio * 2}`
    );
    tileImage.extract({
      width: width * ratio - bufferWidth * ratio * 2,
      height: height * ratio - bufferHeight * ratio * 2,
      left: bufferWidth * ratio,
      top: bufferHeight * ratio,
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
