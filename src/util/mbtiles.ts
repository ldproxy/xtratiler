import MBTilesOrig from "@mapbox/mbtiles";
import zlib from "node:zlib";

export type MBTiles = {
  getTile: (z: number, x: number, y: number) => Promise<Buffer>;
  getInfo: () => Promise<any>;
  putTile: (z: number, x: number, y: number, buffer: Buffer) => Promise<void>;
  putInfo: (data: any) => Promise<void>;
  close: () => Promise<void>;
};

export const openMbtiles = async (
  mbtilesFile: string,
  writable?: boolean
): Promise<MBTiles> => {
  return new Promise((resolve, reject) => {
    new MBTilesOrig(mbtilesFile, (err: any, mbtiles: any) => {
      if (err) {
        return reject(err);
      }

      if (writable) {
        return mbtiles.startWriting((err2: any) => {
          if (err) {
            return reject(err2);
          }

          return resolve(wrap(mbtiles, writable));
        });
      }

      return resolve(wrap(mbtiles, writable));
    });
  });
};

const wrap = (mbtiles: any, writable: boolean | undefined): MBTiles => ({
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
  putTile: (z: number, x: number, y: number, buffer: Buffer) => {
    return new Promise((resolve, reject) => {
      mbtiles.putTile(z, x, y, buffer, (err: any) => {
        if (err) {
          return reject(err);
        }

        return resolve();
      });
    });
  },
  putInfo: (data: Buffer) => {
    return new Promise((resolve, reject) => {
      mbtiles.putInfo(data, (err: any) => {
        if (err) {
          return reject(err);
        }

        return resolve();
      });
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
