#!/bin/bash

mkdir -p /data/pildimaag/code
cd /data/pildimaag/code

git clone -q https://github.com/mitselek/pildimaag.git ./
git checkout -q aysnc-promise
git pull

printf "\n\n"
version=`date +"%y%m%d.%H%M%S"`
docker build --quiet --pull --tag=pildimaag:$version ./ && docker tag pildimaag:$version pildimaag:latest

printf "\n\n"
docker stop pildimaag
docker rm pildimaag
docker run -d \
    --name="pildimaag" \
    --restart="always" \
    --cpu-shares=512 \
    --memory="1g" \
    --env="NODE_ENV=production" \
    --env="VERSION=$version" \
    --env="PM_ENTITY=" \
    --env="PM_KEY=" \
    --env="PM_NIGHT_MINUTES=420" \
    pildimaag:latest
