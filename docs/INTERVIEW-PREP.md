# ExamRoute — interview prep

A drill sheet, not a reference. `PROJECT-BRIEF.md` is the full explanation; this
is for the week before an interview.

The answer pointers are deliberately **pointers, not scripts**. Memorised
paragraphs sound memorised. Know the three beats and build the sentence live.

---

## 1. What this project is

### In plain language

Students sitting big competitive exams often get assigned an exam centre in a
different city — sometimes 300 or 400 km away. The exam hall gate shuts half an
hour before the paper starts and does not reopen, so arriving even slightly late
means losing the whole year. Public buses don't run on a schedule that gets you
there by 8:30 in the morning, so students travel overnight, alone, often to a
city they've never visited.

ExamRoute puts the students who are going to the same place on the same bus.

You say which exam you're sitting, which date and shift, and where you live. The
site works out your nearest pickup point and what the seat costs — and the fare
goes *down* the further you're travelling, because the students coming furthest
usually have the least money. You pay, and then you wait.

Once bookings close, the site does the clever bit on its own: it looks at
everyone who has paid for that exam centre, decides how many buses are needed,
works out which pickup stops each bus should visit and in what order, and then
counts *backwards* from the moment the exam gate shuts to decide what time each
bus must leave. Nobody presses a button — it happens on the deadline.

On exam morning you get a QR code. Staff scan it, check it against your admit
card, and tick you off a list. You watch the bus move on a map until it reaches
your stop.

### The technical version

**The problem.** This is a **Vehicle Routing Problem with capacity and time
windows**, wrapped in a booking product. Given *N* students at known coordinates
who have paid for a given exam sitting at a given centre, partition them into
buses of at most 40 seats, determine each bus's stop sequence, and compute a
departure time such that every bus arrives before the exam's gate-close time.
VRP is NP-hard, so the engine uses construction heuristics plus local search
rather than an exact solver.

**Stack.**

| Layer | Choice |
|---|---|
| Frontend | React 18, Vite, Tailwind, React Router (code-split routes) |
| Maps | Leaflet + OpenStreetMap |
| Backend | Node, Express 4 |
| Database | MongoDB Atlas with `2dsphere` geospatial indexes |
| Payments | Razorpay (orders + HMAC signature verification + refunds) |
| Auth | Google OAuth ID token → own JWT |
| Testing | Vitest + Supertest, real MongoDB in CI |
| Hosting | Render (API) + Vercel (SPA) |

**Architecture.** Layered monolith, not microservices — deliberately.
`controllers/` handle HTTP and validation only; `services/` hold the logic
(`clustering`, `routingEngine`, `routingScheduler`, `mapsService`, `stopService`,
`paymentGateway`); `models/` are Mongoose schemas; `utils/` are pure functions
(fare, refund policy, IST time construction, validators).

**Core flow.**

```
Book      → validate coords + roll number → check sitting open → check centre has seats
          → computeFare() server-side → assignStop() via indexed $near
          → Booking{status: pending}

Pay       → POST /payments/order (Razorpay order)
          → checkout in browser
          → POST /payments/verify → HMAC check + order-id match → status: paid

Route     → scheduler sees booking deadline has passed
          → acquire lock on the sitting (atomic findOneAndUpdate)
          → cluster (k-means + sweep, scored, cheaper wins)
          → snap each student to a stop (same lookup as booking time)
          → order stops (Directions optimize, or offline 2-opt + Or-opt)
          → departure = arrivalTarget − totalTravel
          → Bus documents created, bookings → status: assigned

Board     → QR → staff scan → human checks admit card → boarded flag
Track     → driver's device posts GPS via capability link → student polls it
```

**My contribution.** Solo project, built end to end — data modelling, the
routing engine and its clustering strategies, the Express API, the React
frontend, the Razorpay integration, the test suite and CI, and the deployment.
The design decisions in §6 of `PROJECT-BRIEF.md` are the ones I made and can
defend.

---

## 2. Elevator pitch (~40 seconds)

Say this, then stop.

> ExamRoute is a ride-pooling platform for students travelling to competitive
> exams. The problem is that exam centres are often in another city, the hall
> gate shuts thirty minutes before the paper and never reopens, and public
> transport doesn't line up with that — so students travel overnight, and some
> genuinely miss exams because of transport rather than preparation.
>
> A student books a seat for a specific exam date and shift and drops a pin on
> where they live. Once bookings close, a routing engine takes everyone heading
> to the same centre, groups them into buses that fit the seats, orders each
> bus's pickup stops, and works the departure time *backwards* from the gate-close
> deadline.
>
> It's MERN — React, Express, MongoDB — with Razorpay for payments and Google
> OAuth for sign-in. The interesting part is the clustering: I started with
> k-means and found it was optimising the wrong shape, which I'm happy to go
> into.

That last clause is bait. It hands them the question you most want to be asked.

---

## 3. Interview questions

### Basic / clarifying

1. What problem does ExamRoute solve, and who is it for?
2. Walk me through what a student actually does on the site.
3. Why does routing happen after bookings close instead of when someone books?
4. Why does the fare go *down* as distance goes up?
5. What's the difference between an `Exam` and an `ExamSession` in your model?
6. How does a student know which bus and which stop is theirs?
7. Does anything like this already exist? Why build it?
8. What does the admin actually do in this system?

### Technical deep-dive

**Algorithm**

9. How do you decide how many buses to create?
10. Why did k-means not work, and what did you replace it with?
11. How do you choose between the two clustering strategies?
12. What's the time complexity of your routing run?
13. Is the output deterministic? Why does that matter?
14. How do you order the stops within a single bus?
15. What's 2-opt, and why do you also need Or-opt?
16. How do you compute the departure time?

**Data & database**

17. Why MongoDB and not PostgreSQL?
18. How does the nearest-stop lookup work? What index backs it?
19. What indexes do you have and why?
20. How do you store exam times given IST vs UTC?

**Concurrency & correctness**

21. Two students book the last seat at the same moment — what happens?
22. Two admins trigger routing simultaneously — what happens?
23. Someone pays *after* routing has already run. Then what?
24. What if the routing process crashes halfway through?
25. Is your routing idempotent? Is idempotent the same as thread-safe?

**Payments & security**

26. How do you know a payment actually succeeded?
27. Why constant-time comparison for the signature?
28. A student sends a valid Razorpay signature from a different order — does it work?
29. How do drivers authenticate with no account?
30. Where do you store the JWT, and is that safe?
31. How do you stop a student paying a fare they chose themselves?

**Scale & operations**

32. What breaks first at 100× the traffic?
33. How would you scale the routing engine?
34. How do you test something as stateful as routing?
35. Why does your CI need a real database?

### Behavioural

36. What was the hardest bug you hit?
37. Tell me about a time you had to throw away working code.
38. What's the biggest limitation of what you built?
39. What would you do differently if you started again?
40. How did you decide what *not* to build?
41. Was there a point where you realised your approach was wrong?

### Depth checks (the ones that test real understanding)

42. Open the routing engine and walk me through it line by line.
43. If I changed `BUS_CAPACITY` from 40 to 30, what happens — and where in the code?
44. Why is the boarding buffer subtracted from the *stop arrival* and not from the departure time?
45. Your repair phase evicts the "most peripheral" member. Why that one and not a random one?
46. What happens if every student in a cohort lives at the exact same coordinates?
47. Why is `refundStatus` a separate field from `status`?
48. Show me a test you wrote and explain what it would catch.

---

## 4. Answer pointers

Three beats each. Build the sentences live.

**Q1 — What problem** · Gate shuts and never reopens → transport doesn't align →
students travel overnight and some miss exams. Name that the problem is
officially recognised (state transport runs free travel schemes for exam
candidates), then say what's missing: nobody *forms* buses from demand.

**Q2 — Student journey** · Book a sitting (date + shift) and drop a pin → get
fare and nearest stop immediately → pay → bus is assigned after bookings close →
QR at the door, live map on the day. Keep it to five steps.

**Q3 — Why batch** · You can't pool people who haven't booked. Assign at booking
time and bus 1 is "the first forty who clicked" — chronological, not geographic.
The batch is forced by the problem; the *trigger* was the only real choice, and
it's now the deadline, not a person.

**Q4 — Inverted subsidy** · It's the social point, not a bug. Longest journeys
cost most and are taken by those least able to pay. 5% per 50 km, capped at 50%.
Bonus: mention the band used to be 25 km and everyone hit the cap, so a
graduated policy quoted a flat discount — good self-audit story.

**Q5 — Exam vs ExamSession** · Exam is the umbrella (JEE Main 2026). Session is
one date + one shift — that's what a student travels to. JEE runs three dates ×
two shifts = six different journeys with six different departure times.

**Q6 — Which bus is mine** · Stop is assigned at booking (geofenced lookup), bus
appears after routing. Ticket shows boardBy / bus arrival / centre arrival. Say
these are two distinct clocks and why.

**Q7 — Does it exist** · Yes, partly — ExamBus.in sells exam-day tickets,
Eduride matches candidates with volunteers, state transport runs free schemes.
None of them do the routing. That's the gap.

**Q8 — Admin's role** · Less than you'd think, deliberately. Routing is
automatic; the button is an override. Humans do the two things software
shouldn't: the admit-card check at boarding, and settling failed refunds.

**Q9 — Bus count** · `ceil(totalSeats / capacity)` for initial k. Then
immediately say that only fixes the *count* — k-means has no capacity concept,
so 60 seats over 2 buses can land 55/5. Repair phase fixes the balance.

**Q10 — k-means failure** · It minimises distance to a centroid → round blobs. A
good bus route is a corridor along one highway → high variance → exactly what
k-means avoids. "The code wasn't buggy, it was optimising the wrong shape."

**Q11 — Choosing a strategy** · Build both, score both on projected driving
cost, use the cheaper. Bus count first, kilometres second — no distance saving
pays for an extra driver and vehicle. Can never be worse than k-means since
k-means is a candidate.

**Q12 — Complexity** · k-means O(n·k·i); sweep O(n log n) for the sort, tried
from every start; 2-opt O(n²) per pass but n is 5–10 stops per bus, not 500.
Sub-second for a few hundred students. Mention you score with a *cheaper* local
search than the final routes use, because ranking only needs order to be right.

**Q13 — Determinism** · Yes — farthest-point seeding instead of random. Same
cohort always produces the same buses. Matters for demos and for debugging: a
routing bug you can't reproduce is one you can't fix.

**Q14 — Stop ordering** · With a Maps key, Directions with `optimize:true`.
Without, nearest-neighbour construction then 2-opt + Or-opt. Mention the origin
must be the *farthest* stop from the centre, because Directions only reorders
intermediate waypoints.

**Q15 — 2-opt vs Or-opt** · 2-opt reverses a segment to remove crossings;
Or-opt lifts a run of 1–3 stops and reinserts it elsewhere. They fix different
failures, so both run until neither improves.

**Q16 — Departure time** · `departure = arrivalTarget − totalTravel`. Arrival
target is the *tighter* of reportingTime and gateClose − safety buffer. Mention
overnight departures are detected and labelled rather than looking like a bug.

**Q17 — MongoDB** · Geospatial is first-class — one indexed `$near` with
`$maxDistance`. Data is document-shaped: a bus holds an ordered array of stops
with times. Then concede: PostGIS would work, and I'd want real transactions
around the routing rebuild in production.

**Q18 — Nearest stop** · `$near` against a `2dsphere` index with `$maxDistance`
= 5 km catchment. Key detail: if nothing is in range it falls back to nearest
anywhere **and flags it**, so the UI can warn instead of pretending a 60 km stop
is convenient.

**Q19 — Indexes** · `2dsphere` on stops, centres, user homes, booking homes.
Unique compound on (user, session) so one student can't hold two seats on one
sitting. Index on driverToken for the capability lookup.

**Q20 — IST** · Times are built from explicit IST components into UTC instants.
`setHours(9)` encodes the *server's* zone — right on an IST laptop, wrong on a
UTC host where 9 AM becomes 2:30 PM for the student. Tests run `TZ=UTC` so a
regression fails a test.

**Q21 — Last seat race** · Trick question — there is no last seat at booking
time. Booking writes a row and never touches a bus, so there's no counter to
race on. Buses are formed later from all paid bookings at once.

**Q22 — Two admins routing** · One wins, one gets 409. Single conditional
`findOneAndUpdate`, atomic on one document. Say why a read-then-write would let
both through.

**Q23 — Late payment** · Attached to a bus that already stops where they live
and has room. No stop added, no published time moved. Explain the *reason*: a
pickup time already given to forty people is a promise.

**Q24 — Crash mid-run** · Lock carries a timestamp and expires after five
minutes, otherwise a killed process leaves that exam permanently unroutable.
Routing is idempotent so a re-run rebuilds cleanly.

**Q25 — Idempotent vs thread-safe** · Different things, and say so crisply.
Idempotent = re-running *after* is fine. Thread-safe = re-running *during* is
fine. The first is design, the second needed the lock.

**Q26 — Payment verification** · Razorpay signs HMAC of `order_id|payment_id`
with the API secret. Recomputed server-side, compared constant-time, plus the
order id must be the one I issued for that booking. Browser callbacks aren't
trusted.

**Q27 — Constant time** · Normal comparison returns early on the first differing
byte, leaking how much of a guess was right via timing. Also mention
`timingSafeEqual` throws on length mismatch, so length is checked first —
otherwise a short signature is a 500 on attacker-controlled input.

**Q28 — Valid signature, wrong order** · Rejected. This is the best one to
volunteer: Razorpay *genuinely signed it*, so the signature check alone passes.
Only the order-id match stops one real payment being replayed across every seat.

**Q29 — Driver auth** · Capability link — random 24-byte per-bus token
authorising exactly two actions on exactly one bus. Same model as a "anyone with
the link" share. Bounded blast radius, revocable by rotating. Say what it
replaced: a design where the driver link needed the admin password.

**Q30 — JWT storage** · localStorage, XSS-exposed, httpOnly cookie + CSRF would
be stronger. Deliberate trade for SPA simplicity. Volunteer it — claiming full
security is what gets you picked apart.

**Q31 — Fare tampering** · The client never sends a price. Fare is derived
server-side from validated coordinates, so tampering changes a location, not an
amount. Coordinates are shape- and range-checked (they previously allowed `NaN`
to persist).

**Q32 — What breaks at 100×** · Routing is the CPU-bound part and runs in the
API process. Stop lookup is one indexed query per booking — fine. The sweeper
timer in-process is the real design smell at scale.

**Q33 — Scaling routing** · Embarrassingly parallel — it's per sitting per
centre. Move to a worker queue, one job per centre. Beyond a few thousand
students per centre, swap heuristics for OR-Tools.

**Q34 — Testing routing** · Properties, not exact outputs: capacity never
exceeded even when every student shares coordinates, nobody lost, re-running
leaves no orphans, combined strategy never worse than k-means, same cohort →
same buses. Against a real MongoDB.

**Q35 — Real DB in CI** · Because much of what's tested *is* database
behaviour — the `2dsphere` index, the unique index, Mongoose casting. Then the
good bit: the suite used to skip 47 integration tests and exit green, so CI now
sets `REQUIRE_DB=1` to turn a missing database from a footnote into a failure.

**Q36 — Hardest bug** · Pick one, tell it as a story. Best option: Express 4
ignores rejected promises from async handlers, so a malformed id hung the
request until timeout — a bad URL could take down the API. Fixed by wrapping
every controller once, centrally.

**Q37 — Throwing away working code** · The k-means story. Emphasise that nothing
was broken — it was correct k-means producing correct clusters — and the problem
was only visible once you looked at a route on a map.

**Q38 — Biggest limitation** · Clustering scores bus count then kilometres, with
no term for passenger ride time. So the first town on a long corridor can ride
the whole detour — a 3-hour trip becomes 6. **Say this before they find it.**

**Q39 — Do differently** · Postgres + PostGIS for real transactions around the
routing rebuild; routing in a worker rather than the API process; ride time in
the objective function.

**Q40 — What not to build** · Good answer: email. It couldn't be delivered
reliably without a verified domain, and a confirmation that silently doesn't
arrive is worse than none — the student stops looking and starts waiting. So the
ticket lives in the app instead.

**Q41 — Approach was wrong** · Either k-means, or the auth one: a whole
OTP system, carefully built with hashed codes and attempt caps, deleted because
it couldn't deliver the code. Both show you'll bin your own work.

**Q42 — Walk the code** · Have the file open. Read the four stages in order:
cluster → snap → order → time. Don't narrate syntax; narrate decisions.

**Q43 — Capacity 40 → 30** · `BUS_CAPACITY` env var, read in `routingEngine`.
More buses via `ceil(totalSeats/capacity)`, repair phase evicts more, and the
seat cap per centre tightens since it's `fleet × capacity`.

**Q44 — Buffer placement** · It's a promise to the passenger, not slack in the
route. Subtract it from *departure* and the whole schedule drifts 10 minutes
earlier on every re-run. There's a test pinning exactly that.

**Q45 — Peripheral eviction** · Evicting a central member tears a hole in the
middle of an otherwise tight route. The peripheral one is geometrically cheapest
to give away. Also: every move strictly decreases overflow, so it terminates.

**Q46 — Everyone at the same point** · Pathological case, and there's a test for
it. k-means can't separate identical points, so only the repair phase can
enforce capacity — which is exactly why repair exists as a separate phase.

**Q47 — refundStatus separate** · Releasing a seat and returning money are two
systems and only one is ours. A refund can fail at the gateway long after the
seat is gone. Conflating them into one enum loses the "cancelled but still owed"
state, which is money nobody can see.

**Q48 — A test** · Pick the racing-routing one or the wrong-order-signature one.
Say what it would catch if someone removed the guard.

---

## 5. Red flags to avoid

**1. Saying "I used k-means" and stopping there.**
Naming an algorithm is not understanding one. If you can say *why* it was wrong
here — round clusters versus corridors — you're in the top few percent. If you
can only name it, the next question exposes that fast.

**2. Buzzwords you can't unpack.**
Don't say "scalable", "optimised" or "microservices architecture" (it isn't —
it's a layered monolith, and that was the right call). If you say "geospatial
query", be ready for "which index, and what does `$near` do without it?" Every
term you use is a door you're inviting them to open.

**3. Claiming everything works perfectly.**
This reads as either inexperience or dishonesty. You have genuinely good
material here — the ride-time limitation, localStorage and XSS, the in-process
scheduler, no real VRP solver. Volunteering one of these is the single strongest
move in the conversation.

**4. Reciting a memorised paragraph.**
Interviewers can hear it, and it kills follow-ups because there's nowhere to go.
Know the three beats per answer and build the sentence in the room. The pointers
above are deliberately incomplete for this reason.

**5. Padding the numbers.**
Every figure you quote is checkable: 40 seats, 5 km, 10–18%, 156 tests. Don't
round 10–18% up to "20%" and don't say "thousands of users" — there are none,
it's a demo with seeded data. One inflated number and everything else you said
gets re-examined.

**6. Not being able to run it.**
Have the live site open in a tab before the call, and have the API already woken
up — Render's free tier sleeps, and a 30-second blank screen at the wrong moment
is a bad look. If you blank, screen-share Admin → **Run routing engine** and let
five buses draw themselves on maps.

---

## One honest note on authorship

If you're asked whether you used AI assistance: say yes, plainly. It's near
universal now and not disqualifying. What *is* disqualifying is claiming
otherwise and then not being able to explain your own code — and the depth
checks in §3 are exactly how that gets found out.

The defensible and true position: you scoped it, made the design decisions, found
the bugs, and understand every part of it. That's what the questions above
actually test. Work through §3 with the files open until each answer is yours,
and the question stops mattering.
