# ExamRoute

[![CI](https://github.com/dhruvikaabansal/ExamRoute/actions/workflows/ci.yml/badge.svg)](https://github.com/dhruvikaabansal/ExamRoute/actions/workflows/ci.yml)

A ride-pooling platform for exam-goers. Students from the same area heading to the same exam centre (JEE / NEET / CUET) get pooled onto a shared bus, with an auto-computed pickup route and departure time worked backwards from the exam's gate-close deadline — so nobody misses their exam.

**Live demo → [exam-route.vercel.app](https://exam-route.vercel.app)** · API → [examroute-api.onrender.com](https://examroute-api.onrender.com/api/health)

> Payments on the demo are simulated — no card is charged. Everything else behaves exactly as it would in production. The API sleeps on Render's free tier, so the first request takes ~30 seconds to wake it.

**MERN** · JWT + Google OAuth · Razorpay · Google Maps Directions · Leaflet

Runs end-to-end with only a MongoDB connection string and a JWT secret. Payments, maps, and email all have working offline fallbacks.

---

## Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [The routing engine](#the-routing-engine)
- [Design decisions worth asking about](#design-decisions-worth-asking-about)
- [Security model](#security-model)
- [Testing](#testing)
- [Environment variables](#environment-variables)
- [Deployment](#deployment)

Two companion documents: [`docs/TALKING-POINTS.md`](docs/TALKING-POINTS.md) for how to defend the design decisions, and [`docs/LAUNCH.md`](docs/LAUNCH.md) for the deploy and demo checklist.

---

## What it does

**Sign in with Google, and nothing else.** The ID token Google returns is verified server-side against our client id and exchanged for our own JWT, so every downstream route checks one kind of token and a Google outage cannot invalidate a session already in progress. New to JWT? See [`docs/JWT.md`](docs/JWT.md).

**Real exam data.** Eight exams and 25 sittings seeded with their actual patterns — both JEE Main sessions, JEE Advanced with its two compulsory papers, NEET as a single afternoon shift, CUET subject-wise across three days, plus REET, RPSC RAS and CLAT — across 22 real Rajasthan exam cities. An `Exam` is the umbrella; each individual sitting is an `ExamSession` (one date + one shift), because that is the unit a student actually travels to.

**Booking and payment.** Pick a date and shift, add seats for parents or guardians, see a distance-based **subsidised** fare, and pay via Razorpay with server-side signature verification. Fares are always computed on the server from validated coordinates — the client never sends a price.

**Cancellation and refunds.** Cancelling releases the seat and issues a real Razorpay refund, tiered by how close the exam is — full more than 72 hours out, half inside that, none in the last 24 since the seat can no longer be resold. The student is shown the exact amount *before* confirming, and a refund that fails at the gateway is recorded and surfaced to the admin rather than lost.

**Geofenced pickup stops.** Each home is matched to the nearest stop *within its catchment zone* using a MongoDB `$near` query against a `2dsphere` index. Zones are drawn on a Leaflet / OpenStreetMap map, so no paid maps key is needed to see them.

**Routing engine.** Clusters paid students into buses that fit within seat capacity, orders each bus's stops via Directions optimised waypoints, and works backwards from the exam's reporting time to produce a departure time and a per-stop pickup schedule. Overnight departures from far towns are detected and labelled.

**QR e-ticket and boarding.** Every paid booking gets a QR ticket. Staff scan it, see the passenger and roll number, check the admit card, and mark them boarded. The application / roll number is **required** on every booking and validated server-side — boarding is a human comparing that number to an admit card, so a paid seat nobody can verify at the door is worse than no seat. It lives on the booking rather than the profile because it is issued per exam: a JEE application number is not a NEET one.

**Live bus tracking.** The driver opens a link that shares the bus's GPS; students watch it move on a live map. The driver needs no account — see [the security model](#security-model).

**Admin.** Run routing per date and shift, see every bus with its route, seat load and driver link, and work a **boarding list** per bus — every passenger grouped by pickup stop in the order the bus visits them, ticked off as they arrive, so at departure you know exactly who has not shown up.

> **On identity verification (worth raising before you are asked):** no third party can *digitally* confirm that someone is a genuine exam candidate. Only NTA can, and there is no public API. The only real digital path is **DigiLocker**, which requires partner-organisation onboarding that a student project cannot obtain. So ExamRoute uses honest layers instead: email OTP (deters throwaway signups), real payment (skin in the game), and a **human admit-card check at boarding** via the QR. The app verifies the *ticket*; a person verifies the *person*.

---

## Quick start

### 1. Prerequisites

- Node.js 18+
- A MongoDB connection string (Atlas free tier is fine)

Optional, and only to enable those specific features: Google OAuth credentials, a Razorpay test account, a Google Maps Platform key.

### 2. Install

```bash
npm run install:all
```

### 3. Configure

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Fill in `MONGO_URI` and `JWT_SECRET` in `server/.env`, and `VITE_GOOGLE_CLIENT_ID` in `client/.env` with a matching `GOOGLE_CLIENT_ID` on the server — Google is the only way to sign in, so nothing works without it. Set `ADMIN_EMAIL` to the address you will sign in with and that account becomes an admin automatically. Everything else can stay blank.

```bash
# generate a secret
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Seed

```bash
npm run seed        # 8 exams, 25 sittings, 22 centres, 44 pickup stops
npm run seed:demo   # ~120 paid demo students across 12 feeder towns
```

### 5. Run

```bash
npm run dev
```

- API → http://localhost:5000
- App → http://localhost:5173

### 6. Walk the demo

1. **Sign in with Google**, using the address you set as `ADMIN_EMAIL` so you get admin rights.
2. **Book a seat** — pick a sitting, drop a home pin, choose companions, see the subsidised fare, and pay. With no Razorpay keys a local run confirms instantly; with test keys you get the real checkout (card `4111 1111 1111 1111`, any future expiry, any CVV).
3. **Admin → Run routing engine** on the first JEE sitting the demo seeded. Jaipur draws about 190 seats against a 40-seat capacity, so it forms five buses — and each one serves a corridor out of the city rather than an arbitrary group: the northern towns together, the eastern together, the south-western together, and one bus for the students who live at the centre itself.
4. **Copy a driver link** from the bus card and open it in a private window — no login. Hit **Simulate driving**.
5. **Track bus live** from the student's My Bookings page and watch the bus move.
6. **Show QR ticket**, open the verify link, and mark the passenger boarded.

---

## Architecture

```
ExamRoute/
├── server/
│   └── src/
│       ├── index.js              # bootstrap: env checks, DB, listen, graceful shutdown
│       ├── app.js                # the Express app (built separately so tests can mount it)
│       ├── config/db.js
│       ├── models/               # User, Exam, ExamSession, Center, Stop, Booking, Bus
│       ├── middleware/
│       │   ├── auth.js           # JWT, role gates, driver capability tokens
│       │   ├── rateLimit.js
│       │   └── errorHandler.js   # the single place failures become responses
│       ├── controllers/
│       ├── routes/index.js
│       ├── services/
│       │   ├── routingEngine.js  # cluster → snap → order → time
│       │   ├── clustering.js     # k-means + sweep, chosen by measured cost
│       │   ├── stopService.js    # geofenced $near stop assignment
│       │   ├── mapsService.js    # Directions, with a 2-opt/Or-opt offline router
│       │   ├── paymentGateway.js # one place that decides if payments are real
│       │   └── mailer.js
│       ├── utils/                # time (IST), validate, fare, refundPolicy,
│       │                         # apiError, asyncHandler
│       └── seed/
└── client/
    └── src/
        ├── pages/                # Login, Exams, BookExam, Confirmation, MyBookings,
        │                         # Profile, Admin, Manifest, VerifyTicket,
        │                         # DriverPage, TrackBus, NotFound
        ├── components/           # MapView, LocationPicker, AddressSearch, Navbar,
        │                         # DemoBanner, ErrorBoundary
        ├── context/AuthContext.jsx
        ├── lib/                  # payments, IST formatting
        └── api/client.js
```

### Data model

`Exam` → many `ExamSession` (one date + one shift). A `Booking` belongs to a user, an exam, a session, and a centre. The routing engine reads paid bookings for one session and produces `Bus` documents, each holding an ordered route with pickup times and the passengers assigned to it.

A booking is unique per `{user, session}` at the database level, so double booking is impossible even under a race.

---

## The routing engine

For one session, per exam centre:

1. **Cluster** paid students into buses that each fit within seat capacity.
2. **Snap** each student to a pickup stop, using the same geofenced lookup that ran at booking time.
3. **Order** the stops. With a Maps key, Directions is called with `optimize:true` — but note that it only reorders the *intermediate* waypoints; origin and destination are fixed. So the origin is chosen deliberately as the stop furthest from the centre, since the bus starts at the far end of the corridor and works inward. Passing whichever stop happened to come first made the result optimal only relative to an arbitrary start. Without a key, the offline path runs nearest-neighbour construction followed by **2-opt and Or-opt** local search: 2-opt reverses a segment to remove crossings, Or-opt lifts a run of one to three stops out and reinserts it elsewhere. They fix different failures, so both run until neither can improve the route.
4. **Time** the trip: `departure = arrivalTarget − totalTravel`, and each stop's pickup follows from the cumulative leg durations.

Solving Vehicle Routing from scratch is NP-hard. Clustering geographically and delegating stop ordering to Directions is correct, explainable, and more than adequate at this scale.

### Two clustering strategies, chosen by measurement

k-means minimises distance to a centroid, so it favours round blobs. But the best possible bus route is the opposite shape — a corridor of students strung along one highway, which is a *high variance* cluster and exactly what k-means tries to avoid. On the seeded Jaipur cohort it produced routes about 30% longer than necessary.

So the engine also builds a **sweep**: sort every student by the angle at which they sit around the exam centre, walk that circle, and cut a new bus each time the next student would not fit. Each bus serves a wedge radiating outward, which is the shape a feeder route actually has. Where the sweep starts changes the result, so every starting angle is tried.

Neither strategy wins everywhere, so both are built and **scored on what they would cost to drive** — bus count first, kilometres second, because no amount of shaved distance pays for an extra driver and vehicle. The cheaper one is used. On cohorts from 60 to 400 students this is consistently 10–18% shorter than k-means alone, and by construction it can never be worse.

Scoring uses a cheaper local search than the final routes do. Choosing between clusterings only needs the ranking to be right, not each candidate's exact optimum, and running the full search on every candidate took seconds at a few hundred students — far too slow for an admin pressing a button.

### Capacity-aware clustering

Plain k-means groups students by where they live, which is what makes a sensible route — but it says nothing about how many people land in each group. Choosing `k = ceil(totalSeats / capacity)` only fixes the bus *count*: the split can still land 55 seats on one bus and 5 on another.

So clustering runs in two phases:

- **Shape** — k-means with farthest-point seeding groups students geographically. Seeding matters: bookings arrive in clumps, so seeding from the first *k* points would pick near-identical centroids and converge badly. Farthest-point seeding is deterministic, so the same input always produces the same routes.
- **Repair** — any cluster over capacity gives up its most *peripheral* member (farthest from that cluster's centroid) to the nearest cluster with room, or to a new bus if none has room. Evicting the peripheral member rather than a central one avoids tearing a hole in the middle of an otherwise tight route.

Every move strictly decreases total overflow, so the loop terminates, and the capacity invariant is asserted before the result is returned. `tests/clustering.test.js` covers this directly, including the pathological case where every student lives at the same coordinates and only the repair phase can enforce capacity.

### Arrival timing

Two constraints, and the engine honours the tighter one:

- `reportingTime` — the officially recommended arrival, usually ~2 hours before the paper. This is the target.
- `gateClose` — the hard deadline. The engine keeps a safety buffer behind it and never plans later.

Long routes from far towns legitimately depart the previous evening. Those buses are flagged `isOvernight` so the UI can label them, rather than showing a date that looks like a bug.

### Two clocks per stop

Every stop carries two times. `pickupTime` is when the bus is physically there — it falls straight out of the route arithmetic, and it is what the driver and the boarding list work from. `boardBy` is what the passenger is told, and it is deliberately `BOARDING_BUFFER_MIN` earlier (10 by default, which is what intercity operators actually print).

The first version published one number for both, so a ticket read "be at your stop by 07:10" above "bus departs 07:10" — a schedule that only holds if nobody is ever thirty seconds late. And the cost of waiting is not paid by the person who is late: a bus that waits two minutes at each of six stops reaches the centre twelve minutes behind, for all forty people aboard, on the morning of an exam with a hard gate-close time.

The buffer is a promise to the passenger, not slack in the route — departure, leg durations and arrival are untouched. A test pins exactly that, because the obvious wrong implementation subtracts the buffer from the departure time and makes the whole schedule drift ten minutes earlier on every re-run.

### Known limitation: passenger ride time is not in the objective

Clustering scores candidate solutions on **bus count first, kilometres second**. That is the right economic objective — no amount of shaved distance pays for an extra driver and vehicle — but it contains no term for how long any individual passenger sits on the bus.

The consequence is visible in the seeded data: a bus can pick up at Jhunjhunu, detour east through Alwar and Dausa, and reach Jaipur in 6h20 when the direct journey from Jhunjhunu is about 3h. Nothing is wrong; the first-pickup town simply rides the whole corridor.

The fix would be to weight the cost function by passenger-minutes rather than bus-kilometres, or to add a hard maximum ride time and accept an extra bus when it saves three hours for nine people. That is a deliberate next step, not an oversight — it trades cost against comfort, and which way to trade is an operator's decision rather than a programmer's.

---

## Design decisions worth asking about

**Why no Vehicle Routing solver?** It is NP-hard, and Directions already solves the sub-problem that matters (ordering ~5–10 stops) with real road data. Clustering plus delegation gets a correct answer in milliseconds and can be explained on a whiteboard.

**Why is the fare subsidy larger for longer journeys?** That is the entire social point. Students from far-off small towns have the longest and costliest journeys, so subsidy rises 5% per 50 km of distance up to a 50% cap. Companions pay a full seat but receive the same subsidy.

**Why 50 km bands and not 25?** Because the first version used 25 km, which put the 50% ceiling at 250 km — and almost nobody in this system travels less than that. Rajasthan is roughly 800 km across with sparse exam centres, so a real home-to-centre leg is 150–550 km. Every single passenger hit the cap, which meant a graduated social policy behaved as a flat half-price discount: the tapering existed in the code and was invisible in every fare the app had ever quoted. Widening the band moves the ceiling to 500 km, so the curve now spans the distances people actually travel — about 5% from the next district, 25% from across the state, 50% only for the extreme journeys the cap was written for. The test asserts a *distribution* rather than a formula: an ordinary intercity journey must land strictly below the cap, and a spread of real distances must produce visibly different rates. A curve that collapses to a flat discount fails it.

**Why store exam times as UTC instants built from IST components?** Because `date.setHours(9)` encodes the *server's* timezone. That is correct on a laptop set to IST and silently wrong on a UTC host, where a 9:00 AM shift becomes 09:00Z and renders as 2:30 PM to a student in India. `utils/time.js` builds every exam time from explicit IST components; the client formats everything back to `Asia/Kolkata`. The test suite runs with `TZ=UTC` so a regression fails a test instead of surviving to production.

**Why does the routing engine re-run the same stop lookup instead of caching stops in memory?** Because the booking screen and the routing engine must never disagree about a student's pickup stop. They previously used two different algorithms — an indexed `$near` geofence at booking time, an in-memory haversine scan at routing time — so the stop shown on a confirmation page could silently change. One function, one answer; a few dozen indexed queries per centre is a price worth paying for that.

**Why is routing idempotent?** An admin will click the button twice. Re-running deletes the session's buses and resets its bookings before rebuilding, so no booking is ever left pointing at a bus that no longer exists.

**Why mock modes for maps and email but not payments?** Maps and email degrade a feature; a faked payment fakes the feature. So the first two fall back silently and the project still runs with nothing but a database URL, while simulated payment confirmation is refused outside development with no override at all. There used to be one — `ALLOW_MOCK_PAYMENTS=true`, for a public demo with no gateway — and it was removed: an endpoint that marks a booking paid for free should not be one environment variable away from being live, and "somebody typed it deliberately" is thin comfort when the typing is copying a variable list into a dashboard. Razorpay **test keys** are free, need no KYC, and exercise the genuine checkout, order ids and signatures. Only the money is fake, which is the right thing to fake.

**Why is Google the only way to sign in?** There was a second path — email and password, with a six-digit OTP to prove the address, and a reset flow on the same machinery. Codes came from `crypto.randomInt`, were stored as bcrypt hashes, capped at five attempts and rate limited per address and per IP. It was careful, and it was undeliverable: free hosting tiers block outbound SMTP, and HTTP mail providers will not send to strangers from an unverified sender, so on the deployed site the code was generated, hashed and stored correctly and then went nowhere. An auth path that cannot deliver its own credential is not an auth path, it is a form that traps people. Google verifies the address, holds the password and handles recovery — and the side effect is that this application now stores no credential of any kind. There is no password to leak, no code to brute force and no reset flow to abuse.

**Why does cancellation succeed even when the refund fails?** Because they are two systems and only one of them is ours. The seat is released and saved first; the gateway call happens after. If Razorpay times out, the worst case is a booking marked `refundStatus: 'failed'` with the amount owed — visible on the admin screen for a human to settle. Doing it the other way round means either holding a seat the student believes they cancelled, or refunding someone who still has a booking. An inconsistency you can see and fix beats one nobody knows about.

---

## Security model

**Drivers need no account at all.** That is where the access separation actually matters, and it is the part that is real: a driver is authorised by a random per-bus token, not by a login. `student` and `admin` are the account roles; boarding is an admin action. A `conductor` role existed but was removed — it was only reachable by an admin granting it, so operations ran boarding anyway, and an account type nobody is ever given is surface to maintain rather than protection.

**Drivers authenticate with a capability link, not an account.** Each bus carries a random 24-byte token. The link authorises exactly one bus and exactly two actions: read its route, report its position. A driver needs no credentials, and a leaked link is revoked by rotating the token from the admin page. This replaced a design where the "driver link" only worked for someone holding the admin password.

**Tickets are readable by their owner or staff.** A ticket token being hard to guess is not authorisation — students share ticket screenshots, and the URL is printed under the QR code. Passenger phone numbers are returned only to staff.

**We store no credentials.** Sign-in is Google only, and a Google ID token is verified against our own client id before it is exchanged for our JWT — the audience check matters, because a token minted for any other application would otherwise be accepted here, and those tokens are handed to every site a user signs into. Nothing on a user record is secret. The strongest thing you can say about a password database is that you do not have one.

**Payments are verified server-side.** The Razorpay signature is recomputed with an HMAC and compared in constant time, and the order id must be the one issued for that specific booking — a signature Razorpay genuinely produced for a *different* order must not settle this one, or a single real payment could be replayed across every seat an attacker owns. Trusting the browser's "payment succeeded" callback would make the payment step decorative. Simulated confirmation is refused outside development, with no override.

**Input is validated before it reaches the database.** Coordinates must be a well-formed `[lng, lat]` pair inside India — unchecked coordinates are really an unchecked price, since fare is derived from distance, and they previously allowed `NaN` to be persisted. Ids are validated before querying, so a malformed id is a 400 rather than a cast error.

**Async errors always produce a response.** Express 4 ignores rejected promises from async handlers, which turns any thrown error into a hung request. Every controller is wrapped once, centrally, so no handler can be registered unwrapped.

Also: `helmet`, an explicit CORS allowlist (no `*` fallback), a 100 kB body limit, rate limiting on the sign-in and driver routes, and boot-time refusal to start without `JWT_SECRET`.

**Known trade-off:** the JWT is stored in `localStorage`, which is XSS-exposed. An httpOnly cookie with CSRF protection would be stronger; `localStorage` was chosen for a simpler SPA flow and is the honest answer if asked.

---

## Testing

```bash
cd server
npm test            # everything
npm run test:watch
```

Two layers:

- **Unit** (`clustering`, `time`, `fare`, `refundPolicy`, `app.smoke`) — no infrastructure, runs anywhere. Covers the capacity invariant, IST construction, the fare model, the refund tiers, and that the app boots and every route module imports.
- **Integration** (`routingEngine`, `api`) — runs against a real MongoDB, because much of the behaviour under test *is* database behaviour: the `2dsphere` index behind `$near`, the unique index that prevents double booking, and Mongoose casting. A stubbed driver would agree with whatever the code expected and prove nothing.

The integration layer uses `mongodb-memory-server` by default, or an existing instance:

```bash
MONGO_TEST_URI="mongodb://127.0.0.1:27017" npm test
```

If neither is reachable, the integration specs skip with a visible warning rather than failing the build with an infrastructure error that looks like a code defect.

That is the right default on a laptop and the wrong one in CI, where it would produce a green badge for a run in which the entire integration layer never executed. So CI sets `REQUIRE_DB=1`, which turns a missing database from a footnote into a failure. Worth knowing if you ever see the suite pass suspiciously fast: check whether it actually ran, or merely declined to.

Notable cases: buses are never overfilled even when every student lives at the same point; routing is idempotent and leaves no orphaned bookings; a student cannot read another student's booking or ticket; a rotated driver link stops working; bookings are refused after the deadline; malformed coordinates are rejected rather than stored as `NaN`; refunds are monotonic in time and never exceed what was paid; the boarding buffer moves the passenger's time without moving the bus's; and the subsidy curve must still discriminate between real distances rather than handing everyone the cap.

### CI

`.github/workflows/ci.yml` runs on every push and pull request: the server suite against a real MongoDB 7 service container — so the integration layer actually runs in CI rather than skipping — and a production client build. `TZ=UTC` is set explicitly, because the timezone bug this project fixed only reproduces when the host clock is not IST.

---

## Environment variables

Only `MONGO_URI` and `JWT_SECRET` are required — the server refuses to start without them. See [`server/.env.example`](server/.env.example) and [`client/.env.example`](client/.env.example) for the annotated list.

| Fallback when unset | Behaviour |
|---|---|
| `GOOGLE_MAPS_API_KEY` | Straight-line distance estimates and nearest-neighbour stop ordering |
| `RAZORPAY_KEY_ID/SECRET` | Mock payment flow **in development only** — required in production |
| `RESEND_API_KEY` / `SMTP_*` | OTPs and confirmations printed to the server console |
| `GOOGLE_CLIENT_ID` | Google sign-in hidden; email + password still works |

The policy numbers all live in the environment, because they are business decisions rather than constants:

| Variable | Default | What it decides |
|---|---|---|
| `BUS_CAPACITY` | 40 | Seats per bus; companions count toward it |
| `SAFETY_BUFFER_MIN` | 60 | Never plan to arrive later than gate close minus this |
| `BOARDING_BUFFER_MIN` | 10 | How early passengers are asked to be at their stop |
| `GEOFENCE_RADIUS_KM` | 5 | Catchment radius around each pickup stop |
| `SUBSIDY_BAND_KM` | 50 | Distance that earns one more band of subsidy |
| `SUBSIDY_PER_BAND_PCT` | 5 | Subsidy added per band — so the 50% cap arrives at 500 km |
| `FULL_REFUND_HOURS` | 72 | Cancel earlier than this for a full refund |
| `PARTIAL_REFUND_HOURS` | 24 | Inside this, nothing is refundable |
| `PARTIAL_REFUND_PCT` | 50 | The refund between those two thresholds |

---

## Deployment

- **Frontend** → Vercel. Set the root directory to `client`; [`client/vercel.json`](client/vercel.json) supplies the build config and the SPA rewrite (without it, deep links like `/verify/:token` 404 on refresh). Set `VITE_API_URL` to the deployed API.
- **Backend** → Render. [`render.yaml`](render.yaml) is a blueprint: New → Blueprint → point it at this repo. `JWT_SECRET` is generated by Render rather than chosen by a human; `MONGO_URI`, `CLIENT_URL` and `ADMIN_EMAIL` are prompted on first deploy.
- **Database** → MongoDB Atlas. Allow Render's outbound IPs, or `0.0.0.0/0` on the free tier.

Two things to get right, both of which fail quietly if you don't:

- `NODE_ENV=production` — blocks mock payments, enforces a 32-character minimum on `JWT_SECRET`, and stops index reconciliation on every boot.
- `CLIENT_URL` — the exact origin of the deployed frontend. There is no wildcard CORS fallback, so a wrong value fails visibly in the browser instead of silently opening the API to everyone.

**Email will not work over SMTP on a free tier.** Render, Fly and Railway all block outbound ports 25, 465 and 587 as an anti-spam measure, so correct Gmail credentials still produce `Connection timeout` on every send — the port is shut, not the password wrong. This is worth knowing because it fails in the most misleading way possible: the credentials check out, the config looks right, and the only symptom is silence. Set `RESEND_API_KEY` instead and mail goes over HTTPS like any other request. `GET /api/health` reports which transport is in use and the last delivery error, so the answer to "did that email actually send?" is one request away rather than a guess.

Note that Resend's shared `onboarding@resend.dev` sender is a sandbox: it only delivers to the address the Resend account was created with, and returns 403 for anyone else. Reaching real visitors means verifying a domain you own. Where that is not available, the app degrades honestly instead of silently — the send fails, health reports it, and the sign-up screen tells the visitor to use Google sign-in rather than wait for a code that cannot arrive.

---

## License

MIT
