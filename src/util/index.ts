import { pino, Logger as PinoLogger } from "pino";
import { build as pretty } from "pino-pretty";

/*const fileTransport = pino.transport({
  target: "pino/file",
  options: { destination: "/path/to/file", mkdir: true },
});

const transport = pino.transport({
  targets: [
    { target: "/absolute/path/to/my-transport.mjs", level: "error" },
    { target: "some-file-transport", options: { destination: "/dev/null" } },
  ],
});*/

export type Logger = PinoLogger<never>;

export const createLogger = (verbose: boolean): Logger =>
  pino(
    { level: verbose ? "debug" : "info" },
    pretty({
      levelFirst: true,
      ignore: "pid,hostname",
    })
  );
