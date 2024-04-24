import { render } from "../renderer/index.js";
import { logger } from "../util/index.js";

export const command = "render <style>";

export const describe = "start the server";

export const builder = (yargs: any) => {
  return yargs
    .positional("style", {
      describe: "mablibre style to render",
      normalize: true,
    })
    .option("store", {
      alias: "s",
      type: "string",
      normalize: true,
      requiresArg: true,
      demandOption: true,
      description: "ldproxy store directory",
    });
};

export const handler = async (argv: any) => {
  if (argv.verbose) {
    logger.info(`style: ${argv.style}, store: ${argv.store}`);
  }

  await render(argv.style, argv.store);

  logger.info("Rendered map");
};
