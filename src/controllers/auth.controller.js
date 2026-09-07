const userModel = require("../models/user.model");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const otpAuth = require("../services/otpAuth.service");
const passwordReset = require("../services/passwordReset.service");

const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = {
    httpOnly: true,                                // Hide cookie from frontend JS
    secure: isProduction,                          // HTTPS only in production
    sameSite: isProduction ? "none" : "lax",      // Cross-site cookie when frontend is deployed separately
    maxAge: 2 * 24 * 60 * 60 * 1000                // 2 days expiry
}

/** 
 * - send OTP controller
 * - POST /api/auth/send-otp
 */

async function sendOTPController(req, res) {
    try {

        const { email } = req.body;

        const normalizedEmail = email?.trim().toLowerCase();

        if (!normalizedEmail) {
            return res.status(400).json({
                message: "Email is required"
            });
        }

        // if (!normalizedEmail.endsWith("@vitbhopal.ac.in")) {
        //     return res.status(400).json({
        //         message: "Only VIT Bhopal email addresses are allowed"
        //     });
        // }
        const existingUser = await userModel.findOne({ email: normalizedEmail });

        if (existingUser) {
            return res.status(400).json({
                message: "Email is already registered"
            });
        }

        await otpAuth.sendOTP(normalizedEmail);

        return res.status(200).json({
            message: "OTP sent successfully"
        });
    } 
    catch (error) {
        console.error(error);
        return res.status(500).json({
            message: error.message
        });
    }
}

/** 
 * - verify OTP controller
 * - POST /api/auth/verify-otp
 */

async function verifyOTPController(req, res) {
    try {
        const { email, otp } = req.body;
        const normalizedEmail = email?.trim().toLowerCase();

        if (!normalizedEmail || !otp) {
            return res.status(400).json({
                message: "Email and OTP are required"
            });
        }

        await otpAuth.verifyEmail(normalizedEmail, otp);

        return res.status(200).json({
            message: "Email verified successfully"
        });
    } catch (error) {
        console.error(error);
        return res.status(400).json({
            message: error.message
        });
    }
}

/**
 * - Request a password-reset OTP
 * - POST /api/auth/forgot-password
 */
async function forgotPasswordController(req, res) {
    try {
        const normalizedEmail = req.body.email?.trim().toLowerCase();

        if (!normalizedEmail) {
            return res.status(400).json({
                message: "Email is required"
            });
        }

        await passwordReset.requestPasswordReset(normalizedEmail);

        return res.status(200).json({
            message: "If the email is registered, a password-reset OTP has been sent."
        });
    } catch (error) {
        console.error("Forgot-password error:", error);
        return res.status(500).json({
            message: "Unable to process password-reset request"
        });
    }
}

/**
 * - Verify a password-reset OTP
 * - POST /api/auth/verify-password-reset-otp
 */
async function verifyPasswordResetOtpController(req, res) {
    try {
        const normalizedEmail = req.body.email?.trim().toLowerCase();
        const otp = req.body.otp?.toString().trim();

        if (!normalizedEmail || !otp) {
            return res.status(400).json({
                message: "Email and OTP are required"
            });
        }

        const resetSessionToken = await passwordReset.verifyPasswordResetOtp(
            normalizedEmail,
            otp
        );

        return res.status(200).json({
            message: "OTP verified successfully",
            resetSessionToken,
            expiresIn: 10 * 60
        });
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({ message: error.message });
        }

        console.error("Password-reset OTP verification error:", error);
        return res.status(500).json({
            message: "Unable to verify password-reset OTP"
        });
    }
}

/**
 * - Reset the password after OTP verification
 * - POST /api/auth/reset-password
 */
async function resetPasswordController(req, res) {
    try {
        const { resetSessionToken, newPassword } = req.body;

        if (!resetSessionToken || !newPassword) {
            return res.status(400).json({
                message: "Reset session token and new password are required"
            });
        }

        await passwordReset.resetPassword(resetSessionToken, newPassword);

        return res.status(200).json({
            message: "Password reset successfully. Please log in again."
        });
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({ message: error.message });
        }

        console.error("Password-reset error:", error);
        return res.status(500).json({
            message: "Unable to reset password"
        });
    }
}
/** 
 * - user register controller
 * - POST /api/auth/register
 */

async function registerController(req, res) {
    try {
        const { name, username, password, email} = req.body;
        const normalizedEmail = email?.trim().toLowerCase();

        if (!name || !username || !password || !normalizedEmail) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        // check if user already exists with the same username or email or phone number
        const existingUser = await userModel.findOne({
            $or: [
                { username },
                { email : normalizedEmail }
            ]
        });

        if (existingUser) {
            return res.status(400).json({
                message: "User already exists"
            });
        }

        // Check if the email was verified
        const isVerified = await otpAuth.isEmailVerified(normalizedEmail);
        if (!isVerified) {
            return res.status(400).json({
                message: "Email is not verified"
            });
        }

        // create new user

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await userModel.create({
            username,
            password: hashedPassword,
            email : normalizedEmail,
            name
        });

        // Clear the verification status after successful registration : so it cant be reused for another registration
        await otpAuth.clearVerification(normalizedEmail);


        const token = jwt.sign(
            { userId: user._id, tokenVersion: user.tokenVersion ?? 0 },
            process.env.JWT_SECRET,
            { expiresIn: "2d" }
        );

        // Good practice 
        res.cookie("token", token, cookieOptions);

        return res.status(201).json({
            message: "User registered successfully",
            status: "success",
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal server error"
        });
    }
}

/**
 * - User Login Controller
 * - POST /api/auth/login
  */

async function loginController(req, res) {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                message: "Username and password are required"
            });
        }

        const user = await userModel.findOne({ username }).select('+password');

        if (!user) {
            return res.status(401).json({
                message: "Username or password is INVALID"
            });
        }

        // Comparing the provided password with hashed db password.
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({
                message: "Username or password is INVALID"
            })
        }

        // Do not issue a new token to a blacklisted user. The auth middleware
        // also protects existing tokens, but login must reject them too.
        if (user.isBlacklisted) {
            return res.status(403).json({
                message: "User is blacklisted"
            });
        }

        // If email and password are valid then generate a JWT token and send it in response.
        const token = jwt.sign(
            { userId: user._id, tokenVersion: user.tokenVersion ?? 0 },
            process.env.JWT_SECRET,
            { expiresIn: "2d" }
        );

        // Good practice 
        res.cookie("token", token, cookieOptions);

        return res.status(200).json({
            message: "Login successful",
            status: "success",
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: error.message
        });
    }
}

/**
 * - User Logout Controller
 * - POST /api/auth/logout
  */
async function logoutController(req, res) {
    // Always clear the cookie, even when the client has no valid token. This
    // keeps logout idempotent and removes stale browser credentials.
    res.clearCookie("token", cookieOptions);

    const cookieToken = req.cookies?.token;
    const authorization = req.headers.authorization;
    const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = cookieToken || bearerToken;

    if (token) {
        let decoded;

        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            // Logout should still succeed for expired or malformed tokens;
            // there is nothing valid left to revoke in that case.
        }

        if (decoded?.userId) {
            try {
                // JWTs are otherwise stateless. Incrementing tokenVersion
                // makes this token (and any other token issued before logout)
                // invalid in auth.middleware.js, including bearer tokens.
                await userModel.findByIdAndUpdate(
                    decoded.userId,
                    { $inc: { tokenVersion: 1 } }
                );
            } catch (error) {
                // Do not report a successful logout when the database could
                // not persist the revocation; the token would remain usable.
                return res.status(500).json({
                    message: "Unable to revoke session"
                });
            }
        }
    }

    return res.status(200).json({
        message: "User logged out successfully"
    });

}


module.exports = {
    sendOTPController,
    verifyOTPController,
    forgotPasswordController,
    verifyPasswordResetOtpController,
    resetPasswordController,
    registerController,
    loginController,
    logoutController
}
