# Launch kit — deploy, record, post

Everything needed to get ExamRoute live and on LinkedIn. Not part of the app.

---

## 1. Push what's here

```bash
git push origin main
```

Five commits are waiting. Check the Actions tab afterwards — CI runs the full
suite against a real MongoDB, so the 47 integration tests that skip on your
laptop actually execute there. **A green badge on the repo is worth more than
any paragraph of the README**, because it is the one claim a stranger can
verify in two seconds.

Add the badge to the top of `README.md` once the first run passes (replace the
username if your repo lives elsewhere):

```markdown
[![CI](https://github.com/dhruvikaabansal/ExamRoute/actions/workflows/ci.yml/badge.svg)](https://github.com/dhruvikaabansal/ExamRoute/actions/workflows/ci.yml)
```

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
| 0:55–1:30 | Admin → Run routing engine, buses appear | "55 seats, 40-seat buses — the engine splits them and orders every stop" |

> **Pick the right sitting or nothing appears.** The demo seed puts all ~49
> paid students on the **first JEE sitting** — Shift 1, 9 AM, the earliest
> date in the list — travelling to the **Jaipur** centre. Selecting any other
> exam or shift gives you "No paid bookings to route", which looks like a
> broken app on camera. Select it once before you start recording.

| 1:30–1:50 | Driver link in a private window, Simulate driving | "The driver needs no account — one link, one bus" |
| 1:50–2:10 | Student's Track bus page, bus moving | "Students watch it move in real time" |
| 2:10–2:30 | QR ticket → conductor boards them | "The app verifies the ticket. A human verifies the person." |

The routing-engine moment is the one to hold on. Everything else is a booking
flow anyone has seen; the bus split is the part that shows engineering.

---

## 4. The LinkedIn post

Post the video natively (uploaded to LinkedIn, not a YouTube link — native
video gets shown to far more people). Put the repo link in the **first
comment** if you want reach, or in the post if you care more about clicks
than impressions.

### Draft

> Students sitting JEE, NEET or CUET often have to reach an exam centre in
> another city by 7 AM. Public transport doesn't run to exam timings, so
> families end up hiring a taxi they can't really afford, or leaving at 3 AM
> and hoping.
>
> I built ExamRoute to pool them onto shared buses.
>
> You book a seat for a specific date and shift. The system finds your nearest
> pickup stop. Once bookings close, a routing engine groups students into
> buses, orders the pickup stops, and computes the departure time by working
> *backwards* from the exam's gate-close deadline — so the bus is planned
> around the exam, not the other way round.
>
> Fares are subsidised more heavily the further you're travelling. That's the
> point of the whole thing: the students with the longest journeys are usually
> the ones least able to pay for them.
>
> The part I learned the most from wasn't the routing. It was this:
>
> I sized the buses as k = ceil(total seats / capacity) and ran k-means on
> home locations. Correct arithmetic, completely insufficient. K-means groups
> students geographically — it has no concept of capacity. With 60 students
> and 40-seat buses you get 2 buses, and the split can land 55 and 5. The
> admin screen would happily print "55/40 seats" and nothing would stop it.
>
> The fix is a repair pass: any over-capacity cluster gives up its most
> *peripheral* member — the student farthest from that cluster's centre — to
> the nearest bus with room. Evicting a central student would tear a hole in
> the middle of an otherwise tight route. Every move strictly reduces total
> overflow, so it terminates, and the capacity invariant is asserted before
> the result is returned.
>
> One thing I decided not to fake: there's no way to digitally verify that
> someone is a real exam candidate. Only NTA knows, and there's no public API.
> So instead of a fake "verified ✓" badge, the app verifies the *ticket* via
> QR, and a conductor checks the admit card against the name on screen. The
> app verifies the ticket; a person verifies the person.
>
> MERN, JWT + Google OAuth, Razorpay with server-side signature verification,
> Google Maps Directions, MongoDB 2dsphere geo-queries. 105 tests, integration
> layer running against a real MongoDB in CI.
>
> Code and a full write-up of the decisions in the comments. Feedback welcome —
> especially from anyone who has actually run bus operations.

### Shorter version, if the above feels long

> Students travelling to JEE/NEET/CUET often have to reach a centre in another
> city by 7 AM, and public transport doesn't run to exam timings.
>
> ExamRoute pools them onto shared buses. Book a seat for a date and shift, get
> matched to your nearest pickup stop, and a routing engine works *backwards*
> from the exam's gate-close deadline to compute the departure time and every
> pickup along the way. Fares are subsidised more heavily the further you
> travel — the longest journeys usually belong to the families least able to
> afford them.
>
> The lesson that stuck: k-means grouped students geographically but had no
> concept of bus capacity, so a "2 buses for 60 students" split could land 55
> and 5. Fixed with a repair pass that moves the most peripheral student out of
> any overfull bus — peripheral, because evicting a central one tears a hole in
> the route.
>
> MERN · JWT + Google OAuth · Razorpay · Maps Directions · 105 tests. Repo below.

### Notes on posting

- **Don't lead with the tech stack.** Lead with the 7 AM problem. The stack is
  the last line for a reason — everyone has a MERN project, not everyone has a
  reason for one.
- **The bug is the hook.** Recruiters and engineers both stop scrolling for
  "here's what I got wrong", and almost nobody posts it.
- **Tag nothing and no one** unless you actually know them.
- Best times are usually Tuesday–Thursday morning IST.
- Expect "how do you stop fake bookings?" in the comments — the DigiLocker
  answer is in `docs/TALKING-POINTS.md`, section 2.

---

## 5. Before an interview

Re-read `docs/TALKING-POINTS.md`. Rehearse the demo in section 11 of that
file until it takes five minutes without hesitation, and have the two failure
cases ready: `/api/bookings/garbage` returning a clean 400, and opening
another student's ticket returning a 403.
