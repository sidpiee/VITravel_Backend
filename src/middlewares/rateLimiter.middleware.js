const rateLimit = require("express-rate-limit");

// Limit OTP requests
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50,                   // Max 50 requests
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many OTP requests. Please try again after 15 minutes."
    }
});

// Limit OTP verification attempts separately from OTP sending. Without this
// limiter an attacker could make unlimited guesses against one OTP.
const verifyOTPLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50,                   // Max 50 verification attempts per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many OTP verification attempts. Please try again later."
    }
});

// Password-reset requests and OTP guesses are stricter than registration OTP limits.
const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many password-reset requests. Please try again later."
    }
});

const passwordResetVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many OTP attempts. Please try again later."
    }
});

const passwordResetCompleteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many password-reset attempts. Please try again later."
    }
});

// Limit login attempts
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many login attempts. Please try again later."
    }
});

module.exports = {
    otpLimiter,
    verifyOTPLimiter,
    passwordResetLimiter,
    passwordResetVerifyLimiter,
    passwordResetCompleteLimiter,
    loginLimiter
};
