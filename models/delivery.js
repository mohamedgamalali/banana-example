const mongoose = require('mongoose');

const schema = mongoose.Schema;

const deliverySchema = new schema({
    name: {
        type: String,
        required: true
    },
    mobile: {
        type: String,
        required: true
    },
    code:{
        type: String,
        required: true
    },
    email:{
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    image: {
        type: Number,
        default: 1
    },
    blocked: {
        type: Boolean,
        default: false
    },
    verfication:{
        type: Boolean,
        default: false
    }
});


module.exports = mongoose.model('delivery', deliverySchema);