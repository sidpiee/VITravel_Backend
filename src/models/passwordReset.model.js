const mongoose = require("mongoose");

const passwordResetSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true
    },
    otpHash: {
        type: String,
        default: null
    },
    otpExpiresAt: {
        type: Date,
        default: null
    },
    otpAttempts: {
        type: Number,
        default: 0
    },
    otpVerifiedAt: {
        type: Date,
        default: null
    },
    resetTokenHash: {
        type: String,
        default: null,
        index: true
    },
    resetTokenExpiresAt: {
        type: Date,
        default: null
    },
    usedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model("PasswordReset", passwordResetSchema);
