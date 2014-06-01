#! /bin/bash

npm install

./node_modules/.bin/forever --watchIgnore "*.log" --watchIgnore "*.css" --watchIgnore "*.jade" --watchIgnore "*.styl" --watch start app.js
