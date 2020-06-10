/**
 * 一些后台定时任务
 *
 * @author Raymond
 * @create 2019/7/29
 */

const Logger = require('tracer').console();
const EventEmitter = require('events');
const ASYNC = require('async');

let gCache = require('./globalCache');
let Models = require('../Models/ModelDefines.js');

class BackEndJob extends EventEmitter {
	constructor() {
		super();
		this.timeInterval = 10000;
		this.timerRunTimes = 0;
		this.nextHourTimer = null;
		this.nextHourDate = null;
	}

	run() {
		let that = this;
		/* 10秒钟一次的 任务*/
		this.timerId = setInterval(function () {
			that.start.call(that);
		}, this.timeInterval);
		// this.everyDayWork.call(this);
		this.nextHourDate = new Date();
		this.nextHourDate.setMinutes(0, 0, 0);
		this.nextHourDate = new Date(this.nextHourDate.getTime() + 3600000);
		this.nextHourTimer = setTimeout(function () {
			that.integralPointWork.call(that);
		}, that.nextHourDate - (new Date()));
	}

	start() {
		this.timerRunTimes++;
		// this.checkOrderNeedRetryInform();
		// this.statisticsOrderStatus();
		this.updateOrderStatus.call(this);
		// this.checkYstRecordRealTime.call(this);
	}

	/** 整点任务 */
	integralPointWork() {
		let that = this;
		this.nextHourDate.setTime(this.nextHourDate.getTime() + 3600000);  // next Date on the hour.
		/* set new Timer*/
		this.nextHourTimer = setTimeout(function () {
			that.integralPointWork.call(that);
		}, that.nextHourDate - (new Date()));

		/* 整点运行的定时任务*/
		//todo: 改写定时任务
		this.preComputingUserBalance.call(that);
		this.calculateD0Payment.call(that);
	}

	everyDayWork() {
		let curDate = new Date(), that = this;
		let nextDate = new Date(gCache.getTodayStartDateObj().getTime() + 86400000 + 3600000);  //第二天的1点
		setTimeout(function () {
			that.everyDayWork.call(that);
		}, nextDate.getTime() - curDate.getTime());

		// this.checkYstHistoryRecord.call(that);
	}

	/** 每日预计算用户的 账户现金 余额*/
	preComputingUserBalance() {
		if (new Date().getHours() !== 23) {
			return;
		}
		let that = this, hasError = false;
		let userBalance = {}, orderIdsOfUpdate = [];

		function checkIfNeedRetry() {
			if (hasError) {
				setTimeout(function () {
					if (new Date().getTime() - gCache.getTodayStartDateObj().getTime() <= 9 * 3600 * 1000) {
						that.preComputingUserBalance.call(that);
					}
				}, 600000);
			}
		}

		/* 统计 D1 产品的可转化现金值 */
		function parseD1Order(callback) {
			let d1Date = gCache.getTodayStartDateObj();
			let d1filterObj = {
				'order_status': 'paid',
				'billing_status': 'pending',
				'req_time': {'$lt': d1Date},
				'req_bill_type': 'D1',
			};
			Models.OrderModel.find(d1filterObj).exec(function (d1findErr, orderDocs) {
				if (d1findErr) {
					callback(null, null);
					hasError = true;
					d1findErr = null;
					return;
				}
				orderDocs.forEach(function (order) {
					let userDoc = gCache.findOneUserById(order.req_from);
					if (!userDoc) {
						return;
					}
					let channelRate = userDoc.cash_rate && userDoc.cash_rate[order.assigned_channel];
					if (!channelRate) {
						return;
					}
					let _amount = order.final_paid_number || order.req_pay_in;
					let _userId = order.req_from;
					let _userObj = userBalance[_userId];
					if (!_userObj) {
						userBalance[_userId] = _amount * channelRate;
					} else {
						userBalance[_userId] += _amount * channelRate;
					}
					orderIdsOfUpdate.push(order.req_order_id);
				});
				callback(null, null);
			})
		}

		/* 统计 D2 产品的可转化现金值 */
		function parseD2Order(callback) {
			let d2Date = new Date(gCache.getTodayStartDateObj().getTime() - 86400000);
			let d2filterObj = {
				'order_status': 'paid',
				'billing_status': 'pending',
				'req_time': {'$lt': d2Date},
				'req_bill_type': 'D2',
			};
			Models.OrderModel.find(d2filterObj).exec(function (d2findErr, orderDocs) {
				if (d2findErr) {
					callback(d2findErr);
					hasError = true;
					d2findErr = null;
					return;
				}
				orderDocs.forEach(function (order) {
					let userDoc = gCache.findOneUserById(order.req_from);
					if (!userDoc) {
						return;
					}
					let channelRate = userDoc.cash_rate && userDoc.cash_rate[order.assigned_channel];
					if (!channelRate) {
						return;
					}
					let _amount = order.final_paid_number || order.req_pay_in;
					let _userId = order.req_from;
					let _userObj = userBalance[_userId];
					if (!_userObj) {
						userBalance[_userId] = _amount * channelRate;
					} else {
						userBalance[_userId] += _amount * channelRate;
					}
					orderIdsOfUpdate.push(order.req_order_id);
				});
				callback(null, null);
			})
		}

		ASYNC.parallel([parseD1Order, parseD2Order], function (err, result) {
			err = null;
			result = null;
			if (orderIdsOfUpdate.length) {
				Models.OrderModel.updateMany({'req_order_id': {'$in': orderIdsOfUpdate}}, {'billing_status': 'converted'}).exec()
				  .then(function (result) {
					  result = null;
					  checkIfNeedRetry();
				  })
				  .catch(function (error) {
					  Logger.error(error);
					  hasError = true;
					  error = null;
					  checkIfNeedRetry();
				  })
			}

			let commandArr = [], userAmount;
			for (let userId in userBalance) {
				if (userBalance.hasOwnProperty(userId)) {
					userAmount = userBalance[userId];
					commandArr.push({
						'updateOne': {
							filter: {user_id: userId},
							update: {'$inc': {'balance': Math.round(userAmount)}}
						}
					});
				}
			}
			if (commandArr.length) {
				Models.UserModel.bulkWrite(commandArr, {'ordered': false})
				  .then(function (result) {
					  result = null;
					  checkIfNeedRetry();
				  })
				  .catch(function (error) {
					  Logger.error(error);
					  hasError = true;
					  error = null;
					  checkIfNeedRetry();
				  })
			}
		})

	}

	calculateD0Payment() {
		let d0filterObj = {
			'order_status': 'paid',
			'billing_status': 'pending',
			'req_bill_type': 'D0',
		};
		Models.OrderModel.find(d0filterObj).sort({'final_paid_time': 1}).exec()
		  .then(function (docsArr) {
			  if (!docsArr || !docsArr.length) {
				  return;
			  }
			  Models.UserModel.find({}).exec(function (error, usersDoc) {
				  if (error) {
					  Logger.error(error);
					  error = null;
					  docsArr = null;
					  return;
				  }
				  if (!usersDoc || !usersDoc.length) {
					  docsArr = null;
					  usersDoc = null;
					  return;
				  }
				  let dataObj = {};
				  usersDoc.forEach(function (doc) {
					  dataObj[doc.user_id] = doc;
				  });
				  let userCollection = dataObj;
				  let ordersArr = docsArr;
				  dataObj = null;
				  docsArr = null;
				  if (!userCollection || !ordersArr) {
					  return;
				  }
				  let userBulkArr = [], orderBulkArr = [];
				  ordersArr.forEach(function (orderDoc) {
					  /*哪个下游的订单*/
					  let userDoc = userCollection[orderDoc.req_from];
					  if (!userDoc) {
						  return;
					  }
					  /* 费率是多少 */
					  let billingRate = userDoc.cash_rate[orderDoc.assigned_channel];
					  if (!billingRate) {
						  return;
					  }
					  userBulkArr.push({
						  updateOne: {
							  filter: {'_id': userDoc._id},
							  update: {'$inc': {'balance': orderDoc.final_paid_number * billingRate}}
						  }
					  });
					  orderBulkArr.push({
						  updateOne: {
							  filter: {'_id': orderDoc._id},
							  update: {'billing_status': 'converted'}
						  }
					  });
				  });

				  Models.UserModel.bulkWrite(userBulkArr, {'ordered': false}, function (error, writeResult) {
					  if (error) {
						  Logger.error(error);
					  }
					  error = null;
					  writeResult = null;
				  });

				  Models.OrderModel.bulkWrite(orderBulkArr, {'ordered': false}, function (error, writeResult) {
					  if (error) {
						  Logger.error(error);
					  }
					  error = null;
					  writeResult = null;
				  })
			  })
		  })
		  .catch(function (error) {
			  Logger.error(error);
			  error = null;
		  });
	}

	checkOrderNeedRetryInform() {
		let curDate = new Date();
		Models.OrderModel.find({
			'next_inform_time': {'$lte': curDate.getTime()},
			'req_raw_data.inform_url': {'$ne': ''}
		}).exec(function (error, orderDocs) {
			if (error) {
				return;
			}
			orderDocs.forEach(function (order) {
				if (!order) {
					return;
				}
				let inst = new gCache.UPStreamsById[order.assigned_channel]();
				let usData = order.final_paid_data;
				let initData = order.req_raw_data;
				if (inst && usData && initData) {
					inst.initData(initData);
					inst.onNotified(usData);
				}
			});
			orderDocs = null;
		});
	}

	/** 订单的状态是否超时 */
	updateOrderStatus() {
		if (this.timerRunTimes % 6) {
			//不到 60 秒
			return;
		}
		let curDate = new Date();
		Models.OrderModel.updateMany({
			"$and": [
				{'req_time': {'$lte': new Date(curDate.getTime() - 60000)}},
				{'req_time': {'$gte': gCache.getTodayStartDateObj()}},
				{'order_status': 'req_pending'},
				{"req_from": {"$ne": "d807500"}},
				{'assigned_account': {$exists: false}},
				{'account_special_code': {$exists: false}},
			]
		}, {'status_time': curDate, 'order_status': 'req_faked'}).exec()
		  .then(function (updateResult) {
			  updateResult = null;
			  curDate = null;
		  })
		  .catch(function (updateError) {
			  updateError = null;
			  curDate = null;
		  })
	}

	/** 统计平台成功率等 */
	statisticsOrderStatus() {
		if (this.timerRunTimes % 30) {
			//不到 300 秒
			return;
		}
		let statisMethod;
		for (let channelId in gCache.StatisMethod) {
			statisMethod = gCache.StatisMethod[channelId];
			if (gCache.StatisMethod.hasOwnProperty(channelId) && statisMethod) {
				statisMethod.call(null, function (error, result) {
					error = null;
					result = null;
				});
			}
		}
	}


}

module.exports = BackEndJob;
