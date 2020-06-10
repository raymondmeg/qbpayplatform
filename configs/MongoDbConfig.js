const Configs = {};

/*MongoDb 配置参数*/
const MongoDBConfig = {
	// 'host_name':'127.0.0.1',
	// 'host_port':27017,
	'unix_sock': '/tmp/mongodb-27017.sock',
	'database': 'UniversalPaymentService',
	'user_name': '',
	'user_pass': '',
	'authSource': '',
};

Configs.getMongoConnectionString = function () {
	if (MongoDBConfig.unix_sock) {
		return 'mongodb://' + encodeURIComponent(MongoDBConfig.unix_sock) + '/' + MongoDBConfig.database
	} else {
		return 'mongodb://' + MongoDBConfig.host_name + ':' + MongoDBConfig.host_port + '/' + MongoDBConfig.database
	}
};

Configs.getMongoAuthConnectionString = function () {
	if (MongoDBConfig.unix_sock) {
		return 'mongodb://' + MongoDBConfig.user_name + ':' + MongoDBConfig.user_pass + '@' + encodeURIComponent(MongoDBConfig.unix_sock) + '/' + MongoDBConfig.database + '?authSource=' + MongoDBConfig.authSource;
	} else {
		return 'mongodb://' + MongoDBConfig.user_name + ':' + MongoDBConfig.user_pass + '@' + MongoDBConfig.host_name + ':' + MongoDBConfig.host_port + '/' + MongoDBConfig.database + '?authSource=' + MongoDBConfig.authSource;
	}
};
Configs.MongoDBConfig = MongoDBConfig;
module.exports = Configs;
