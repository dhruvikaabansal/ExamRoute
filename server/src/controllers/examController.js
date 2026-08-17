import Exam from '../models/Exam.js';
import ExamSession from '../models/ExamSession.js';
import Center from '../models/Center.js';
import { ApiError } from '../utils/apiError.js';
import { assertObjectId } from '../utils/validate.js';

// GET /api/exams
export async function listExams(req, res) {
  const exams = await Exam.find({ active: true }).sort({ code: 1 });
  res.json(exams);
}

// GET /api/exams/:id
export async function getExam(req, res) {
  const exam = await Exam.findById(assertObjectId(req.params.id, 'exam id'));
  if (!exam) throw ApiError.notFound('Exam not found');
  res.json(exam);
}

/**
 * GET /api/exams/:id/sessions — all date+shift sittings for an exam.
 *
 * Past sittings are filtered out: offering a student a bus to an exam that
 * already happened is a booking that can only fail later.
 */
export async function listSessionsForExam(req, res) {
  const examId = assertObjectId(req.params.id, 'exam id');
  const sessions = await ExamSession.find({
    exam: examId,
    gateClose: { $gt: new Date() },
  }).sort({ date: 1, examStart: 1 });
  res.json(sessions);
}

// GET /api/exams/:id/centers
export async function listCentersForExam(req, res) {
  const exam = await Exam.findById(assertObjectId(req.params.id, 'exam id'));
  if (!exam) throw ApiError.notFound('Exam not found');
  const centers = await Center.find({ state: exam.state }).sort({ city: 1 });
  res.json(centers);
}

// --- admin ---
export async function createExam(req, res) {
  const exam = await Exam.create(req.body);
  res.status(201).json(exam);
}

export async function createCenter(req, res) {
  const center = await Center.create(req.body);
  res.status(201).json(center);
}
