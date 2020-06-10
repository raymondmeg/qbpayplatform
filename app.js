const Logger = require('tracer').console();
const cors = require('cors');
const AllowOrigins = ['103.94.79.135', 'localhost', 'chrome-extension://'];
const URL = require('url');
const gCache = require('./libs/globalCache');
const uaParser = require('express-useragent');
let createError = require('http-errors');
let express = require('express');
let path = require('path');
let cookieParser = require('cookie-parser');
let logger = require('morgan');

let indexRouter = require('./routes/index');
let BaseApiRouter = require('./routes/BaseApi');
let ppApiRouter = require('./routes/ppapi');
let BackEndApiRouter = require('./routes/BackEndApi');
let app = express();

// view engine setup
app.set('case sensitive routing', false);
app.set('x-powered-by', false);
app.set('strict routing', true);
app.set('trust proxy', true);
app.set('views', path.join(process.cwd(), 'views'));
app.set('view engine', 'pug');

// app.use(logger('common'));
app.use(cors({
  'origin': function (origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    let isOriginAllow = false, ele;
    for (let i = 0; i < AllowOrigins.length; i++) {
      ele = AllowOrigins[i];
      isOriginAllow = (origin.indexOf(ele) !== -1);
      if (isOriginAllow) {
        break;
      }
    }
    if (isOriginAllow) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  "methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
  // "preflightContinue": true,
  optionsSuccessStatus: 204
}));
app.use(cookieParser('qbpayplatform'));
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(express.static(path.join(process.cwd(), 'public')));

app.use(function (req, res, next) {
  let ngixUid, userIp, reqPathWithoutQuery, pathObj;

  try {
    pathObj = URL.parse(req.url);
    reqPathWithoutQuery = pathObj.pathname;
    ngixUid = (req.cookies && req.cookies['uid']) || 'unknown';
    userIp = req.ip;
  } catch (e) {
    ngixUid = "unknown";
    userIp = '127.127.127.127';
    reqPathWithoutQuery = 'blank';
    e = null;
  }
  next();
});
app.use(uaParser.express());

app.use('/', indexRouter);
app.use('/baseapi', BaseApiRouter);
app.use('/ppapi', ppApiRouter);
app.use('/backendapi', BackEndApiRouter);
// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = (process.env.NODE_ENV === 'development') ? err : {};
  Logger.error('Error found ,IP:', req.ip, 'Request Url:', req.url, 'UA:', req.useragent && req.useragent.source);
  Logger.error(err);
  // render the error page
  res.status(err.status || 500);
  res.render('error');
  next = null;
});

module.exports = app;
