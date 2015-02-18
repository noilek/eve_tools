eve_tools
=========

Tools for eve

Requires node.js, npm, mysql, and the fuzzworks eve data dump loaded into the "evedb" schema in that mysql database.
Will create its own tables in the localscan schema.

You'll want to update configs/ to have a config to point to the mysql database, etc

You'll need to "npm install" to bootstrap, then you can use:
startup.sh <environment>

where <environment> is represented in configs/<environment>.json

Licensed under Mozilla public license 2.0 https://www.mozilla.org/MPL/2.0/
All attributions should be directed to Robert Waugh
