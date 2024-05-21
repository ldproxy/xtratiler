FROM node:20-slim

RUN apt-get update && apt-get install -y \
    wget \
 && rm -rf /var/lib/apt/lists/*

RUN wget -q -O /tmp/xtratiler.deb https://github.com/ldproxy/xtratiler/releases/download/v0.9.2/xtratiler_0.9.2-1_amd64.deb  \
  && apt-get update && apt-get install -y /tmp/xtratiler.deb \
  && rm /tmp/xtratiler.deb \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /store

ENTRYPOINT ["/opt/xtraserver/webapi/bin/xt"]
