CREATE TABLE `localscan`.`scan_history` (
  `scan_id` varchar(32) DEFAULT NULL,
  `character_id` int DEFAULT NULL,
  `scan_date` datetime DEFAULT NULL,
  PRIMARY KEY (`scan_id`, `character_id`),
  KEY `scanId_scan_idx` (`scan_id`),
  KEY `characterId_scan_idx` (`character_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;