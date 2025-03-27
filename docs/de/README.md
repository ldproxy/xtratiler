# xtratiler

Rasterkachel-Renderer für [ldproxy](https://github.com/interactive-instruments/ldproxy).

## Umfang

_xtratiler_ ist ein Zubehör für _ldproxy_. Es durchsucht die _ldproxy_ Job-Queue nach Rasterkachel-Jobs. Wenn ein Job gefunden wird, rendert es Rasterkacheln aus bereits vorhandenen Vektorkacheln und einem gegebenen MapLibre Style. Die gerenderten Rasterkacheln werden im _ldproxy_ Store abgelegt und dann von _ldproxy_ veröffentlicht.

## Voraussetzungen

Eine _ldproxy_ Instanz mit mindestens einem Tile-Provider mit einem konfigurierten Raster-Tileset wird benötigt, siehe `rasterTilesets` in der [ldproxy Dokumentation](https://docs.ldproxy.net/de/providers/tile/10-features.html).

Port `7081` der _ldproxy_ Instanz muss für _xtratiler_ zugänglich sein und sowohl _ldproxy_ als auch _xtratiler_ benötigen Zugriff auf denselben Store.

## Installation

Hier ist ein Beispiel für eine `docker-compose.yml`, die sowohl _ldproxy_ als auch _xtratiler_ installiert:

```yml
services:
  ldproxy:
    image: iide/ldproxy:latest
    restart: always
    ports:
      - "7080:7080"
    volumes:
      - /path/to/store:/data

  xtratiler:
    image: ghcr.io/ldproxy/xtratiler:latest
    restart: always
    command: agent -q http://ldproxy:7081 -c 32 -r 2
    volumes:
      - /path/to/store:/store
```

Beachten Sie, dass beide Container das gleiche Store-Verzeichnis einbinden und dass _xtratiler_ auf Port `7081` des _ldproxy_ Containers über das private Docker-Netzwerk zugreift, dieser muss nicht veröffentlicht werden.
