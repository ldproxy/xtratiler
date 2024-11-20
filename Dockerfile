FROM node:20 as builder

COPY . /src

RUN cd /src && npm ci && npm run docker



# FROM ubuntu:22.04
FROM nvidia/opengl:1.2-glvnd-runtime

ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=graphics,compat32,utility,display

COPY --from=builder /src/dist/app /app 

RUN apt-get update \
    && apt-get upgrade -y \
    && DEBIAN_FRONTEND="noninteractive" TZ="Europe/Berlin" apt-get install -y \
    tzdata \
    libcurl4 \
    libgl1-mesa-glx \
    libwebp7 \
    libpng16-16 \
    libjpeg-turbo8 \
    libopengl0 \
    libuv1 \
    libicu70 \
    xvfb

WORKDIR /store

ENTRYPOINT ["/app/bin/xt"]
