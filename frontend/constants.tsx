
import { Student, Course, Assessment, Curriculum, Batch, UsageEvent, Transaction, OrganizationWallet, CreditLimit, Institution, Contract, AuditLog, CourseInstance, LiveAvatar, AvatarConfig, AvatarStreamAnalytics } from './types';

export const MOCK_INSTITUTIONS: Institution[] = [
  {
    id: 'ORG-001',
    name: 'Global Tech Academy',
    studentCount: 42500,
    activeStudents: 38200,
    signupDate: '2025-09-12',
    status: 'Healthy',
    tier: 'Enterprise',
    region: 'EMEA',
    lastActive: '2m ago',
    mrr: 420000,
    arr: 5040000,
    growthRate: 12.4,
    onboardingDays: 14,
    supportTickets: 5,
    avgResolutionTime: '2.4h'
  },
  {
    id: 'ORG-002',
    name: 'Future Skills Inst.',
    studentCount: 28400,
    activeStudents: 24100,
    signupDate: '2025-10-05',
    status: 'Warning',
    tier: 'Custom',
    region: 'MENA',
    lastActive: '15m ago',
    mrr: 285000,
    arr: 3420000,
    growthRate: 8.1,
    onboardingDays: 22,
    supportTickets: 12,
    avgResolutionTime: '4.8h'
  },
  {
    id: 'ORG-003',
    name: 'Elite Learning Corp',
    studentCount: 18200,
    activeStudents: 16800,
    signupDate: '2025-11-20',
    status: 'Healthy',
    tier: 'Enterprise',
    region: 'APAC',
    lastActive: '5m ago',
    mrr: 192000,
    arr: 2304000,
    growthRate: 15.2,
    onboardingDays: 10,
    supportTickets: 2,
    avgResolutionTime: '1.2h'
  },
  {
    id: 'ORG-004',
    name: 'Standard University',
    studentCount: 32100,
    activeStudents: 22400,
    signupDate: '2025-08-15',
    status: 'At Risk',
    tier: 'Standard',
    region: 'Americas',
    lastActive: '1h ago',
    mrr: 310000,
    arr: 3720000,
    growthRate: -2.4,
    onboardingDays: 35,
    supportTickets: 28,
    avgResolutionTime: '12.5h'
  }
];

export const MOCK_CONTRACTS: Contract[] = [
  {
    id: 'CON-001',
    institutionId: 'ORG-001',
    institutionName: 'Global Tech Academy',
    startDate: '2025-09-01',
    expiryDate: '2026-09-01',
    value: 5040000,
    creditsAllocated: 1200000,
    pricePerCredit: 4.2,
    discount: 10,
    autoRenewal: true,
    status: 'Active'
  },
  {
    id: 'CON-002',
    institutionId: 'ORG-004',
    institutionName: 'Standard University',
    startDate: '2025-08-01',
    expiryDate: '2026-08-01',
    value: 3720000,
    creditsAllocated: 200000,
    pricePerCredit: 18.6,
    discount: 0,
    autoRenewal: false,
    status: 'Pending Renewal'
  }
];

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'LOG-001',
    timestamp: '2026-04-02T12:00:00Z',
    actorId: 'ADM-001',
    actorName: 'Director Khalid',
    actorRole: 'Admin',
    action: 'Access Grant',
    category: 'Access',
    details: 'Granted "Teacher" role to Sarah Ahmed',
    ipAddress: '192.168.1.42',
    signature: 'sha256:8f3e...'
  },
  {
    id: 'LOG-002',
    timestamp: '2026-04-02T11:45:00Z',
    actorId: 'ADM-002',
    actorName: 'Enara Executive',
    actorRole: 'Enara Admin',
    action: 'Credit Allocation',
    category: 'Configuration',
    details: 'Allocated 500,000 credits to Global Tech Academy',
    ipAddress: '10.0.0.5',
    signature: 'sha256:a2b1...'
  },
  {
    id: 'LOG-003',
    timestamp: '2026-04-02T10:30:00Z',
    actorId: 'SYS',
    actorName: 'System',
    actorRole: 'System',
    action: 'Failed Login Threshold',
    category: 'Security',
    details: 'User STU-882 exceeded failed login attempts (5)',
    ipAddress: '45.12.33.1',
    signature: 'sha256:c9d8...'
  }
];

export const MOCK_STUDENTS: Student[] = [
  {
    id: "STU001",
    name: "Sarah Ahmed",
    email: "sarah.a@school.edu",
    grade: "Grade 10",
    avatar: "SA",
    progress: 78,
    avgScore: 92,
    studyTime: "7.5h/week",
    streak: 12,
    status: "excelling",
    currentModule: "Quadratic Equations",
    affinitySubject: "English",
    learningEngineProfile: {
      primaryEngine: "Linear-Logical",
      efficiencyRating: 94,
      cylinderBreakdown: {
        analysis: "High-speed verbal synthesis combined with structured deductive reasoning.",
        dominance: ["Verbal-Spatial", "Analytical"]
      },
      clusterTag: "LOG-STR-01",
      executiveSummary: "Sarah exhibits a highly disciplined cognitive architecture, excelling in structured environments where information follows a clear, linear progression. Her metacognitive awareness allows for rapid error correction during complex problem-solving."
    },
    batchId: "b1",
    academicYear: "2023-2024",
    groupId: "Group A",
    ttu: 12, // 12 minutes to understand a topic on average
    adaptiveProfile: {
      preferredLearningStyle: "Visual",
      strengths: ["Algebra", "Literature"],
      weaknesses: ["Kinematics"],
      topicMastery: {
        "Quadratic Equations": 95,
        "Linear Inequalities": 88,
        "Motion in One Dimension": 72
      }
    },
    riskPrediction: {
      dropoutRisk: 2,
      examFailureProbability: 5,
      factors: ["High engagement", "Consistent scores"],
      trend: "improving"
    },
    nextBestActions: [
      {
        id: "act-1",
        type: "recommendation",
        title: "Advanced Physics Module",
        description: "Sarah is excelling in Math; suggest starting the Advanced Physics module early.",
        priority: "Medium",
        expectedImpact: 15,
        confidenceLevel: 92,
        status: "pending"
      }
    ],
    subjects: [
      { 
        name: "Mathematics", 
        progress: 80, 
        score: 92,
        assessmentAccuracy: 94,
        weakConceptRatio: 12,
        firstAttemptSuccessRate: 88,
        knowledgeRetentionScore: 91,
        learningStyleAffinity: "Visual",
        optimalReviewCadence: "Every 3 days"
      },
      { 
        name: "Physics", 
        progress: 65, 
        score: 78,
        assessmentAccuracy: 82,
        weakConceptRatio: 25,
        firstAttemptSuccessRate: 72,
        knowledgeRetentionScore: 79,
        learningStyleAffinity: "Kinesthetic",
        optimalReviewCadence: "Every 2 days"
      },
      { 
        name: "English", 
        progress: 90, 
        score: 95,
        assessmentAccuracy: 97,
        weakConceptRatio: 5,
        firstAttemptSuccessRate: 95,
        knowledgeRetentionScore: 96,
        learningStyleAffinity: "Auditory",
        optimalReviewCadence: "Weekly"
      }
    ],
    pastResults: [
      {
        assessmentId: "ASM-OLD-1",
        assessmentTitle: "Algebra Basics Quiz",
        score: 75,
        date: "2024-02-10",
        answers: [
          {
            questionId: "Q-OLD-1",
            questionText: "Solve for x: 2x + 5 = 13",
            topic: "Linear Equations",
            studentAnswer: "x = 9",
            correctAnswer: "x = 4",
            isCorrect: false,
            explanation: "Subtract 5 from both sides: 2x = 8. Divide by 2: x = 4.",
            modelAnswer: "To solve 2x + 5 = 13, first isolate the variable term by subtracting 5 from both sides, resulting in 2x = 8. Then, divide by 2 to find x = 4."
          }
        ]
      }
    ],
    chatLogs: [
      {
        id: "chat-1",
        role: "user",
        text: "I'm struggling with factoring trinomials where a > 1.",
        timestamp: new Date("2024-02-25T10:00:00")
      },
      {
        id: "chat-2",
        role: "ai",
        text: "Factoring trinomials like 2x² + 7x + 3 can be tricky. Have you tried the AC method?",
        timestamp: new Date("2024-02-25T10:01:00")
      }
    ]
  },
  {
    id: "STU002",
    name: "Omar Khalid",
    email: "omar.k@school.edu",
    grade: "Grade 10",
    avatar: "OK",
    progress: 45,
    avgScore: 68,
    studyTime: "3.2h/week",
    streak: 2,
    status: "at risk",
    currentModule: "Algebra Basics",
    affinitySubject: "English",
    learningEngineProfile: {
      primaryEngine: "Collaborative-Project",
      efficiencyRating: 72,
      cylinderBreakdown: {
        analysis: "Tactile-memory dominance with high emotional intelligence processing.",
        dominance: ["Kinesthetic", "Social"]
      },
      clusterTag: "COLL-KIN-02",
      executiveSummary: "Omar processes information most effectively through interpersonal interaction and practical application. His 'Cylinder Efficiency' remains low in direct lecture formats but spikes significantly during heuristic inquiry."
    },
    batchId: "b1",
    academicYear: "2023-2024",
    groupId: "Group A",
    ttu: 45, // 45 minutes to understand a topic
    adaptiveProfile: {
      preferredLearningStyle: "Auditory",
      strengths: ["English"],
      weaknesses: ["Algebra", "Newton's Laws"],
      topicMastery: {
        "Algebra Basics": 45,
        "Newton's Laws": 30,
        "Motion in One Dimension": 55
      }
    },
    riskPrediction: {
      dropoutRisk: 35,
      examFailureProbability: 48,
      factors: ["Low engagement frequency", "High TTU trends", "Incomplete assignments"],
      trend: "declining"
    },
    nextBestActions: [
      {
        id: "act-2",
        type: "action",
        title: "Mandatory Tutoring Session",
        description: "Schedule a 1-on-1 session focusing on Algebra basics.",
        priority: "High",
        expectedImpact: 25,
        confidenceLevel: 85,
        status: "pending"
      },
      {
        id: "act-3",
        type: "plan",
        title: "Personalized Remedial Plan",
        description: "Generate a 2-week plan with bite-sized video lessons for Newton's Laws.",
        priority: "High",
        expectedImpact: 30,
        confidenceLevel: 80,
        status: "pending"
      }
    ],
    subjects: [
      { name: "Mathematics", progress: 40, score: 65 },
      { name: "Physics", progress: 30, score: 62 },
      { name: "English", progress: 55, score: 78 }
    ],
    pastResults: [
      {
        assessmentId: "ASM-OLD-2",
        assessmentTitle: "Kinematics Quiz",
        score: 62,
        date: "2024-03-01",
        answers: []
      }
    ],
    chatLogs: [
      {
        id: "chat-3",
        role: "user",
        text: "I don't understand Newton's First Law.",
        timestamp: new Date("2024-03-05T14:00:00")
      },
      {
        id: "chat-4",
        role: "ai",
        text: "Newton's First Law, also known as the Law of Inertia, states that an object at rest stays at rest...",
        timestamp: new Date("2024-03-05T14:01:00")
      }
    ]
  }
];

export const MOCK_COURSES: Course[] = [
  {
    id: "MATH101",
    subject: "Mathematics",
    title: "Algebra Fundamentals",
    modules: [
      {
        id: "MOD001",
        title: "Introduction to Algebra",
        status: "completed",
        lessonsCount: 5,
        completedLessons: 5,
        lessons: [],
        materials: ["Algebra_Syllabus.pdf", "Intro_to_Variables.docx"],
        explanation: "Algebra is a branch of mathematics dealing with symbols and the rules for manipulating those symbols. In this introductory chapter, we cover the basics of variables, constants, and simple expressions. A variable is a letter used to represent an unknown number, while a constant is a fixed value. Understanding how to combine these into expressions is the foundation of all higher mathematics."
      },
      {
        id: "MOD002",
        title: "Quadratic Equations",
        status: "active",
        lessonsCount: 8,
        completedLessons: 2,
        lessons: [
          { id: "L001", title: "Variables and Constants", duration: "15 min", status: "completed", order: 1, materials: ["Variables_Intro.pdf"] },
          { id: "L002", title: "Linear Inequalities", duration: "20 min", status: "completed", order: 2, materials: ["Inequalities_Practice.pdf"] },
          { 
            id: "L003", 
            title: "Quadratic Formula", 
            duration: "25 min", 
            status: "active", 
            order: 3, 
            materials: ["Quadratic_Formula_Derivation.pdf", "Formula_Video.mp4"],
            videoUrl: "https://www.youtube.com/embed/ZBalWWHYMWE",
            quiz: {
              questions: [
                {
                  id: "LQ1",
                  text: "What is the discriminant in the quadratic formula?",
                  options: ["b² - 4ac", "2a", "-b", "√(b² - 4ac)"],
                  correctAnswer: 0,
                  explanation: "The discriminant is the part under the square root, b² - 4ac."
                },
                {
                  id: "LQ2",
                  text: "If the discriminant is negative, how many real roots exist?",
                  options: ["0", "1", "2", "Infinite"],
                  correctAnswer: 0,
                  explanation: "A negative discriminant means there are no real roots (only complex roots)."
                }
              ]
            }
          },
          { id: "L004", title: "Factoring Trinominals", duration: "30 min", status: "locked", order: 4 }
        ],
        materials: ["Quadratic_Formula_Guide.pdf", "Factoring_Practice.docx", "Solving_Equations_Video.mp4"],
        explanation: "Quadratic equations are polynomial equations of the second degree, meaning the highest exponent of the variable is 2. The standard form is ax² + bx + c = 0. In this chapter, we explore various methods to solve these equations, including factoring, completing the square, and using the Quadratic Formula. We also look at the discriminant (b² - 4ac) to determine the nature of the roots."
      }
    ]
  },
  {
    id: "PHYS101",
    subject: "Physics",
    title: "Classical Mechanics",
    modules: [
      {
        id: "PMOD001",
        title: "Kinematics",
        status: "active",
        lessonsCount: 6,
        completedLessons: 0,
        lessons: [
          { id: "PL001", title: "Motion in One Dimension", duration: "20 min", status: "active", order: 1 },
          { id: "PL002", title: "Vectors and Scalars", duration: "25 min", status: "locked", order: 2 }
        ],
        materials: ["Kinematics_Overview.pdf", "Motion_Graphs.docx"],
        explanation: "Kinematics is the subfield of physics that describes the motion of points, bodies, and systems of bodies without considering the forces that cause them to move. We focus on concepts like displacement, velocity, and acceleration. Understanding the relationship between these quantities through equations of motion is essential for predicting the future position of an object."
      },
      {
        id: "PMOD002",
        title: "Newton's Laws",
        status: "locked",
        lessonsCount: 10,
        completedLessons: 0,
        lessons: [],
        materials: ["Newtons_Laws_Poster.pdf"],
        explanation: "Newton's laws of motion are three physical laws that, together, laid the foundation for classical mechanics. They describe the relationship between a body and the forces acting upon it, and its motion in response to those forces. First Law (Inertia), Second Law (F=ma), and Third Law (Action-Reaction) are the cornerstones of how we understand the physical world."
      }
    ]
  },
  {
    id: "CHEM101",
    subject: "Chemistry",
    title: "General & Inorganic Chemistry",
    modules: [
      {
        id: "CMOD001",
        title: "Atomic Structure & Periodic Trends",
        status: "active",
        lessonsCount: 7,
        completedLessons: 1,
        lessons: [
          { id: "CL001", title: "Electron Configuration", duration: "25 min", status: "completed", order: 1 },
          { id: "CL002", title: "Periodic Table Groups", duration: "30 min", status: "active", order: 2 }
        ],
        materials: ["Periodic_Table_Chart.pdf"],
        explanation: "Inorganic Chemistry covers atomic structures, electron arrangements, chemical bonds, and periodic law."
      },
      {
        id: "CMOD002",
        title: "Chemical Reactions & Stoichiometry",
        status: "locked",
        lessonsCount: 9,
        completedLessons: 0,
        lessons: [],
        materials: ["Stoichiometry_Worksheet.pdf"],
        explanation: "Quantifying matter and balancing chemical equations to understand chemical transformations."
      }
    ]
  },
  {
    id: "CS101",
    subject: "Computer Science",
    title: "Computer Science & AI Foundations",
    modules: [
      {
        id: "CSMOD001",
        title: "Algorithms & Python Programming",
        status: "active",
        lessonsCount: 10,
        completedLessons: 3,
        lessons: [
          { id: "CSL001", title: "Data Structures & Control Loops", duration: "30 min", status: "completed", order: 1 },
          { id: "CSL002", title: "Neural Networks Intro", duration: "40 min", status: "active", order: 2 }
        ],
        materials: ["Python_Syntax_CheatSheet.pdf", "ML_Overview.pdf"],
        explanation: "Explore foundational programming logic, algorithmic efficiency, computational thinking, and modern Machine Learning fundamentals."
      }
    ]
  },
  {
    id: "ENG101",
    subject: "English Literature",
    title: "World Literature & Critical Analysis",
    modules: [
      {
        id: "EMOD001",
        title: "Literary Theory & Essay Composition",
        status: "active",
        lessonsCount: 6,
        completedLessons: 2,
        lessons: [
          { id: "EL001", title: "Rhetorical Devices", duration: "20 min", status: "completed", order: 1 }
        ],
        materials: ["Literary_Analysis_Guide.pdf"],
        explanation: "Deconstruct prose, poetry, and dramatic texts to synthesize compelling thesis arguments."
      }
    ]
  }
];

export const MOCK_ASSESSMENTS: Assessment[] = [
  {
    id: "ASM001",
    title: "Module 2 Proficiency",
    subject: "Mathematics",
    duration: 30,
    status: 'upcoming',
    dueDate: 'Oct 26',
    difficulty: 'Medium',
    curriculumId: 'c1',
    batchId: 'b1',
    instructions: "Please read each question carefully. You are allowed to use a scientific calculator for this assessment. Ensure you have a stable internet connection before starting.",
    questions: [
      {
        id: "Q1",
        type: 'multiple-choice',
        text: "What is the solution to the equation x² - 5x + 6 = 0?",
        options: ["x = 2, 3", "x = -2, -3", "x = 1, 6", "x = -1, -6"],
        correctAnswer: 0,
        explanation: "Factoring the quadratic: (x-2)(x-3) = 0 gives x=2 and x=3."
      },
      {
        id: "Q2",
        type: 'multiple-choice',
        text: "Which of the following is the quadratic formula?",
        options: [
          "x = (-b ± √(b² - 4ac)) / 2a",
          "x = (b ± √(b² - 4ac)) / 2a",
          "x = (-b ± √(b² + 4ac)) / 2a",
          "x = (-b ± √(a² - 4bc)) / 2a"
        ],
        correctAnswer: 0,
        explanation: "The standard quadratic formula is x = (-b ± √(b² - 4ac)) / 2a."
      },
      {
        id: "Q3",
        type: 'multiple-choice',
        text: "In the equation y = ax² + bx + c, what does 'c' represent?",
        options: ["The x-intercept", "The y-intercept", "The vertex", "The axis of symmetry"],
        correctAnswer: 1,
        explanation: "When x=0, y=c, so 'c' is the y-intercept."
      }
    ]
  },
  {
    id: "ASM002",
    title: "Midterm Evaluation",
    subject: "Mathematics",
    duration: 60,
    status: 'upcoming',
    dueDate: 'Nov 02',
    difficulty: 'Hard',
    curriculumId: 'c2',
    batchId: 'b3',
    questions: []
  }
];

export const MOCK_CURRICULUMS: Curriculum[] = [
  {
    id: 'c1',
    name: 'National Curriculum - Grade 10',
    courseName: 'Secondary Education',
    type: 'National',
    level: 'Grade 10',
    languages: ['Arabic', 'English'],
    summary: 'A comprehensive framework covering core secondary education subjects.',
    description: 'Standard national education framework for secondary level.',
    lastUpdated: '2024-02-15',
    subjectsCount: 12,
    assignedBatches: ['Batch A - 2024', 'Batch B - 2024'],
    chapters: [
      { id: 'ch1', title: 'Algebra Foundations', uploads: ['syllabus.pdf', 'intro_video.mp4'] },
      { id: 'ch2', title: 'Classical Mechanics', uploads: ['physics_guide.pdf'] }
    ],
    status: 'deployed'
  },
  {
    id: 'c2',
    name: 'IGCSE Science Stream',
    courseName: 'IGCSE Science',
    type: 'IGCSE',
    level: 'Year 11',
    languages: ['English'],
    summary: 'International Science stream focusing on Physics, Chemistry, and Biology.',
    description: 'International General Certificate of Secondary Education - Science focus.',
    lastUpdated: '2024-01-20',
    subjectsCount: 8,
    assignedBatches: ['Batch C - 2024'],
    chapters: [
      { id: 'ch3', title: 'Cell Biology', uploads: ['biology_notes.pdf'] }
    ],
    status: 'deployed'
  },
  {
    id: 'c3',
    name: 'IB Diploma Program',
    courseName: 'IB Diploma',
    type: 'IB',
    level: 'Diploma',
    languages: ['English', 'French'],
    summary: 'Rigorous international program for pre-university students.',
    description: 'International Baccalaureate comprehensive curriculum.',
    lastUpdated: '2024-02-10',
    subjectsCount: 6,
    assignedBatches: [],
    chapters: [],
    status: 'draft'
  }
];

export const MOCK_BATCHES: Batch[] = [
  { id: 'b1', name: 'Batch A - 2024', studentCount: 45, curriculumId: 'c1', academicYear: '2023-2024', groupId: 'Group A' },
  { id: 'b2', name: 'Batch B - 2024', studentCount: 38, curriculumId: 'c1', academicYear: '2023-2024', groupId: 'Group B' },
  { id: 'b3', name: 'Batch C - 2024', studentCount: 42, curriculumId: 'c2', academicYear: '2023-2024', groupId: 'Group C' },
  { id: 'b4', name: 'Batch D - 2024', studentCount: 35, academicYear: '2023-2024' },
];

export const MOCK_COURSE_INSTANCES: CourseInstance[] = [
  {
    id: 'inst-1',
    courseId: 'MATH101',
    courseName: 'Algebra Fundamentals',
    academicYear: '2023-2024',
    batchId: 'b1',
    curriculumId: 'c1',
    groupId: 'Group A',
    studentIds: ['STU001', 'STU002']
  }
];

export const MOCK_ANALYTICS = {
  engagement: [520, 576, 680, 736],
  labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
  performance: {
    excellent: 342,
    good: 285,
    average: 178,
    needsHelp: 92
  }
};

export const MOCK_USAGE_EVENTS: UsageEvent[] = [
  {
    id: 'evt-1',
    userId: 'STU001',
    userName: 'Sarah Ahmed',
    organizationId: 'ORG-1',
    subAccountId: 'b1',
    feature: 'chat',
    model: 'gemini-3-flash-preview',
    requestId: 'req-1',
    sessionId: 'sess-1',
    tokensIn: 500,
    tokensOut: 1200,
    creditsUsed: 170,
    timestamp: new Date(Date.now() - 1000 * 60 * 5) // 5 mins ago
  },
  {
    id: 'evt-2',
    userId: 'STU002',
    userName: 'Omar Khalid',
    organizationId: 'ORG-1',
    subAccountId: 'b1',
    feature: 'voice',
    model: 'gemini-2.5-flash-preview-tts',
    requestId: 'req-2',
    sessionId: 'sess-2',
    creditsUsed: 450,
    timestamp: new Date(Date.now() - 1000 * 60 * 15) // 15 mins ago
  }
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    walletId: 'w-1',
    amount: 1000000,
    type: 'allocation',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7), // 7 days ago
    description: 'Initial monthly allocation',
    performedBy: 'Enara'
  }
];

export const MOCK_WALLET: OrganizationWallet = {
  id: 'w-1',
  orgId: 'ORG-1',
  balance: 750000,
  totalAllocated: 1000000,
  totalConsumed: 250000,
  lastRechargeDate: '2024-03-25'
};

export const MOCK_CREDIT_LIMITS: CreditLimit[] = [
  {
    id: 'lim-1',
    targetId: 'STU001',
    targetType: 'user',
    limit: 50000,
    usage: 12500,
    period: 'monthly',
    status: 'active',
    restrictedFeatures: []
  },
  {
    id: 'lim-2',
    targetId: 'b1',
    targetType: 'team',
    limit: 500000,
    usage: 180000,
    period: 'monthly',
    status: 'active',
    restrictedFeatures: ['voice']
  }
];

export const MOCK_AVATARS: LiveAvatar[] = [
  {
    id: 'av-001',
    name: 'Athena',
    title: 'Academic & Socratic Lead',
    subject: 'All Disciplines & Socratic Guided Learning',
    provider: 'enara-webrtc',
    avatarModelId: 'Athena_Expressive_Interactive_v3',
    voiceId: 'en-US-JennyNeural',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=600',
    accent: 'American (Clear Academic)',
    personalityPrompt: 'Encouraging, highly structured, uses Socratic questioning to guide students to discovery without immediately giving answers.',
    isActive: true,
    tags: ['Socratic', 'Concept Mastery', 'STEM & Arts'],
    streamingQuality: '1080p',
    latencyMs: 165,
    totalSessions: 1420,
    rating: 4.9,
    gender: 'female'
  },
  {
    id: 'av-002',
    name: 'Marcus',
    title: 'STEM & Physics Specialist',
    subject: 'Physics, Calculus, Advanced Algebra',
    provider: 'enara-webrtc',
    avatarModelId: 'Marcus_STEM_Pro_v2',
    voiceId: 'en-US-GuyNeural',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600',
    accent: 'British (Academic Precision)',
    personalityPrompt: 'Analytical, calm, breaks down complex equations into step-by-step physical intuition with clear diagrams and examples.',
    isActive: true,
    tags: ['STEM', 'Calculus', 'Step-by-Step'],
    streamingQuality: '1080p',
    latencyMs: 180,
    totalSessions: 980,
    rating: 4.85,
    gender: 'male'
  },
  {
    id: 'av-003',
    name: 'Sofia',
    title: 'Humanities & Language Arts Tutor',
    subject: 'Literature, History, Essay Writing & Debate',
    provider: 'enara-webrtc',
    avatarModelId: 'Sofia_Humanities_v1',
    voiceId: 'en-US-AriaNeural',
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=600',
    accent: 'Mid-Atlantic (Articulate & Engaging)',
    personalityPrompt: 'Warm, expressive, passionate about historical context, critical analysis, and vocabulary development.',
    isActive: true,
    tags: ['Humanities', 'Writing', 'Languages'],
    streamingQuality: '1080p',
    latencyMs: 172,
    totalSessions: 740,
    rating: 4.92,
    gender: 'female'
  },
  {
    id: 'av-004',
    name: 'Dr. Alistair',
    title: 'Higher Ed & Research Professor',
    subject: 'Computer Science, Data Science, Biology',
    provider: 'tavus',
    avatarModelId: 'Alistair_Professor_Interactive',
    voiceId: 'en-GB-RyanNeural',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=600',
    accent: 'British (Oxbridge)',
    personalityPrompt: 'Formal yet engaging university level professor focusing on research methodologies, rigorous logic, and algorithmic thinking.',
    isActive: true,
    tags: ['Higher Ed', 'Computer Science', 'Research'],
    streamingQuality: '1080p',
    latencyMs: 195,
    totalSessions: 610,
    rating: 4.88,
    gender: 'male'
  },
  {
    id: 'av-005',
    name: 'Maya',
    title: 'Interactive Study Coach',
    subject: 'Exam Preparation & Active Recall',
    provider: 'elevenlabs-did',
    avatarModelId: 'Maya_Coach_v2',
    voiceId: 'en-US-SaraNeural',
    avatarUrl: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&q=80&w=600',
    accent: 'Australian (Friendly & Energetic)',
    personalityPrompt: 'Dynamic, supportive, uses flashcards, quiz prompts, and spaced repetition techniques to build confidence before exams.',
    isActive: true,
    tags: ['Exam Prep', 'Recall', 'High-Energy'],
    streamingQuality: '720p',
    latencyMs: 210,
    totalSessions: 890,
    rating: 4.91,
    gender: 'female'
  }
];

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  provider: 'enara-webrtc',
  apiKey: '',
  apiEndpoint: '/api/avatar',
  defaultAvatarId: 'av-001',
  quality: '1080p',
  autoStartVideo: true,
  enableSubtitles: true,
  sessionTimeoutMinutes: 30,
  maxConcurrentSessions: 500,
  webrtcIceServers: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302'
  ]
};

export const MOCK_AVATAR_ANALYTICS: AvatarStreamAnalytics = {
  activeSessionsCount: 14,
  totalStreamMinutes: 18450,
  avgLatencyMs: 174,
  tokenExpenditureMonthly: 34200,
  providerStatus: {
    enaraAvatar: 'operational',
    elevenlabs: 'operational',
    tavus: 'operational'
  },
  recentSessions: [
    {
      id: 'sess-801',
      avatarId: 'av-001',
      avatarName: 'Athena',
      studentId: 'STU001',
      studentName: 'Sarah Ahmed',
      startTime: '10 mins ago',
      durationSeconds: 600,
      status: 'active',
      latencyMs: 162,
      provider: 'Enara Live'
    },
    {
      id: 'sess-802',
      avatarId: 'av-002',
      avatarName: 'Marcus',
      studentId: 'STU002',
      studentName: 'Omar Khalid',
      startTime: '18 mins ago',
      durationSeconds: 1080,
      status: 'active',
      latencyMs: 185,
      provider: 'Enara Live'
    },
    {
      id: 'sess-803',
      avatarId: 'av-003',
      avatarName: 'Sofia',
      studentId: 'STU003',
      studentName: 'Lina Mansour',
      startTime: '25 mins ago',
      durationSeconds: 1500,
      status: 'ended',
      latencyMs: 170,
      provider: 'Enara Live'
    },
    {
      id: 'sess-804',
      avatarId: 'av-004',
      avatarName: 'Dr. Alistair',
      studentId: 'STU004',
      studentName: 'Youssef Hassan',
      startTime: '42 mins ago',
      durationSeconds: 2520,
      status: 'ended',
      latencyMs: 192,
      provider: 'Tavus'
    }
  ]
};

