CREATE TABLE `localscan`.`character_sheets` (
  `character` varchar(25) DEFAULT NULL,
  `character_id` int DEFAULT NULL,
  `alliance` varchar(50) DEFAULT NULL,
  `alliance_id` int DEFAULT NULL,
  `corporation` varchar(50) DEFAULT NULL,
  `corporation_id` int DEFAULT NULL,
  `retrieved` datetime,
  PRIMARY KEY (`character_id`),
  KEY `characterName_sheets_idx` (`character`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;