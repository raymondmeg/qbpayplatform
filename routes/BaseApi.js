/**
 * 基础 API 接口（无需认证）
 * @author Raymond
 * @create 2019/9/2
 */

const EventEmitter = require('events');
const Logger = require('tracer').console({inspectOpt: {showHidden: true, depth: null}});
const ASYNC = require('async');
const QRCode = require('qrcode');
const _ = require('lodash');
const JWT = require('jsonwebtoken');
const generalConfig = require('../configs/general.js');
let express = require('express');
let URL = require('url');
let FS = require('fs');
let BaseApiRouter = express.Router();
let gCache = require('../libs/globalCache');
let Models = require('../Models/ModelDefines.js');
let multer = require('multer');
let upload = multer();

/* GET home page. */
BaseApiRouter.get('/', function (req, res, next) {
	res.render('index', {title: 'BackEnd Page'});
});

/** 获取验证码、获取密码接口 */
BaseApiRouter.route('/user/getsmscode/:userId/:purpose')
  .get(function (req, res, next) {
	  let userId = req.params['userId'];          //用户手机
	  let purpose = req.params['purpose'];        //用途（auth 还是 login）
	  let resObj, authCode, smsObj;

	  //发送短信功能函数
	  function sendSms() {
		  gCache.SendSMS(userId, null, smsObj)
			.then(function (aliRes) {
				if (aliRes.Code !== 'OK') {
					Logger.error(aliRes.Code, aliRes);
					resObj = gCache.GenResponseObject(114);
					res.json(resObj);
					return;
				}
				//短信发送成功，写入数据库
				Models.AuthCodeModel.create({
					"auth_code": smsObj.template_data.code,     //短信验证码
					"from": 'system',                           //发送人
					"dest": userId,                             //目标用户，也就是要发送的手机号码
					"purpose": purpose,                         //验证目的
					"code_type": 'sms',                         //验证码类型
					"send_at": new Date()                       //过期时间，如果删除此字段，应该就不过期
				})
				  .then(function (authDocs) {
					  authDocs = null;
					  resObj = gCache.GenResponseObject(0);
					  res.json(resObj);
				  })
				  .catch(function (error) {
					  Logger.error(error);
					  error = null;
					  resObj = gCache.GenResponseObject(1);
					  res.json(resObj);
				  })
			})
			.catch(function (error) {
				Logger.error(error);
				resObj = gCache.GenResponseObject(114);
				res.json(resObj);
			});
	  }

	  if (purpose.toLocaleLowerCase() === 'register') {
		  smsObj = gCache.getSMSTemplateDefine('用户注册验证码');
		  smsObj.template_data.code = gCache.genAuthCode(6);
		  sendSms();
	  } else if (purpose.toLocaleLowerCase() === 'login') {
		  smsObj = gCache.getSMSTemplateDefine('登录确认验证码');
		  smsObj.template_data.code = gCache.genAuthCode(6);
		  Models.UserModel.findOne({'user_id': userId}, function (error, userDoc) {
			  if (error) {
				  Logger.error(error);
				  error = null;
				  resObj = gCache.GenResponseObject(1);
				  res.json(resObj);
				  return;
			  }
			  if (!userDoc || !userDoc.is_enabled) {
				  resObj = gCache.GenResponseObject(108);
				  res.json(resObj);
				  return;
			  }
			  sendSms();
		  });
	  } else {
		  resObj = gCache.GenResponseObject(102);
		  res.json(resObj);
	  }
  });

/** 用户注册接口 */
BaseApiRouter.route('/user/register/:userId/:authCode/:promoId')
  .get(function (req, res, next) {
	  let userId = req.params['userId'];            //用户手机
	  let authCode = req.params['authCode'];        //验证码
	  let promoId = req.params['promoId'];          //推荐人ID（推荐人手机）
	  let resObj;
	  Models.AuthCodeModel.findOneAndRemove({
		  "dest": userId,
		  "auth_code": authCode,
		  "purpose": "register",
		  "code_type": 'sms'
	  }).exec()
		.then(function (authCodeDoc) {
			if (!authCodeDoc) {
				resObj = gCache.GenResponseObject(111);
				res.json(resObj);
				return;
			}

			Models.UserModel.findOne({'user_id': promoId}, function (error, promoUser) {
				if (error) {
					Logger.error(error);
					error = null;
					resObj = gCache.GenResponseObject(1);
					res.json(resObj);
					return;
				}
				if (!promoUser) {
					resObj = gCache.GenResponseObject(115);
					res.json(resObj);
					return;
				}
				/** 推荐人存在，验证码正确，允许注册*/
				Models.UserModel.findOneAndUpdate({'user_id': userId}, {
					'$set': {'user_id': userId},
					'$setOnInsert': {
						'user_key': gCache.genAuthCode(8),         //用户的key ，代密码
						'nick_name': '用户' + userId.slice(-8),             //用户昵称
						'group_id': promoId,                             //用户组ID
						'top_up_rate': 1.01,                             //用户充值费率
						'balance': 0,                                    //用户账户余额
						'cash_rate': 0.8,                                //用户渠道结算费率
						'is_enabled': true,                              //是否启用
						'business_type': 'paofeng'
					}
				}, {'new': true, 'upsert': true}).exec()
				  .then(function (userDoc) {
					  resObj = gCache.GenResponseObject(0);
					  resObj.session_token = gCache.makeUserJWTToken(userDoc);
					  res.json(resObj);
					  //计算推荐人推荐的数目
					  Models.UserModel.find({'group_id': promoId}, function (error, userPromoted) {
						  if (error) {
							  Logger.error(error);
							  error = null;
							  promoUser = null;
							  return;
						  }
						  if (!userPromoted || userPromoted.length < 10) {
							  userPromoted = null;
							  promoUser = null;
							  return;
						  }
						  //推荐数量达到10个及以上。调整充值比例
						  userPromoted = null;
						  if (promoUser.top_up_rate !== 1.015) {
							  promoUser.set('top_up_rate', 1.015);
						  }
						  promoUser.save(function (error, saved) {
							  if (error) {
								  Logger.error(error);
								  error = null;
								  return;
							  }
							  saved = null;
							  promoUser = null;
						  });
					  });
				  })
				  .catch(function (error) {
					  Logger.error(error);
					  error = null;
					  resObj = gCache.GenResponseObject(1);
					  res.json(resObj);
				  })
			});
		})
		.catch(function (error) {
			Logger.error(error);
			error = null;
			resObj = gCache.GenResponseObject(1);
			res.json(resObj);
		})
  });

/** 用户登录接口 */
BaseApiRouter.route('/user/login/:userId/:authCode')
  .get(function getUserLoginWithIdAndPassword(req, res, next) {
	  let userId = req.params['userId'];
	  let authCode = req.params['authCode'];
	  let resObj;
	  Models.AuthCodeModel.findOneAndRemove({
		  "dest": userId,
		  "auth_code": authCode,
		  "purpose": "login",
		  "code_type": 'sms'
	  }).exec()
		.then(function (authCodeDoc) {
			Models.UserModel.findOne({'user_id': userId,}).exec()
			  .then(function (userDoc) {
				  if (!userDoc || !userDoc.is_enabled) {
					  resObj = gCache.GenResponseObject(108);
					  res.json(resObj);
					  return;
				  }
				  resObj = gCache.GenResponseObject(0);
				  resObj.session_token = gCache.makeUserJWTToken(userDoc);
				  res.json(resObj);
			  })
			  .catch(function (error) {
				  Logger.error(error);
				  error = null;
				  resObj = gCache.GenResponseObject(1);
				  res.json(resObj);
			  })
		})
		.catch(function (error) {
			Logger.error(error);
			error = null;
			resObj = gCache.GenResponseObject(1);
			res.json(resObj);
		})
  });

/** 用户退出登录接口 */
BaseApiRouter.route('/user/logout/:userId/')
  .get(function getUserLogout(req, res, next) {
	  let sesOpt = gCache.getCookieOption();
	  res.clearCookie('login_token', sesOpt);
	  let apiSesOpt = gCache.getCookieOption();
	  delete apiSesOpt.domain;
	  res.clearCookie('login_token', apiSesOpt);
	  let resObj = gCache.GenResponseObject(0);
	  res.json(resObj);
  });

/** 用户ID 到 昵称的映射 */
BaseApiRouter.route('/system/info/userIdInfo')
  .get(function getUserIdInfo(req, res, next) {
	  Models.UserModel.find({}).exec()
		.then(function (userDocs) {
			let resObj = gCache.GenResponseObject(0);
			resObj.data = {};
			userDocs.forEach(function (doc) {
				resObj.data[doc.user_id] = doc.nick_name;
			});
			res.json(resObj);
			userDocs = null;
		})
		.catch(function onUserIdInfoError(findError) {
			Logger.error('', findError);
			let resObj = gCache.GenResponseObject(1);
			res.json(resObj);
			findError = null;
		})
  });

/** 系统的支付通道常量 */
BaseApiRouter.route('/system/info/provide_channels')
  .get(function (req, res, next) {
	  // Logger.info('request ip', req.ip);
	  let resObj = gCache.GenResponseObject(0);
	  resObj.data = {
		  'unionpay': '云闪付',
		  'alipay': '支付宝',
		  'wepay': '微信支付',
		  'onecodepay': '一码付',
		  'ystpay': '易事特支付',
		  'zebrapay': '牛沙支付',
		  'idspay': 'IDS支付',
	  };
	  res.json(resObj);
  });

/** 系统的支付通道 英文类型 到 ID 的映射 */
BaseApiRouter.route('/system/info/channel/type2id')
  .get(function (req, res, next) {
	  // Logger.info('request ip', req.ip);
	  let resObj = gCache.GenResponseObject(0);
	  resObj.data = {};
	  Object.keys(gCache.UPStreamsByChannel).forEach(function (type) {
		  let objClass = gCache.UPStreamsByChannel[type][0];
		  resObj.data[type] = objClass.getClassId();
	  });
	  res.json(resObj);
  });

/** 系统的支付通道 英文类型 到 昵称 的映射 */
BaseApiRouter.route('/system/info/channel/type2name')
  .get(function (req, res, next) {
	  // Logger.info('request ip', req.ip);
	  let resObj = gCache.GenResponseObject(0);
	  resObj.data = {};
	  Object.keys(gCache.UPStreamsByChannel).forEach(function (type) {
		  let objClass = gCache.UPStreamsByChannel[type][0];
		  resObj.data[type] = objClass.getChannelName();
	  });
	  res.json(resObj);
  });

/** 系统的支付通道 id 到 英文类型 的映射 */
BaseApiRouter.route('/system/info/channel/id2type')
  .get(function (req, res, next) {
	  // Logger.info('request ip', req.ip);
	  let resObj = gCache.GenResponseObject(0);
	  resObj.data = {};
	  Object.keys(gCache.UPStreamsById).forEach(function (channelId) {
		  let objClass = gCache.UPStreamsById[channelId];
		  resObj.data[channelId] = objClass.getChannelType();
	  });
	  res.json(resObj);
  });

/** 系统的支付通道 id 到 名称 的映射 */
BaseApiRouter.route('/system/info/channel/id2name')
  .get(function (req, res, next) {
	  // Logger.info('request ip', req.ip);
	  let resObj = gCache.GenResponseObject(0);
	  resObj.data = {};
	  Object.keys(gCache.UPStreamsById).forEach(function (channelId) {
		  let objClass = gCache.UPStreamsById[channelId];
		  resObj.data[channelId] = objClass.getChannelName();
	  });
	  res.json(resObj);
  });

/** 系统的支付方式常量 */
BaseApiRouter.route('/system/info/provide_pay_types')
  .get(function getUserIdInfo(req, res, next) {
	  // Logger.info('request ip', req.ip);
	  let resObj = gCache.GenResponseObject(0);
	  resObj.data = {
		  'bank_card': '银行卡方式',
		  'alipay': '支付宝',
		  'wepay': '微信支付',
		  'mixed': '聚合支付'
	  };
	  res.json(resObj);
  });

/** 系统的支付状态常量 */
BaseApiRouter.route('/system/info/order_status')
  .get(function getUserIdInfo(req, res, next) {
	  // Logger.info('request ip', req.ip);
	  let resObj = gCache.GenResponseObject(0);
	  resObj.data = {
		  'req_pending': '处理中',
		  'req_faked': '确定刷单',
		  'req_failed': '处理失败',
		  'data_sent': '数据已投递',
		  'generation_error': '产码错误',
		  'client_jumped': '跳转支付App',
		  'qr_scanned': '已扫码',
		  'qr_sent': '码已投递',
		  'paid': '已支付',
		  'timeout': '确认不付',
	  };
	  res.json(resObj);
  });

function getDateString(dateObj) {
	let dateStr = "";
	dateStr += dateObj.getFullYear();
	if (dateObj.getMonth() < 9) {
		dateStr += ("0" + (dateObj.getMonth() + 1));
	} else {
		dateStr += (dateObj.getMonth() + 1);
	}
	if (dateObj.getDate() < 10) {
		dateStr += ("0" + dateObj.getDate());
	} else {
		dateStr += dateObj.getDate();
	}
	return dateStr;
}


/** 客户端提交 未知短信的 接口 */
BaseApiRouter.route('/submit/event/twilioSmsReceived')
  .post(function (req, res) {
	  res.status(200).end();
	  let postData = req.body;
	  // { ToCountry: 'US',
	  //   ToState: 'WA',
	  //   SmsMessageSid: 'SM2e923a03048adc7244c429523e0a6bcb',
	  //   NumMedia: '0',
	  //   ToCity: 'PORT ANGELES',
	  //   FromZip: '',
	  //   SmsSid: 'SM2e923a03048adc7244c429523e0a6bcb',
	  //   FromState: 'GA',
	  //   SmsStatus: 'received',
	  //   FromCity: 'ATLANTA',
	  //   Body: 'just a test ,å æ  æ  è   EUR  / globfone.com',
	  //   FromCountry: 'US',
	  //   To: '+13602072363',
	  //   MessagingServiceSid: 'MG8a809e39e12152abaa2d10fa46be934f',
	  //   ToZip: '98363',
	  //   NumSegments: '1',
	  //   MessageSid: 'SM2e923a03048adc7244c429523e0a6bcb',
	  //   AccountSid: 'AC36ff82a3d99378cf684e1b0ba1892221',
	  //   From: '+14708008754',
	  //   ApiVersion: '2010-04-01' }

	  // Logger.info(req.body);
	  let smsPhoneLogObj = {
		  'mobile_number': postData['From'], 'imei': '', 'slot_number': 1, 'sms_data': postData
	  };
	  let parsedArr = postData['Body'].split(',');
	  if (parsedArr.length !== 2) {
		  return;
	  }
	  smsPhoneLogObj.imei = parsedArr[0];
	  smsPhoneLogObj.slot_number = parsedArr[1];
	  Models.SmsPhoneNumberLogModel.create(smsPhoneLogObj, function (error, smsPhoneLogDoc) {
		  if (error) {
			  Logger.error(error);
			  error = null;
			  return;
		  }
		  smsPhoneLogDoc = null;
	  })
  });

/** 产生 未经加工的 日报表 */
BaseApiRouter.route('/statistics/orders/daily/:day')
  .get(function getRawDailyOrders(req, res, next) {
	  let day = parseInt(req.params['day'], 10);
	  if (isNaN(day)) {
		  res.status(404).send("反正就是一切有错");
		  return;
	  }
	  let startDate, endDate;
	  let todayStart = gCache.getTodayStartDateObj();
	  if (day === 0) {
		  startDate = todayStart;
		  endDate = new Date();
	  } else {
		  startDate = new Date(todayStart.getTime() - day * 86400000);
		  endDate = new Date(startDate.getTime() + 86400000);
	  }

	  function getOCPShops(callback) {
		  Models.OneCodePayShopModel.find({}, function (err, findDocs) {
			  if (err) {
				  err = null;
				  callback(err, null);
			  } else {
				  let obj = {};
				  findDocs.forEach(function (docData) {
					  if (!docData) {
						  return;
					  }
					  obj[docData.shop_id] = docData;
				  });
				  callback(null, obj);
			  }
		  })
	  }

	  function getYSTShops(callback) {
		  Models.YstPayShopModel.find({}, function (err, findDocs) {
			  if (err) {
				  err = null;
				  callback(err, null);
			  } else {
				  let obj = {};
				  findDocs.forEach(function (docData) {
					  if (!docData) {
						  return;
					  }
					  obj[docData.yst_id] = docData;
				  });
				  callback(null, obj);
			  }
		  })
	  }

	  function getUsers(callback) {
		  Models.UserModel.find({}, function (err, findDocs) {
			  if (err) {
				  err = null;
				  callback(err, null);
			  } else {
				  let obj = {};
				  findDocs.forEach(function (docData) {
					  if (!docData) {
						  return;
					  }
					  obj[docData.user_id] = docData;
				  });
				  callback(null, obj);
			  }
		  })
	  }

	  function getOrders(callback) {
		  Models.OrderModel.find({
			  "$and": [
				  {"order_status": "paid"},
				  {"req_time": {$gte: startDate}},
				  {"req_time": {$lt: endDate}},
			  ]
		  }, function (err, findDocs) {
			  err = null;
			  callback(err, (!findDocs || !findDocs.length) ? null : findDocs);
		  })
	  }

	  ASYNC.parallel(
		{'getOCPShops': getOCPShops, 'getYSTShops': getYSTShops, 'getUsers': getUsers, 'getOrders': getOrders},
		function (error, result) {
			let ocpShops = result.getOCPShops;
			let ystShops = result.getYSTShops;
			let users = result.getUsers;
			let ordersArr = result.getOrders;
			if (!ordersArr) {
				ordersArr = [];
			}

			let outPutStr = "用户昵称,通道昵称,物料ID,物料名称,实收金额（分）,时间\n";
			ordersArr.forEach(function (orderDoc) {
				if (!orderDoc) {
					return;
				}
				let lineStr = "",
				  userId = orderDoc.req_from,
				  channelId = orderDoc.assigned_channel,
				  channelAccount = orderDoc.assigned_account,
				  amount = orderDoc.final_paid_number || orderDoc.req_pay_in,
				  orderDate = orderDoc.req_time;

				lineStr += (users[userId].nick_name + ",");         //用户
				lineStr += (users[channelId].nick_name + ",");      //通道
				lineStr += ('"' + channelAccount + '",');             //物料ID
				if (ocpShops[channelAccount]) {
					lineStr += (ocpShops[channelAccount].shop_name + ",");    //物料名称
				} else if (ystShops[channelAccount]) {
					lineStr += (ystShops[channelAccount].shop_name + ",");            //物料名称
				} else {
					lineStr += "未知名称,";            //物料名称
				}

				lineStr += (amount + ",");                //支付金额
				lineStr += (orderDate.toLocaleString("zh-Hans-CN", {
					timeZone: 'Asia/Shanghai',
					'hour12': false
				}).replace(",", ""));
				lineStr += "\n";

				outPutStr += lineStr;
			});
			let fileName = "paid-orders-" + getDateString(startDate) + ".csv";
			FS.writeFile("/tmp/" + fileName, outPutStr, function (writeError) {
				if (writeError) {
					Logger.error(writeError);
					res.status(500).send("Sorry! You can't see that.");
					return;
				}
				res.download("/tmp/" + fileName, fileName, function (err) {
					if (err) {
						next(err);
					}
				});
			});
		}
	  )
  });

/** 产生一个用于客户测试的 各种支付渠道 支付二维码链接 */
BaseApiRouter.route('/demo/qrcode/:channelType/:payType/:amount?')
  .get(function getDemoQrcodeByTypeAndAmount(req, res, next) {
	  let channelType = req.params['channelType'];
	  let payType = req.params['payType'];
	  let amount = Number.parseFloat(req.params['amount']) || 38;
	  let curDate = new Date();
	  let channelClass, channelInst, postData, query = req.query || {};
	  let channelClassArr = gCache.UPStreamsByChannel[channelType];
	  if (!channelClassArr || !channelClassArr.length) {
		  res.status(403).send("功能暂未支持。");
		  return;
	  }
	  /* 选出 通道的 Class*/
	  for (let i = 0; i < channelClassArr.length; i++) {
		  if (gCache.isPayTypeSupport(payType, channelClassArr[i])) {
			  channelClass = channelClassArr[i];
		  }
	  }
	  postData = gCache.UniversalUserPost(Object.assign(query, {
		  'client_id': 'u116632',
		  'request_channel': channelType,
		  'sign': '',
		  'pay_type': payType,
		  'pay_in_number': amount * 100,
		  'inform_url': '',
		  'request_time': curDate.getTime(),
		  'order_id': "test" + curDate.getTime(),
		  'app_data': 'OCP二维码测试使用',
		  "unique_id": (req.cookies && req.cookies['uid']) || 'testuser' + _.random(100000, 999999),
		  "client_ip": req.ip,
		  "gps_city": "深圳市",
		  "interactive": true
	  }));

	  channelInst = new channelClass();
	  channelInst.onGetUpStreamData = function onGetUpStreamDataWhenDemo(err, data) {
		  if (err) {
			  res.status(500).send("服务端接口错误");
			  return;
		  }
		  let fileName;
		  if (data.h5_url) {
			  fileName = 'ocpQrDemo_' + curDate.getTime() + '.png';
			  QRCode.toFile('/tmp/' + fileName, data.h5_url, {width: 230}, function (err) {
				  if (err) {
					  res.status(500).send("服务端接口错误");
					  return;
				  }
				  let htmlCode = '<html>\n' +
					'<body>\n' +
					'<img src = "https://' + generalConfig.front_server_domain + '/download/' + fileName + '" height="250"' +
					'  width="250"' +
					' style="float:middle">' +
					'<h2>长按上方的图片以识别二维码</h2>\n' +
					'<h2>亦可使用支付宝扫码打开</h2>\n' +
					'<h2><a href="' + data.h5_url + '"> 或者点此  ' + data.h5_url + ' 打开</a></h2>\n' +
					'</body>\n' +
					'</html>';
				  res.send(htmlCode);
			  });
			  return;
		  }

		  if (data.qr_url) {
			  fileName = 'ocpQrDemo_' + curDate.getTime() + '.png';
			  QRCode.toFile('/tmp/' + fileName, data.qr_url, {width: 230}, function (err) {
				  if (err) {
					  res.status(500).send("服务端接口错误");
					  return;
				  }
				  let htmlCode = '<html>\n' +
					'<body>\n' +
					'<img src = "https://' + generalConfig.front_server_domain + '/download/' + fileName + '" height="250"' +
					'  width="250"' +
					' style="float:middle">' +
					'<h2>长按上方的图片以识别二维码</h2>\n' +
					'<h2>请使用对应的软件（支付宝或微信）扫码打开</h2>\n' +
					'</body>\n' +
					'</html>';
				  res.send(htmlCode);
			  });
			  return;
		  }
	  };
	  if (channelInst.initData(postData)) {
		  res.status(403).send("参数有错误，比如，不能整数交易，金额太小。。");
		  return;
	  }
	  channelInst.getUpStreamData(postData.pay_type);
  });

/** 短信记录接口 */
BaseApiRouter.route('/sms/log/:phoneNum')
  .get(function getSmsLogByPhoneNum(req, res, next) {
	  res.redirect(302, 'https://www.google.com');
	  next = null;
  })
  .post(function postSmsInfoFromPhone(req, res, next) {
	  // let resObj = gCache.GenResponseObject(0);
	  res.json({"payload": {"success": true, "error": null}});
	  next = null;
	  let sender = req.body['from'];
	  let receiver = req.body['sent_to'];
	  let msgText = req.body['message'];
	  let msgId = req.body['message_id '];
	  let deviceId = req.body['device_id'];
	  let secret = req.body['secret'];
	  let sentTime = req.body['sent_timestamp '];

	  Logger.info(req.body);
  });

module.exports = BaseApiRouter;
