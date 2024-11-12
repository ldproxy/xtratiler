# xtratiler

Raster tile renderer for [ldproxy](https://github.com/interactive-instruments/ldproxy).

## Scope

_xtratiler_ is an accessory for _ldproxy_. It polls the _ldproxy_ job queue for raster tile jobs. When a job is found, it will render raster tiles from already existing vector tiles and a given MapLibre Style. The renderer raster tiles are written to the _ldproxy_ store and then published by _ldproxy_.

## Prerequisites

An _ldproxy_ instance with at least one tile provider with a configured raster tileset is needed, see `rasterTilesets` in the [ldproxy documentation](https://docs.ldproxy.net/de/providers/tile/10-features.html).

Port `7081` of the _ldproxy_ instance must be accessible for _xtratiler_ and both _ldproxy_ and _xtratiler_ need access to the same store.

## Installation

Here is an example of a `docker-compose.yml` that installs both _ldproxy_ and _xtratiler_:

```yml
services:
  ldproxy:
    image: iide/ldproxy:latest
    restart: always
    ports:
      - "7080:7080"
    volumes:
      - /path/to/store:/ldproxy/data

  xtratiler:
    image: ghcr.io/ldproxy/xtratiler:latest
    restart: always
    command: agent -q http://ldproxy:7081 -c 32 -r 2
    volumes:
      - /path/to/store:/store
```

Notice that both containers mount the same store directory and that _xtratiler_ accesses port `7081` of the _ldproxy_ container through the private docker network, it does not have to be exposed.
