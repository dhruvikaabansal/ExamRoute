# ExamRoute 🚌

A ride-pooling platform for exam-goers. Students from the same area heading to the same exam center (JEE / NEET / CUET, etc.) get pooled onto a shared bus, with an auto-computed pickup route and departure time so nobody misses their exam.

Built with the **MERN** stack + **JWT** + **Google OAuth** + **Razorpay** + **Google Maps**.

---

## Features

- **Auth** — "Sign in with Google" (OAuth 2.0) → backend issues its own JWT.
- **Exam & center catalog** — seeded reference data for one state.
- **Booking + payment** — reserve a seat, pay via Razorpay (test mode), server-side signature verification.
- **Routing engine** — clusters paid students, builds pickup stops, uses Google Directions optimized-waypoints to order stops, and computes departure/pickup times by working backward from the exam reporting time.
- **Student dashboard** — see your assigned bus, pickup stop, route, and departure time.
- **Admin** — manage exams/centers and trigger routing for an exam.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React (Vite), React Router, Tailwind, Axios |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB (Atlas), `2dsphere` geo index |
| Auth | Google OAuth 2.0 → JWT |
| Payments | Razorpay |
| Maps | Google Maps Platform (Directions, Geocoding) |

---

## Project structure

```
ExamRoute/
├── package.json          # root: runs client + server together
├── server/               # Express API
│   ├── src/
│   │   ├── index.js
│   │   ├── config/db.js
│   │   ├── models/       # User, Exam, Center, Booking, Bus
│   │   ├── middleware/    # auth (JWT verify)
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/     # routingEngine, mapsService
│   │   └── seed/         # seed exams + centers for one state
│   └── .env.example
└── client/               # React (Vite) frontend
    └── src/
        ├── pages/
        ├── components/
        ├── context/AuthContext.jsx
        └── api/client.js
```

---

## Getting started

### 1. Prerequisites
- Node.js 18+
- A MongoDB Atlas cluster (free tier)
- A Google Cloud project with **OAuth 2.0 credentials** + **Maps Platform** enabled (Directions + Geocoding APIs)
- A Razorpay account (test mode keys)

### 2. Install
```bash
npm run install:all
```

### 3. Configure environment
Copy the example and fill in your keys:
```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### 4. Seed reference data
```bash
npm run seed
```

### 5. Run (both client + server)
```bash
npm run dev
```
- API → http://localhost:5000
- App → http://localhost:5173

---

## Environment variables

**server/.env**
```
PORT=5000
MONGO_URI=your_atlas_connection_string
JWT_SECRET=any_long_random_string
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=your_razorpay_secret
GOOGLE_MAPS_API_KEY=your_maps_key
CLIENT_URL=http://localhost:5173
```

**client/.env**
```
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
VITE_RAZORPAY_KEY_ID=rzp_test_xxx
```

---

## How the routing engine works

For a given `(exam, center)`, once bookings close:

1. **Cluster** paid students by home location, `k = ceil(students / busCapacity)` (k-means on lat/lng).
2. **Pick stops** — snap each student to the nearest known town pickup stop.
3. **Order stops** — call Google Directions with the stops as `waypoints` + `optimize:true`; Google returns the optimal order *and* leg durations.
4. **Compute timing** — `departure = reportingTime − totalTravel − buffer`; each stop's pickup time follows from cumulative leg durations.

We deliberately do **not** solve Vehicle Routing from scratch (it's NP-hard) — clustering + delegating stop-ordering to the Directions API keeps it simple, correct, and explainable.

> **Note:** `mapsService` ships with a graceful **mock mode** — if `GOOGLE_MAPS_API_KEY` is unset, it returns estimated straight-line durations so you can develop the whole flow before wiring real keys.

---

## 🗓️ One-week build plan

You're compressing an 8-week project into 7 days. This is aggressive but doable if you skip polish and keep scope locked to **one state**. The scaffold in this repo already covers most of Days 1–3.

| Day | Goal | Tasks |
|---|---|---|
| **Day 1** | Setup + Auth | Install, connect Atlas, get Google OAuth working end-to-end, JWT middleware, login on frontend. |
| **Day 2** | Data + catalog | Seed exams/centers/stops for one state. Build the exam list + center picker + "save home location" (map pin). |
| **Day 3** | Booking + Payment | Razorpay order → checkout → **server-side signature verify** → mark booking paid. Seat pooling. |
| **Day 4** | Routing engine | Clustering + stop selection + Directions optimized route + departure/pickup times. Admin "run routing" button. |
| **Day 5** | Student dashboard | Show assigned bus, pickup stop, route on a map, departure time. Email confirmation (optional). |
| **Day 6** | Testing + edge cases | Payment failure path, no-nearby-students, overflow split. A few API tests. Fix bugs. |
| **Day 7** | Polish + submit | README, architecture diagram, demo video, deploy (Vercel + Render + Atlas). |

**Cut-if-behind list (do these last / drop):** email notifications, live map polyline, admin analytics, refund flow. A working one-state MVP beats a broken "everything" app.

---

## Deployment (Day 7)
- **Frontend** → Vercel (set `VITE_*` env vars)
- **Backend** → Render or Railway (set all `server/.env` vars)
- **DB** → MongoDB Atlas (whitelist `0.0.0.0/0` for the demo)

---

## License
MIT
