#!/usr/bin/env node

/**
 * 〈一句话功能简述〉<br>
 * 〈〉
 *
 * @author Raymond
 * @create 2019/9/1
 */

const FS = require('fs');
const EventEmitter = require('events');
const Models = require('../Models/ModelDefines.js');
const mongoose = require('../libs/MongooseClass');
const MongooseLib = require('mongoose');
const _ = require('lodash');
const ASYNC = require('async');
const HttpRequest = require('request');
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

class manualworks extends EventEmitter {
    constructor() {
        super();
    }

    initBankCard() {
        let content = FS.readFileSync('../log/bankcard.csv', 'utf8');
        content = content.replace('/\r\n/g', '\n');
        let contentArr = content.split('\n');
        contentArr.shift();
        contentArr.forEach(function (element) {
            if (!element) {
                return;
            }
            let parseArr = element.split(',');
            let insertDoc = {
                'bank_name': null,                                   //银行名称
                'bank_mark': null,                                   //银行代码
                'account_name': parseArr[0],                                //银行账户名
                'account_no': parseArr[2],                      //银行账号
                'bind_mobile': parseArr[1],                                 //绑定的手机
                'is_enable': true,                                                //
                'single_trade_min': 20000,
                'single_trade_max': 500000,
                'daily_trade_min': 0,
                'daily_trade_max': 5000000,
                'monthly_trade_min': 0,
                'monthly_trade_max': 200000000,
                'working_start_hour': 0,
                'working_end_hour': 86400000,
                'priority': 100,
            };

            HttpRequest.get('https://ccdcapi.alipay.com/validateAndCacheCardInfo.json?_input_charset=utf-8&cardBinCheck=true&cardNo=' + parseArr[2],
              {'json': true},
              function (error, response, body) {
                  if (error) {
                      console.error(error.message);
                  }
                  insertDoc.bank_mark = body.bank;
                  insertDoc.bank_name = BankMap[body.bank];
                  Models.BankCardModel.create(insertDoc, function (error, result) {
                      error && console.error(error);
                  })
              });

        });

    }

    updateUserGroup() {
        Models.UserModel.find({}).exec()
          .then(function (docs) {
              docs.forEach(function (userDoc) {
                  userDoc.set('group_id', userDoc.user_id, {'strict': false});
                  userDoc.save(function (saveError, saved) {
                      saveError && console.error(saveError.message);
                      saveError = null;
                      saved = null;
                  })
              })
          })
          .catch(function (err) {
              console.error(err);
              err = null;
          })
    }

    insertBackEndUser() {
        let doc, insertDocs = [], random1, random2;
        for (let i = 0; i < 20; i++) {
            random1 = _.random(100000, 999999);
            doc = new Models.UserModel({
                user_id: 'be' + random1,
                user_key: _.random(10000000, 99999999),
                nick_name: '后台用户' + random1,
                group_id: 'd807500',
                business_type: 'backend'
            });
            insertDocs.push(doc);
        }
        Models.UserModel.insertMany(insertDocs, {ordered: false}, function (error, docs) {
            if (error) {
                Logger.error('create users error', error);

            }
            error = null;
            docs = null;
            process.exit(1);
        });
    }

    SplitOrdersCollection() {
        Models.OrderModel.aggregate()
          .addFields({"convertedDate": {"$toDate": "$req_time"}})
          .group({
              "_id": {
                  "year": {"$year": "$convertedDate"},
                  "month": {"$month": "$convertedDate"},
                  "day": {"$dayOfMonth": "$convertedDate"}
              },
              "docs": {"$push": "$$ROOT"}
          })
          .option({"allowDiskUse": true})
          .exec()
          .then(function (results) {
              results.forEach(function (groupDoc) {
                  let idObj = groupDoc._id;
                  let docArr = groupDoc.docs;
                  let colName = "platform_orders_" + idObj.year + '_' + idObj.month + '_' + idObj.day;
                  let colSchema = Models.OrderSchema.clone();
                  colSchema.set('collection', colName);
                  colSchema.set('strict', false);
                  let dynModel = MongooseLib.model('dyn' + colName, colSchema);
                  dynModel.insertMany(docArr, {'ordered': false}, function (error, result) {
                      error && console.error(error);
                      error = null;
                      result = null;
                  })
              })
          })
          .catch(function (error) {
              console.error(error);
          })

    }

    insertFakeOCPShop() {
        let doc, insertDocs = [], fakeIndus = ['餐饮', '建材', '设计', '娱乐业', '零售业'];
        for (let i = 0; i < 20; i++) {
            doc = new Models.OneCodePayShopModel({
                'ds_user_id': Math.random() > 0.5 ? 'd209344' : 'd807500',                      //属于下游哪个客户
                'shop_id': parseInt(10000 + Math.random() * 89999, 10) + '',                         //店铺号
                'shop_name': '贾铺' + parseInt(10000 + Math.random() * 89999, 10),                       //店铺名称                                                //
                'shop_industry': fakeIndus[parseInt(Math.random() * 4 + '', 10)],                   //店铺所属行业
                'single_trade_min': Math.random() > 0.5 ? 0 : 100,                             //单笔交易最小值
                'single_trade_max': Math.random() > 0.5 ? 500000 : 1000000,                          //单笔交易最大值
                'daily_trade_max': Math.random() > 0.5 ? 5000000 : 100000000,                        //每日最大交易额
            });
            insertDocs.push(doc);
        }
        Models.OneCodePayShopModel.insertMany(insertDocs, {ordered: false}, function (error, docs) {
            if (error) {
                Logger.error('create users error', error);
            }
            error = null;
            docs = null;
            process.exit(1);
        });
    }

    updatePddGoods() {
        let content = FS.readFileSync('./log/pddgoods-qiqi.CSV', 'utf8');
        let contentArr = content.split('\n');
        contentArr.forEach(function (element) {
            if (!element) {
                return;
            }
            let parseArr = element.split(',');
            let filterObj = {
                'ds_user_id': 'd807500',                      //属于下游哪个客户
                'shop_id': parseArr[0],                         //店铺号
                'goods_id': parseArr[2],                        //商品号
            };
            let updateObj = {
                'shop_name': parseArr[1],                       //店铺名称
                'goods_name': parseArr[3],                      //商品名称
                'single_price': parseInt(parseArr[4], 10),          //单购价格
                'group_price': parseInt(parseArr[5], 10),          //拼购价格
                'delay_sign': false,                                             //是否延迟签收(D+2)模式
                'is_enable': true,
            };
            Models.PddGoodsModel.findOneAndUpdate(filterObj, updateObj, {
                'upsert': true,
                'setDefaultsOnInsert': true
            }).exec(function (error, doc) {
                error && console.log(error);
                error = null;
                doc = null;
            })
        });

    }

    /** 分类统计 pdd 当日店铺 收款金额*/
    groupPddGoodsPerShop() {
        let contentStr = '店铺名称,待签收总金额,已签收总金额,当日总金额\n';
        let curDate = new Date();
        let todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        let fileName = 'pdd_shop_accounting_' + curDate.getFullYear() + '_' + (curDate.getMonth() + 1) + '_' + curDate.getDate() + '.csv';

        Models.PddOrderModel.find({'pdd_order_time': {'$gte': todayStart.getTime()}, 'status': {'$gte': 2}}).exec()
          .then(function (pddOrders) {
              let groupObj = {
                  'global_unsigned_amount': 0,
                  'global_signed_amount': 0,
                  'global_total_amount': 0,
              }, _shopId, _shopName, _amount, _status;
              pddOrders.forEach(function (pddOrder) {
                  _shopId = pddOrder['shop_id'];
                  _shopName = pddOrder['shop_name'];
                  _amount = pddOrder['order_amount'] * 0.01;
                  _status = pddOrder['status'];
                  if (!_shopId || !_status || !_shopName || !_amount) {
                      return;
                  }
                  if (!groupObj[_shopId]) {
                      groupObj[_shopId] = {
                          'shop_name': _shopName,
                          'unsigned_amount': 0,
                          'signed_amount': 0,
                          'total_amount': 0,
                      }
                  }

                  if (_status !== 14) {
                      groupObj[_shopId].unsigned_amount += _amount;
                      groupObj[_shopId].total_amount += _amount;
                      groupObj.global_unsigned_amount += _amount;
                      groupObj.global_total_amount += _amount;
                  } else {
                      groupObj[_shopId].signed_amount += _amount;
                      groupObj[_shopId].total_amount += _amount;
                      groupObj.global_signed_amount += _amount;
                      groupObj.global_total_amount += _amount;
                  }
              });
              contentStr += ('全部汇总' + ','
                + groupObj.global_unsigned_amount.toFixed(2) + ','
                + groupObj.global_signed_amount.toFixed(2) + ','
                + groupObj.global_total_amount.toFixed(2) + '\n');
              delete groupObj.global_unsigned_amount;
              delete groupObj.global_signed_amount;
              delete groupObj.global_total_amount;

              Object.keys(groupObj).forEach(function (shopId) {
                  let valueObj = groupObj[shopId];
                  if (!valueObj) {
                      return;
                  }
                  contentStr += (valueObj.shop_name + ','
                    + valueObj.unsigned_amount.toFixed(2) + ','
                    + valueObj.signed_amount.toFixed(2) + ','
                    + valueObj.total_amount.toFixed(2) + '\n');
              });

              FS.writeFileSync('/tmp/' + fileName, contentStr);
              process.exit(0);

          })
          .catch(function (error) {
              console.error(error);
              process.exit(1);
          })
    }

    /** 导入 一码付商铺 */
    importOCPShopInfo() {
        let content = FS.readFileSync('/tmp/ocpshop-20191113.csv', 'utf8');
        let contentArr = content.split('\n');
        let shopObjArr = [], shopInfoObj, objForInsert;
        contentArr.forEach(function (infoLine) {
            if (!infoLine) {
                return;
            }
            let shopInfoArr = infoLine.split(',');
            if (!shopInfoArr.length) {
                return;
            }
            let filterObj = {
                'shop_id': shopInfoArr[0],                         //店铺号
            };
            shopInfoObj = {
                'single_trade_min': parseInt(shopInfoArr[4], 10) * 100 || 10000,     //单笔交易最小值
                'single_trade_max': parseInt(shopInfoArr[5], 10) * 100 || 500000,     //单笔交易最大值
                'daily_trade_max': parseInt(shopInfoArr[6], 10) * 100 || 3500000,     //每日最大交易额
                'working_start_hour': parseInt(shopInfoArr[7], 10) || 0,           //每日营业开始时间
                'working_end_hour': parseInt(shopInfoArr[8], 10) || 24,  //营业结束时间
            };
            objForInsert = {
                'ds_user_id': 'd807500',                      //属于下游哪个客户 d807500
                'shop_name': shopInfoArr[1],                       //店铺名称
                'shop_city': (shopInfoArr[2] || "上海市"),                       //店铺所在城市
                'shop_industry': shopInfoArr[3] || "未知",                   //店铺所属行业
                'priority': 100,                        //优先级
                'alipay_enable': !!(parseInt(shopInfoArr[9], 10)),    //支付宝是否启用
                'wepay_enable': !!(parseInt(shopInfoArr[10], 10)), //微信是否启用
                "__v": 0.0,
            };
            shopInfoObj.working_start_hour = shopInfoObj.working_start_hour * 60 * 60 * 1000;
            shopInfoObj.working_end_hour = shopInfoObj.working_end_hour * 60 * 60 * 1000;
            // shopObjArr.push(shopInfoObj);
            Models.OneCodePayShopModel.findOneAndUpdate(filterObj, {
                "$set": shopInfoObj,
                "$setOnInsert": objForInsert
            }, {'upsert': true}, function (updateErr, doc) {
                if (updateErr) {
                    console.error(updateErr.message);
                    updateErr = null;
                    return;
                }
                doc = null;
            })

        });

        // Models.OneCodePayShopModel.insertMany(shopObjArr,{'ordered':false},function(error, docs) {
        //     error && console.error(error);
        //     error = null;
        //     docs = null;
        //     process.exit();
        // });
    }

    /** 导入 银盛通 商铺 */
    importYstShopInfo() {
        let content = FS.readFileSync('/tmp/ystshop-20191117.csv', 'utf8');
        let contentArr = content.split('\n');
        let shopObjArr = [], shopInfoObj, objForInsert, curDate = new Date();
        contentArr.forEach(function (infoLine) {
            if (!infoLine) {
                return;
            }
            let shopInfoArr = infoLine.split(',');
            if (!shopInfoArr.length) {
                return;
            }
            let filterObj = {
                'yst_id': shopInfoArr[0],                         //店铺号
            };
            shopInfoObj = {
                'single_trade_min': parseInt(shopInfoArr[6], 10) * 100 || 9800,     //单笔交易最小值
                'single_trade_max': parseInt(shopInfoArr[7], 10) * 100 || 100000,     //单笔交易最大值
                'daily_trade_max': parseInt(shopInfoArr[8], 10) * 100 || 1000000,     //每日最大交易额
                'working_start_hour': parseInt(shopInfoArr[9], 10) || 8,           //每日营业开始时间
                'working_end_hour': parseInt(shopInfoArr[10], 10) || 18,  //营业结束时间
                'alipay_enable': !!(parseInt(shopInfoArr[11], 10)),    //支付宝是否启用
                'wepay_enable': !!(parseInt(shopInfoArr[12], 10)), //微信是否启用
            };
            objForInsert = {
                'ds_user_id': 'd807500',                      //属于下游哪个客户 d807500
                'yst_login_pass': shopInfoArr[1],                  //商户登录密码
                'yst_withdraw_pass': shopInfoArr[2],               //商户支付密码
                'shop_name': shopInfoArr[3],                       //店铺名称
                'shop_city': (shopInfoArr[4] || "上海市"),                       //店铺所在城市
                'shop_industry': shopInfoArr[5] || "未知",                   //店铺所属行业
                'yst_cookie': "",
                'priority': 100,                        //优先级
                'unionpay_enable': !!(parseInt(shopInfoArr[13], 10)),    //云闪付是否启用
                'terminal_serial': shopInfoArr[14] || undefined,
                'yst_qrcode': shopInfoArr[15] || undefined,            //店铺的二维码
                'next_visit_time': curDate,
                "__v": 0.0,
            };
            shopInfoObj.working_start_hour = shopInfoObj.working_start_hour * 60 * 60 * 1000;
            shopInfoObj.working_end_hour = shopInfoObj.working_end_hour * 60 * 60 * 1000;
            // shopObjArr.push(shopInfoObj);
            Models.YstPayShopModel.findOneAndUpdate(filterObj, {
                "$set": shopInfoObj,
                "$setOnInsert": objForInsert
            }, {'upsert': true}, function (updateErr, doc) {
                if (updateErr) {
                    console.error(updateErr.message);
                    updateErr = null;
                    return;
                }
                doc = null;
            })
        });
    }


    subaccounting() {
        let contentStr = '店铺名称,待签收总金额,已签收总金额,当日总金额\n';
        let curDate = new Date();
        let todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        let fileName, queryDate;
        queryDate = new Date(todayStart.getTime() - 86400000);

        fileName = 'ocp_shop_accounting_' + queryDate.getFullYear() + '_' + (queryDate.getMonth() + 1) + '_' + queryDate.getDate() + '.csv';
        let todayPaidOrders = [], userMap = {}, ocpShopMap = {};

        function checkOrders(orderCallback) {
            Models.OrderModel.find({
                'req_time': {'$gte': queryDate},
                'order_status': 'paid',
                "req_channel": "onecodepay"
            }).exec()
              .then(function (orderDocs) {
                  todayPaidOrders = orderDocs;
                  orderCallback(null);
              })
              .catch(function (error) {
                  console.error(error);
                  orderCallback(error);
              });
        }

        function getUsers(userCallback) {
            Models.UserModel.find({}).exec()
              .then(function (userDocs) {
                  userDocs.forEach(function (userDoc) {
                      userMap[userDoc.user_id] = userDoc.nick_name;
                  });
                  userCallback(null);
              })
              .catch(function (error) {
                  console.error(error);
                  userCallback(error);
              });
        }

        function getOcpShops(shopCallback) {
            Models.OneCodePayShopModel.find({}).exec()
              .then(function (shopDocs) {
                  shopDocs.forEach(function (shopDoc) {
                      ocpShopMap[shopDoc.shop_id] = shopDoc.shop_name;
                  });
                  shopCallback(null);
              })
              .catch(function (error) {
                  console.error(error);
                  shopCallback(error);
              });
        }

        ASYNC.parallel([checkOrders, getUsers, getOcpShops], function (error, result) {
            if (error) {

                return;
            }
            result = null;
            let userCount = {}, shopCount = {'global': 0}, nickName, shopName, userShopObj;
            todayPaidOrders.forEach(function (orderDoc) {
                if (!orderDoc) {
                    return;
                }
                let userId = orderDoc.req_from;
                let shopId = orderDoc.assigned_account;
                let amount = orderDoc.final_paid_number;
                userCount[userId] = userCount[userId] || {};
                userCount[userId][shopId] ? userCount[userId][shopId] += amount : userCount[userId][shopId] = amount;
                shopCount[shopId] ? shopCount[shopId] += amount : shopCount[shopId] = amount;
                shopCount.global += amount;
            });

            contentStr = '客户名称,店铺名称,当日总金额\n';
            contentStr += ('全部总计,,' + Number(shopCount.global * 0.01).toFixed(2) + '\n');
            delete shopCount.global;
            for (let id in shopCount) {
                if (shopCount.hasOwnProperty(id)) {
                    shopName = ocpShopMap[id];
                    contentStr += (',' + shopName + ',' + Number(shopCount[id] * 0.01).toFixed(2) + '\n');
                }
            }
            /* 分用户统计*/
            for (let uid in userCount) {
                if (userCount.hasOwnProperty(uid)) {
                    userShopObj = userCount[uid];
                    for (let shopId in userShopObj) {
                        if (userShopObj.hasOwnProperty(shopId)) {
                            shopName = ocpShopMap[shopId];
                            nickName = userMap[uid];
                            contentStr += (nickName + ',' + shopName + ',' + Number(userShopObj[shopId] * 0.01).toFixed(2) + '\n');
                        }
                    }
                }
            }

            FS.writeFile('/tmp/' + fileName, contentStr, function (writeError) {
                if (writeError) {
                    Logger.error(writeError);
                    return;
                }
                process.exit();
            });
        });
    }

    genDemoQrCode() {
        let postToUs = {
            'app_id': '200109087656',
            'app_auth_token': 'c018a04c1de0306686125ab53f32700b',
            'format': 'JSON',
            'charset': 'utf-8',
            'sign_type': 'MD5',
            'method': 'blibao.create.pay.qrcode',
            'version': '1.0',
            'timestamp': null,
            'biz_content': {
                'request_id': null,
                'store_id': null,
                'subject': null,
                'notify_url': null,
                'total_amount': null
            },
        }, curDate = new Date(), dsData = that.dsDataObj;
        postToUs.timestamp = that.getCurrentDateStringForUpStream(curDate);
        postToUs.biz_content.subject = shopName + '消费';
        postToUs.biz_content.notify_url = that.callBackUrl;
        postToUs.biz_content.request_id = that.dsUserId + '-' + that.dsOrderId;
        postToUs.biz_content.store_id = storeId;
        if (!that.dsDataObj.extra['interactive']) {
            postToUs.biz_content.total_amount = (that.dsDataObj.pay_in_number * 0.01).toFixed(2);
        } else {
            postToUs.biz_content.total_amount = "0";
        }
        postToUs.biz_content = JSON.stringify(postToUs.biz_content);
        postToUs.sign = that.signMethod(postToUs);
    }

    getDateString(dateObj) {
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

    accountYstBillingLog() {
        let todayStart = new Date(), that = this;
        todayStart.setHours(0, 0, 0, 0);
        let timeBefore = new Date(todayStart.getTime() - 3 * 86400000);

        Models.YstBillingLogModel.find({"bill_time": {"$gte": timeBefore.getTime()}}, function (findError, logDocs) {
            if (findError) {
                console.log(findError);
                findError = null;
                process.exit(1);
            }
            let tongjiObj = {
                'dateStr': {"id": "amount"}
            };

            let billDateStr, shopId, payNum;
            logDocs.forEach(function (billingLog) {
                billDateStr = that.getDateString(new Date(Number(billingLog.bill_time)));
                shopId = billingLog.yst_id;
                payNum = billingLog.yst_rt_data['uncashAmount'];

                if (!tongjiObj[billDateStr]) {
                    tongjiObj[billDateStr] = {};
                }

                if (!tongjiObj[billDateStr][shopId]) {
                    tongjiObj[billDateStr][shopId] = payNum;
                } else {
                    tongjiObj[billDateStr][shopId] += payNum;
                }
            });
            delete tongjiObj.dateStr;
            console.log(JSON.stringify(tongjiObj, null, 4));
            process.exit(0);

        })
    }
}

let inst = new manualworks();
setTimeout(function () {
    inst.importYstShopInfo();
}, 3000);

module.exports = manualworks;
