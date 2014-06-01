var express = require('express');
var path = require('path');
var favicon = require('static-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var bootstrap = require('bootstrap3-stylus')
var nib = require('nib');
var stylus = require('stylus');
var mysql = require('mysql');

var routes = require('./routes/index');
var initdb = require('./initdb')
var config = require('./config')
var logger = require('./logger')

var app = express();
app.listen(config.http.port);

mysql_pool = mysql.createPool( config.mysql );

initdb(mysql_pool).initialize_tables( function(e, r) {
    var errors = []

    for(var table in e) {
        if( e[table] && "errno" in e[table] )
            errors.push("Unable to build table " + table + ", error: " + JSON.stringify(e[table].code))
    }
    if(errors.length > 0)
        throw "Unable to init all tables: " + JSON.stringify(errors)

    logger.info('all database tables ready')
})

function compile(str, path) {
  return stylus(str)
    .set('filename', path)
    .use(nib())
    .import('nib')
    .use(bootstrap())
}

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(favicon());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(stylus.middleware({src: path.join(__dirname, 'public'), compile: compile}));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);

/// catch 404 and forwarding to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

/// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

logger.info('Started')

module.exports = app;
