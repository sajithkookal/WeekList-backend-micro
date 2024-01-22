const mongoose = require('mongoose')

const userSchema= new mongoose.Schema({
    fullname: String,
    email: {
        type: String,
        unique: true
    },
    password: String,
    age: Number,
    gender: String,
    mobile: String
});

const User = mongoose.model("User",  userSchema);
module.exports = User;