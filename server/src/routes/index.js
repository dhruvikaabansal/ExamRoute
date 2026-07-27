import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  register,
  login,
  verifyOtp,
  resendOtp,
  googleLogin,
  getMe,
  updateProfile,
} from '../controllers/authController.js';
import {
  listExams,
  getExam,
  listSessionsForExam,
  listCentersForExam,
  createExam,
  createCenter,
} from '../controllers/examController.js';
import {
  quote,
  createBooking,
  myBookings,
  getBooking,
  busLocation,
} from '../controllers/bookingController.js';
import { createOrder, verifyPayment, mockConfirm } from '../controllers/paymentController.js';
import { getTicket, boardTicket } from '../controllers/ticketController.js';
import {
  runRouting,
  busesForSession,
  bookingsForSession,
  getBus,
  updateBusLocation,
} from '../controllers/adminController.js';

const router = Router();

// auth
router.post('/auth/register', register);
router.post('/auth/verify-otp', verifyOtp);
router.post('/auth/resend-otp', resendOtp);
router.post('/auth/login', login);
router.post('/auth/google', googleLogin);
router.get('/auth/me', protect, getMe);
router.patch('/auth/profile', protect, updateProfile);

// exams + sessions + centers
router.get('/exams', listExams);
router.get('/exams/:id', getExam);
router.get('/exams/:id/sessions', listSessionsForExam);
router.get('/exams/:id/centers', listCentersForExam);
router.post('/exams', protect, adminOnly, createExam);
router.post('/centers', protect, adminOnly, createCenter);

// bookings
router.post('/bookings/quote', protect, quote);
router.post('/bookings', protect, createBooking);
router.get('/bookings/mine', protect, myBookings);
router.get('/bookings/:id', protect, getBooking);
router.get('/bookings/:id/bus-location', protect, busLocation);

// payments
router.post('/payments/order', protect, createOrder);
router.post('/payments/verify', protect, verifyPayment);
router.post('/payments/mock-confirm', protect, mockConfirm);

// tickets (QR boarding). getTicket is readable by a logged-in conductor;
// boarding requires admin (the conductor account).
router.get('/tickets/:token', protect, getTicket);
router.post('/tickets/:token/board', protect, adminOnly, boardTicket);

// admin (routing per session; driver location updates)
router.post('/admin/route/:sessionId', protect, adminOnly, runRouting);
router.get('/admin/buses/:sessionId', protect, adminOnly, busesForSession);
router.get('/admin/bookings/:sessionId', protect, adminOnly, bookingsForSession);
router.get('/admin/bus/:busId', protect, adminOnly, getBus);
router.post('/admin/bus/:busId/location', protect, adminOnly, updateBusLocation);

export default router;
