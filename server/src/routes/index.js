import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  register,
  login,
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
} from '../controllers/bookingController.js';
import { createOrder, verifyPayment } from '../controllers/paymentController.js';
import {
  runRouting,
  busesForSession,
  bookingsForSession,
} from '../controllers/adminController.js';

const router = Router();

// auth
router.post('/auth/register', register);
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

// payments
router.post('/payments/order', protect, createOrder);
router.post('/payments/verify', protect, verifyPayment);

// admin (routing runs per session, since each date+shift is a separate bus set)
router.post('/admin/route/:sessionId', protect, adminOnly, runRouting);
router.get('/admin/buses/:sessionId', protect, adminOnly, busesForSession);
router.get('/admin/bookings/:sessionId', protect, adminOnly, bookingsForSession);

export default router;
