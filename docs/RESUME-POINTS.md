# ExamRoute — resume points

## LaTeX, three bullets (the version to use)

```latex
\resumeProjectHeading
{\textbf{ExamRoute} -- Ride-Pooling Platform for Exam Candidates $|$ \emph{React, Node.js, Express, MongoDB}}
{\href{https://exam-route.vercel.app/}{\underline{Live}}}
\resumeItemListStart
\resumeItem{Built a full-stack MERN platform pooling students into shared buses for exam centres, covering booking, payment, seat allocation, boarding, and live tracking.}
\resumeItem{Built a routing engine that groups nearby students into buses and finds the shortest stop order for each, cutting travel distance 10--18\% compared to basic clustering.}
\resumeItem{Back-computed pickup/departure times from each exam's reporting deadline; integrated Razorpay with \textbf{server-side HMAC signature verification}, Google OAuth exchanged for backend-issued JWTs, and MongoDB \texttt{2dsphere} geo-queries for nearest-stop matching.}
\resumeItemListEnd
```

Optional fourth line, if the page has room — it is the strongest single
signal of engineering discipline in the whole project:

```latex
\resumeItem{Covered the system with \textbf{150+ unit and integration tests} running against a real MongoDB in GitHub Actions CI; deployed on Render and Vercel.}
```

---


Every number here is real and checkable from the repo. Nothing is padded,
because the fastest way to lose an interview is to be asked about a metric you
invented.

---

## Full version (6 bullets — use as your flagship project)

**ExamRoute — Ride-pooling platform for exam candidates**
*React, Node.js, Express, MongoDB · [Live](https://exam-route.vercel.app) · [GitHub](https://github.com/dhruvikaabansal/ExamRoute)*

- Built a full-stack MERN application that pools students travelling to the same exam centre onto shared buses — covering booking, payment, seat allocation, boarding and live tracking end to end.
- Designed the routing engine that groups students into capacity-limited buses and orders each bus's stops, combining k-means clustering with a sweep algorithm and 2-opt local search to cut total route distance by 10–18% over clustering alone.
- Scheduled every bus backwards from the exam's reporting time, so departures and per-stop pickup times are computed automatically and each bus reaches the centre before the gate closes.
- Implemented the Razorpay payment flow with server-side HMAC signature verification, order-to-booking matching and a time-tiered refund policy; built authentication with Google OAuth exchanged for backend-issued JWTs.
- Used MongoDB geospatial queries (`2dsphere`, `$near`) to match each student's home location to the nearest pickup stop inside a 5 km catchment zone.
- Wrote 150+ unit and integration tests running against a real MongoDB in GitHub Actions CI; deployed the API on Render and the frontend on Vercel.

---

## Short version (3 bullets — when space is tight)

**ExamRoute — Ride-pooling platform for exam candidates**
*React, Node.js, Express, MongoDB · [Live](https://exam-route.vercel.app) · [GitHub](https://github.com/dhruvikaabansal/ExamRoute)*

- Built a full-stack MERN application that pools students heading to the same exam centre onto shared buses — booking, payment, routing, boarding and live tracking.
- Designed the routing engine that assigns students to capacity-limited buses and orders each route, combining k-means clustering with a sweep algorithm and 2-opt local search to cut total distance by 10–18%.
- Implemented Razorpay payments with server-side signature verification, secured the API with Google OAuth and JWTs, and backed it with 150+ tests running in GitHub Actions CI.

---

## One-liner (for a LinkedIn headline or a project list)

Ride-pooling platform for exam candidates — MERN, with a custom bus-routing engine that clusters students by location and schedules departures backwards from the exam's gate-close time.

---

## Where each number comes from

Keep this to hand. If an interviewer asks, you want the answer immediately.

| Claim | Source |
|---|---|
| 10–18% shorter routes | Measured against k-means alone on cohorts of 60–400 students; the engine scores both strategies and picks the cheaper, so it can never be worse |
| 150+ tests | `server/tests/` — 153 cases across unit and integration layers |
| Real MongoDB in CI | `.github/workflows/ci.yml` runs a `mongo:7` service container with `REQUIRE_DB=1` |
| 5 km catchment | `GEOFENCE_RADIUS_KM`, enforced by a `$near` query with `$maxDistance` |
| Backwards scheduling | `computeArrivalTarget` honours the tighter of `reportingTime` and `gateClose − SAFETY_BUFFER_MIN` |

## The Razorpay question — know the honest answer

Say **"implemented"**, not *"processed payments"* or *"handled transactions"*.
The difference is real and an interviewer will find it.

**What is true:** the full Razorpay flow is written — order creation, the
checkout handoff, HMAC-SHA256 signature verification compared in constant time,
the order-id-to-booking match that stops one real payment settling a different
seat, and refunds through the Razorpay API. It is covered by tests that forge
genuine signatures with the same crypto Razorpay uses, so the accept path and
every reject path actually execute.

**What is not true:** no money has ever moved through it. The public demo runs
with `ALLOW_MOCK_PAYMENTS=true` because there are no live keys on it, and the
banner on the site says so.

**If asked "did you test it against Razorpay?"** — the honest answer, which is
also a good one:

> The gateway itself, no — I never put live keys on the demo, so payments there
> are simulated and the site says so. What I did test is the part that is
> actually mine to get wrong: the signature verification. The signature is an
> HMAC of `order_id|payment_id` keyed on the API secret, so I could sign
> legitimate ones in the tests and prove that a genuine signature is accepted, a
> forged one is refused, one signed with the wrong secret is refused, and a
> genuine signature for a *different* order cannot settle this booking. That
> last one matters most — Razorpay really did sign it, so only my own check
> stops it being replayed.

That answer is stronger than a claim of having taken real payments, because it
shows you know which part of the integration is the security boundary.

If you want to remove the caveat entirely, sign up for Razorpay test mode (free,
no live money), put the test keys in `server/.env`, and complete one booking
locally. Ten minutes, and then "tested end to end against Razorpay test mode" is
simply true.

---

## Two things worth having ready

Interviewers push on the strongest claim, so rehearse these:

**"Why not just use k-means?"** — k-means minimises distance to a centroid, so it makes round clusters. The best bus route is the opposite shape: a corridor of students strung along one highway, which is a high-variance cluster and exactly what k-means avoids. So the engine also builds a sweep — sort students by their angle around the centre and cut a bus each time the next one will not fit — then scores both on what they would actually cost to drive and uses the cheaper.

**"What would you do differently?"** — The clustering scores bus count first, kilometres second, with no term for how long any individual passenger sits on the bus. So the first town on a long corridor can ride the whole detour: a 3-hour journey becomes 6. The fix is to weight the objective by passenger-minutes, or cap ride time and accept an extra bus. Naming this yourself is much stronger than being caught by it.
