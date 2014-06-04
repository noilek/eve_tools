CREATE TABLE `localscan`.`local_scans` (
  `scan_id` varchar(32) DEFAULT NULL,
  `req_system_id` int DEFAULT NULL,
  `req_character_id` int DEFAULT NULL,
  `req_ship_id` int DEFAULT NULL,
  `scan_date` datetime DEFAULT NULL,
  PRIMARY KEY (`scan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;