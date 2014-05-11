var express = require('express');
var request = require('request');
var xml2js = require('xml2js');
var uuid = require('node-uuid').v4;
var md5 = require('MD5');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
	res.render('index', { section: req.query.section, headers: req.headers} );
});

var character_sheets_cache = {};
var local_scan_cache = {}

router.get('/local_render', function(req, res) {
	function final( foundSheets ) {
		var alliances = {};
		var unaligned = {};
		var alliances_to_count = {}
		var corps_to_count = {}
		var ids = {}

		for( sheet_idx in foundSheets ) {
			var sheet = foundSheets[sheet_idx];
			if(typeof(sheet.alliance) == "undefined") {
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

		res.render('index', { section: req.query.section, headers: req.headers, 
			system:req.body.system, 
			scan: {
				alliances:alliances,
				unaligned:unaligned,
				counts: {
					alliances: alliances_to_count,
					corps: corps_to_count
				},
				ids: ids
			},
			uuid: uuid
		} );
	};

	var scan_id = req.query.scan_id

	mysql_pool.query("select c.* from localscan.character_sheets c \
		join localscan.scan_history h on c.character_id = h.character_id where h.scan_id = ?", scan_id, function( err, sheets ) {
			final(sheets);
		}
	)
} );

router.post('/local_scan', function(req, res) {
	function final(foundSheets, sheets_to_cache, all_characters) {
		var scan_date = new Date()
		all_characters.sort()
		var scan_id = md5(all_characters.join())
		sheets_to_cache = sheets_to_cache.map( function(x) { x['retrieved'] = scan_date; return x });
		var scan_rows = sheets_to_cache.map( function(x) { return { character_id: x.character_id, scan_date: scan_date, scan_id: scan_id } });
		mysql_pool.getConnection(function(err, conn) {
			var results = []
			function end( err, query_res ) {
				results.push(query_res)
				if(results.length == sheets_to_cache.length + scan_rows.length) {
					console.log("%d %d %d", results.length, sheets_to_cache.length, scan_rows.length)
					conn.commit(function(err) {
						if(err) {
							conn.rollback();
						}
						conn.release();
						res.redirect('/local_render?section=local&scan_id=' + scan_id)
					});
				}
			}

			conn.beginTransaction(function(err) {
				sheets_to_cache.forEach(function(sheet) {
					conn.query( "insert into localscan.character_sheets set ?", sheet, end );
				} );
				scan_rows.forEach(function(scan_row) {
					console.log("%j", scan_row)
					conn.query( "insert into localscan.scan_history set ?", scan_row, end );
				});
			});
		});
	}

	console.log("Post: %j", req.body )
	var needed_characters = []
	var characterSheets = []
	var all_characters = req.body.scan.split("\n").map( function(x) { return x.trim() });

	if( all_characters.length == 0 ) {
		res.redirect('/?section=local')
	}

	mysql_pool.query("select * from localscan.character_sheets.ddl where characterName in (?)", all_characters, function(e,matched) {
		var character_sheets_cache = {}
		for (rowidx in matched) {
			row = matched[rowidx]
			character_sheets_cache[row.characterName] = row;
		}

		for (char_idx in all_characters) {
			var character = all_characters[char_idx]
			if(character in character_sheets_cache) {
				characterSheets.push(character_sheets_cache[character])
			} else {
				needed_characters.push(character)
			}
		}

		if(needed_characters.length == 0 ) {
			final(characterSheets)
		}

		function chunk(arr, factor) {
			var splitCharacters = []
			arr = arr.slice(0);
			while( arr.length ) {
				splitCharacters.push(arr.slice(0,factor));
				arr.splice(0,factor);
			}
			return(splitCharacters);
		}
		
		var splitCharacters = chunk(needed_characters, 100);

		var pool = { maxSockets: 40 };
		var sheets_to_cache = []
		splitCharacters.forEach(function(split) {
			var requestString = "https://api.eveonline.com/eve/CharacterID.xml.aspx?names=" + encodeURIComponent(split.join());
			var groups = 0;
			request({ pool:pool, url:requestString}, function(err, response, body) {
				console.log("group: " + groups);
				groups = groups + 1;

				xml2js.parseString(body, function( err, character_ids ) {
					if(err) {
						console.log(err);
						console.log(body);
					}
					var charactersToIds = {}
					var idsToCharacters = {}
					var rows = character_ids.eveapi.result[0].rowset[0].row
					var ids = []
					for ( row in rows) {
						var charRow = rows[row]["$"]
						charactersToIds[charRow.name] = charRow.characterID;
						idsToCharacters[charRow.characterID] = charRow.name;
						ids.push(charRow.characterID);
					}

					ids.forEach(function(character_id) {
						var character_sheet_req = "https://api.eveonline.com/eve/CharacterInfo.xml.aspx?characterID=" + character_id;
						console.log("-");
						request({ pool:pool, url: character_sheet_req }, function(err, response, body) {
							console.log("c:" + characterSheets.length/needed_characters.length);
							xml2js.parseString(body, function( err, sheet ) {
								if(!('result' in sheet.eveapi)) {
									all_characters.splice( all_characters.indexOf( idsToCharacters[character_id] ), 1)
								} else {
									sheet = sheet.eveapi.result[0];
									var sheet_data = {
										corporation_id: sheet.corporationID,
										corporation: sheet.corporation,
										alliance_id: sheet.allianceID,
										alliance: sheet.alliance, // ought to add first start date to capture age
										character_id: character_id,
										character: idsToCharacters[character_id]
									}
									sheets_to_cache.push( sheet_data );
									characterSheets.push( sheet_data );
								}
								if(characterSheets.length == all_characters.length) {
									final(characterSheets, sheets_to_cache, all_characters);
								}
							} );
						});
					});
				} );
			});

		} );

	} );
});

module.exports = router;
