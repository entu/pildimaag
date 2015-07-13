# pildimaag

### BUILD, RUN and LOG
- docker kill puhh
- docker rm puhh
- docker build -t mitselek/pildimaag ~/Documents/github/pildimaag/
- docker run -e "PM_ENTITY=155005" -e "PM_KEY=378c2VuY" -e "PM_NIGHT_MINUTES=420" -d --name puhh mitselek/pildimaag:latest
- docker run -e "PM_ENTITY=155005" -e "PM_KEY=378c2VuY" -e "PM_NIGHT_MINUTES=420" -d -v ~/Documents/github/pildimaag/:/pildimaag/ --name puhh mitselek/pildimaag
- docker logs -f puhh

### RESTART and LOG
- docker kill puhh
- docker start puhh
- docker logs -f --tail=15 puhh
