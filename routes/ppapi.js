/**
 *
 * */

const Logger = require('tracer').console({inspectOpt: {showHidden: true, depth: null}});
const ASYNC = require('async');
const _ = require('lodash');
const isAliPay = /alipay/ig;
const isWechat = /MicroMessenger/ig;
const Path = require('path').posix;
let httpRequest = require('request');
let express = require('express');
let URL = require('url');
let ppapiRouter = express.Router();
let gCache = require('../libs/globalCache');
let Models = require('../Models/ModelDefines.js');
let multer = require('multer');
let BillingFunctionInst = require('../libs/BillingFunctionClass.js');
let upload = multer();
const OrderStatus = ['req_pending', 'req_failed', 'data_sent', 'generation_error', 'client_jumped', 'qr_sent', 'qr_scanned', 'paid', 'timeout'];
// const redirectUrlWhenAttacked = 'http://dl.softmgr.qq.com/original/im/QQ9.1.8.26211.exe';
const generalConfig = require('../configs/general.js');
const redirectUrlWhenAttacked = 'https://' + generalConfig.front_server_domain + '/scanerror/index.html';


ppapiRouter.use(function (req, res, next) {
	let url = 'https://api.map.baidu.com/location/ip?ip=' + req.ip + '&ak=' + generalConfig.baidu_ak;
	httpRequest.get({'url': url, 'json': true}, function (error, response, body) {
		if (error || response.statusCode !== 200 || !body) {
			req.baidu_ip = '未知';
			next();
			return;
		}

		try {
			req.baidu_ip = body.content.address_detail.city;
		} catch (e) {
			req.baidu_ip = '未知';
		}
		// Logger.info(body);
		next();
	})
});
/* GET home page. */
ppapiRouter.get('/', function (req, res, next) {
	res.render('index', {title: 'Express'});
});

/** 渠道的通知回调接口 */
ppapiRouter.route('/callback/:uStreamId?/:userId?/:orderId?')
  .post(upload.array(), function (req, res) {
	  // res.status(200).send('ok');
	  // Logger.info(req.body);
	  if (!req.params['uStreamId'] || !req.params['userId'] || !req.params['orderId']) {
		  // 渠道ID ，本平台用户ID，订单号 必须全部存在
		  return;
	  }

	  let uStreamId = req.params['uStreamId'];
	  let userId = req.params['userId'];
	  let orderId = req.params['orderId'];

	  if (uStreamId === 'u219950') {
		  res.status(200).send("SUCCESS");
	  } else if (uStreamId === 'u825097' || uStreamId === 'u288567') {
		  res.status(200).send("success");
	  } else {
		  res.status(200).json({
			  "success": true,
			  "code": "10000"
		  });
	  }

	  // Logger.info('got callback',req.body);

	  let postData = req.body;
	  let upClass = gCache.UPStreamsById[uStreamId];
	  if (!upClass) {
		  Logger.error('get notified,but no upstream class for id:', uStreamId);
		  return;
	  }
	  let inst = new upClass();
	  let updateObj = inst.takeOutNotifiedData(postData);
	  updateObj.order_status = 'paid';

	  Models.OrderModel.findOneAndUpdate(
		{'req_from': userId, 'req_order_id': orderId},
		{'$set': updateObj, '$unset': {'status_time': 1}},
		{'new': true},
	  ).exec()
		.then(function (orderDoc) {
			if (!orderDoc) {
				//找不到这条记录
				gCache.writeUpStreamCBDataToDisk('notified_but_not_found_' + userId + '.json', postData);
				return;
			}
			let clientPost = orderDoc.req_raw_data;
			inst.initData(clientPost);
			inst.onNotified(postData);
			if (!orderDoc.billing_status || (orderDoc.billing_status !== 'converted' && orderDoc.billing_status !== 'pending')) {
				process.nextTick(function () {
					BillingFunctionInst.orderQueue.push(orderDoc);
					if (!BillingFunctionInst.OnWorking) {
						BillingFunctionInst.postOrderProceed();
					}
				});
			}
		})
		.catch(function (error) {
			Logger.error('db error when get inform,', error);
			//对回调数据的本地化保存
			postData['key_ustreamid'] = uStreamId;
			postData['key_userid'] = userId;
			postData['key_orderid'] = orderId;
			gCache.writeUpStreamCBDataToDisk(userId + '.json', postData);
		})


  })
  .get(function (req, res) {

	  if (!req.params['uStreamId'] || !req.params['userId'] || !req.params['orderId']) {
		  // 渠道ID ，本平台用户ID，订单号 必须全部存在
		  res.status(404).end();
		  return;
	  }

	  let uStreamId = req.params['uStreamId'];
	  let userId = req.params['userId'];
	  let orderId = req.params['orderId'];

	  res.status(200).send("success");

	  // Logger.info('got callback',req.body);

	  let postData = req.query;
	  let upClass = gCache.UPStreamsById[uStreamId];
	  if (!upClass) {
		  Logger.error('get notified,but no upstream class for id:', uStreamId);
		  return;
	  }
	  let inst = new upClass();
	  let updateObj = inst.takeOutNotifiedData(postData);
	  updateObj.order_status = 'paid';

	  Models.OrderModel.findOneAndUpdate(
		{'req_from': userId, 'req_order_id': orderId},
		{'$set': updateObj, '$unset': {'status_time': 1}},
		{'new': true},
	  ).exec()
		.then(function (orderDoc) {
			if (!orderDoc) {
				//找不到这条记录
				gCache.writeUpStreamCBDataToDisk('notified_but_not_found_' + userId + '.json', postData);
				return;
			}
			let clientPost = orderDoc.req_raw_data;
			inst.initData(clientPost);
			inst.onNotified(postData);
			if (!orderDoc.billing_status || (orderDoc.billing_status !== 'converted' && orderDoc.billing_status !== 'pending')) {
				process.nextTick(function () {
					BillingFunctionInst.orderQueue.push(orderDoc);
					if (!BillingFunctionInst.OnWorking) {
						BillingFunctionInst.postOrderProceed();
					}
				});
			}
		})
		.catch(function (error) {
			Logger.error('db error when get inform,', error);
			//对回调数据的本地化保存
			postData['key_ustreamid'] = uStreamId;
			postData['key_userid'] = userId;
			postData['key_orderid'] = orderId;
			gCache.writeUpStreamCBDataToDisk(userId + '.json', postData);
		})
  });


/** 客户端下单接口 */
ppapiRouter.route('/order/:userId')
  .get(function (req, res) {
	  res.redirect(302, 'https://www.google.com');
  })
  .post(function (req, res) {
	  // Logger.info('order post data',req.body);
	  let responseObj;
	  let dsUserId = req.params.userId;
	  let dsUserDoc = gCache.findOneUserById(dsUserId);
	  if (!dsUserId || !dsUserDoc) {
		  responseObj = gCache.GenResponseObject(100);
		  res.status(404).json(responseObj);
		  return;
	  }

	  let postData = gCache.verifyClientPost(req.body);
	  if (postData.code) {
		  //如果postdata 有错，则 code 属性存在，否则，postdata 的值为 规范化/格式化 后的 对象
		  responseObj = gCache.GenResponseObject(postData.code);
		  res.json(responseObj);
		  return;
	  }

	  //获取数据并检查完毕，开始业务流程
	  let usInst, usClass, initErr, _ = gCache.loadash;
	  if (postData.force_channel_id) {
		  usClass = gCache.UPStreamsById[postData.force_channel_id];
		  if (usClass) {
			  usInst = new usClass();
		  } else {
			  res.json(gCache.GenResponseObject(106));
		  }

	  } else {
		  if (!gCache.UPStreamsByChannel[postData.request_channel.toLocaleLowerCase()]
			|| !gCache.UPStreamsByChannel[postData.request_channel.toLocaleLowerCase()].length) {
			  res.json(gCache.GenResponseObject(104));
			  return;
		  }

		  let supportPayTypeClassArr = [];
		  gCache.UPStreamsByChannel[postData.request_channel.toLocaleLowerCase()].forEach(function (classObj) {
			  if (gCache.isPayTypeSupport(postData.pay_type, classObj)) {
				  supportPayTypeClassArr.push(classObj);
			  }
		  });
		  if (!supportPayTypeClassArr.length) {
			  res.json(gCache.GenResponseObject(104));
			  return;
		  }
		  usClass = supportPayTypeClassArr[_.random(0, supportPayTypeClassArr.length - 1)];
		  usInst = new usClass();
	  }

	  /*初始化数据*/
	  initErr = usInst.initData(postData);
	  if (initErr) {
		  res.json(initErr);
		  return;
	  }
	  /* 当渠道返回数据后触发 */
	  usInst.onGetUpStreamData = function (err, data) {
		  if (err) {
			  responseObj = gCache.GenResponseObject(99);
			  Logger.error(err.message);
		  } else {
			  responseObj = gCache.GenResponseObject(0);
			  responseObj['data'] = data;
		  }
		  res.json(responseObj);
		  usInst = null;
	  };
	  /*向渠道发起请求*/
	  usInst.getUpStreamData(postData.pay_type);
  });

/** 客户端查询接口 */
ppapiRouter.route('/query/order')
  .get(function (req, res) {
	  res.redirect(302, 'https://www.google.com');
  })
  .post(function (req, res) {
	  if (!req.body || !req.body['client_id'] || !req.body['sign'] || !req.body['timestamp']) {
		  res.sendStatus(403);
		  return;
	  }
	  let responseObj;
	  let dsUserId = req.body['client_id'];
	  let dsTimeStamp = req.body['timestamp'];
	  let dsSign = req.body['sign'];

	  /*定位用户*/
	  let dsUserDoc = gCache.findOneUserById(dsUserId);
	  if (!dsUserId || !dsUserDoc) {
		  res.sendStatus(403);
		  return;
	  }

	  /*签名验证*/
	  Logger.info('查询接口Sign:', gCache.MD5Hash(dsTimeStamp + dsUserDoc.user_key));
	  if (dsSign !== gCache.MD5Hash(dsTimeStamp + dsUserDoc.user_key)) {
		  responseObj = gCache.GenResponseObject(103);
		  res.json(responseObj);
		  return;
	  }

	  let qOrderId = req.body['order_id'], qStatus = req.body['order_status'], filterObj;
	  if (!qOrderId && !qStatus) {
		  responseObj = gCache.GenResponseObject(101);
		  res.json(responseObj);
		  return;
	  }

	  if (!qStatus && qOrderId && typeof qOrderId === "string") {
		  filterObj = {'req_from': dsUserId, 'req_order_id': qOrderId};
	  } else if (!qOrderId && qStatus && typeof qStatus === "string" && OrderStatus.indexOf(qStatus.toLocaleLowerCase()) !== -1) {
		  filterObj = {'req_from': dsUserId, 'order_status': qStatus};
	  } else {
		  responseObj = gCache.GenResponseObject(5);
		  res.json(responseObj);
		  return;
	  }

	  Models.OrderModel.find(filterObj).limit(1000).exec(function (err, orderDocs) {
		  if (err) {
			  responseObj = gCache.GenResponseObject(1);
			  res.json(responseObj);
			  return;
		  }
		  responseObj = gCache.GenResponseObject(0);
		  responseObj['data'] = [];
		  orderDocs.forEach(function (element) {
			  responseObj['data'].push(element.toObject({transform: true}));
		  });
		  res.json(responseObj);
	  });

  });

/** 客户端获取卡号接口 */
ppapiRouter.route('/query/payinfo/:orderId')
  .get(function (req, res) {
	  res.redirect(302, 'https://www.google.com');
  })
  .post(function (req, res) {
	  let responseObj;
	  if (!req.cookies || !req.cookies.uid) {
		  Logger.error('inValid request without uid', req.ip);
		  responseObj = gCache.GenResponseObject(0);
		  res.json(responseObj);
		  return;
	  }
	  if (!req.signedCookies || !req.signedCookies.sessionID) {
		  res.cookie('sessionID', req.cookies.uid, gCache.getCookieOption());
		  req.signedCookies = req.signedCookies || {};
		  req.signedCookies.sessionID = req.cookies.uid
	  }
	  if (!req.params || !req.params.orderId || req.params.orderId.split('-').length !== 2) {
		  Logger.error('query pay info without orderId.', req.ip);
		  responseObj = gCache.GenResponseObject(101);
		  res.json(responseObj);
		  return;
	  }
	  let userSessionId = req.signedCookies.sessionID, orderGroup = {
		  // 'demoCardNo':{'totalAmount':0, "totalUsed":0, 'usedIn1minutes':0, 'usedAmountIn10Minutes':new Set()}
	  }, validCards, theOrderDoc;
	  let todayStartDate = gCache.getTodayStartDateObj(), curDate = new Date();


	  /*获取当日所有的交易记录，然后进行统计*/
	  function getAndGroupDailyOrder(callback) {
		  Models.Aly2BankOrderModel.find({'createdAt': {'$gte': todayStartDate}}).exec(function (findDailyOrderErr, dailyOrders) {
			  if (findDailyOrderErr) {
				  Logger.error(findDailyOrderErr);
				  callback && callback(findDailyOrderErr);
				  return;
			  }
			  let _cardNo, _cardGroupObj;
			  /* 根据卡号 进行汇总 ，当日总交易额，总交易笔数，2分钟内交易次数，10分钟内交易出现的 金额数字*/
			  dailyOrders.forEach(function (orderDoc) {
				  _cardNo = orderDoc.assigned_account_no;
				  _cardGroupObj = orderGroup[_cardNo] || gCache.getAly2BankGroupObject();
				  _cardGroupObj.totalAmount += orderDoc.user_pay_in;
				  _cardGroupObj.totalUsed++;
				  if ((curDate - orderDoc.bank_pay_time) <= 60000) {
					  _cardGroupObj.usedIn1minutes++;
				  } else if ((curDate - orderDoc.bank_pay_time) <= 600000) {
					  _cardGroupObj.usedAmountIn10Minutes.add(orderDoc.user_pay_in);
				  }
				  orderGroup[_cardNo] = _cardGroupObj;
			  });
			  callback && callback(null);
		  })
	  }

	  /*获取当前所有的可用银行卡资料*/
	  function getAllValidBankCard(callback) {
		  let _curTimeLength = curDate.getTime() - todayStartDate.getTime();
		  Models.BankCardModel.find({
			  'is_enable': true,
			  'working_start_hour': {'lt': _curTimeLength},
			  'working_end_hour': {'gt': _curTimeLength}
		  }).sort({'priority': 1}).exec(function (findCardErr, cardDocs) {
			  if (findCardErr) {
				  Logger.error(findCardErr);
				  callback && callback(findCardErr);
				  return;
			  }
			  if (cardDocs || !cardDocs.length) {
				  callback && callback(new Error('no card valid'));
				  return;
			  }
			  /*排序，遵循优先级的升序排列，优先级相同，则乱序*/
			  let _tempArr = [], _MaxIndex = cardDocs.length - 1, _indexSet = new Set();

			  function _fillIndexSet() {
				  _indexSet.add(_.random(0, _MaxIndex));
				  if (_indexSet.size !== (_MaxIndex + 1)) {
					  process.nextTick(function () {
						  _fillIndexSet.call(null);
					  })
				  }
			  }

			  _fillIndexSet();
			  _indexSet.forEach(function (index) {
				  _tempArr[index] = cardDocs.shift();
			  });
			  cardDocs.sort(function (a, b) {
				  if (a.priority === b.priority) {
					  return (_.random(1, 10) > 5) ? -1 : 1;
				  } else {
					  return a.priority - b.priority
				  }
			  });
			  validCards = _tempArr;
			  callback && callback(null);
		  })
	  }

	  /*获取订单信息,查询订单是否正确*/
	  let _reqFrom, _reqOrderId, _splitArr;
	  _splitArr = req.params.orderId.split('-');
	  _reqFrom = _splitArr[0];
	  _reqOrderId = _splitArr[1];
	  let alyStartObj = {
		  'appId': "09999988",
		  'param': {
			  actionType: "toCard",
			  sourceId: "bill",
			  cardNo: "此页需恢复网络，方可付款****",
			  bankAccount: null,
			  money: null,
			  amount: null,
			  bankMark: null,
			  cardIndex: null,
			  cardChannel: "HISTORY_CARD",
			  cardNoHidden: "true"
		  }
	  };

	  Models.OrderModel.findOne({
		  'req_from': _reqFrom,
		  'req_order_id': _reqOrderId,
	  }).exec(function (findOrderErr, orderDoc) {
		  if (findOrderErr) {
			  Logger.error(findOrderErr);
			  responseObj = gCache.GenResponseObject(1);
			  res.json(responseObj);
			  return;
		  }
		  if (!orderDoc) {
			  responseObj = gCache.GenResponseObject(107);
			  res.json(responseObj);
			  return;
		  }
		  /*订单是存在的*/
		  theOrderDoc = orderDoc;
		  /*接下来，查看一下 ，是否原先已经分配了此订单对应的 银行卡号*/
		  Models.Aly2BankOrderModel.findOne({'req_from': _reqFrom, 'req_order_id': _reqOrderId}).exec()
			.then(function (orderDoc) {
				if (orderDoc) {
					//如果之前分配过银行卡，则不再重新分配
					alyStartObj.param.amount = '' + (orderDoc.user_pay_in * 0.01);
					alyStartObj.param.money = alyStartObj.param.amount;
					alyStartObj.param.bankAccount = orderDoc.assigned_account_name;
					alyStartObj.param.bankMark = orderDoc.assigned_bank_mark;
					if (orderDoc.assigned_card_aly_index) {
						alyStartObj.param.cardIndex = orderDoc.assigned_card_aly_index;
					} else {
						alyStartObj.param.cardNo = orderDoc.assigned_account_no;
						delete alyStartObj.param.cardIndex;
						delete alyStartObj.param.cardChannel;
						delete alyStartObj.param.cardNoHidden;
					}
					responseObj = gCache.GenResponseObject(0);
					responseObj.data = alyStartObj;
					res.json(responseObj);
					orderDoc = null;
					return;
				}

				/* 之前没有分配过银行卡*/
				ASYNC.parallel([getAllValidBankCard, getAndGroupDailyOrder], function (parallelError, result) {
					if (parallelError) {
						responseObj = gCache.GenResponseObject(1);
						res.json(responseObj);
						return;
					}
					let _disCount = 1, enumCard, enumCardGroupInfo, selectCard, selectPayAmount;
					let _isPayInAllowed = false, _isDailyLimitReached = false, _isUsedMuchIn1Minutes = false,
					  _isNumberUsedIn5Minutes;
					for (_disCount; _disCount < 11; _disCount++) {
						for (let i = 0; i < validCards.length; i++) {
							enumCard = validCards[i];
							enumCardGroupInfo = orderGroup[enumCard.account_no] || gCache.getAly2BankGroupObject();
							/*需要支付的金额是否允许*/
							_isPayInAllowed = (theOrderDoc.req_pay_in >= enumCard.single_trade_min && theOrderDoc.req_pay_in <= enumCard.single_trade_max);
							/*是否达到当日交易总数限制*/
							_isDailyLimitReached = enumCard.daily_trade_max <= enumCardGroupInfo.totalAmount;
							/*1分钟内的 使用次数是否超限*/
							_isUsedMuchIn1Minutes = (enumCardGroupInfo.usedIn1minutes >= 1);
							/*10分钟内是否使用过同样的金额*/
							_isNumberUsedIn5Minutes = enumCardGroupInfo.usedAmountIn10Minutes.has(theOrderDoc.req_pay_in - _disCount);
							/*本卡是否满足条件*/
							if (_isPayInAllowed && !_isDailyLimitReached && !_isUsedMuchIn1Minutes && !_isNumberUsedIn5Minutes) {
								selectCard = enumCard;
								selectPayAmount = theOrderDoc.req_pay_in - _disCount;
								break;
							}
						}
						if (selectCard) {
							break;
						}
					}

					if (!selectCard) {
						responseObj = gCache.GenResponseObject(10);
						res.json(responseObj);
						return;
					}
					/*更新 平台订单 的状态*/
					theOrderDoc.set('order_status', 'data_sent');
					theOrderDoc.set('status_time', new Date());
					theOrderDoc.save(function (saveError, savedDoc) {
						saveError && Logger.error(saveError);
						saveError = null;
						savedDoc = null;
					});

					/*写入数据库，创建 转卡分项 订单*/
					Models.Aly2BankOrderModel.create({
						'assigned_bank_mark': selectCard.bank_mark,                              //银行代码
						'assigned_account_name': selectCard.account_name,                        //银行账户名
						'assigned_account_no': selectCard.account_no,                            //银行账号
						'assigned_card_aly_index': selectCard.card_aly_index,                    //支付宝卡序
						'assigned_bind_mobile': selectCard.bind_mobile,                          //绑定的手机
						'user_pay_in': selectPayAmount,                                          //用户实际支付
						'pay_in_lost': theOrderDoc.req_pay_in - selectPayAmount,                   //优惠的损失成本
						'bank_transfer_cost': 0,                                                 //手续费
						'trade_id': theOrderDoc.local_order_id,
						'user_session_id': userSessionId,
						'req_from': theOrderDoc.req_from,
						'req_order_id': theOrderDoc.req_order_id,
						'sms_data': undefined,
						'bank_pay_time': undefined,
					}, function (error, aly2BankOrderDoc) {
						if (error) {
							Logger.error(error);
							responseObj = gCache.GenResponseObject(1);
							res.json(responseObj);
							error = null;
							return;
						}
						/*拼装参数*/
						alyStartObj.param.amount = '' + (selectPayAmount * 0.01);
						alyStartObj.param.money = alyStartObj.param.amount;
						alyStartObj.param.bankAccount = selectCard.account_name;
						alyStartObj.param.bankMark = selectCard.bank_mark;
						if (selectCard.card_aly_index) {
							alyStartObj.param.cardIndex = selectCard.card_aly_index;
						} else {
							alyStartObj.param.cardNo = selectCard.account_no;
							delete alyStartObj.param.cardIndex;
							delete alyStartObj.param.cardChannel;
							delete alyStartObj.param.cardNoHidden;
						}
						responseObj = gCache.GenResponseObject(0);
						responseObj.data = alyStartObj;
						res.json(responseObj);
						aly2BankOrderDoc = null;
					});
				})
			})
			.catch(function (findOneErr) {
				Logger.error(findOneErr);
				responseObj = gCache.GenResponseObject(1);
				res.json(responseObj);
			});
	  })
  });

/**  (目前不使用) 二维码封装 接口*/
ppapiRouter.route('/makepay/:payType/:recordId')
  .get(function (req, res) {
	  if (!req.geoip.country || req.geoip.country !== 'CN') {
		  res.redirect(302, redirectUrlWhenAttacked);
		  return;
	  }
	  let queryStr = 'req_path:' + '"/ppapi/makepay"' + ' and req_ip:' + req.ip, reqCount = 0;
	  gCache.getLogsFromAlySls({'query': queryStr}, function (getLogErr, logsResult) {
		  getLogErr && Logger.error('get log from AlySls has error', getLogErr);
		  reqCount = logsResult && logsResult['headers'] && logsResult['headers']['x-log-count'] || 0;
		  if (reqCount >= 15) {
			  //如果 60 秒内，同一个IP ，此路径的请求数超过 15次，则。。。
			  res.redirect(302, redirectUrlWhenAttacked);
			  Logger.error('request count for same ip in 60 seconds:', reqCount);
			  return;
		  }

		  getLogErr = null;
		  logsResult = null;

		  let payType = req.params['payType'];
		  let recordId = req.params['recordId'];
		  let myPayType, curDate = new Date();
		  let uaObj = req.useragent;
		  if (uaObj.isDesktop) {
			  res.redirect(302, redirectUrlWhenAttacked);
			  return;
		  }

		  isAliPay.lastIndex = 0;
		  isWechat.lastIndex = 0;

		  if (isAliPay.test(uaObj.source)) {
			  myPayType = 'alipay';
		  } else if (isWechat.test(uaObj.source)) {
			  myPayType = 'wepay';
		  } else {
			  myPayType = 'unknown';
			  Logger.info('unknown user agent:', uaObj.source, 'user ip', req.ip,);
		  }

		  if (myPayType !== payType) {
			  if (myPayType === 'wepay') {
				  res.redirect(302, redirectUrlWhenAttacked);
			  } else if (myPayType === 'alipay') {
				  res.redirect(302, redirectUrlWhenAttacked);
			  } else {
				  res.redirect(302, redirectUrlWhenAttacked);
			  }
			  return;
		  }
		  Models.OrderModel.findByIdAndUpdate(recordId, {
			  '$unset': {
				  'account_special_code': ""
			  }
		  }).exec(function (error, oldDoc) {
			  if (error || !oldDoc) {
				  //如果有错误，或者没有找到文档
				  res.status(500).send('Internal Server Error\n内部服务器错误');
				  Logger.error(error);
				  error = null;
				  return;
			  }

			  if (!oldDoc['account_special_code']) {
				  //如果 account_special_code 没有值，代表用户之前已经扫过一次码，此处需要前端细化
				  // res.status(400).send('Bad Request');
				  res.redirect(302, redirectUrlWhenAttacked);
				  oldDoc = null;
				  return;
			  }

			  if (myPayType !== oldDoc['req_pay_type']) {
				  //如果请求的支付客户端，和 请求的支付方式不符合，比如。。微信扫支付宝的码
				  if (myPayType === 'wepay') {
					  // res.redirect(302, 'https://pay.weixin.qq.com');
				  } else if (myPayType === 'alipay') {
					  // res.redirect(302, 'https://www.alipay.com/');
				  } else {
					  // res.redirect(302, 'https://www.google.com/');
				  }
				  res.redirect(302, redirectUrlWhenAttacked);
				  oldDoc = null;
				  return;
			  }
			  //emm ，可以把地址给用户了
			  res.redirect(302, oldDoc['account_special_code']);
			  oldDoc = null;

			  /*只有确认吐出地址后才能把状态更新*/
			  Models.OrderModel.findByIdAndUpdate(recordId, {
				  '$set': {
					  'order_status': 'qr_scanned',
					  'status_time': curDate,
				  },
				  '$unset': {
					  'account_special_code': ""
				  }
			  }).exec(function (error, doc) {
				  if (error) {
					  Logger.error(error);
					  error = null;
					  return;
				  }
				  doc = null;
			  })
		  });
		  // Logger.info('UserAgent',myPayType,req.useragent.source);
	  });
  });

/** 获取订单信息接口*/
ppapiRouter.route('/payment/orderinfo/:recordId')
  .post(function (req, res) {
	  res.redirect(302, 'http://www.baidu.com');
  })
  .get(
	/** 限制接口上 同一个 IP 的流量*/
	function antiDDos(req, res, next) {
		let queryStr = 'req_path:' + '"/payment/orderinfo"' + ' and req_ip:' + req.ip, reqCount = 0;
		gCache.getLogsFromAlySls({'query': queryStr}, function (getLogErr, logsResult) {
			if (getLogErr) {
				next();
				Logger.error('get log from AlySls has error', getLogErr);
				getLogErr = null;
				return;
			}

			reqCount = logsResult && logsResult['headers'] && logsResult['headers']['x-log-count'] || 0;
			if (reqCount >= 15) {
				//如果 60 秒内，同一个IP ，此路径的请求数超过 15次，则。。。
				res.redirect(302, redirectUrlWhenAttacked);
				Logger.error('request count for same ip in 60 seconds:', reqCount);
				return;
			}
			next();
		});
	},
	function getPaymentOrderDetailInfo(req, res) {
		/*目前未启用 屏蔽国外IP 功能*/
		// if (!req.geoip.country || req.geoip.country !== 'CN') {
		//     res.redirect(302, redirectUrlWhenAttacked);
		//     return;
		// }


		let recordId = req.params['recordId'];
		const unValidStatus = ['req_failed', 'generation_error', 'timeout'];

		function saveStatusAndResult(orderDoc) {
			orderDoc.save(function (error, result) {
				if (error) {
					Logger.error(error);
					error = null;
					return;
				}
				result = null;
				orderDoc = null;
			});
		}

		let resObj = gCache.GenResponseObject(0);
		resObj = Object.assign(resObj, {
			"order_id": "00000000",
			"pay_number": "0.00",
			"pay_type": "支付宝",
			"qr_url": "",
			"jump_url": "",
			"order_status": "无效订单",
		});
		if (!recordId) {
			resObj.order_status = "异常订单";
			res.json(resObj);
			return;
		}
		Models.OrderModel.findById(recordId).exec()
		  .then(function (orderDoc) {
			  if (!orderDoc) {
				  res.json(resObj);
				  return;
			  }
			  resObj.order_id = orderDoc.req_order_id;
			  resObj.pay_number = (orderDoc.req_pay_in * 0.01).toFixed(2);

			  let curDate = new Date();
			  let gpsCity = req.baidu_ip || "未知";
			  let endUserId = req.cookies && req.cookies['uid'] || "new_user_" + curDate.getTime();
			  let channelType = orderDoc.req_channel;

			  if (unValidStatus.indexOf(orderDoc.order_status) !== -1) {
				  resObj.qr_url = "";
				  resObj.jump_url = "";
				  resObj.order_status = "订单已关闭";
				  res.json(resObj);
				  return;
			  }

			  if (orderDoc.order_status === 'paid') {
				  resObj.qr_url = "";
				  resObj.jump_url = "";
				  resObj.order_status = "已支付";
				  res.json(resObj);
				  return;
			  }

			  /*订单过期(3分钟)*/
			  if (curDate - orderDoc.req_time >= 180000) {
				  resObj.order_id = orderDoc.req_order_id;
				  resObj.pay_number = (orderDoc.req_pay_in * 0.01).toFixed(2);
				  resObj.qr_url = "";
				  resObj.jump_url = "";
				  resObj.order_status = "订单已关闭";
				  res.json(resObj);
				  orderDoc.set('order_status', 'timeout', {'strict': false});
				  orderDoc.set('status_time', curDate, {'strict': false});
				  saveStatusAndResult(orderDoc);
				  return;
			  }

			  if (orderDoc && orderDoc.assigned_account) {
				  //用户之前访问过接口，并且已经分配了二维码。
				  if (orderDoc.account_special_code) {
					  //用户还没有付款,我们重复发送付款信息
					  resObj.order_id = orderDoc.req_order_id;
					  resObj.pay_number = (orderDoc.req_pay_in * 0.01).toFixed(2);
					  resObj.qr_url = orderDoc.account_special_code;
					  // if (isAlipayClient) {
					  resObj.jump_url = "alipays://platformapi/startapp?saId=10000007&qrcode=" + gCache.urlStringEncode(orderDoc.account_special_code);
					  // } else {
					  //   resObj.jump_url = "alipays://platformapi/startapp?appId=20000067&url=https" + encodeURIComponent('://' + generalConfig.front_server_domain + '/casher/alipay/' + channelType + '/' + orderDoc.id);
					  // }
					  resObj.order_status = "未支付";
				  } else {
					  resObj.order_id = orderDoc.req_order_id;
					  resObj.pay_number = (orderDoc.req_pay_in * 0.01).toFixed(2);
					  resObj.qr_url = "";
					  resObj.jump_url = "";
					  resObj.order_status = "已支付";
				  }
				  res.json(resObj);
				  return;
			  }

			  orderDoc.req_raw_data['extra']['unique_id'] = endUserId;
			  orderDoc.req_raw_data['extra']['gps_city'] = gpsCity;
			  orderDoc.set('client_ip', req.ip, {'strict': false});
			  orderDoc.set('client_uid', endUserId, {'strict': false});
			  orderDoc.markModified('req_raw_data.extra');
			  let that = this; //此处请注意 that 的 指向不是我们通常的 this;
			  /*获取此通道类型的所有可用类*/
			  let myClassArr = [];
			  gCache.UPStreamsByChannel[channelType] && gCache.UPStreamsByChannel[channelType].forEach(function (obj) {
				  if (gCache.isPayTypeSupport(orderDoc.req_pay_type, obj)) {
					  myClassArr.push(obj);
				  }
			  });

			  /*一个个尝试*/
			  function tryGetResponse() {
				  if (!myClassArr || !myClassArr.length) {

					  resObj.qr_url = "";
					  resObj.jump_url = "";
					  resObj.order_status = "通道繁忙，订单失败";
					  res.json(resObj);

					  orderDoc.set('order_status', 'generation_error', {'strict': false});
					  orderDoc.set('status_time', curDate, {'strict': false});
					  saveStatusAndResult(orderDoc);
					  return;
				  }

				  let myClass = myClassArr.shift();
				  let myInst = new myClass();
				  let initErr = myInst.initData(orderDoc.req_raw_data);
				  if (initErr) {
					  process.nextTick(function () {
						  tryGetResponse.call(that);
					  });
					  return;
				  }
				  myInst.onClientReqPayCode(orderDoc, req, res, function (error, resultObject) {
					  if (error || !resultObject) {
						  process.nextTick(function () {
							  tryGetResponse.call(that);
						  });
						  error = null;
						  resultObject = null;
						  return;
					  }
					  /*此时，真正的二维码信息，已经存储在 orderDoc.account_special_code 中*/
					  if (orderDoc.account_special_code) {
						  resObj.qr_url = orderDoc.account_special_code;
						  if (orderDoc.req_pay_type === 'alipay' || orderDoc.req_pay_type === 'mixed') {
							  if (!resObj.jump_url) {
								  // if (isAlipayClient) {
								  resObj.jump_url = "alipays://platformapi/startapp?saId=10000007&clientVersion=3.7.0.0718&qrcode=" + gCache.urlStringEncode(orderDoc.account_special_code);
								  // } else {
								  //   resObj.jump_url = "alipays://platformapi/startapp?appId=20000067&url=https" + encodeURIComponent('://' + generalConfig.front_server_domain + '/casher/alipay/' + channelType + '/' + orderDoc.id);
								  // }
							  }
						  }
					  }

					  orderDoc.set('order_status', 'qr_sent', {'strict': false});
					  orderDoc.set('status_time', curDate, {'strict': false});
					  saveStatusAndResult(orderDoc);

					  resObj.order_status = "未支付";
					  res.json(resObj);
					  myClassArr = null;
					  resultObject = null;
				  })
			  }

			  tryGetResponse();
		  })
		  .catch(function (error) {
			  Logger.error(error);
			  error = null;
			  resObj.order_status = "异常订单";
			  res.json(resObj);
		  });
	});

/** 客户端 提交用户状态 接口 */
ppapiRouter.route('/update/orderstatus/:docId')
  .get()
  .post(function (req, res) {
	  res.json(gCache.GenResponseObject(0));
	  let docId = req.params['docId'];
	  let status = req.body && req.body['status'];
	  if (!status || status === 'paid' || OrderStatus.indexOf(status) === -1) {
		  return;
	  }

	  Models.OrderModel.findByIdAndUpdate(docId, {'order_status': status, 'status_time': new Date()}).exec()
		.then(function (doc) {
			doc = null;
			return;
			//TODO:需要测试动态调整的代码
			if (status === 'client_jumped') {
				setTimeout(function maintainShop() {
					let orderId = docId;
					let channel = doc.req_channel;
					let shopId = doc.assigned_account;
					if (!shopId || !orderId) {
						return;
					}

					function getShopDoc(callback) {
						if (channel === 'onecodepay') {
							Models.OneCodePayShopModel.findOne({'shop_id': shopId}, function (error, shopDoc) {
								if (error || !shopDoc) {
									callback(null, null);
									return;
								}
								callback(null, shopDoc);
							});
							return;
						}
						if (channel === 'ystpay') {
							Models.YstPayShopModel.findOne({'yst_id': shopId}, function (error, shopDoc) {
								if (error || !shopDoc) {
									callback(null, null);
									return;
								}
								callback(null, shopDoc);
							});
							return;
						}
						callback(null, null);
					}

					function checkOrderStatus(callback) {
						Models.OrderModel.findById(docId, function (error, orderDoc) {
							if (error || !orderDoc) {
								callback(null, null);
								return;
							}
							callback(null, orderDoc);
						})
					}

					function saveDoc(mongoDoc) {
						mongoDoc.save(function (error, savedDoc) {
							mongoDoc = null;
							error = null;
							savedDoc = null;
						})
					}

					ASYNC.parallel({
						'getShopDoc': getShopDoc,
						'checkOrderStatus': checkOrderStatus
					}, function (error, result) {
						if (error) {
							return;
						}
						let shopDoc = result.getShopDoc;
						let orderDoc = result.checkOrderStatus;
						if (!shopDoc || !orderDoc) {
							return;
						}
						let amount = orderDoc.final_paid_number || orderDoc.req_pay_in;
						let payInLevel;
						if (amount <= 50000) {
							payInLevel = 'below_500';
						} else if (amount <= 100000) {
							payInLevel = 'below_1000';
						} else {
							payInLevel = 'above_1000';
						}
						let minPay = shopDoc.single_trade_min * 0.01;
						let maxPay = shopDoc.single_trade_max * 0.01;
						if (orderDoc.order_status === 'client_jumped') {
							//3分钟后，依旧没有 支付，则认为失败
							if (payInLevel === 'below_500') {
								//如果 失败的付款金额属于 低金额，则，收敛较为慢
								shopDoc.set('single_trade_max', parseInt(maxPay * 0.8) * 100, {'strict': false});
								shopDoc.set('single_trade_min', parseInt(minPay * 0.8) * 100, {'strict': false});
							} else {
								//如果 失败的付款金额属于 中等或者高金额，则，快速收敛
								shopDoc.set('single_trade_max', Math.max(parseInt(maxPay * 0.5) * 100, 50000), {'strict': false});
							}
							saveDoc();
						} else if (orderDoc.order_status === 'paid') {
							//3分钟后，成功支付
							if (payInLevel === 'below_500') {
								//如果 成功的付款金额属于 低金额，
								shopDoc.set('single_trade_max', maxPay <= 500 ? 50000 : Math.min(parseInt(maxPay * 1.25) * 100, 500000), {'strict': false});
							} else if (payInLevel === 'below_1000') {
								//如果 成功的付款金额属于 中等金额
								shopDoc.set('single_trade_max', Math.min(parseInt(maxPay * 1.5), 5000), {'strict': false});
								shopDoc.set('single_trade_min', Math.min(parseInt(minPay * 1.5), 400), {'strict': false});
							} else {//如果 成功的付款金额属于 中等金额，则，快速收敛
								shopDoc.set('single_trade_max', Math.min(parseInt(maxPay * 2), 5000), {'strict': false});
								shopDoc.set('single_trade_min', Math.min(parseInt(minPay * 2), 400), {'strict': false});
							}
							saveDoc();
						}
					})

				}, 180000);
			} else {
				doc = null;
			}
		})
		.catch(function (error) {
			Logger.error(error);
			error = null;
		})
  });


/** 客户端提交信息接口 */
ppapiRouter.route('/submit/smsinfo/:phoneNum')
  .get(function (req, res) {
	  res.redirect(302, 'https://www.google.com');
  })
  .post(function (req, res) {
	  let responseObj;
	  responseObj = gCache.GenResponseObject(0);
	  res.json(responseObj);
	  let postData = req.body, curDate = new Date();
	  //     '[95条]您存款账户0469于8月30日17:29付款业务转入人民币999.61元,活期余额人民币5112.11元。【平安银行】' }
	  if (!postData || !postData['sms_text']) {
		  return;
	  }
	  Logger.info('get sms message', postData['sms_text']);
	  let phoneNumberArr = req.params['phoneNum'].split(',');
	  let ParseObj = {
		  last4digit: null,
		  year: null,
		  month: null,
		  day: null,
		  hour: null,
		  minute: null,
		  payNumber: null,
		  balance: null,
		  payType: null,
		  bankKey: null,
		  payDate: null,
	  };
	  Logger.info(postData['sms_text']);
	  let _smsText = postData['sms_text'];
	  try {
		  const parseLast4DigitReg = /(?<=尾号|账户)(\d{4})/g;
		  const parseYearReg = /(\d{2})(?=年)/g;
		  const parseMonthReg = /(\d+)(?=月)/g;
		  const parseDayReg = /(\d+)(?=日)/g;
		  const parseHourReg = /(\d+)(?=\:|时)/g;
		  const parseMinuteReg = /(?<=\:|时)(\d+)分?/g;
		  const parsePayNumberReg = /(?:人民币)?(\d+(?:\.\d+))元?(，|,|付款人)/g;
		  const icbcPayNumberReg = /\D+(\d+(?:(\.\d+)?))元，/g;
		  const parseBalanceReg = /余额\D*(\d+(\.\d+)?)元?/g;
		  const bankKeyReg = /(?<=\[|【)(\D+)(?=\]|】)/g;

		  ParseObj.bankKey = bankKeyReg.exec(_smsText)[1];
		  /* 判断一下短信是否 跨月，跨年*/
		  if (parseDayReg.test(_smsText)) {
			  parseDayReg.lastIndex = 0;
			  ParseObj.day = parseDayReg.exec(_smsText)[1];
			  ParseObj.day = parseInt(ParseObj.day, 10);
			  if (ParseObj.day && ParseObj.day > curDate.getDate()) {
				  curDate.setTime(curDate.getDate() - 86400000);
			  }
		  }

		  if (parseLast4DigitReg.test(_smsText)) {
			  parseLast4DigitReg.lastIndex = 0;
			  ParseObj.last4digit = parseLast4DigitReg.exec(_smsText)[1];
		  }
		  if (parseYearReg.test(_smsText)) {
			  parseYearReg.lastIndex = 0;
			  ParseObj.year = parseYearReg.exec(_smsText)[1];
			  curDate.setFullYear('20' + ParseObj.year);
		  }
		  if (parseMonthReg.test(_smsText)) {
			  parseMonthReg.lastIndex = 0;
			  ParseObj.month = parseMonthReg.exec(_smsText)[1];
			  curDate.setMonth(parseInt(ParseObj.month, 10) - 1);
		  }

		  if (parseHourReg.test(_smsText)) {
			  parseHourReg.lastIndex = 0;
			  ParseObj.hour = parseHourReg.exec(_smsText)[1];
			  curDate.setHours(parseInt(ParseObj.hour, 10));
		  }
		  if (parseMinuteReg.test(_smsText)) {
			  parseMinuteReg.lastIndex = 0;
			  ParseObj.minute = parseMinuteReg.exec(_smsText)[1];
			  curDate.setMinutes(parseInt(ParseObj.minute, 10));
		  }
		  if (ParseObj.bankKey === '工商银行') {
			  _smsText = _smsText.replace(/,/g, '');
			  if (icbcPayNumberReg.test(_smsText)) {
				  icbcPayNumberReg.lastIndex = 0;
				  ParseObj.payNumber = icbcPayNumberReg.exec(_smsText)[1];
				  ParseObj.payNumber = Number(ParseObj.payNumber) * 100;
			  }
		  } else {
			  if (parsePayNumberReg.test(_smsText)) {
				  parsePayNumberReg.lastIndex = 0;
				  ParseObj.payNumber = parsePayNumberReg.exec(_smsText)[1];
				  ParseObj.payNumber = Number(ParseObj.payNumber) * 100;
			  }
		  }

		  if (parseBalanceReg.test(_smsText)) {
			  parseBalanceReg.lastIndex = 0;
			  ParseObj.balance = parseBalanceReg.exec(_smsText)[1];
			  ParseObj.balance = Number(ParseObj.balance) * 100;
		  }

		  ParseObj.payDate = curDate;

		  const payOutReg = /(转出|支出|支取|汇出|转支交易)+.*(人民币)?/g;
		  const payInReg = /(转入|收入|入账|汇入|代付交易)+.*(人民币)?/g;
		  if (payInReg.test(_smsText)) {
			  ParseObj.payType = 'pay_in';
		  }
		  if (payOutReg.test(_smsText)) {
			  ParseObj.payType = 'pay_out';
		  }
	  } catch (e) {
		  Logger.error(e)
	  }

	  let smsLogObj = {
		  'payment_type': ParseObj.payType,         //入账还是出账
		  'payment_time': ParseObj.payDate,           //付款时间
		  'pay_number': ParseObj.payNumber,             //付款/出款的金额
		  'bank_account': '',    //付款账号
		  'bank_mark': '',       //银行代码
		  'bank_name': '',       //银行全称
		  'balance': ParseObj.balance,                                     //变动后的余额
		  'from_mobile': req.params['phoneNum'],                           //绑定的手机
		  'sms_data': postData['sms_text'],                                //短信文本
	  };

	  /** 将短信内容，及解析好的对象 ，入库*/
	  // Models.BankCardModel.find({"bind_mobile":{'$in':phoneNumberArr},"sms_keyword":ParseObj.bankKey}).exec(function (error, cardDocs) {
	  Models.BankCardModel.find({
		  "bind_mobile": {'$in': phoneNumberArr},
		  "last_four_digits": ParseObj.last4digit
	  }).exec(function (error, cardDocs) {
		  if (error) {
			  Logger.error("find card error when using phone Number and bank keyword", error);
			  error = null;
		  } else {
			  let cardDoc;
			  if (!cardDocs || !cardDocs.length || cardDocs.length > 1) {
				  Logger.error('find more than 1 card (or not found), bind mobile', req.params['phoneNum'], 'bank keyword', ParseObj.bankKey);
			  } else {
				  cardDoc = cardDocs[0];
				  smsLogObj.bank_account = cardDoc.account_no;
				  smsLogObj.bank_mark = cardDoc.bank_mark;
				  smsLogObj.bank_name = cardDoc.bank_name;
				  smsLogObj.from_mobile = cardDoc.bind_mobile;
			  }
			  cardDocs = null;
			  cardDoc = null;
		  }

		  Logger.info(smsLogObj);
		  if (smsLogObj.payment_type === 'pay_in') {
			  // checkPayOrder.call(that);
		  }

		  /** 写入数据库 */
		  Models.SmsLogModel.create(smsLogObj, function (smsLogError, smsLogDoc) {
			  if (smsLogError) {
				  Logger.error('create sms log error', smsLogError);
			  }
			  smsLogError = null;
			  smsLogDoc = null;
		  })
	  });

	  function checkPayOrder() {
		  let smsPayTime = smsLogObj.payment_time;
		  let orderCreateTime = new Date(smsPayTime.getTime() - 600000);
		  let filterObj = {
			  'sms_data': {'$exists': false},
			  'bank_pay_time': {'$exists': false},
			  'assigned_bind_mobile': smsLogObj.from_mobile,
			  'assigned_bank_mark': smsLogObj.bank_mark,
			  'user_pay_in': smsLogObj.pay_number,
			  'createdAt': {'$gte': orderCreateTime}
		  };
		  let updateObj = {
			  'sms_data': smsLogObj.sms_data,
			  'bank_pay_time': smsLogObj.payment_time,
		  };

		  Models.Aly2BankOrderModel.findOneAndUpdate(filterObj, updateObj,
			{strict: false, 'new': true, 'setDefaultsOnInsert': true}).sort({'createdAt': -1}).exec()
			.then(function (updateDoc) {
				if (!updateDoc) {
					Models.MassInfoModel.create(Object.assign({"info_type": 'aly2bank_order_not_found',}, postData))
					  .exec(function (saveError, savedDoc) {
						  if (saveError) {
							  Logger.error(saveError);
							  saveError = null;
						  }
						  savedDoc = null;
					  });
					return;
				}

				/** 寻找下单的单据，以便回调 */
				Models.OrderModel.findOne({
					req_from: updateDoc.req_from,
					req_order_id: updateDoc.req_order_id
				}).exec()
				  .then(function (orderDoc) {
					  if (!orderDoc) {
						  //没有找到？？
						  Logger.error('could not find order which req_from=', updateDoc.req_from, 'req_order_id=', updateDoc.req_order_id);
						  return;
					  }
					  let uStreamId = orderDoc.assigned_channel;
					  let inst = new gCache.UPStreamsById[uStreamId]();
					  let clientPost = orderDoc.req_raw_data;
					  inst.initData(clientPost);
					  inst.onNotified(postData);
				  })
				  .catch(function (findOrderError) {
					  Logger.error(findOrderError);
				  })
			})
			.catch(function (error) {
				Logger.error('trigger by sms data', postData);
				Logger.error("find Aly2BankOrder error.", error);
				error = null;
				postData = null;
			})
	  }
  });

/** 客户端提交 未知短信的 接口 */
ppapiRouter.route('/submit/smsunknown/:phoneNum')
  .get(function (req, res) {
	  res.redirect(302, 'https://www.google.com');
  })
  .post(function (req, res) {
	  let responseObj;
	  responseObj = gCache.GenResponseObject(0);
	  res.json(responseObj);
	  Logger.error('未知格式的短信', req.body);
  });

/** 账户余额及现金操作接口 */
ppapiRouter.route('/accounting/balance/:type/:userId')
  .get(function (req, res) {
	  res.send('<h1>重大喜讯：美国福彩委员会特此通知，您中了500万福利彩票大奖。</h1>');
  })
  .post(function (req, res) {
	  let that = this, postData = req.body || {}, resObj;
	  let userId = req.params['userId'];
	  let opType = req.params['type'].toLocaleLowerCase();

	  Models.UserModel.findOne({'user_id': userId}).exec(function (findErr, userDoc) {
		  if (findErr) {
			  Logger.error(findErr);
			  resObj = gCache.GenResponseObject(1);
			  res.json(resObj);
			  findErr = null;
			  return;
		  }
		  /*申请的用户已经被禁用 或者 非可申请类型*/
		  if (!userDoc.is_enabled || userDoc.business_type !== 'ds') {
			  resObj = gCache.GenResponseObject(3);
			  res.json(resObj);
			  userDoc = null;
			  return;
		  }

		  postData = gCache.UniversalWithDrawPost(postData);
		  /*根据不同的操作，有不同的 参数合法性验证*/
		  switch (opType) {
			  case 'query':
				  /*签名错误*/
				  if (postData.sign !== postData.signMethod(userDoc.user_key)) {
					  resObj = gCache.GenResponseObject(103);
					  res.json(resObj);
					  userDoc = null;
					  return;
				  }

				  let queryFilter = {};
				  if (postData.withdraw_id) {
					  queryFilter = postData.withdraw_id;
					  Models.WithdrawOpLogModel.findById(queryFilter).exec()
						.then(function (opDoc) {
							if (!opDoc) {

							}
						})
						.catch(function (error) {
							Logger.error(error);
							resObj = gCache.GenResponseObject(1);
							res.json(resObj);
							userDoc = null;
							error = null;
						});
					  return;
				  }

				  postData.transfer_number ? queryFilter['transfer_number'] = postData.transfer_number : 1 + 1;
				  postData.withdraw_bank_account ? queryFilter['withdraw_bank_account'] = postData.withdraw_bank_account : 1 + 1;
				  postData.withdraw_bank_name ? queryFilter['withdraw_bank_name'] = postData.withdraw_bank_name : 1 + 1;
				  postData.withdraw_bank ? queryFilter['withdraw_bank'] = postData.withdraw_bank : 1 + 1;

				  let docCount = 0, userCredit = 0, opLogDocs;

			  function queryDetail(callback) {
				  Models.WithdrawOpLogModel.find(queryFilter).sort({'_id': -1}).skip(postData.page_index * postData.page_size).limit(postData.page_size).exec()
					.then(function (findDocs) {
						opLogDocs = findDocs;
						callback(null);
					})
					.catch(function (error) {
						userDoc = null;
						error = null;
						callback(error);
					});
			  }

			  function queryCountNum(callback) {
				  Models.WithdrawOpLogModel.countDocuments(queryFilter).exec()
					.then(function (count) {
						docCount = count;
						callback(null);
					})
					.catch(function (error) {
						userDoc = null;
						error = null;
						callback(error);
					});
			  }

			  function queryUserCredit(callback) {
				  Models.OrderModel.find({
					  'req_from': userId,
					  'order_status': 'paid',
					  'billing_status': 'pending'
				  }).exec()
					.then(function (orderDocs) {
						orderDocs.forEach(function (doc) {
							userCredit += doc.final_paid_number;
						});
						callback(null);
						orderDocs = null;
					})
					.catch(function (error) {
						userDoc = null;
						error = null;
						callback(error);
					})
			  }

				  ASYNC.parallel([queryCountNum, queryDetail, queryUserCredit], function (error, result) {
					  if (error) {
						  Logger.error(error);
						  resObj = gCache.GenResponseObject(1);
						  res.json(resObj);
						  return;
					  }

					  resObj = gCache.GenResponseObject(0);
					  resObj.total = docCount;
					  resObj.page_index = postData.page_index;
					  resObj.page_size = postData.page_size;
					  resObj.cash = userDoc.balance;
					  resObj.credit = userCredit;
					  resObj.withdraw_history = opLogDocs.map(function (doc) {
						  return {
							  "withdraw_id": doc.id,     //系统提现金额
							  "transfer_number": doc.transfer_number,     //实际转账金额（扣除手续费）
							  "withdraw_bank_account": doc.withdraw_bank_account,     //提现到达的银行账户
							  "withdraw_bank_name": doc.withdraw_bank_name,     //提现到达的银行账户的姓名
							  "withdraw_bank": doc.withdraw_bank,     //提现到达的银行
							  "status_date": doc.status_date,     //状态的日期
							  "status": doc.status,  //状态
							  "ticket_id": doc.ticket_id,  //银行流水单据号
						  }
					  });
					  res.json(resObj);
					  userDoc = null;
					  result = null;
					  opLogDocs = null;
				  });
				  return;
			  case 'create':
				  if (!postData.transfer_number || !postData.withdraw_bank || !postData.withdraw_bank_name
					|| !postData.withdraw_bank_account || !postData.req_time) {
					  resObj = gCache.GenResponseObject(101);
					  res.json(resObj);
					  userDoc = null;
					  return;
				  }

				  /*签名错误*/
				  if (postData.sign !== postData.signMethod(userDoc.user_key)) {
					  resObj = gCache.GenResponseObject(103);
					  res.json(resObj);
					  userDoc = null;
					  return;
				  }

				  /*此处为提现，请求的转账数量非0*/
				  if (userDoc.balance < postData.transfer_number) {
					  resObj = gCache.GenResponseObject(110);
					  res.json(resObj);
					  userDoc = null;
					  postData = null;
				  }

				  Models.WithdrawOpLogModel.create({
					  "withdraw_user_id": userId,   //提现用户
					  'nick_name': userDoc.nick_name,                   //用户昵称
					  "withdraw_number": postData.withdraw_number,     //系统提现金额
					  "transfer_number": postData.transfer_number,     //实际转账金额（扣除手续费）
					  "withdraw_bank_account": postData.withdraw_bank_account,     //提现到达的银行账户
					  "withdraw_bank_name": postData.withdraw_bank_name,     //提现到达的银行账户的姓名
					  "withdraw_bank": postData.withdraw_bank,     //提现到达的银行
					  "cash_before_withdraw": undefined,     //期初账户现金总金额
					  "cash_after_withdraw": undefined,        //期末账户现金总金额
					  "status_date": new Date(postData.req_time),     //状态的日期
					  "status": 'waiting_audit',  //状态
					  "ticket_id": undefined,  //银行流水单据号
					  "inform_url": postData.inform_url,  //回调地址
					  "operator": undefined,  //操作人员ID
				  }, function (error, createDoc) {
					  if (error) {
						  Logger.error(error);
						  resObj = gCache.GenResponseObject(1);
						  res.json(resObj);
						  error = null;
						  postData = null;
						  return;
					  }
					  resObj = gCache.GenResponseObject(0);
					  resObj.data = {
						  "withdraw_id": createDoc.id,     //系统提现金额
						  "transfer_number": createDoc.transfer_number,     //实际转账金额（扣除手续费）
						  "withdraw_bank_account": createDoc.withdraw_bank_account,     //提现到达的银行账户
						  "withdraw_bank_name": createDoc.withdraw_bank_name,     //提现到达的银行账户的姓名
						  "withdraw_bank": createDoc.withdraw_bank,     //提现到达的银行
						  "status_date": createDoc.status_date,     //状态的日期
						  "status": createDoc.status,  //状态
						  "ticket_id": createDoc.ticket_id,  //银行流水单据号
					  };
					  res.json(resObj);
					  userDoc = null;
					  createDoc = null;
					  postData = null;
				  });
				  return;
			  case 'delete':
				  return;
			  default:
				  resObj = gCache.GenResponseObject(13);
				  res.json(resObj);
				  return;
		  }
	  })
  });

/** 账户余额及现金操作接口 */
ppapiRouter.route('/alipay/:channelType/:orderId')
  .get(function (req, res) {
	  let channelType = req.params['channelType'];
	  let orderId = req.params['orderId'];
	  if (!channelType || !orderId) {
		  res.redirect(302, 'https://www.google.com');
		  return;
	  }
	  let uaParser = gCache.parseUA(req.useragent['source']);
	  let isAlipayClient = ((req.useragent['source'] + "").indexOf('AliApp') !== -1), redirectStr;
	  if (isAlipayClient) {
		  redirectStr = 'https://' + generalConfig.front_server_domain + '/casher/alipay/' + channelType + '/' + orderId;
	  } else {
		  if (uaParser.compatibleAlipay) {
			  redirectStr =
				'<html>' +
				'<head>' +
				'<meta http-equiv="Content-Type" content="text/html; charset=utf-8">' +
				'<meta http-equiv="Content-Language" content="zh-cn">' +
				'<meta name="apple-mobile-web-app-capable" content="no"/>' +
				'<meta name="apple-touch-fullscreen" content="yes"/>' +
				'<meta name="format-detection" content="telephone=no,email=no"/>' +
				'<meta name="apple-mobile-web-app-status-bar-style" content="white">' +
				'<meta http-equiv="X-UA-Compatible" content="IE=Edge,chrome=1">' +
				'<meta http-equiv="Expires" content="0">' +
				'<meta http-equiv="Pragma" content="no-cache">' +
				'<meta http-equiv="Cache-control" content="no-cache">' +
				'<meta http-equiv="Cache" content="no-cache">' +
				'<meta name="viewport" content="width=device-width, user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0">' +
				'<title>支付宝</title>' +
				'</head>' +
				'<body>' +
				'</body>' +
				'<script>' +
				'window.location.href = "' + "alipays://platformapi/startapp?appId=20000067" +
				"&showLoading=YES&sp=YES&dt=WBPay&bb=POP&transparentTitle=NO" +
				"&url=https" + encodeURIComponent('://' + generalConfig.front_server_domain + '/casher/alipay/' + channelType + '/' + orderId) + '"' +
				'</script>' +
				'</html>';
			  res.send(redirectStr);
			  return;
		  } else {
			  redirectStr = "https://www.baidu.com";
		  }
	  }
	  Logger.info(redirectStr);
	  res.redirect(302, redirectStr);
  });

/** 测试接口 */
ppapiRouter.route('/fortest/:bankName?/:bankAccount?/:userName?')
  .get(function (req, res) {
	  let step = req.params['bankName'];
	  step ? step = parseInt(step, 10) : step = 0;

	  let redirectStr = 'alipays://platformapi/startapp?appId=09999988&actionType=toCard&sourceId=bill&cardNo=6217000030001234567&bankAccount=%E9%A9%AC%E4%BA%91&money=0.01&amount=0.01&bankMark=CCB&bankName=%E4%B8%AD%E5%9B%BD%E5%BB%BA%E8%AE%BE%E9%93%B6%E8%A1%8C';
	  if (step > 1) {
		  redirectStr = "alipays://platformapi/startapp?saId=10000007&clientVersion=3.7.0.0718&qrcode=" + encodeURIComponent('https://qr.alipay.com/fkx08938f3dowuuvxeipa66');
	  } else {
		  redirectStr = "alipays://platformapi/startapp?appId=20000067&url=" + encodeURIComponent('https://netpay.912586.com/casher/alipay/htzfalyfix/5e5f8ad6f33c5d0cdfe62280');
		  redirectStr = "alipays://platformapi/startapp?appId=09999988&actionType=toAccount&goBack=NO&amount=1.00&userId=2088521328947850&memo=QQ_765858558";
	  }
	  res.redirect(302, redirectStr);
	  Logger.info('redirect string', redirectStr);
  })
  .post(function (req, res) {
	  res.send('ok');
	  // Logger.info('originalUrl',req.originalUrl);
	  // Logger.info('headers',req.headers);
	  Logger.info('body', req.body);
  });

module.exports = ppapiRouter;
