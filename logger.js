var winston = require('winston');
require('winston-mail').Mail;

console.log(__dirname)
var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({ json: false, timestamp: true }),
    new winston.transports.File({ filename: __dirname + '/debug.log', json: false }),
    new winston.transports.Mail({ 
    	to: "appmonitor@waughonline.com", 
    	from:"appmonitor@waughonline.com", 
    	host: "smtp.gmail.com", 
    	port: 465, 
    	username: "appmonitor@waughonline.com", 
    	password: "appmonitr", 
    	ssl: true,
    	level: 'error'
    })
  ],
  exceptionHandlers: [
    new (winston.transports.Console)({ json: false, timestamp: true }),
    new winston.transports.File({ filename: __dirname + '/exceptions.log', json: false }),
    new winston.transports.Mail({ 
    	to: "appmonitor@waughonline.com", 
    	from:"appmonitor@waughonline.com", 
    	host: "smtp.gmail.com", 
    	port: 465, 
    	username: "appmonitor@waughonline.com", 
    	password: "appmonitr", 
    	ssl: true,
    })
  ],
  exitOnError: false
});

module.exports = logger;