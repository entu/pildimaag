FROM node:10-slim

RUN apt-get update && apt-get install -y --no-install-recommends apt-utils
RUN apt-get install -y graphicsmagick git
RUN apt-get install -y libimage-exiftool-perl

ADD ./ /usr/src/pildimaag
WORKDIR /usr/src/pildimaag
RUN mkdir -p /usr/src/pildimaag/temp

RUN cd /usr/src/pildimaag && npm --production install

CMD ["node", "/usr/src/pildimaag/index.js"]
