# Pull base image.
FROM ubuntu:14.04

MAINTAINER mihkel <michelek@fleep.io>

# Install.
RUN \
    apt-get update && \
    apt-get install -y nodejs npm git && \
    npm install -g nodemon

RUN \
    git clone https://github.com/OkuMuuseum/pildimaag.git && \
    cd pildimaag/ && \
    npm install

ENTRYPOINT nodemon /pildimaag/
