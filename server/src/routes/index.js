import { Router } from 'express';
import { protect, allowRoles, adminOnly, driverTokenAuth } from '../middleware/auth.js';
import {
  authLimiter,
  otpVerifyLimiter,
  otpSendLimiter,
  driverLimiter,
} from '../middleware/rateLimit.js';
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
router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/verify-otp', otpVerifyLimiter, auth.verifyOtp);
router.post('/auth/resend-otp', otpSendLimiter, auth.resendOtp);
router.post('/auth/login', authLimiter, auth.login);
router.post('/auth/google', authLimiter, auth.googleLogin);
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
router.post('/bookings/:id/cancel', protect, bookings.cancelBooking);
router.get('/bookings/:id/bus-location', protect, bookings.busLocation);

// ------------------------------------------------------------ payments
router.post('/payments/order', protect, payments.createOrder);
router.post('/payments/verify', protect, payments.verifyPayment);
router.post('/payments/mock-confirm', protect, payments.mockConfirm);

// -------------------------------------------------- tickets (QR boarding)
// Reading a ticket is limited to its owner or a conductor; boarding is a
// conductor action. Neither requires full admin any more.
router.get('/tickets/:token', protect, tickets.getTicket);
router.post(
  '/tickets/:token/board',
  protect,
  allowRoles('conductor'),
  tickets.boardTicket
);

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
router.post(
  '/admin/bus/:busId/rotate-driver-token',
  protect,
  adminOnly,
  admin.rotateDriverToken
);
router.patch('/admin/users/role', protect, adminOnly, admin.setUserRole);

export default router;
