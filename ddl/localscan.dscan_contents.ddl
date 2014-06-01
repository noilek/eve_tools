CREATE TABLE `localscan`.`dscan_contents` (
  `dscan_id` varchar(32) DEFAULT NULL,
  `type_id` int DEFAULT NULL,
  `num` int DEFAULT NULL,
  PRIMARY KEY (`dscan_id`,`type_id`),
  KEY(`dscan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;