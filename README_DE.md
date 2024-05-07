# xtratiler

ldproxy Raster-Kachel-Renderer

## CLI

_xtratiler_ hat eine Kommandozeilen-Schnittstelle mit der sich manuell Raster-Kacheln aus bestehenden Vektor-Kacheln in einem _ldproxy_-Cache rendern lassen.
Diese Schnittstelle dient hauptsächlich Test-Zwecken und erhebt keinen Anspruch auf Vollständigkeit.

Ein Rendering-Job kann mit dem Befehl `render` beauftragt werden. Ein Beschreibung aller Parameter findet sich in der Hilfe:

```sh
xtratiler render --help
```

### Beispiele

**Minimale Parameter**

Dieser Aufruf rendert eine einzelne Kachel in `WebMercatorQuad` und der Standardgröße 256px für das Tileset `__all__`. Er geht davon aus, dass das aktuelle Verzeichnis ein _ldproxy_-Store ist, der eine API `strassen`, den zugehörigen Style `default.mbs`, sowie einen entsprechenden Tile-Provider und einen Cache mit der angegebenen Vektor-Kachel enthält. Für den Cache werden alle Kombinationen von `type` und `storage` unterstützt.

Die neue Kachel wird dann im gleichen Cache im Tileset `__all___default` gespeichert.

```sh
xtratiler render strassen/default.mbs -z 12 -x 30 -y 40
```

**Alle Parameter**

Bei diesem Aufruf wird der Store explizit angegeben, außerdem wird ein Kachelbereich anstatt einer einzelnen Kachel gerendert.
Es wird das TileMatrixSet `AdV_25832` verwendet und die Kacheln werden in Größe 512px gerendert.
Es werden maximal 8 Kacheln gleichzeitig gerendert und das Debug-Logging wird aktiviert.

```sh
xtratiler render strassen/default.mbs -s /Users/az/development/configs-ldproxy/demogh -t AdV_25832 -z 7 -x 30 -X 59 -y 40 -Y 75 -c 8 -r 2 -v
```
