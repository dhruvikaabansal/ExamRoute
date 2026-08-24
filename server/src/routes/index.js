import { Router } from 'express';
import { protect, adminOnly, driverTokenAuth } from '../middleware/auth.js';
import { authLimiter, driverLimiter } from '../middleware/rateLimit.js';
import { wrapAll } from '../utils/asyncHandler.js';

import * as authController from '../controllers/authController.js';
import * as examController from '../controllers/examController.js';
import * as bookingController from '../controllers/bookingController.js';
import * as paymentController from '../controllers/paymentController.js';
import * as ticketController from '../controllers/ticketController.js';
import * as adminController from '../controllers/adminController.js';
import * as driverController from '../controllers/driverController.js';

/**
 * Every controller is wrapped once, here, so no handler can be registered
 * un-wrapped by accident. Express 4 ignores rejected promises from async
 * handlers; `wrapAll` routes them into the error middleware instead.
 */
const auth = wrapAll(authController);
const exams = wrapAll(examController);
const bookings = wrapAll(bookingController);
const payments = wrapAll(paymentController);
const tickets = wrapAll(ticketController);
const admin = wrapAll(adminController);
const driver = wrapAll(driverController);

const router = Router();

// ---------------------------------------------------------------- auth
// Google is the only way in. Email + password with an OTP was removed because
// the code could not be delivered from a free hosting tier, and an auth path
// that cannot deliver its credential only traps people. Still rate limited:
// the endpoint verifies a token against Google on every call, so it is worth
// a cap even though guessing a signed token is not the threat.
router.post('/auth/google', authLimiter, auth.googleLogin);
// A throwaway student account, so the app can be evaluated without handing a
// Google account to a stranger's project. Rate limited because it is public
// and it writes.
router.post('/auth/demo', authLimiter, auth.demoLogin);
router.get('/auth/me', protect, auth.getMe);
router.patch('/auth/profile', protect, auth.updateProfile);

// ------------------------------------------- exams + sessions + centres
router.get('/exams', exams.listExams);
router.get('/exams/:id', exams.getExam);
router.get('/exams/:id/sessions', exams.listSessionsForExam);
router.get('/exams/:id/centers', exams.listCentersForExam);
router.post('/exams', protect, adminOnly, exams.createExam);
router.post('/centers', protect, adminOnly, exams.createCenter);

// ------------------------------------------------------------ bookings
router.post('/bookings/quote', protect, bookings.quote);
router.post('/bookings', protect, bookings.createBooking);
router.get('/bookings/mine', protect, bookings.myBookings);
router.get('/bookings/:id', protect, bookings.getBooking);
router.get('/bookings/:id/refund-quote', protect, bookings.refundQuote);
router.post('/bookings/:id/cancel', protect, bookings.cancelBooking);
router.get('/bookings/:id/bus-location', protect, bookings.busLocation);

// ------------------------------------------------------------ payments
router.post('/payments/order', protect, payments.createOrder);
router.post('/payments/verify', protect, payments.verifyPayment);
router.post('/payments/mock-confirm', protect, payments.mockConfirm);

// -------------------------------------------------- tickets (QR boarding)
// Reading a ticket is limited to its owner or staff — an unguessable token is
// not authorisation, since students share ticket screenshots and the URL is
// printed under the QR code. Boarding is a staff action.
router.get('/tickets/:token', protect, tickets.getTicket);
router.post('/tickets/:token/board', protect, adminOnly, tickets.boardTicket);

// ------------------------------------------------- driver (capability link)
// No login: the token in the URL authorises exactly one bus.
router.get('/driver/:driverToken', driverLimiter, driverTokenAuth, driver.getDriverBus);
router.post(
  '/driver/:driverToken/location',
  driverLimiter,
  driverTokenAuth,
  driver.postDriverLocation
);

// --------------------------------------------------------------- admin
router.post('/admin/route/:sessionId', protect, adminOnly, admin.runRouting);
router.get('/admin/buses/:sessionId', protect, adminOnly, admin.busesForSession);
router.get('/admin/bookings/:sessionId', protect, adminOnly, admin.bookingsForSession);
router.get('/admin/bus/:busId', protect, adminOnly, admin.getBus);
router.get('/admin/bus/:busId/manifest', protect, adminOnly, admin.busManifest);
router.post(
  '/admin/bus/:busId/rotate-driver-token',
  protect,
  adminOnly,
  admin.rotateDriverToken
);

export default router;
