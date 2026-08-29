# Launch kit — deploy, record, post

Everything needed to get ExamRoute live and on LinkedIn. Not part of the app.

---

## 1. Push, and check CI

```bash
npm --prefix server test
git push origin main
```

144 tests, of which 55 are integration tests against a real MongoDB. CI runs
them with `REQUIRE_DB=1`, so it cannot quietly pass by skipping the layer that
matters. **A green badge is worth more than any paragraph of the README** — it
is the one claim a stranger can verify in two seconds, and it is already wired
into the top of the file.

---

## 2. Deploy (about 40 minutes, all free tier)

**Database — MongoDB Atlas.** Free M0 cluster. Under Network Access add
`0.0.0.0/0` (the free tier gives Render no fixed egress IP). Copy the
connection string.

**API — Render.** New → Blueprint → point at the repo; `render.yaml` does the
rest. You will be prompted for `MONGO_URI`, `CLIENT_URL`, `ADMIN_EMAIL`.
Leave `CLIENT_URL` as a placeholder for now — you don't have the Vercel URL
yet. Free instances sleep after 15 minutes of no traffic and take ~50 seconds
to wake, so **hit the URL once before any demo or interview**.

**Frontend — Vercel.** Import the repo, set the root directory to `client`,
add `VITE_API_URL=https://your-api.onrender.com/api`. Deploy.

**Then go back to Render** and set `CLIENT_URL` to the exact Vercel origin
(`https://examroute.vercel.app`, no trailing slash). CORS has no wildcard
fallback, so a wrong value here means every request fails in the browser —
this is the single most common way this deploy goes wrong.

**Seed it.** From the Render shell, or locally against the Atlas URI:

```bash
cd server && MONGO_URI="<atlas uri>" npm run seed && MONGO_URI="<atlas uri>" npm run seed:demo
```

Then sign up with the `ADMIN_EMAIL` address so you have admin rights on the
live site. The OTP prints to the Render logs.

> The seed builds exam dates relative to today, so the live demo never goes
> stale. Re-run it if the seeded sittings ever drift into the past.

---

## 3. Record the demo (2–3 minutes, no voiceover needed)

Silent screen capture with short text captions travels better on LinkedIn
than narration — most people watch with sound off. Record at 1280×720 or
larger, then trim hard.

| Time | Show | Caption |
|---|---|---|
| 0:00–0:15 | Exam list → pick a JEE sitting | "Pick your exam date and shift" |
| 0:15–0:40 | Drop a home pin, add a companion, fare appears | "Fare is distance-based — and the subsidy grows the further you travel" |
| 0:40–0:55 | Pay, confirmation with pickup stop + map | "Nearest pickup stop, geofenced to your area" |
| 0:55–1:30 | Admin → Run routing engine, buses appear | "150 seats, 40-seat buses — four routes, each serving one corridor out of the city" |

> **Pick the right sitting or nothing appears.** The demo seed puts all ~120
> paid students on the **first JEE sitting** — Shift 1, 9 AM, the earliest
> date in the list — travelling to the **Jaipur** centre. Selecting any other
> exam or shift gives you "No paid bookings to route", which looks like a
> broken app on camera. Select it once before you start recording.

| 1:30–1:50 | Driver link in a private window, Simulate driving | "The driver needs no account — one link, one bus" |
| 1:50–2:10 | Student's Track bus page, bus moving | "Students watch it move in real time" |
| 2:10–2:30 | Boarding list → tick a passenger aboard | "Staff board from a manifest, like a real operator — you can see who is still missing" |

The routing-engine moment is the one to hold on. Everything else is a booking
flow anyone has seen; the bus split is the part that shows engineering.

---

## 4. The LinkedIn post

Opens on a person, not a project. Walks the product the way a student would
actually meet it, and saves the algorithm for last — by then the reader cares
what it is for.

No markdown: LinkedIn renders none of it. Structure comes from short lines and
white space.

No mention of any one state. That is seed data for the MVP, and naming a state
makes a national problem sound like a local pilot.

```
A student in a small town is assigned an exam centre 300 km away.

The paper starts at 9 AM. The gate shuts at 8:30 and does not open again.

No bus gets her there in time. So she travels overnight, alone, and hopes.

Thousands of students do this for every major exam. Some of them don't make it — not because they weren't prepared, but because of a bus.

I spent this year building ExamRoute so that getting there is never the reason.

Here is what it does.

You book a seat, not a bus.

Pick the exam, the date, the shift. Drop a pin where you live. Add seats if a parent is coming with you. You get a fare and your nearest pickup point, matched by a geospatial query against every stop whose catchment zone covers your home.

The fare falls as the distance rises.

That sounds backwards. It is the entire point. The students travelling furthest usually have the least to spend, so the subsidy grows with the journey.

Then the buses form themselves.

When bookings close, a routing engine takes everyone travelling to the same centre, groups them into buses that fit the seats, works out the order of pickup stops, and computes the departure time backwards from the moment the exam gate shuts.

Nobody presses a button. It runs on the deadline.

On the morning, you get a QR ticket. Staff scan it, then check your admit card against the name on screen — the app verifies the ticket, a person verifies the person. No software can confirm someone is a genuine exam candidate, and pretending otherwise would be theatre.

Then you watch the bus move on a map until it reaches you.

The hardest thing I learned building it:

I grouped students with k-means. Textbook choice. It produced neat round clusters.

But a good bus route isn't round. It's a corridor — students strung along one highway, from a far town into the city. In k-means terms that is a high-variance cluster, which is exactly the shape it exists to avoid.

The code wasn't buggy. It was optimising the wrong thing.

So the engine now builds a second grouping by sweeping angles around the exam centre, scores both on what they would actually cost to drive, and uses the cheaper one.

10–18% shorter routes. And it can never lose to k-means, because k-means is one of the candidates.

React · Node · Express · MongoDB · Razorpay · 150+ tests against a real database in CI

Live demo in the comments — there's a guest login, so you can try it without signing up.
```

**Why it is shaped like this**

- The first three lines are all anyone sees before "see more". A student and a
  closing gate is a situation; "excited to share my project" is not.
- The middle walks the product in the order a user meets it, so a non-technical
  reader stays in and an engineer sees the surface area — geospatial matching,
  scheduling, payments, QR boarding, live tracking — without a feature list.
- Two lines do the emotional work: the subsidy rising with distance, and the
  human admit-card check. Both are decisions with a reason, which is what makes
  them memorable rather than impressive.
- The algorithm lands last, when the reader already cares what it is for.
- No hashtag wall, no emoji, no "thrilled to announce" — all three read as
  performance rather than work.

### Posting mechanics — these decide reach more than the words do

**Links in the first comment, never in the post.** LinkedIn throttles anything
that sends people off-platform. Post, then immediately comment with the live URL
and the repo. Single biggest lever.

**Upload the demo video natively.** A link to a video is worth a fraction of the
video itself. If it is not ready, one screenshot of the admin screen with five
buses and their routes drawn works — that image is the whole pitch.

**Reply to every comment in the first two hours.** Early engagement decides how
far it travels. Block out the time before you post.

**Three or four tags, no more:** `#webdevelopment #algorithms #mern #opensource`

**Tuesday to Thursday, 9–11 AM IST.** Avoid Friday evening and weekends.

**Tag people who actually helped, never companies you have no relationship
with.** The second reads as spam and gets muted.

## 5. Before an interview

Re-read `docs/TALKING-POINTS.md`. Rehearse the demo in section 11 of that
file until it takes five minutes without hesitation, and have the two failure
cases ready: `/api/bookings/garbage` returning a clean 400, and opening
another student's ticket returning a 403.
