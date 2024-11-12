# Commands

## Usage

```sh
$ xtratiler --help
```

Help output:

```
xtratiler <command>

Commands:
  xtratiler agent           connect to job queue and process raster tile rendering jobs
  xtratiler render <style>  submit a raster tile rendering job

Options:
  -h, --help     Show help  [boolean]
      --version  Show version number  [boolean]
  -v, --verbose  Run with verbose logging  [count]
      --yes      Do not ask for confirmation  [boolean]
```

## Available commands

- [agent](#agent)
- [render](#render)

### agent

```sh
$ xtratiler agent --help
```

Help output:

```
xtratiler agent

connect to job queue and process raster tile rendering jobs

Agent options:
  -q, --queue-url    URL of the job queue  [string] [required] [default: "http://localhost:7081"]
  -s, --store        ldproxy store directory  [string] [required] [default: "./"]
  -r, --ratio        image pixel ratio  [number] [choices: 1, 2, 4, 8] [default: 1]
  -c, --concurrency  number of jobs processed concurrently  [number] [choices: 1, 2, 4, 8, 16, 32] [default: 1]
  -f, --file-log     log to file instead of stdout  [boolean] [default: false]

Options:
  -h, --help     Show help  [boolean]
      --version  Show version number  [boolean]
  -v, --verbose  Run with verbose logging  [count]
      --yes      Do not ask for confirmation  [boolean]
```

### render

```sh
$ xtratiler render --help
```

Help output:

```
xtratiler render <style>

submit a raster tile rendering job (ONLY FOR TESTING OR DEBUGGING)

Positionals:
  style  mablibre style to render  [string] [required]

Render options:
  -s, --store              ldproxy store directory  [string] [required] [default: "./"]
  -t, --tms                tile matrix set  [string] [default: "WebMercatorQuad"]
  -z, --zoom               zoom level  [number] [default: 0]
  -x, --min-x              min col  [number] [default: 0]
  -X, --max-x              max col  [number] [default: minx]
  -y, --min-y              min row  [number] [default: 0]
  -Y, --max-y              max row  [number] [default: miny]
  -r, --ratio              image pixel ratio  [number] [choices: 1, 2, 4, 8] [default: 1]
  -c, --concurrency        number of tiles rendered concurrently  [number] [choices: 1, 2, 4, 8, 16, 32] [default: 1]
  -o, --overwrite          overwrite existing tiles instead of skipping them  [boolean] [default: false]
      --mbtiles-force-xyz  when writing to mbtiles, use XYZ instead of TMS tiling scheme  [boolean] [default: false]

Options:
  -h, --help     Show help  [boolean]
      --version  Show version number  [boolean]
  -v, --verbose  Run with verbose logging  [count]
      --yes      Do not ask for confirmation  [boolean]
```
