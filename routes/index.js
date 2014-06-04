var express = require('express');
var request = require('request');
var uuid = require('node-uuid').v4;
var mysql = require('mysql')
var xml2js = require('xml2js');
var _ = require('underscore')

var logger = require('../logger')
var eve_api = require('../eve_api')

var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
	logger.info('query="%s" : ip="%s"', req.path, req.ip )	
	res.render('index', { section: '', headers: req.headers, request: req } );
});

router.get('/local_render', function(req, res, next) {
	try {
		logger.info('query="%s" : scan="%s" : ip="%s"', req.path, req.query.scan_id, req.ip )
		var coalitions = {
			'HERO' : [ 'Test Alliance Please Ignore', 'Bloodline.', 'Spaceship Samurai', 'Of Sound Mind', 'Brave Collective' ]
		}
		function final( foundSheets, metadata ) {
			var alliances = {};
			var unaligned = {};
			var alliances_to_count = {}
			var corps_to_count = {}
			var ids = {}
			if(metadata.length == 1)
			{
				metadata = metadata[0]
			} else {
				metadata = {}
			}
			for( sheet_idx in foundSheets ) {
				var sheet = foundSheets[sheet_idx];
				if(typeof(sheet.alliance) == "undefined" || ! sheet.alliance ) {
					if( !(sheet.corporation in unaligned) ) {
						unaligned[sheet.corporation] = []
						corps_to_count[sheet.corporation] = 0
					}
					unaligned[sheet.corporation].push(sheet.character);
					corps_to_count[sheet.corporation] = corps_to_count[sheet.corporation] + 1
				} else {
					if(!(sheet.alliance in alliances)) {
						alliances[sheet.alliance] = {}
						alliances_to_count[sheet.alliance] = 0
						ids[sheet.alliance] = sheet.alliance_id
					}
					if(!(sheet.corporation in alliances[sheet.alliance])) {
						alliances[sheet.alliance][sheet.corporation] = []
						corps_to_count[sheet.corporation] = 0
						ids[sheet.corporation] = sheet.corporation_id
					}
					alliances[sheet.alliance][sheet.corporation].push(sheet.character);
					ids[sheet.character] = sheet.character_id
					alliances_to_count[sheet.alliance] = alliances_to_count[sheet.alliance] + 1
					corps_to_count[sheet.corporation] = corps_to_count[sheet.corporation] + 1
				}
			}

			res.render('index', { section: 'local', headers: req.headers, 
				system:req.body.system, 
				scan: {
					alliances:alliances,
					unaligned:unaligned,
					counts: {
						alliances: alliances_to_count,
						corps: corps_to_count
					},
					ids: ids,
					coalitions:coalitions,
					metadata:metadata
				},
				uuid: uuid,
				logger: logger,
				request:req,
				_:_
			} );
		};

		var scan_id = req.query.scan_id
		var scan_query = mysql.format("select c.* from localscan.character_sheets c \
			join localscan.scan_history h on c.character_id = h.character_id where h.scan_id = ?", scan_id)
		mysql_pool.query( scan_query, function( err, sheets ) {
				if(err) {
					next(err)
					return
				}
				var metadata_query = mysql.format("select s.scan_id, m.solarsystemname, s.scan_date from localscan.local_scans s\
					join eveuni.mapSolarSystems m on s.req_system_id = m.solarSystemId\
					where s.scan_id = ?", scan_id)
				mysql_pool.query( metadata_query, function(err, metadata) {
					if(err) {
						next(err)
						return
					}
					final(sheets, metadata)
				})
			}
		)
	} catch(err) {
		next(err)
		return
	}
} );

router.get('/dscan_render', function(req, res) {
	logger.info('query="%s" : scan="%s" : ip="%s"', req.path, req.query.dscan_id, req.ip )

	var lookup_sql = mysql.format("select t.typeName, c.categoryName, g.groupName, r.raceName, d.num " +
		"from localscan.dscan_contents d "+
		"join evedb.invTypes t on t.typeId = d.type_id " +
		"join evedb.invGroups g on t.groupID = g.groupID " +
		"join evedb.invCategories c on g.categoryID = c.categoryID " +
		"left outer join evedb.chrRaces r on t.raceId = r.raceId " +
		"where d.dscan_id = ?", [ req.query.dscan_id ]
	)
	mysql_pool.query( lookup_sql, function(err, results) {
		if(err) {
			throw err
		}
		var scan_results = _.map(results, function(x) { return _.pick(x, [ 'typeName', 'categoryName', 'groupName', 'raceName', 'num']) } )

		var by_category = _.chain(scan_results)
			.groupBy(function(x) {return(x.categoryName)})
			.value()

		var by_cat_group = _.object( _.keys(by_category), _.map( _.values(by_category), function(x) { return _.groupBy(x, function(y) { return y.groupName })}))

		function count_items(list, attrib) {
			return _.chain(list)
				.groupBy(function(x) { return( x[attrib])})
				.pairs()
				.map(function(x) { return [ x[0], _.reduce( x[1], function(x,y) { return x + y.num }, 0 )]})
				.object()
				.value()
		}
		var counts = { 
			category: count_items(scan_results, 'categoryName'),
			group: count_items(scan_results, 'groupName')
		}
		res.render('index', { section: 'dscan', headers: req.headers, 
					system:req.body.system, 
					dscan: by_cat_group,
					counts:counts,
					uuid: uuid,
					logger: logger,
					request:req,
					_:_
				} );	
	} )
})

router.post('/d_scan', function( req, res ) {
	var filter_blank = function(x) { return x.length == 3 }
	var all_scan_results = req.body.dscan.split("\n").map( function(x) { return x.trim().split("\t") }).filter(filter_blank).map( function(x) {
		return { name: x[0], type_name: x[1], distance: x[2] }
	});

	var observed_types = _.countBy(all_scan_results, function(x) { return x.type_name } )
	var lookup_keys = Object.keys(observed_types)
	if(lookup_keys.length == 0) {
		res.redirect('/')
	}

	var lookup_sql = mysql.format("select typeName, typeId from evedb.invTypes t where typeName in (?)", [lookup_keys])

	mysql_pool.query(lookup_sql, function( err, results ) {
		if(err) {
			throw err
		}
		var results_num = _.map( results, function(x) { return [ x.typeId, observed_types[x.typeName]] } )
		eve_api().save_dscan_results(results_num, req.headers.eve_charid, req.headers.eve_solarsystemid, function(dscan_id) {
			logger.info(
					'query="%s" : things="%d" : scan="%s" : ip="%s" : char="%s(%s)" : sys="%s(%s)" : ship : "%s(%s)"', 
					req.path, results_num.length, dscan_id, req.ip,
					req.headers.eve_charname,
					req.headers.eve_charid, 
					req.headers.eve_solarsystemname, 
					req.headers.eve_solarsystemid, 
					req.headers.eve_shipname, 
					req.headers.eve_shiptypeid
			)

			var endpoint = '/dscan_render?section=dscan&dscan_id=' + dscan_id;
			res.redirect(endpoint) 
		})
	})
})

router.post('/local_scan', function(req, res, next) {
	function final(foundSheets, all_characters) {
		if( foundSheets.length == 0 ) {
			res.redirect("/")
			return
		} 
		eve_api().save_scan_results( all_characters, foundSheets, 
					req.headers.eve_solarsystemid, 
					req.headers.eve_charid, 
					req.headers.eve_shiptypeid, 
					function(scan_id) { 
			logger.info(
					'query="%s" : characters="%d" : scan="%s" : ip="%s" : char="%s(%s)" : sys="%s(%s)" : ship : "%s(%s)"', 
					req.path, foundSheets.length, scan_id, req.ip,
					req.headers.eve_charname,
					req.headers.eve_charid, 
					req.headers.eve_solarsystemname, 
					req.headers.eve_solarsystemid, 
					req.headers.eve_shipname, 
					req.headers.eve_shiptypeid
			)

			var endpoint = '/local_render?section=local&scan_id=' + scan_id;
			res.redirect(endpoint) 
		});
	}
	var all_characters = req.body.scan.split("\n").map( function(x) { return x.trim().toUpperCase() }).filter( function(x) { return x.length > 0 });
	if( all_characters.length == 0 ) {
		logger.info('query="%s" : empty-scan : ip="%s"', req.path, req.query.scan_id, req.ip )

		res.redirect('/')
		return;
	}
	try {
		eve_api().get_character_sheets(all_characters, final)
	} catch(err) {
		next(err)
	}
});

module.exports = router;
