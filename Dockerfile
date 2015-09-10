FROM node:4.0-slim

ADD ./ /usr/src/pildimaag
RUN mkdir -p /usr/src/pildimaag/temp
RUN apt-get update && apt-get install -y graphicsmagick
RUN cd /usr/src/pildimaag && npm --silent --production install

CMD ["node", "/usr/src/pildimaag/server.js"]
