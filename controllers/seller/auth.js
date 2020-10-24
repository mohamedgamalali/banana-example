const bycript = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {check,validationResult} = require('express-validator');
const SMS = require('../../helpers/sms');
const crypto = require('crypto');

const Seller = require('../../models/seller');

exports.postSignup = async (req, res, next) => {
    const errors = validationResult(req);
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    const mobile = req.body.mobile;
    const category = req.body.category;
    const code = req.body.code;
    const FCM = req.body.FCM;
    const lang = req.body.lang;

    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} '${errors.array()[0].msg}'`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }
    
        category.forEach(e => {
            if( e!='F-V'&& e!='B'&& e!='F-M'&& e!='F' ){
                const error = new Error(`validation faild for category in body.. not allowed value`);
                error.statusCode = 422;
                error.state = 5;
                throw error;
            }
        });

        if(lang!='ar'&&lang!='en'){
            const error = new Error(`validation faild for lang.. must be 'ar' or 'en`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const checkSeller = await Seller.findOne({ mobile: mobile });

        if (checkSeller) {
            const error = new Error(`This user is already registered with mobile`);
            error.statusCode = 409;
            error.state = 6;
            throw error;
        } 
        const checkSellerEmail = await Seller.findOne({ email: email });

        if (checkSellerEmail) {
            const error = new Error(`This user is already registered with email`);
            error.statusCode = 409;
            error.state = 26;
            throw error;
        }
        const hashedPass = await bycript.hash(password, 12);
        
        const newSeller = new Seller({
            name: name,
            mobile: mobile,
            email:email,
            password: hashedPass,
            category:category,
            code:code,
            updated:Date.now().toString(),
            FCMJwt: [{
                token:FCM,
                lang:lang
            }],
            sendNotfication: {
                all:true,
                nearOrders:true,
                issues:true,
                orderStatus:true,
                update:true
            }
        });

        const seller = await newSeller.save();

        const token = jwt.sign(
            {
                mobile: seller.mobile,
                userId: seller._id.toString(),
                updated:seller.updated.toString()
            },
            process.env.JWT_PRIVATE_KEY_SELLER
        );

        res.status(201).json({ 
            state: 1, 
            message: 'seller created and logedIn', 
            data:{
                token: token,
                sellerName: seller.name,
                sellerMobile: seller.mobile,
                sellerId: seller._id,
                sellerImage:seller.image,
                sellerCatigory:seller.category,
                lang:seller.lang
            }
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}


exports.postLogin = async (req, res, next) => {
    const errors = validationResult(req);
    const emailOrPhone = req.body.mobile;
    const password = req.body.password;
    const FCM = req.body.FCM;
    const lang = req.body.lang;

    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} '${errors.array()[0].msg}'`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }
        if(lang!='ar'&&lang!='en'){
            const error = new Error(`validation faild for lang.. must be 'ar' or 'en`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }
        const isEmail          = emailOrPhone.search('@');

        let seller;
        if(isEmail>=0){
            await check('mobile').isEmail().normalizeEmail().run(req);   
            seller = await Seller.findOne({email:req.body.mobile}) 
        }else{
            seller = await Seller.findOne({mobile:emailOrPhone})
        }

        if (!seller) {
            const error = new Error(`seller not found`);
            error.statusCode = 404;
            error.state = 7;
            throw error;
        }
        const isEqual = await bycript.compare(password, seller.password);
        if (!isEqual) {
            const error = new Error('wrong password');
            error.statusCode = 401;
            error.state = 8;
            throw error;
        }
        if (seller.blocked == true) {
            const error = new Error('seller have been blocked');
            error.statusCode = 403;
            error.state = 4;
            throw error;
        }

        let index = -1 ;
        seller.FCMJwt.forEach((element,ind) => {
            if(element.token==FCM){
                index = ind
            }
        });

        if (index == -1) {
            seller.FCMJwt.push({
                token:FCM,
                lang:lang
            });
            await seller.save();
        }else{
            seller.FCMJwt[index] = {
                token:FCM,
                lang:lang
            }
            await seller.save();
        }

        const token = jwt.sign(
            {
                mobile: seller.mobile,
                userId: seller._id.toString(),
                updated:seller.updated.toString()
            },
            process.env.JWT_PRIVATE_KEY_SELLER
        );

        res.status(200).json({
            state: 1,
            message:"logedin",
            data:{
                token: token,
                sellerName: seller.name,
                sellerMobile: seller.mobile,
                sellerId: seller._id,
                sellerImage:seller.image,
                sellerCatigory:seller.category,
                lang:seller.lang
            }
        });
        
    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}



//forget password
exports.postForgetPassword = async (req, res, next) => {
    const mobile = req.body.mobile;
    const errors = validationResult(req);

    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const seller = await Seller.findOne({ mobile: mobile }).select('code mobile verficationCode codeExpireDate');

        if (!seller) {
            const error = new Error(`seller not found`);
            error.statusCode = 404;
            error.state = 7;
            throw error;
        }

        const buf = crypto.randomBytes(2).toString('hex');
        const hashedCode = await bycript.hash(buf, 12)
        seller.verficationCode = hashedCode;
        seller.codeExpireDate = Date.now() + 900000;

        const message = `your verification code is ${buf}`;

        //const {body,status} = await SMS.send(seller.code, message);
        await seller.save();


        res.status(200).json({
            state: 1,
            code: buf,
            message: 'code sent'
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}


exports.postForgetPasswordVerfy = async (req, res, next) => {
    const mobile = req.body.mobile;
    const code = req.body.VerCode;
    const errors = validationResult(req);

    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const seller = await Seller.findOne({ mobile: mobile }).select('mobile verficationCode codeExpireDate');

        if (!seller) {
            const error = new Error(`seller not found`);
            error.statusCode = 404;
            error.state = 7;
            throw error;
        }


        const isEqual = await bycript.compare(code, seller.verficationCode);

        if (!isEqual) {
            const error = new Error('wrong code!!');
            error.statusCode = 403;
            error.state = 36;
            throw error;
        }
        if (seller.codeExpireDate <= Date.now()) {
            const error = new Error('verfication code expired');
            error.statusCode = 403;
            error.state = 37;
            throw error;
        }


        res.status(200).json({
            state: 1,
            message: 'code is ok <3'
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}


exports.postForgetPasswordChangePassword = async (req, res, next) => {
    const mobile   = req.body.mobile;
    const code     = req.body.VerCode;
    const password = req.body.password ;
    const errors = validationResult(req);

    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const seller = await Seller.findOne({ mobile: mobile }).select('image name mobile verficationCode codeExpireDate updated password');

        if (!seller) {
            const error = new Error(`seller not found`);
            error.statusCode = 404;
            error.state = 7;
            throw error;
        }


        const isEqual = await bycript.compare(code, seller.verficationCode);

        if (!isEqual) {
            const error = new Error('wrong code!!');
            error.statusCode = 403;
            error.state = 36;
            throw error;
        }
        if (seller.codeExpireDate <= Date.now()) {
            const error = new Error('verfication code expired');
            error.statusCode = 403;
            error.state = 37;
            throw error;
        }
        const isEqualNew = await bycript.compare(password, seller.password);

        if (isEqualNew) {
            const error = new Error('new password must be defferent from old password');
            error.statusCode = 409;
            error.state = 15;
            throw error;
        }

        const hashedPass = await bycript.hash(password, 12);

        seller.password = hashedPass;

        const updatedClient =  await seller.save() ;
        

        const token = jwt.sign(
            {
                mobile: updatedClient.mobile,
                userId: updatedClient._id.toString(),
                updated: updatedClient.updated.toString()
            },
            process.env.JWT_PRIVATE_KEY_SELLER
        );

        res.status(200).json({
            state: 1,
            message: 'password changed and loged in',
            data: {
                token: token,
                sellerName: updatedClient.name,
                sellerMobile: updatedClient.mobile,
                sellerId: updatedClient._id,
                image: updatedClient.image
            }
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

//verfication

exports.postSendSms = async (req, res, next) => {

    try {

        const seller = await Seller.findById(req.userId);

        const buf = crypto.randomBytes(2).toString('hex');
        const hashedCode = await bycript.hash(buf, 12)
        seller.verficationCode = hashedCode;
        seller.codeExpireDate = Date.now() + 900000;

        const message = `your verification code is ${buf}`;

        //const {body,status} = await SMS.send(seller.code, message);

        await seller.save();

        res.status(200).json({
            state: 1,
            //data:body,
            code: buf,
            message: 'code sent'
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);JWT_PRIVATE_KEY_SELLER
    }
}


exports.postCheckVerCode = async (req, res, next) => {
    const code = req.body.code;
    const errors = validationResult(req);

    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const seller = await Seller.findById(req.userId).select('verficationCode mobile codeExpireDate verfication');
        const isEqual = await bycript.compare(code, seller.verficationCode);

        if (!isEqual) {
            const error = new Error('wrong code!!');
            error.statusCode = 403;
            error.state = 36;
            throw error;
        }
        if (seller.codeExpireDate <= Date.now()) {
            const error = new Error('verfication code expired');
            error.statusCode = 403;
            error.state = 37;
            throw error;
        }

        seller.verfication = true;

        await seller.save();

        res.status(200).json({
            state: 1,
            message: 'account activated'
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.postChangeMobile = async (req, res, next) => {
    const mobile = req.body.mobile;
    const code = req.body.code;
    const errors = validationResult(req);

    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const seller = await Seller.findById(req.userId);
        
        const checkClient = await Seller.findOne({ mobile: mobile });

        if (checkClient) {
            const error = new Error(`This user is already registered with mobile`);
            error.statusCode = 409;
            error.state = 6;
            throw error;
        }

        seller.mobile = mobile;
        seller.code   = code  ;

        await seller.save();

        res.status(200).json({
            state: 1,
            data: seller.mobile,
            message: 'mobile changed'
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.postLogout = async (req, res, next) => {
    const FCM    = req.body.FCM;
    const errors = validationResult(req);

    try {
        if (!errors.isEmpty()) {
            const error = new Error(`validation faild for ${errors.array()[0].param} in ${errors.array()[0].location}`);
            error.statusCode = 422;
            error.state = 5;
            throw error;
        }

        const seller = await Seller.findById(req.userId).select('FCMJwt');

        let temp = seller.FCMJwt.filter(i=>{
            return i.token.toString() !== FCM.toString() ;
        });
        seller.FCMJwt = temp ;
        await seller.save();

        res.status(200).json({
            state:1,
            message:'logout!'
        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}