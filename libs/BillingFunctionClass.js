/**
 * 计费功能类，实现各类用户的账务计算功能。
 * 初期，在没有事务保护的情况下（也就是没有行级锁），必须使用单例模式
 * */

const EventEmitter = require('events');
const Logger = require('tracer').console({inspectOpt: {showHidden: true, depth: null}});
const ASYNC = require('async');
const Models = require('../Models/ModelDefines.js');

function BillingFunctionClass() {
}

BillingFunctionClass.prototype.orderQueue = [];
BillingFunctionClass.prototype.OnWorking = false;

/** 订单的后续计费处理 */
BillingFunctionClass.prototype.postOrderProceed = function postD0OrderProceed() {

	let that = this;
	if (this.orderQueue.length < 1) {
		this.OnWorking = false;
		return;
	}
	this.OnWorking = true;

	let orderDoc = this.orderQueue.shift();
	let billType = orderDoc.req_bill_type;
	let userId = orderDoc.req_from;
	let amount = orderDoc.req_pay_in;
	let upStreamId = orderDoc.assigned_channel;
	let materialsId = orderDoc.assigned_account;

	/*查找上游账户是否存在*/
	function findUpStreamDoc(callback) {
		Models.UserModel.findOne({'user_id': upStreamId}).exec()
		  .then(function (usDoc) {
			  if (!usDoc) {
				  Logger.error('order id', orderDoc.req_order_id, 'can not find upstream document.');
				  callback && callback(new Error('upstream_doc_not_found'), null);
				  return;
			  }
			  callback && callback(null, usDoc);
		  })
		  .catch(function (error) {
			  callback && callback(error, null);
			  Logger.error(error);
			  error = null;
			  Logger.error('order id', orderDoc.req_order_id, 'can not find upstream document.');
		  })
	}

	/*查找下游账户是否存在*/
	function findDownStreamDoc(callback) {
		Models.UserModel.findOne({'user_id': userId}).exec()
		  .then(function (userDoc) {
			  if (!userDoc) {
				  Logger.error('order id', orderDoc.req_order_id, 'can not find user document.');
				  callback && callback(new Error('downstream_doc_not_found'), null);
				  return;
			  }
			  callback && callback(null, userDoc);
		  })
		  .catch(function (error) {
			  callback && callback(error, null);
			  Logger.error(error);
			  error = null;
			  Logger.error('order id', orderDoc.req_order_id, 'can not find user document.');
		  })
	}

	/*查找 物料 是否存在*/
	function findMaterialsDoc(callback) {
		if (!materialsId) {
			callback && callback(null, null);
			return;
		}
		Models.GeneralPayShopModel.findOne({'shop_id': materialsId}).exec()
		  .then(function (materialsDoc) {
			  if (!materialsDoc) {
				  Logger.error('order id', orderDoc.req_order_id, 'can not find materials document.');
				  callback && callback(new Error('materials_doc_not_found'), null);
				  return;
			  }
			  callback && callback(null, materialsDoc);
		  })
		  .catch(function (error) {
			  callback && callback(error, null);
			  Logger.error(error);
			  error = null;
			  Logger.error('order id', orderDoc.req_order_id, 'can not find materials document.');
		  })
	}

	/* 由ASYNC 进行并发查询*/
	ASYNC.parallel({
		'findUpStreamDoc': findUpStreamDoc,
		'findDownStreamDoc': findDownStreamDoc,
		'findMaterialsDoc': findMaterialsDoc
	}, function (error, result) {
		if (error) {
			orderDoc.set('billing_status', 'pending', {strict: false});
			orderDoc.save(function (error, saved) {
				error && Logger.error(error);
				error = null;
				saved = null;
			});
			/*继续处理下一个*/
			process.nextTick(function () {
				that.postOrderProceed.call(that);
			});
			/*清理一下*/
			result = null;
			error = null;
			return;
		}

		let userDoc = result.findDownStreamDoc;     //下游客户对接账户
		let uStreamDoc = result.findUpStreamDoc;    //上游通道账户
		let materialsDoc = result.findMaterialsDoc;    //物料doc

		let channelRate, uStreamRate, materialsRate;
		channelRate = isNaN(userDoc.cash_rate) ? userDoc.cash_rate[orderDoc.assigned_channel] : userDoc.cash_rate;
		uStreamRate = isNaN(uStreamDoc.cash_rate) ? 1.0 : Number.parseFloat(uStreamDoc.cash_rate);
		materialsRate = !materialsDoc ? 0 : (materialsDoc.shop_cash_rate || 1.0);
		if (!channelRate || !uStreamRate) {
			orderDoc.set('billing_status', 'pending', {strict: false});
			orderDoc.save(function (error, saved) {
				error && Logger.error(error);
				error = null;
				orderDoc = null;
				saved = null;
			});
			/*继续处理下一个*/
			process.nextTick(function () {
				that.postOrderProceed.call(that);
			});
			/*清理一下*/
			userDoc = null;
			uStreamDoc = null;
			materialsDoc = null;
			result = null;
			return;
		}

		let accountingObj = {
			'accounting_type': 'journal',     //记账类型
			'source_document': orderDoc.req_order_id,                                 //原始凭据
			'target_account': userId,                                  //计费账户
			'target_channel_rate': channelRate,                              //计费账户此通道的费率
			'target_bill_number': amount * channelRate,                               //计费账户本次计费
			'target_opening_balance': 0,                           //计费账户期初余额
			'target_closing_balance': 0,                           //计费账户期末余额
			'upstream_id': upStreamId,                                     //上游账户ID，也即是 通道ID
			'upstream_rate': uStreamRate,                                    //上游费率
			'upstream_bill_number': amount * uStreamRate,    //上游本次计费数量
			'upstream_previous_balance': 0,                        //上游账户期初余额
			'materials_id': materialsId,                                    //物料ID
			'materials_rate': materialsRate,                                   //物料收费费率
			'materials_bill_number': amount * materialsRate,                      //物料本次收入数量
			'materials_previous_balance': 0,                       //物料期初余额
			'cash_time': null,     //可提现时间
		}
		switch (billType.toLocaleLowerCase()) {
			case 'd0':
				accountingObj.cash_time = new Date();
				break;
			case 'd1':
				accountingObj.cash_time = new Date(gCache.getTodayStartDateObj().getTime() + 86400000);
				break;
			default:
				accountingObj.cash_time = new Date(gCache.getTodayStartDateObj().getTime() + 172800000);
				break;
		}

		/* 写入记账日志 */
		Models.AccountingLogModel.create(accountingObj, function (err, accountingDoc) {
			if (err) {
				orderDoc.set('billing_status', 'pending', {strict: false});
			} else {
				/*标记此记录已经处理完毕*/
				orderDoc.set('billing_status', 'converted', {strict: false});
			}
			orderDoc.save(function (saveError, savedDoc) {
				if (saveError) {
					Logger.error(orderDoc.id, saveError.message);
					saveError = null;
				} else {
					savedDoc = null;
				}
				orderDoc = null;
			});

			/*继续处理下一个*/
			process.nextTick(function () {
				that.postOrderProceed.call(that);
			});

			/*清理一下*/
			userDoc = null;
			uStreamDoc = null;
			materialsDoc = null;
			result = null;
			accountingDoc = null;
		})
	});
};


let bfc = new BillingFunctionClass();
module.exports = bfc;
