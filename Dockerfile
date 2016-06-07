FROM node:6-slim

ADD ./ /usr/src/pildimaag
WORKDIR /usr/src/pildimaag
RUN mkdir -p /usr/src/pildimaag/temp
RUN apt-get update
RUN apt-get install -y graphicsmagick git
RUN apt-get install -y libimage-exiftool-perl
RUN cd /usr/src/pildimaag && npm --production install

CMD ["node", "/usr/src/pildimaag/index.js"]
