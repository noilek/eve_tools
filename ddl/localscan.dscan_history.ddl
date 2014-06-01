CREATE TABLE `localscan`.`dscan_history` (
  `dscan_id` varchar(32) DEFAULT NULL,
  `solarsystem_id` int DEFAULT NULL,
  `character_id` int DEFAULT NULL,
  `scan_date` datetime DEFAULT NULL,
  PRIMARY KEY (`dscan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;