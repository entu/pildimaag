# pildimaag [![Codacy Badge](https://api.codacy.com/project/badge/grade/9a178aa013184f8c9493f439d170ab3f)](https://www.codacy.com/app/mihkel-putrinsh/pildimaag)

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

### BUILD, RUN and LOG
- docker kill pildimaag
- docker rm pildimaag
- docker build -t mitselek/pildimaag ~/Documents/github/pildimaag/
- docker run -e "PM_ENTITY=155005" -e "PM_KEY=378c2VuY" -e "PM_NIGHT_MINUTES=420" -d --name pildimaag mitselek/pildimaag:latest
- docker run -e "PM_ENTITY=155005" -e "PM_KEY=378c2VuY" -e "PM_NIGHT_MINUTES=420" -d -v ~/Documents/github/pildimaag/:/pildimaag/ --name pildimaag mitselek/pildimaag
- docker logs -f pildimaag
