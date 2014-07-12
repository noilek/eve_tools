#! /bin/bash
export NODE_ENV=$1
./node_modules/.bin/forever stopall
npm install
./node_modules/.bin/forever --watchIgnore "*.log" --watchIgnore "*.css" --watchIgnore "*.jade" --watchIgnore "*.styl" --watch start app.js
