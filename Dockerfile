# Pull base image.
FROM ubuntu:14.04

MAINTAINER mihkel <michelek@fleep.io>

# Install.
RUN \
    apt-get update

RUN \
    apt-get install -y nodejs npm git && \
    apt-get install -y imagemagic

RUN \
    git clone https://github.com/OkuMuuseum/pildimaag.git && \
    cd pildimaag/ && \
    npm install

RUN \
    ln -s /usr/bin/nodejs /usr/bin/node

ENTRYPOINT ["nodejs", "/pildimaag/server.js"]
