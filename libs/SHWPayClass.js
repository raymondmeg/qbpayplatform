/**
 * 银联云闪付 支付通道
 * @author Raymond
 * @create 2019/9/21
 */
const Logger = require('tracer').console();
const ASYNC = require('async');
const _ = require('lodash');
const UpStreamInterface = require('./UPStreamInterface');
const gCache = require('./globalCache.js');
const generalConfig = require('../configs/general.js');
const BaseCBUrl = 'https://' + generalConfig.api_server_domain + '/ppapi/callback/';
// const AppId = '200000005';
const AppId = '15869372172411854169';
// const AppKey = '9FCD7E3D50A3C9981C965177103F3624';
const AppKey = 'IO08zuoZyvGPU60Hct7gLQK71InHZmUQbuQU6MMlplG5KZjAS4Z45jBIfvzpjilj';

let Models = require('../Models/ModelDefines.js');
let httpRequest = require('request');

class ShwPayPhoneClass extends UpStreamInterface {
	constructor() {
		super();
		this.requestUrl = 'http://45.86.143.2:8080/xunpay-alipay-api/order/create';   //请求上游数据的接口地址
		this.nickName = '尚文支付话费';                                  //上游的记忆名称
		this.userId = 'u825097';                                        //此上游在我方的ID
		this.channelType = 'shwpayphone';
		this.payType = '';
		this.callBackUrl = null;                                        //指定的回调地址
		this.idInUpstream = AppId;                                      //商户号、用户ID 等等同类
		this.keyInUpStream = AppKey;                                    //appkey、密码 等等同类
		this.dsDataObj = null;                                          //下游提交的原始数据
		this.dsOrderId = null;                                          //下游的订单号
		this.dsUserId = null;                                           //下游用户代号
		this.bill_type = 'D0';
		this.safeInterval = 5 * 60 * 1000;                                  //5分钟安全间隔
		return this;
	}

	/**初始化数据
	 * @param {Object} data - 已经校验过的规范数据
	 * @return {Object}
	 * */
	initData(data) {
		let err;
		if (data.pay_in_number < 10000 || data.pay_in_number > 1000000) {
			err = gCache.GenResponseObject(7);
			err.err_desc = '此通道支持的 金额范围为  100-10000 元。';
			return err;
		}

		this.dsDataObj = data;
		this.dsOrderId = data.order_id;         //下游的订单号
		this.dsUserId = data.client_id;         //下游用户代号
		this.callBackUrl = BaseCBUrl + this.userId + '/' + this.dsUserId + '/' + this.dsOrderId;
		this.payType = data.pay_type;
		return null;
	}

	/**
	 * 上游接口指定的签名方法
	 * @param {Object} dataObj - 需要签名的对象
	 * */
	signMethod(dataObj) {
		if (!dataObj) {
			return;
		}
		let preSignStr = "";
		preSignStr += (dataObj.appId + '^');
		preSignStr += (dataObj.orderNo + '^');
		preSignStr += (dataObj.money + '^');
		preSignStr += (dataObj.timestamp + '^');
		preSignStr += this.keyInUpStream;
		return gCache.MD5Hash(preSignStr).toString().toLocaleLowerCase();
	}

	/** 产生一个上游接口请求参数对象
	 * @return Object
	 * */
	genUpStreamPostObject() {
		return {
			'appId': this.idInUpstream,
			'orderNo': '',
			'money': '',
			'noticeUrl': '',
			'timestamp': null,
			'dumpUrl': 'https://www.baidu.com/',
			'sign': '',
		}
	}

	/** 向上家请求接口*/
	getPayUrl(callback) {
		let that = this;
		let postToUs = that.genUpStreamPostObject(), curDate = new Date(), dsData = that.dsDataObj;
		/*向上家请求接口*/
		postToUs.money = (dsData.pay_in_number * 0.01).toFixed(2);
		postToUs.timestamp = curDate.getTime();
		postToUs.orderNo = that.dsOrderId;
		postToUs.noticeUrl = that.callBackUrl;
		postToUs.sign = that.signMethod(postToUs);
		// Logger.info('post to Upstream',postToUs);

		httpRequest.get({
			'url': that.requestUrl,
			'qs': postToUs,
			'json': true,
		}, function (err, httpResponse, body) {
			if (err || httpResponse.statusCode !== 200 || !body) {
				Logger.error('request', that.requestUrl, 'has error:', err || 'statusCode ' + httpResponse.statusCode);
				err ? callback && callback(err, null) : callback && callback(new Error('statusCode ' + httpResponse.statusCode));
				return;
			}
			// Logger.info(body);

			if (!body || !body.data || body.result !== 'success') {
				Logger.error('尚文支付话费 接口返回错误：', body);
				callback && callback(new Error('body error'));
				return;
			}

			callback && callback(null, body.data);
		})
	}

	/**
	 * 获取上游接口的数据
	 * @param {string} [qrType] - 需要获取的二维码类型（支付宝？微信？）
	 * */
	getUpStreamData(qrType) {
		let that = this;
		let curDate, dsData;
		curDate = new Date();
		dsData = that.dsDataObj;
		//创建订单记录
		Models.OrderModel.create({
			req_from: that.dsUserId,
			req_order_id: that.dsOrderId,
			req_pay_in: dsData.pay_in_number,
			req_pay_type: dsData.pay_type,
			req_bill_type: that.bill_type,
			req_time: new Date(dsData.request_time),
			req_inform_url: dsData.inform_url,
			req_raw_data: dsData,
			req_channel: dsData.request_channel.toLocaleLowerCase(),
			assigned_channel: that.userId,
			// assigned_account: storeId,
			// account_special_code: that.nickName,
			order_status: 'data_sent',
			status_time: curDate,
		}, function (err, orderDoc) {
			if (err) {
				// 创建不成功，直接返回
				Logger.error('create order document error:', err);
				that.onGetUpStreamData(new Error('create order error'), null);
				err = null;
				return;
			}

			that.getPayUrl(function (error, body) {
				if (error) {
					orderDoc.set('order_status', 'generation_error', {'strict': false});
					that.onGetUpStreamData.call(null, new Error('generation_error'), null);
				} else {
					orderDoc.set('order_status', 'data_sent', {'strict': false});
					let outData = that.outPutUpStreamData(body);
					outData.qr_url = null;
					outData.jump_url = null;
					that.onGetUpStreamData.call(null, null, outData);
				}
				error = null;
				body = null;
				orderDoc.save(function (error, savedDoc) {
					error = null;
					savedDoc = null;
					orderDoc = null;
				});
			});
		});
	}

	getPayLevel() {
		let dsData = this.dsDataObj;
		let payInNumber = dsData.pay_in_number;
		if (payInNumber <= 50000) {
			return 'low';
		} else if (payInNumber <= 100000) {
			return 'mid';
		} else {
			return 'high'
		}
	}

	/** 上游平台 通知我方后被触发 */
	onNotified(usData) {
		if (!usData || !this.dsDataObj.inform_url) {
			//如果没有回调地址
			return;
		}

		let informObj, curDate = new Date(), that = this;
		informObj = gCache.UniversalInformObject(200);
		informObj.order_id = this.dsOrderId;
		informObj.pay_in_number = Number.parseFloat(usData['trade_money']) * 100;
		informObj.pay_time = curDate.getTime();
		informObj.ticket_id = usData['order_no'];
		informObj.pay_type = this.dsDataObj.pay_type;
		informObj.app_data = this.dsDataObj.app_data;
		informObj.sign = "";

		Models.UserModel.findOne({'user_id': this.dsDataObj.client_id}).exec(function (error, userDoc) {
			if (error) {
				Logger.error(error);
				return;
			}
			informObj.sign = gCache.signTheCallBackData(informObj, userDoc.user_key);

			function informDs(callback) {
				httpRequest({
					'url': that.dsDataObj.inform_url,
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

			ASYNC.retry({times: 3, interval: 20000}, informDs);
		});
	}

	/**
	 * 下发上游接口数据的方法，规范数据回吐格式
	 * @param {Object} responseData - 上游返回的数据，通常包含 二维码 URL
	 * @return {Object}
	 * */
	outPutUpStreamData(responseData) {
		let dsData = this.dsDataObj, obj;
		if (responseData) {
			obj = {
				'order_id': this.dsOrderId,
				'req_pay_type': dsData.pay_type,
				"pay_number": dsData.pay_in_number,
				"pay_type": dsData.pay_type,
				'qr_url': responseData['token'],
				'h5_url': responseData['qrCode'],
				"jump_url": null,
			};
		} else {
			obj = {
				'order_id': dsData.order_id,
				'req_pay_type': dsData.pay_type,
				"pay_number": dsData.pay_in_number,
				"pay_type": dsData.pay_type,
				'h5_url': null,
				"qr_url": null,
				"jump_url": null,
			};
		}
		return obj;

	}

	/** 取出回调信息中的数据
	 * @param {Object} data - 回调信息，也就是 用户支付成功后的回调
	 * @return {Object}
	 * */
	takeOutNotifiedData(data) {
		return {
			final_paid_order_no: data['order_no'],
			final_paid_time: new Date().getTime(),
			final_paid_number: Number.parseFloat(data['trade_money']) * 100,
			final_paid_data: data,
			order_status: 'paid'
		};
	}

	/** 客户端请求支付码处理函数
	 * @param {Object} orderDoc - 订单记录文档
	 * @param {Object} req - express 的 req 对象
	 * @param {Object} res - express 的 res 对象
	 * @param {function} callback - 回调函数
	 * */
	onClientReqPayCode(orderDoc, req, res, callback) {
		let that = this, dsData = this.dsDataObj;
		that.getPayUrl(function (error, body) {
			if (error) {
				orderDoc.set('order_status', 'generation_error', {'strict': false});
				callback && callback(error, null);
				return;
			}
			orderDoc.set('assigned_account', 'request' + new Date().getTime(), {'strict': false});  //指定到哪个商户
			orderDoc.set('order_status', 'qr_sent', {'strict': false});

			let outData = that.outPutUpStreamData(body);

			outData.qr_url = null;
			outData.jump_url = null;

			let resObj = gCache.GenResponseObject(0);
			resObj = Object.assign(resObj, outData);
			callback && callback(null, resObj);
		})
	}

}


/**************************父类静态属性的覆盖************************************/

ShwPayPhoneClass.getSupportPayType = function () {
	/* 返回支持的支付类型 ，支付类型采用 8位 二进制数字 来表示
	 *   0      0      0      0      0      0       0       0
	 *  待分配  待分配  待分配  待分配  待分配  wepay   alipay  bank_card
	 * */
	return 2;
};

ShwPayPhoneClass.getChannelType = function () {
	return 'shwpayphone';
};

ShwPayPhoneClass.getClassId = function () {
	return 'u825097';
};

ShwPayPhoneClass.getChannelName = function () {
	return '尚文支付话费';
};

module.exports = ShwPayPhoneClass;
