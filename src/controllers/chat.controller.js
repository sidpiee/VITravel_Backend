const jwt = require("jsonwebtoken");
const {
    getChatMembership,
    isValidObjectId
} = require("../services/chatMembership.service");

const CHAT_TOKEN_TTL_SECONDS = 5 * 60;

const issueChatToken = (userId) => {
    if (!process.env.CHAT_TOKEN_SECRET) {
        throw new Error("Chat service is not configured");
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + CHAT_TOKEN_TTL_SECONDS;
    const chatToken = jwt.sign(
        {
            sub: userId,
            scope: "chat",
            iat: issuedAt,
            exp: expiresAt
        },
        process.env.CHAT_TOKEN_SECRET,
        {
            audience: "ouechat"
        }
    );

    return {
        chatToken,
        expiresAt: new Date(expiresAt * 1000).toISOString()
    };
};

// Browser-facing session endpoint. The token identifies the authenticated
// user only; OueChat performs ride membership checks per operation.
const createUserChatSessionController = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const session = issueChatToken(userId);

        return res.status(200).json({
            userId,
            ...session
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message
        });
    }
};

// Compatibility endpoint. It still verifies the requested ride before
// issuing a session, but the token is no longer locked to that ride or role.
const createChatSessionController = async (req, res) => {
    try {
        const { rideId } = req.params;

        if (!isValidObjectId(rideId)) {
            return res.status(400).json({
                message: "Invalid ride ID"
            });
        }

        const membership = await getChatMembership(rideId, req.user._id);

        if (!membership.found) {
            return res.status(404).json({
                message: "Ride not found"
            });
        }

        if (!membership.allowed) {
            return res.status(403).json({
                message: "You are not allowed to access this ride chat"
            });
        }

        const userId = req.user._id.toString();
        const session = issueChatToken(userId);

        return res.status(200).json({
            roomId: `ride:${rideId}`,
            rideId,
            userId,
            role: membership.role,
            ...session
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message
        });
    }
};

const validateChatMembershipController = async (req, res) => {
    try {
        const { rideId, userId } = req.body;

        if (!isValidObjectId(rideId) || !isValidObjectId(userId)) {
            return res.status(400).json({
                message: "Valid rideId and userId are required"
            });
        }

        const membership = await getChatMembership(rideId, userId);

        if (!membership.found) {
            return res.status(404).json({
                message: "Ride not found"
            });
        }

        return res.status(200).json({
            allowed: membership.allowed,
            role: membership.role,
            rideStatus: membership.rideStatus,
            bookingStatus: membership.bookingStatus
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message
        });
    }
};

module.exports = {
    createUserChatSessionController,
    createChatSessionController,
    validateChatMembershipController
};
