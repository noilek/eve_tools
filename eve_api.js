var mysql = require('mysql')
var xml2js = require('xml2js');
var md5 = require('MD5');
var _ = require('underscore')
var request = require('request');
var moment = require('moment')
var logger = require('./logger')

var cached_data = {
	corp_contracts:{}
}

module.exports = (function() {
	var being_cached = null
	function cache_objs_to_db(to_cache, table, cb) {
		mysql_pool.getConnection(function(err, conn) {
			var results = []
			function end( err, query_res ) {
				if(err) {
					conn.rollback()		
					conn.release()	
					err.message = err.message + " (" + being_cached + ")"
					cb(err)
				}
				results.push(query_res)
				if(results.length == to_cache.length) {
					conn.commit(function(err) {
						if(err) {
							conn.rollback()
							conn.release()
							cb(err)
						}
						conn.release();
						cb(err)
					});
				}
			}

			conn.beginTransaction(function(err) {
				if(err) {
					cb(err)
				}
				to_cache.forEach(function(sheet) {					
					var sheet_query = mysql.format("insert into ?? set ?", [ table, sheet ] )
					being_cached = sheet_query
					conn.query( sheet_query, end );
				} );
			});
		});
	}

	return {
		save_scan_results: function(all_characters, foundSheets,  req_system_id, req_character_id, req_ship_id, final) {
			var scan_date =  new Date()
			all_characters.sort()
			var scan_id = md5(all_characters.join() + req_system_id + req_character_id + req_ship_id )
			var exists_query = mysql.format('select count(1) as cnt from localscan.scan_history where scan_id = ?', [ scan_id ])
			mysql_pool.query(exists_query, function(e,r) {
				if(e) {
					final("", e)
				}
				if(r[0].cnt == 0) {
					var local_scan_rows = [ { scan_id:scan_id, req_system_id:req_system_id, req_character_id:req_character_id, req_ship_id:req_ship_id, scan_date: scan_date } ];					
					var scan_rows = foundSheets.map( function(x) { return { character_id: x.character_id, scan_date: scan_date, scan_id: scan_id } });		
					cache_objs_to_db(scan_rows, "localscan.scan_history", function(err) { 
						if(err) {
							final("", err)
							return
						}
						cache_objs_to_db( local_scan_rows, "localscan.local_scans", function(err) { final( scan_id, err ) })
					})
				} else {
					final(scan_id, e)
				}
			})

		},

		save_dscan_results: function(results_num, char_id, solarsystem_id, final) {
			var scan_date = new Date()
			var flat_results = _.map(results_num, function(x) { return x.join() } ).sort().join()
			var dscan_id = md5(flat_results)
			var exists_query = mysql.format('select count(1) as cnt from localscan.dscan_history where dscan_id = ?', [ dscan_id ])
			mysql_pool.query(exists_query, function(e,r) {
				if(r[0].cnt == 0) {
					var dscan_rows = _.map(results_num, function(x) { return { type_id: x[0], num: x[1], dscan_id: dscan_id} })
					var dscan_ent = [ {dscan_id:dscan_id, solarsystem_id:solarsystem_id, character_id:char_id, scan_date:scan_date}]

					cache_objs_to_db(dscan_rows, "localscan.dscan_contents", function(err) { 
						cache_objs_to_db(dscan_ent, "localscan.dscan_history", function(err) { final(dscan_id, err) } )
					} )					
				} else {
					final(dscan_id, e)
				}
			})
		},

		get_player_outposts: function(final) {
			if(! ('outposts' in cached_data) ) {
				var requestString = "https://api.eveonline.com/eve/ConquerableStationList.xml.aspx"
				request({ url:requestString}, function(err, response, body) {
					if(err) {
						final([], err)
					}
					xml2js.parseString(body, function( err, contracts ) {
						if(err) {
							final([], err)
						}				
						var rows = _.map(contracts.eveapi.result[0].rowset[0].row, function(x) { return x['$'] })
						cached_data.outposts = rows
						final(rows, err)
					} )
				} )
			} else {
				final(cached_data.outposts)
			}
		},		

		get_corp_contract_details: function(key_id, vcode, final) {
			var cache_key = key_id + vcode
			var now = new Date()
			if( cache_key in cached_data.corp_contracts && cached_data.corp_contracts[cache_key].cache_until.getTime() > now.getTime()) {
				final(cached_data.corp_contracts[cache_key].data, cached_data.corp_contracts[cache_key].cache_until)
			}
			var requestString = "https://api.eveonline.com/corp/Contracts.xml.aspx?keyID=" + key_id + "&vCode=" + vcode
			request({ url:requestString}, function(err, response, body) {
				if(err) {
					final([], null, err)
				}
				xml2js.parseString(body, function( err, contracts ) {
					if(err) {
						final([], null, err)
					}	
					var cached_until = moment.utc(contracts.eveapi.cachedUntil, "YYYY-MM-DD HH:mm:ss")
					//var foo = cached_until.format()
					var cached_date = cached_until.clone().toDate()
					var rows = _.map(contracts.eveapi.result[0].rowset[0].row, function(x) { return x['$'] })
					cached_data.corp_contracts[cache_key] = {
						cache_until:cached_date,
						data:rows
					}
					cached_data.corp_contracts[cache_key].cache_until = cached_date
					final(rows, cached_date, err)
				} )
			} )
		},
		get_character_sheets: function (all_characters, final) {
			var needed_characters = [], 
				characterSheets = [],
				sheets_to_cache = [],
				character_sheets_cache = {};

			var cache_cut_off = new Date()
			cache_cut_off.setTime( cache_cut_off.getTime() - 7 * 24 * 60 * 60 * 1000 )
			var characters_query = mysql.format("select c.* from localscan.character_sheets c where `character` in (?)", 
				[ all_characters])

			mysql_pool.query(characters_query, function(e,matched) {
				if(e) {
					final([], [], e)
				}
				for (rowidx in matched) {
					row = matched[rowidx]
					character_sheets_cache[row.character.toUpperCase()] = row;
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
					final(characterSheets, all_characters, e);
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
				splitCharacters.forEach(function(split) {
					var requestString = "https://api.eveonline.com/eve/CharacterID.xml.aspx?names=" + encodeURIComponent(split.join());
					var groups = 0;
					request({ pool:pool, url:requestString}, function(err, response, body) {
						groups = groups + 1;

						xml2js.parseString(body, function( err, character_ids ) {
							if(err) {
								final([], [], err)
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
								request({ pool:pool, url: character_sheet_req }, function(err, response, body) {
									xml2js.parseString(body, function( err, sheet ) {
										if(err) {
											final([],[],err)
										}
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
											var scan_date = new Date()
											sheets_to_cache = sheets_to_cache.map( function(x) { x['retrieved'] = scan_date; return x });
											cache_objs_to_db(sheets_to_cache, 'localscan.character_sheets', function(err) {
												final(characterSheets, all_characters, err);
											} );
										}
									} );
								});
							});
						} );
					});
				} );
			});
		}
	}
} );