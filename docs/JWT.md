# JWT, explained simply (for ExamRoute)

You said you don't know JWT. Here's the whole idea in plain terms, plus exactly how ExamRoute uses it — so you can explain it confidently to a recruiter.

## The problem it solves

HTTP is "stateless" — the server forgets you after every request. So after a user logs in, how does the *next* request prove "I'm still the same logged-in user"? We need something the user carries with them that the server can trust.

## The bad old way vs JWT

One option is server-side sessions (store a session in the DB, give the user a session ID). That works but the server has to remember every logged-in user.

**JWT (JSON Web Token)** flips it: instead of the server remembering, the user carries a **signed pass**. The server doesn't store anything — it just checks the signature.

## What a JWT actually is

It's a string with three parts separated by dots: `header.payload.signature`

- **Payload** — the data, e.g. `{ "id": "user123", "exp": 1699999999 }`. (In ExamRoute we only put the user's id and an expiry.)
- **Signature** — the payload signed with a secret key that **only the server knows** (`JWT_SECRET` in our `.env`).

Anyone can *read* a JWT (it's not encrypted, just encoded). But nobody can *forge* one, because they'd need the secret to produce a valid signature. If someone changes the payload (say, swaps in a different user id), the signature no longer matches and the server rejects it.

## The flow in ExamRoute

1. **Login** — user signs in (Google, or email+password). The server verifies them, then calls `signToken(user)` which creates a JWT containing their id, signed with `JWT_SECRET`.
   - See `server/src/controllers/authController.js` → `signToken`.
2. **Client stores it** — the React app saves the token in `localStorage` (key `examroute_token`).
   - See `client/src/context/AuthContext.jsx`.
3. **Every request carries it** — Axios automatically adds the header `Authorization: Bearer <token>` to each API call.
   - See `client/src/api/client.js` (the request interceptor).
4. **Server verifies it** — protected routes run the `protect` middleware, which does `jwt.verify(token, JWT_SECRET)`. If valid, it loads the user and attaches `req.user`; if not, it returns 401.
   - See `server/src/middleware/auth.js`.

## Google login vs JWT — they are NOT the same thing

This trips people up. In ExamRoute:

- **Google** proves *who you are* — once, at login. Google hands us an ID token; we verify it's genuinely from Google.
- **Our JWT** runs *your session* afterwards. After confirming identity (via Google OR email+password), **we** issue **our own** JWT. Every later request uses our JWT, not Google's.

So Google is the doorman who checks your ID once; our JWT is the wristband you wear inside.

## Why this is good to say in an interview

- "I used stateless JWT auth so the API doesn't need server-side session storage."
- "The token is signed with a server-only secret, so it can't be forged; I verify the signature in middleware on every protected route."
- "Google OAuth handles identity; I mint my own JWT for the session — I don't trust the client's claim, I verify the token server-side."

## One honest caveat

For a production app you'd add refresh tokens (short-lived access token + a longer refresh token) and store tokens more securely than `localStorage`. For a college project a single 7-day token is fine — but mentioning the production hardening shows you understand the tradeoff.
