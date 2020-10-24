const mongoose = require('mongoose');

const schema = mongoose.Schema;

const bananaDlivry = new schema({
    price: {
        type: Number,
        required: true
    }
});

module.exports = mongoose.model('bananaDlivry', bananaDlivry);