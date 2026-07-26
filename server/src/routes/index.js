import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  googleLogin,
  getMe,
  updateProfile,
} from '../controllers/authController.js';
import {
  listExams,
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
  busesForExam,
  bookingsForExam,
} from '../controllers/adminController.js';

const router = Router();

// auth
router.post('/auth/google', googleLogin);
router.get('/auth/me', protect, getMe);
router.patch('/auth/profile', protect, updateProfile);

// exams + centers
router.get('/exams', listExams);
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

// admin
router.post('/admin/route/:examId', protect, adminOnly, runRouting);
router.get('/admin/buses/:examId', protect, adminOnly, busesForExam);
router.get('/admin/bookings/:examId', protect, adminOnly, bookingsForExam);

export default router;
