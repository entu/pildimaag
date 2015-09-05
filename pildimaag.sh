#!/bin/bash

mkdir -p /data/pildimaag/code
cd /data/pildimaag/code

git clone https://github.com/mitselek/pildimaag.git ./
git checkout master
git pull

version=`date +"%y%m%d.%H%M%S"`

docker build -q -t pildimaag:$version ./ && docker tag -f pildimaag:$version pildimaag:latest
docker kill pildimaag
docker rm pildimaag
docker run -d \
    --name="pildimaag" \
    --restart="always" \
    --memory="256m" \
    --env="PM_ENTITY=" \
    --env="PM_KEY=" \
    --env="PM_NIGHT_MINUTES=420" \
    pildimaag:latest
