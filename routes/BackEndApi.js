/**
 * 后台 需要 用户认证 的接口
 * @author Raymond
 * @create 2019/9/1
 */

const Logger = require('tracer').console({inspectOpt: {showHidden: true, depth: null}});
const ASYNC = require('async');
const _ = require('lodash');
const JWT = require('jsonwebtoken');
const FS = require('fs');
const PATH = require('path');
const generalConfig = require('../configs/general.js');
let express = require('express');
let URL = require('url');
let BackEndApiRouter = express.Router();
let gCache = require('../libs/globalCache');
let Models = require('../Models/ModelDefines.js');
let multer = require('multer');
let upload = multer();
let httpRequest = require('request');

const BankMarkMap = gCache.BankMarkToNameMap;

/**
 * 路由中间函数，确认用户是否已经登录，是否平台的注册用户
 * */
function _isUserLogin(req, res, next) {
	let resObj = null, that = this, userAgent = req.headers['user-agent'];
	let sessionToken = req.headers['session_token'];
	if (!sessionToken) {
		//如果用户没有送 token
		resObj = gCache.GenResponseObject(2);
		res.json(resObj);
		return;
	}
	let decoded, userId;

	try {
		decoded = JWT.verify(sessionToken, gCache.getJwtPrivateKey());
	} catch (err) {
		Logger.debug('JWT Token error', err);
	}
	if (!decoded) {
		//如果token 不合法，跳转登录
		resObj = gCache.GenResponseObject(2);
		res.json(resObj);
	} else {
		//token 合法，token中的用户名和cookie里的用户名也一致。接下去，我们检查用户账户的情况
		userId = decoded.user_id;
		let userDoc = gCache.findOneUserById(userId);

		if (!userDoc || !userDoc.is_enabled) {
			//此用户名的账户找不到，可能已经删除，或者已经被禁用 ，跳转登录
			resObj = gCache.GenResponseObject(2);
			res.json(resObj);
			return;
		}

		req.login_token = decoded;
		req.userDoc = userDoc;
		req.isAdmin = (userDoc.business_type === 'admin');
		next();
	}
}

BackEndApiRouter.use(_isUserLogin);

/* GET home page. */
BackEndApiRouter.get('/', function (req, res, next) {
	res.render('index', {title: 'BackEnd Page'});
});

/** token refresh */
BackEndApiRouter.route('/token/refresh')
  .get(function (req, res, next) {
	  let resObj = gCache.GenResponseObject(0);
	  resObj.session_token = gCache.makeUserJWTToken(req.userDoc);
	  res.json(resObj);
  });

/** 获取用户信息 */
BackEndApiRouter.route('/user/detail')
  .get(function (req, res, next) {
	  let userId = req.userDoc.user_id, resObj;
	  Models.UserModel.findOne({'user_id': userId}, function (error, userDoc) {
		  if (error) {
			  Logger.error(error);
			  error = null;
			  resObj = gCache.GenResponseObject(1);
			  res.json(resObj);
			  return;
		  }
		  if (!userDoc || !userDoc.is_enabled) {
			  //此用户名的账户找不到，可能已经删除，或者已经被禁用
			  resObj = gCache.GenResponseObject(108);
			  res.json(resObj);
			  return;
		  }
		  resObj = gCache.GenResponseObject(0);
		  resObj.user_info = {
			  'user_id': userDoc.user_id,              //用户ID ,可以是手机号码
			  'nick_name': userDoc.nick_name,          //用户昵称
			  'group_id': userDoc.group_id,            //用户组ID
			  'top_up_rate': userDoc.top_up_rate,      //用户充值费率
			  'balance': userDoc.balance,              //用户账户余额
			  'cash_rate': userDoc.cash_rate,          //用户提现费率
		  };
		  res.json(resObj);
	  })
  });

/** 银行卡维护接口 */
BackEndApiRouter.route('/bankcards/:userId?/:cardNo?')
  /*查询*/
  .get(function getBankCardsWithUserIdAndCardNo(req, res, next) {
	  let userId = req.params['userId'] || 'default';
	  let cardNo = req.params['cardNo'];
	  let groupId = req.userDoc.group_id;
	  let userType = req.userDoc.business_type;
	  let queryObj = userType !== 'admin' ? {'bind_user_id': groupId} : {};
	  let _page = 1, _limit = 100;
	  if (req.query) {
		  _page = req.query['page'] || _page;
		  _limit = req.query['limit'] || _limit;
	  }
	  _page = parseInt(_page, 10) - 1;
	  _limit = parseInt(_limit, 10);
	  _limit = Math.min(_limit, 200);
	  if (cardNo) {
		  queryObj.account_no = cardNo;
		  _page = 0;
	  }
	  Models.BankCardModel.find(queryObj).sort({'createdAt': -1}).skip(_page * _limit).limit(_limit).exec()
		.then(function (bankCardsDoc) {
			let resObj = gCache.GenResponseObject(0);
			resObj.total = 300;
			resObj.page = _page;
			resObj.limit = _limit;
			resObj.data = bankCardsDoc.map(function (cardDoc) {
				return cardDoc.toObject({'versionKey': false});
			});
			res.json(resObj);
			bankCardsDoc = null;
		})
		.catch(function (findError) {
			let resObj = gCache.GenResponseObject(1);
			res.json(resObj);
			Logger.debug(findError);
		})
  })
  /*增加*/
  .post(function postBankCardsWithUserIdAndCardNo(req, res, next) {
	  let groupId = req.userDoc.group_id;
	  let postData = req.body, resObj;
	  if (!postData || !postData.bank_mark || !postData.account_name || !postData.account_no || !postData.bind_mobile) {
		  resObj = gCache.GenResponseObject(101);
		  res.json(resObj);
		  return;
	  }
	  postData.bank_name = postData.bank_name || BankMarkMap[postData.bank_mark];
	  Models.BankCardModel.create({
		  'bank_name': postData.bank_name,                                   //银行名称
		  'bank_mark': postData.bank_mark,                                   //银行代码
		  'account_name': postData.account_name,                                //银行账户名
		  'account_no': postData.account_no,                      //银行账号
		  'bind_mobile': postData.bind_mobile,                                 //绑定的手机
		  'is_enable': postData.is_enable !== undefined ? postData.is_enable : true,                                                //
		  'single_trade_min': postData.single_trade_min !== undefined ? postData.single_trade_min : 20000,
		  'single_trade_max': postData.single_trade_max !== undefined ? postData.single_trade_max : 500000,
		  'daily_trade_min': postData.daily_trade_min !== undefined ? postData.daily_trade_min : 0,
		  'daily_trade_max': postData.daily_trade_max !== undefined ? postData.daily_trade_max : 5000000,
		  'monthly_trade_min': postData.monthly_trade_min !== undefined ? postData.monthly_trade_min : 0,
		  'monthly_trade_max': postData.monthly_trade_max !== undefined ? postData.monthly_trade_max : 200000000,
		  'working_start_hour': !isNaN(postData.working_start_hour) ? postData.working_start_hour : 0,
		  'working_end_hour': !isNaN(postData.working_end_hour) ? postData.working_end_hour : 86400000,
		  'bind_user_id': groupId,
		  'priority': !isNaN(postData.priority) ? postData.priority : 100,
		  'last_four_digits': postData.account_no.substr(-4, 4)
	  }, function (createErr, createDoc) {
		  let resObj;
		  if (createErr) {
			  resObj = gCache.GenResponseObject(1);
			  res.json(resObj);
			  createErr = null;
			  return;
		  }
		  resObj = gCache.GenResponseObject(0);
		  resObj.data = createDoc.toObject({'versionKey': false});
		  res.json(resObj);
		  createDoc = null;
	  })
  })
  /*修改*/
  .put(function modifyBankCardsWithUserIdAndCardNo(req, res, next) {
	  let userId = req.params['userId'] || 'default';
	  let groupId = req.userDoc.group_id;
	  let postData = req.body, resObj;
	  if (!postData) {
		  //没有东西可以更新
		  resObj = gCache.GenResponseObject(0);
		  res.json(resObj);
		  return;
	  }
	  let cardNo = req.params['cardNo'] || postData['account_no'];

	  Models.BankCardModel.findOne({'account_no': cardNo, 'bind_user_id': groupId}).exec(function (findErr, cardDoc) {
		  if (findErr) {
			  Logger.debug(findErr);
			  resObj = gCache.GenResponseObject(1);
			  res.json(resObj);
			  return;
		  }
		  if (!cardDoc) {
			  resObj = gCache.GenResponseObject(205);
			  res.json(resObj);
			  return;
		  }
		  /*不允许更新的属性*/
		  const forbbidenProp = [
			  'bind_user_id', 'account_no', 'account_name'
		  ];
		  /*本地更新并校验*/
		  Object.keys(postData).forEach(function (propertyStr) {
			  if (forbbidenProp.indexOf(propertyStr) !== -1) {
				  return;
			  }
			  if (postData[propertyStr] === undefined || postData[propertyStr] === null) {
				  return;
			  }
			  cardDoc.set(propertyStr, postData[propertyStr], {'strict': true});
		  });
		  /*写入服务器*/
		  cardDoc.save(function (saveError, savedDoc) {
			  if (saveError) {
				  Logger.debug(saveError);
				  resObj = gCache.GenResponseObject(1);
			  } else {
				  resObj = gCache.GenResponseObject(0);
			  }
			  if (savedDoc) {
				  resObj.data = savedDoc.toObject({'versionKey': false});
			  }
			  res.json(resObj);
			  savedDoc = null;
		  });
		  cardDoc = null;
	  })
  })
  /*删除*/
  .delete(function delBankCardsWithUserIdAndCardNo(req, res, next) {
	  //todo ：删除功能的实现
	  let resObj = gCache.GenResponseObject(11);
	  res.json(resObj);
  });

/** 一码付商铺 维护接口 */
BackEndApiRouter.route('/ocpshop/:userId?/:shopId?')
  /*查询*/
  .get(function getOcpShopWithUserIdAndCardNo(req, res, next) {
	  let shopId = req.params['shopId'];
	  let groupId = req.userDoc.group_id;
	  let userType = req.userDoc.business_type;
	  let queryObj = userType !== 'admin' ? {'ds_user_id': groupId} : {};
	  let _page = 1, _limit = 100;
	  if (req.query) {
		  _page = req.query['page'] || _page;
		  _limit = req.query['limit'] || _limit;
	  }
	  _page = parseInt(_page, 10) - 1;
	  _limit = parseInt(_limit, 10);
	  _limit = Math.min(_limit, 200);
	  if (shopId) {
		  queryObj.shop_id = shopId;
		  _page = 0;
	  }
	  Models.OneCodePayShopModel.find(queryObj).sort({'createdAt': -1}).skip(_page * _limit).limit(_limit).exec()
		.then(function (ocpUsersDoc) {
			let resObj = gCache.GenResponseObject(0);
			resObj.total = 300;
			resObj.page = _page;
			resObj.limit = _limit;
			resObj.data = ocpUsersDoc.map(function (ocpUserDoc) {
				return ocpUserDoc.toObject({'versionKey': false});
			});
			res.json(resObj);
			ocpUsersDoc = null;
		})
		.catch(function (findError) {
			let resObj = gCache.GenResponseObject(1);
			res.json(resObj);
			Logger.debug(findError);
		})
  })
  /*增加*/
  .post(function postOcpShopWithUserIdAndCardNo(req, res, next) {
	  let groupId = req.userDoc.group_id;
	  let postData = req.body, resObj;
	  if (!postData || !postData.shop_id || !postData.shop_name || !postData.shop_industry) {
		  resObj = gCache.GenResponseObject(101);
		  res.json(resObj);
		  return;
	  }
	  Models.OneCodePayShopModel.create({
		  'ds_user_id': groupId,                      //属于下游哪个客户
		  'shop_id': postData.shop_id,                         //店铺号
		  'shop_name': postData.shop_name,                       //店铺名称
		  'shop_industry': postData.shop_industry,                   //店铺所属行业
		  'shop_city': postData.shop_city,                   //店铺所属城市
		  'single_trade_min': isNaN(postData.single_trade_min) ? 0 : parseInt(postData.single_trade_min, 10),   //单笔交易最小值
		  'single_trade_max': isNaN(postData.single_trade_max) ? 500000 : parseInt(postData.single_trade_max, 10),//单笔交易最大值
		  'daily_trade_max': isNaN(postData.daily_trade_max) ? 5000000 : parseInt(postData.daily_trade_max, 10), //每日最大交易额
		  'working_start_hour': !isNaN(postData.working_start_hour) ? postData.working_start_hour : 0,
		  'working_end_hour': !isNaN(postData.working_end_hour) ? postData.working_end_hour : 86400000,
		  'priority': !isNaN(postData.priority) ? postData.priority : 100,
		  'is_enable': postData.is_enable !== undefined ? postData.is_enable : true
	  }, function (createErr, createDoc) {
		  let resObj;
		  if (createErr) {
			  resObj = gCache.GenResponseObject(1);
			  res.json(resObj);
			  Logger.error(createErr);
			  createErr = null;
			  return;
		  }
		  resObj = gCache.GenResponseObject(0);
		  resObj.data = createDoc.toObject({'versionKey': false});
		  res.json(resObj);
		  createDoc = null;
	  })
  })
  /*修改*/
  .put(function modifyBankCardsWithUserIdAndCardNo(req, res, next) {
	  let userId = req.params['userId'] || 'default';
	  let groupId = req.userDoc.group_id;
	  let postData = req.body, resObj;
	  if (!postData) {
		  //没有东西可以更新
		  resObj = gCache.GenResponseObject(0);
		  res.json(resObj);
		  return;
	  }
	  let shopId = req.params['shopId'] || postData['shop_id'];

	  Models.OneCodePayShopModel.findOne({
		  'shop_id': shopId,
		  'ds_user_id': groupId
	  }).exec(function (findErr, ocpShopDoc) {
		  if (findErr) {
			  Logger.error(findErr);
			  resObj = gCache.GenResponseObject(1);
			  res.json(resObj);
			  return;
		  }
		  if (!ocpShopDoc) {
			  resObj = gCache.GenResponseObject(207);
			  res.json(resObj);
			  return;
		  }
		  /*不允许更新的属性*/
		  const forbbidenProp = [
			  'ds_user_id', 'shop_id'
		  ];
		  /*本地更新并校验*/
		  Object.keys(postData).forEach(function (propertyStr) {
			  if (forbbidenProp.indexOf(propertyStr) !== -1) {
				  return;
			  }
			  if (postData[propertyStr] === undefined || postData[propertyStr] === null) {
				  return;
			  }
			  ocpShopDoc.set(propertyStr, postData[propertyStr], {'strict': true});
		  });
		  /*写入服务器*/
		  ocpShopDoc.save(function (saveError, savedDoc) {
			  if (saveError) {
				  Logger.error(saveError);
				  resObj = gCache.GenResponseObject(1);
			  } else {
				  resObj = gCache.GenResponseObject(0);
			  }
			  if (savedDoc) {
				  resObj.data = savedDoc.toObject({'versionKey': false});
			  }
			  res.json(resObj);
			  savedDoc = null;
		  });
		  ocpShopDoc = null;
	  })
  })
  /*删除*/
  .delete(function delBankCardsWithUserIdAndCardNo(req, res, next) {
	  //todo ：删除功能的实现
	  let resObj = gCache.GenResponseObject(11);
	  res.json(resObj);
  });

/** 平台订单维护接口 */
BackEndApiRouter.route('/orders/:types/:orderId?')
  .get(function getOrderByTypeAndOrderId(req, res, next) {
	  let groupId = req.userDoc.group_id;
	  let userType = req.userDoc.business_type;
	  let type = req.params['types'] || 'all';
	  let orderId = req.params['orderId'];
	  let queryObj = req.query || {'page': 0, 'limit': 30};
	  let page = isNaN(queryObj.page) ? 0 : parseInt(queryObj.page, 10) - 1;
	  let limit = isNaN(queryObj.limit) ? 30 : parseInt(queryObj.limit, 10);
	  let detailInfo = !!queryObj.detail;
	  limit = Math.min(limit, 100);
	  let filterObj = {};
	  if (type !== 'all') {
		  filterObj.req_channel = type;
	  }
	  if (orderId) {
		  filterObj.req_order_id = orderId;
		  page = 0;
	  }

	  if ((userType === 'admin' || groupId === 'd807500')) {
		  findOrders();
	  } else {
		  findAllUserAccount(function (error, idsArr) {
			  if (error) {
				  Logger.error(error);
				  let resObj = gCache.GenResponseObject(1);
				  res.json(resObj);
				  error = null;
				  return;
			  }
			  filterObj.req_from = {'$in': idsArr};
			  findOrders();
		  })
	  }

	  function findAllUserAccount(callback) {
		  Models.UserModel.find({'$or': [{'user_id': groupId}, {'group_id': groupId}]}).exec()
			.then(function (userDocs) {
				let idsArr = [];
				userDocs.forEach(function (doc) {
					idsArr.push(doc.user_id);
				});
				callback && callback(null, idsArr);
			})
			.catch(function (error) {
				callback && callback(error, null);
			})
	  }

	  function findOrders() {
		  Models.OrderModel.find(filterObj).skip(page * limit).limit(limit).sort({'req_time': -1}).exec()
			.then(function (findDocs) {
				let resObj = gCache.GenResponseObject(0);
				resObj.total = 1000;
				resObj.page = page;
				resObj.limit = limit;
				if (!detailInfo) {
					resObj.data = findDocs.map(function (doc) {
						return doc.toObject({'transform': true});
					});
				} else {
					resObj.data = findDocs.map(function (doc) {
						let obj = doc.toObject({'transform': true});
						obj.assigned_account = doc.assigned_account;
						return obj;
					});
				}
				res.json(resObj);
				findDocs = null;
			})
			.catch(function (findError) {
				Logger.error(findError);
				let resObj = gCache.GenResponseObject(1);
				res.json(resObj);
				findError = null;
			})
	  }

  })
  .post(function putOrderByTypeAndOrderId(req, res, next) {
	  let myUserDoc = req.userDoc;
	  let isAdmin = req.isAdmin;
	  let type = req.params['types'] || 'all';
	  let orderId = req.params['orderId'];
	  let resObj, conditions, postData = req.body, resendInform = false;
	  if (!isAdmin) {
		  resObj = gCache.GenResponseObject(3);
		  res.json(resObj);
		  return;
	  }
	  if (!orderId || !postData) {
		  resObj = gCache.GenResponseObject(107);
		  res.json(resObj);
		  return;
	  }

	  if (!postData.ticket_id || !postData.paid_time || !postData.paid_number || !postData.fix_type) {
		  resObj = gCache.GenResponseObject(101);
		  res.json(resObj);
		  return;
	  }

	  conditions = {'req_order_id': orderId};
	  resendInform = !!postData.resend_inform;
	  if (type.toLocaleLowerCase() !== "all") {
		  conditions.req_channel = type;
	  }
	  Models.OrderModel.findOne(conditions).exec()
		.then(function (findDoc) {
			let resObj;
			if (!findDoc) {
				resObj = gCache.GenResponseObject(107);
				res.json(resObj);
				return;
			}
			resObj = gCache.GenResponseObject(0);
			if (findDoc.order_status !== 'paid') {
				findDoc.set('order_status', 'paid', {strict: true});
				findDoc.set('status_time', undefined, {strict: true});
				findDoc.set('final_paid_order_no', postData.ticket_id, {strict: true});
				findDoc.set('final_paid_time', Number.parseInt(postData.paid_time, 10) || new Date().getTime());
				findDoc.set('final_paid_number', Number.parseFloat(postData.paid_number));
				findDoc.set('final_paid_data', {
					'fix_user': myUserDoc.user_id,
					'fix_type': postData.fix_type,
					'fix_client_ip': req.ip,
				});
				findDoc.markModified('final_paid_data');
			}

			if (!findDoc.billing_status || findDoc.billing_status !== 'converted') {
				findDoc.set('billing_status', 'pending');
			}

			findDoc.save(function (error, savedDoc) {
				findDoc = null;
				if (error) {
					Logger.error(error);
					resObj = gCache.GenResponseObject(1);
					res.json(resObj);
					error = null;
					return;
				}

				resObj = gCache.GenResponseObject(0);
				res.json(resObj);

				/*如果不需要 回调*/
				if (!resendInform || !savedDoc.req_inform_url) {
					savedDoc = null;
					return;
				}

				let informObj, informUrl = savedDoc.req_inform_url;
				informObj = gCache.UniversalInformObject(200);
				informObj.order_id = savedDoc.req_order_id;
				informObj.pay_in_number = savedDoc.final_paid_number;
				informObj.pay_time = savedDoc.final_paid_time;
				informObj.ticket_id = savedDoc.final_paid_order_no || 'unknown_id';
				informObj.pay_type = savedDoc.req_pay_type;
				informObj.app_data = savedDoc.req_raw_data.app_data;
				informObj.sign = "";
				Models.UserModel.findOne({'user_id': savedDoc.req_from}).exec(function (error, userDoc) {
					savedDoc = null;
					if (error) {
						Logger.error(error);
						error = null;
						informObj = null;
						informUrl = null;
						return;
					}
					informObj.sign = gCache.signTheCallBackData(informObj, userDoc.user_key);

					function informDs(callback) {
						httpRequest({
							'url': informUrl,
							'json': true,
							'body': informObj,
							strictSSL: true,
							method: 'POST'
						}, function (err, httpResponse, body) {
							if (err || httpResponse.statusCode !== 200) {
								callback(new Error('retry_later'));
								return;
							}
							callback(null);
							err = null;
							body = null;
						})
					}

					ASYNC.retry({times: 3, interval: 20000}, informDs, function (error, result) {
						error = null;
						result = null;
						informObj = null;
						informUrl = null;
					});
				});
			});
		})
		.catch(function (findError) {
			Logger.error(findError);
			resObj = gCache.GenResponseObject(1);
			res.json(resObj);
			findError = null;
		})
  });

/** 平台分账单 获取接口*/
BackEndApiRouter.route('/channel_orders/:types/:orderId')
  .get(function getOrderByTypeAndOrderId(req, res, next) {
	  let groupId = req.userDoc.group_id;
	  let userType = req.userDoc.business_type;
	  let type = req.params['types'];
	  let orderId = req.params['orderId'];
	  orderId.toLocaleLowerCase() === 'index' ? orderId = undefined : 1 + 1;
	  let queryObj = req.query || {'page': 0, 'limit': 30};
	  let page = isNaN(queryObj.page) ? 0 : parseInt(queryObj.page, 10);
	  let limit = isNaN(queryObj.limit) ? 30 : parseInt(queryObj.limit, 10);
	  limit = Math.min(limit, 100);
	  let filterObj = (userType !== 'admin' || groupId !== 'd807500') ? {'req_from': groupId} : {};
	  let queryModel, resObj;
	  switch (type) {
		  case 'alipay2bank_auto':
		  case 'alipay2bank_manual':
			  queryModel = Models.Aly2BankOrderModel;
			  break;
		  case 'pdd':
			  queryModel = Models.PddOrderModel;
			  break;
		  default:
			  resObj = gCache.GenResponseObject(104);
			  res.json(resObj);
			  return;
	  }
	  if (orderId) {
		  filterObj.req_order_id = orderId;
		  page = 0;
	  }
	  queryModel.find(filterObj).skip(page * limit).limit(limit).exec()
		.then(function (findDocs) {
			resObj = gCache.GenResponseObject(0);
			resObj.total = 100;
			resObj.page = page;
			resObj.limit = limit;
			resObj.data = findDocs.map(function (doc) {
				return doc.toObject({'transform': true});
			});
			res.json(resObj);
		})
		.catch(function (findError) {
			Logger.error(findError);
			resObj = gCache.GenResponseObject(1);
			res.json(resObj);
		})
  });

/** 拼多多 商铺商品 维护接口 */
BackEndApiRouter.route('/pddgoods/:userId?/:goodsId?')
  /*查询*/
  .get(function getInfoWithUserIdAndGoodsId(req, res, next) {
	  let goodsId = req.params['goodsId'];
	  let groupId = req.userDoc.group_id;
	  let userType = req.userDoc.business_type;
	  let queryObj = userType !== 'admin' ? {'ds_user_id': groupId} : {};
	  let _page = 1, _limit = 100;
	  if (req.query) {
		  _page = req.query['page'] || _page;
		  _limit = req.query['limit'] || _limit;
	  }
	  _page = parseInt(_page, 10) - 1;
	  _limit = parseInt(_limit, 10);
	  _limit = Math.min(_limit, 200);
	  if (goodsId) {
		  queryObj.goods_id = goodsId;
		  _page = 0;
	  }
	  Models.PddGoodsModel.find(queryObj).sort({
		  "shop_id": 1,
		  'createdAt': -1
	  }).skip(_page * _limit).limit(_limit).exec()
		.then(function (goodsDocs) {
			let resObj = gCache.GenResponseObject(0);
			resObj.total = 300;
			resObj.page = _page;
			resObj.limit = _limit;
			resObj.data = goodsDocs.map(function (goodsDoc) {
				return goodsDoc.toObject({'versionKey': false});
			});
			res.json(resObj);
			goodsDocs = null;
		})
		.catch(function (findError) {
			let resObj = gCache.GenResponseObject(1);
			res.json(resObj);
			Logger.debug(findError);
		})
  })
  /*增加*/
  .post(function postPddGoodsInfoForInsert(req, res, next) {
	  let groupId = req.userDoc.group_id;
	  let postData = req.body, resObj;
	  if (!postData || !postData.shop_id || !postData.goods_id || !postData.group_price || !postData.single_price || !postData.delay_sign) {
		  resObj = gCache.GenResponseObject(101);
		  res.json(resObj);
		  return;
	  }
	  Models.PddGoodsModel.create({
		  'ds_user_id': groupId,                      //属于下游哪个客户
		  'shop_id': postData.shop_id,                         //店铺号
		  'shop_name': postData.shop_name,                       //店铺名称
		  'goods_id': postData.goods_id,                        //商品号
		  'goods_name': postData.goods_name,                      //商品名称
		  'group_price': postData.group_price,          //拼购价格
		  'single_price': postData.single_price,          //单购价格
		  'delay_sign': postData.delay_sign,                                             //是否延迟签收(D+2)模式
		  'is_enable': postData.is_enable === undefined ? true : postData.is_enable,
	  }, function (createErr, createDoc) {
		  let resObj;
		  if (createErr) {
			  resObj = gCache.GenResponseObject(1);
			  res.json(resObj);
			  createErr = null;
			  return;
		  }
		  resObj = gCache.GenResponseObject(0);
		  resObj.data = createDoc.toObject({'versionKey': false});
		  res.json(resObj);
		  createDoc = null;
	  })
  })
  /*修改*/
  .put(function modifyPddGoodsInfo(req, res, next) {
	  let groupId = req.userDoc.group_id;
	  let goodsId = req.params['goodsId'];
	  let postData = req.body, resObj;
	  if (!goodsId || !/^\d{6,}/.test(goodsId)) {
		  resObj = gCache.GenResponseObject(102);
		  res.json(resObj);
		  return;
	  }
	  if (!postData) {
		  //没有东西可以更新
		  resObj = gCache.GenResponseObject(0);
		  res.json(resObj);
		  return;
	  }

	  Models.PddGoodsModel.findOne({'goods_id': goodsId, 'bind_user_id': groupId}).exec(function (findErr, goodsDoc) {
		  if (findErr) {
			  Logger.debug(findErr);
			  resObj = gCache.GenResponseObject(1);
			  res.json(resObj);
			  return;
		  }
		  if (!goodsDoc) {
			  resObj = gCache.GenResponseObject(206);
			  res.json(resObj);
			  return;
		  }
		  /*不允许更新的属性*/
		  const forbbidenProp = [
			  'ds_user_id', 'shop_id', 'goods_id'
		  ];
		  /*本地更新并校验*/
		  let _extraUpdate = false, filterObj = {'shop_id': null}, updateObj = {'delay_sign': undefined};
		  Object.keys(postData).forEach(function (propertyStr) {
			  if (forbbidenProp.indexOf(propertyStr) !== -1) {
				  return;
			  }
			  if (postData[propertyStr] === undefined || postData[propertyStr] === null) {
				  return;
			  }
			  if (propertyStr === 'delay_sign') {
				  _extraUpdate = true;
				  filterObj.shop_id = goodsDoc.shop_id;
				  updateObj.delay_sign = postData[propertyStr];
			  }
			  goodsDoc.set(propertyStr, postData[propertyStr]);
		  });

		  if (_extraUpdate) {
			  /*delay_sign 属性更新 需要 全店更新*/
			  Models.PddGoodsModel.updateMany(filterObj, updateObj, function (error, result) {
				  if (error) {
					  Logger.error(error);
				  }
				  error = null;
				  result = null;
			  })
		  }

		  /*写入服务器*/
		  goodsDoc.save(function (saveError, savedDoc) {
			  if (saveError) {
				  Logger.debug(saveError);
				  resObj = gCache.GenResponseObject(1);
			  } else {
				  resObj = gCache.GenResponseObject(0);
			  }
			  if (savedDoc) {
				  resObj.data = savedDoc.toObject({'versionKey': false});
			  }
			  res.json(resObj);
			  savedDoc = null;
		  });
		  goodsDoc = null;
	  })

  })
  /*删除*/
  .delete(function delBankCardsWithUserIdAndCardNo(req, res, next) {
	  //todo ：删除功能的实现
	  let resObj = gCache.GenResponseObject(11);
	  res.json(resObj);
  });

/** 拼多多 买单号（买手/用户号） 维护接口 */
BackEndApiRouter.route('/pddbuyer/:userId?/:loginName?')
  /*查询*/
  .get(function getBuyerInfo(req, res, next) {
	  let buyerId = req.params['loginName'];
	  let groupId = req.userDoc.group_id;
	  let userType = req.userDoc.business_type;
	  let queryObj = userType !== 'admin' ? {'ds_user_id': groupId} : {};

	  let _page = 1, _limit = 100;
	  if (req.query) {
		  _page = req.query['page'] || _page;
		  _limit = req.query['limit'] || _limit;
	  }
	  _page = parseInt(_page, 10) - 1;
	  _limit = parseInt(_limit, 10);
	  _limit = Math.min(_limit, 200);
	  if (buyerId) {
		  queryObj.login_name = buyerId;
		  _page = 0;
	  }
	  Models.PddUserModel.find(queryObj).sort({
		  'createdAt': -1,
		  'user_id': 1
	  }).skip(_page * _limit).limit(_limit).exec()
		.then(function (pddUserDocs) {
			let resObj = gCache.GenResponseObject(0);
			resObj.total = 300;
			resObj.page = _page;
			resObj.limit = _limit;
			resObj.data = pddUserDocs.map(function (pddUserDoc) {
				return {
					'user_id': pddUserDoc.user_id,           // 拼多多用户ID
					'ds_user_id': pddUserDoc.ds_user_id,     //账号所属的DS用户
					'login_name': pddUserDoc.login_name,     //拼多多登录名
					'token': '***',
					'is_valid': pddUserDoc.is_valid,         //是否正常使用
					'is_enabled': pddUserDoc.is_enabled,     //是否启用
				};
			});
			res.json(resObj);
			pddUserDocs = null;
		})
		.catch(function (findError) {
			let resObj = gCache.GenResponseObject(1);
			res.json(resObj);
			Logger.debug(findError);
		})
  })
  /*增加*/
  .post(function postBuyerInfo(req, res, next) {
	  let groupId = req.userDoc.group_id;
	  let postData = req.body, resObj;
	  if (!postData || !postData.user_id || !postData.login_name || !postData.token) {
		  resObj = gCache.GenResponseObject(101);
		  res.json(resObj);
		  return;
	  }
	  Models.PddUserModel.create({
		  'user_id': postData.user_id,                                // 拼多多用户ID
		  'ds_user_id': groupId,                      //账号所属的DS用户
		  'login_name': postData.login_name,                                                //拼多多登录名
		  'login_type': 'phone',    //登录类型
		  'login_pass': undefined,                               //登录密码（QQ/WECHAT需要）
		  'cookie_data': [
			  {
				  "name": "PDDAccessToken",
				  "value": postData.token,
				  "domain": "mobile.yangkeduo.com",
				  "path": "/",
				  "expires": (new Date().getTime() + 90 * 86400000) * 0.001,
				  "httpOnly": false,
				  "secure": false,
				  "session": false
			  },
			  {
				  "name": "pdd_user_id",
				  "value": postData.user_id,
				  "domain": "mobile.yangkeduo.com",
				  "path": "/",
				  "expires": (new Date().getTime() + 90 * 86400000) * 0.001,
				  "httpOnly": false,
				  "secure": false,
				  "session": false
			  }
		  ],                                            //登录的cookie
		  'address': undefined,                                                 //使用的地址
		  'is_valid': true,                                        //是否正常使用
		  'is_enabled': true,                                      //是否启用
	  }, function (createErr, createDoc) {
		  let resObj;
		  if (createErr) {
			  resObj = gCache.GenResponseObject(1);
			  res.json(resObj);
			  createErr = null;
			  return;
		  }
		  resObj = gCache.GenResponseObject(0);
		  resObj.data = createDoc.toObject({'versionKey': false});
		  delete resObj.data['cookie_data'];
		  delete resObj.data['login_pass'];
		  delete resObj.data['address'];
		  delete resObj.data['last_used'];
		  res.json(resObj);
		  createDoc = null;
	  })
  });

/** 拼多多 商铺号 维护接口 */
BackEndApiRouter.route('/pddshopconfig/:shopId?')
  /*查询*/
  .get(function getShopInfo(req, res, next) {
	  let shopId = req.params['shopId'];
	  let groupId = req.userDoc.group_id;
	  let userType = req.userDoc.business_type;
	  let queryObj = userType !== 'admin' ? {'ds_user_id': groupId} : {};

	  let _page = 1, _limit = 100;
	  if (req.query) {
		  _page = req.query['page'] || _page;
		  _limit = req.query['limit'] || _limit;
	  }
	  _page = parseInt(_page, 10) - 1;
	  _limit = parseInt(_limit, 10);
	  _limit = Math.min(_limit, 200);
	  if (shopId) {
		  queryObj.shop_id = shopId;
		  _page = 0;
	  }
	  /** 查询 pdd 商品表，选出商铺*/
	  Models.PddGoodsModel.find(queryObj).sort({'createdAt': -1, 'shop_id': 1}).exec()
		.then(function (pddGoodsDocs) {
			let resObj;
			let mixData = {};
			gCache.IOClient.emit(gCache.Event.REQ_SHOP_DYNAMIC_CONFIG, shopId, function (err, ioResData) {
				if (err || !ioResData) {
					resObj = gCache.GenResponseObject(1);
					res.json(resObj);
					return;
				}

				resObj = gCache.GenResponseObject(0);
				resObj.total = 300;
				resObj.page = _page;
				resObj.limit = _limit;

				pddGoodsDocs.forEach(function (goodsDoc) {
					let curShopId = goodsDoc['shop_id'];
					if (!mixData[goodsDoc['shop_id']]) {
						mixData[goodsDoc['shop_id']] = {
							'shop_id': goodsDoc['shop_id'],                         //店铺号
							'shop_name': goodsDoc['shop_name'],                       //店铺名称
							'is_enable': true,                       //店铺名称
							'delay_sign': false,                       //店铺名称
							'sale_limit': 0,                       //店铺名称
						};
						if (ioResData[curShopId]) {
							mixData[goodsDoc['shop_id']].sale_limit = ioResData[curShopId].sale_limit || ioResData['defaultShopLimit'];
						} else {
							mixData[goodsDoc['shop_id']].sale_limit = ioResData['defaultShopLimit'];
						}
					}
					if (!goodsDoc['is_enable']) {
						mixData[goodsDoc['shop_id']].is_enable = false;
					}
					if (goodsDoc['delay_sign']) {
						mixData[goodsDoc['shop_id']].delay_sign = true;
					}
				});

				let arr = Object.keys(mixData);
				arr.sort();
				let tArr = arr.splice(_page * _limit, _limit);
				if (tArr.length) {
					resObj.data = [];
					tArr.forEach(function (key) {
						resObj.data.push(mixData[key]);
					})
				}
				res.json(resObj);
				pddGoodsDocs = null;
				ioResData = null;
				arr = null;
				tArr = null;
			});
		})
		.catch(function (findError) {
			let resObj = gCache.GenResponseObject(1);
			res.json(resObj);
			Logger.debug(findError);
		})
  })
  /*修改商铺属性*/
  .put(function putShopInfo(req, res, next) {
	  let shopId = req.params['shopId'];
	  let resObj;
	  if (!shopId || !req.body) {
		  resObj = gCache.GenResponseObject(101);
		  res.json(resObj);
		  return;
	  }
	  let filterObj = {'shop_id': shopId};
	  let salesLimit = req.body['sale_limit'] || 0;

	  resObj = gCache.GenResponseObject(0);
	  res.json(resObj);

	  /** 查询 pdd 商品表，选出商铺*/
	  Models.PddGoodsModel.findOne(filterObj).exec()
		.then(function (pddGoodsDoc) {
			if (!pddGoodsDoc) {
				//店铺不存在
				return;
			}
			let delaySign = req.body['delay_sign'];
			let isEnable = req.body['is_enable'];
			let updateObj = {'shouldUpdate': false};
			if (delaySign !== undefined) {
				updateObj.delay_sign = delaySign;
				updateObj.shouldUpdate = true;
			}
			if (isEnable !== undefined) {
				updateObj.is_enable = isEnable;
				updateObj.shouldUpdate = true;
			}

			if (updateObj.shouldUpdate) {
				//如果有需要更新的
				delete updateObj.shouldUpdate;
				Models.PddGoodsModel.updateMany(filterObj, updateObj).exec(function (error, result) {
					if (error) {
						Logger.error(error);
					}
					error = null;
					result = null;
				})
			}

			if (salesLimit) {
				gCache.IOClient.emit(gCache.Event.SET_SHOP_DYNAMIC_CONFIG, shopId, {'sale_limit': salesLimit}, function (err, ioResData) {
					if (err || !ioResData) {
						Logger.error(err);
					}
					err = null;
					ioResData = null;
				});
			}
		})
		.catch(function (findError) {
			Logger.debug(findError);
		});
  });

/** 统计成功率接口 */
BackEndApiRouter.route('/statistics/success_rate/:channelId?')
  .get(function (req, res, next) {
	  let chnId = req.params['channelId'];
	  let funcArr = [], idsArr = [], resObj = gCache.GenResponseObject(0);
	  resObj.channel_statistics = [];
	  resObj.account_statistics = [];

	  if (chnId) {
		  idsArr.push(chnId);
	  } else {
		  idsArr = Object.keys(gCache.StatisMethod);
	  }

	  if (!idsArr.length) {
		  res.json(resObj);
		  return;
	  }

	  idsArr.forEach(function (channelId) {
		  if (!channelId) {
			  return;
		  }
		  let myChnId = channelId;
		  /*查询 单个商铺账号 的统计数据*/
		  funcArr.push(function queryAccountStatis(callback) {
			  Models.StatisticsModel.find({"statistics_channel": myChnId, "statistics_type": 'account_statistics'})
				.sort({'statistics_time': -1}).limit(1).exec()
				.then(function (findDocs) {
					if (!findDocs || !findDocs.length) {
						callback && callback(null, {'account_statistics': null});
						return;
					}
					callback && callback(null, {
						'account_statistics': findDocs[0].statistics_data.map(function (dataObj) {
							dataObj.statistic_time = dataObj.statistic_time || findDocs[0]['statistics_time'];
							return dataObj;
						}) || null
					});
				})
				.catch(function (error) {
					Logger.error(error);
					callback && callback(null, {'account_statistics': null});
				})
		  });
		  /*查询 通道 统计数据*/
		  funcArr.push(function queryChannelStatis(callback) {
			  Models.StatisticsModel.find({"statistics_channel": myChnId, "statistics_type": 'channel_statistics'})
				.sort({'statistics_time': -1}).limit(1).exec()
				.then(function (findDocs) {
					if (!findDocs || !findDocs.length) {
						callback && callback(null, {'channel_statistics': null});
						return;
					}
					callback && callback(null, {
						'channel_statistics': findDocs[0].statistics_data.map(function (dataObj) {
							dataObj.statistic_time = dataObj.statistic_time || findDocs[0]['statistics_time'];
							return dataObj;
						}) || null
					});
				})
				.catch(function (error) {
					Logger.error(error);
					callback && callback(null, {'channel_statistics': null});
				})
		  })
	  });

	  ASYNC.parallel(funcArr, function (error, result) {
		  if (error) {
			  res.json(resObj);
			  Logger.error(error);
			  error = null;
			  return;
		  }
		  let curDate = new Date();
		  result.forEach(function (resultObject) {
			  if (resultObject.channel_statistics && resultObject.channel_statistics.length) {
				  resObj.channel_statistics = resObj.channel_statistics.concat(resultObject.channel_statistics.map(function (dataObj) {
					  dataObj.statistic_time = dataObj.statistic_time || curDate;
					  return dataObj;
				  }));
			  }

			  if (resultObject.account_statistics && resultObject.account_statistics.length) {
				  resObj.account_statistics = resObj.account_statistics.concat(resultObject.account_statistics.map(function (dataObj) {
					  dataObj.statistic_time = dataObj.statistic_time || curDate;
					  return dataObj;
				  }));
			  }
		  });
		  res.json(resObj);
	  })

  })
  .post(function (req, res, next) {
	  let chnId = req.params['channelId'];
	  let funcArr = [], statisFunc, resObj = gCache.GenResponseObject(0);
	  resObj.channel_statistics = [];
	  resObj.account_statistics = [];
	  if (chnId) {
		  statisFunc = gCache.StatisMethod[chnId];
		  if (statisFunc) {
			  funcArr.push(statisFunc);
		  }
	  } else {
		  for (let channelId in gCache.StatisMethod) {
			  if (gCache.StatisMethod.hasOwnProperty(channelId) && gCache.StatisMethod[channelId]) {
				  funcArr.push(gCache.StatisMethod[channelId]);
			  }
		  }
	  }

	  if (!funcArr.length) {
		  res.json(resObj);
		  return;
	  }

	  ASYNC.parallel(funcArr, function (error, result) {
		  if (error) {
			  res.json(resObj);
			  Logger.error(error);
			  error = null;
			  return;
		  }
		  result.forEach(function (resultObject) {
			  if (resultObject.channel_statistics && resultObject.channel_statistics.length) {
				  resObj.channel_statistics = resObj.channel_statistics.concat(resultObject.channel_statistics);
			  }

			  if (resultObject.account_statistics && resultObject.account_statistics.length) {
				  resObj.account_statistics = resObj.account_statistics.concat(resultObject.account_statistics);
			  }
		  });
		  res.json(resObj);
	  })
  });

/** 账务汇总统计接口 */
BackEndApiRouter.route('/statistics/accounting/:userId?')
  .get(function (req, res, next) {
	  res.redirect(302, req.protocol + '://' + req.hostname);
  })
  .post(
	/** 此函数只处理没有指定统计的UserId的情况，也就是需要统计全部的情况*/
	function onUserIdNotSpecified(req, res, next) {
		let statisUserId = req.params['userId'];
		if (statisUserId && statisUserId !== 'd807500') {
			// 如果存在指定 userid 。则略过
			next();
			return;
		}

		let myUserDoc = req.userDoc;
		let isAdmin = req.isAdmin;
		let queryObj, resObj, startDate, endDate, tmpDate, users;
		let userRateMap = {},  //用户的ID 到 结算费率 的列表
		  userIdMap = {},     //用户的ID 到 昵称 的列表
		  materialIdMap = {}; //所属物料ID 到 昵称 的列表
		let channelIdMap = {},  //通道ID 到 昵称 的列表
		  shopIdMap = {};     //店铺ID 到 昵称 的列表

		/** 人民币分转成元（number 转成 string）*/
		function formatCentToYuan(oriValue) {
			if (isNaN(oriValue) || !oriValue) {
				return oriValue;
			}
			return (oriValue * 0.01).toFixed(2);
		}

		/** 获取 OCP 店铺资料（历史遗留） */
		function getOCPShops(callback) {
			let filterObj = {};
			if (!isAdmin) {
				filterObj = {'ds_user_id': {'$in': Object.keys(userIdMap)}}
			}
			Models.OneCodePayShopModel.find(filterObj).exec(function (error, findDocs) {
				if (error) {
					Logger.error(error);
					callback && callback(error, null);
					error = null;
					return;
				}
				let shopIdMap = {};
				findDocs.forEach(function (doc) {
					if (doc) {
						shopIdMap[doc.shop_id] = doc.shop_name;
					}
				});
				callback && callback(null, shopIdMap);
				findDocs = null;
			})
		}

		/** 获取 YST 店铺资料（历史遗留） */
		function getYSTShops(callback) {
			let filterObj = {};
			if (!isAdmin) {
				filterObj = {'ds_user_id': {'$in': Object.keys(userIdMap)}}
			}
			Models.YstPayShopModel.find(filterObj).exec(function (error, findDocs) {
				if (error) {
					Logger.error(error);
					callback && callback(error, null);
					error = null;
					return;
				}
				let shopIdMap = {};
				findDocs.forEach(function (doc) {
					if (doc) {
						shopIdMap[doc.yst_id] = doc.shop_name;
					}
				});
				callback && callback(null, shopIdMap);
				findDocs = null;
			})
		}

		/** 获取 通用的 店铺资料 */
		function getGeneralShops(callback) {
			let filterObj = {};
			if (!isAdmin) {
				filterObj = {'ds_user_id': {'$in': Object.keys(userIdMap)}}
			}
			Models.GeneralPayShopModel.find(filterObj).exec(function (error, findDocs) {
				if (error) {
					Logger.error(error);
					callback && callback(error, null);
					error = null;
					return;
				}
				let shopIdMap = {};
				findDocs.forEach(function (doc) {
					if (doc) {
						shopIdMap[doc.shop_id] = doc.shop_name;
					}
				});
				callback && callback(null, shopIdMap);
				findDocs = null;
			})
		}

		/*先查询出 此用户 所属的所有 userId ，包括对接服务器 和 个人物料提供账号*/
		Models.UserModel.find({}).exec(function (error, usersDoc) {
			if (error) {
				resObj = gCache.GenResponseObject(101);
				res.json(resObj);
				return;
			}
			users = {};
			usersDoc.forEach(function (userDoc) {
				if (!userDoc) {
					return;
				}
				//先存储库里面所有的用户信息，不管账户是否有效
				users[userDoc.user_id] = userDoc;

				if (userDoc['business_type'] === 'us') {
					//如果账号的类型是 us （上游对接账户，也就是 channel）
					channelIdMap[userDoc.user_id] = userDoc.nick_name;
					return;
				}
				if (userDoc['business_type'] === 'ds') {
					//如果账号的类型是 DS （服务器对接账号）
					if (isAdmin) {
						userIdMap[userDoc.user_id] = userDoc.nick_name;
						userRateMap[userDoc.user_id] = userDoc.cash_rate;
					} else {
						if (userDoc.user_id === myUserDoc.group_id || userDoc.group_id === myUserDoc.group_id) {
							userIdMap[userDoc.user_id] = userDoc.nick_name;
							userRateMap[userDoc.user_id] = userDoc.cash_rate;
						}
					}
				} else {
					//如果账号类型是 backend ，属于 后台登录账号（也用于 个人提供物料，比如银行卡，个码）
					/*管理员 不受限制*/
					if (!isAdmin) {
						if (userDoc.user_id === myUserDoc.user_id || userDoc.group_id === myUserDoc.group_id) {
							userIdMap[userDoc.user_id] = userDoc.nick_name;
						}
					} else {
						userIdMap[userDoc.user_id] = userDoc.nick_name;
					}
				}
			});

			/*上面整理出 账号所属的 所有 userid，然后现在，开始查询 物料*/
			ASYNC.parallel({
				'getOCPShops': getOCPShops,
				'getYSTShops': getYSTShops,
				'getGeneralShops': getGeneralShops,
			}, function (error, result) {
				if (error) {
					resObj = gCache.GenResponseObject(1);
					res.json(resObj);
					return;
				}

				materialIdMap = Object.assign({}, result.getOCPShops, result.getYSTShops, result.getGeneralShops);
				/* 提交统计请求的账号 所属的 userId 已经收集完毕，所属的 物料ID 也收集完毕，可以查询订单了*/

				/*预先拼装 基本的 订单查询条件*/
				queryObj = {"$and": []};
				startDate = (req.body['start_time'] ? new Date(Number.parseInt(req.body['start_time'], 10)) : gCache.getTodayStartDateObj());
				endDate = (req.body['end_time'] ? new Date(Number.parseInt(req.body['end_time'], 10)) : new Date());
				if (endDate < startDate) {
					tmpDate = endDate;
					endDate = startDate;
					startDate = tmpDate;
				}
				tmpDate = null;
				queryObj.$and.push({"req_time": {"$gte": startDate}});
				queryObj.$and.push({"req_time": {"$lte": endDate}});
				queryObj.$and.push({"order_status": "paid"});

				if (!isAdmin) {
					//如果不是管理员账户，则需要限制查询范围是  它所属的 对接服务器 或者是 所属的物料
					queryObj.$and.push({
						"$or": [
							{"req_from": {"$in": Object.keys(userIdMap)}},
							{"assigned_account": {"$in": Object.keys(materialIdMap)}},
						]
					});
				}

				/*查找订单*/
				Models.OrderModel.find(queryObj).exec(function (error, orderDocs) {
					if (error) {
						Logger.error(error);
						resObj = gCache.GenResponseObject(1);
						res.json(resObj);
						error = null;
						return;
					}
					let data, orderAmount, orderChannelId, orderShopId, outputOrder;

					data = {
						'orders': [],                                       //详单
						'cash': users[myUserDoc.group_id].balance || 0,     //可提现余额

						'total_amount': 0,                                  //当期订单总额
						'pending_cash': 0,                                  //当期未结算金额
						'user_id_map': userIdMap,
						'shop_id_map': materialIdMap,
						'user_rate_map': userRateMap,
						'channel_id_map': channelIdMap,
						'group_by_user': {},                                //按照用户汇总（一个用户可能有多家店铺）
						'group_by_channel': {},                             //按照通道汇总
						'group_by_shop': {}                                 //按照物料（店铺）汇总
					};

					orderDocs.forEach(function (orderDoc) {
						orderAmount = orderDoc.final_paid_number || orderDoc.req_pay_in;
						orderChannelId = orderDoc.assigned_channel || '---';
						orderShopId = orderDoc.assigned_account || '---';
						outputOrder = {
							'user_id': orderDoc.req_from,
							'channel_id': orderChannelId,
							'material_id': orderShopId,
							'amount': orderAmount,
							'order_time': orderDoc.req_time
						};

						data.total_amount += orderAmount;
						if (orderDoc.billing_status === 'pending') {
							data.pending_cash += orderAmount;
						}

						//分用户统计总量
						if (Object.keys(userIdMap).length) {
							if (!data.group_by_user[orderDoc.req_from]) {
								data.group_by_user[orderDoc.req_from] = orderAmount;
							} else {
								data.group_by_user[orderDoc.req_from] += orderAmount;
							}
						} else {
							outputOrder.user_id = '***';
						}


						//分通道统计总量
						if (Object.keys(channelIdMap).length) {
							if (!data.group_by_channel[orderChannelId]) {
								data.group_by_channel[orderChannelId] = orderAmount;
							} else {
								data.group_by_channel[orderChannelId] += orderAmount;
							}
						} else {
							outputOrder.channel_id = '***';
						}


						//分物料（店铺）统计总量
						if (Object.keys(materialIdMap).length) {
							if (!data.group_by_shop[orderShopId]) {
								data.group_by_shop[orderShopId] = orderAmount;
							} else {
								data.group_by_shop[orderShopId] += orderAmount;
							}
						} else {
							outputOrder.material_id = '***';
						}

						data.orders.push(outputOrder);
					});
					/*数据整理一下*/
					data.cash = formatCentToYuan(data.cash);
					data.pending_cash = formatCentToYuan(data.pending_cash);
					data.total_amount = formatCentToYuan(data.total_amount);

					if (data.group_by_user) {
						Object.keys(data.group_by_user).forEach(function (userId) {
							data.group_by_user[userId] = formatCentToYuan(data.group_by_user[userId]);
						})
					}
					if (data.group_by_channel) {
						Object.keys(data.group_by_channel).forEach(function (channelId) {
							data.group_by_channel[channelId] = formatCentToYuan(data.group_by_channel[channelId]);
						})
					}
					if (data.group_by_shop) {
						Object.keys(data.group_by_shop).forEach(function (shopId) {
							data.group_by_shop[shopId] = formatCentToYuan(data.group_by_shop[shopId]);
						})
					}
					resObj = gCache.GenResponseObject(0);
					resObj.data = data;
					res.json(resObj);

				})
			});
		});
	},
	/** 此函数只处理指定了统计的UserId的情况，也就是需要统计单个UserId的情况*/
	function onUserIdSpecified(req, res, next) {
		let statisUserId = req.params['userId'];
		if (!statisUserId) {
			// 如果不存在指定 userid 。则抛出错误
			resObj = gCache.GenResponseObject(1);
			res.json(resObj);
			return;
		}

		let myUserDoc = req.userDoc, statisUserDoc;
		let isAdmin = req.isAdmin;
		let queryObj, resObj, startDate, endDate, tmpDate, users;
		let userRateMap = {},  //用户的ID 到 结算费率 的列表
		  userIdMap = {},     //用户的ID 到 昵称 的列表
		  materialIdMap = {}; //所属物料ID 到 昵称 的列表
		let channelIdMap = {},  //通道ID 到 昵称 的列表
		  shopIdMap = {};     //店铺ID 到 昵称 的列表

		/** 人民币分转成元（number 转成 string）*/
		function formatCentToYuan(oriValue) {
			if (isNaN(oriValue) || !oriValue) {
				return oriValue;
			}
			return (oriValue * 0.01).toFixed(2);
		}

		/** 获取 OCP 店铺资料（历史遗留） */
		function getOCPShops(callback) {
			let filterObj = {'ds_user_id': {'$in': Object.keys(userIdMap)}};
			Models.OneCodePayShopModel.find(filterObj).exec(function (error, findDocs) {
				if (error) {
					Logger.error(error);
					callback && callback(error, null);
					error = null;
					return;
				}
				let shopIdMap = {};
				findDocs.forEach(function (doc) {
					if (doc) {
						shopIdMap[doc.shop_id] = doc.shop_name;
					}
				});
				callback && callback(null, shopIdMap);
				findDocs = null;
			})
		}

		/** 获取 YST 店铺资料（历史遗留） */
		function getYSTShops(callback) {
			let filterObj = {'ds_user_id': {'$in': Object.keys(userIdMap)}};
			Models.YstPayShopModel.find(filterObj).exec(function (error, findDocs) {
				if (error) {
					Logger.error(error);
					callback && callback(error, null);
					error = null;
					return;
				}
				let shopIdMap = {};
				findDocs.forEach(function (doc) {
					if (doc) {
						shopIdMap[doc.yst_id] = doc.shop_name;
					}
				});
				callback && callback(null, shopIdMap);
				findDocs = null;
			})
		}

		/** 获取 通用的 店铺资料 */
		function getGeneralShops(callback) {
			let filterObj = {'ds_user_id': {'$in': Object.keys(userIdMap)}};
			Models.GeneralPayShopModel.find(filterObj).exec(function (error, findDocs) {
				if (error) {
					Logger.error(error);
					callback && callback(error, null);
					error = null;
					return;
				}
				let shopIdMap = {};
				findDocs.forEach(function (doc) {
					if (doc) {
						shopIdMap[doc.shop_id] = doc.shop_name;
					}
				});
				callback && callback(null, shopIdMap);
				findDocs = null;
			})
		}

		/*先查询出 此用户 所属的所有 userId ，包括对接服务器 和 个人物料提供账号*/
		Models.UserModel.find({
			"$or": [
				{'user_id': statisUserId},
				{'group_id': statisUserId},
				{'business_type': 'us'}
			]
		}).exec(function (error, usersDoc) {
			if (error) {
				resObj = gCache.GenResponseObject(1);
				res.json(resObj);
				return;
			}
			if (!usersDoc || !usersDoc.length) {
				//没有找到这个用户
				resObj = gCache.GenResponseObject(108);
				res.json(resObj);
				return;
			}

			let element;
			for (let i = 0; i < usersDoc.length; i++) {
				element = usersDoc[i];
				if (element.user_id === statisUserId) {
					statisUserDoc = element;
					break;
				}
			}

			if (!statisUserDoc) {
				resObj = gCache.GenResponseObject(108);
				res.json(resObj);
				return;
			}

			if (!isAdmin) {
				//如果登录用户 不具有 admin 权限
				if (statisUserDoc.group_id !== myUserDoc.group_id && statisUserDoc.group_id !== myUserDoc.user_id) {
					//此用户不是本登录用户，也不是 本登录用户旗下的
					resObj = gCache.GenResponseObject(3);
					res.json(resObj);
					return;
				}
			}

			users = {};
			usersDoc.forEach(function (userDoc) {
				if (!userDoc) {
					return;
				}

				//先存储库里面所有的用户信息，不管账户是否有效
				users[userDoc.user_id] = userDoc;

				if (userDoc['business_type'] === 'us') {
					//如果账号的类型是 us （上游对接账户，也就是 channel）
					channelIdMap[userDoc.user_id] = userDoc.nick_name;
					return;
				}
				if (userDoc['business_type'] === 'ds') {
					//如果账号的类型是 DS （服务器对接账号）
					if (isAdmin) {
						userIdMap[userDoc.user_id] = userDoc.nick_name;
						userRateMap[userDoc.user_id] = userDoc.cash_rate;
					} else {
						if (userDoc.user_id === myUserDoc.group_id || userDoc.group_id === myUserDoc.group_id) {
							userIdMap[userDoc.user_id] = userDoc.nick_name;
							userRateMap[userDoc.user_id] = userDoc.cash_rate;
						}
					}
				} else {
					//如果账号类型是 backend ，属于 后台登录账号（也用于 个人提供物料，比如银行卡，个码）
					/*管理员 不受限制*/
					if (!isAdmin) {
						if (userDoc.user_id === myUserDoc.user_id || userDoc.group_id === myUserDoc.user_id) {
							userIdMap[userDoc.user_id] = userDoc.nick_name;
						}
					} else {
						userIdMap[userDoc.user_id] = userDoc.nick_name;
					}
				}
			});

			/*上面整理出 账号所属的 所有 userid，然后现在，开始查询 物料*/
			ASYNC.parallel({
				'getOCPShops': getOCPShops,
				'getYSTShops': getYSTShops,
				'getGeneralShops': getGeneralShops,
			}, function (error, result) {
				if (error) {
					resObj = gCache.GenResponseObject(1);
					res.json(resObj);
					return;
				}

				materialIdMap = Object.assign({}, result.getOCPShops, result.getYSTShops, result.getGeneralShops);
				/* 提交统计请求的账号 所属的 userId 已经收集完毕，所属的 物料ID 也收集完毕，可以查询订单了*/

				/*预先拼装 基本的 订单查询条件*/
				queryObj = {"$and": []};
				startDate = (req.body['start_time'] ? new Date(Number.parseInt(req.body['start_time'], 10)) : gCache.getTodayStartDateObj());
				endDate = (req.body['end_time'] ? new Date(Number.parseInt(req.body['end_time'], 10)) : new Date());
				if (endDate < startDate) {
					tmpDate = endDate;
					endDate = startDate;
					startDate = tmpDate;
				}
				tmpDate = null;
				queryObj.$and.push({"req_time": {"$gte": startDate}});
				queryObj.$and.push({"req_time": {"$lte": endDate}});
				queryObj.$and.push({"order_status": "paid"});

				//需要限制查询范围是  它所属的 对接服务器 或者是 所属的物料
				queryObj.$and.push({
					"$or": [
						{"req_from": {"$in": Object.keys(userIdMap)}},
						{"assigned_account": {"$in": Object.keys(materialIdMap)}},
					]
				});

				/*查找订单*/
				Models.OrderModel.find(queryObj).exec(function (error, orderDocs) {
					if (error) {
						Logger.error(error);
						resObj = gCache.GenResponseObject(1);
						res.json(resObj);
						error = null;
						return;
					}
					let data, orderAmount, orderChannelId, orderShopId, outputOrder;

					data = {
						'orders': [],                                       //详单
						'cash': statisUserDoc.balance || 0,                 //可提现余额

						'total_amount': 0,                                  //当期订单总额
						'pending_cash': 0,                                  //当期未结算金额
						'user_id_map': userIdMap,
						'shop_id_map': materialIdMap,
						'user_rate_map': userRateMap,
						'channel_id_map': channelIdMap,
						'group_by_user': {},                                //按照用户汇总（一个用户可能有多家店铺）
						'group_by_channel': {},                             //按照通道汇总
						'group_by_shop': {}                                 //按照物料（店铺）汇总
					};

					orderDocs.forEach(function (orderDoc) {
						orderAmount = orderDoc.final_paid_number || orderDoc.req_pay_in;
						orderChannelId = orderDoc.assigned_channel || '---';
						orderShopId = orderDoc.assigned_account || '---';
						outputOrder = {
							'user_id': orderDoc.req_from,
							'channel_id': orderChannelId,
							'material_id': orderShopId,
							'amount': orderAmount,
							'order_time': orderDoc.req_time
						};

						data.total_amount += orderAmount;
						if (orderDoc.billing_status === 'pending') {
							data.pending_cash += orderAmount;
						}

						//分用户统计总量
						if (Object.keys(userIdMap).length) {
							if (!data.group_by_user[orderDoc.req_from]) {
								data.group_by_user[orderDoc.req_from] = orderAmount;
							} else {
								data.group_by_user[orderDoc.req_from] += orderAmount;
							}
						} else {
							outputOrder.user_id = '***';
						}

						//分通道统计总量
						if (Object.keys(channelIdMap).length) {
							if (!data.group_by_channel[orderChannelId]) {
								data.group_by_channel[orderChannelId] = orderAmount;
							} else {
								data.group_by_channel[orderChannelId] += orderAmount;
							}
						} else {
							outputOrder.channel_id = '***';
						}


						//分物料（店铺）统计总量
						if (Object.keys(materialIdMap).length) {
							if (!data.group_by_shop[orderShopId]) {
								data.group_by_shop[orderShopId] = orderAmount;
							} else {
								data.group_by_shop[orderShopId] += orderAmount;
							}
						} else {
							outputOrder.material_id = '***';
						}

						data.orders.push(outputOrder);
					});
					/*数据整理一下*/
					data.cash = formatCentToYuan(data.cash);
					data.pending_cash = formatCentToYuan(data.pending_cash);
					data.total_amount = formatCentToYuan(data.total_amount);

					if (data.group_by_user) {
						Object.keys(data.group_by_user).forEach(function (userId) {
							data.group_by_user[userId] = formatCentToYuan(data.group_by_user[userId]);
						})
					}
					if (data.group_by_channel) {
						Object.keys(data.group_by_channel).forEach(function (channelId) {
							data.group_by_channel[channelId] = formatCentToYuan(data.group_by_channel[channelId]);
						})
					}
					if (data.group_by_shop) {
						Object.keys(data.group_by_shop).forEach(function (shopId) {
							data.group_by_shop[shopId] = formatCentToYuan(data.group_by_shop[shopId]);
						})
					}
					resObj = gCache.GenResponseObject(0);
					resObj.data = data;
					res.json(resObj);

				})
			});
		});
	}
  );

/** 通用型 店铺类物料 维护 接口 */
BackEndApiRouter.route('/material/:channelId?/:materialId?')
  .get(function (req, res, next) {
	  let channelId = req.params['channelId'];
	  let materialId = req.params['materialId'];
	  let myUserDoc = req.userDoc;
	  let isAdmin = req.isAdmin, funcArr = [], queryObj, resObj;

	  let _page = 1, _limit = 100;
	  if (req.query) {
		  _page = req.query['page'] || _page;
		  _limit = req.query['limit'] || _limit;
	  }
	  _page = parseInt(_page, 10) - 1;
	  _limit = parseInt(_limit, 10);
	  _limit = Math.min(_limit, 200);

	  if (!channelId || channelId.toLocaleLowerCase() === 'all') {
		  Object.keys(gCache.UPStreamsById).forEach(function (usId) {
			  funcArr.push(function (callback) {
				  let classObj = gCache.UPStreamsById[usId];
				  queryObj = {"$and": []};
				  !isAdmin
					? queryObj.$and.push({'ds_user_id': myUserDoc.user_id})
					: queryObj.$and.push({'ds_user_id': {'$exists': true}});
				  if (materialId) {
					  queryObj.$and.push({"$or": [{'shop_id': materialId}, {'yst_id': materialId}]});
				  }
				  classObj['getMaterial'](queryObj, callback);
			  })
		  })
	  } else {
		  if (gCache.UPStreamsById[channelId]) {
			  funcArr.push(function (callback) {
				  let classObj = gCache.UPStreamsById[channelId];
				  queryObj = {
					  "$and": [
						  {'ds_user_id': myUserDoc.group_id},
					  ]
				  };
				  if (materialId) {
					  queryObj.$and.push({"$or": [{'shop_id': materialId}, {'yst_id': materialId}]});
				  }
				  classObj['getMaterial'](queryObj, callback);
			  })
		  } else {
			  resObj = gCache.GenResponseObject(0);
			  res.json(resObj);
			  return;
		  }
	  }

	  ASYNC.parallel(funcArr, function (error, result) {
		  if (error) {
			  resObj = gCache.GenResponseObject(1);
			  res.json(resObj);
			  return;
		  }
		  let materialDocArr = [], dataArr;
		  result.forEach(function (docArr) {
			  if (!docArr || !docArr.length) {
				  return;
			  }
			  materialDocArr = materialDocArr.concat(docArr.map(function (doc) {
				  let data = {
					  'ds_user_id': undefined,                      //属于下游哪个客户
					  'shop_name': undefined,                       //店铺名称
					  'shop_industry': undefined,                   //店铺所属行业
					  'shop_city': undefined,                       //店铺所在城市
					  'single_trade_min': undefined,                       //单笔交易最小值
					  'single_trade_max': undefined,                       //单笔交易最大值
					  'daily_trade_max': undefined,                        //每日最大交易额
					  'working_start_hour': undefined,                     //每日营业开始时间
					  'working_end_hour': undefined,  //营业结束时间
					  'alipay_enable': undefined,    //支付宝是否启用
					  'wepay_enable': undefined,     //微信是否启用
					  'unionpay_enable': undefined,    //云闪付是否启用
					  'createdAt': undefined,    //云闪付是否启用
				  };

				  Object.keys(data).forEach(function (key) {
					  data[key] = doc[key];
				  });
				  data.id = doc['id'];
				  data.shop_id = doc['shop_id'] || doc['yst_id'];
				  data.shop_channel = doc['shop_channel'] || doc['channel_id'];
				  data.shop_qrcode = doc['shop_qrcode'] || doc['yst_qrcode'];
				  return data;
			  }));
		  });
		  result = null;
		  materialDocArr.sort(function (a, b) {
			  return a.createdAt - b.createdAt;
		  });
		  dataArr = materialDocArr.slice(_page * _limit, _page * _limit + _limit);
		  resObj = gCache.GenResponseObject(0);
		  resObj.data = dataArr;
		  resObj.total = materialDocArr.length;
		  resObj.page = _page;
		  resObj.limit = _limit;
		  res.json(resObj);
		  materialDocArr = null;
		  dataArr = null;
	  });
  })
  .post(function (req, res, next) {
	  let channelId = req.params['channelId'];
	  let materialId = req.params['materialId'];
	  let myUserDoc = req.userDoc;
	  let isAdmin = req.isAdmin, objClass, postData, resObj;

	  if (!channelId || !materialId) {
		  resObj = gCache.GenResponseObject(7);
		  resObj.err_desc = '更新 或者 增加 数据的时候，必须指定通道ID 和 物料ID';
		  res.json(resObj);
		  return;
	  }
	  objClass = gCache.UPStreamsById[channelId];
	  if (!objClass) {
		  //通道不存在，或者已经下架
		  resObj = gCache.GenResponseObject(106);
		  res.json(resObj);
		  return;
	  }
	  postData = req.body;
	  if (!postData) {
		  resObj = gCache.GenResponseObject(101);
		  res.json(resObj);
		  return;
	  }
	  if (!postData.shop_id || (postData.shop_qrcode && typeof postData.shop_qrcode !== 'string')) {
		  resObj = gCache.GenResponseObject(102);
		  res.json(resObj);
		  return;
	  }
	  if (!isAdmin) {
		  postData.ds_user_id = myUserDoc.group_id;
	  }
	  postData.shop_id = materialId;
	  objClass.upInsertMaterial(postData, function (error, savedDoc) {
		  if (error) {
			  resObj = gCache.GenResponseObject(1);
			  res.json(resObj);
			  return;
		  }

		  resObj = gCache.GenResponseObject(0);
		  resObj.data = gCache.UniversalMasterialObject(savedDoc);
		  res.json(resObj);
	  })
  })
  .delete(function (req, res, next) {
	  let channelId = req.params['channelId'];
	  let materialId = req.params['materialId'];
	  let myUserDoc = req.userDoc;
	  let isAdmin = req.isAdmin, objClass, resObj;

	  if (!channelId || !materialId) {
		  resObj = gCache.GenResponseObject(7);
		  resObj.err_desc = '删除 物料 数据的时候，必须指定通道ID 和 物料ID';
		  res.json(resObj);
		  return;
	  }
	  objClass = gCache.UPStreamsById[channelId];
	  if (!objClass) {
		  //通道不存在，或者已经下架
		  resObj = gCache.GenResponseObject(106);
		  res.json(resObj);
		  return;
	  }
	  let conditions = {'shop_id': materialId, 'ds_user_id': myUserDoc.group_id};
	  if (isAdmin) {
		  delete conditions.ds_user_id;
	  }
	  objClass.removeMaterial(conditions, function (error, savedDoc) {
		  if (error) {
			  resObj = gCache.GenResponseObject(1);
			  res.json(resObj);
			  return;
		  }
		  resObj = gCache.GenResponseObject(0);
		  resObj.data = gCache.UniversalMasterialObject(savedDoc);
		  res.json(resObj);
	  })
  });

/** 短信提交接口*/
BackEndApiRouter.route('/sms/log/:userId')
  .get(function (req, res, next) {
	  //todo: 查询短信对应的订单情况
  })
  .post(function (req, res, next) {
	  //刷新一下 token
	  Logger.info(req.body);

	  let resObj;
	  let sender = req.body['from'];
	  let receiver = req.body['sent_to'];
	  let type = req.body['type'];
	  let msgText = req.body['message'];
	  let sentTime = req.body['sent_timestamp '];

	  Models.ClientMsgLogModel.create({
		  'from_mobile': sender,                             //发送方
		  'to_mobile': receiver,                               //接收方
		  'msg_type': type,   //客户端上传消息类型
		  'received_time': new Date(sentTime),     //接收时间- 设备上接收到的时间
		  'sms_data': msgText,         //短信文本
		  'bind_order_id': undefined,    //绑定的 order id（订单ID）
		  'payment_type': undefined,         //入账还是出账
		  'payment_time': undefined,           //付款时间
		  'pay_number': undefined,           //付款/出款的金额
		  'bank_account': undefined,    //付款账号
		  'bank_mark': undefined,       //银行代码
		  'bank_name': undefined,       //银行全称
		  'balance': undefined,                     //变动后的余额
	  }, function (error, clientMsgDoc) {
		  if (error) {
			  Logger.error(error);
			  resObj = gCache.GenResponseObject(1);
			  resObj.session_token = gCache.makeUserJWTToken(req.userDoc);
			  res.json(resObj);
			  error = null;
			  return;
		  }

		  resObj = gCache.GenResponseObject(0);
		  resObj.session_token = gCache.makeUserJWTToken(req.userDoc);
		  res.json(resObj);

		  //todo: clientMsgDoc 加工

	  });
  });

/** 通过 IMEI 查询卡槽及号码信息 */
BackEndApiRouter.route('/device/:imeiNum')
  .get(function (req, res, next) {
	  let imeiNum = req.params['imeiNum'], resObj;
	  if (!imeiNum) {
		  resObj = gCache.GenResponseObject(101);
		  res.status(404).end();
		  return;
	  }
	  Models.SmsPhoneNumberLogModel.findOne({'imei': imeiNum}).exec()
		.then(function (deviceDoc) {
			if (!deviceDoc) {
				resObj = gCache.GenResponseObject(211);
				res.json(resObj);
				return;
			}
			resObj = gCache.GenResponseObject(0);
			resObj.mobile_number = deviceDoc.mobile_number;
			resObj.imei = deviceDoc.imei;
			resObj.slot_number = parseInt(deviceDoc.slot_number, 10);
			resObj.session_token = gCache.makeUserJWTToken(req['userDoc']);
			res.json(resObj);
		})
		.catch(function (error) {
			Logger.error(error);
			resObj = gCache.GenResponseObject(1);
			res.json(resObj);
			error = null;
		})
  });

/** 店铺/个码 提交接口*/
BackEndApiRouter.route('/shop/info/:userId')
  .get(function (req, res, next) {
	  let resObj, userId = req.params['userId'];
	  Models.GeneralPayShopModel.find({'ds_user_id': userId}).sort({'shop_id': -1}).exec()
		.then(function (shopDocArr) {
			resObj = gCache.GenResponseObject(0);
			resObj.data = shopDocArr.map(function (shopDoc) {
				return shopDoc.toObject({
					hide: '_id,shop_login_pass,shop_withdraw_pass,shop_cookie,qrcode_image,priority,terminal_serial',
					transform: true,
				})
			});
			res.json(resObj);
		})
		.catch(function (error) {
			Logger.error(error);
			error = null;
			resObj = gCache.GenResponseObject(1);
			res.json(resObj);
		})
  })
  .post(function (req, res, next) {
	  //刷新一下 token
	  let resObj, userId = req.params['userId'];
	  let postData = req.body;
	  Logger.info(req.body);

	  if (!postData.shop_qrcode || !postData.qrcode_image || !postData.bank_account || !postData.bind_mobile) {
		  resObj = gCache.GenResponseObject(101);
		  res.json(resObj);
		  return;
	  }

	  if (isNaN(postData.single_trade_max) || isNaN(postData.daily_trade_max) || isNaN(postData.working_start_hour) || isNaN(postData.working_end_hour)) {
		  resObj = gCache.GenResponseObject(102);
		  res.json(resObj);
		  return;
	  }

	  let t;
	  postData.ds_user_id = userId;
	  postData.single_trade_min = 10100;
	  postData.single_trade_max = Number.parseInt(postData.single_trade_max, 10);
	  postData.daily_trade_max = Number.parseInt(postData.daily_trade_max, 10);
	  postData.working_start_hour = Number.parseInt(postData.working_start_hour, 10);
	  postData.working_end_hour = Number.parseInt(postData.working_end_hour, 10);

	  t = Math.min(postData.working_start_hour, postData.working_end_hour);
	  postData.working_end_hour = Math.max(postData.working_start_hour, postData.working_end_hour);
	  postData.working_start_hour = t;
	  postData.daily_trade_max = Math.max(postData.single_trade_max, postData.daily_trade_max, postData.single_trade_min, 1000000);
	  postData.alipay_enable = !!postData.alipay_enable;
	  postData.wepay_enable = !!postData.wepay_enable;
	  postData.unionpay_enable = !!postData.unionpay_enable;

	  Models.GeneralPayShopModel.create(postData, function (error, shopDoc) {
		  if (error) {
			  Logger.error(error);
			  error = null;
			  resObj = gCache.GenResponseObject(1);
			  res.json(resObj);
			  return;
		  }
		  resObj = gCache.GenResponseObject(1);
		  // resObj.session_token = gCache.makeUserJWTToken(req.userDoc );
		  res.json(resObj);
		  shopDoc = null;
	  });
  });

module.exports = BackEndApiRouter;
