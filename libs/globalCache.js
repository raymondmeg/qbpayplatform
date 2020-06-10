/**
 * @author Raymond
 * @create 2019/7/27
 */

const Logger = require('tracer').console();
const EventEmitter = require('events');
const CRYPTO = require('crypto');
const _ = require('lodash');
const ASYNC = require('async');
const PATH = require('path').posix;
const FS = require('fs');
const JWT = require('jsonwebtoken');
const ErrorCode = require('./ErrorCode.js');
const AliSMSClient = require('@alicloud/sms-sdk');
const QrType = ['alipay', 'wepay', 'mixed', 'bank_card'];
const ChannelType = ['pdd', 'yunshanfu', 'onecodepay', 'unionpay', 'ystpay', 'zebrapay', 'idspay'];
const PropertyForSign = ["client_id", "request_channel", "order_id", "pay_in_number", "pay_type", "inform_url", "request_time", "version"];
const informPropForSign = ["order_id", "pay_in_number", "pay_time", "ticket_id", "pay_type"];
const WithDrawPropForSign = ['transfer_number', 'withdraw_bank_account', 'withdraw_bank_name', 'withdraw_bank', 'req_time'];

const BankMap = {
	"ABC": "中国农业银行",
	"ARCU": "安徽省农村信用社",
	"ASCB": "鞍山银行",
	"AYCB": "安阳银行",
	"BANKWF": "潍坊银行",
	"BGB": "广西北部湾银行",
	"BHB": "河北银行",
	"BJBANK": "北京银行",
	"BJRCB": "北京农村商业银行",
	"BOC": "中国银行",
	"BOCD": "承德银行",
	"BOCY": "朝阳银行",
	"BOD": "东莞银行",
	"BODD": "丹东银行",
	"BOHAIB": "渤海银行",
	"BOJZ": "锦州银行",
	"BOP": "平顶山银行",
	"BOQH": "青海银行",
	"BOSZ": "苏州银行",
	"BOYK": "营口银行",
	"BOZK": "周口银行",
	"BSB": "包商银行",
	"BZMD": "驻马店银行",
	"CBBQS": "城市商业银行资金清算中心",
	"CBKF": "开封市商业银行",
	"CCB": "中国建设银行",
	"CCQTGB": "重庆三峡银行",
	"CDB": "国家开发银行",
	"CDCB": "成都银行",
	"CDRCB": "成都农商银行",
	"CEB": "中国光大银行",
	"CGNB": "南充市商业银行",
	"CIB": "兴业银行",
	"CITIC": "中信银行",
	"CMB": "招商银行",
	"CMBC": "中国民生银行",
	"COMM": "交通银行",
	"CQBANK": "重庆银行",
	"CRCBANK": "重庆农村商业银行",
	"CSCB": "长沙银行",
	"CSRCB": "常熟农村商业银行",
	"CZBANK": "浙商银行",
	"CZCB": "浙江稠州商业银行",
	"CZRCB": "常州农村信用联社",
	"DAQINGB": "龙江银行",
	"DLB": "大连银行",
	"DRCBCL": "东莞农村商业银行",
	"DYCB": "德阳商业银行",
	"DYCCB": "东营市商业银行",
	"DZBANK": "德州银行",
	"EGBANK": "恒丰银行",
	"FDB": "富滇银行",
	"FJHXBC": "福建海峡银行",
	"FJNX": "福建省农村信用社联合社",
	"FSCB": "抚顺银行",
	"FXCB": "阜新银行",
	"GCB": "广州银行",
	"GDB": "广东发展银行",
	"GDRCC": "广东省农村信用社联合社",
	"GLBANK": "桂林银行",
	"GRCB": "广州农商银行",
	"GSRCU": "甘肃省农村信用",
	"GXRCU": "广西省农村信用",
	"GYCB": "贵阳市商业银行",
	"GZB": "赣州银行",
	"GZRCU": "贵州省农村信用社",
	"H3CB": "内蒙古银行",
	"HANABANK": "韩亚银行",
	"HBC": "湖北银行",
	"HBHSBANK": "湖北银行黄石分行",
	"HBRCU": "河北省农村信用社",
	"HBYCBANK": "湖北银行宜昌分行",
	"HDBANK": "邯郸银行",
	"HKB": "汉口银行",
	"HKBEA": "东亚银行",
	"HNRCC": "湖南省农村信用社",
	"HNRCU": "河南省农村信用",
	"HRXJB": "华融湘江银行",
	"HSBANK": "徽商银行",
	"HSBK": "衡水银行",
	"HURCB": "湖北省农村信用社",
	"HXBANK": "华夏银行",
	"HZCB": "杭州银行",
	"HZCCB": "湖州市商业银行",
	"ICBC": "中国工商银行",
	"JHBANK": "金华银行",
	"JINCHB": "晋城银行JCBANK",
	"JJBANK": "九江银行",
	"JLBANK": "吉林银行",
	"JLRCU": "吉林农信",
	"JNBANK": "济宁银行",
	"JRCB": "江苏江阴农村商业银行",
	"JSB": "晋商银行",
	"JSBANK": "江苏银行",
	"JSRCU": "江苏省农村信用联合社",
	"JXBANK": "嘉兴银行",
	"JXRCU": "江西省农村信用",
	"JZBANK": "晋中市商业银行",
	"KLB": "昆仑银行",
	"KORLABANK": "库尔勒市商业银行",
	"KSRB": "昆山农村商业银行",
	"LANGFB": "廊坊银行",
	"LSBANK": "莱商银行",
	"LSBC": "临商银行",
	"LSCCB": "乐山市商业银行",
	"LYBANK": "洛阳银行",
	"LYCB": "辽阳市商业银行",
	"LZYH": "兰州银行",
	"MTBANK": "浙江民泰商业银行",
	"NBBANK": "宁波银行",
	"NBYZ": "鄞州银行",
	"NCB": "南昌银行",
	"NHB": "南海农村信用联社",
	"NHQS": "农信银清算中心",
	"NJCB": "南京银行",
	"NXBANK": "宁夏银行",
	"NXRCU": "宁夏黄河农村商业银行",
	"NYBANK": "广东南粤银行",
	"ORBANK": "鄂尔多斯银行",
	"PSBC": "中国邮政储蓄银行",
	"QDCCB": "青岛银行",
	"QLBANK": "齐鲁银行",
	"SCCB": "三门峡银行",
	"SCRCU": "四川省农村信用",
	"SDEB": "顺德农商银行",
	"SDRCU": "山东农信",
	"SHBANK": "上海银行",
	"SHRCB": "上海农村商业银行",
	"SJBANK": "盛京银行",
	"SPABANK": "平安银行",
	"SPDB": "上海浦东发展银行",
	"SRBANK": "上饶银行",
	"SRCB": "深圳农村商业银行",
	"SXCB": "绍兴银行",
	"SXRCCU": "陕西信合",
	"SZSBK": "石嘴山银行",
	"TACCB": "泰安市商业银行",
	"TCCB": "天津银行",
	"TCRCB": "江苏太仓农村商业银行",
	"TRCB": "天津农商银行",
	"TZCB": "台州银行",
	"URMQCCB": "乌鲁木齐市商业银行",
	"WHCCB": "威海市商业银行",
	"WHRCB": "武汉农村商业银行",
	"WJRCB": "吴江农商银行",
	"WRCB": "无锡农村商业银行",
	"WZCB": "温州银行",
	"XABANK": "西安银行",
	"XCYH": "许昌银行",
	"XJRCU": "新疆农村信用社",
	"XLBANK": "中山小榄村镇银行",
	"XMBANK": "厦门银行",
	"XTB": "邢台银行",
	"XXBANK": "新乡银行",
	"XYBANK": "信阳银行",
	"YBCCB": "宜宾市商业银行",
	"YDRCB": "尧都农商行",
	"YNRCC": "云南省农村信用社",
	"YQCCB": "阳泉银行",
	"YXCCB": "玉溪市商业银行",
	"ZBCB": "齐商银行",
	"ZGCCB": "自贡市商业银行",
	"ZJKCCB": "张家口市商业银行",
	"ZJNX": "浙江省农村信用社联合社",
	"ZJTLCB": "浙江泰隆商业银行",
	"ZRCBANK": "张家港农村商业银行",
	"ZYCBANK": "遵义市商业银行",
	"ZZBANK": "郑州银行",
};
const Aly = require('aliyun-sdk');
const OS = require('os');
const SLSProjectName = 'paymentserverlog';
const SLSLogStoreName = 'payment_server_logstore';
const generalConfig = require('../configs/general.js');

/**
 *  全局缓存
 * */
class GeneralCache extends EventEmitter {
	constructor() {
		super();
		PropertyForSign.sort();
		informPropForSign.sort();
		WithDrawPropForSign.sort();
		this.PrefixOfUpStreamOrder = 'ftpay_';
		this.loadash = _;
		this.ASYNC = ASYNC;
		this.CachedUser = null;
		this.BaseCallBackUrl = 'https://' + generalConfig.api_server_domain + '/ppapi/callback/';

		/*系统事件名称，代常量*/
		this.Event = {
			'REQ_PAY_URL': 'REQ_PAY_URL',                            //请求支付码
			'NEW_USER_ADD': 'NEW_USER_ADD',                          //新用户加入
			'TASK_PUBLISHED': 'TASK_PUBLISHED',                      //新任务发布
			'USER_INVALID': 'USER_INVALID',                          //用户标记为非法
			'PAY_URL_SENDOUT': 'PAY_URL_SENDOUT',                    //支付码已经下发
			'ORDER_HAS_DELETED': 'ORDER_HAS_DELETED',                //订单已经删除
			'ORDER_HAS_PAID': 'ORDER_HAS_PAID',                      //订单已经支付
			'ORDER_ON_SHIPPING': 'ORDER_ON_SHIPPING',                //订单已经交运
			'ORDER_RECEIVE_SIGNED': 'ORDER_RECEIVE_SIGNED',          //订单已经签收
			'SAVE_COOKIE_PLZ': 'SAVE_COOKIE_PLZ',                    //保存cookie
			'REPORT_USER_USED': 'REPORT_USER_USED',                  //报告用户已经被使用
			'REQ_SHOP_DYNAMIC_CONFIG': 'req_shop_dynamic_config',    //获取商铺的动态配置
			'SET_SHOP_DYNAMIC_CONFIG': 'set_shop_dynamic_config',    //设置商铺的动态配置
		};
		/*系统任务枚举*/
		this.TaskType = {
			'CHECK_ORDER_SHIPPING': 'CHECK_ORDER_SHIPPING',          //检查订单是否发运
			'CHECK_ORDER_SIGNED': 'CHECK_ORDER_SIGNED',              //检查订单是否签收
			'RANDOM_VISIT': 'RANDOM_VISIT',                          //随机浏览
			'FIX_USER_LOGIN': 'FIX_USER_LOGIN',                      //修正用户登录
		};

		this.IOClient = null;

		this.FTPDD = null;

		this.BankMarkToNameMap = BankMap;               //银行代码-->银行全称的映射
		this.BankCardCache = null;
		this.UPStreamsById = {};        //上游的ID映射
		this.UPStreamsByChannel = {};   //上游类的 通道映射
		this.YstBackEndInsts = {};      //银盛通状态维护实例 集合
		this.StatisMethod = {};
		return this;
	}

	/** 调起 通道模块 */
	loadChannelClass() {
		// this.registerClass(require('./MixedFixQrPayClass'));    //聚合类固码支付
		// this.registerClass(require('./RawAlipayClass'));        //纯支付宝固码
		// this.registerClass(require('./RawUnionPayClass'));      //云闪付固码
		// this.registerClass(require('./RawWechatPayClass'));     //纯微信固码
		// this.registerClass(require('./HTZFPayFixAlyClass'));    //文林支付宝固码
		// this.registerClass(require('./HTZFPayFixWePayClass'));  //文林微信固码
		this.registerClass(require('./SHWPayClass.js'));  //文林微信固码
	}

	isPayTypeSupport(payType, classObj) {
		if (!payType) {
			return false;
		}
		let _payType = payType.toLocaleLowerCase(), n;
		switch (_payType) {
			case "wepay":
				n = 4;
				break;
			case "alipay":
				n = 2;
				break;
			case "bankcard":
				n = 1;
				break;
			default:
				return false;
		}
		let t = classObj.getSupportPayType() & n;
		return t === n;
	}

	registerClass(usInterfaceObj) {
		let idOfClass = usInterfaceObj.getClassId();
		let channelType = usInterfaceObj.getChannelType();
		this.StatisMethod[idOfClass] = usInterfaceObj.getStatistics;
		this.UPStreamsById[idOfClass] = usInterfaceObj;
		if (!this.UPStreamsByChannel[channelType]) {
			this.UPStreamsByChannel[channelType] = [];
		}
		this.UPStreamsByChannel[channelType].push(usInterfaceObj);
	}


	/** 阿里云的短信模版定义  您的验证码${code}，该验证码5分钟内有效，请勿泄漏于他人！ */
	getSMSTemplateDefine(name) {
		let r = {'template_id': '', 'template_data': null};
		switch (name.toLocaleLowerCase()) {
			case '用户注册验证码':
				r = {'template_id': 'SMS_137830056', 'template_data': {'code': ''}};
				break;
			case '登录确认验证码':
				r = {'template_id': 'SMS_137830058', 'template_data': {'code': ''}};
				break;
			default:
				r = {'template_id': 'SMS_137830056', 'template_data': {'code': ''}};
				break;
		}
		return r;
	};

	/** 发送短信
	 * @param {string} phone 短信发送号码
	 * @param {string} signName 短信签名
	 * @param {Object} templateObj 短信模版对象
	 * */
	SendSMS(phone, signName, templateObj) {
		"use strict";
	};


	/**产生 N 位长度的验证码
	 * @param {number} length 验证码的长度，最小为4，最大为16位长度
	 * @return {string}
	 * */
	genAuthCode(length) {
		let len;
		if (isNaN(length) || length < 4) {
			len = 4;
		} else {
			len = Math.min(length, 16);
		}
		let authCode = '';
		for (let i = 0; i < len; i++) {
			authCode += (Math.min(9, Math.floor(10 * Math.random())));
		}
		return authCode;
	};

	/**
	 * 初始化一个 Express 需要的 Cookie 配置选项
	 * @return {Object}
	 * */
	getCookieOption() {
		return {
			maxAge: 1000 * 60 * 60 * 24 * 365, // 一年
			domain: '.912586.com',
			httpOnly: false,
			secure: true,
			sameSite: "none",  //none 必须和 secure 同时设置才能在 chrome 中携带 cookie
			signed: true
		}
	};

	/** 根据 userdoc 对象，产生 JWT token
	 * @param {Object} userDoc 用户文档对象
	 * @return {string}
	 * */
	makeUserJWTToken(userDoc) {
		if (!userDoc) {
			return '';
		}
		let payload = {
			'user_id': userDoc.user_id,              //用户ID ,可以是手机号码
			'group_id': userDoc.group_id,            //用户组ID
			'top_up_rate': userDoc.top_up_rate,      //用户充值费率
			'business_type': userDoc.business_type,  //用户的类型，上游US，下游DS，跑分paofeng
		};
		return JWT.sign(payload, this.getJwtPrivateKey(), {'expiresIn': "168h"});   //session 7天后失效
	}

	/** JWT 的统一密钥
	 * @return {string}
	 * */
	getJwtPrivateKey() {
		return 'jwt.privatekey';
	};

	/** 获取指定 UserId 的 用户文档对象
	 * @param {string} idForSearch - 需要搜索的用户ID
	 * */
	findOneUserById(idForSearch) {
		let that = this, foundUser = null;
		if (!idForSearch || typeof idForSearch !== "string" || !this.CachedUser || !this.CachedUser.length) {
			return null;
		}
		let eleDoc;
		for (let i = 0; i < this.CachedUser.length; i++) {
			eleDoc = this.CachedUser[i];
			if (eleDoc.user_id === idForSearch) {
				foundUser = eleDoc;
				break;
			}
		}
		return foundUser;
	}

	/**产生一个 Http response对象*/
	GenResponseObject(code) {
		"use strict";
		let resObject;
		if (isNaN(code) || !ErrorCode[code]) {
			resObject = {
				err_code: -1,
				err_desc: '未知错误',
			}
		} else {
			resObject = {
				err_code: parseInt(code),
				err_desc: ErrorCode[code],
			}
		}
		return resObject;
	};

	/** 统一 回调通知的 数据对象 */
	UniversalInformObject(code) {
		let resObj = this.GenResponseObject(code);
		resObj['order_id'] = null;
		resObj['pay_in_number'] = 0;
		resObj['pay_time'] = 0;
		resObj['ticket_id'] = '';
		resObj['pay_type'] = '';
		return resObj;
	}

	/** 统一 下游用户提交的数据格式对象 */
	UniversalUserPost(postData) {
		let data = {
			'client_id': 'demo',
			'request_channel': 'demo',              //支付渠道：pdd，支付宝，微信，支付宝转卡等等
			'force_channel_id': undefined,          //某个渠道的代码
			'sign': '',
			'pay_type': 'demo',                     //支付方式：银行卡/支付宝/微信
			'pay_in_number': 0,
			'inform_url': '',
			'request_time': 0,
			'order_id': new Date().getTime(),
			'app_data': undefined,
			'version': undefined,
			'extra': undefined
		};
		/*复制共有属性，并将 post 的其他属性分类到 extra */
		if (postData) {
			for (const propKey in postData) {
				if (!postData.hasOwnProperty(propKey)) {
					continue;
				}
				if (data.hasOwnProperty(propKey)) {
					data[propKey] = postData[propKey];
				} else {
					data.extra = data.extra || {};
					data.extra[propKey] = postData[propKey]
				}
			}
		}

		data.pay_in_number = parseInt(data.pay_in_number, 10);
		data.request_time = parseInt(data.request_time, 10);

		if (data.pay_type && typeof data.pay_type === "string") {
			data.pay_type = data.pay_type.toLocaleLowerCase();
		} else {
			data.pay_type = undefined;
		}
		if (data.request_channel && typeof data.request_channel === "string") {
			data.request_channel = data.request_channel.toLocaleLowerCase();
		} else {
			data.request_channel = undefined;
		}
		if (data.sign && typeof data.sign === "string") {
			data.sign = data.sign.toLocaleLowerCase();
		} else {
			data.sign = undefined;
		}
		if (data.force_channel_id && typeof data.force_channel_id === "string") {
			data.force_channel_id = data.force_channel_id.toLocaleLowerCase();
		} else {
			data.force_channel_id = undefined;
		}
		if (!data.inform_url || typeof data.inform_url !== "string") {
			data.inform_url = undefined;
		}
		/* 修剪属性 */
		for (let prop in data) {
			if (data.hasOwnProperty(prop)) {
				if (data[prop] === undefined || data[prop] === null) {
					delete data[prop];
				}
			}
		}
		return data;
	}

	/** 统一/格式化 通用的店铺对象 */
	UniversalMasterialObject(docForFormat) {
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
		};

		if (docForFormat) {
			Object.keys(data).forEach(function (key) {
				data[key] = docForFormat[key];
			});
			data.id = docForFormat['id'];
			data.shop_id = docForFormat['shop_id'] || docForFormat['yst_id'];
			data.shop_channel = docForFormat['shop_channel'] || docForFormat['channel_id'];
			data.shop_qrcode = docForFormat['shop_qrcode'] || docForFormat['yst_qrcode'];
		}
		return data;
	}

	/** 统一 下游用户提交的提现对象 */
	UniversalWithDrawPost(postData) {
		let that = this;
		let data = {
			"withdraw_id": undefined,   //记录的ID值
			"withdraw_number": 0,     //系统提现金额
			"transfer_number": 0,     //实际转账金额（扣除手续费）
			"withdraw_bank_account": undefined,     //提现到达的银行账户
			"withdraw_bank_name": undefined,     //提现到达的银行账户的姓名
			"withdraw_bank": undefined,     //提现到达的银行
			"inform_url": undefined,     //回调地址
			"req_time": undefined,     //请求时间
			"sign": undefined,     //签名
			"isValid": true,     //签名之前是否合法
			"page_index": 0,     //签名之前是否合法
			"page_size": 30,     //签名之前是否合法
			"signMethod": undefined,     //签名方法
		};
		/*复制共有属性，并将 post 的其他属性分类到 extra */
		if (postData) {
			for (const propKey in postData) {
				if (!postData.hasOwnProperty(propKey)) {
					continue;
				}
				if (data.hasOwnProperty(propKey)) {
					data[propKey] = postData[propKey];
				} else {
					data.extra = data.extra || {};
					data.extra[propKey] = postData[propKey]
				}
			}
		}

		data.withdraw_number = isNaN(data.withdraw_number) ? undefined : Math.round(data.withdraw_number);
		data.transfer_number = isNaN(data.transfer_number) ? undefined : Math.round(data.transfer_number);

		if (data.sign && typeof data.sign === "string") {
			data.sign = data.sign.toLocaleLowerCase();
		} else {
			data.sign = undefined;
		}

		if (!data.inform_url || typeof data.inform_url !== "string") {
			data.inform_url = undefined;
		}
		if (!data.req_time || !(/^\d+/.test(data.req_time))) {
			data.req_time = undefined;
		}
		if (!data.page_index || isNaN(data.page_index)) {
			data.page_index = 0;
		} else {
			data.page_index = Math.min(parseInt(data.page_index, 10), 1000);
		}
		if (!data.page_size || isNaN(data.page_size)) {
			data.page_size = 30;
		} else {
			data.page_size = Math.min(parseInt(data.page_size, 10), 100);
		}
		/* 修剪属性 */
		for (let prop in data) {
			if (data.hasOwnProperty(prop)) {
				if (data[prop] === undefined || data[prop] === null) {
					delete data[prop];
				}
			}
		}

		data.signMethod = function signPostData(userKey) {
			let key, value, signStrArr = [];
			for (let i = 0; i < WithDrawPropForSign.length; i++) {
				key = WithDrawPropForSign[i];
				value = this[key];
				if (!value) {
					//所有请求中参数，如果其值为空，则无需加入签名字符串。注意，其值为空包括但不限于 null，nil，undefined，“”，{}等等。
					//但是等同于在 各种不同计算机编程语言中，在进行逻辑非运算后，布尔值为true 的对象。
					continue;
				}
				signStrArr.push(key + "=" + value);
			}
			signStrArr.push(userKey);
			return that.MD5Hash(signStrArr.join('&')).toString().toLocaleLowerCase();
		}.bind(data);

		return data;
	}

	/** 检查并校验客户端发送的请求
	 * @return Object
	 * */
	verifyClientPost(postData) {
		if (!postData || typeof postData !== "object") {
			return {code: 4};
		}
		let data = this.UniversalUserPost(postData);
		if (!data.client_id || !data.request_channel || !data.sign || !data.pay_type || !data.pay_in_number
		  || !data.request_time || !data.order_id || isNaN(data.pay_in_number)) {
			return {code: 102};
		}

		/*此处 因为需要 添加个码支付的接口，因此放开此限制*/
		// if (Number.isInteger(data.pay_in_number*0.01)) {
		//     if (!(parseInt(data.pay_in_number*0.01,10) % 10)) {
		//         return {code: 109};
		//     }
		// }

		if (!this.UPStreamsByChannel[data.request_channel] || !this.UPStreamsByChannel[data.request_channel].length) {
			Logger.error('无此通道');
			return {code: 104};
		}

		// if (ChannelType.indexOf(data.request_channel) < 0) {
		//     return {code: 104};
		// }
		if (QrType.indexOf(data.pay_type) < 0) {
			return {code: 105};
		}
		if (data.force_channel_id && !this.UPStreamsById[data.force_channel_id]) {
			return {code: 106};
		}
		let userDoc = this.findOneUserById(data.client_id);
		if (!userDoc || !userDoc.is_enabled) {
			return {code: 108};
		}
		// Logger.info('sign:',this.signTheData(data,userDoc.user_key));
		if (data.version) {
			if (data.sign !== this.signDataV2(data, userDoc.user_key)) {
				return {code: 103};
			}
		} else {
			if (userDoc.user_id !== 'u116632') {
				return {code: 103};
			}
		}
		return data;
	}

	/**
	 * MD5 Function
	 * @param {string} string
	 * @return {string}
	 * */
	MD5Hash(string) {
		return CRYPTO.createHash('md5').update(string).digest('hex');
	}

	/** 本平台的回调验签方法
	 * @param {Object} data - 需要签名的数据
	 * @param {string} key - 平台分配的客户的key
	 * @return string
	 * */
	signTheCallBackData(data, key) {
		let kvArr = [];
		for (let i = 0; i < informPropForSign.length; i++) {
			const keysArrElement = informPropForSign[i];
			if (data[keysArrElement] !== null && data[keysArrElement] !== undefined) {
				kvArr.push(keysArrElement + '=' + data[keysArrElement]);
			}

		}
		kvArr.push(key);
		return this.MD5Hash(kvArr.join('&')).toString().toLocaleLowerCase();
	}

	/** 本平台的签名方法 Version 2
	 * @param {Object} data - 需要签名的数据
	 * @param {string} key - 平台分配的客户的key
	 * @return string
	 * */
	signDataV2(data, key) {
		let kvArr = [];
		for (let i = 0; i < PropertyForSign.length; i++) {
			const keysArrElement = PropertyForSign[i];
			kvArr.push(keysArrElement + '=' + data[keysArrElement]);
		}
		kvArr.push(key);
		return this.MD5Hash(kvArr.join('&')).toString().toLocaleLowerCase();
	}

	/**
	 * MD5 Function
	 * @param {string} fileName - 写入磁盘的文件名
	 * @param {string} fileData - 写入磁盘的文件内容
	 * */
	writeUpStreamCBDataToDisk(fileName, fileData) {
		let name = PATH.join(process.cwd(), 'log', fileName);
		FS.writeFile(name, JSON.stringify(fileData, null, 4), function (error) {
		})
	}

	/** 获取代表 今天 开始的日期对象
	 * @return Date
	 * */
	getTodayStartDateObj() {
		let d = new Date();
		d.setHours(0, 0, 0, 0);
		return d;
	}

	/** 获取代表 今天 结束的日期对象
	 * @return Date
	 * */
	getTodayEndDateObj() {
		let d = new Date();
		d.setHours(23, 59, 59, 999);
		return d;
	}

	/** 产生一个 支付宝转卡的 统计分组数据对象
	 * @return Object
	 * */
	getAly2BankGroupObject() {
		return {
			'totalAmount': 0,
			"totalUsed": 0,
			'usedIn1minutes': 0,
			'usedAmountIn10Minutes': new Set()
		};
	}

	/**计算MD5值
	 * @param {Object} strOrBuf 需要Md5 的字符串或者buffer
	 * @param {string} salt md5盐值
	 * @return {string} MD5值
	 * */
	Md5HashWithSalt(strOrBuf, salt) {
		let saltPassword = strOrBuf + ':' + salt;
		let md5 = CRYPTO.createHash('md5');
		return md5.update(saltPassword).digest('hex');
	};

	getAlySlsLogInstance() {
		if (!this.AlySlsLogger) {
			this.AlySlsLogger = new Aly.SLS({
				"accessKeyId": "LTAI5gyvkBPKq5hb",
				"secretAccessKey": "HzO7hV9bKUhcLfDAbBCqaMkA3gvDlI",

				// 根据你的 sls project所在地区选择填入
				// 北京：http://cn-beijing.sls.aliyuncs.com
				// 杭州：http://cn-hangzhou.sls.aliyuncs.com
				// 青岛：http://cn-qingdao.sls.aliyuncs.com
				// 深圳：http://cn-shenzhen.sls.aliyuncs.com

				// 注意：如果你是在 ECS 上连接 SLS，可以使用内网地址，速度快，没有带宽限制。
				// 北京：cn-hangzhou-intranet.sls.aliyuncs.com
				// 杭州：cn-beijing-intranet.sls.aliyuncs.com
				// 青岛：cn-qingdao-intranet.sls.aliyuncs.com
				// 深圳：cn-shenzhen-intranet.sls.aliyuncs.com
				'endpoint': 'http://cn-shanghai-intranet.log.aliyuncs.com',

				// 这是 sls sdk 目前支持最新的 api 版本, 不需要修改
				'apiVersion': '2015-06-01',

				//以下是可选配置
				'httpOptions': {
					timeout: 10000  //10秒, 默认没有timeout
				}
			});
		}
		return this.AlySlsLogger;
	}

	getAlySlsLogObj() {
		return {
			'projectName': SLSProjectName,
			'logStoreName': SLSLogStoreName,
			'logGroup': this.getLogGroupObj(),
		}
	}

	getLogGroupObj() {
		return {
			logs: [],
			topic: 'general', //optional
			source: OS.hostname() //optional
		};
	}

	makeAlyLogGroupRecordFromObject(data) {
		if (!data) {
			return;
		}
		let lgRecord = {'time': Math.floor(new Date().getTime() * 0.001), 'contents': []};
		for (let proper in data) {
			if (data.hasOwnProperty(proper)) {
				lgRecord.contents.push({'key': proper, 'value': data[proper]});
			}
		}
		return lgRecord;
	}

	/**
	 * 对字符串进行 URL Encode
	 * @param {string} oriStr - 需要编码的字符串
	 * @return {string}
	 * */
	urlStringEncode(oriStr) {
		let result = "";
		if (oriStr) {
			for (let i = 0; i < oriStr.length; i++) {
				result += ('%' + oriStr.charCodeAt(i).toString(16));
			}
		}
		return result;
	}

	/**
	 * 对字符串进行 URL Encode
	 * @param {string} uaStr - user agent 字符串
	 * @return {Object}
	 * */
	parseUA(uaStr) {
		if (!uaStr) {
			return null;
		}
		let u = uaStr;
		let match = {
			//内核
			'Trident': u.indexOf('Trident') > -1 || u.indexOf('NET CLR') > -1,
			'Presto': u.indexOf('Presto') > -1,
			'WebKit': u.indexOf('AppleWebKit') > -1,
			'Gecko': u.indexOf('Gecko/') > -1,
			//浏览器
			'Safari': u.indexOf('Safari') > -1,
			'Chrome': u.indexOf('Chrome') > -1 || u.indexOf('CriOS') > -1,
			'IE': u.indexOf('MSIE') > -1 || u.indexOf('Trident') > -1,
			'Edge': u.indexOf('Edge') > -1 || u.indexOf('Edg/') > -1,
			'Firefox': u.indexOf('Firefox') > -1 || u.indexOf('FxiOS') > -1,
			'Firefox Focus': u.indexOf('Focus') > -1,
			'Chromium': u.indexOf('Chromium') > -1,
			'Opera': u.indexOf('Opera') > -1 || u.indexOf('OPR') > -1,
			'Vivaldi': u.indexOf('Vivaldi') > -1,
			'Yandex': u.indexOf('YaBrowser') > -1,
			'Arora': u.indexOf('Arora') > -1,
			'Lunascape': u.indexOf('Lunascape') > -1,
			'QupZilla': u.indexOf('QupZilla') > -1,
			'Coc Coc': u.indexOf('coc_coc_browser') > -1,
			'Kindle': u.indexOf('Kindle') > -1 || u.indexOf('Silk/') > -1,
			'Iceweasel': u.indexOf('Iceweasel') > -1,
			'Konqueror': u.indexOf('Konqueror') > -1,
			'Iceape': u.indexOf('Iceape') > -1,
			'SeaMonkey': u.indexOf('SeaMonkey') > -1,
			'Epiphany': u.indexOf('Epiphany') > -1,
			'360': u.indexOf('QihooBrowser') > -1 || u.indexOf('QHBrowser') > -1,
			'360EE': u.indexOf('360EE') > -1,
			'360SE': u.indexOf('360SE') > -1,
			'UC': u.indexOf('UC') > -1 || u.indexOf(' UBrowser') > -1,
			'QQBrowser': u.indexOf('QQBrowser') > -1,
			'QQ': u.indexOf('QQ/') > -1,
			'Baidu': u.indexOf('Baidu') > -1 || u.indexOf('BIDUBrowser') > -1 || u.indexOf('baiduboxapp') > -1,
			'Maxthon': u.indexOf('Maxthon') > -1,
			'Sogou': u.indexOf('MetaSr') > -1 || u.indexOf('Sogou') > -1,
			'LBBROWSER': u.indexOf('LBBROWSER') > -1,
			'2345Explorer': u.indexOf('2345Explorer') > -1 || u.indexOf('Mb2345Browser') > -1,
			'115Browser': u.indexOf('115Browser') > -1,
			'TheWorld': u.indexOf('TheWorld') > -1,
			'XiaoMi': u.indexOf('MiuiBrowser') > -1,
			'Quark': u.indexOf('Quark') > -1,
			'Qiyu': u.indexOf('Qiyu') > -1,
			'Wechat': u.indexOf('MicroMessenger') > -1,
			'Taobao': u.indexOf('AliApp(TB') > -1,
			'Alipay': u.indexOf('AliApp(AP') > -1,
			'Weibo': u.indexOf('Weibo') > -1,
			'Douban': u.indexOf('com.douban.frodo') > -1,
			'Suning': u.indexOf('SNEBUY-APP') > -1,
			'iQiYi': u.indexOf('IqiyiApp') > -1,
			'DingTalk': u.indexOf('DingTalk') > -1,
			'Huawei': u.indexOf('HuaweiBrowser') > -1 || u.indexOf('HUAWEI') > -1,
			//系统或平台
			'Windows': u.indexOf('Windows') > -1,
			'Linux': u.indexOf('Linux') > -1 || u.indexOf('X11') > -1,
			'Mac OS': u.indexOf('Macintosh') > -1,
			'Android': u.indexOf('Android') > -1 || u.indexOf('Adr') > -1,
			'Ubuntu': u.indexOf('Ubuntu') > -1,
			'FreeBSD': u.indexOf('FreeBSD') > -1,
			'Debian': u.indexOf('Debian') > -1,
			'Windows Phone': u.indexOf('IEMobile') > -1 || u.indexOf('Windows Phone') > -1,
			'BlackBerry': u.indexOf('BlackBerry') > -1 || u.indexOf('RIM') > -1,
			'MeeGo': u.indexOf('MeeGo') > -1,
			'Symbian': u.indexOf('Symbian') > -1,
			'iOS': u.indexOf('like Mac OS X') > -1,
			'Chrome OS': u.indexOf('CrOS') > -1,
			'WebOS': u.indexOf('hpwOS') > -1,
			//设备
			'Mobile': u.indexOf('Mobi') > -1 || u.indexOf('iPh') > -1 || u.indexOf('480') > -1,
			'Tablet': u.indexOf('Tablet') > -1 || u.indexOf('Pad') > -1 || u.indexOf('Nexus 7') > -1
		};
		match.compatibleAlipay = !(match.QQ || match.QQBrowser || match.Wechat || match["Mac OS"]
		  || match["Chrome OS"] || match.WebOS);
		return match;
	}

	/**
	 * 增加或者减少总账户的金额
	 * @param {string} groupId - 总账户的Id
	 * @param {string} type - 计费类型
	 * @param {number} val - 增加或者减少的数值
	 * @param {function} [callback] - 回调函数
	 * */
	changeGlobalBalance(groupId, type, val, callback) {
		if (!groupId) {
			callback && callback(new Error('no_group_id'), null);
			return false;
		}

		if (!type || (type !== 'D0' && type !== 'D1')) {
			callback && callback(new Error('type_error'), null);
			return false;
		}
		if (!val) {
			//查询余额
			val = 0;
		}

		let BillingAccountModel = require('../Models/ModelDefines').BillingAccountModel;
		let updateObj;
		if (type === 'D0') {
			updateObj = {'balance_d0': val};
		} else {
			updateObj = {'balance_d1': val};
		}

		BillingAccountModel.findOneAndUpdate({'group_id': groupId}, {'$inc': updateObj}, {'new': false}, function (error, oriDoc) {
			if (error) {
				callback && callback(error, null);
				return false;
			}
			if (!oriDoc) {
				callback && callback(new Error('doc_not_found'), null);
				return false;
			}
			callback && callback(null, oriDoc);
		})
	}

}

let instance = new GeneralCache();
module.exports = instance;
