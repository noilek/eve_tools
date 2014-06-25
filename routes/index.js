var express = require('express');
var request = require('request');
var uuid = require('node-uuid').v4;
var mysql = require('mysql')
var xml2js = require('xml2js');
var _ = require('underscore')
var numeral = require('numeral')
var moment = require('moment')
var logger = require('../logger')
var eve_api = require('../eve_api')

var router = express.Router();

function render(what, res, req, additional_params) {
	var extended_params = _.extend(additional_params, {
		_:_,
		uuid: uuid,
		logger: logger,
		request:req,
		numeral:numeral,
		moment:moment
	})
	res.render(what, extended_params)
}
/* GET home page. */
router.get('/', function(req, res) {
	logger.info('query="%s" : ip="%s"', req.path, req.ip )	
	render('index', res, req, { section: '' } );
});

router.get('/local_render', function(req, res, next) {
	try {
		logger.info('query="%s" : scan="%s" : ip="%s"', req.path, req.query.scan_id, req.ip )
		var alliCoa = {
			'Test Alliance Please Ignore': 'HERO',
			'Test Friends Please Ignore': 'HERO',
			'Goonswarm Federation': 'CFC',
			'RAZOR Alliance': 'CFC',
			'Fidelas Constans': 'CFC',
			'Fatal Ascension': 'CFC',
			'Nulli Secunda': 'N3',
			'Pandemic Legion': 'PL',
			'Get Off My Lawn': 'CFC',
			'Northern Coalition.': 'N3',
			'Curatores Veritatis Alliance': 'Provi',
			'Tactical Narcotics Team': 'CFC',
			'Yulai Federation': 'Provi',
			'Nexus Fleet': 'N3',
			'The Initiative.': 'CFC',
			'Silent Infinity': 'Provi',
			'Apocalypse Now.': 'Provi',
			'Executive Outcomes': 'CFC',
			'Initiative Mercenaries': 'CFC',
			'The Volition Cult': 'Provi',
			'The Unthinkables': 'N3',
			'HUN Reloaded': 'N3',
			'Darkspawn.': 'N3',
			'The Kadeshi': 'N3',
			'Pangu': 'N3',
			'Nulli Tertius': 'N3',
			'Sev3rance': 'Provi',
			'Circle-Of-Two': 'CFC',
			'Caladrius Alliance': 'N3',
			'The Fourth District': 'Provi',
			'Sanctuary Pact': 'Provi',
			'I Whip My Slaves Back and Forth': 'CFC',
			'TSOE Consortium': 'Provi',
			'Echoes of Nowhere': 'N3',
			'Care Factor': 'Provi',
			'Of Sound Mind': 'HERO',
			'Fear My Baguette': 'Provi',
			'Brave Collective': 'HERO',
			'Spaceship Samurai': 'HERO',
			'SpaceMonkey\'s Alliance': 'CFC',
			'Gentlemen\'s Agreement': 'CFC',
			'DARKNESS.': 'N3',
			'No Safe Haven': 'Provi',
			'Bloodline.': 'HERO',
			'Gun Fun Alliance': 'Provi',
			'Fraternity.': 'N3',
			'WAFFLES.': 'PL',
			'The Bastion': 'CFC',
        }	
		var coalitions = {}

		for( alliance in alliCoa ) {
			var coalition = alliCoa[alliance]
			if(coalition in coalitions) {
				coalitions[coalition].push(alliance)
			} else {
				coalitions[coalition] = [ alliance ]
			}
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
			var coalition_counts = _.chain(coalitions)
				.pairs()
				.map( function(x) { 
					return [ x[0], _.chain(x[1])
									.map(function(x) { return alliances_to_count[x] })
									.reduce(function(a,b) { if(b) { return a+b } else { return a }}, 0)
									.value()
							]
				})
				.filter(function(x) { return x[1] > 0 } )
				.object()
				.value()
			render('index', res, req, { 
				section: 'local',
				system:req.body.system, 
				scan: {
					alliances:alliances,
					unaligned:unaligned,
					counts: {
						alliances: alliances_to_count,
						corps: corps_to_count,
						coalitions:coalition_counts
					},
					ids: ids,
					coalitions:coalitions,
					metadata:metadata
				},
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
					join evedb.mapSolarSystems m on s.req_system_id = m.solarSystemId\
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

router.get('/dscan_render', function(req, res, next) {
	logger.info('query="%s" : scan="%s" : ip="%s"', req.path, req.query.dscan_id, req.ip )

	var lookup_sql = mysql.format("select t.typeName, c.categoryName, g.groupName, r.raceName, d.num " +
		"from localscan.dscan_contents d "+
		"join evedb.invTypes t on t.typeId = d.type_id " +
		"join evedb.invGroups g on t.groupID = g.groupID " +
		"join evedb.invCategories c on g.categoryID = c.categoryID " +
		"left outer join evedb.chrRaces r on t.raceId = r.raceId " +
		"where d.dscan_id = ?", [ req.query.dscan_id ]
	)

	var dscan_history_sql = mysql.format("select m.solarsystemname, solarsystem_id, scan_date from localscan.dscan_history h join evedb.mapSolarSystems m on h.solarsystem_id = m.solarSystemId where dscan_id = ?", [ req.query.dscan_id ] )

	mysql_pool.query(dscan_history_sql, function(err, metadata) {
		if(err) {
			next(err)
			return
		}
		if(metadata.length == 1) {
			metadata = metadata[0]
		} else {
			metadata = {}
		}
		mysql_pool.query( lookup_sql, function(err, results) {
			if(err) {
				next(err)
				return
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

			render('index', res, req, { 
				section: 'dscan', 
				system:req.body.system, 
				dscan: by_cat_group,
				counts:counts,
				metadata:metadata
			} );	
		} )
	} )
})

router.post('/d_scan', function( req, res, next ) {
	var solar_system_name = null
	var solar_system_id = null
	var final_func = function( err, results ) {
		if(err) {
			next(err)
			return
		}
		var results_num = _.map( results, function(x) { return [ x.typeId, observed_types[x.typeName]] } )
		eve_api().save_dscan_results(results_num, req.headers.eve_charid, solar_system_id, function(dscan_id, err) {
		if(err) {
			next(err)
			return
		}
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
	} )
	}


	var filter_blank = function(x) { return x.length == 3 }
	var all_scan_results = req.body.dscan.split("\n").map( function(x) { return x.trim().split("\t") }).filter(filter_blank).map( function(x) {
		return { name: x[0], type_name: x[1], distance: x[2] }
	});


	for( scan_index in all_scan_results ) {
		var result = all_scan_results[scan_index]
		if( result.type_name.indexOf('Planet') > -1 ) {
			solar_system_name = result.name.replace( /^(.+)\s[IVX]+$/, '$1' )
		} else if ( result.type_name == 'Moon' || result.type_name == 'Asteroid Belt' ) {
			solar_system_name = result.name.replace( new RegExp( "(.+)\\s[IVX]+\\s-\\s" + result.type_name + "\\s\\d+"), '$1')
		} else if ( result.type_name.indexOf('Sun') > -1 ) {
			solar_system_name = result.name.replace( /^(.+)\s-\sStar$/, '$1')
		}
		if(solar_system_name) {
			break
		}
	}
	logger.info("detected solar system: " + solar_system_name)
	if(! solar_system_name && req.headers.eve_solarsystemid) {
		solar_system_name = req.headers.eve_solarsystemname
		solar_system_id = req.headers.eve_solarsystemid
	} else {
		var old_func = final_func
		final_func = function(err, results) {
			if(err) {
				next(err)
				return
			}
			var solar_system_sql = mysql.format("select solarSystemId from evedb.mapSolarSystems where solarsystemname = ?", [ solar_system_name ])
			mysql_pool.query(solar_system_sql, function(ss_err, ss_results) {
				if(ss_err) {
					next(err)
					return
				}
				solar_system_id = ss_results[0].solarSystemId
				logger.info("got solarSystemId: " +solar_system_id)
				old_func(err,results)
			})
		}
	}

	var observed_types = _.countBy(all_scan_results, function(x) { return x.type_name } )
	var lookup_keys = Object.keys(observed_types)
	if(lookup_keys.length == 0) {
		res.redirect('/')
	}

	var lookup_sql = mysql.format("select typeName, typeId from evedb.invTypes t where typeName in (?)", [lookup_keys])

	mysql_pool.query(lookup_sql, final_func)
})

router.get('/activity', function( req, res, next) {
	logger.info(
			'query="%s" : ip="%s" : char="%s(%s)" : sys="%s(%s)" : ship : "%s(%s)"', 
			req.path, req.ip,
			req.headers.eve_charname,
			req.headers.eve_charid, 
			req.headers.eve_solarsystemname, 
			req.headers.eve_solarsystemid, 
			req.headers.eve_shipname, 
			req.headers.eve_shiptypeid
	)
	logger.info(typeof(req.query.local_page))
	var local_page = req.query.local_page ? parseInt(req.query.local_page): 0
	var dscan_page = req.query.dscan_page ? parseInt(req.query.dscan_page) : 0

	var dscan_query = mysql.format( 'select h.*, m.solarSystemName, c.`character`, c.num from localscan.dscan_history h \
		join ( select dscan_id, count(1) as num from localscan.dscan_contents group by dscan_id ) c \
		on h.dscan_id = c.dscan_id \
		left outer join evedb.mapSolarSystems m \
		on h.solarSystem_Id = m.solarSystemId \
		left outer join localscan.character_sheets c \
		on c.character_id = h.character_id \
		order by scan_date desc\
		limit ?,?', [ dscan_page * 20, (dscan_page + 1) * 20 ] )

	var localscan_query = mysql.format( 'select s.*, m.solarSystemName, c.`character`, h.num from localscan.local_scans s \
		join (select scan_id, count(1) as num from localscan.scan_history h group by scan_id ) h \
		on h.scan_id = s.scan_id \
		left outer join evedb.mapSolarSystems m \
		on s.req_system_id = m.solarSystemId \
		left outer join localscan.character_sheets c \
		on c.character_id = s.req_character_id \
		order by scan_date desc \
		limit ?,?', [ local_page * 20, (local_page + 1)  * 20 ] )

	mysql_pool.query( dscan_query, function(err, dscan_res) {
		if(err) {
			next(err)
			return
		}

		mysql_pool.query( localscan_query, function(err, localscan_res) {
			if(err) {
				next(err)
				return
			}

			render('index', res, req, { 
				section: 'activity', 
				dscan:dscan_res,
				localscan: localscan_res,
				local_page:local_page,
				dscan_page:dscan_page,
				local_next:localscan_res.length == 20,
				dscan_next:dscan_res.length == 20
			} );	
 		})
	})
})
router.get('/blt', function(req, res, next) {
	logger.info(
			'query="%s" : ip="%s" : char="%s(%s)" : sys="%s(%s)" : ship : "%s(%s)"', 
			req.path, req.ip,
			req.headers.eve_charname,
			req.headers.eve_charid, 
			req.headers.eve_solarsystemname, 
			req.headers.eve_solarsystemid, 
			req.headers.eve_shipname, 
			req.headers.eve_shiptypeid
	)

	eve_api().get_player_outposts(function(outposts, err) {
		if(err) {
			next(err)
			return
		}
		eve_api().get_corp_contract_details( '3277664', '0Czu28JuhkAS0cn6ZbmwKcmW6Nu7Z1dmikC3qHVHr9p2mo9ZA590FU7Zq31AgI9D', function( contracts, cache_until, err ) {
			if(err) {
				next(err)
				return
			}

			contracts = _.filter(contracts, function(x) { return x.status == "Outstanding" && x.type == "Courier"})
			var station_ids = []
			for( i in contracts) {
				var contract = contracts[i]
				station_ids.push(contract.startStationID)
				station_ids.push(contract.endStationID)
			}
			var station_query = mysql.format('select stationID, stationName, solarSystemId from evedb.staStations s where s.`stationID` in (?)', [ station_ids ])
			mysql_pool.query(station_query, function(err, result) {
				if(err) {
					next(err)
					return
				}
				var station_map = _.chain(result).map(function(x) { return [ x.stationID, { name: x.stationName, system:x.solarSystemId } ] }).object().value()
				var station_lookup = _.object([station_ids, station_ids])
				for(i in outposts) {
					var outpost = outposts[i]
					station_map[outpost.stationID] = {name: outpost.stationName, system:outpost.solarSystemId}
				}
				contracts.sort(function(a,b) { 
					if( a.startStationID == b.startStationID ) {
						return parseInt(a.reward) < parseInt(b.reward) ? 1 : -1 
					} else {
						return station_map[a.startStationID].name < station_map[b.startStationID].name ? -1 : 1
					}
				} )
				render('index', res, req, { 
					section: 'blt', 
					contracts:contracts,
					station_map:station_map,
					cache_until:cache_until,
				} );	

			})

		})
	})
})
router.post('/local_scan', function(req, res, next) {
	function final(foundSheets, all_characters, err) {
		if(err) {
			next(err)
			return
		}
		if( foundSheets.length == 0 ) {
			res.redirect("/")
			return
		} 
		eve_api().save_scan_results( all_characters, foundSheets, 
					req.headers.eve_solarsystemid, 
					req.headers.eve_charid, 
					req.headers.eve_shiptypeid, 
					function(scan_id, err) { 
			if(err) {
				next(err)
				return
			}
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
	all_characters = _.uniq(all_characters)
	if( all_characters.length == 0 ) {
		logger.info('query="%s" : empty-scan : ip="%s"', req.path, req.query.scan_id, req.ip )

		res.redirect('/')
		return;
	}
	try {
		eve_api().get_character_sheets(all_characters, final)
	} catch(err) {
		next(err)
		return
	}
});

module.exports = router;
