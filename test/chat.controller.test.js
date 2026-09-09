const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");

const secret = "vitravel-chat-test-secret";
process.env.CHAT_TOKEN_SECRET = secret;

const {
    createUserChatSessionController
} = require("../src/controllers/chat.controller");

function createResponse() {
    return {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(value) {
            this.body = value;
            return this;
        }
    };
}

test("creates a user-scoped five-minute chat token", async () => {
    const response = createResponse();

    await createUserChatSessionController(
        { user: { _id: "user-1" } },
        response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.userId, "user-1");

    const payload = jwt.verify(
        response.body.chatToken,
        secret,
        { audience: "ouechat" }
    );

    assert.equal(payload.sub, "user-1");
    assert.equal(payload.aud, "ouechat");
    assert.equal(payload.scope, "chat");
    assert.equal(typeof payload.iat, "number");
    assert.equal(typeof payload.exp, "number");
    assert.equal(payload.exp - payload.iat, 5 * 60);
    assert.equal(
        response.body.expiresAt,
        new Date(payload.exp * 1000).toISOString()
    );
});
