import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { dbReady } from './db.js';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import Booking from '../src/models/Booking.js';
import Bus from '../src/models/Bus.js';
import ExamSession from '../src/models/ExamSession.js';
import { runRoutingForSession } from '../src/services/routingEngine.js';
import {
  makeUser,
  makeCenter,
  makeStops,
  makeExamWithSession,
  makePaidBooking,
  JAIPUR,
  SIKAR,
} from './factories.js';

let app;
beforeAll(() => {
  app = createApp();
});

const tokenFor = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

const asUser = (req, user) => req.set('Authorization', `Bearer ${tokenFor(user)}`);

describe.skipIf(!dbReady)('error handling', () => {
  /**
   * The regression that motivated the asyncHandler wrapper: Express 4 ignores
   * rejected promises from async handlers, so a malformed ObjectId used to
   * leave the request hanging until it timed out. A response at all — with the
   * right status — is the whole point of these two.
   */
  it('answers 400 for a malformed id instead of hanging', async () => {
    const user = await makeUser();
    const res = await asUser(request(app).get('/api/bookings/not-a-valid-id'), user);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('answers 404 for an unknown route', async () => {
    const res = await request(app).get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
  });

  it('answers 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
  });

  it('reports healthy', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe.skipIf(!dbReady)('auth', () => {
  /*
    Google is the only way in.

    Email and password with an OTP used to live here, and so did about a
    dozen tests covering code hashing, attempt caps and password reset. They
    went with the feature: the code could not be delivered from a free
    hosting tier, so the flow they protected was one nobody could complete.

    What is left tests the boundary that is genuinely ours. Verifying an ID
    token against Google is not something this suite can do offline — that
    needs Google's signing keys — so these cover the parts around it: the
    endpoint refuses what it should, the JWT it issues is what protects every
    other route, and nothing sensitive comes back on a user.
  */
  it('refuses a sign-in with no credential', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/credential/i);
  });

  it('refuses a credential that is not a valid Google token', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'not.a.real.token' });
    // 401 when a client id is configured and verification fails; 400 when
    // there is none to verify against. Both are refusals, and which one you
    // get is a deployment fact rather than a behaviour worth pinning.
    expect([400, 401]).toContain(res.status);
  });

  /*
    The guest account exists so the app can be evaluated without handing a
    Google account to a stranger's project. It is deliberately low-value —
    these assertions are what keeps it that way.
  */
  it('issues a usable session with no credential at all', async () => {
    const res = await request(app).post('/api/auth/demo');
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.isDemo).toBe(true);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
  });

  it('gives every visitor their own account, not a shared one', async () => {
    const a = await request(app).post('/api/auth/demo');
    const b = await request(app).post('/api/auth/demo');
    expect(a.body.user._id).not.toBe(b.body.user._id);
  });

  /*
    The one that matters. ADMIN_EMAIL promotes an account on sign-in, and a
    public endpoint that could ever mint an admin would hand the routing
    engine and every student's address to anyone who found the URL.
  */
  it('never mints an admin, whatever ADMIN_EMAIL is set to', async () => {
    const saved = process.env.ADMIN_EMAIL;
    try {
      // Deliberately hostile: match the pattern demo emails are built from.
      process.env.ADMIN_EMAIL = 'demo-00000000@examroute.invalid';
      const res = await request(app).post('/api/auth/demo');
      expect(res.body.user.role).toBe('student');

      const blocked = await request(app)
        .get('/api/admin/buses/000000000000000000000000')
        .set('Authorization', `Bearer ${res.body.token}`);
      expect(blocked.status).toBe(403);
    } finally {
      if (saved === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = saved;
    }
  });

  it('can be switched off on a deployment that does not want it', async () => {
    const saved = process.env.ENABLE_DEMO_LOGIN;
    try {
      process.env.ENABLE_DEMO_LOGIN = 'false';
      const res = await request(app).post('/api/auth/demo');
      expect(res.status).toBe(403);
    } finally {
      if (saved === undefined) delete process.env.ENABLE_DEMO_LOGIN;
      else process.env.ENABLE_DEMO_LOGIN = saved;
    }
  });

  it('rejects requests with no or invalid token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', 'Bearer nonsense')).status
    ).toBe(401);
  });

  it('accepts our own JWT and returns the signed-in user', async () => {
    const user = await makeUser({ email: 'me@examroute.test' });
    const res = await asUser(request(app).get('/api/auth/me'), user);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@examroute.test');
  });

  /*
    Deliberately still checked even though the fields no longer exist. The
    serialiser is the last line before a response leaves the building, and a
    test that only asserts what is currently there stops being a guard the
    moment somebody adds a field.
  */
  it('never returns credential fields on a user', async () => {
    const user = await makeUser();
    const res = await asUser(request(app).get('/api/auth/me'), user);
    expect(res.status).toBe(200);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.otpHash).toBeUndefined();
    expect(res.body.user.googleId).toBeUndefined();
  });

  it('lets a signed-in user save their home location and phone', async () => {
    const user = await makeUser();
    const res = await asUser(request(app).patch('/api/auth/profile'), user).send({
      coordinates: [75.7873, 26.9124],
      address: 'Jaipur',
      phone: '9876543210',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.homeLocation.coordinates).toEqual([75.7873, 26.9124]);
    expect(res.body.user.phone).toBe('9876543210');
  });

  it('refuses a phone number that is not a valid Indian mobile', async () => {
    const user = await makeUser();
    const res = await asUser(request(app).patch('/api/auth/profile'), user).send({
      phone: '12345',
    });
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!dbReady)('booking rules', () => {
  async function setup(examOpts = {}) {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await makeExamWithSession(examOpts);
    const user = await makeUser();
    return { center, exam, session, user };
  }

  const bookingBody = (exam, session, center, extra = {}) => ({
    examId: exam._id,
    sessionId: session._id,
    centerId: center._id,
    coordinates: SIKAR,
    rollNumber: '2601000999',
    companions: 0,
    ...extra,
  });

  it('books a seat and prices it server-side', async () => {
    const { exam, session, center, user } = await setup();
    const res = await asUser(
      request(app).post('/api/bookings').send(bookingBody(exam, session, center)),
      user
    );

    expect(res.status).toBe(201);
    expect(res.body.fare).toBeGreaterThan(0);
    expect(res.body.status).toBe('pending');
    expect(res.body.assignedStop?.name).toBeTruthy();
  });

  /*
    Abandoning the payment sheet is ordinary — the card is in the other room,
    the UPI app does not open. The unpaid booking stays behind, and a flat
    "you already booked this session" on the next attempt was a dead end: the
    seat was reserved, unpaid, and unreachable from the page the student was
    standing on.
  */
  it('resumes an unpaid booking instead of refusing a second attempt', async () => {
    const { exam, session, center, user } = await setup();
    const body = bookingBody(exam, session, center);

    const first = await asUser(request(app).post('/api/bookings').send(body), user);
    expect(first.status).toBe(201);

    const second = await asUser(request(app).post('/api/bookings').send(body), user);
    expect(second.status).toBe(200);
    expect(second.body.resumed).toBe(true);
    expect(second.body._id).toBe(first.body._id); // the same seat, not a new one

    // And still exactly one, because the unique index is what it was protecting.
    const count = await Booking.countDocuments({ user: user._id, session: session._id });
    expect(count).toBe(1);
  });

  it('applies changes made on the second attempt', async () => {
    const { exam, session, center, user } = await setup();
    await asUser(
      request(app).post('/api/bookings').send(bookingBody(exam, session, center)),
      user
    );

    // Came back to add a parent — the usual reason for abandoning the first go.
    const again = await asUser(
      request(app)
        .post('/api/bookings')
        .send(bookingBody(exam, session, center, { companions: 1 })),
      user
    );
    expect(again.status).toBe(200);
    expect(again.body.seats).toBe(2);
    expect(again.body.fare).toBeGreaterThan(0);
  });

  it('still refuses a second booking once the first is paid', async () => {
    const { exam, session, center, user } = await setup();
    const first = await asUser(
      request(app).post('/api/bookings').send(bookingBody(exam, session, center)),
      user
    );
    await Booking.findByIdAndUpdate(first.body._id, { status: 'paid' });

    const second = await asUser(
      request(app).post('/api/bookings').send(bookingBody(exam, session, center)),
      user
    );
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/already paid/i);
  });

  it('rejects coordinates outside India', async () => {
    const { exam, session, center, user } = await setup();
    const res = await asUser(
      request(app)
        .post('/api/bookings')
        .send(bookingBody(exam, session, center, { coordinates: [-74.006, 40.7128] })),
      user
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/outside India/i);
  });

  it('rejects non-numeric coordinates instead of storing NaN', async () => {
    const { exam, session, center, user } = await setup();
    const res = await asUser(
      request(app)
        .post('/api/bookings')
        .send(bookingBody(exam, session, center, { coordinates: ['a', 'b'] })),
      user
    );
    expect(res.status).toBe(400);
    expect(await Booking.countDocuments()).toBe(0);
  });

  it('rejects a session that belongs to a different exam', async () => {
    const { exam, center, user } = await setup();
    const other = await makeExamWithSession({ code: 'NEET' });
    const res = await asUser(
      request(app)
        .post('/api/bookings')
        .send(bookingBody(exam, other.session, center)),
      user
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not belong/i);
  });

  it('refuses a booking after the deadline has passed', async () => {
    // Sitting is still ahead, but the booking window closed yesterday.
    const { exam, session, center, user } = await setup({
      daysAway: 10,
      deadlineDaysAway: -1,
    });
    const res = await asUser(
      request(app).post('/api/bookings').send(bookingBody(exam, session, center)),
      user
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/closed/i);
  });

  it('refuses a booking for a sitting that already happened', async () => {
    const { exam, session, center, user } = await setup({
      daysAway: -2,
      deadlineDaysAway: -5,
    });
    const res = await asUser(
      request(app).post('/api/bookings').send(bookingBody(exam, session, center)),
      user
    );
    expect(res.status).toBe(400);
  });

  /*
    This used to assert a 409 on the second attempt, and that assertion went
    when resuming replaced refusing. The rule it was really protecting is
    unchanged — one seat per student per sitting — so it is checked here at
    the level that actually enforces it.

    The controller looks for an existing booking first, but a check-then-write
    is not a guarantee: two requests can both pass the check before either
    writes. The unique index is what makes it true under a race, and that is
    what this asserts, by going around the controller entirely.
  */
  it('cannot hold two seats on one sitting, even bypassing the API', async () => {
    const { exam, session, center, user } = await setup();
    const body = bookingBody(exam, session, center);

    const first = await asUser(request(app).post('/api/bookings').send(body), user);
    expect(first.status).toBe(201);

    const direct = Booking.create({
      user: user._id,
      exam: exam._id,
      session: session._id,
      center: center._id,
      rollNumber: '2601000999',
      homeLocation: { type: 'Point', coordinates: SIKAR },
      seats: 1,
      fare: 100,
      status: 'pending',
    });

    await expect(direct).rejects.toThrow(/duplicate key|E11000/i);
    expect(await Booking.countDocuments({ user: user._id, session: session._id })).toBe(1);
  });

  /**
   * Boarding is a person comparing an admit card to the roll number on
   * screen. A paid booking with no number cannot be verified at the door, so
   * it must not be creatable — this used to be an optional field.
   */
  it('refuses a booking with no application number', async () => {
    const { exam, session, center, user } = await setup();
    const res = await asUser(
      request(app)
        .post('/api/bookings')
        .send(bookingBody(exam, session, center, { rollNumber: '' })),
      user
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/roll number/i);
    expect(await Booking.countDocuments()).toBe(0);
  });

  it('refuses an implausible application number', async () => {
    const { exam, session, center, user } = await setup();
    for (const rollNumber of ['abc', 'x'.repeat(30), 'has spaces', '12/34/56']) {
      const res = await asUser(
        request(app)
          .post('/api/bookings')
          .send(bookingBody(exam, session, center, { rollNumber })),
        user
      );
      expect(res.status).toBe(400);
    }
    expect(await Booking.countDocuments()).toBe(0);
  });

  it('normalises the application number so boarding compares like with like', async () => {
    const { exam, session, center, user } = await setup();
    const res = await asUser(
      request(app)
        .post('/api/bookings')
        .send(bookingBody(exam, session, center, { rollNumber: '  rj26-000123  ' })),
      user
    );
    expect(res.status).toBe(201);
    expect(res.body.rollNumber).toBe('RJ26-000123');
  });

  it('clamps companions to the supported range', async () => {
    const { exam, session, center, user } = await setup();
    const res = await asUser(
      request(app)
        .post('/api/bookings')
        .send(bookingBody(exam, session, center, { companions: 9 })),
      user
    );
    expect(res.status).toBe(400);
  });

  it('does not let one student read another student’s booking', async () => {
    const { exam, session, center, user } = await setup();
    const booking = await makePaidBooking({
      user, exam, session, center, coordinates: SIKAR,
    });
    const stranger = await makeUser();

    const res = await asUser(request(app).get(`/api/bookings/${booking._id}`), stranger);
    expect(res.status).toBe(404);
  });

  it('cancels a seat and frees the capacity', async () => {
    const { exam, session, center, user } = await setup();
    const booking = await makePaidBooking({
      user, exam, session, center, coordinates: SIKAR,
    });

    const res = await asUser(
      request(app).post(`/api/bookings/${booking._id}/cancel`),
      user
    );
    expect(res.status).toBe(200);

    const { buses } = await runRoutingForSession(session._id);
    expect(buses).toEqual([]);
  });
});

describe.skipIf(!dbReady)('cancellation and refunds', () => {
  async function setup(examOpts = {}) {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await makeExamWithSession(examOpts);
    const user = await makeUser();
    return { center, exam, session, user };
  }

  const paidSeat = async (opts = {}) => {
    const ctx = await setup(opts.exam);
    const booking = await makePaidBooking({
      ...ctx, coordinates: SIKAR, status: opts.status || 'paid',
    });
    return { ...ctx, booking };
  };

  it('quotes the refund before the student commits to cancelling', async () => {
    // 21 days out, so comfortably inside the full-refund window.
    const { booking, user } = await paidSeat();
    const res = await asUser(
      request(app).get(`/api/bookings/${booking._id}/refund-quote`),
      user
    );

    expect(res.status).toBe(200);
    expect(res.body.percent).toBe(100);
    expect(res.body.amount).toBe(booking.fare);
    expect(res.body.reason).toBeTruthy();
  });

  it('quotes and refunds the same amount — the student is not shown one number and paid another', async () => {
    const { booking, user } = await paidSeat();
    const quote = await asUser(
      request(app).get(`/api/bookings/${booking._id}/refund-quote`),
      user
    );
    const cancel = await asUser(
      request(app).post(`/api/bookings/${booking._id}/cancel`),
      user
    );

    expect(cancel.status).toBe(200);
    expect(cancel.body.refund.amount).toBe(quote.body.amount);
  });

  it('marks the refund processed and records the amount', async () => {
    const { booking, user } = await paidSeat();
    await asUser(request(app).post(`/api/bookings/${booking._id}/cancel`), user);

    const saved = await Booking.findById(booking._id);
    expect(saved.status).toBe('cancelled');
    expect(saved.refundStatus).toBe('processed');
    expect(saved.refundAmount).toBe(booking.fare);
    expect(saved.refundedAt).toBeTruthy();
  });

  it('refunds nothing for a seat that was never paid for', async () => {
    const { booking, user } = await paidSeat({ status: 'pending' });
    const res = await asUser(
      request(app).post(`/api/bookings/${booking._id}/cancel`),
      user
    );

    expect(res.status).toBe(200);
    expect(res.body.refund.amount).toBe(0);
    expect((await Booking.findById(booking._id)).refundStatus).toBe('none');
  });

  it('refunds nothing when the exam is imminent — the seat cannot be resold', async () => {
    const { booking, session, user } = await paidSeat();

    // Pull the gate close to two hours from now. Setting it explicitly rather
    // than seeding the sitting "one day away" keeps the test independent of
    // what time of day it happens to run — otherwise it lands either side of
    // the 24-hour boundary depending on the clock.
    await ExamSession.findByIdAndUpdate(session._id, {
      gateClose: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });

    const res = await asUser(
      request(app).post(`/api/bookings/${booking._id}/cancel`),
      user
    );

    expect(res.status).toBe(200);
    expect(res.body.refund.percent).toBe(0);
    expect(res.body.refund.amount).toBe(0);
    // The seat is still released, even though no money goes back.
    expect((await Booking.findById(booking._id)).status).toBe('cancelled');
  });

  it('refuses to cancel twice, so a refund cannot be issued twice', async () => {
    const { booking, user } = await paidSeat();
    expect(
      (await asUser(request(app).post(`/api/bookings/${booking._id}/cancel`), user)).status
    ).toBe(200);

    const second = await asUser(
      request(app).post(`/api/bookings/${booking._id}/cancel`),
      user
    );
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/already cancelled/i);
  });

  it('does not let one student cancel another student’s booking', async () => {
    const { booking } = await paidSeat();
    const stranger = await makeUser();

    const res = await asUser(
      request(app).post(`/api/bookings/${booking._id}/cancel`),
      stranger
    );
    expect(res.status).toBe(404);
    expect((await Booking.findById(booking._id)).status).toBe('paid');
  });

  it('refuses to cancel a booking that has already boarded', async () => {
    const { booking, user } = await paidSeat();
    await Booking.findByIdAndUpdate(booking._id, { boarded: true });

    const res = await asUser(
      request(app).post(`/api/bookings/${booking._id}/cancel`),
      user
    );
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!dbReady)('roles and access control', () => {
  async function boardingSetup() {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await makeExamWithSession();
    const student = await makeUser();
    const booking = await makePaidBooking({
      user: student, exam, session, center, coordinates: JAIPUR,
    });
    const staff = await makeUser({ role: 'admin' });
    return { center, exam, session, student, booking, staff };
  }

  it('lets a student read their own ticket', async () => {
    const { student, booking } = await boardingSetup();
    const res = await asUser(request(app).get(`/api/tickets/${booking.ticketToken}`), student);
    expect(res.status).toBe(200);
    expect(res.body.rollNumber).toBe('2601000123');
  });

  it('blocks a student from reading someone else’s ticket', async () => {
    const { booking } = await boardingSetup();
    const stranger = await makeUser();
    const res = await asUser(request(app).get(`/api/tickets/${booking.ticketToken}`), stranger);
    expect(res.status).toBe(403);
  });

  it('withholds the passenger phone number from students', async () => {
    const { student, booking } = await boardingSetup();
    const res = await asUser(request(app).get(`/api/tickets/${booking.ticketToken}`), student);
    expect(res.body.phone).toBeUndefined();
  });

  it('lets staff board a passenger', async () => {
    const { booking } = await boardingSetup();
    const staff = await makeUser({ role: 'admin' });

    const res = await asUser(
      request(app).post(`/api/tickets/${booking.ticketToken}/board`),
      staff
    );
    expect(res.status).toBe(200);
    expect((await Booking.findById(booking._id)).boarded).toBe(true);
  });

  it('stops a student boarding themselves', async () => {
    const { student, booking } = await boardingSetup();
    const res = await asUser(
      request(app).post(`/api/tickets/${booking.ticketToken}/board`),
      student
    );
    expect(res.status).toBe(403);
  });

  it('refuses to board the same ticket twice', async () => {
    const { booking } = await boardingSetup();
    const staff = await makeUser({ role: 'admin' });
    const board = () =>
      asUser(request(app).post(`/api/tickets/${booking.ticketToken}/board`), staff);

    expect((await board()).status).toBe(200);
    expect((await board()).status).toBe(409);
  });

  it('refuses to board an unpaid ticket', async () => {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await makeExamWithSession();
    const booking = await makePaidBooking({
      user: await makeUser(), exam, session, center, coordinates: JAIPUR, status: 'pending',
    });
    const staff = await makeUser({ role: 'admin' });

    const res = await asUser(
      request(app).post(`/api/tickets/${booking.ticketToken}/board`),
      staff
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not paid/i);
  });

  it('keeps a student out of admin routing', async () => {
    const { session, student } = await boardingSetup();
    const res = await asUser(request(app).post(`/api/admin/route/${session._id}`), student);
    expect(res.status).toBe(403);
  });

  /**
   * Scanning tickets one at a time answers "is this person allowed on?" but
   * never "who is still missing?" — which is the question that decides whether
   * the bus waits.
   */
  it('lists everyone on a bus, grouped by pickup stop, with who is still missing', async () => {
    const { session, staff } = await boardingSetup();
    const { buses } = await runRoutingForSession(session._id);
    const bus = buses[0];

    const res = await asUser(request(app).get(`/api/admin/bus/${bus._id}/manifest`), staff);

    expect(res.status).toBe(200);
    expect(res.body.totals.passengers).toBeGreaterThan(0);
    expect(res.body.totals.boarded).toBe(0);
    expect(res.body.totals.remaining).toBe(res.body.totals.passengers);
    expect(res.body.stops.length).toBeGreaterThan(0);
    expect(res.body.stops[0].passengers[0].rollNumber).toBeTruthy();
  });

  it('counts a passenger as boarded on the manifest once they board', async () => {
    const { session, staff, booking } = await boardingSetup();
    const { buses } = await runRoutingForSession(session._id);
    const bus = buses[0];

    await asUser(request(app).post(`/api/tickets/${booking.ticketToken}/board`), staff);
    const res = await asUser(request(app).get(`/api/admin/bus/${bus._id}/manifest`), staff);

    expect(res.body.totals.boarded).toBe(1);
    expect(res.body.totals.remaining).toBe(res.body.totals.passengers - 1);
  });

  it('keeps students out of the boarding list — it carries phone numbers', async () => {
    const { session, student } = await boardingSetup();
    const { buses } = await runRoutingForSession(session._id);
    const res = await asUser(
      request(app).get(`/api/admin/bus/${buses[0]._id}/manifest`),
      student
    );
    expect(res.status).toBe(403);
  });

  it('keeps a student out of admin endpoints', async () => {
    const { session } = await boardingSetup();
    const student = await makeUser();
    expect(
      (await asUser(request(app).get(`/api/admin/buses/${session._id}`), student)).status
    ).toBe(403);
  });
});

describe.skipIf(!dbReady)('driver capability link', () => {
  async function routedBus() {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await makeExamWithSession();
    await makePaidBooking({
      user: await makeUser(), exam, session, center, coordinates: JAIPUR,
    });
    const { buses } = await runRoutingForSession(session._id);
    return buses[0];
  }

  it('lets a driver post location with no account at all', async () => {
    const bus = await routedBus();
    const res = await request(app)
      .post(`/api/driver/${bus.driverToken}/location`)
      .send({ lng: 75.79, lat: 26.92 });

    expect(res.status).toBe(200);
    const updated = await Bus.findById(bus._id);
    expect(updated.currentLocation.lat).toBeCloseTo(26.92, 5);
  });

  it('rejects an unknown or malformed token', async () => {
    expect(
      (await request(app).post('/api/driver/deadbeef/location').send({ lng: 75, lat: 26 }))
        .status
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(`/api/driver/${'a'.repeat(48)}/location`)
          .send({ lng: 75, lat: 26 })
      ).status
    ).toBe(401);
  });

  it('rejects nonsense coordinates', async () => {
    const bus = await routedBus();
    const res = await request(app)
      .post(`/api/driver/${bus.driverToken}/location`)
      .send({ lng: 'north', lat: 26 });
    expect(res.status).toBe(400);
  });

  it('scopes the token to one bus — rotating it invalidates the old link', async () => {
    const bus = await routedBus();
    const original = bus.driverToken;
    const admin = await makeUser({ role: 'admin' });

    const rotated = await asUser(
      request(app).post(`/api/admin/bus/${bus._id}/rotate-driver-token`),
      admin
    );
    expect(rotated.status).toBe(200);
    expect(rotated.body.driverToken).not.toBe(original);

    const stale = await request(app)
      .post(`/api/driver/${original}/location`)
      .send({ lng: 75, lat: 26 });
    expect(stale.status).toBe(401);
  });
});

describe.skipIf(!dbReady)('payments', () => {
  it('will not let a student pay for another student’s booking', async () => {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await makeExamWithSession();
    const booking = await makePaidBooking({
      user: await makeUser(), exam, session, center, coordinates: JAIPUR, status: 'pending',
    });
    const stranger = await makeUser();

    const res = await asUser(
      request(app).post('/api/payments/order').send({ bookingId: booking._id }),
      stranger
    );
    expect(res.status).toBe(404);
  });

  it('will not charge twice for a booking already paid', async () => {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await makeExamWithSession();
    const user = await makeUser();
    const booking = await makePaidBooking({
      user, exam, session, center, coordinates: JAIPUR, status: 'paid',
    });

    const res = await asUser(
      request(app).post('/api/payments/order').send({ bookingId: booking._id }),
      user
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already paid/i);
  });
});

describe.skipIf(!dbReady)('exam catalogue', () => {
  it('hides sittings that have already happened', async () => {
    const { exam } = await makeExamWithSession({ daysAway: -3, deadlineDaysAway: -6 });
    const res = await request(app).get(`/api/exams/${exam._id}/sessions`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('lists upcoming sittings', async () => {
    const { exam } = await makeExamWithSession({ daysAway: 14 });
    const res = await request(app).get(`/api/exams/${exam._id}/sessions`);
    expect(res.body).toHaveLength(1);
  });
});
