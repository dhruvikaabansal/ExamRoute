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

Two angles. Pick one — posting both is worse than posting either.

**A** leads with the engineering mistake. Best reach with engineers, and the
strongest signal for hiring, because it shows you can find a bug in something
that was already working.

**B** leads with the problem. Broader reach, more shares outside tech.

---

### Option A — "it was working, and it was wrong" (recommended)

```
My routing engine was working perfectly. It was also completely wrong.

I built ExamRoute to pool students travelling to the same exam centre onto shared buses. Group students by where they live, order the stops, work out when the bus leaves.

I used k-means for the clustering. Textbook choice.

Then I looked at an actual route on a map.

k-means minimises distance to a centre point, so it makes round clusters. Neat little blobs.

But a good bus route isn't a blob. It's a corridor — students strung out along one highway, all the way from a far town into the city.

In k-means terms, that's a high-variance cluster. Exactly the shape it is built to avoid.

The algorithm wasn't buggy. It was optimising the wrong thing.

The fix was a sweep: sort every student by the angle they sit at around the exam centre, walk the circle, and start a new bus whenever the next student won't fit. Each bus ends up serving a wedge radiating outward, which is what a feeder route actually looks like.

The part I'm most pleased with is that I didn't pick one.

Neither wins everywhere. So the engine builds both, scores them on what they would actually cost to drive — bus count first, kilometres second, because no amount of shaved distance pays for an extra driver and vehicle — and uses the cheaper one.

10–18% shorter routes across cohorts from 60 to 400 students. And it can never be worse than k-means, because k-means is one of the candidates.

Three other things I had shipped and had to fix:

Every fare came back at exactly 50% subsidy. The rate was meant to rise with distance, but the cap arrived at 250 km and almost nobody in Rajasthan travels less than that. A graduated policy that quoted a flat discount to everyone.

Tickets read "be at your stop by 07:10" directly above "bus departs 07:10". Zero buffer. A schedule that only holds if nobody is ever thirty seconds late — and the cost of waiting is paid by the forty people who were on time.

Sign-up emailed a verification code that could never arrive, because free hosting tiers block outbound SMTP. I deleted the whole path rather than ship a form that traps people.

None of these were crashes. Everything looked fine. They only showed up when I checked output I had assumed was correct.

Built with React, Node, Express and MongoDB. Razorpay in test mode, 150+ tests running against a real database in CI.

Live demo and code in the comments — there's a guest login, so you can try it without signing in.
```

---

### Option B — "the 4am bus" (broader reach)

```
A student in Jhunjhunu sitting an exam in Jaipur has to be inside the hall by 9 AM.

That means leaving around 4 AM. There is no bus at 4 AM.

So families hire a car they can't really afford, or the student travels the night before and sleeps at the bus stand.

Rajasthan's state transport already recognises this — RSRTC gives competitive exam candidates free travel, and from this year they have to register 36 hours in advance. The problem is real enough to have a government portal.

What nobody does is the hard part: turning who booked into which buses run.

That's what I built.

ExamRoute takes everyone travelling to the same exam centre for the same shift, groups them into buses that fit the seats, orders each bus's stops, and works backwards from the exam's reporting time to decide when it leaves. Fares fall as distance rises, because the students with the longest journeys are usually the ones least able to pay.

The interesting problem turned out to be the clustering. k-means makes round clusters, but a good bus route is a corridor along one highway — the exact shape k-means avoids. So the engine also builds a sweep, scores both on what they'd cost to drive, and picks the cheaper. 10–18% shorter.

The part I can't automate is identity. No public API confirms someone is a genuine exam candidate — only NTA knows, and DigiLocker needs partner onboarding a student project can't get. So the app verifies the ticket, and a person checks the admit card at the bus door. An honest boundary beats security theatre.

React, Node, Express, MongoDB. Razorpay in test mode, 150+ tests in CI.

Live demo and code in the comments — guest login, no sign-up needed.
```

---

### Posting mechanics — these matter more than the words

**Put the links in the first comment, not the post.** LinkedIn suppresses reach
on posts with external links. Post it, then immediately comment with the live
URL and the repo.

**Attach the demo video directly.** Native video outranks a link to one, and it
is the thing that makes someone stop scrolling. If the video isn't ready, a
single screenshot of the admin routing screen with five buses works.

**First three lines are all most people see.** Both drafts front-load a hook
before the "see more" cut. Don't add a preamble above it.

**Reply to every comment in the first two hours.** Early engagement is most of
what decides how far it travels.

**Tags:** three or four, no more.
`#webdevelopment #mern #algorithms #opensource`

**Timing:** Tuesday to Thursday, 9–11 AM IST is the usual advice for Indian
professional audiences. Avoid Friday evening and weekends.

**Tag people, not companies.** If a professor, a senior or a friend genuinely
helped, name them. Tagging companies you have no relationship with reads as
spam and gets muted.

## 5. Before an interview

Re-read `docs/TALKING-POINTS.md`. Rehearse the demo in section 11 of that
file until it takes five minutes without hesitation, and have the two failure
cases ready: `/api/bookings/garbage` returning a clean 400, and opening
another student's ticket returning a 403.
