import MBTilesOrig from "@mapbox/mbtiles";
import zlib from "node:zlib";
import { Mutex, MutexInterface } from "async-mutex";
import { trace } from "@opentelemetry/api";

export type MBTiles = {
  getTile: (z: number, x: number, y: number) => Promise<Buffer>;
  getInfo: () => Promise<any>;
  hasTile: (z: number, x: number, y: number) => Promise<boolean>;
  putTile: (z: number, x: number, y: number, buffer: Buffer) => Promise<void>;
  putInfo: (data: any) => Promise<void>;
  close: () => Promise<void>;
};

type MBTilesRef = MBTiles & {
  refCount: number;
};

const tracer = trace.getTracer("mbtiles");

const mutex = new Mutex();
const mbtilesRegistry = new Map<string, MBTilesRef>();

export const openMbtiles = async (
  mbtilesFile: string,
  writable?: boolean,
  concurrent?: boolean,
  forceXyz?: boolean
): Promise<MBTiles> => {
  return getMbtilesRef(mbtilesFile, writable, concurrent, forceXyz);
};

const getMbtilesRef = async (
  path: string,
  writable?: boolean,
  concurrent?: boolean,
  forceXyz?: boolean
): Promise<MBTilesRef> => {
  return tracer.startActiveSpan("getMbtilesRef", async (span) => {
    return mutex
      .runExclusive(async () => {
        const mode = `?mode=${writable ? "rwc" : "ro"}`;
        const mbtilesFile = path + mode;

        if (mbtilesRegistry.has(mbtilesFile)) {
          const mbtiles = mbtilesRegistry.get(mbtilesFile) as MBTilesRef;
          mbtiles.refCount++;

          //console.log("REF INC", mbtilesFile, mbtiles.refCount);

          return mbtiles;
        }

        const mbtiles = await open(mbtilesFile, writable, concurrent, forceXyz);
        mbtilesRegistry.set(mbtilesFile, mbtiles);

        //console.log("REF NEW", mbtilesFile, mbtiles.refCount);

        return mbtiles;
      })
      .finally(() => span.end());
  });
};

const putMbtilesRef = async (mbtilesFile: string): Promise<boolean> => {
  return mutex.runExclusive(async () => {
    if (mbtilesRegistry.has(mbtilesFile)) {
      const mbtiles = mbtilesRegistry.get(mbtilesFile) as MBTilesRef;
      mbtiles.refCount--;

      //console.log("REF DEC", mbtilesFile, mbtiles.refCount);

      if (mbtiles.refCount === 0) {
        mbtilesRegistry.delete(mbtilesFile);

        /*console.log("REF DEL", mbtilesFile, mbtiles.refCount);

        if (mbtilesRegistry.size === 0) {
          console.log("REF CLEAR");
        }*/

        return true;
      }
    }

    return false;
  });
};

const open = async (
  mbtilesFile: string,
  writable?: boolean,
  concurrent?: boolean,
  forceXyz?: boolean
): Promise<MBTilesRef> => {
  return new Promise((resolve, reject) => {
    new MBTilesOrig(mbtilesFile, (err: any, mbtiles: any) => {
      if (err) {
        return reject(err);
      }

      if (writable) {
        return mbtiles.startWriting((err2: any) => {
          if (err2) {
            return reject(err2);
          }

          mbtiles._db.run("PRAGMA journal_mode = WAL", (err3: any) => {
            if (err3) {
              return reject(err3);
            }
            mbtiles._db.run("PRAGMA temp_store=MEMORY", (err4: any) => {
              if (err4) {
                return reject(err4);
              }
              mbtiles._db.run("PRAGMA locking_mode=EXCLUSIVE", (err5: any) => {
                if (err5) {
                  return reject(err5);
                }
                return resolve(
                  wrap(mbtiles, mbtilesFile, true, concurrent, forceXyz)
                );
              });
            });
          });
        });
      }

      return resolve(wrap(mbtiles, mbtilesFile, false, concurrent, false));
    });
  });
};

const runExclusive: <T>(
  mutex: Mutex | undefined,
  callback: () => Promise<T>
) => Promise<T> = (mutex, callback) => {
  if (mutex) {
    return mutex.runExclusive(callback);
  }

  return callback();
};

const wrap = (
  mbtiles: any,
  mbtilesFile: string,
  writable: boolean | undefined,
  concurrent: boolean | undefined,
  forceXyz: boolean | undefined
): MBTilesRef => {
  const mutex = writable && concurrent ? new Mutex() : undefined;

  return {
    refCount: 1,
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
    //TODO: if per_job, get all existing tiles upfront
    hasTile: (z: number, x: number, y: number) => {
      return tracer.startActiveSpan(
        "mbtiles.hasTile",
        async (span): Promise<boolean> => {
          return runExclusive(mutex, async (): Promise<boolean> => {
            return new Promise((resolve, reject) => {
              const row = forceXyz ? Math.pow(2, z) - y - 1 : y;

              mbtiles.getTile(z, x, row, (err: any) => {
                if (err) {
                  return resolve(false);
                }

                return resolve(true);
              });
            });
          }).finally(() => span.end());
        }
      );
    },
    putTile: (z: number, x: number, y: number, buffer: Buffer) => {
      if (!writable) {
        throw new Error(`${mbtilesFile} not writable`);
      }
      return runExclusive(mutex, async () => {
        return new Promise((resolve, reject) => {
          const row = forceXyz ? Math.pow(2, z) - y - 1 : y;

          mbtiles.putTile(z, x, row, buffer, (err: any) => {
            if (err) {
              return reject(err);
            }

            return resolve();
          });
        });
      });
    },
    putInfo: (data: Buffer) => {
      if (!writable) {
        throw new Error(`${mbtilesFile} not writable`);
      }
      return runExclusive(mutex, async () => {
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
      });
    },
    close: async () => {
      const doClose = await putMbtilesRef(mbtilesFile);

      if (!doClose) {
        return;
      }

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
  };
};
