# ExamRoute — everything, in the words you'd actually say

One file. The pitch, then every question you're likely to get with a **full
spoken answer** — not bullet points to expand, but the sentences themselves.

Read it once end to end. Then re-skim §1, §2 and §9 the morning of.

**Live:** https://exam-route.vercel.app · **Code:** https://github.com/dhruvikaabansal/ExamRoute

---

## Contents

1. [The pitch](#1-the-pitch)
2. [Rapid-fire facts](#2-rapid-fire-facts)
3. [The problem and the product](#3-the-problem-and-the-product)
4. [The routing engine](#4-the-routing-engine)
5. [Money — fares, payments, refunds](#5-money--fares-payments-refunds)
6. [Time, deadlines and the lifecycle](#6-time-deadlines-and-the-lifecycle)
7. [Data, auth and security](#7-data-auth-and-security)
8. [Testing, scale and engineering practice](#8-testing-scale-and-engineering-practice)
9. [The three stories](#9-the-three-stories)
10. [Limitations — say these before they ask](#10-limitations--say-these-before-they-ask)
11. [Numbers](#11-numbers)
12. [In the room](#12-in-the-room)

---

## 1. The pitch

### 60 seconds — say this, then stop

> Students sitting competitive exams like JEE or NEET often get assigned an exam
> centre in another city, two or three hundred kilometres away. The hall gate
> shuts thirty minutes before the paper and doesn't reopen, and public transport
> doesn't line up with that — so students end up travelling overnight, alone,
> and some genuinely miss exams because of transport rather than preparation.
>
> ExamRoute pools students going to the same centre onto one shared bus. You
> book a seat for a specific exam date and shift, drop a pin on where you live,
> and the system finds your nearest pickup stop. Once bookings close, a routing
> engine groups everyone travelling to that centre into buses, works out the
> order of pickup stops, and computes the departure time by working *backwards*
> from the moment the gate shuts.
>
> It's MERN — React, Express, MongoDB — with Razorpay for payments and Google
> sign-in. It's deployed and live, and there's a guest login if you want to try
> it without signing up.
>
> The interesting part is the clustering. I started with k-means and found it
> was optimising the wrong shape — happy to go into that.

**Then stop talking.** The pause is deliberate. It turns a monologue into a
conversation, and their first question tells you what they actually care about.
That last line is bait — it hands them the question you most want.

### If they say "go on"

> k-means minimises distance to a centroid, so it produces round, compact
> clusters. But the best possible bus route is the opposite shape — a corridor,
> students strung out along one highway from a far town into the city. In
> k-means terms that's a high-variance cluster, which is exactly what the
> algorithm exists to avoid. So it was systematically preferring the wrong
> grouping. The code wasn't buggy — it was optimising the wrong thing.
>
> The fix is a second construction called a sweep: sort every student by the
> angle they sit at around the exam centre, walk that circle, and start a new bus
> whenever the next student won't fit. Each bus ends up serving a wedge radiating
> outward, which is the shape a feeder route actually has.
>
> The part I'm most pleased with is that I didn't pick one. Neither wins
> everywhere, so the engine builds both, scores them on what they'd actually cost
> to drive — bus count first, kilometres second, because no amount of shaved
> distance pays for an extra driver and vehicle — and uses the cheaper. That's
> 10 to 18% shorter than k-means alone, and by construction it can never be
> worse, because k-means is one of the candidates.

---

## 2. Rapid-fire facts

If you know only this page, you can hold a conversation.

| | |
|---|---|
| **What** | Ride-pooling for competitive-exam candidates |
| **Stack** | React + Vite + Tailwind · Express 4 · MongoDB Atlas · Leaflet |
| **Integrations** | Razorpay (test mode, live), Google OAuth |
| **Core problem** | Capacitated Vehicle Routing with a hard time window |
| **Clustering** | k-means + sweep, scored, cheaper wins → 10–18% shorter |
| **Stop matching** | MongoDB `2dsphere` + `$near`, 5 km catchment |
| **Scheduling** | Backwards from `gateClose`; two clocks per stop |
| **Bus capacity** | 40 seats, companions included |
| **Fare** | Billed from the pickup stop, subsidised on home distance |
| **Subsidy** | 5% per 50 km, capped at 50% |
| **Refunds** | 100% >72h · 50% >24h · 0% inside 24h |
| **Auth** | Google only, plus a throwaway guest account. No passwords stored |
| **Routing trigger** | Automatic on the booking deadline, admin button as override |
| **Tests** | 181, against a real MongoDB in GitHub Actions CI |
| **Deploy** | Render (API) + Vercel (SPA) |

---

## 3. The problem and the product

**Q: What problem does this solve?**

> A student gets assigned an exam centre in another city. The gate shuts at 8:30
> for a 9 AM paper and never reopens, so arriving at 8:31 costs you the year.
> Public buses don't run on a schedule that gets you there in time, so students
> travel overnight, often alone, often to a city they've never been to. Some
> don't make it — not because they weren't prepared, but because of transport.

**Q: Is this a real problem or did you invent it?**

> It's real enough that state governments already run schemes for it. Rajasthan's
> transport corporation gives free travel to competitive exam candidates on
> production of an admit card, and they've recently added a mandatory online
> registration portal with a 36-hour cutoff. That's the state confirming three
> things I needed: this population exists, it travels in bulk, and it needs to
> register in advance.

**Q: Does something like this already exist?**

> Partly. ExamBus.in has been selling exam-day bus tickets since 2020. Eduride,
> built by IIT students and alumni, matches candidates with volunteer drivers.
> But none of them do the hard part — forming buses out of demand. They sell
> seats on fixed routes or match people one to one. Nobody takes a pool of
> students and decides what buses should exist, which stops each one visits, in
> what order, and when it has to leave. That's the gap.

**Q: Walk me through what a student actually does.**

> They sign in with Google, or press "explore with a guest account" if they just
> want to look. They set their home location once — search an address or tap the
> map, and the pin and the text stay in sync. Then they pick an exam, a specific
> date and shift, and an exam centre, enter the roll number off their admit card,
> and add seats if a parent is coming.
>
> They see the fare broken down before paying — the bus journey, the subsidy, the
> total — and their nearest pickup stop, found by a geospatial query. They pay
> through Razorpay.
>
> Then they wait, and the confirmation screen says so and explains why: the bus
> doesn't exist yet, because you can't pool students who haven't booked. Once
> bookings close, routing runs and their ticket fills in — be at your stop by
> 06:50, bus arrives 07:00, reaches the centre by 09:00. On the day they show a
> QR at the bus door and watch the bus move on a map.

**Q: What does the operator see?**

> A boarding list per bus — every passenger grouped by pickup stop, in the order
> the bus drives them, ticked off as they arrive. So standing at stop three of
> six you can see that stop is complete and you can pull out, and at the end you
> know exactly who hasn't shown up, with a phone number to call them.
>
> Plus an admin console with every bus, its route drawn on a map, seat-load bars,
> and a link to copy and send to the driver.

**Q: What's an `Exam` versus an `ExamSession`?**

> `Exam` is the umbrella — "JEE Main 2026 Session 1". `ExamSession` is one
> specific date plus one shift, and that's the unit a student actually travels
> to. JEE Main runs three dates with two shifts each, so that's six different
> journeys with six different departure times. Modelling them as one thing made
> two completely different sittings render identically — which was a real bug I
> hit when booking cards showed "Shift 1" with no date.

---

## 4. The routing engine

**Q: What is the engine actually solving?**

> For one sitting, per exam centre: given N students at known locations who have
> paid, partition them into buses of at most 40 seats, decide which stops each
> bus visits and in what order, and compute a departure time such that every bus
> reaches the centre before the gate closes. That's the Vehicle Routing Problem
> with capacity and a time window, which is NP-hard — so it's heuristics and
> local search, not an exact solver.

**Q: Walk me through the stages.**

> Four. **Cluster** — group students into buses that fit capacity. **Snap** —
> map each student to a pickup stop, using the same geofenced lookup that ran at
> booking time, so the stop on their confirmation page can never silently change.
> **Order** — decide each bus's stop sequence. **Time** — departure equals
> arrival target minus total travel, then each stop's pickup follows from the
> cumulative leg durations.

**Q: Why not a proper VRP solver like OR-Tools?**

> It's NP-hard, and the Directions API already solves the sub-problem that
> matters — ordering five to ten stops — with real road data. Clustering plus
> delegation gets a correct answer in milliseconds and I can draw it on a
> whiteboard. If this scaled to thousands of students per city I'd reach for
> OR-Tools, but building that here would have been complexity I couldn't justify.

**Q: How do you decide how many buses?**

> `ceil(totalSeats / capacity)` for the initial k. But I'd immediately say that
> only fixes the *count* — it doesn't balance the split. k-means has no concept
> of capacity, so 60 seats over two buses can land 55 and 5, and the admin screen
> would happily print "55 of 40 seats". That's why there's a repair phase.

**Q: What does the repair phase do?**

> Any over-capacity cluster gives up its most *peripheral* member — the one
> farthest from that cluster's centroid — to the nearest cluster with room, or to
> a new bus if none has room.
>
> Peripheral rather than random, because evicting a central student tears a hole
> in the middle of an otherwise tight route; the peripheral one is geometrically
> the cheapest to give away. And it terminates because every move strictly
> decreases total overflow. I assert the capacity invariant before returning — if
> it ever fails I want a loud error, not a bus with 55 people on it.

**Q: Why farthest-point seeding?**

> Bookings arrive in clumps — the first several students are often from the same
> town. Seeding from the first k points gives you near-identical centroids and a
> bad local optimum. Farthest-point seeding avoids that, and it's deterministic,
> so the same cohort always produces the same buses. That matters for demos and
> for debugging: a routing bug you can't reproduce is one you can't fix.

**Q: How do you order stops within one bus?**

> With a Maps key, Directions with `optimize:true`. One subtlety — it only
> reorders the *intermediate* waypoints, origin and destination are fixed. So I
> deliberately pick the stop farthest from the centre as the origin, because the
> bus starts at the far end of the corridor and works inward. Passing whichever
> stop happened to come first made the result optimal relative to an arbitrary
> start.
>
> Without a key, an offline path runs nearest-neighbour construction followed by
> 2-opt and Or-opt until neither improves.

**Q: What's 2-opt, and why also Or-opt?**

> 2-opt reverses a segment of the route to remove crossings. Or-opt lifts a run
> of one to three stops out and reinserts it elsewhere. They fix different
> failures — 2-opt can't relocate a single badly-placed stop, Or-opt can't
> uncross a route — so both run until neither can improve it.

**Q: Complexity?**

> k-means is O(n·k·i) per run. The sweep is O(n log n) for the sort plus a linear
> walk, tried from every starting angle. 2-opt is O(n²) per pass, but n there is
> the stops on one bus — five to ten, not five hundred. The whole run is well
> under a second for a few hundred students.
>
> One detail worth volunteering: I score candidate clusterings with a *cheaper*
> local search than the final routes use. Choosing between clusterings only needs
> the ranking to be right, not each candidate's exact optimum, and running the
> full search on every candidate took about four and a half seconds at 200
> students — too slow for an admin pressing a button.

**Q: How is the departure time computed?**

> Backwards. There are two constraints and I honour the tighter one:
> `reportingTime`, the officially recommended arrival, usually two hours before
> the paper — that's the target; and `gateClose`, the hard deadline, which I
> never plan later than minus a safety buffer. Then departure is arrival target
> minus total travel time.
>
> Long routes from far towns genuinely leave the previous evening. Those buses
> are flagged `isOvernight` so the UI can label it, rather than showing a date
> that looks like a bug.

**Q: What are the two clocks per stop?**

> Every stop carries `pickupTime` — when the bus is physically there, which falls
> out of the route arithmetic — and `boardBy`, which is what the passenger is
> told, ten minutes earlier.
>
> The first version published one number for both, so a ticket read "be at your
> stop by 07:10" above "bus departs 07:10". That's a schedule that only holds if
> nobody is ever thirty seconds late — and the cost of waiting isn't paid by the
> person who's late. A bus that waits two minutes at each of six stops reaches
> the centre twelve minutes behind, for all forty people aboard.
>
> The buffer is a promise to the passenger, not slack in the route: departure,
> legs and arrival are untouched. There's a test pinning exactly that, because
> the obvious wrong implementation subtracts it from departure and makes the
> whole schedule drift earlier on every re-run.

---

## 5. Money — fares, payments, refunds

**Q: How is the fare calculated?**

> Per seat it's a base fare plus a rate per kilometre, times the number of seats,
> minus a subsidy. But the important part is that the charge and the discount
> measure from *different places*.
>
> You're billed from the **pickup stop** — that's the leg the bus actually
> drives. You're subsidised on your **home** distance — because hardship is about
> where you live, not where you board.

**Q: Why the split? Isn't that more complicated?**

> It fixed a real bug. Originally I billed from the student's front door, which
> charged them for kilometres no bus covers — getting to the stop is their own
> journey. But the worse symptom was this: two students boarding the *same stop*
> for the *same seat* on the *same bus* paid different fares, because one lived
> further from that stop. Identical service, different price, for a reason
> neither of them could see.
>
> Keeping the subsidy on home distance means a student in a remote village who
> travels 40 km just to reach the bus stand is still recognised as the person the
> subsidy exists for.

**Q: Why does the subsidy go *up* with distance?**

> That's the entire social point. The students with the longest, costliest
> journeys are usually the ones least able to pay. It's 5% per 50 km, capped at
> 50%.

**Q: Why 50 km bands and not 25?**

> Because 25 was wrong and I only found out by checking the output. At 5% per 25
> km the 50% ceiling arrives at 250 km — and almost nobody in this system travels
> less than that. Every single passenger hit the cap, which meant a graduated
> social policy was quoting a flat half-price discount to everyone. The tapering
> existed in the code and was invisible in every fare the app had ever produced.
>
> The test for it now asserts a *distribution* rather than a formula: an ordinary
> intercity journey must land strictly below the cap, and a spread of real
> distances must produce visibly different rates.

**Q: How do you know a payment actually succeeded?**

> Razorpay signs the result with an HMAC of `order_id|payment_id` keyed on the
> API secret. I recompute that server-side and compare it in constant time. I
> also check the order id is the one *I* issued for *that* booking.
>
> Trusting the browser's "payment succeeded" callback would make the whole
> payment step decorative — anyone can produce one.

**Q: Why the order-id check if the signature already passed?**

> This is the one I'd volunteer. A signature Razorpay *genuinely produced* for a
> different order would pass the signature check, because Razorpay really did
> sign it. Without tying the order back to this specific booking, one real ₹100
> payment could be replayed to settle every seat an attacker owns. Only my own
> check stops that.

**Q: Why constant-time comparison?**

> A normal string comparison returns early at the first differing byte, which
> leaks how much of a guess was correct through timing. `timingSafeEqual` always
> takes the same time. It also throws on length-mismatched buffers, so I check
> the length first — otherwise a short signature is a 500 on an endpoint an
> attacker controls the input to.

**Q: Have you tested against real Razorpay?**

> Yes — the live deployment runs real test-mode keys. Real orders, real checkout,
> real signatures verified server-side. Only the money is test-mode. Live mode
> needs business KYC and would make me liable for chargebacks on a site strangers
> can reach, so that's a deliberate choice rather than a gap.

**Q: What happens when someone cancels?**

> The seat is released and saved **first**, then I attempt the refund. If
> Razorpay times out, the worst case is a booking marked `refundStatus: 'failed'`
> with the amount owed, surfaced on the admin screen for a human to settle.
>
> Doing it the other way round means either holding a seat the student thinks
> they cancelled, or refunding someone who still has a booking. An inconsistency
> you can see and fix beats one nobody knows about.

**Q: Why is `refundStatus` separate from `status`?**

> Because releasing a seat and returning money are two different facts, and only
> one of those systems is mine. `cancelled` says the seat is gone; it says
> nothing about the money. Conflating them into one enum loses the "cancelled but
> still owed" state — which is money nobody can see.

**Q: How are refunds tiered?**

> Full refund more than 72 hours out, 50% inside that, nothing in the last 24
> hours, because a seat cancelled that late can't be resold. The student is shown
> the exact amount **before** confirming — quoted by the same function the cancel
> endpoint uses, so the number in the dialog is the number they get. Showing it
> after an irreversible action would be a dark pattern.

---

## 6. Time, deadlines and the lifecycle

**Q: When does booking close?**

> On the exam's `bookingDeadline` — in my seed data that's four days before the
> exam's first sitting. That one timestamp gates three things at once: no new
> bookings, no more payments, and any seat still unpaid gets released back to the
> pool. Then the scheduler routes the sitting.

**Q: Why does payment close too? Isn't that harsh?**

> It was a real hole I found. Bookings closed on the deadline, but paying didn't —
> so someone could reserve a seat, leave it unpaid, and settle it days later,
> after the buses for that sitting had already been formed, seated and published.
> The money arrived for a journey that was planned without them.
>
> Once the window shuts, the cohort is final. That's the whole reason routing can
> produce short routes — it sees everybody at once. Letting payments trickle in
> afterwards quietly reopens a decision that's already been made.

**Q: Why release unpaid bookings?**

> A `pending` booking holds a seat against the centre's capacity without having
> bought it. Before the deadline that's correct — someone's mid-checkout. After
> it, that seat is just missing from the pool: routing plans a smaller cohort than
> it should, and someone else was told the centre was full because of a checkout
> that was abandoned.
>
> They're cancelled rather than deleted, with `refundStatus: 'none'` — no money
> ever moved, so none is owed. And the student sees *why*, not just "cancelled",
> which would look like the app lost their booking.

**Q: Is the student warned about that deadline?**

> Yes, in three places — and originally in none, which was the gap. On the
> booking screen under the fare, on the confirmation, and most importantly on any
> unpaid booking in My Bookings, where an amber panel says "pay by this date or
> it's released — buses are formed straight after, and a seat can't be added once
> they are." Just saying "complete payment" implies it'll wait indefinitely.

**Q: Who triggers routing?**

> A time, not a person. A sweeper looks for sittings whose booking window has
> closed and routes them. The admin button stays as an override for re-runs.

**Q: Why a batch at all? Why not assign a bus when someone books?**

> Because you can't pool students who haven't booked yet. Assign at booking time
> and bus 1 becomes "the first forty people who clicked" — a chronological group,
> not a geographic one, and the corridors that make routes short stop existing.
> The batch is forced by the problem. Only the *trigger* was ever a choice, and a
> person was the wrong one.

**Q: What if two admins run routing at the same time?**

> One wins, the other gets a 409. Routing deletes a sitting's buses and rebuilds
> them, so an interleaved delete and create could leave bookings pointing at a bus
> that no longer exists. I claim the sitting with a single conditional
> `findOneAndUpdate`, which MongoDB applies atomically to one document — so of two
> racing callers exactly one matches the filter. A read-then-write would let both
> through.
>
> The lock carries a timestamp and expires after five minutes, because a process
> killed mid-run would otherwise leave that exam permanently unroutable.

**Q: Idempotent and thread-safe — same thing?**

> No, and the distinction is exactly what caught me. Idempotent means re-running
> *after* a previous run is fine — routing rebuilds cleanly, which it does.
> Thread-safe means re-running *during* one is fine, which it wasn't. The first is
> design; the second needed the lock.

**Q: Someone pays after routing has run. Then what?**

> There's a narrow window between the deadline and the sweep. If a payment lands
> there, they're attached to a bus that already stops where they live and has
> room — no stop added, no leg changed, no published time moved.
>
> Re-clustering would give better routes and is the wrong trade: "be at Sikar bus
> stand at 04:40" is a promise already made to forty people, some of whom have
> arranged how they're getting there. Anyone who can't be placed that cheaply is
> left unassigned and surfaced on the admin screen, because the alternatives —
> another bus, or a new stop that delays everyone — are an operator's decision,
> not a scheduler's.

**Q: Two students book the last seat simultaneously?**

> Trick question, and worth saying so. There is no "last seat" at booking time.
> Booking writes a row and never touches a bus — there's no shared counter to
> race on. Buses are formed later from all paid bookings at once. The only
> uniqueness constraint is one seat per student per sitting, and that's a unique
> index.

**Q: What if 41 students book and a bus holds 40?**

> Two buses, split *geographically* — maybe 23 and 18, not 40 and 1. The 41st
> person isn't punished for clicking last. Which bus you get depends on where you
> live, not when you booked.

**Q: Can someone book two exams on the same day?**

> No, and this needed an explicit check. The unique index only stops the same
> *sitting* twice — but JEE and CUET can fall on the same date, and a student
> browsing two exam pages could end up holding seats on two buses leaving two
> different towns at four in the morning for two different cities. Only one can
> happen; the other is a paid-for seat out of circulation and a boarding list
> expecting someone two hundred kilometres away.
>
> The rule is the whole calendar day rather than overlapping exam hours, because
> what I'm selling is a bus journey — an overnight departure and a multi-stop run
> — not two hours in a hall. And the error names which booking clashes, so they
> don't have to hunt for it.

**Q: How do you handle timezones?**

> Every exam time is built from explicit IST components into a UTC instant.
> `date.setHours(9)` encodes the *server's* timezone — correct on a laptop set to
> IST and silently wrong on a UTC host, where a 9 AM shift becomes 09:00Z and
> renders as 2:30 PM to a student in India. The test suite runs with `TZ=UTC` so a
> regression to local-time arithmetic fails a test instead of reaching production.

---

## 7. Data, auth and security

**Q: Why MongoDB?**

> Two reasons. Geospatial is first-class — finding the nearest stop within a 5 km
> catchment is one indexed `$near` with `$maxDistance` against a `2dsphere` index.
> And the data is naturally document-shaped: a bus carries an ordered array of
> stops with times, which is one document rather than a join.

**Q: Would Postgres have worked?**

> Yes, with PostGIS, and I'd probably reach for it in production. The booking and
> payment side is genuinely relational, and I'd want real transactions around the
> routing rebuild rather than relying on a lock. Mongo's single-document
> atomicity was enough here, which is exactly why the lock is one document.

**Q: What indexes?**

> `2dsphere` on stops, centres, user home locations and booking home locations. A
> unique compound index on (user, session) so one student can't hold two seats on
> one sitting. And an index on `driverToken` for the capability-link lookup.

**Q: Walk me through authentication.**

> Google returns an ID token — a JWT they signed. I verify the signature **and**
> the audience against my own client id, then exchange it for my own JWT so every
> downstream route checks one kind of token.
>
> The audience check is the part that matters. Without it, a token minted for any
> *other* application would be accepted here — and users hand those out to every
> site they sign into.

**Q: Why only Google? Isn't one option limiting?**

> There was a second path — email and password with a six-digit OTP, and a reset
> flow on the same machinery. Codes from `crypto.randomInt`, stored as bcrypt
> hashes, capped at five attempts, rate limited per address and per IP. Careful
> work, and completely undeliverable: free hosting tiers block outbound SMTP, and
> transactional providers won't deliver to strangers from an unverified sender. So
> on the deployed site the code was generated, hashed and stored correctly, and
> then went nowhere.
>
> An auth path that can't deliver its own credential isn't an auth path — it's a
> form that traps people. I deleted it. The side effect is the best part: this
> application now stores no credential of any kind. No password to leak, no code
> to brute force, no reset flow to abuse.

**Q: What's the guest account?**

> One button mints a throwaway student account with no sign-up, because most
> people opening a link like this are evaluating it, and asking a stranger for
> their Google account before showing them anything is a real cost.
>
> Three things keep it low-value: a fresh identity per visitor rather than a
> shared login, so nobody sees anyone else's bookings; the role is hard-coded to
> `student`, so nothing about `ADMIN_EMAIL` can promote one — there's a
> deliberately hostile test that sets `ADMIN_EMAIL` to match the demo email
> pattern and asserts it's still refused from admin routes; and the whole endpoint
> is one variable from off.

**Q: How do drivers authenticate?**

> A capability link — a random 24-byte per-bus token that authorises exactly two
> things: read this bus's route, report this bus's position. No account, no
> password.
>
> It replaced a design where the "driver link" only worked for someone holding
> the admin credentials — which in practice meant handing every bus driver the
> password that can also re-run routing and read every student's home address.
> Same pattern as a Google Docs "anyone with the link" share: bounded blast
> radius, and revocable by rotating the token.

**Q: How does the map know where the bus is? Does Leaflet track it?**

> No — and this is worth being precise about, because the pieces are often
> confused. **Leaflet is only a renderer**: it draws a marker at whatever
> latitude and longitude I hand it, and has no idea what that point means.
> **OpenStreetMap only serves tile images** — 256-pixel PNGs of map squares. It
> never sees anyone's position.
>
> The position comes from the **browser's Geolocation API** on the driver's
> phone — `navigator.geolocation.watchPosition`, which uses GPS plus wifi and
> cell triangulation and fires a callback whenever the device moves. That posts
> to my API, which stores it on the bus. The student's page polls it and hands
> the coordinates to Leaflet.
>
> So the chain is: driver's phone GPS → my API → student's browser → Leaflet
> draws a dot on an OSM tile.

**Q: What if the driver link gets forwarded to two people?**

> That was a real flaw, and I'd rather explain the fix than the original.
>
> `currentLocation` is one field, so two phones posting meant last-write-wins:
> the marker would jump between two places every few seconds, and every
> passenger watching would be shown a position that might not be their bus.
> Nothing detected it — silent wrongness, which is the bad kind.
>
> So the **first device to report claims the link**, and later ones get a 409.
> The claim is an atomic `findOneAndUpdate` conditioned on nobody having claimed
> it yet, so two phones starting simultaneously can't both win. The driver's own
> page stores its device id in localStorage, so a refresh doesn't lock them out
> of their own bus.
>
> It doesn't make the token harder to guess — it makes a leaked one far less
> useful, and it makes the conflict *visible* instead of silent. Recovery is
> rotation: a new link clears the pairing, so a driver whose phone died is one
> admin click from working again. That's also why pinning is safe to do at all.

**Q: Where's the JWT stored, and is that safe?**

> localStorage, which is XSS-exposed. An httpOnly cookie with CSRF protection
> would be stronger. I chose localStorage for a simpler SPA flow — it's a
> deliberate trade, and I'd change it if this handled real money.

**Q: How do you stop fare tampering?**

> The client never sends a price. Fare is derived server-side from validated
> coordinates, so tampering with the request changes a *location*, not an amount.
> Coordinates are checked for shape and plausibility — they previously allowed
> `NaN` to be persisted, which is really an unvalidated price since fare comes
> from distance.

**Q: How do you verify someone is a genuine exam candidate?**

> You can't, digitally. Only the exam authority knows, and there's no public API.
> The one legitimate route is DigiLocker, which needs partner-organisation
> onboarding a student project can't get.
>
> So rather than fake a "verified" badge, I layered what I *can* honestly do:
> Google sign-in so it isn't a throwaway account, a real payment so there's skin
> in the game, and a human admit-card check at boarding via the QR. The app
> verifies the ticket; a person verifies the person. I'd rather ship an honest
> boundary than security theatre.

---

## 8. Testing, scale and engineering practice

**Q: How did you test something as stateful as routing?**

> Against a real MongoDB, because much of what's under test *is* database
> behaviour — the `2dsphere` index behind `$near`, the unique index that prevents
> double booking, Mongoose casting. A stubbed driver would agree with whatever my
> code expected and prove nothing.
>
> And I test properties rather than exact outputs: capacity is never exceeded even
> when every student lives at the same coordinates, nobody is lost, re-running
> leaves no orphans, the combined strategy is never worse than k-means alone, and
> the same cohort always produces the same buses.

**Q: What's in your CI?**

> The server suite against a `mongo:7` service container with `REQUIRE_DB=1`, plus
> a production client build, with `TZ=UTC` set explicitly.
>
> `REQUIRE_DB` has a story. Locally, if no database is reachable, the integration
> specs skip with a warning rather than failing the build with an infrastructure
> error that looks like a code defect. That's the right default on a laptop and
> the *wrong* one in CI — my suite was skipping 47 integration tests and exiting
> green. So CI turns a missing database from a footnote into a failure.

**Q: Give me a test you're proud of.**

> Two racing calls to the routing engine, asserting that exactly one succeeds, the
> other gets a 409, and the sitting is left consistent rather than half-rebuilt.
> It's the one that proves the lock does what I claim.
>
> Or the payment one: I forge signatures with the same HMAC Razorpay uses, so I
> can drive every path — a genuine signature is accepted, a forged one refused,
> one signed with the wrong secret refused, and a genuine signature for a
> *different* order can't settle this booking.

**Q: What breaks first at 100× the traffic?**

> Routing is the CPU-bound part and it currently runs inside the API process, on a
> timer in that same process. That's the real design smell at scale. Stop lookup
> is one indexed query per booking, which is fine.

**Q: How would you scale it?**

> Routing is per sitting per centre, so it's embarrassingly parallel — move it to
> a worker queue, one job per centre. Beyond a few thousand students per centre
> I'd swap the heuristics for OR-Tools.

---

## 9. The three stories

Interviewers remember stories, not features. Know these three properly and you
can fill any gap in the conversation.

### The one about optimising the wrong thing

> I used k-means to cluster students geographically. Textbook choice, and it
> produced correct k-means output — nothing crashed, nothing looked wrong.
>
> Then I drew a route on a map and looked at it. k-means makes round clusters. A
> good bus route is a corridor along one highway. In k-means terms that's a
> high-variance cluster — exactly the shape it's built to avoid.
>
> The code wasn't buggy. It was optimising the wrong thing, and the only way to
> see that was to check output I'd assumed was correct.

**Use it for:** "what was hardest", "tell me about a technical decision",
"when did you realise you were wrong".

### The one about Express 4

> Most of my controllers were `async` with no try/catch, and I assumed my error
> middleware would catch anything thrown. It doesn't — Express 4 predates
> async/await, so a rejected promise never reaches `next()`.
>
> Hitting something as ordinary as `/api/bookings/not-a-valid-id` produced a
> Mongoose CastError that became an unhandled rejection: the request hung until
> the client timed out, and on modern Node the process can be torn down entirely.
> A malformed URL could have taken down my API.
>
> Every controller is now wrapped once, centrally, so no handler can be
> registered unwrapped by accident.

**Use it for:** "hardest bug", "something you learned about your framework",
any backend-leaning role.

### The one about the ticket that said 07:10 twice

> A ticket read "be at your stop by 07:10" directly above "bus departs 07:10".
> Zero buffer. A schedule that only works if nobody is ever thirty seconds late.
>
> And the cost of waiting isn't paid by the person who's late — a bus that waits
> two minutes at each of six stops reaches the centre twelve minutes behind, for
> all forty people aboard, on the morning of an exam with a hard gate time.
>
> So every stop now carries two times: when the bus is there, and what the
> passenger was told, ten minutes earlier. The buffer is a promise to the
> passenger, not slack in the route — there's a test pinning that departure,
> legs and arrival don't move, because the obvious wrong fix makes the whole
> schedule drift earlier on every re-run.

**Use it for:** "attention to detail", "how do you think about users",
"a small thing that mattered".

---

## 10. Limitations — say these before they ask

Volunteering a real weakness is the single strongest move available. Candidates
who claim their project is flawless get picked apart; candidates who name their
own limits sound like they measured their work.

**Passenger ride time isn't in the objective.**

> The clustering scores bus count first and kilometres second, with no term for
> how long any individual passenger sits on the bus. So the first town on a long
> corridor can end up riding the whole detour — I have a case in the seeded data
> where a three-hour journey becomes six. The fix is to weight the cost function
> by passenger-minutes, or cap ride time and accept an extra bus. That's trading
> cost against comfort, which is genuinely an operator's decision.

**There are no notifications.**

> I removed email entirely. It couldn't be delivered reliably without a domain I
> own and have verified, and a confirmation that silently doesn't arrive is worse
> than none — the student stops looking for the information and starts waiting
> for it. So the ticket lives in the app instead, and nothing about the journey
> depends on a message that might not arrive. For this audience the right channel
> is SMS, not email, and that's the next thing I'd add.

**Boarding needs an admin account.**

> The boarding list and the board endpoint are admin-only, so in practice bus
> staff share one account or an admin travels. A conductor role existed and I
> removed it — it was only reachable by an admin granting it, so an account type
> nobody is ever given is surface to maintain rather than protection. The
> consistent fix is the pattern I already use for drivers, a per-bus capability
> link, but the boarding list carries passenger phone numbers so that link needs
> a tighter scope first.

**On AI assistance, if asked:** say yes, plainly. It's near-universal and not
disqualifying. What *is* disqualifying is denying it and then failing a question
about your own code. The defensible and true position: you scoped it, made the
design decisions, found the bugs, and understand every part — which is what
every question in this file actually tests.

---

## 11. Numbers

Every figure here is checkable from the repo. Don't round them up.

| Fact | Value |
|---|---|
| Bus capacity | 40 seats, companions included |
| Catchment radius | 5 km |
| Routing improvement | 10–18% shorter than k-means alone |
| Tests | 181, unit + integration |
| Boarding buffer | 10 minutes |
| Subsidy | 5% per 50 km, capped at 50% |
| Refund tiers | 100% >72h · 50% >24h · 0% inside 24h |
| Safety buffer | Never plan later than gate close − 60 min |
| Booking deadline | 4 days before the exam's first sitting |
| Seeded data | 8 exams · 25 sittings · 22 cities · 44 stops |
| Demo cohort | 119 students · Jaipur 98 → 149 seats → 4 buses |
| Driver token | 24 random bytes |
| Routing lock expiry | 5 minutes |
| Routing sweep | Every 5 minutes, and at boot |

---

## 12. In the room

**Before you start**

- Open the live site in a tab and **wake the API** — Render's free tier sleeps,
  and a 30-second blank screen at the wrong moment is a bad look.
- Have the routing engine file open in your editor, ready to screen-share.

**How to answer**

- Give the short answer first. Stop. Let them ask for more.
- When you name a technology, be ready for "why that one, and what's the
  alternative?" Every term you use is a door you're inviting them to open.
- If you don't know something, say so and then say what you'd do to find out.
  That's a better answer than a confident guess, and they can tell the
  difference.

**If you blank**

Screen-share. Go to **Admin → Run routing engine**. Five buses draw themselves
onto maps with their routes. It's genuinely impressive to watch, and it buys you
thirty seconds to find your footing.

**The one thing to remember**

You're not presenting features — you're presenting judgement. Anyone can list
"MERN, JWT, Razorpay". What separates you is being able to say: *this was wrong,
here's how I found it, here's what I changed, and here's what it cost me.*

You have four of those stories. Most candidates have none.
