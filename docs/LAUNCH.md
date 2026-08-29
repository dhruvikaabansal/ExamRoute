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

Shows the product. Earlier drafts led with a story and compressed the whole
build into "drop a pin and book a seat" — which could describe anything, and
gave a reader no reason to believe there was much behind it.

Arrows scan faster than paragraphs, so this reads shorter than it counts. No
markdown: LinkedIn renders none. No state named — that is seed data.

```
The exam starts at 9 AM. The gate shuts at 8:30 and never opens again. If you live 300 km away and no bus arrives in time, being prepared stops mattering.

So I built ExamRoute — students heading to the same exam centre get pooled onto one shared bus.

What it actually does:

→ Pick your exam, date and shift, and enter the roll number off your admit card
→ Search your address or tap the map — it matches your nearest pickup stop inside a 5 km catchment, and says so plainly if you fall outside every zone
→ See the fare broken down before you pay: distance, base fare, subsidy, total
→ The subsidy rises with distance, because the students travelling furthest usually have the least to spend
→ Pay through Razorpay, signature verified server-side. Cancel and the refund is tiered by how close the exam is — and shown to you before you confirm, not after

Then bookings close, and nobody presses anything:

→ A routing engine groups every paid student for that centre into 40-seat buses
→ Orders each bus's pickup stops
→ Computes the departure time backwards from the minute that gate shuts
→ Your ticket reads: be at your stop 06:50 · bus arrives 07:00 · reaches the centre 09:00

On the morning, staff open a boarding list — every passenger grouped by stop, in the order the bus drives them, ticked off as they arrive, so at departure they know exactly who is missing. The driver opens a link that needs no login and shares GPS. You watch the bus move on a map.

The part I'm proudest of:

I grouped students with k-means. It makes round clusters. But a bus route isn't round — it's a corridor strung along one highway, which is exactly the shape k-means avoids.

The code wasn't buggy. It was optimising the wrong thing.

So the engine builds a second grouping by sweeping angles around the centre, scores both on what they would cost to drive, and uses the cheaper one. 10–18% shorter routes.

React · Node · Express · MongoDB · Razorpay · Leaflet · 150+ tests against a real database in CI

Live demo and code in the comments — guest login, no sign-up.

#WebDevelopment #MERN #Algorithms #SoftwareEngineering
```

**Why arrows**

Two scannable blocks — what the student does, what the system does — let a
recruiter get the surface area in about eight seconds without reading a
sentence. The specifics are the point: "5 km catchment", "40-seat buses",
"06:50 · 07:00 · 09:00", "refund shown before you confirm". Those are checkable
and concrete. "Seamless booking experience" is not.

The k-means passage stays last, for the engineer they forward it to.

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
