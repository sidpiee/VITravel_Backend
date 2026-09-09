const express = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const chatServiceAuthMiddleware = require("../middlewares/chatServiceAuth.middleware");
const chatController = require("../controllers/chat.controller");

const router = express.Router();

// Browser-facing route. The token is scoped to the authenticated user. OueChat
// checks membership separately for every requested ride and operation.
router.post(
    "/session",
    authMiddleware,
    chatController.createUserChatSessionController
);

// Compatibility route. It still checks the requested ride before issuing a
// session, but the token itself is not scoped to that ride or role.
router.post(
    "/rides/:rideId/session",
    authMiddleware,
    chatController.createChatSessionController
);

// Service-to-service route. ouechat uses this before joining a room and before
// sending a message so cancellation and blacklist changes take effect quickly.
router.post(
    "/membership/validate",
    chatServiceAuthMiddleware,
    chatController.validateChatMembershipController
);

module.exports = router;
