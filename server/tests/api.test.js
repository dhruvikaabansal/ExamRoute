import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { dbReady } from './db.js';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import Booking from '../src/models/Booking.js';
import Bus from '../src/models/Bus.js';
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
  it('rejects a weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'weak@examroute.test', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/8 characters/);
  });

  it('rejects a malformed email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('registers without issuing a token until the code is verified', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Asha', email: 'asha@examroute.test', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.needsVerification).toBe(true);
    expect(res.body.token).toBeUndefined();
  });

  it('never stores the OTP in plaintext', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bh', email: 'bh@examroute.test', password: 'password123' });

    const { default: User } = await import('../src/models/User.js');
    const user = await User.findOne({ email: 'bh@examroute.test' });
    expect(user.otpHash).toBeTruthy();
    expect(user.otpHash).toMatch(/^\$2[aby]\$/); // bcrypt
    expect(user.otpCode).toBeUndefined();
  });

  it('locks the account after repeated wrong codes', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ck', email: 'ck@examroute.test', password: 'password123' });

    // Five wrong guesses, then the sixth is refused outright rather than
    // simply being wrong — a 6-digit code is otherwise brute-forceable.
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'ck@examroute.test', code: '000000' });
      expect(res.status).toBe(400);
    }

    const locked = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'ck@examroute.test', code: '000000' });
    expect(locked.status).toBe(429);
  });

  it('does not reveal whether an email is registered', async () => {
    await makeUser({ email: 'known@examroute.test' });
    const known = await request(app)
      .post('/api/auth/resend-otp')
      .send({ email: 'known@examroute.test' });
    const unknown = await request(app)
      .post('/api/auth/resend-otp')
      .send({ email: 'nobody@examroute.test' });

    expect(known.status).toBe(unknown.status);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it('rejects requests with no or invalid token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', 'Bearer nonsense')).status
    ).toBe(401);
  });

  it('never returns password or OTP fields', async () => {
    const user = await makeUser();
    const res = await asUser(request(app).get('/api/auth/me'), user);
    expect(res.status).toBe(200);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.otpHash).toBeUndefined();
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

  it('prevents double booking the same sitting', async () => {
    const { exam, session, center, user } = await setup();
    const body = bookingBody(exam, session, center);

    expect((await asUser(request(app).post('/api/bookings').send(body), user)).status).toBe(201);
    const second = await asUser(request(app).post('/api/bookings').send(body), user);
    expect(second.status).toBe(409);
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

describe.skipIf(!dbReady)('roles and access control', () => {
  async function boardingSetup() {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await makeExamWithSession();
    const student = await makeUser();
    const booking = await makePaidBooking({
      user: student, exam, session, center, coordinates: JAIPUR,
    });
    return { center, exam, session, student, booking };
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

  it('withholds the passenger phone number from non-conductors', async () => {
    const { student, booking } = await boardingSetup();
    const res = await asUser(request(app).get(`/api/tickets/${booking.ticketToken}`), student);
    expect(res.body.phone).toBeUndefined();
  });

  it('lets a conductor board a passenger without admin rights', async () => {
    const { booking } = await boardingSetup();
    const conductor = await makeUser({ role: 'conductor' });

    const res = await asUser(
      request(app).post(`/api/tickets/${booking.ticketToken}/board`),
      conductor
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
    const conductor = await makeUser({ role: 'conductor' });
    const board = () =>
      asUser(request(app).post(`/api/tickets/${booking.ticketToken}/board`), conductor);

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
    const conductor = await makeUser({ role: 'conductor' });

    const res = await asUser(
      request(app).post(`/api/tickets/${booking.ticketToken}/board`),
      conductor
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not paid/i);
  });

  it('keeps a conductor out of admin routing', async () => {
    const { session } = await boardingSetup();
    const conductor = await makeUser({ role: 'conductor' });
    const res = await asUser(request(app).post(`/api/admin/route/${session._id}`), conductor);
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
