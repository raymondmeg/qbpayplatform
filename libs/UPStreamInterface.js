/**
 * @author Raymond
 * @create 2019/7/27
 */

const EventEmitter = require('events');

/**
 *  上游数据接口的基类 ，模拟 Interface
 * */
class UPStreamInterface extends EventEmitter {

	constructor() {
		super();
		this.requestUrl = '';           //请求上游数据的接口地址
		this.nickName = '';             //上游的记忆名称
		this.callBackUrl = '';          //指定的回调地址
		this.userId = '';               //此上游在我方的ID
		this.idInUpstream = '';         //商户号、用户ID 等等同类
		this.keyInUpStream = '';        //appkey、密码 等等同类
		this.channelType = '';          //渠道类型（支付宝个码，微信个码，拼多多，京东 等）
		this.downStreamOrderId = '';    //下游的订单号
		this.downStreamUserId = '';       //下游用户代号
		this.downStreamPostObj = null;  //下游提交的原始数据
		/*回吐上游数据的接口*/
		this.onGetUpStreamData = function (err, data) {

		};
	}

	static getClassId() {
		return '';
	}

	static getChannelType() {
		return '';
	}

	static getChannelName() {
		return '';
	}

	static getStatistics(callback) {
		callback && callback(null, null);
	}

	/** 返回支持的支付类型 ，支付类型采用 8位 二进制数字 来表示
	 *   0      0      0      0      0      0       0       0
	 *  待分配  待分配  待分配  待分配  待分配  wepay   alipay  bank_card
	 * */
	static getSupportPayType() {
		return 0;
	}

	/**
	 * 获取本通道 所属的物料
	 * @param {Object} [query] - 查询条件
	 * @param {Function} [callback] - 回调函数
	 * */
	static getMaterial(query, callback) {
		callback && callback(null, null);
		return null;
	}

	/**
	 * 更新（没有则创建）本通道 所属的物料
	 * @param {Object} [updator] - 需要更新的数据（如果没有则新建）
	 * @param {Function} [callback] - 回调函数
	 * */
	static upInsertMaterial(updator, callback) {
		callback && callback(null, null);
		return null;
	}

	/**
	 * 删除 本通道 所属的物料
	 * @param {Object} [conditions ] - 需要更新的数据（如果没有则新建）
	 * @param {Function} [callback] - 回调函数
	 * */
	static removeMaterial(conditions, callback) {
		callback && callback(null, null);
		return null;
	}

	/**初始化数据
	 * @param {Object} data - 已经校验过的规范数据
	 * */
	initData(data) {
	}

	/**
	 * 上游接口指定的签名方法
	 * */
	signMethod() {

	}

	/**
	 * 获取上游接口的数据
	 * @param {string} qrType - 需要获取的二维码类型（支付宝？微信？）
	 * */
	getUpStreamData(qrType) {

	}

	/**
	 * 获得上游的回调数据
	 * @param {Object} usData - 上游的返回数据
	 * */
	onNotified(usData) {

	}

	/**
	 * 下发上游接口数据的方法，规范数据回吐格式
	 * @return {Object}
	 * */
	outPutUpStreamData() {
		return {};
	}

	// get onGetUpStreamData (){
	//     return this._onGetUpStreamData;
	// }
	// set onGetUpStreamData (value){
	//     if (typeof value !== "function") {
	//         return ;
	//     }
	//     this._onGetUpStreamData = value;
	// }

	takeOutNotifiedData() {

	}

	/** 客户端请求支付码处理函数
	 * @param {Object} orderDoc - 订单记录文档
	 * @param {Object} req - express 的 req 对象
	 * @param {Object} res - express 的 res 对象
	 * @param {function} callback - 回调函数
	 * */
	onClientReqPayCode(orderDoc, req, res, callback) {

	}

	/** 拼装 支付宝扫码 拉起字符串
	 * @param {string} qrCode - 要封装到QR码的字符串
	 * @return {string}
	 * */
	getAlipayJumpString(qrCode) {
		// return "https://ds.alipay.com/?from=mobilecodec&scheme="+
		//     encodeURIComponent('alipayqr://platformapi/startapp?saId=10000007&qrcode='+qrCode);
		return 'alipays://platformapi/startapp?saId=10000007&qrcode=' + encodeURI(qrCode);
	}

	/** 拼装 微信支付扫码 拉起字符串
	 * @param {string} qrCode - 要封装到QR码的字符串
	 * @return {string}
	 * */
	getWepayJumpString(qrCode) {
		return "";
	}
}

module.exports = UPStreamInterface;
