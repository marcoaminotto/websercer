const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    image: String,
    sign: String,
},{
    timestamps: true,
});

module.exports = mongoose.model('Post', PostSchema);