const express = require("express");
const authController = require("../controllers/auth.controller");
const router = express.Router();

const {
    otpLimiter,
    verifyOTPLimiter,
    passwordResetLimiter,
    passwordResetVerifyLimiter,
    passwordResetCompleteLimiter,
    loginLimiter
} = require("../middlewares/rateLimiter.middleware");


/* POST / api/auth/send-otp */
router.post("/send-otp", otpLimiter, authController.sendOTPController);

/* POST / api/auth/verify-otp */
router.post("/verify-otp", verifyOTPLimiter, authController.verifyOTPController);

/* POST /api/auth/forgot-password */
router.post("/forgot-password", passwordResetLimiter, authController.forgotPasswordController);

/* POST /api/auth/verify-password-reset-otp */
router.post("/verify-password-reset-otp", passwordResetVerifyLimiter, authController.verifyPasswordResetOtpController);

/* POST /api/auth/reset-password */
router.post("/reset-password", passwordResetCompleteLimiter, authController.resetPasswordController);

/* POST / api/auth/register */
router.post("/register", authController.registerController);

/* POST / api/auth/login */
router.post("/login", loginLimiter, authController.loginController);        

/* POST / api/auth/logout */
router.post("/logout", authController.logoutController);

module.exports = router;
