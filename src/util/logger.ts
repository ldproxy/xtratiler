import { join } from "path";
import { pino, Logger as PinoLogger } from "pino";
import { build as pretty } from "pino-pretty";
import roll from "pino-roll";

export type Logger = PinoLogger<never>;

export const createLogger = async (
  verboseLevel: number,
  logToFile?: boolean,
  storePath?: string
): Promise<Logger> => {
  let colorize = true;
  let destination = 1;

  if (logToFile) {
    colorize = false;
    destination = await roll({
      file: storePath
        ? join(storePath, "log", "xtratiler")
        : join("log", "xtratiler"),
      extension: `.${process.pid}.log`,
      frequency: "daily",
      dateFormat: "yyyy-MM-dd",
      limit: { count: 7, removeOtherLogFiles: true },
      mkdir: true,
    });
  }

  return pino(
    {
      level: verboseLevel >= 2 ? "trace" : verboseLevel == 1 ? "debug" : "info",
    },
    pretty({
      levelFirst: true,
      ignore: "hostname",
      customPrettifiers: {
        name: (value, key, log, { colors }) => colors.dim(`${value}`),
      },
      translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
      colorize,
      destination,
    })
  );
};
