import MBTilesOrig from "@mapbox/mbtiles";
import zlib from "node:zlib";

export type MBTiles = {
  getTile: (z: number, x: number, y: number) => Promise<Buffer>;
  getInfo: () => Promise<any>;
  hasTile: (z: number, x: number, y: number) => Promise<boolean>;
  putTile: (z: number, x: number, y: number, buffer: Buffer) => Promise<void>;
  putInfo: (data: any) => Promise<void>;
  close: () => Promise<void>;
};

export const openMbtiles = async (
  mbtilesFile: string,
  writable?: boolean,
  forceXyz?: boolean
): Promise<MBTiles> => {
  const mode = `?mode=${writable ? "rwc" : "ro"}`;

  return new Promise((resolve, reject) => {
    new MBTilesOrig(mbtilesFile + mode, (err: any, mbtiles: any) => {
      if (err) {
        return reject(err);
      }

      if (writable) {
        return mbtiles.startWriting((err2: any) => {
          if (err) {
            return reject(err2);
          }

          return resolve(wrap(mbtiles, true, forceXyz));
        });
      }

      return resolve(wrap(mbtiles, false, false));
    });
  });
};

const wrap = (
  mbtiles: any,
  writable: boolean | undefined,
  forceXyz: boolean | undefined
): MBTiles => ({
  getTile: (z: number, x: number, y: number) => {
    return new Promise((resolve, reject) => {
      mbtiles.getTile(z, x, y, (err: any, data: any, headers: any) => {
        if (err) {
          if (err.message === "Tile does not exist") {
            err.code = "ENOENT";
          }
          return reject(err);
        }

        return zlib.unzip(data, (unzipErr, unzippedData) => {
          if (unzipErr) {
            return reject(unzipErr);
          }

          return resolve(unzippedData);
        });
      });
    });
  },
  getInfo: () => {
    return new Promise((resolve, reject) => {
      mbtiles.getInfo((err: any, info: any) => {
        if (err) {
          return reject(err);
        }

        return resolve(info);
      });
    });
  },
  hasTile: (z: number, x: number, y: number) => {
    return new Promise((resolve, reject) => {
      const row = forceXyz ? Math.pow(2, z) - y - 1 : y;

      mbtiles.getTile(z, x, row, (err: any) => {
        if (err) {
          return resolve(false);
        }

        return resolve(true);
      });
    });
  },
  putTile: (z: number, x: number, y: number, buffer: Buffer) => {
    return new Promise((resolve, reject) => {
      const row = forceXyz ? Math.pow(2, z) - y - 1 : y;

      mbtiles.putTile(z, x, row, buffer, (err: any) => {
        if (err) {
          return reject(err);
        }

        return resolve();
      });
    });
  },
  putInfo: (data: Buffer) => {
    return new Promise((resolve, reject) => {
      mbtiles.putInfo(
        //TODO: overwritten by @mapbox/mbtiles
        { ...data, scheme: forceXyz ? "xyz" : "tms" },
        (err: any) => {
          if (err) {
            return reject(err);
          }

          return resolve();
        }
      );
    });
  },
  close: () => {
    return new Promise((resolve, reject) => {
      if (writable) {
        return mbtiles.stopWriting((err: any) => {
          if (err) {
            return reject(err);
          }

          return mbtiles.close((err: any) => {
            if (err) {
              return reject(err);
            }

            return resolve();
          });
        });
      }

      return mbtiles.close((err: any) => {
        if (err) {
          return reject(err);
        }

        return resolve();
      });
    });
  },
});
