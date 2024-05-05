import SphericalMercator from "@mapbox/sphericalmercator";

const mercator = new SphericalMercator();

/**
 * Get center of tile [lon, lat]
 * @param {number} zoom - zoom level
 * @param {number} x - tile column
 * @param {number} y - tile row
 * @param {tileSize} tileSize - tile size in pixel
 */
export const getTileCenterLonLat = (
  zoom: number,
  x: number,
  y: number,
  tileSize = 256
): [number, number] => {
  const pxCenterX = x * tileSize + tileSize / 2;
  const pxCenterY = y * tileSize + tileSize / 2;

  const center = mercator.ll([pxCenterX, pxCenterY], zoom);

  return center;
};

/**
 * Check if tile is at the edge of the grid
 * @param {number} zoom - zoom level
 * @param {number} x - tile column
 * @param {number} y - tile row
 */
export const isEdgeTile = (
  zoom: number,
  x: number,
  y: number
): { x: boolean; y: boolean } => {
  const numTiles = Math.pow(2, zoom);
  let isEdgeTile = { x: false, y: false };

  if (x == 0 || x == numTiles - 1) {
    isEdgeTile.x = true;
  }
  if (y == 0 || y == numTiles - 1) {
    isEdgeTile.y = true;
  }
  //logger.debug("Is edge tile: ", isEdgeTile);

  return isEdgeTile;
};

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

export const getXyzBounds = (zoom: number, bbox: Bounds): Bounds => {
  return mercator.xyz([bbox.minX, bbox.minY, bbox.maxX, bbox.maxY], zoom);
};
