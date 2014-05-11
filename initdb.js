var fs = require('fs')

module.exports = (function(pool) {
	var databases = [
		"localscan"
	]

	var tables = [
		"localscan.character_sheets",
		"localscan.scan_history"
	]

	function readDDL(table) {
		return fs.readFileSync("./ddl/"+table+".ddl", 'utf8')
	}

	return {
		initialize_tables: function(callback) {
			var err = {}, res = {}			
			databases.forEach(function(database) {
				pool.query("create database if not exists ??", database);
			})
			tables.forEach( function( table ) {
				pool.query("select 1 from " + table + " where 1=0", function( e, r ) {
					if(e && e.errno == 1146) {
						var table_ddl = readDDL(table)
						console.log("creating table %s", table)
						pool.query(table_ddl, function( e, r ) {
							err[table] = e
							res[table] = r
							if(Object.keys(res).length == tables.length) {
								callback( err, res )
							}
						})
					} else {
						console.log( "%s already exists", table)
						res[table] = {}
						err[table] = {}
						if(Object.keys(res).length == tables.length) {
							callback( err, res )
						}
					}
				})
			})
		}
	}

})