import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/db';
import { Curriculum } from '../models/Curriculum';
import { Batch } from '../models/Batch';
import { CourseInstance } from '../models/CourseInstance';
import { Student } from '../models/Student';
import { User } from '../models/User';
import { Assessment } from '../models/Assessment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { TutorSession } from '../models/TutorSession';
import { LessonProgress } from '../models/LessonProgress';
import { UsageEvent } from '../models/UsageEvent';
import { StudentCredit } from '../models/StudentCredit';
import { buildDeploymentLink } from '../utils/idGenerator';

dotenv.config();

async function seed() {
  await connectDB();
  const institutionId = process.env.SEED_INSTITUTION_ID || 'ORG-001';
  const adminPlainPassword = process.env.SEED_ADMIN_PASSWORD;
  const studentPlainPassword = process.env.SEED_STUDENT_PASSWORD;
  if (!adminPlainPassword || !studentPlainPassword) {
    throw new Error('SEED_ADMIN_PASSWORD and SEED_STUDENT_PASSWORD are required');
  }

  await Promise.all([
    Curriculum.deleteMany({}),
    Batch.deleteMany({}),
    CourseInstance.deleteMany({}),
    Student.deleteMany({}),
    User.deleteMany({}),
    Assessment.deleteMany({}),
    AssessmentAttempt.deleteMany({}),
    TutorSession.deleteMany({}),
    LessonProgress.deleteMany({}),
    UsageEvent.deleteMany({}),
    StudentCredit.deleteMany({}),
  ]);

  const adminPassword = await bcrypt.hash(adminPlainPassword, 12);
  await User.create({
    email: 'admin@enara.ai',
    password: adminPassword,
    role: 'enara-admin',
    name: 'Admin User',
  });

  const studentPassword = await bcrypt.hash(studentPlainPassword, 12);

  const curriculums = await Curriculum.insertMany([
    {
      id: 'c1',
      institutionId,
      name: 'National Curriculum - Grade 10',
      courseName: 'Secondary Education',
      type: 'National',
      level: 'Grade 10',
      languages: ['Arabic', 'English'],
      summary: 'A comprehensive framework covering core secondary education subjects.',
      description: 'Standard national education framework for secondary level.',
      lastUpdated: '2024-02-15',
      subjectsCount: 2,
      assignedBatches: ['Batch A - 2024', 'Batch B - 2024'],
      chapters: [
        { id: 'ch1', title: 'Algebra Foundations', uploads: ['syllabus.pdf', 'intro_video.mp4'], description: 'Variables, expressions, and foundations of algebra.' },
        { id: 'ch2', title: 'Classical Mechanics', uploads: ['physics_guide.pdf'], description: 'Motion, forces, and Newtonian mechanics.' },
      ],
      status: 'deployed',
      deploymentLink: buildDeploymentLink('c1'),
    },
    {
      id: 'c2',
      institutionId,
      name: 'IGCSE Science Stream',
      courseName: 'IGCSE Science',
      type: 'IGCSE',
      level: 'Year 11',
      languages: ['English'],
      summary: 'International Science stream focusing on Physics, Chemistry, and Biology.',
      description: 'International General Certificate of Secondary Education - Science focus.',
      lastUpdated: '2024-01-20',
      subjectsCount: 1,
      assignedBatches: ['Batch C - 2024'],
      chapters: [{ id: 'ch3', title: 'Cell Biology', uploads: ['biology_notes.pdf'] }],
      status: 'deployed',
      deploymentLink: buildDeploymentLink('c2'),
    },
    {
      id: 'c3',
      institutionId,
      name: 'IB Diploma Program',
      courseName: 'IB Diploma',
      type: 'IB',
      level: 'Diploma',
      languages: ['English', 'French'],
      summary: 'Rigorous international program for pre-university students.',
      description: 'International Baccalaureate comprehensive curriculum.',
      lastUpdated: '2024-02-10',
      subjectsCount: 0,
      assignedBatches: [],
      chapters: [],
      status: 'draft',
    },
  ]);

  const batches = await Batch.insertMany([
    { id: 'b1', institutionId, name: 'Batch A - 2024', studentCount: 45, curriculumId: 'c1', academicYear: '2023-2024', groupId: 'Group A' },
    { id: 'b2', institutionId, name: 'Batch B - 2024', studentCount: 38, curriculumId: 'c1', academicYear: '2023-2024', groupId: 'Group B' },
    { id: 'b3', institutionId, name: 'Batch C - 2024', studentCount: 42, curriculumId: 'c2', academicYear: '2023-2024', groupId: 'Group C' },
    { id: 'b4', institutionId, name: 'Batch D - 2024', studentCount: 35, academicYear: '2023-2024' },
  ]);

  const students = await Student.insertMany([
    {
      id: 'STU001',
      institutionId,
      name: 'Sarah Ahmed',
      email: 'student@enara.com',
      grade: 'Grade 10',
      avatar: 'SA',
      batchId: 'b1',
      academicYear: '2023-2024',
      groupId: 'Group A',
      progress: 78,
      avgScore: 92,
      studyTime: '7.5h/week',
      streak: 12,
      status: 'excelling',
      currentModule: 'Quadratic Equations',
      affinitySubject: 'Mathematics',
      ttu: 12,
      learningEngineProfile: {
        primaryEngine: 'Linear-Logical',
        efficiencyRating: 94,
        cylinderBreakdown: {
          analysis: 'High-speed verbal synthesis combined with structured deductive reasoning.',
          dominance: ['Verbal-Spatial', 'Analytical'],
        },
        clusterTag: 'LOG-STR-01',
        executiveSummary:
          'Sarah exhibits a highly disciplined cognitive architecture, excelling in structured environments.',
      },
      adaptiveProfile: {
        preferredLearningStyle: 'Visual',
        strengths: ['Algebra', 'Literature'],
        weaknesses: ['Kinematics'],
        topicMastery: {
          'Quadratic Equations': 95,
          'Linear Inequalities': 88,
          'Motion in One Dimension': 72,
        },
      },
      riskPrediction: {
        dropoutRisk: 2,
        examFailureProbability: 5,
        factors: ['High engagement', 'Consistent scores'],
        trend: 'improving',
      },
      nextBestActions: [
        {
          id: 'act-1',
          type: 'recommendation',
          title: 'Advanced Physics Module',
          description: 'Sarah is excelling in Math; suggest starting Advanced Physics early.',
          priority: 'Medium',
          expectedImpact: 15,
          confidenceLevel: 92,
          status: 'pending',
        },
      ],
      subjects: [
        {
          name: 'Mathematics',
          progress: 80,
          score: 92,
          assessmentAccuracy: 94,
          weakConceptRatio: 12,
          firstAttemptSuccessRate: 88,
          knowledgeRetentionScore: 91,
          learningStyleAffinity: 'Visual',
          optimalReviewCadence: 'Every 3 days',
        },
        {
          name: 'Physics',
          progress: 65,
          score: 78,
          assessmentAccuracy: 82,
          weakConceptRatio: 25,
          firstAttemptSuccessRate: 72,
          knowledgeRetentionScore: 79,
          learningStyleAffinity: 'Kinesthetic',
          optimalReviewCadence: 'Every 2 days',
        },
      ],
    },
    {
      id: 'STU002',
      institutionId,
      name: 'Omar Hassan',
      email: 'omar.h@school.edu',
      grade: 'Grade 10',
      avatar: 'OH',
      batchId: 'b1',
      academicYear: '2023-2024',
      groupId: 'Group A',
      progress: 60,
      avgScore: 74,
      status: 'on track',
    },
    {
      id: 'STU003',
      institutionId,
      name: 'Fatima Ali',
      email: 'fatima.a@school.edu',
      grade: 'Grade 10',
      avatar: 'FA',
      batchId: 'b1',
      academicYear: '2023-2024',
      groupId: 'Group A',
    },
    {
      id: 'STU004',
      institutionId,
      name: 'James Wilson',
      email: 'james.w@school.edu',
      grade: 'Year 11',
      avatar: 'JW',
      batchId: 'b2',
      academicYear: '2023-2024',
      groupId: 'Group B',
    },
    {
      id: 'STU005',
      institutionId,
      name: 'Emma Chen',
      email: 'emma.c@school.edu',
      grade: 'Year 11',
      avatar: 'EC',
      batchId: 'b3',
      academicYear: '2023-2024',
      groupId: 'Group C',
    },
  ]);

  await User.create({
    email: 'student@enara.com',
    password: studentPassword,
    role: 'student',
    name: 'Sarah Ahmed',
    studentId: 'STU001',
    institutionId,
  });

  const instances = await CourseInstance.insertMany([
    {
      id: 'inst-1',
      institutionId,
      courseId: 'MATH101',
      courseName: 'Algebra Fundamentals',
      academicYear: '2023-2024',
      batchId: 'b1',
      curriculumId: 'c1',
      groupId: 'Group A',
      studentIds: ['STU001', 'STU002'],
      instructorIds: [],
      visibility: 'student',
    },
    {
      id: 'inst-2',
      institutionId,
      courseId: 'PHYS101',
      courseName: 'Classical Mechanics',
      academicYear: '2023-2024',
      batchId: 'b1',
      curriculumId: 'c1',
      groupId: 'Group A',
      studentIds: ['STU001'],
      instructorIds: [],
      visibility: 'student',
    },
  ]);

  const assessments = await Assessment.insertMany([
    {
      id: 'ASM001',
      institutionId,
      title: 'Module 2 Proficiency',
      subject: 'Mathematics',
      duration: 30,
      status: 'upcoming',
      dueDate: 'Oct 26',
      difficulty: 'Medium',
      curriculumId: 'c1',
      batchId: 'b1',
      instructions:
        'Please read each question carefully. You are allowed to use a scientific calculator.',
      questions: [
        {
          id: 'Q1',
          type: 'multiple-choice',
          text: 'What is the solution to the equation x² - 5x + 6 = 0?',
          topic: 'Quadratic Equations',
          options: ['x = 2, 3', 'x = -2, -3', 'x = 1, 6', 'x = -1, -6'],
          correctAnswer: 0,
          explanation: 'Factoring the quadratic: (x-2)(x-3) = 0 gives x=2 and x=3.',
        },
        {
          id: 'Q2',
          type: 'multiple-choice',
          text: 'Which of the following is the quadratic formula?',
          topic: 'Quadratic Equations',
          options: [
            'x = (-b ± √(b² - 4ac)) / 2a',
            'x = (b ± √(b² - 4ac)) / 2a',
            'x = (-b ± √(b² + 4ac)) / 2a',
            'x = (-b ± √(a² - 4bc)) / 2a',
          ],
          correctAnswer: 0,
          explanation: 'The standard quadratic formula is x = (-b ± √(b² - 4ac)) / 2a.',
        },
        {
          id: 'Q3',
          type: 'multiple-choice',
          text: "In the equation y = ax² + bx + c, what does 'c' represent?",
          topic: 'Quadratic Equations',
          options: ['The x-intercept', 'The y-intercept', 'The vertex', 'The axis of symmetry'],
          correctAnswer: 1,
          explanation: 'When x=0, y=c, so c is the y-intercept.',
        },
      ],
    },
    {
      id: 'ASM002',
      institutionId,
      title: 'Mechanics Check-in',
      subject: 'Physics',
      duration: 25,
      status: 'active',
      dueDate: 'Nov 02',
      difficulty: 'Easy',
      curriculumId: 'c1',
      batchId: 'b1',
      questions: [
        {
          id: 'P1',
          type: 'multiple-choice',
          text: 'What is the SI unit of force?',
          topic: 'Forces',
          options: ['Joule', 'Newton', 'Watt', 'Pascal'],
          correctAnswer: 1,
          explanation: 'Force is measured in Newtons (N).',
        },
      ],
    },
  ]);

  await StudentCredit.create({
    studentId: 'STU001',
    institutionId,
    limit: 50000,
    usage: 1250,
    period: 'monthly',
    status: 'active',
    restrictedFeatures: [],
  });

  await LessonProgress.create({
    studentId: 'STU001',
    institutionId,
    courseId: 'MATH101',
    lessonId: 'ch1',
    status: 'completed',
    completedAt: new Date(),
  });

  console.log('Seed complete:');
  console.log(`  ${curriculums.length} curriculums`);
  console.log(`  ${batches.length} batches`);
  console.log(`  ${students.length} students`);
  console.log(`  ${instances.length} course instances`);
  console.log(`  ${assessments.length} assessments`);
  console.log('  admin: admin@enara.ai');
  console.log('  student: student@enara.com');

  process.exit(0);
}

seed().catch((err) => {
  const message = err instanceof Error ? err.message : 'Unknown error';
  console.error(`Seed failed: ${message}`);
  process.exit(1);
});
