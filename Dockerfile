FROM node:slim

ADD ./ /pildimaag
RUN mkdir -p /pildimaag/temp

RUN apt-get update && apt-get install -y graphicsmagick
RUN cd /pildimaag && npm install

CMD ["node", "/pildimaag/server.js"]
