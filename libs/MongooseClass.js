/**
 * 连接数据库
 * */

const Logger = require('tracer').console();
let mongoose = require('mongoose');
let gCache = require('./globalCache');
let Configs = require('../configs/MongoDbConfig');
let Models = require('../Models/ModelDefines.js');
let connOpt = {
	useNewUrlParser: true,
	bufferCommands: false,
	useCreateIndex: true,
	autoIndex: true, // build indexes
	autoReconnect: true,
	family: 4,
	appname: 'UniversalPaymentService',
	auto_reconnect: true,
	minSize: 5,
	reconnectTries: Number.MAX_VALUE, // Never stop trying to reconnect
	reconnectInterval: 1000, // Reconnect every 500ms
	poolSize: 10, // Maintain up to 10 socket connections default is 5
	// If not connected, return errors immediately rather than waiting for reconnect
	bufferMaxEntries: 0,
	socketTimeoutMS: 0
};
const BackEndJobs = require('./BackEndJob');
let _ = gCache.loadash;
let backJobs;

mongoose.set('debug', false);     // enable logging collection methods + arguments to the console
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
mongoose.set('useNewUrlParser', true);
mongoose.set('bufferCommands', false);


function BlankFunction(...args) {
}

/*当成功连接到数据库的时候被调用*/
function onMongooseConnected() {
	Logger.info('connect mongodb success.');
	gCache.loadChannelClass();
	createData();
	if (!backJobs) {
		backJobs = new BackEndJobs();
		backJobs.run();
	}
}

/** 增加 原先数据中没有的 末4位 */
function fixLast4Digits() {
	Models.BankCardModel.find({}).exec(function (error, bankDocs) {
		if (error) {
			return;
		}
		bankDocs.forEach(function (doc) {
			if (!doc.last_four_digits) {
				doc.set('last_four_digits', doc.account_no.substr(-4, 4));
			}
			doc.save(function (a, b) {
				a = null;
				b = null;
			})
		})
	})
}

/**创建用户*/
function createData() {
	let UserModel = Models.UserModel;
	UserModel.find({}).exec()
	  .then(function (userDocs) {
		  let insertDocs = [], doc;
		  if (!userDocs || !userDocs.length) {
			  for (let i = 0; i < 15; i++) {
				  doc = new Models.UserModel({
					  user_id: 'u' + _.random(100000, 999999),
					  user_key: gCache.MD5Hash('password' + _.random(100000, 999999)).toString(),
					  nick_name: 'us' + _.random(100000, 999999),
					  business_type: 'us'
				  });
				  insertDocs.push(doc);
			  }
			  for (let p = 0; p < 25; p++) {
				  doc = new Models.UserModel({
					  user_id: 'd' + _.random(100000, 999999),
					  user_key: gCache.MD5Hash('password' + _.random(100000, 999999)).toString(),
					  nick_name: 'ds' + _.random(100000, 999999),
					  business_type: 'ds'
				  });
				  insertDocs.push(doc);
			  }
			  Models.UserModel.insertMany(insertDocs, {ordered: false}, function (error, docs) {
				  if (error) {
					  Logger.error('create users error', error);
					  process.exit(1);
					  return;
				  }
				  gCache.CachedUser = docs;
				  error = null;
				  docs = null;
				  cacheUsers();
			  });

		  } else {
			  userDocs = null;
			  cacheUsers();
		  }
	  })
	  .catch(function (error) {
		  Logger.error('check user collection error:', error);
		  error = null;
	  })
}

/**缓存用户*/
function cacheUsers() {
	let UserModel = Models.UserModel, that = this;
	UserModel.find({}).exec()
	  .then(function (userDocs) {
		  if (!userDocs || !userDocs.length) {
			  return;
		  }
		  gCache.CachedUser = userDocs;
	  })
	  .catch(function (error) {
		  Logger.error('check user collection error:', error);
		  error = null;
	  });
	setTimeout(cacheUsers.bind(that), 300000);
}


if ([1, 2].indexOf(mongoose.connection.readyState) === -1) {
	mongoose.connect(Configs.getMongoConnectionString(), connOpt)
	  .then(onMongooseConnected)
	  .catch(function (error) {
		  if (error) {
			  Logger.error('connect mongodb with error', error.message);
			  process.exit(1);
		  }
	  });
}
module.exports = mongoose;
