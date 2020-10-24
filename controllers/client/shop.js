const { validationResult } = require('express-validator');
const https = require('https');
const querystring = require('querystring');

const Products = require('../../models/products');
const ClientProduct = require('../../models/clientProducts');
const Client = require('../../models/client');
const Order = require('../../models/order');
const Location = require('../../models/location');
const Offer = require('../../models/offer');
const Pay = require('../../models/pay');
const ClientWalet = require('../../models/clientWallet');
const Seller = require('../../models/seller');

const pay = require('../../helpers/pay');
const sendNotfication = require('../../helpers/send-notfication');


exports.getProducts = async (req, res, next) => {
    const catigory = req.params.catigoryId;
    const page = req.query.page || 1;
    const productPerPage = 10;
    const filter = req.query.filter || false;
    const date = req.query.date || "0";
    const sold = req.query.sold || "0";
    let totalProducts;
    let products;
    let find = {};

    try {
        if (!filter) {
            find = { category: catigory }
        } else {
            find = { category: catigory, productType: { $in: filter } }
        }
        if (date == '1' && sold == '0') {
            totalProducts = await Products.find(find).countDocuments();
            products = await Products.find(find)
                .sort({ createdAt: -1 })
                .skip((page - 1) * productPerPage)
                .limit(productPerPage)
                .select('category name_en name_ar productType imageUrl');
        } else if (date == '1' && sold == '1') {
            totalProducts = await Products.find(find).countDocuments();
            products = await Products.find(find)
                .sort({ orders: -1, createdAt: -1 })
                .skip((page - 1) * productPerPage)
                .limit(productPerPage)
                .select('category name_en name_ar productType imageUrl');
        } else if (date == '0' && sold == '1') {
            totalProducts = await Products.find(find).countDocuments();
            products = await Products.find(find)
                .sort({ orders: -1 })
                .skip((page - 1) * productPerPage)
                .limit(productPerPage)
                .select('category name_en name_ar productType imageUrl');
        } else if (date == '0' && sold == '0') {
            totalProducts = await Products.find(find).countDocuments();
            products = await Products.find(find)
                .skip((page - 1) * productPerPage)
                .limit(productPerPage)
                .select('category name_en name_ar productType imageUrl');
        }

        const client = await Client.findById(req.userId).select('cart');




        res.status(200).json({
            state: 1,
            data: products,
            total: totalProducts,
            cart: client.cart.length,
            message: `products in page ${page}, filter ${filter}, date ${date} and sold ${sold}`
        });
    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.getSearch = async (req, res, next) => {

    const page = req.query.page || 1;
    const productPerPage = 10;
    const searchQ = req.query.searchQ;
    const category = req.params.catigoryId;

    try {

        const totalItems = await Products.find({
            category: category,
            $or: [
                { name_en: new RegExp(searchQ.trim(), 'i') },
                { name_ar: new RegExp(searchQ.trim(), 'i') },
            ],
        }).countDocuments();
        const products = await Products.find({
            category: category,
            $or: [
                { name_en: new RegExp(searchQ.trim(), 'i') },
                { name_ar: new RegExp(searchQ.trim(), 'i') },
            ],
        })
            .select('category name_en name_ar productType imageUrl')
            .skip((page - 1) * productPerPage)
            .limit(productPerPage);

        const client = await Client.findById(req.userId).select('cart');

        res.status(200).json({
            state: 1,
            data: products,
            total: totalItems,
            cart: client.cart.length,
            message: `products with ur search (${searchQ})`
        });
    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.postAddToCart = async (req, res, next) => {
    const productId = req.body.productId;
    const unit = req.body.unit;
    const amount = req.body.amount;
    const newProduct = req.body.newProduct || false;
    const errors = validationResult(req);
    let ref = 'product';
    let product;

    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }
        if (unit != 'kg' && unit != 'g' && unit != 'grain' && unit != 'Liter' && unit != 'Gallon' && unit != 'drzn' && unit != 'bag') {
            const error = new Error(`validation faild for unit not a key`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }
        if (newProduct) {
            product = await ClientProduct.findById(productId);
            ref = 'clientProducts';
        } else {
            product = await Products.findById(productId);
        }
        const client = await Client.findById(req.userId).populate('cart');
        if (!product) {
            const error = new Error(`product not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }
        if (ref == 'product') {
            product.orders += 1;
            await product.save();
        }
        const updatedUSer = await client.addToCart(productId, Number(amount), unit, ref);

        res.status(201).json({
            state: 1,
            cart: updatedUSer.cart.length,
            message: 'added to cart'
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}


exports.deleteCart = async (req, res, next) => {
    const cartItemId = req.body.cartItemId;
    const errors = validationResult(req);

    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }
        const client = await Client.findById(req.userId).select('cart')
            .populate({
                path: 'cart.product',
                select: 'category name_en name_ar imageUrl name'
            });
        if (!client) {
            const error = new Error(`client not found`);
            error.statusCode = 404;
            error.state = 3;
            throw error;
        }
        const updatedClient = await client.removeFromCart(cartItemId);

        res.status(200).json({
            state: 1,
            data: updatedClient.cart,
            message: 'deleted form the cart'
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.getCart = async (req, res, next) => {


    try {
        const cart = await Client.findById(req.userId)
            .select('cart')
            .populate({
                path: 'cart.product',
                select: 'category name_en name_ar imageUrl name'
            });
        if (!cart) {
            const error = new Error(`client not found`);
            error.statusCode = 404;
            error.state = 3;
            throw error;
        }

        const location = await Location.find({ client: req.userId }).select('Location name mobile stringAdress ');


        res.status(200).json({
            state: 1,
            data: cart.cart,
            location: location,
            message: `client's cart with location`
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.postAddToCartFood = async (req, res, next) => {
    const name = req.body.name;
    const name_en = req.body.name_en;
    const unit = req.body.unit;
    const amount = req.body.amount;
    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }
        if (unit != 'kg' && unit != 'g' && unit != 'grain' && unit != 'Liter' && unit != 'Gallon' && unit != 'drzn' && unit != 'bag') {
            const error = new Error(`validation faild for unit not a key`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }
        const client = await Client.findById(req.userId).select('cart');

        if (!client) {
            const error = new Error(`client not found`);
            error.statusCode = 404;
            error.state = 3;
            throw error;
        }

        const newProduct = new ClientProduct({
            category: 'F',
            name: name,
            name_en:name_en,
            client: client._id
        });

        const product = await newProduct.save();

        const updatedUSer = await client.addToCart(product._id, Number(amount), unit, 'clientProducts');

        res.status(201).json({
            state: 1,
            cart: updatedUSer.cart.length,
            message: 'client product added to cart'
        })


    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}


exports.postAddFev = async (req, res, next) => {
    const productId = req.body.productId;
    const listId = req.body.listId;

    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const client = await Client.findById(req.userId);
        const product = await Products.findById(productId);
        if (!client) {
            const error = new Error(`client not found`);
            error.statusCode = 404;
            error.state = 3;
            throw error;
        }
        if (!product) {
            const error = new Error(`product not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }

        await client.addToFev(productId, listId);


        res.status(201).json({
            state: 1,
            message: 'added to fevourite'
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.postAddFevList = async (req, res, next) => {
    const ListName = req.body.ListName;
    const send = [];
    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const client = await Client.findById(req.userId);
        if (!client) {
            const error = new Error(`client not found`);
            error.statusCode = 404;
            error.state = 3;
            throw error;
        }
        const updatedUser = await client.addFevList(ListName);
        updatedUser.fevProducts.forEach(i => {
            send.push({
                _id: i._id,
                name: i.list.name
            });
        })
        res.status(201).json({
            state: 1,
            data: send,
            message: 'list Created'
        })

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}


exports.deleteFev = async (req, res, next) => {
    const productId = req.body.productId;
    const listId = req.body.listId;

    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const client = await Client.findById(req.userId).select('fevProducts').populate('fevProducts.list.product');
        const updatedClient = await client.deleteFev(productId, listId);
        const ListProducts = updatedClient.fevProducts.filter(f => {
            return f._id.toString() === listId.toString();
        });

        const products = await Products.find({ _id: { $in: ListProducts[0].list.product } })
            .select('category name_en name_ar productType imageUrl');

        res.status(200).json({
            state: 1,
            data: products,
            message: "deleted"
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.postDeleteFevList = async (req, res, next) => {

    const listId = req.body.listId;

    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }
        const client = await Client.findById(req.userId).select('fevProducts');

        const updatedClient = await client.deleteFevList(listId);

        res.status(200).json({
            state: 1,
            data: updatedClient.fevProducts,
            message: 'list deleted'
        });


    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

//orders
exports.postAddOrder = async (req, res, next) => {
    const locationId = req.body.locationId;
    const arriveDate = req.body.arriveIn || 0;
    let category = [];
    let cart = [];
    let amount_count = 0;

    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }
        const client = await Client.findById(req.userId).select('cart sendNotfication FCMJwt').populate('cart.product');
        if (!client) {
            const error = new Error(`client not found`);
            error.statusCode = 404;
            error.state = 3;
            throw error;
        }
        if (client.cart.length == 0) {
            const error = new Error(`validation faild cart in empty`);
            error.statusCode = 422;
            error.state = 10;
            throw error;
        }

        client.cart.forEach(i => {
            category.push(i.product.category);
            cart.push({
                product: i.product._id,
                amount: i.amount,
                unit: i.unit,
                path: i.path
            });
            amount_count += i.amount;
        });

        var uniqueCategory = category.filter((value, index, self) => {
            return self.indexOf(value) === index;
        });
        const location = await Location.findById(locationId);
        if (!location) {
            const error = new Error(`location not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }
        const newOrder = new Order({
            client: client._id,
            amount_count: amount_count,
            category: uniqueCategory,
            products: cart,
            location: {
                type: "Point",
                coordinates: [location.Location.coordinates[0], location.Location.coordinates[1]]
            },
            arriveDate: arriveDate,
            locationDetails: {
                name: location.name,
                stringAdress: location.stringAdress,
                mobile2: location.mobile
            }
        });
        const ord = await newOrder.save();

        //clear client cart
        client.cart = [];
        await client.save();

        if (client.sendNotfication.all == true) {
            const notification = {
                title_ar: 'تم أضافة طلبك',
                body_ar: "سوف تصلك العروض على طلبك في اسرع وقت ممكن",
                title_en: 'Your order has been added',
                body_en: 'You will receive offers on your order as soon as possible'
            };
            const data = {
                id: ord._id.toString(),
                key: '3',
            };

            await sendNotfication.send(data, notification, [client], 'client');
        }

        res.status(201).json({
            state: 1,
            message: "order created"
        });


    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.getSingleOrder = async (req, res, next) => {

    const orderId = req.params.id;

    try {
        const order = await Order.findById(orderId)
            .select('location locationDetails products arriveDate client')
            .populate({ path: 'products.product', select: 'name_en name_ar imageUrl' });

        if (order.client.toString() !== req.userId) {
            const error = new Error(`not the order owner`);
            error.statusCode = 403;
            error.state = 18;
            throw error;
        }

        res.status(200).json({
            state: 1,
            data: order,
            message: `order with id = ${orderId}`
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

//offers
exports.getOffers = async (req, res, next) => {

    const page = req.query.page || 0;
    const filter = req.query.filter || 0;         //0=> default //1=>date //2=>price //3=>seller rating
    const maxDis = Number(req.query.maxDis) || 10; //default = 5 only used in sort with location
    const select = req.query.select || [0];         //0=>default //1=> rate > 4 //2=>all amount //3=>in 12 hours //4=>lacation in 5 km
    const offerPerPage = 10;
    let offer;
    let totalOffer;
    let find = {client: req.userId, status: 'started'};
    try {

        const location = await Location.findOne({ client: req.userId }).select('Location');
        
        select.forEach(i=>{
            if (i == 0) {
                find = { client: req.userId, status: 'started' }
            }
            else if (i == 1) {
                find = { ...find, sellerRate: { $gt: 3.9 } }
            } else if (i == 2) {
                find = { ...find, 'offerProducts.equals':  {$ne:false} }
            } else if (i == 3) {
                find = { ...find, createdAt: { $gt: Date.now() - 43200000 } }
            } else if (i == 4) {
                
                if (!location) {
                    const error = new Error(`you should provide location.. not found`);
                    error.statusCode = 404;
                    error.state = 53;
                    throw error;
                }

                find = {
                    ...find,
                    location: {
                        $near: {
                            $maxDistance: 1000 * maxDis,
                            $geometry: {
                                type: "Point",
                                coordinates: location.Location.coordinates
                            }
                        },
    
                    }
                }
        console.log("find before the quiry = " + find.location);

            }
        });



        if (filter == 1) {
            offer = await Offer.find(find)
                .select('seller banana_delivery price createdAt offerProducts')
                .populate({ path: 'seller', select: 'rate certificate.avilable' })
                .populate({
                    path: 'offerProducts.product', select: 'name_en name_ar name',
                })
                .sort({ createdAt: -1 })
                .skip((page - 1) * offerPerPage)
                .limit(offerPerPage);

                if( select.indexOf('4') != -1 ){
                    totalOffer = await Offer.find(find).count();
                }else{
                    totalOffer = await Offer.find(find).countDocuments();
                }
        } else if (filter == 2) {
            offer = await Offer.find(find)
                .select('seller banana_delivery price createdAt offerProducts')
                .populate({ path: 'seller', select: 'rate certificate.avilable' })
                .populate({
                    path: 'offerProducts.product', select: 'name_en name_ar name',
                })
                .sort({ price: 0 })
                .skip((page - 1) * offerPerPage)
                .limit(offerPerPage);
                if( select.indexOf('4') != -1 ){
                    totalOffer = await Offer.find(find).count();
                }else{
                    totalOffer = await Offer.find(find).countDocuments();
                }

        } else if (filter == 0) {
            offer = await Offer.find(find)
                .select('seller banana_delivery price createdAt offerProducts')
                .populate({ path: 'seller', select: 'rate certificate.avilable' })
                .populate({
                    path: 'offerProducts.product', select: 'name_en name_ar name',
                })
                .skip((page - 1) * offerPerPage)
                .limit(offerPerPage);

                if( select.indexOf('4') != -1 ){
                    totalOffer = await Offer.find(find).count();
                }else{
                    totalOffer = await Offer.find(find).countDocuments();
                }
        }                                                                                   //sort with rating
        else if (filter == 3) {
            offer = await Offer.find(find)
                .select('seller banana_delivery price createdAt offerProducts')
                .populate({ path: 'seller', select: 'rate certificate.avilable' })
                .populate({
                    path: 'offerProducts.product', select: 'name_en name_ar name',
                })
                .sort({ sellerRate: -1 })
                .skip((page - 1) * offerPerPage)
                .limit(offerPerPage);

                if( select.indexOf('4') != -1 ){
                    totalOffer = await Offer.find(find).count();
                }else{
                    totalOffer = await Offer.find(find).countDocuments();
                }
        }



        res.status(200).json({
            state: 1,
            data: offer,
            total: totalOffer,
            message: `offers in page ${page} and filter = ${filter}`
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.postCancelOffer = async (req, res, next) => {

    const offerId = req.body.offerId;

    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }
        const offer = await Offer.findById(offerId).select('client status');
        if (!offer) {
            const error = new Error(`offer not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }
        if (offer.client.toString() !== req.userId) {
            const error = new Error(`not the order owner`);
            error.statusCode = 403;
            error.state = 18;
            throw error;
        }

        await offer.cancel();

        res.status(200).json({
            state: 1,
            message: 'offer canceled'
        });


    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

//offer pay 

exports.postCreateCheckOut = async (req, res, next) => {

    const offerId = req.body.offerId;

    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }
        const offer = await Offer.findById(offerId)
            .select('order status price')
            .populate({ path: 'order', select: 'status pay client' });
        if (!offer) {
            const error = new Error(`offer not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }

        if (offer.status !== 'started') {
            const error = new Error(`offer is canceled or the offer is ended`);
            error.statusCode = 409;
            error.state = 19;
            throw error;
        }
        if (offer.order.status !== 'started') {
            const error = new Error(`order is canceled or the order is ended`);
            error.statusCode = 409;
            error.state = 19;
            throw error;
        }
        if (offer.order.pay !== false) {
            const error = new Error(`you already payed for the order`);
            error.statusCode = 409;
            error.state = 19;
            throw error;
        }

        if (offer.order.client._id != req.userId) {
            const error = new Error(`not the order owner`);
            error.statusCode = 403;
            error.state = 11;
            throw error;
        }

        const { body, status } = await pay.createCheckOut(offer.price);


        res.status(200).json({
            state: 1,
            status: status,
            data: body,
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.postCheckPayment = async (req, res, next) => {

    const checkoutId = req.body.checkoutId;
    const offerId = req.body.offerId;

    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const { body, status } = await pay.getStatus(checkoutId);

        const reg1 = new RegExp("^(000\.000\.|000\.100\.1|000\.[36])", "m");
        const reg2 = new RegExp("^(000\.400\.0[^3]|000\.400\.100)", 'm');
        console.log(reg1.test(body.result.code.toString()));
        console.log(reg2.test(body.result.code.toString()));
        console.log(body.result.code.toString());


        if (!reg1.test(body.result.code.toString()) && !reg2.test(body.result.code.toString())) {
            const error = new Error(`payment error`);
            error.statusCode = 402;
            error.state = 20;
            throw error;
        }

        const offer = await Offer.findById(offerId)
            .populate({ path: 'seller', select: 'FCMJwt sendNotfication' });
        if (!offer) {
            const error = new Error(`offer not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }
        offer.selected = true;
        const order = await Order.findById(offer.order);
        if (!order) {
            const error = new Error(`order not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }

        await Offer.updateMany({ order: order._id }, { status: 'ended' });
        order.pay = true;
        const p = new Pay({
            offer: offer._id,
            order: order._id,
            client: req.userId,
            seller: offer.seller,
            payId: body.id,
        });


        //saving
        await order.endOrder();
        await offer.save();
        await p.save();


        if (offer.seller.sendNotfication.all == true && offer.seller.sendNotfication.orderStatus == true) {
            const notification = {
                title_ar: 'تم الموافقة',
                body_ar: "وافق العميل على طلبك",
                title_en: 'Been approved',
                body_en: 'The customer accepted your offer'
            };
            const data = {
                id: offer._id.toString(),
                key: '1',
            };

            await sendNotfication.send(data, notification, [offer.seller], 'seller');
        }


        res.status(200).json({
            state: 1,
            message: 'message payment created',
            paymentStatusCode: body.result.code.toString()
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.cashPayment = async (req, res, next) => {

    const offerId = req.body.offerId;

    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }


        const offer = await Offer.findById(offerId)
            .populate({ path: 'seller', select: 'FCMJwt sendNotfication' })
            .select('order status price seller')
            .populate({ path: 'order', select: 'status pay client' });

        if (!offer) {
            const error = new Error(`offer not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }
        if (offer.status !== 'started') {
            const error = new Error(`offer is canceled or the offer is ended`);
            error.statusCode = 409;
            error.state = 19;
            throw error;
        }
        if (offer.order.status !== 'started') {
            const error = new Error(`order is canceled or the order is ended`);
            error.statusCode = 409;
            error.state = 19;
            throw error;
        }
        if (offer.order.pay !== false) {
            const error = new Error(`you already payed for the order`);
            error.statusCode = 409;
            error.state = 19;
            throw error;
        }

        if (offer.order.client._id != req.userId) {
            const error = new Error(`not the order owner`);
            error.statusCode = 403;
            error.state = 11;
            throw error;
        }
        offer.selected = true;
        const order = await Order.findById(offer.order);
        if (!order) {
            const error = new Error(`order not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }

        await Offer.updateMany({ order: order._id }, { status: 'ended' });
        order.pay = true;
        const p = new Pay({
            offer: offer._id,
            order: order._id,
            client: req.userId,
            seller: offer.seller._id,
            payId: 'cash',
            method: 'cash'
        });


        //saving
        await order.endOrder();
        await offer.save();
        await p.save();



        if (offer.seller.sendNotfication.all == true && offer.seller.sendNotfication.orderStatus == true) {
            const notification = {
                title_ar: 'تم الموافقة',
                body_ar: "وافق العميل على طلبك",
                title_en: 'Been approved',
                body_en: 'The customer accepted your offer'
            };
            const data = {
                id: offer._id.toString(),
                key: '1',
            };

            await sendNotfication.send(data, notification, [offer.seller], 'seller');
        }

        res.status(200).json({
            state: 1,
            message: 'cash Payment created'
        });

    } catch (err) {
        console.log(err);
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

//wallet 
exports.postPayToWalletCreateCheckOut = async (req, res, next) => {

    const amount = req.body.amount;
    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const { body, status } = await pay.createCheckOut(Number(amount));

        res.status(200).json({
            state: 1,
            status: status,
            data: body,
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.postPayToWalletCheckPayment = async (req, res, next) => {

    const checkoutId = req.body.checkoutId;


    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const { body, status } = await pay.getStatus(checkoutId);

        const reg1 = new RegExp("^(000\.000\.|000\.100\.1|000\.[36])", "m");
        const reg2 = new RegExp("^(000\.400\.0[^3]|000\.400\.100)", 'm');



        if (!reg1.test(body.result.code.toString()) && !reg2.test(body.result.code.toString())) {
            const error = new Error(`payment error`);
            error.statusCode = 402;
            error.state = 20;
            throw error;
        }

        const client = await Client.findById(req.userId).select('wallet');

        client.wallet += Number(body.amount);

        const walletTransaction = new ClientWalet({
            client: req.userId,
            action: 'deposit',
            amount: Number(body.amount),
            method: 'visa',
            time: new Date().getTime().toString()
        });

        await walletTransaction.save();
        const updatedClient = await client.save();

        res.status(201).json({
            state: 1,
            data: updatedClient.wallet,
            message: 'added to wallet'
        });


    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}


//pay from wallet

exports.walletPayment = async (req, res, next) => {

    const offerId = req.body.offerId;

    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }


        const offer = await Offer.findById(offerId)
            .populate({ path: 'seller', select: 'FCMJwt sendNotfication' })
            .select('order status price seller')
            .populate({ path: 'order', select: 'status pay client' });

        if (!offer) {
            const error = new Error(`offer not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }
        if (offer.status !== 'started') {
            const error = new Error(`offer is canceled or the offer is ended`);
            error.statusCode = 409;
            error.state = 19;
            throw error;
        }
        if (offer.order.status !== 'started') {
            const error = new Error(`order is canceled or the order is ended`);
            error.statusCode = 409;
            error.state = 19;
            throw error;
        }
        if (offer.order.pay !== false) {
            const error = new Error(`you already payed for the order`);
            error.statusCode = 409;
            error.state = 19;
            throw error;
        }

        if (offer.order.client._id != req.userId) {
            const error = new Error(`not the order owner`);
            error.statusCode = 403;
            error.state = 11;
            throw error;
        }
        offer.selected = true;
        const order = await Order.findById(offer.order);
        if (!order) {
            const error = new Error(`order not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }

        const client = await Client.findById(req.userId).select('wallet');

        if (client.wallet < offer.price) {
            const error = new Error(`no enough mony in client wallet`);
            error.statusCode = 400;
            error.state = 39;
            throw error;
        }
        client.wallet = client.wallet - offer.price;

        await Offer.updateMany({ order: order._id }, { status: 'ended' });
        order.pay = true;
        const p = new Pay({
            offer: offer._id,
            order: order._id,
            client: req.userId,
            seller: offer.seller._id,
            payId: 'wallet',
            method: 'wallet'
        });


        const walletTransaction = new ClientWalet({
            client: req.userId,
            action: 'pay',
            amount: offer.price,
            method: 'visa',
            time: new Date().getTime().toString()
        });

        await walletTransaction.save();

        //saving
        await order.endOrder();
        await offer.save();
        await p.save();
        await client.save();

        if (offer.seller.sendNotfication.all == true && offer.seller.sendNotfication.orderStatus == true) {
            const notification = {
                title_ar: 'تم الموافقة',
                body_ar: "وافق العميل على طلبك",
                title_en: 'Been approved',
                body_en: 'The customer accepted your offer'
            };
            const data = {
                id: offer._id.toString(),
                key: '1',
            };

            await sendNotfication.send(data, notification, [offer.seller], 'seller');
        }

        res.status(200).json({
            state: 1,
            message: 'wallet Payment created'
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}


//cancel coming order

exports.postCancelComingOrder = async (req, res, next) => {

    const orderId = req.body.orderId;

    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const order = await Order.findById(orderId);

        if (!order) {
            const error = new Error(`order not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }

        if (order.status !== 'ended') {
            const error = new Error(`order not ended (no offer sellected or allready canceld )`);
            error.statusCode = 409;
            error.state = 40;
            throw error;
        }
        if (order.pay === false) {
            const error = new Error(`payment required you didn't pay for the order`);
            error.statusCode = 400;
            error.state = 41;
            throw error;
        }

        if (order.client._id != req.userId) {
            const error = new Error(`not the order owner`);
            error.statusCode = 403;
            error.state = 11;
            throw error;
        }


        const offer = await Offer.findOne({ order: order._id, client: req.userId, selected: true });
        if (!offer) {
            const error = new Error(`offer not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }

        if (offer.status !== 'ended') {
            const error = new Error(`offer not ended `);
            error.statusCode = 409;
            error.state = 40;
            throw error;
        }

        const pay = await Pay.findOne({ offer: offer._id, order: order._id, client: req.userId });

        if (!pay) {
            const error = new Error(`payment required you didn't pay for the order..no payment information`);
            error.statusCode = 400;
            error.state = 41;
            throw error;
        }

        if (pay.deliver == true) {
            const error = new Error(`can't cancel order after deliver!!!`);
            error.statusCode = 409;
            error.state = 42;
            throw error;
        }

        if (pay.method != 'cash') {
            const client = await Client.findById(req.userId).select('wallet');

            if (new Date(pay.createdAt).getTime() + 600000 < Date.now()) {

                const minus = (offer.price * 5) / 100;

                client.wallet += (offer.price - minus);
                pay.refund = true;
                pay.refund_amount = (offer.price - minus);


                const walletTransaction = new ClientWalet({
                    client: client._id,
                    action: 'refund',
                    amount: (offer.price - minus),
                    method: 'visa',
                    time: new Date().getTime().toString()
                });
                await walletTransaction.save();

                await client.save();
            } else {

                client.wallet += offer.price;
                pay.refund = true;
                pay.refund_amount = offer.price;

                const walletTransaction = new ClientWalet({
                    client: client._id,
                    action: 'refund',
                    amount: offer.price,
                    method: 'visa',
                    time: new Date().getTime().toString()
                });
                await walletTransaction.save();

                await client.save();
            }
        }

        pay.cancel = true;



        await pay.save();
        await Offer.updateMany({ order: order._id }, { status: 'ended' });
        await order.cancelOrder();


        res.status(200).json({
            state: 1,
            message: 'order cancled and refund sent'
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

//rate 

exports.postRate = async (req, res, next) => {

    const orderId = req.body.orderId;
    const rate = Number(req.body.rate);

    const errors = validationResult(req);
    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const order = await Order.findById(orderId);

        if (!order) {
            const error = new Error(`order not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }

        if (order.status !== 'ended') {
            const error = new Error(`order not ended (no offer sellected or allready canceld )`);
            error.statusCode = 409;
            error.state = 40;
            throw error;
        }
        if (order.pay === false) {
            const error = new Error(`payment required you didn't pay for the order`);
            error.statusCode = 400;
            error.state = 41;
            throw error;
        }

        if (order.client._id != req.userId) {
            const error = new Error(`not the order owner`);
            error.statusCode = 403;
            error.state = 11;
            throw error;
        }


        const offer = await Offer.findOne({ order: order._id, client: req.userId, selected: true });
        if (!offer) {
            const error = new Error(`offer not found`);
            error.statusCode = 404;
            error.state = 9;
            throw error;
        }

        if (offer.status !== 'ended') {
            const error = new Error(`offer not ended `);
            error.statusCode = 409;
            error.state = 40;
            throw error;
        }

        const pay = await Pay.findOne({ offer: offer._id, order: order._id, client: req.userId, });

        if (!pay) {
            const error = new Error(`payment required you didn't pay for the order..no payment information`);
            error.statusCode = 400;
            error.state = 41;
            throw error;
        }

        if (pay.deliver == false) {
            const error = new Error(`order didn't delever`);
            error.statusCode = 409;
            error.state = 47;
            throw error;
        }

        order.reted = true;

        const seller = await Seller.findById(offer.seller._id).select('totalRate userRatre rate');

        seller.totalRate += rate;
        seller.userRatre += 1;
        seller.rate = seller.totalRate / seller.userRatre;


        await order.save();
        await seller.save();

        res.status(201).json({
            state: 1,
            message: 'rete added'
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}