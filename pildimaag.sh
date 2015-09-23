#!/bin/bash

mkdir -p /data/pildimaag/code
cd /data/pildimaag/code

git clone -q https://github.com/mitselek/pildimaag.git ./
git checkout -q master
git pull
printf "\n\n"

version=`date +"%y%m%d.%H%M%S"`
docker build -q -t pildimaag:$version ./ && docker tag -f pildimaag:$version pildimaag:latest
printf "\n\n"

docker stop pildimaag
docker rm pildimaag
docker run -d \
    --name="pildimaag" \
    --restart="always" \
    --memory="512m" \
    --env="PM_ENTITY=" \
    --env="PM_KEY=" \
    --env="PM_NIGHT_MINUTES=420" \
    pildimaag:latest

docker inspect -f "{{ .NetworkSettings.IPAddress }}" pildimaag
printf "\n\n"
