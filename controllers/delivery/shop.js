
const Pay = require('../../models/pay');
const Offer = require('../../models/offer');
const Order = require('../../models/order');
const Seller = require('../../models/seller');
const ScadPay = require('../../models/seller-sccad-pay');
const SellerWallet = require('../../models/sellerWallet');
const { validationResult } = require('express-validator');

const schedule = require('node-schedule');

const sendNotfication = require('../../helpers/send-notfication');

exports.getHome = async (req, res, next) => {

    const page = req.query.page || 1;
    const filter = Number(req.query.filter) || 1;
    const productPerPage = 10;
    let data;
    let total;
    let orderIdS = [];


    try {

        if (filter == 1) {

            const pay = await Pay.find({ deliver: false, cancel: false, refund: false });

            pay.forEach(i => {
                orderIdS.push(i.order._id);
            });


            total = await Offer.find({ selected: true, order: { $in: orderIdS }, banana_delivery: true }).countDocuments();

            data = await Offer.find({ selected: true, order: { $in: orderIdS }, banana_delivery: true })
                .select('offerProducts order seller banana_delivery price createdAt')
                .populate({
                    path: 'order', select: 'locationDetails.stringAdress arriveDate'
                })
                .populate({
                    path: 'offerProducts.product', select: 'name_en name_ar name'
                })
                .skip((page - 1) * productPerPage)
                .limit(productPerPage);

        } else if (filter == 2) {

            const pay = await Pay.find({ deliver: true, cancel: false, refund: false });

            pay.forEach(i => {
                orderIdS.push(i.order._id);
            });


            total = await Offer.find({ selected: true, order: { $in: orderIdS }, banana_delivery: true }).countDocuments();

            data = await Offer.find({ selected: true, order: { $in: orderIdS }, banana_delivery: true })
                .select('offerProducts order seller banana_delivery price createdAt')
                .populate({
                    path: 'order', select: 'locationDetails.stringAdress arriveDate'
                })
                .populate({
                    path: 'offerProducts.product', select: 'name_en name_ar name'
                })
                .skip((page - 1) * productPerPage)
                .limit(productPerPage);

        }

        res.status(200).json({
            state: 1,
            data: data,
            total: total,
            message: `data in filter ${filter} and page ${page}`
        });


    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.getClientInfo = async (req, res, next) => {

    const offerId = req.params.offer;

    try {
        let offer = await Offer.findOne({ _id: offerId })
            .select('order client')
            .populate({
                path: 'order',
                select: 'locationDetails location arriveDate'
            })
            .populate({
                path: 'client',
                select: 'name mobile image code'
            });
        if (!offer) {
            const error = new Error(`offer not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }
        if (offer.selected == false) {
            const error = new Error(`client didn't select the seller's offer`);
            error.statusCode = 403;
            error.state = 21;
            throw error;
        }

        const pay = await Pay.findOne({ offer: offer._id })
            .select('method');

        res.status(200).json({
            state: 1,
            data: {
                mobile: offer.order.locationDetails.mobile2,
                adress: offer.order.locationDetails.stringAdress,
                name: offer.client.name,
                location: offer.order.location,
                date: offer.order.arriveDate,
                payMathod: pay.method,
                accountMobile: offer.client.code,
                image: offer.client.image
            },
            message: 'client details for delever order'
        });


    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.getSellerInfo = async (req, res, next) => {

    const offerId = req.params.offer;

    try {

        let offer = await Offer.findOne({ _id: offerId })
            .select('seller -_id')
            .populate({
                path: 'seller',
                select: 'name mobile code image certificate.location certificate.avilable certificate.StringAdress rate'
            });

        if (!offer) {
            const error = new Error(`offer not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }

        if (offer.selected == false) {
            const error = new Error(`client didn't select the seller's offer`);
            error.statusCode = 403;
            error.state = 21;
            throw error;
        }

        res.status(200).json({
            state: 1,
            data: offer,
            message: 'seller details for delever order'
        });


    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}


exports.postOrderArrived = async (req, res, next) => {
    const orderId = req.body.orderId;


    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const order = await Order.findById(orderId)
            .populate({ path: 'client', select: 'sendNotfication FCMJwt' });
        if (!order) {
            const error = new Error(`order not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }
        if (order.status != 'ended') {
            const error = new Error(`order canceld or client haven't sellect yet `);
            error.statusCode = 403;
            error.state = 43;
            throw error;
        }
        const offer = await Offer.findOne({ order: order._id, selected: true });

        if (!offer || offer.banana_delivery != true) {
            const error = new Error(`no offer founded of delevery not banana`);
            error.statusCode = 403;
            error.state = 44;
            throw error;
        }

        const pay = await Pay.findOne({ offer: offer._id, order: order._id })

        if (!pay) {
            const error = new Error(`payment required client didn't pay`);
            error.statusCode = 400;
            error.state = 41;
            throw error;
        }
        if (pay.deliver == true) {
            const error = new Error(`order allready deleverd`);
            error.statusCode = 409;
            error.state = 45;
            throw error;
        }
        if (pay.cancel == true) {
            const error = new Error(`order canceld by the user`);
            error.statusCode = 409;
            error.state = 46;
            throw error;
        }

        pay.deliver = true;
        pay.arriveIn = Date.now();

        if (pay.method != 'cash') {
            const seller = await Seller.findById(offer.seller._id).select('bindingWallet');
            const minus = (offer.price * 5) / 100;
            let arrivePrice = 0;

            if (offer.banana_delivery) {
                seller.bindingWallet += (offer.price - (offer.banana_delivery_price + minus));
                arrivePrice = (offer.price - (offer.banana_delivery_price + minus));
            } else {
                seller.bindingWallet += (offer.price - minus);
                arrivePrice = (offer.price - minus);

            }

            await seller.save();


            const newScad = new ScadPay({
                seller: offer.seller._id,
                fireIn: new Date().getTime() + 259200000,
                order: order._id,
                price: arrivePrice
            });

            const s = await newScad.save();

            const trans = new SellerWallet({
                seller: offer.seller._id,
                action: 'deposit',
                amount: arrivePrice,
                method: 'visa',
                time: new Date().getTime().toString(),
                client: order.client._id
            });

            await trans.save();

            schedule.scheduleJob(s._id.toString(), new Date().getTime() + 259200000, async function () {
                const seller = await Seller.findById(offer.seller._id).select('wallet bindingWallet');
                if (seller.bindingWallet >= s.price) {
                    seller.bindingWallet = seller.bindingWallet - s.price;
                    seller.wallet += s.price;
                    await seller.save();
                    const sss = await ScadPay.findById(s._id)
                    sss.delever = true;
                    await sss.save();
                }

            });

        }

        //saving

        await pay.save();

        if (order.client.sendNotfication.all == true) {
            const notification = {
                title_ar: 'قم بتقييم الطلب',
                body_ar: "قم بتقييم طلبك السابق",
                title_en: 'Rate your order',
                body_en: 'Rate your previous order'
            };
            const data = {
                id: order._id.toString(),
                key: '4',
            };

            await sendNotfication.send(data, notification, [order.client], 'client');
        }

        res.status(201).json({
            state: 1,
            message: 'order arrived mony will be in wallet after 3 days'
        });

    } catch (err) {

        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }

}