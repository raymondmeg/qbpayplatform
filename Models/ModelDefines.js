let mongoose = require('mongoose');
let Mixed = mongoose.Schema.Types.Mixed;

const CRYPTO = require('crypto');

function getCurrentTS() {
	return new Date().getTime();
}

function Md5HashWithSalt(strOrBuf, salt) {
	let saltPassword = strOrBuf + ':' + salt;
	let md5 = CRYPTO.createHash('md5');
	return md5.update(saltPassword).digest('hex');
};

/**定义 Order 数据表 ,存储订单信息 */
let OrderSchema = new mongoose.Schema({
	req_from: {type: String, index: true, required: true},
	req_order_id: {type: String, index: true, required: true, unique: true},
	req_pay_in: {type: Number, required: true},
	req_pay_type: {type: String, enum: ['bank_card', 'wepay', 'alipay', 'mixed']},
	req_bill_type: {type: String, default: 'D1'},
	req_time: {type: Date, default: new Date(), index: true, sparse: true},
	req_inform_url: {type: String, default: undefined},
	req_raw_data: {type: Mixed, default: undefined, required: true},
	res_raw_data: {type: Mixed, default: undefined},
	// req_channel:{type: String,enum:['unionpay','raw_wepay','raw_alipay','ystpay', 'alipay2bank_manual','pdd','onecodepay','silverpay','zebrapay','idspay']},
	req_channel: {type: String},
	assigned_account: {type: String, default: undefined, index: true, sparse: true},
	assigned_channel: {type: String, default: 'self', index: true, sparse: true},
	account_special_code: {type: String},
	order_status: {
		type: String, default: 'req_pending', index: true, enum: ['req_pending', 'req_faked', 'req_failed', 'data_sent',
			'generation_error', 'client_jumped', 'qr_sent', 'qr_scanned', 'paid', 'timeout']
	},
	status_time: {type: Date, default: undefined},
	next_inform_time: {type: Number, default: undefined,},
	local_order_id: {type: String, index: true, required: false, sparse: true},
	final_paid_order_no: {type: String, default: undefined, index: true, sparse: true},
	final_paid_time: {type: Number, default: undefined},
	final_paid_number: {type: Number, default: undefined},
	final_paid_data: {type: Mixed, default: undefined},
	billing_status: {type: String, default: undefined, index: true, sparse: true},
	client_ip: {type: String, default: undefined, sparse: true},
	client_uid: {type: String, default: undefined, sparse: true},
}, {minimize: true, timestamps: true, collection: 'orders', 'strict': false});
OrderSchema.index({'req_from': 1, 'req_order_id': 1});

if (!OrderSchema.options.toObject) {
	OrderSchema.options.toObject = {}
}
OrderSchema.options.toObject.transform = function (doc, ret, options) {
	/*定义如果是 toObject 的时候，指定了 hide ，则隐藏hide 中的属性
	* doc.toObject({ hide: 'secret,_id', transform: true });
	* */
	const fixDelProp = "req_bill_type,req_raw_data,res_raw_data,assigned_account,assigned_channel," +
	  "account_special_code,next_inform_time,final_paid_data,createdAt,updatedAt,__v";
	let hideArr = options.hide ? options.hide.split(',') : [];
	hideArr = hideArr.concat(fixDelProp.split(','));
	let keySet = new Set(hideArr);
	keySet.forEach(function (prop) {
		if (prop) {
			delete ret[prop];
		}
	});
	return ret;
};

let OrderModel = mongoose.model('ordermodel', OrderSchema);
exports.OrderModel = OrderModel;
exports.OrderSchema = OrderSchema;

/**定义 User 数据表 ,存储用户信息 */
let UserSchema = new mongoose.Schema({
	'user_id': {type: String, index: true, unique: true, required: true},       //用户ID ,可以是手机号码
	'user_key': {type: String, index: true, required: true},                   //用户的key ，代密码
	'nick_name': {type: String, index: true, unique: true},                   //用户昵称
	'group_id': {type: String},                                              //用户组ID
	'top_up_rate': {type: Number, default: 1.01},                              //用户充值费率
	'balance': {type: Number, default: 0},                                     //用户账户余额
	'cash_rate': {type: Mixed, default: 0.8},                                  //用户渠道结算费率
	'is_enabled': {type: Boolean, default: false},                             //是否启用
	'business_type': {type: String, default: 'us', enum: ['us', 'ds', 'paofeng', 'backend', 'admin']}, //用户的类型，上游US，下游DS，跑分paofeng
}, {minimize: false, timestamps: true, collection: 'users'});
UserSchema.pre('save', function (next) {
	this.group_id = this.group_id || this.user_id;
	this.cash_rate = this.cash_rate || 0.8;
	next();
});
let UserModel = mongoose.model('usermodel', UserSchema);
exports.UserModel = UserModel;

/**定义 User 数据表 ,存储用户信息 */
let BillingAccountSchema = new mongoose.Schema({
	'group_id': {type: String, index: true, unique: true, required: true},      //全局（总）账号ID
	'accounts': {type: [String], default: [], index: true},                      //此全局账号拥有的分账号
	'balance_d0': {type: Number, default: 0},                                     //用户D0账户余额
	'balance_d1': {type: Number, default: 0},                                     //用户D1账户余额
}, {minimize: false, timestamps: true, collection: 'billing_account'});

let BillingAccountModel = mongoose.model('billingaccountmodel', BillingAccountSchema);
exports.BillingAccountModel = BillingAccountModel;

/**定义 AuthCode 数据表 ,存储 AuthCode 信息 */
let AuthCodeSchema = new mongoose.Schema({
	"auth_code": {type: String, required: true},                            //短信验证码
	"from": {type: String, required: true},                                 //发送人
	"dest": {type: String, required: true},                                 //目标用户，也就是要发送的手机号码
	"purpose": {type: String, required: true, default: "register", enum: ['register', 'login']},                              //验证目的
	"code_type": {type: String, required: true, default: 'sms', eunm: ['sms', 'png']}, //验证码类型
	"send_at": {type: Date, expires: 1800, default: new Date()}       //过期时间，如果删除此字段，应该就不过期
}, {minimize: false, timestamps: false, collection: 'authcodes'});

let AuthCodeModel = mongoose.model('authcodemodel', AuthCodeSchema);
exports.AuthCodeModel = AuthCodeModel;

/**定义 短信账务 数据表 ,存储 短消息 信息 */
let clientMsgLogSchema = new mongoose.Schema({
	'from_mobile': {type: String, required: true},                             //发送方
	'to_mobile': {type: String, required: true},                               //接收方
	'msg_type': {type: String, required: true, default: "sms", enum: ["sms", "notify", "app_record"]},   //客户端上传消息类型
	'received_time': {type: Date, index: true, required: true, default: undefined},     //接收时间- 设备上接收到的时间
	'sms_data': {type: String, required: true, index: true, unique: true},         //短信文本
	'bind_order_id': {type: String, required: false, index: true, sparse: true},    //绑定的 order id（订单ID）
	'payment_type': {type: String, required: false, default: undefined},         //入账还是出账
	'payment_time': {type: Date, required: false, default: undefined},           //付款时间
	'pay_number': {type: Number, required: false, default: undefined},           //付款/出款的金额
	'bank_account': {type: String, index: true, sparse: true, required: false},    //付款账号
	'bank_mark': {type: String, index: true, sparse: true, required: false},       //银行代码
	'bank_name': {type: String, index: true, sparse: true, required: false},       //银行全称
	'balance': {type: Number, index: true, required: false},                     //变动后的余额
}, {minimize: true, timestamps: true, collection: 'client_message_logs'});

let ClientMsgLogModel = mongoose.model('SmsLogModel', clientMsgLogSchema);
exports.ClientMsgLogModel = ClientMsgLogModel;

/**定义 用户短信卡槽号码政策数据表 */
let smsPhoneNumberLogSchema = new mongoose.Schema({
	'mobile_number': {type: String, required: true},                           //手机号
	'imei': {type: String, required: true, index: true, unique: true},             //imei号码
	'slot_number': {type: Number, required: false, default: 1},                  //卡槽号
	'sms_data': {type: Mixed, default: undefined},                             //短信原始文本
}, {minimize: true, timestamps: true, collection: 'sms_phone_number_logs'});

let SmsPhoneNumberLogModel = mongoose.model('SmsPhoneNumberDetectModel', smsPhoneNumberLogSchema);
exports.SmsPhoneNumberLogModel = SmsPhoneNumberLogModel;

/**定义 通用固码类商户信息 数据表 */
let generalPayShopSchema = new mongoose.Schema({
	'ds_user_id': {type: String, index: true, sparse: true, required: true, default: 'unknown'},    //属于下游哪个客户
	'shop_id': {type: String, index: true, unique: true, required: true},                         //商户号
	'shop_name': {type: String, index: true, sparse: true, required: true},                       //店铺名称
	'shop_channel': {type: String, index: true, sparse: true, required: true},                    //店铺所属的渠道（银盒子/银盛通等）
	'shop_login_pass': {type: String, index: true, sparse: true, required: true},                 //商户登录密码
	'shop_withdraw_pass': {type: String, index: true, sparse: true, required: true},              //商户支付密码
	'shop_industry': {type: String, index: true, sparse: true, required: true},                   //店铺所属行业                                              //
	'shop_city': {type: String, index: true, sparse: true, required: false},                      //店铺所在城市
	'shop_cookie': {type: String, index: true, sparse: true, required: false},                    //店铺的cookie
	'shop_cash_rate': {type: Number, index: false, default: 1.0, required: false},                //店铺实际到账比例（用户买1000，可能只收到994）
	'terminal_serial': {type: String, trim: true, default: undefined, required: false},         //终端序列号
	'shop_qrcode': {type: String, trim: true, default: undefined, required: false},             //QR码字符串
	'qrcode_image': {type: String, trim: true, default: undefined, required: false},            //QR码图片（base64？）
	'single_trade_min': {type: Number, required: false, default: 0},                             //单笔交易最小值
	'single_trade_max': {type: Number, required: false, default: 500000},                        //单笔交易最大值
	'daily_trade_max': {type: Number, required: false, default: 1000000},                        //每日最大交易额
	'working_start_hour': {type: Number, required: false, default: 0},                           //每日营业开始时间
	'working_end_hour': {type: Number, index: true, sparse: true, required: false, default: 86400000},  //营业结束时间
	'priority': {type: Number, index: true, required: true, default: 100},                        //优先级
	'alipay_enable': {type: Boolean, default: true},                                            //支付宝是否启用
	'wepay_enable': {type: Boolean, default: true},                                             //微信是否启用
	'unionpay_enable': {type: Boolean, default: true},                                          //云闪付是否启用
	'bank_account': {type: String, required: true},                                            //绑定的银行卡
	'bind_mobile': {type: String, required: true},                                             //绑定的手机号码
	'shop_hash': {type: String, index: true, sparse: true, required: false},                      //绑定的手机号码
	'promo_capture': {type: String, required: false},                                          //推广成果的截图
}, {minimize: true, timestamps: true, collection: 'general_pay_shops'});

generalPayShopSchema.pre('save', function (next) {
	// do stuff
	if (!this['shop_hash']) {
		this['shop_hash'] = Md5HashWithSalt(this['bind_mobile'] || this['shop_id'], this['bank_account'].slice(-4));
	}
	next();
});

if (!generalPayShopSchema.options.toObject) {
	generalPayShopSchema.options.toObject = {}
}
generalPayShopSchema.options.toObject.transform = function (doc, ret, options) {
	/*定义如果是 toObject 的时候，指定了 hide ，则隐藏hide 中的属性
	* doc.toObject({ hide: 'secret,_id', transform: true });
	* */
	if (options.hide) {
		options.hide.split(',').forEach(function (prop) {
			delete ret[prop];
		});
	}
	return ret;
};

let generalPayShopModel = mongoose.model('generalpayshopmodel', generalPayShopSchema);
exports.GeneralPayShopModel = generalPayShopModel;

/**定义 通用实时账务 数据表 , */
let generalBillingLogSchema = new mongoose.Schema({
	'unique_id': {type: String, index: true, unique: true, required: true},   //订单唯一区分号
	'shop_id': {type: String, index: true, required: true},      //商户号
	'shop_balance': {type: Number},                          //店铺当前余额,单位为人民币分，未扣手续费
	'live_data': {type: Mixed, default: undefined},            //实时的订单记录数据
	'history_data': {type: Mixed, default: undefined},         //历史订单数据（某些接口 每日结算后有更为详细的数据）
	'bill_time': {type: Date, index: true, required: true, default: new Date()},
	'assigned_req_order_id': {type: String, default: undefined}
}, {minimize: true, timestamps: true, collection: 'general_billing_log'});
exports.GeneralBillingLogModel = mongoose.model('generalbillinglogmodel', generalBillingLogSchema);

/**定义 withdrawOpLogSchema ,存储提现记录 */
let withdrawOpLogSchema = new mongoose.Schema({
	"withdraw_user_id": {type: String, index: true, required: true},   //提现用户
	'nick_name': {type: String},                   //用户昵称
	"withdraw_number": {type: Number, default: 0},     //系统提现金额
	"transfer_number": {type: Number, default: 0, required: true},     //实际转账金额（扣除手续费）
	"withdraw_bank_account": {type: String, required: true},     //提现到达的银行账户
	"withdraw_bank_name": {type: String, required: true},     //提现到达的银行账户的姓名
	"withdraw_bank": {type: String},     //提现到达的银行
	"cash_before_withdraw": {type: Number, default: undefined},     //期初账户现金总金额
	"cash_after_withdraw": {type: Number, default: undefined},        //期末账户现金总金额
	"status_date": {type: Date, default: new Date()},     //状态的日期
	"status": {
		type: String,
		index: true,
		required: true,
		default: "waiting_audit",
		enum: ['waiting_audit', 'verified', 'transferred']
	},  //状态
	"ticket_id": {type: String, default: undefined},  //银行流水单据号
	"inform_url": {type: String, default: undefined},  //回调地址
	"operator": {type: String},  //操作人员ID
}, {strict: false, timestamps: true, collection: 'withdraw_log'});
let WithdrawOpLogModel = mongoose.model('WithdrawOpLogModel', withdrawOpLogSchema);
exports.WithdrawOpLogModel = WithdrawOpLogModel;

/**定义 statisticsSchema ,存储 系统统计分析 记录 */
let statisticsSchema = new mongoose.Schema({
	"statistics_type": {type: String, default: 'info', index: true},
	"statistics_channel": {type: String, index: true},
	"statistics_time": {type: Date, default: new Date(), index: true},
	"statistics_data": {type: Mixed, default: undefined},
}, {strict: false, timestamps: true, collection: 'statistics_info'});
let StatisticsModel = mongoose.model('statisticsmodel', statisticsSchema);
exports.StatisticsModel = StatisticsModel;

/**定义 记账账务 数据表 , */
let accountingLogSchema = new mongoose.Schema({
	'accounting_type': {type: String, index: true, required: true, enum: ['journal', 'balance']},     //记账类型
	'source_document': {type: String, index: true, required: true},                                 //原始凭据
	'target_account': {type: String, index: true, required: true},                                  //计费账户
	'target_channel_rate': {type: Number, default: 0, required: true},                              //计费账户此通道的费率
	'target_bill_number': {type: Number, default: 0, required: true},                               //计费账户本次计费
	'target_opening_balance': {type: Number, default: 0, required: true},                           //计费账户期初余额
	'target_closing_balance': {type: Number, default: 0, required: true},                           //计费账户期末余额
	'upstream_id': {type: String, default: '', required: true},                                     //上游账户ID，也即是 通道ID
	'upstream_rate': {type: Number, default: 0, required: true},                                    //上游费率
	'upstream_bill_number': {type: Number, default: 0, required: true},                             //上游本次计费数量
	'upstream_previous_balance': {type: Number, default: 0, required: true},                        //上游账户期初余额
	'materials_id': {type: String, default: '', required: true},                                    //物料ID
	'materials_rate': {type: Number, default: 0, required: true},                                   //物料收费费率
	'materials_bill_number': {type: Number, default: 0, required: true},                            //物料本次收入数量
	'materials_previous_balance': {type: Number, default: 0, required: true},                       //物料期初余额
	'cash_time': {type: Date, index: true, required: true, default: new Date(4070883600000)},     //可提现时间
}, {minimize: true, timestamps: true, collection: 'accounting_log'});
exports.AccountingLogModel = mongoose.model('accountinglogmodel', accountingLogSchema);
