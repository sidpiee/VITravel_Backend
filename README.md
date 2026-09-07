# VITravels Backend

Backend API for VITravels, a ride-sharing application for VIT Bhopal
students. This service owns users, authentication, rides, bookings, ride
membership, and the integration contract used by the separate OueChat
microservice.

Live API:

```text
https://vitravel-backend.onrender.com
```

## What this service provides

- Email OTP verification and user registration
- JWT authentication using an HTTP-only cookie or a bearer token
- User profile management and public profile lookup for authenticated users
- Ride creation, search, update, cancellation, and lifecycle completion
- Atomic booking creation and cancellation with seat updates
- Chat-session token creation for the separate OueChat service
- Internal membership validation for OueChat

The frontend must never connect directly to MongoDB. It communicates with
this API over HTTP and JSON.

## Technology and runtime requirements

- Node.js `20.19.0` or newer
- Express `5`
- MongoDB and Mongoose `9`
- JSON Web Tokens (`jsonwebtoken`)
- `bcrypt` for password hashing
- Brevo REST API for email OTP delivery
- `express-rate-limit` for OTP and login limits

MongoDB must support replica-set transactions. MongoDB Atlas supports this by
default. A local MongoDB deployment must be configured as a replica set for
booking and cancellation transactions to work.

## Project structure

```text
VITravel_Backend/
├── src/
│   ├── app.js
│   ├── config/
│   │   ├── db.js
│   │   └── mail.config.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── booking.controller.js
│   │   ├── chat.controller.js
│   │   ├── ride.controller.js
│   │   └── user.controller.js
│   ├── middlewares/
│   │   ├── auth.middleware.js
│   │   ├── chatServiceAuth.middleware.js
│   │   ├── error.middleware.js
│   │   └── rateLimiter.middleware.js
│   ├── models/
│   │   ├── booking.model.js
│   │   ├── emailVerification.model.js
│   │   ├── ride.model.js
│   │   └── user.model.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── booking.routes.js
│   │   ├── chat.routes.js
│   │   ├── ride.routes.js
│   │   └── user.routes.js
│   └── services/
│       ├── chatMembership.service.js
│       ├── otpAuth.service.js
│       └── rideStatus.service.js
├── server.js
├── package.json
└── README.md
```

`server.js` loads environment variables, connects to MongoDB, starts the
expired-ride completion service, and starts Express. `src/app.js` configures
middleware and mounts the API route groups.

## Configuration

Create a `.env` file in the repository root. Do not commit it.

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=<mongodb-connection-string>
JWT_SECRET=<long-random-jwt-secret>
EMAIL_USER=<sender-email-address>
BREVO_API_KEY=<brevo-api-key>
FRONTEND_URL=http://localhost:5173

# These two values must match the corresponding values in OueChat.
CHAT_TOKEN_SECRET=<shared-chat-token-secret>
CHAT_SERVICE_SECRET=<shared-chat-service-secret>
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | No | Uses production cookie/CORS behavior when set to `production`. |
| `PORT` | No | Express port. Defaults to `5000`. |
| `MONGODB_URI` | Yes | MongoDB connection string for ride application data. |
| `JWT_SECRET` | Yes | Signs and verifies ride-application JWTs. |
| `EMAIL_USER` | Yes for OTP | Sender address used by Brevo. |
| `BREVO_API_KEY` | Yes for OTP | Brevo API credential used to send OTP emails. |
| `FRONTEND_URL` | Production | Exact frontend origin allowed by CORS in production. |
| `CHAT_TOKEN_SECRET` | Chat integration | Shared with OueChat to sign and verify chat tokens. |
| `CHAT_SERVICE_SECRET` | Chat integration | Shared with OueChat for internal membership requests. |

`FRONTEND_URL` is one origin, including scheme, host, and port. During
development, `http://localhost:3000` and `http://localhost:5173` are allowed
in addition to the configured origin. Credentialed requests are enabled.

## Install and run

```powershell
npm install
npm run dev
```

For production-style startup:

```powershell
npm start
```

The current scripts are:

```json
{
  "start": "node server.js",
  "dev": "nodemon server.js"
}
```

The server connects to MongoDB and starts the ride-status service before it
begins accepting HTTP requests. If the database connection fails, startup
exits.

Basic availability check:

```http
GET /
```

Response:

```text
VITravels Backend Running
```

## Request and response conventions

- Send request bodies as JSON with `Content-Type: application/json`.
- Cookie-authenticated frontend requests must use `credentials: "include"`.
- The auth middleware also accepts `Authorization: Bearer <token>`.
- Most error responses use the shape `{ "message": "..." }`.
- Always check `response.ok` or the HTTP status before using response data.
- IDs are MongoDB ObjectId strings.

Example authenticated request:

```js
const response = await fetch(`${API_URL}/api/rides`, {
    credentials: "include"
});

const data = await response.json();

if (!response.ok) {
    throw new Error(data.message || "Request failed");
}
```

Common statuses:

| Status | Meaning |
| --- | --- |
| `200` | Successful request |
| `201` | Resource created |
| `400` | Invalid input or invalid state transition |
| `401` | Missing, invalid, or revoked authentication |
| `403` | Authenticated user is not allowed |
| `404` | Resource not found |
| `409` | Duplicate or conflicting request |
| `429` | Rate limit exceeded |
| `500` | Server or dependency failure |

## Authentication API

Authentication routes are mounted under `/api/auth`.

### Send registration OTP

```http
POST /api/auth/send-otp
```

Request body:

```json
{
  "email": "student@example.com"
}
```

The email is normalized to lowercase. The current implementation does not
enforce a VIT email domain. Existing registered emails are rejected.

Success: `200`

```json
{
  "message": "OTP sent successfully"
}
```

The OTP is six digits, expires after five minutes, and is stored hashed. This
route is limited to 10 requests per IP per 15 minutes.

### Verify registration OTP

```http
POST /api/auth/verify-otp
```

Request body:

```json
{
  "email": "student@example.com",
  "otp": "123456"
}
```

Success: `200`

```json
{
  "message": "Email verified successfully"
}
```

Verification attempts are limited to 10 per IP per 15 minutes.

### Forgot password

```http
POST /api/auth/forgot-password
```

Request body:

```json
{
  "email": "student@example.com"
}
```

The endpoint always returns a generic success message. If the email belongs to a
user, the backend sends a six-digit OTP that expires after five minutes. OTP
requests are limited to five per IP per 15 minutes.

Success: `200`

```json
{
  "message": "If the email is registered, a password-reset OTP has been sent."
}
```

### Verify password-reset OTP

```http
POST /api/auth/verify-password-reset-otp
```

Request body:

```json
{
  "email": "student@example.com",
  "otp": "123456"
}
```

Success: `200`

```json
{
  "message": "OTP verified successfully",
  "resetSessionToken": "<short-lived-token>",
  "expiresIn": 600
}
```

The reset session token is required for the next step. OTP verification is
limited to five attempts per reset record and ten requests per IP per 15 minutes.

### Reset password

```http
POST /api/auth/reset-password
```

Request body:

```json
{
  "resetSessionToken": "<short-lived-token>",
  "newPassword": "new-password"
}
```

Success: `200`

```json
{
  "message": "Password reset successfully. Please log in again."
}
```

The reset session token expires after ten minutes and can be used only once.
Successful password resets increment the user's `tokenVersion`, revoking existing
cookie and bearer-token sessions. The frontend should redirect the user to login
after receiving the success response.

### Register

```http
POST /api/auth/register
```

Request body:

```json
{
  "name": "Test User",
  "username": "testuser",
  "email": "student@example.com",
  "password": "password123"
}
```

The email must have been verified first. The password is hashed by the
backend. On success, the backend creates the user and sets the authentication
cookie.

Success: `201`

```json
{
  "message": "User registered successfully",
  "status": "success"
}
```

### Login

```http
POST /api/auth/login
```

Request body:

```json
{
  "username": "testuser",
  "password": "password123"
}
```

Success: `200`

```json
{
  "message": "Login successful",
  "status": "success"
}
```

The token is set in the HTTP-only `token` cookie and is not returned in the
JSON response. Blacklisted users cannot log in. Login is limited to 10
requests per IP per 15 minutes.

### Logout

```http
POST /api/auth/logout
```

This route clears the `token` cookie. When a valid cookie or bearer token is
available, it increments the user's `tokenVersion`, revoking previously
issued tokens. Logout is intentionally safe for missing, expired, or
malformed tokens.

Success: `200`

```json
{
  "message": "User logged out successfully"
}
```

## User API

User routes are mounted under `/api/user` and require authentication.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/user/me` | None | `{ "user": ... }` |
| `PATCH` | `/api/user/me` | `{ "name": "New Name" }` | `{ "message": ..., "user": ... }` |
| `GET` | `/api/user/:id` | None | `{ "user": { "name", "username" } }` |

`PATCH /api/user/me` updates only the name. The user ID profile route is
authenticated even though it returns public fields. Passwords are excluded
from normal user queries by the model and are never returned by these routes.

## Ride API

Ride routes are mounted under `/api/rides` and require authentication.

### Create a ride

```http
POST /api/rides/ride
```

Request body:

```json
{
  "from": "VIT Bhopal",
  "destination": "Bhopal Railway Station",
  "date": "2027-08-01",
  "time": "10:30",
  "availableSeats": 3,
  "price": 100
}
```

All fields are required. `availableSeats` and `price` must be greater than
zero at creation. Source and destination cannot be the same. The combined
date and time must be in the future.

Success: `201` with the created ride document.

### Search active rides

```http
GET /api/rides
```

Optional query parameters:

```text
from=<text>
destination=<text>
date=YYYY-MM-DD
availableSeats=<minimum>
minPrice=<minimum>
maxPrice=<maximum>
```

The endpoint returns only active rides with more than zero available seats.
Expired rides are also filtered out using their `date` and `time` fields.

Success: `200`

```json
{
  "count": 1,
  "rides": [
    {
      "_id": "...",
      "creator": {
        "_id": "...",
        "name": "Test User",
        "username": "testuser"
      },
      "from": "VIT Bhopal",
      "destination": "Bhopal Railway Station",
      "date": "2027-08-01T00:00:00.000Z",
      "time": "10:30",
      "availableSeats": 3,
      "status": "active",
      "price": 100,
      "passengers": []
    }
  ]
}
```

### Get the current user's rides

```http
GET /api/rides/my-rides
```

Success: `200` with `{ "count": number, "rides": [] }`.

### Get a ride by ID

```http
GET /api/rides/rides/:id
```

Success: `200` with the ride document. `creator` and `passengers` are
populated with `name` and `username`.

### Update a ride

```http
PATCH /api/rides/rides/:id
```

The creator may update any supplied field:

```json
{
  "from": "VIT Bhopal",
  "destination": "Airport",
  "date": "2027-08-02",
  "time": "11:00",
  "availableSeats": 4,
  "price": 120
}
```

Only active rides can be updated. A new date/time must be in the future,
price must be greater than zero, and available seats cannot be reduced below
the number of existing passengers.

Success: `200`

```json
{
  "message": "Ride updated successfully",
  "ride": { }
}
```

### Cancel a ride

```http
PATCH /api/rides/rides/:id/cancel
```

Only the creator can cancel an active ride. The ride and all confirmed
bookings are updated in one MongoDB transaction.

Success: `200`

```json
{
  "message": "Ride canceled successfully",
  "ride": { "status": "cancelled" },
  "cancelledBookingCount": 1
}
```

Cancelled rides cannot be booked again.

### Ride and booking statuses

Ride status values are `active`, `completed`, and `cancelled`.

Booking status values are `confirmed`, `completed`, and `cancelled`.

The ride-status service runs immediately at startup and then every 60 seconds.
It marks expired active rides as `completed` and their confirmed bookings as
`completed`. The service rechecks the original date/time and active status in
its update, so a rescheduled ride is not incorrectly completed.

## Booking API

Booking routes are mounted under `/api/bookings` and require authentication.

### Create or rebook a ride

```http
POST /api/bookings/create
```

Request body:

```json
{
  "rideId": "665abc123456789012345678"
}
```

The request is rejected when the ride is missing, inactive, expired, full, or
owned by the requesting user. A user cannot have two bookings for the same
ride. If the existing booking is cancelled, it is reactivated instead of
creating a duplicate document.

Booking creation, seat decrement, and passenger insertion run in one
transaction. The seat update is conditional on `availableSeats > 0`, so
concurrent requests cannot reserve the same final seat.

Success: `201`

```json
{
  "message": "Ride booked successfully",
  "booking": { }
}
```

### Get the current user's bookings

```http
GET /api/bookings/my-bookings
```

Success: `200` with `{ "bookings": [] }`. Each ride is populated and its
creator includes `name` and `username`.

### Get a booking by ID

```http
GET /api/bookings/:id
```

Users can access only their own booking. The ride and its creator are
populated in the response.

### Cancel a booking

```http
PATCH /api/bookings/:id/cancel
```

Only the booking owner can cancel a confirmed booking. The booking status is
changed to `cancelled`, one seat is restored, and the user is removed from the
ride's passenger list in one transaction. Cancellation is rejected for an
inactive or already-started ride.

Success: `200`

```json
{
  "message": "Booking cancelled successfully",
  "booking": { "status": "cancelled" }
}
```

## OueChat integration

OueChat is a separate chat microservice with its own server and MongoDB. The
ride backend does not create chat messages or access the chat database. It
only authenticates users, verifies ride membership, and issues chat tokens.

### Create a chat session

```http
POST /api/chat/rides/:rideId/session
Authorization: Bearer <ride-app-jwt>
```

The normal ride authentication middleware verifies the user, blacklist state,
and token version. The chat membership service then allows only the ride
creator or a user with a confirmed booking while the ride is active and in the
future.

Success: `200`

```json
{
  "roomId": "ride:665abc123456789012345678",
  "rideId": "665abc123456789012345678",
  "userId": "665def123456789012345678",
  "role": "creator",
  "chatToken": "<short-lived-jwt>",
  "expiresAt": "2027-08-01T05:35:00.000Z"
}
```

The chat token expires after five minutes and contains `sub`, `rideId`, and
`role`. It is signed with `CHAT_TOKEN_SECRET` and uses the audience
`ouechat`.

The frontend uses `chatToken` to connect to OueChat through Socket.IO. The
frontend must not call the membership endpoint below directly.

### Internal membership validation

OueChat calls this ride-backend endpoint before allowing a user to join, load
messages, or send a message:

```http
POST /api/chat/membership/validate
Content-Type: application/json
x-chat-service-secret: <CHAT_SERVICE_SECRET>
```

Request body:

```json
{
  "rideId": "665abc123456789012345678",
  "userId": "665def123456789012345678"
}
```

Response:

```json
{
  "allowed": true,
  "role": "passenger",
  "rideStatus": "active",
  "bookingStatus": "confirmed"
}
```

This endpoint is protected by `CHAT_SERVICE_SECRET` and is intended only for
server-to-server communication. The two chat secrets must match between this
backend and OueChat.

For the complete OueChat Socket.IO contract and deployment instructions, see
the OueChat repository's `server/README.md`.

## Authentication and security rules

- The authentication cookie is named `token`, is HTTP-only, and lasts two
  days.
- Production cookies use `secure: true` and `SameSite=None`; development uses
  `secure: false` and `SameSite=Lax`.
- Logout increments `tokenVersion` so existing cookie and bearer tokens can be
  revoked.
- Blacklisted users are rejected by authentication and cannot issue chat
  sessions.
- Passwords are stored hashed and excluded from normal user queries with
  `select: false`.
- Never put `JWT_SECRET`, `MONGODB_URI`, Brevo credentials, or chat secrets in
  frontend `VITE_*` variables.
- CORS and frontend button visibility are not authorization. Backend
  middleware and services perform the actual checks.
- Use HTTPS in production.

## Frontend integration

The frontend is a separate project. Configure its API base URL using an
environment variable:

```env
VITE_API_URL=http://localhost:5000
```

For cookie authentication, use:

```js
fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({ username, password })
});
```

For the chat feature, first call the chat-session endpoint on this backend,
then pass the returned token to the separate OueChat server. Do not place the
chat token in a URL or persist it longer than needed.

## Deployment checklist

1. Set all required environment variables in the deployment platform.
2. Use a MongoDB deployment that supports transactions.
3. Set `NODE_ENV=production`.
4. Set `FRONTEND_URL` to the exact deployed frontend origin.
5. Expose the deployed API base URL to the frontend as `VITE_API_URL`.
6. Configure matching `CHAT_TOKEN_SECRET` and `CHAT_SERVICE_SECRET` in both
   this backend and OueChat.
7. Configure OueChat's `RIDE_BACKEND_URL` to this backend's base URL.
8. Verify `GET /` and the authenticated API routes after deployment.

## Current limitations and implementation notes

- The API has no global error handler mounted; route controllers return their
  own `{ message }` error responses.
- Ride date and time are stored in separate fields. The combined value is
  parsed using the server's local time zone.
- The current ride routes use `/api/rides/ride` for creation and
  `/api/rides/rides/:id` for detail, update, and cancellation. Frontend code
  must use these exact paths.
- There is no automated `test` script in `package.json`; the available scripts
  are `dev` and `start`.
