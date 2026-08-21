# ExamRoute — how to talk about this project

Notes for interviews and viva. Not part of the app; skim before you walk in.

The single most useful framing: **you are not presenting features, you are presenting judgement.** Anyone can list "MERN, JWT, Razorpay". What separates a good candidate is being able to say *this was wrong, here is how I found it, here is what I changed, and here is what it cost me.* Every section below is built for that.

---

## 1. The 60-second pitch

> Students travelling to competitive exams — JEE, NEET, CUET — often have to reach an exam centre in another city by 7 AM, and public transport doesn't line up with exam timings. ExamRoute pools students from the same area onto a shared bus. You book a seat for a specific exam date and shift, the system works out your nearest pickup stop, and once bookings close a routing engine groups everyone into buses, orders the pickup stops, and computes a departure time by working *backwards* from the exam's gate-close deadline. Fares are subsidised more heavily the further you're travelling, which is the point — the students with the longest journeys are usually the ones least able to pay.

Then stop. Let them ask.

---

## 2. Lead with the hardest question, before they ask it

**"How do you verify someone is actually an exam candidate?"**

This is the question that sinks the project if it catches you off guard, and wins it if you raise it yourself.

> You can't, digitally. Only NTA knows who is registered, and there's no public API. The one legitimate route is DigiLocker, which requires partner-organisation onboarding I can't get as a student project. So rather than fake a "verified ✓" badge, I layered the deterrents I *can* honestly build: email OTP so it isn't a throwaway signup, a real payment so there's skin in the game, and a QR ticket that a conductor scans at boarding — and the conductor checks the physical admit card against the name and roll number on screen. The app verifies the ticket; a human verifies the person. I'd rather ship an honest boundary than a security theatre.

That answer demonstrates threat modelling, knowing the limits of your own system, and a willingness to say "I can't."

---

## 3. The engineering story: capacity-aware clustering

This is your strongest technical anecdote. Tell it as a *bug you found*, not a feature you built.

**The setup.** Routing groups students geographically with k-means, then hands each bus's stops to the Google Directions API with `optimize:true` to get the best visiting order.

**The bug.** I sized the number of buses as `k = ceil(totalSeats / capacity)`. That's correct arithmetic and completely insufficient — it fixes the bus *count* but nothing balances the *split*. K-means optimises for geographic compactness; it has no concept of capacity. With 60 seats and a 40-seat capacity you get k=2, and the split can land 55/5. The admin screen would print "55/40 seats" and nothing would stop it.

**The fix — two phases.**
- *Shape*: k-means groups students geographically, so each bus drives a compact route.
- *Repair*: any over-capacity cluster gives up its most **peripheral** member — the one farthest from that cluster's centroid — to the nearest cluster with room, or to a new bus if none has room.

**Two details worth volunteering:**

1. *Why the peripheral member?* Because evicting a central student tears a hole in the middle of an otherwise tight route. The peripheral one is the cheapest to give away geometrically.
2. *Why does it terminate?* Every move strictly decreases total overflow, so it can't loop. I still assert the capacity invariant before returning — if it ever fails, I want a loud error on the admin screen, not a bus with 55 people on it.

**Also worth mentioning:** I changed the k-means seeding. It originally seeded centroids from the first *k* points, which is a real problem here because bookings arrive in clumps — the first several students are often from the same town, so you get near-identical starting centroids and a bad local optimum. I switched to farthest-point seeding, which is deterministic, so the same input always produces the same routes. That matters for demos and for debugging.

**If asked "why not a proper VRP solver?"**
> Vehicle Routing is NP-hard. But I don't need to solve it from scratch — Directions already solves the sub-problem that matters, ordering five to ten stops, with real road data. Clustering plus delegation gets a correct answer in milliseconds and I can draw it on a whiteboard. If the scale grew to thousands of students per city I'd look at OR-Tools, but building that here would have been complexity I couldn't justify.

---

## 4. The bug that would have killed a live demo

**Express 4 does not catch rejected promises from `async` route handlers.**

> Most of my controllers were `async` with no try/catch. I assumed my error-handling middleware would catch anything thrown. It doesn't — Express 4 predates async/await, and a rejected promise never reaches `next()`. So hitting something as ordinary as `/api/bookings/not-a-valid-id` produced a Mongoose CastError that became an unhandled rejection: the request hung until the client timed out, and on modern Node the process can be torn down entirely. A malformed URL could take down my API.

> The fix is small but I made it structural. Rather than adding try/catch to thirty handlers and hoping I never forget one, I wrap every controller module in one place in the router, so a handler *can't* be registered unwrapped. Then I added a central error handler that maps error types to honest status codes — a bad ObjectId is a 400, not a 500, because it's the caller's mistake.

There's a test for exactly this: `answers 400 for a malformed id instead of hanging`.

---

## 5. The bug that only appears in production

**Timezone.**

> Exam times are IST wall-clock facts — "Shift 1 starts at 9:00 AM". I built them with `date.setHours(9)`, which silently uses the *server's* timezone. On my laptop, set to IST, everything looked perfect. Deployed to Render, which runs UTC, that same line stores 09:00Z — and a student in India sees their 9 AM shift displayed as 2:30 PM. The exam times would have been wrong for every user, and it would have worked flawlessly in every local test.

> I now build every exam time from explicit IST components into a correct UTC instant, and the client formats back to `Asia/Kolkata` rather than trusting the browser's timezone. The thing I'm most pleased with: the test suite runs with `TZ=UTC`, so if anyone reintroduces local-time arithmetic, a test fails immediately instead of it surviving all the way to deploy.

This is a great answer because "works on my machine" is a universally understood failure, and you're showing you engineered the *class* of bug out, not just the instance.

---

## 6. The access-control story

> My conductor and driver features both required the admin login. Which meant that in practice, to run a real trip, I'd hand every bus driver the credential that can also re-run routing, read every student's home address and phone number, and see every booking. The "driver link" on my admin page was actively misleading — it didn't grant access to anything; you still needed the admin password to use it.

> I split it three ways. Conductors got their own role, so boarding a passenger no longer requires admin. Drivers got something different: a capability link. Each bus carries a random 24-byte token, and that URL authorises exactly one bus and exactly two actions — read this route, report this position. A driver needs no account at all. And because links get shared over WhatsApp and printed on paper, I added rotation: issuing a new token instantly kills the old link.

**Expect the follow-up: "isn't a URL that anyone can use insecure?"** Have this ready:

> It's a deliberate trade-off, and the same pattern as a Google Docs "anyone with the link" share or a password-reset URL. The token is 24 random bytes, so it's not guessable. The blast radius is bounded — worst case, someone reports a false GPS position for one bus; they can't read passenger data or touch any other bus. And it's revocable in one click. The alternative, giving every driver an account, adds a whole user-management surface for a person who works one trip. If this went to production I'd add expiry tied to the trip window.

That last sentence matters. Knowing what you'd do *next* is as valuable as what you did.

---

## 6b. Refunds — the two-systems problem

Short, and it lands well, because it's the kind of thing people only learn by getting it wrong.

> When a student cancels, two things have to happen: release the seat, and send the money back. The seat is in my database. The money is at Razorpay. I control one of those and not the other, and the second one can fail.

> My first instinct was to refund first and only cancel if it succeeded — that feels safer. It isn't. If the gateway call times out, I don't know whether it worked, and the student is left holding a seat they've been told is cancelled. So I release the seat first, save it, and *then* attempt the refund. If the refund fails, the booking is marked `refundStatus: 'failed'` with the amount owed, and it shows up on the admin screen as "₹X still owed". The worst case is a number a human has to settle — visible and recoverable — instead of an inconsistency nobody can see.

Two details worth volunteering:

1. *The tiers are a pure function.* Refund percentage depends only on fare, gate-close time, and now — no database, no gateway. That means it's exactly unit-testable, and the same function backs the "what would I get back?" quote the student sees **before** confirming. Showing the refund amount only after an irreversible cancel would be a dark pattern.
2. *I round the refund down.* 50% of ₹777 is ₹388.50. Paying out ₹389 means cancel-and-rebook mints a rupee each cycle — trivial money, but it comes out of a subsidy budget, and the fix is one `Math.floor`.

**If asked what's still missing:** idempotency. If the process dies between placing the refund and saving the result, a retry could refund twice. Razorpay supports idempotency keys and I'd key one on the booking id.

---

## 6bb. The deploy that exposed a design flaw

Only surfaced when the app was first put on a real host — which is the point.

> Mock payments are blocked in production. That's deliberate: forgetting to
> configure Razorpay shouldn't be enough to expose an endpoint that marks a
> booking paid for free. Then I deployed the public demo, which *has* no
> Razorpay account, and discovered nobody could complete a booking. The
> protection was correct and the demo was broken by it.

> The tempting fix was to stop setting `NODE_ENV=production` on the demo. I
> didn't, because that one variable also enforces the 32-character minimum on
> `JWT_SECRET` and disables index reconciliation on boot — I'd have switched
> off three protections to solve one problem. The real issue was that I'd
> conflated two questions into one flag: *is this production?* and *is this
> deployment allowed to fake payments?* Those deserve separate answers. So
> production now blocks mock payments unless `ALLOW_MOCK_PAYMENTS=true` is
> explicitly set — an omission can't enable it, only a decision can.

Two details worth adding:

1. *It requires the exact string `true`.* Not `1`, not `yes`, not `TRUE`. A
   flag this dangerous shouldn't have a forgiving parser, and there's a test
   asserting each of those is rejected.
2. *It announces itself.* The server logs a loud warning at boot, and the
   frontend shows visitors a banner saying payments are simulated. Someone
   arriving from a link has no other way to know, and a payment screen that
   silently isn't one is exactly the kind of thing you say out loud.

**If they push on it:** yes, anyone who can set environment variables on the
server can already do anything. The threat model isn't a malicious operator,
it's a careless one — me, at 2 AM, deploying without keys.

---

## 6c. The two advisories I chose not to fix

If anyone runs `npm audit` on the repo — and an interviewer might — two
moderate react-router advisories are still open. Have the answer ready,
because "I read them" beats "I ran audit fix" every time.

> `npm audit` flags two react-router issues. Clearing them means jumping to
> v7, a breaking major, so I read them instead of reflexively upgrading. One
> is an open redirect through a backslash in `<Link>`/`useNavigate` — it needs
> a user-controlled destination, and every navigation target in this app is a
> literal or an id I generated. The other is constructor injection during SSR
> hydration, and this is a pure client-side SPA with no SSR at all. Neither is
> reachable here. The high-severity one, nanoid, *was* reachable in principle,
> so I fixed that one.

> If this were handling real money I'd schedule the v7 migration anyway,
> because "not exploitable today" is a statement about today's code.

The point being made: you can tell the difference between a vulnerability and
a vulnerability *in your application*, and you didn't destabilise a working
project the day before a demo to make a scanner quiet.

---

## 7. Security decisions, briefly

Have one sentence ready for each:

- **OTP** — 6 digits is a million possibilities. With no attempt cap, that's minutes of scripted guessing, so it isn't a control at all. I hash the code with bcrypt (a database dump shouldn't hand over live codes), cap it at 5 attempts per account, rate-limit per IP, and generate it with `crypto.randomInt` rather than `Math.random`, which is predictable and shouldn't generate anything credential-shaped.
- **Payments** — the Razorpay signature is recomputed server-side with an HMAC and compared in constant time, and I check the order id belongs to *that* booking. Trusting the browser's "payment succeeded" callback would make the payment step decorative.
- **Fare tampering** — fare is derived from distance, so an unvalidated coordinate pair is really an unvalidated price. Coordinates are checked for shape and plausibility server-side, and the client never sends an amount.
- **Enumeration** — the resend-OTP endpoint returns the same response whether or not the account exists, so it can't be used to discover which emails are registered.
- **The honest weakness** — the JWT lives in `localStorage`, which is exposed to XSS. An httpOnly cookie with CSRF protection is stronger. I chose `localStorage` for a simpler SPA flow and I'd change it if this handled real money.

Volunteering that last one is a strength, not a weakness. Candidates who claim their project is fully secure are the ones who get picked apart.

---

## 8. Testing — what to say

> Two layers, split by what they actually need. Unit tests for the algorithms — clustering, the IST time construction, the fare model — run anywhere with no infrastructure. Integration tests run against a real MongoDB rather than a mock, because a lot of what I'm testing *is* database behaviour: the `2dsphere` index behind the geofenced stop lookup, the unique compound index that makes double booking impossible under a race, Mongoose casting. Mocking the driver would just make the database agree with whatever I already believed.

> The tests I'd point at first are the capacity ones — including the pathological case where every student lives at the exact same coordinates, so k-means literally cannot separate them and only the repair phase can enforce capacity. That's the case that would have broken the old code.

---

## 9. If they ask what you'd do next

Don't say "nothing". Have three:

1. **Waitlist and overflow policy.** Right now a bus splits when it's full. Real operations need a decision about whether a marginal fourteenth passenger justifies a second bus, or whether they wait — that's a cost question, not a code question.
2. **Replace polling with WebSockets for live tracking.** Polling was the right call to ship it, but it doesn't scale past a few hundred concurrent students watching buses.
3. **Idempotency keys on the refund call.** If the process dies between placing a refund and saving the result, a retry could refund twice. Razorpay supports idempotency keys; I'd add one keyed on the booking id.

---

## 10. Things to avoid saying

- ❌ "It's fully secure." Nothing is, and it invites a hunt.
- ❌ "I used k-means for clustering" and then stopping. The interesting part is that k-means *wasn't enough*.
- ❌ Listing technologies. They can read the README. Tell them about a decision.
- ❌ Hiding the mock modes. They're a strength — say "it runs with no third-party accounts so a lapsed API key can't ruin a demo," not "that part isn't real."

---

## 11. Demo script (5 minutes, in order)

Rehearse this. Run `npm run seed && npm run seed:demo` beforehand so the data is fresh.

1. **Sign up** — show the OTP arriving in the server console. *"Real verification, no SMTP needed to demo it."*
2. **Book a seat** — drop a home pin, add a companion, show the fare breakdown. *"Distance-based, and the subsidy goes up with distance — that's the social point."*
3. **Admin → Run routing engine** — this is the moment. *"Jaipur has 55 seats against a 40-seat bus, so watch it split into two, each within capacity. This is the bug I described — k-means picks the bus count but doesn't balance the split."* Point at the seat bars.
4. **Driver link** — open in a private window to prove there's no login, hit Simulate driving.
5. **Track bus live** as the student, side by side. Bus moves.
6. **QR ticket → conductor boards them.** *"The app verified the ticket; the conductor verifies the person."*

Have the failure cases ready if they want to poke: hit `/api/bookings/garbage` and show a clean 400 rather than a hang; try to open another student's ticket and get a 403.
