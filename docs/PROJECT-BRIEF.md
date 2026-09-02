# ExamRoute — the complete brief

Everything about this project in one place: what it is, how it is built, why
each decision was made, what to say in an interview, and what you will be asked.

Read sections 1–4 to understand the project. Read 9–11 the night before an
interview.

**Live:** https://exam-route.vercel.app · **Code:** https://github.com/dhruvikaabansal/ExamRoute

---

## Contents

1. [The problem](#1-the-problem)
2. [What the product does](#2-what-the-product-does)
3. [Architecture](#3-architecture)
4. [The routing engine](#4-the-routing-engine-the-core)
5. [Every other subsystem](#5-every-other-subsystem)
6. [Decisions worth defending](#6-decisions-worth-defending)
7. [Bugs found and fixed](#7-bugs-found-and-fixed)
8. [Testing and CI](#8-testing-and-ci)
9. [The interview script](#9-the-interview-script)
10. [Interview questions and answers](#10-interview-questions-and-answers)
11. [Numbers to remember](#11-numbers-to-remember)

---

## 1. The problem

A student sitting a national competitive exam — JEE, NEET, CUET, a state
recruitment paper — is assigned an exam centre. Often it is in another city,
150 to 500 km away.

Three facts make this hard:

- **The gate closes and does not reopen.** A 9 AM paper typically closes its
  gate at 8:30. Arriving at 8:31 means the year is gone.
- **Public transport does not align with exam timings.** To be inside a hall by
  8:30 in a city 300 km away, you must travel overnight.
- **The students travelling furthest are usually the least able to pay for it.**
  A private taxi solves the problem for people who were never really stuck.

So candidates travel overnight, often alone, often having never been to that
city. Some do not make it — not because they were unprepared, but because of
transport.

**The problem is real and officially recognised.** State transport corporations
run free travel schemes for competitive exam candidates on production of an
admit card, and one has recently added a mandatory online registration portal
with a 36-hour cutoff. Partial products exist too: ExamBus.in sells tickets for
exam-day buses, and Eduride (built by IIT students and alumni) matches
candidates with volunteer drivers.

**What nobody does is the hard part** — forming buses out of demand. Existing
solutions sell seats on fixed routes or match people one to one. None of them
take a pool of students and work out what buses should exist, which stops each
one should visit, in what order, and when it must leave.

That gap is what ExamRoute fills.

---

## 2. What the product does

### The student's journey

1. **Sign in** with Google, or press *Explore with a guest account* for a
   throwaway identity with no sign-up at all.
2. **Set a home location** once — search an address or tap a map. The pin and
   the text stay in sync, because the pin is what fare and pickup are computed
   from.
3. **Browse exams.** Each exam has multiple *sittings* — a specific date plus a
   shift, because that is the unit a student actually travels to. JEE Main runs
   several dates with two shifts each; those are different journeys.
4. **Book a seat**: pick the sitting, pick the exam centre, enter the roll number
   from the admit card, add seats for a parent or guardian if needed.
5. **See the fare before paying** — distance, base fare, subsidy percentage,
   total. The subsidy *rises* with distance.
6. **Pay** through Razorpay. The signature is verified server-side.
7. **Get a pickup stop** immediately — the nearest one whose 5 km catchment zone
   covers their home. If none does, the app says so plainly rather than
   pretending the nearest stop 60 km away is convenient.
8. **Wait.** The bus does not exist yet, and the confirmation screen says so and
   explains why.
9. **Once bookings close**, routing runs automatically. The ticket now reads:
   *be at your stop 06:50 · bus arrives 07:00 · reaches the centre 09:00*.
10. **On the day**: show a QR ticket at the bus door, watch the bus move on a
    live map.
11. **Cancel any time** and see the exact refund before confirming.

### The operator's side

- **Boarding list per bus** — every passenger grouped by pickup stop, in the
  order the bus drives them, ticked off as they arrive. At departure you know
  exactly who has not shown up, with a phone number to call them.
- **Admin console** — every bus with its route drawn on a map, seat load bars,
  and a driver link. Routing can be re-run manually as an override.
- **Driver page** — opened from a link with no account at all. Shares GPS.

---

## 3. Architecture

### Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind | SPA with code-split routes; Vite for fast builds |
| Maps | Leaflet + OpenStreetMap | No paid key needed to see maps and zones |
| Backend | Node + Express 4 | Simple REST; the complexity is in the services, not the framework |
| Database | MongoDB (Atlas) | Geospatial queries are first-class — `2dsphere` + `$near` |
| Payments | Razorpay | Standard in India; test mode is free and exercises the real flow |
| Auth | Google OAuth → own JWT | We store no credentials at all |
| Hosting | Render (API) + Vercel (frontend) | Free tiers, blueprint-based deploy |

### Folder structure

```
server/src/
  models/          Mongoose schemas — User, Exam, ExamSession, Center, Stop, Booking, Bus
  controllers/     HTTP layer: validate input, call a service, shape a response
  services/        The actual logic
    clustering.js       k-means + sweep + capacity repair
    routingEngine.js    orchestrates one routing run, holds the lock
    routingScheduler.js runs routing on a timer; attaches late payments
    mapsService.js      distances, travel times, 2-opt / Or-opt route ordering
    stopService.js      geofenced nearest-stop lookup
    paymentGateway.js   Razorpay config + refunds
  middleware/      auth (JWT + driver token), rate limits, central error handler
  utils/           fare, refund policy, IST time, validation, async wrapper
  seed/            real exam data + a demo cohort

client/src/
  pages/           one file per screen
  components/      MapView, LocationPicker, AddressSearch, NextStep, …
  context/         AuthContext — session state
  lib/             pay.js (Razorpay checkout), format.js (IST formatting)
```

### Data model

Seven collections. The one that matters most is the split between `Exam` and
`ExamSession`:

- **Exam** — the umbrella. "JEE Main 2026 Session 1". Has a `bookingDeadline`.
- **ExamSession** — one date + one shift. Has `examStart`, `gateClose`,
  `reportingTime`. **This is what a student books.**
- **Center** — an exam centre with a geo point.
- **Stop** — a pickup point with a geo point and a `2dsphere` index.
- **User** — name, email, googleId, phone, home location. **No credentials.**
- **Booking** — the join between a user and a sitting. Holds fare breakdown,
  home location, roll number, assigned stop, status, payment and refund state.
- **Bus** — created by routing. Holds an ordered `route[]` of stops with times,
  a passenger list, a driver token, and live GPS.

**Why Exam and ExamSession are separate:** JEE Main runs three dates with two
shifts each. Those are six different journeys with six different departure
times. Modelling them as one "exam" would make two entirely different sittings
indistinguishable — which is exactly the bug that appeared when booking cards
showed only "Shift 1" and no date.

### Booking status machine

```
pending ──pay──> paid ──routing──> assigned ──board──> (boarded flag set)
   │               │                  │
   └──── cancel ───┴──────────────────┘
                    ↓
                cancelled  (+ refundStatus: none | pending | processed | failed)
```

`refundStatus` is deliberately separate from `status`. Cancelling a seat and
refunding the money are two different systems, and only one of them is ours —
a refund can fail at the gateway long after the seat is released.

### Request flow (booking a seat)

```
Browser
  → POST /api/bookings          protect (JWT)
      → validate coordinates, roll number, companions
      → check the sitting is still open
      → check the centre has seats left
      → computeFare()           server-side, always
      → assignStop()            $near query, 5 km catchment
      → save Booking (pending)
  → POST /api/payments/order    creates a Razorpay order
  → [Razorpay checkout opens in the browser]
  → POST /api/payments/verify   HMAC signature check → status: paid
```

The client never sends a price. Fare is derived on the server from validated
coordinates, so tampering with the request changes a location, not an amount.

---

## 4. The routing engine (the core)

This is the part to know properly. Everything else in the project is
competent CRUD; this is the part that is actually a problem.

### What it has to solve

For one sitting, per exam centre:

> Given N students who have paid, each at a known location, form buses of at
> most 40 seats, decide which stops each bus visits and in what order, and
> compute a departure time such that every bus reaches the centre before the
> exam gate closes.

That is the **Vehicle Routing Problem**, which is NP-hard.

### The four stages

**1. Cluster** — group students into buses that fit capacity.

**2. Snap** — map each student to a pickup stop, using the *same* geofenced
lookup that ran at booking time, so the stop shown on the confirmation page can
never silently change.

**3. Order** — decide the visiting order of each bus's stops. With a Google
Maps key, Directions is called with `optimize:true`. Without one, an offline
path runs nearest-neighbour construction followed by **2-opt** and **Or-opt**
local search until neither improves.

**4. Time** — `departure = arrivalTarget − totalTravelTime`, then each stop's
pickup follows from cumulative leg durations.

### The insight worth telling

I first used **k-means** to cluster. Textbook choice, and it produced correct
k-means output.

Then I looked at a route on a map.

k-means minimises distance to a centroid, so it produces **round, compact
clusters**. But the best possible bus route is the opposite shape: a
**corridor** — students strung along one highway, from a far town all the way
into the city. In k-means terms that is a *high-variance* cluster, precisely
what the algorithm exists to avoid.

**The code was not buggy. It was optimising the wrong shape.**

So the engine also builds a **sweep**: sort every student by the angle at which
they sit around the exam centre, walk that circle, and start a new bus whenever
the next student would not fit. Each bus ends up serving a wedge radiating
outward — which is what a feeder route actually is. Where the sweep starts
changes the answer, so every starting angle is tried.

**And then I did not pick one.**

Neither wins everywhere. The engine builds both, **scores them on what they
would cost to drive** — bus count first, kilometres second, because no amount
of shaved distance pays for an extra driver and vehicle — and uses the cheaper.

Result: **10–18% shorter total distance** than k-means alone, on cohorts from 60
to 400 students. And by construction it can never be worse, because k-means is
one of the candidates.

### Capacity: the two-phase fix

Sizing `k = ceil(totalSeats / capacity)` is correct arithmetic and completely
insufficient. It fixes the bus *count* but nothing balances the split — 60 seats
with 40-seat buses gives k=2, and the split can land 55 and 5.

So clustering runs in two phases:

- **Shape** — k-means with **farthest-point seeding**. Seeding matters because
  bookings arrive in clumps: seeding from the first *k* points picks
  near-identical centroids and converges badly. Farthest-point seeding is also
  deterministic, so the same cohort always produces the same buses.
- **Repair** — any over-capacity cluster gives up its most **peripheral**
  member (farthest from that cluster's centroid) to the nearest cluster with
  room, or to a new bus if none has room.

*Why the peripheral member?* Evicting a central student tears a hole in the
middle of an otherwise tight route. The peripheral one is geometrically the
cheapest to give away.

*Why does it terminate?* Every move strictly decreases total overflow. The
capacity invariant is asserted before the result is returned.

### Timing: work backwards, honour the tighter constraint

Two constraints exist and the engine uses whichever is tighter:

- `reportingTime` — the officially recommended arrival, usually ~2 hours before
  the paper. This is the target.
- `gateClose` — the hard deadline. Never plan later than `gateClose − buffer`.

Long routes from far towns genuinely depart the previous evening. Those buses
are flagged `isOvernight` so the UI can label it, rather than showing a date
that looks like a bug.

### Two clocks per stop

Every stop carries two times:

- `pickupTime` — when the bus is physically there. Falls out of the route
  arithmetic. The driver and boarding list work from this.
- `boardBy` — what the passenger is told, ten minutes earlier.

The first version published one number for both, so a ticket read *"be at your
stop by 07:10"* above *"bus departs 07:10"*. That is a schedule that only holds
if nobody is ever thirty seconds late — and the cost of waiting is not paid by
the person who is late. A bus that waits two minutes at each of six stops
reaches the centre twelve minutes behind, for all forty people aboard.

The buffer is a **promise to the passenger, not slack in the route**: departure,
legs and arrival are untouched. A test pins that, because the obvious wrong
implementation subtracts the buffer from departure and makes the whole schedule
drift earlier on every re-run.

### When it runs

**On a time, not on a person.** A sweeper checks for sittings whose booking
window has closed and routes them. The admin button remains as an override.

*Why a batch at all?* Because you cannot pool students who have not booked yet.
Assigning a bus the moment someone pays makes bus 1 "the first forty people who
clicked" — a chronological group, not a geographic one, and the corridors stop
existing. **The batch is forced by the problem; only its trigger was a choice.**

*What about someone who pays after the buses are formed?* They join a bus that
already stops where they are and has room — no stop added, no leg changed, no
published time moved. Re-clustering would give better routes and is the wrong
trade: a pickup time already given to forty people is a promise. Anyone who
cannot be placed that cheaply is left unassigned and reported, because the
alternatives (run another bus, or add a stop and delay everyone) are an
operator's decision.

*What if two runs overlap?* They cannot. The sitting is claimed with one
conditional `findOneAndUpdate`, which MongoDB applies atomically to a single
document, so of two racing callers exactly one proceeds and the other gets a
409. The lock carries a timestamp and expires after five minutes, because a
process killed mid-run would otherwise leave that exam permanently unroutable.

---

## 5. Every other subsystem

### Authentication — we store no credentials

Sign-in is **Google only**. The ID token Google returns is verified server-side
against our own client id, then exchanged for our own JWT.

**The audience check is the part that matters.** Without it, a token minted for
any *other* application would be accepted here — and users hand those out to
every site they sign into.

There is also a **guest account** endpoint: one button mints a throwaway student
identity with no sign-up, because most people opening a demo link are evaluating
it and asking a stranger for their Google account is a real cost. Each visitor
gets their own fresh identity, the role is hard-coded to `student` so nothing
about `ADMIN_EMAIL` can promote one, and the whole endpoint is one variable from
off.

**There used to be email + password with a 6-digit OTP** — `crypto.randomInt`,
bcrypt-hashed codes, five-attempt cap, rate limited per address and per IP. It
was careful work and it was removed, because free hosting tiers block outbound
SMTP and transactional providers will not deliver to strangers from an
unverified sender. The code was generated, hashed and stored correctly and then
went nowhere. **An auth path that cannot deliver its own credential is not an
auth path; it is a form that traps people.**

The side effect is the best part: this application now stores no password and no
code. There is nothing to leak, nothing to brute force, no reset flow to abuse.

### Payments

- Order created server-side with the amount derived from the booking.
- Razorpay checkout opens in the browser.
- The result comes back and is **verified with HMAC-SHA256**, compared in
  constant time with `crypto.timingSafeEqual`.
- **The order id must be the one issued for that booking.** A signature Razorpay
  genuinely produced for a *different* order must not settle this one, or a
  single real payment could be replayed across every seat an attacker owns.
- Trusting the browser's "payment succeeded" callback would make the whole step
  decorative.

Simulated confirmation exists for local development only and is **refused
outside development with no override**. An endpoint that marks a booking paid
for free should not be one environment variable away from being live.

### Refunds — two systems, one of them not ours

Cancelling releases the seat and **saves that first**, then attempts the money.
If Razorpay times out, the worst case is a booking marked `refundStatus:
'failed'` with the amount owed, surfaced on the admin screen for a human to
settle.

Doing it the other way round means either holding a seat the student believes
they cancelled, or refunding someone who still has a booking. **An
inconsistency you can see and fix beats one nobody knows about.**

Tiers: full refund more than 72 hours out, 50% inside that, nothing in the last
24 hours since the seat can no longer be resold. The exact amount is quoted by
the *same function* the cancel endpoint uses, and shown **before** confirming —
showing it after an irreversible action would be a dark pattern.

### Geofenced pickup stops

Each home is matched to the nearest stop **within its catchment zone**, using an
indexed `$near` query with `$maxDistance` against a `2dsphere` index.

If no zone covers them, the app falls back to the nearest stop anywhere **and
says so**. Reaching a stop 60 km away is a completely different proposition from
one down the road, and presenting both with equal confidence would be
dishonest. Earlier the fallback was computed and thrown away.

### Boarding — the honest verification story

**No third party can digitally confirm someone is a genuine exam candidate.**
Only the exam authority knows, and there is no public API. The one legitimate
route is DigiLocker, which requires partner-organisation onboarding a student
project cannot obtain.

So instead of a fake "verified" badge, the app layers what it *can* honestly do:
Google sign-in (not a throwaway account), a real payment (skin in the game), and
a **human admit-card check at boarding** via the QR ticket.

**The app verifies the ticket. A person verifies the person.**

The roll number is required on every booking and validated server-side. It lives
on the *booking*, not the profile, because it is issued per exam — a JEE
application number is not a NEET one.

### Live tracking

The driver opens a **capability link**: a random 24-byte per-bus token that
authorises exactly two actions — read this bus's route, report this bus's
position. No account, no password.

This replaced a design where the "driver link" only worked for someone holding
the admin credentials — which in practice meant handing every bus driver the
password that can also re-run routing and read every student's home address.

A leaked link is revoked by rotating the token from the admin page.

### Time handling

Every exam time is built from **explicit IST components into a UTC instant**.
`date.setHours(9)` encodes the *server's* timezone — correct on a laptop set to
IST and silently wrong on a UTC host, where a 9:00 AM shift becomes 09:00Z and
renders as 2:30 PM to a student in India.

The test suite runs with `TZ=UTC` so a regression to local-time arithmetic fails
a test instead of surviving to production.

---

## 6. Decisions worth defending

**Why not a real VRP solver (OR-Tools)?**
It is NP-hard, and Directions already solves the sub-problem that matters —
ordering five to ten stops — with real road data. Clustering plus delegation
gets a correct answer in milliseconds and can be explained on a whiteboard. At
thousands of students per city I would look at OR-Tools; building it here would
have been complexity I could not justify.

**Why does the subsidy rise with distance?**
That is the entire social point. The students with the longest, costliest
journeys are usually the least able to pay. 5% per 50 km, capped at 50%.

*(The band was originally 25 km, which put the cap at 250 km — and almost
nobody in this system travels less than that. Every passenger hit the ceiling,
so a graduated policy quoted a flat half-price discount to everyone. The
tapering existed in the code and was invisible in every fare the app ever
produced.)*

**Why is routing idempotent?**
An admin will click the button twice. Re-running deletes the sitting's buses and
resets its bookings before rebuilding, so no booking is ever left pointing at a
bus that no longer exists. *Idempotent is not the same as concurrency-safe* —
that is what the lock is for.

**Why re-run the same stop lookup instead of caching stops in memory?**
Because the booking screen and the routing engine must never disagree about a
student's pickup stop. They previously used two different algorithms — an
indexed `$near` at booking time, an in-memory scan at routing time — so the stop
on a confirmation page could silently change. One function, one answer.

**Why is the JWT in localStorage?**
It is XSS-exposed, and an httpOnly cookie with CSRF protection would be
stronger. It was chosen for a simpler SPA flow and is a deliberate trade — the
honest answer if asked. *(Volunteering this is a strength. Candidates who claim
their project is fully secure get picked apart.)*

---

## 7. Bugs found and fixed

These are worth knowing because "what went wrong" is a better interview answer
than "what I built".

| Bug | Why it mattered |
|---|---|
| **Express 4 ignores rejected promises** from async handlers | `/api/bookings/not-a-valid-id` hung until timeout. A malformed URL could take down the API. Every controller is now wrapped once, centrally. |
| **k-means optimised the wrong shape** | Routes ~30% longer than necessary. Nothing crashed. |
| **`currentLocation: {lng, lat}` returned `{}`** for a bus that had never reported | `{}` is truthy, so clients mapped it to `[undefined, undefined]`, Leaflet threw, and the whole page went blank. |
| **Ticket said "be at your stop 07:10" and "bus departs 07:10"** | Zero buffer. A schedule that only works if nobody is ever late. |
| **Subsidy capped at 250 km** | Every real journey hit the ceiling, so a graduated policy behaved as a flat discount. |
| **Abandoning the payment sheet was a dead end** | The unpaid booking stayed behind, and the next attempt hit "you already booked this session" from a page showing no booking. |
| **Routing had no lock** | Two admins clicking together could interleave a delete with a create. |
| **Booking was unbounded** | Ten thousand students would route into 250 buses nobody owns — discovered on exam morning. |
| **The test suite skipped 47 tests and exited green** | CI now sets `REQUIRE_DB=1` so a missing database is a failure, not a footnote. |

---

## 8. Testing and CI

**156 tests**, two layers:

- **Unit** (`clustering`, `time`, `fare`, `refundPolicy`, `paymentGating`,
  `app.smoke`) — no infrastructure, runs anywhere.
- **Integration** (`routingEngine`, `routingScheduler`, `api`,
  `paymentVerification`) — runs against a **real MongoDB**, because much of the
  behaviour under test *is* database behaviour: the `2dsphere` index behind
  `$near`, the unique index that prevents double booking, Mongoose casting. A
  stubbed driver would agree with whatever the code expected and prove nothing.

**The detail worth mentioning:** locally, if no database is reachable, the
integration specs skip with a warning rather than failing the build with an
infrastructure error that looks like a code defect. That is the right default on
a laptop and the *wrong* one in CI, where it produces a green badge for a run in
which the entire integration layer never executed. So CI sets `REQUIRE_DB=1`.

GitHub Actions runs the server suite against a `mongo:7` service container plus
a production client build, with `TZ=UTC` set explicitly.

Notable cases: buses are never overfilled even when every student lives at the
same point; routing is idempotent and leaves no orphans; two racing routing runs
produce exactly one winner; a student cannot read another student's booking or
ticket; a rotated driver link stops working; a genuine Razorpay signature for a
*different* order cannot settle this booking.

---

## 9. The interview script

### The 60-second version (use this first, always)

> Students travelling to competitive exams often have to reach a centre in
> another city by 8:30 in the morning, and public transport doesn't line up with
> exam timings. ExamRoute pools students from the same area onto a shared bus.
>
> You book a seat for a specific exam date and shift, the system finds your
> nearest pickup stop with a geospatial query, and once bookings close a routing
> engine groups everyone into buses, orders the pickup stops, and computes the
> departure time by working *backwards* from the exam's gate-close deadline.
>
> Fares are subsidised more heavily the further you travel, which is the point —
> the students with the longest journeys are usually the ones least able to pay.
>
> It's MERN, with Razorpay for payments and Google OAuth for sign-in. It's
> deployed, and there's a guest login if you want to try it.

**Then stop and let them ask.** Do not keep going. The pause is what turns a
monologue into a conversation, and their first question tells you what they care
about.

### If they ask for the technical depth

> The interesting part is the routing engine. I started with k-means to group
> students geographically — textbook choice, and it produced correct k-means
> output. Then I looked at a route on a map.
>
> k-means minimises distance to a centroid, so it makes round clusters. But a
> good bus route is the opposite shape — a corridor, students strung along one
> highway from a far town into the city. In k-means terms that's a high-variance
> cluster, exactly what it's built to avoid. The code wasn't buggy; it was
> optimising the wrong shape.
>
> So I added a sweep — sort students by the angle they sit at around the exam
> centre, walk the circle, start a new bus when the next one won't fit. Each bus
> serves a wedge pointing outward, which is what a feeder route actually is.
>
> The part I'm most pleased with is that I didn't pick one. Neither wins
> everywhere, so I build both, score them on what they'd actually cost to drive —
> bus count first, kilometres second, because no distance saving pays for an
> extra driver — and use the cheaper. That's 10 to 18% shorter than k-means
> alone, and it can never be worse, because k-means is one of the candidates.

### If they ask "what was hard" or "what went wrong"

Pick **one** and tell it properly. The Express 4 one is the best for a backend
role:

> Most of my controllers were async with no try/catch, and I assumed my error
> middleware would catch anything thrown. It doesn't — Express 4 predates
> async/await, so a rejected promise never reaches `next()`. Hitting something
> as ordinary as a malformed id produced a CastError that became an unhandled
> rejection: the request hung until the client timed out. A malformed URL could
> have taken down my API. Every controller is now wrapped once, centrally, so no
> handler can be registered unwrapped.

### Closing line, if you get one

> The thing I'd change next is that the clustering scores bus count and
> kilometres, with no term for how long any individual passenger sits on the
> bus. So the first town on a long corridor can end up riding the whole detour —
> a three-hour journey becomes six. I'd weight the objective by
> passenger-minutes, or cap ride time and accept an extra bus.

**Naming your own limitation before they find it is the strongest move
available.** It converts a weakness into evidence that you measured your work.

---

## 10. Interview questions and answers

### On the problem

**Q: Does this already exist?**
Yes, partly, and the problem is officially recognised — state transport runs
free travel for exam candidates, and one has added a mandatory registration
portal. ExamBus.in sells exam-day bus tickets; Eduride matches candidates with
volunteers. But none of them form buses out of demand. They sell seats on fixed
routes or match one to one. The routing is the gap.

**Q: Who pays for this?**
In the demo, the student, on a subsidised curve. Realistically this is either a
state transport partnership or a coaching-institute service — the free-travel
schemes that already exist show the willingness to fund it is there.

**Q: How do you know someone is a real exam candidate?**
You can't, digitally. Only the exam authority knows and there's no public API.
DigiLocker is the one legitimate route and needs partner onboarding. So I
layered honest deterrents instead — Google sign-in, a real payment, and a human
admit-card check at boarding. The app verifies the ticket; a person verifies the
person. I'd rather ship an honest boundary than security theatre.

### On the algorithm

**Q: Why not use a proper VRP solver?**
Covered in §6. Short version: NP-hard, Directions already solves the ordering
sub-problem with real road data, and clustering plus delegation is correct,
explainable and fast enough at this scale.

**Q: How do you pick the number of buses?**
`ceil(totalSeats / capacity)` for the initial k — but that only fixes the count.
Balancing needs the repair phase, because k-means has no concept of capacity and
can land 55 seats on one bus and 5 on another.

**Q: What's the complexity?**
k-means is O(n·k·i) per run. The sweep is O(n log n) for the sort plus a linear
walk, tried from every start. Local search dominates in practice: 2-opt is
O(n²) per pass on a bus's stops, but a bus has five to ten stops, not five
hundred. The whole thing runs in well under a second for a few hundred students.

**Q: Is it deterministic?**
Yes, deliberately. Farthest-point seeding is deterministic rather than random,
so the same cohort always produces the same buses. That matters for demos and
for debugging — a routing bug you can't reproduce is a routing bug you can't fix.

**Q: What if 41 students book and a bus holds 40?**
Two buses, split *geographically* — perhaps 23 and 18, not 40 and 1. Booking
never touches a bus; buses are formed later from all paid bookings at once. So
which bus you get depends on where you live, not when you clicked.

### On concurrency and correctness

**Q: What if two people book the last seat simultaneously?**
There is no "last seat" at booking time — booking writes a row and never touches
a bus, so there's no shared counter to race on. The unique index on (user,
session) only prevents the same student booking twice.

**Q: What if two admins run routing at the same time?**
One wins, one gets a 409. The sitting is claimed with a single conditional
`findOneAndUpdate`, atomic on one document. A read-then-write would let both
through. The lock expires after five minutes so a crashed process can't wedge
that exam forever.

**Q: What if someone pays after routing has run?**
They're attached to a bus that already stops where they live and has room — no
published time moves. Re-clustering would give better routes and would break a
promise already made to forty people.

### On payments

**Q: How do you know a payment is real?**
Razorpay signs the result with an HMAC of `order_id|payment_id` keyed on the API
secret. I recompute it server-side and compare in constant time. I also check
the order id is the one *I* issued for *that* booking — a signature Razorpay
genuinely produced for a different order must not settle this one, or one real
payment could be replayed across every seat an attacker owns.

**Q: Why constant-time comparison?**
A normal string comparison returns early on the first differing byte, which
leaks how much of a guess was correct through timing. `timingSafeEqual` always
takes the same time. It also throws on length-mismatched buffers, so the length
is checked first — otherwise a short signature is a 500 on an endpoint an
attacker controls the input to.

**Q: Have you tested it against real Razorpay?**
Yes — the live deployment runs real test-mode keys. Real orders, real checkout,
real signatures. Only the money is test-mode. Live mode needs business KYC and
would make me liable for chargebacks on a site strangers can reach.

### On the database

**Q: Why MongoDB?**
Geospatial queries are first-class. Finding the nearest stop within a 5 km
catchment is one indexed `$near` with `$maxDistance` against a `2dsphere` index.
The data is also naturally document-shaped — a bus carries an ordered array of
stops with times, which is one document rather than a join.

**Q: Would a relational database have worked?**
Yes, with PostGIS. I'd probably reach for it in production, because the booking
and payment side is genuinely relational and I'd want real transactions around
the routing rebuild. Mongo's single-document atomicity was enough here, which is
why the lock is one document rather than a transaction.

**Q: What indexes do you have?**
`2dsphere` on stop, centre, user home and booking home locations. A unique
compound index on (user, session) so one student cannot hold two seats on the
same sitting. An index on driverToken for the capability lookup.

### On security

**Q: Walk me through your auth.**
Google returns an ID token — a JWT they signed. I verify the signature *and* the
audience against my own client id, because a token minted for any other
application would otherwise be accepted, and users hand those out everywhere.
Then I issue my own JWT so every downstream route checks one kind of token.

**Q: Where do you store the JWT and is that safe?**
localStorage, which is XSS-exposed. An httpOnly cookie with CSRF protection is
stronger. I chose localStorage for a simpler SPA flow — it's a deliberate trade,
and I'd change it if this handled real money.

**Q: How do drivers authenticate without an account?**
A capability link: a random 24-byte per-bus token that authorises exactly two
actions on exactly one bus. Same pattern as a Google Docs "anyone with the link"
share. The blast radius is bounded — worst case someone reports a false position
for one bus — and it's revocable in one click. The alternative, an account per
driver, is a whole user-management surface for someone who works one trip.

### On engineering practice

**Q: How did you test the routing engine?**
Against a real MongoDB, because much of what's under test *is* database
behaviour. Properties rather than exact outputs: capacity is never exceeded even
when every student lives at the same coordinates, nobody is lost, re-running
leaves no orphans, the combined strategy is never worse than k-means alone, and
the same cohort always produces the same buses.

**Q: What's in your CI?**
Server suite against a `mongo:7` service container with `REQUIRE_DB=1`, plus a
production client build, `TZ=UTC` set explicitly. The `REQUIRE_DB` flag exists
because the suite used to skip 47 integration tests and exit green.

**Q: How would you scale this?**
Routing is per sitting per centre, so it's embarrassingly parallel — move it to
a worker queue, one job per centre. The sweeper currently runs inside the API
process, which is fine at this size and wrong at scale. Beyond a few thousand
students per centre I'd swap the clustering for OR-Tools.

---

## 11. Numbers to remember

| Fact | Value |
|---|---|
| Bus capacity | 40 seats (companions count) |
| Catchment radius | 5 km |
| Routing improvement | 10–18% shorter than k-means alone |
| Tests | 156, across unit and integration |
| Boarding buffer | 10 minutes before the bus |
| Subsidy | 5% per 50 km, capped at 50% |
| Refund tiers | 100% > 72h · 50% > 24h · 0% inside 24h |
| Safety buffer | Never plan later than gate close − 60 min |
| Seeded data | 8 exams · 25 sittings · 22 cities · 44 stops |
| Demo cohort | ~120 students → 5 buses for one centre |
| Driver token | 24 random bytes |
| Routing lock expiry | 5 minutes |

**If you blank in the room:** open the live site, go to Admin, press *Run
routing engine*. Five buses appear with their routes drawn on maps. The screen
does the talking.
