import fs from "fs/promises";
import mbgl, {
  Map,
  RenderOptions,
  MapOptions,
} from "@maplibre/maplibre-gl-native";
import { createRequestHandler } from "./assets.js";
import { ResourceType, createStoreFs } from "../store/index.js";
import { logger } from "../util/index.js";
import readStyle, { cleanupStyle } from "../style/index.js";
import { toPNG } from "./png.js";

export const render = async (stylePath: string, storePath: string) => {
  try {
    let height = 512;
    let width = 512;
    let bufferHeight = 512;
    let bufferWidth = 512;

    height = height + bufferHeight * 2;
    width = width + bufferWidth * 2;

    const img = await renderImage(stylePath, storePath, width, height);

    const png = await toPNG(
      img,
      width,
      height,
      1,
      bufferWidth,
      bufferHeight,
      1
    );

    await fs.writeFile("output.png", png);
  } catch (e) {
    logger.error(e);
    process.exit(1);
  }
};

const renderImage = async (
  stylePath: string,
  storePath: string,
  width: number,
  height: number
): Promise<Uint8Array> => {
  const store = createStoreFs(storePath);
  const requestHandler = createRequestHandler(store, "vineyards");

  const map = new mbgl.Map({
    request: requestHandler,
    ratio: 1.0,
  });

  const style = await store.read("", ResourceType.Style, stylePath);

  logger.debug(
    "Render map with style: " + store.path(ResourceType.Style, stylePath)
  );

  const styleJson = cleanupStyle(readStyle(style));

  logger.debug(
    "Render map with style: \n" + JSON.stringify(styleJson, null, 2)
  );

  map.load(styleJson);

  const zoom = 8;
  const center: [number, number] = [7.35, 49.8];

  const imgBuffer = await renderMap(map, {
    zoom,
    center,
    height,
    width,
    bearing: 0,
    pitch: 0,
  });

  return imgBuffer;
};

const renderMap = async (
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
