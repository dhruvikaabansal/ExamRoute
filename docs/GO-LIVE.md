# Go-live checklist

Do these in order. Do not skip ahead — step 1 can invalidate everything after it.

Each step says what to run and what you should see. If what you see does not
match, stop there rather than continuing.

---

## 1. Run the tests locally

Nothing else matters if these are red.

```bash
npm --prefix server test
```

**Expect:** all tests pass, roughly 160 of them.

**If red:** stop. Copy the failure output. Do not push.

---

## 2. Get Razorpay test keys

Payments are no longer simulated in production, so the deployed API needs a
real gateway. Test mode is free, needs no KYC, and charges nobody.

1. Sign up or sign in at [dashboard.razorpay.com](https://dashboard.razorpay.com)
2. Make sure the toggle at the top says **Test Mode**, not Live Mode
3. **Settings → API Keys → Generate Test Key**
4. Copy both values. The secret is shown **once** — save it somewhere now

**Expect:** a key id starting `rzp_test_` and a secret.

---

## 3. Test the payment flow locally

Put the keys in `server/.env`:

```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_secret_here
```

Then:

```bash
npm run dev
```

Sign in with Google, book a seat, and pay with the test card:

**Easiest: Netbanking.** Choose it, pick any bank, and Razorpay shows a **mock
bank page with Success and Failure buttons** — test mode never redirects to a
real bank. No card rules, no account settings to enable.

Worth clicking **Failure** once too: the booking should stay unpaid and
bookable, which is the path most people never test.

Other methods, if you want them:

| Method | What to use |
|---|---|
| Cards | `5267 3181 8797 5449`, any future expiry, any CVV, any OTP |
| UPI | `success@razorpay` — only if UPI is enabled on your account |

**Expect:** the real Razorpay window opens, payment succeeds, and you land on
the confirmation page. That is the whole integration working end to end.

**If a card says "International cards are not supported":** that number is on
Razorpay's international list for your account. Use Netbanking, or another
number from
[Razorpay's test card docs](https://razorpay.com/docs/payments/payments/test-card-details/).

**If UPI is not offered at all:** it is not enabled on your Razorpay account.
That is a dashboard setting, not anything in this code.

**If the Razorpay window does not open at all:** the keys are wrong, or still
have the `rzp_test_xxxx` placeholder in them.

---

## 4. Push

```bash
git push origin main
```

**Expect:** GitHub Actions goes green. Check the **Actions** tab.

Vercel redeploys the frontend automatically. Render redeploys the API
automatically.

---

## 5. Set the Render environment variables

Render dashboard → your API service → **Environment**.

**Add:**

```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_secret_here
```

**Delete:**

```
ALLOW_MOCK_PAYMENTS
```

That variable does nothing now. Removing it stops it looking like it does.

**Confirm these are already there:**

```
GOOGLE_CLIENT_ID
ADMIN_EMAIL      <- your own email, or you lose admin access
MONGO_URI
CLIENT_URL       <- https://exam-route.vercel.app, exactly
```

Save. Render redeploys.

**Expect in the logs:** `MongoDB connected`, `ExamRoute API running on port 10000`,
and **no** warning about missing Razorpay keys.

---

## 6. Confirm Vercel has the Google client id

Vercel → your project → **Settings → Environment Variables**.

```
VITE_GOOGLE_CLIENT_ID=<the same client id as the server>
VITE_API_URL=https://examroute-api.onrender.com/api
```

Google is now the **only** way to sign in. If this is missing, nobody can get
into the site at all — not degraded, locked out.

If you change anything here, **redeploy** — Vite bakes these in at build time,
so a saved variable does nothing until the next build.

---

## 7. Check the live site

Open <https://exam-route.vercel.app>.

- The demo-payments banner should be **gone**
- Sign in with Google should work
- Booking a seat should open the **real** Razorpay window

Also check the API directly: <https://examroute-api.onrender.com/api/health>

**Expect:** `"demoMode": false`.

---

## 8. Re-run routing on the live data

Sign in as your admin account → **Admin** → pick a sitting → **Run routing engine**.

Do this for each sitting you plan to show. Existing buses were routed before
the boarding buffer existed, so their tickets still show one time instead of
the ten-minute split.

**Expect:** on a ticket, "Be at your stop by 07:00" above "Bus reaches your
stop 07:10".

---

## 9. Record the demo

Shot list is in [`LAUNCH.md`](LAUNCH.md). Run `npm run seed && npm run seed:demo`
first so the data is fresh.

---

## 10. Post it

Drafts are in [`LAUNCH.md`](LAUNCH.md). Resume bullets are in
[`RESUME-POINTS.md`](RESUME-POINTS.md).

---

## If something breaks

| Symptom | Cause |
|---|---|
| Cannot sign in at all | `VITE_GOOGLE_CLIENT_ID` missing on Vercel, or Vercel not redeployed since you set it |
| "Google sign-in is not configured on this server" | `GOOGLE_CLIENT_ID` missing on Render |
| Razorpay window never opens | Keys missing or wrong on Render |
| Payment fails after the window | `RAZORPAY_KEY_SECRET` does not match the key id |
| CORS error in the browser console | `CLIENT_URL` on Render does not exactly match the Vercel URL |
| Admin tab missing | `ADMIN_EMAIL` does not match the Google account you signed in with. Sign out and back in |
| First request takes a minute | Normal. Render free tier sleeps when idle |
