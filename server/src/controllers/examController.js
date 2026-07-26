import Exam from '../models/Exam.js';
import Center from '../models/Center.js';

// GET /api/exams
export async function listExams(req, res) {
  const exams = await Exam.find({ active: true }).sort({ date: 1 });
  res.json(exams);
}

// GET /api/exams/:id/centers
export async function listCentersForExam(req, res) {
  const exam = await Exam.findById(req.params.id);
  if (!exam) return res.status(404).json({ message: 'Exam not found' });
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
