const bcrypt = require("bcrypt");
const crypto = require("crypto");
const mongoose = require("mongoose");

const userModel = require("../models/user.model");
const PasswordReset = require("../models/passwordReset.model");

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const RESET_TOKEN_EXPIRY_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function createResetError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function hashResetToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

async function sendPasswordResetEmail(email, otp) {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            accept: "application/json",
            "api-key": process.env.BREVO_API_KEY,
            "content-type": "application/json"
        },
        body: JSON.stringify({
            sender: {
                name: "VITravels",
                email: process.env.EMAIL_USER
            },
            to: [{ email }],
            subject: "Reset your VITravel password",
            htmlContent: `
                <h2>Password reset</h2>
                <p>Your VITravel password reset OTP is:</p>
                <h1 style="letter-spacing: 4px;">${otp}</h1>
                <p>This OTP is valid for <strong>5 minutes</strong>.</p>
                <p>If you did not request this, you can safely ignore this email.</p>
            `
        })
    });

    let result = {};
    try {
        result = await response.json();
    } catch (error) {
        // Brevo may return an empty or non-JSON response on provider errors.
    }

    if (!response.ok) {
        console.error("Brevo password-reset email error:", result);
        throw new Error(result.message || "Failed to send password-reset email");
    }
}

async function requestPasswordReset(email) {
    const user = await userModel.findOne({ email }).select("_id email");

    // The controller always returns the same response whether this user exists
    // or not, preventing account enumeration.
    if (!user) {
        return;
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    // Replace the existing challenge only after the provider accepts the new
    // message, so a provider failure does not silently invalidate a usable OTP.
    await sendPasswordResetEmail(email, otp);

    await PasswordReset.deleteMany({ userId: user._id });
    await PasswordReset.create({
        userId: user._id,
        email,
        otpHash,
        otpExpiresAt: new Date(Date.now() + OTP_EXPIRY_MS)
    });
}

async function verifyPasswordResetOtp(email, enteredOtp) {
    const challenge = await PasswordReset.findOne({
        email,
        usedAt: null
    }).sort({ createdAt: -1 });

    if (!challenge || challenge.otpVerifiedAt || !challenge.otpHash) {
        throw createResetError("Invalid or expired OTP");
    }

    if (challenge.otpExpiresAt <= new Date() || challenge.otpAttempts >= MAX_OTP_ATTEMPTS) {
        await PasswordReset.deleteOne({ _id: challenge._id });
        throw createResetError("Invalid or expired OTP");
    }

    const isValidOtp = await bcrypt.compare(enteredOtp, challenge.otpHash);

    if (!isValidOtp) {
        const updatedChallenge = await PasswordReset.findOneAndUpdate(
            {
                _id: challenge._id,
                otpVerifiedAt: null,
                usedAt: null
            },
            { $inc: { otpAttempts: 1 } },
            { new: true }
        );

        if (!updatedChallenge || updatedChallenge.otpAttempts >= MAX_OTP_ATTEMPTS) {
            await PasswordReset.deleteOne({ _id: challenge._id });
        }

        throw createResetError("Invalid or expired OTP");
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const now = new Date();

    const verifiedChallenge = await PasswordReset.findOneAndUpdate(
        {
            _id: challenge._id,
            otpVerifiedAt: null,
            usedAt: null,
            otpExpiresAt: { $gt: now }
        },
        {
            $set: {
                otpVerifiedAt: now,
                otpHash: null,
                otpExpiresAt: null,
                resetTokenHash: hashResetToken(resetToken),
                resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS)
            }
        },
        { new: true }
    );

    if (!verifiedChallenge) {
        throw createResetError("Invalid or expired OTP");
    }

    return resetToken;
}

async function resetPassword(resetToken, newPassword) {
    if (!resetToken || typeof resetToken !== "string") {
        throw createResetError("Invalid or expired password-reset session");
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
        throw createResetError("Password must be at least 8 characters long");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async () => {
            const challenge = await PasswordReset.findOne({
                resetTokenHash: hashResetToken(resetToken),
                otpVerifiedAt: { $ne: null },
                usedAt: null,
                resetTokenExpiresAt: { $gt: new Date() }
            }).session(session);

            if (!challenge) {
                throw createResetError("Invalid or expired password-reset session");
            }

            const user = await userModel.findByIdAndUpdate(
                challenge.userId,
                {
                    $set: { password: hashedPassword },
                    $inc: { tokenVersion: 1 }
                },
                { new: true, session }
            );

            if (!user) {
                throw createResetError("Invalid or expired password-reset session");
            }

            await PasswordReset.updateOne(
                { _id: challenge._id, usedAt: null },
                { $set: { usedAt: new Date() } },
                { session }
            );
        });
    } finally {
        await session.endSession();
    }
}

module.exports = {
    requestPasswordReset,
    verifyPasswordResetOtp,
    resetPassword
};
