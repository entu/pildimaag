FROM node:slim

ADD ./ /pildimaag
RUN mkdir -p /pildimaag/temp

RUN apt-get update && apt-get install -y nodejs npm graphicsmagick
RUN cd /pildimaag && npm install

CMD ["nodejs", "/pildimaag/server.js"]
