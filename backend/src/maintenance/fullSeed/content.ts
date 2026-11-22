// Content for the full seed (lms-test only; docs/lms/FULL_SEED_PLAN.md): names, schools, subjects, lessons, questions, tutor chats.
// Everything reads like ordinary school data. No public figures; no word that marks the data as invented.

export const EMAIL_DOMAIN = 'school.enara.app';

export const MALE = ['Ahmed', 'Omar', 'Youssef', 'Karim', 'Mostafa', 'Hassan', 'Khaled', 'Tarek', 'Mahmoud', 'Ali', 'Hussein', 'Ziad', 'Adham', 'Seif', 'Marwan', 'Hamza', 'Yassin', 'Malek', 'Sherif', 'Walid', 'Ehab', 'Hany', 'Ayman', 'Fares', 'Nour El-Din', 'Belal', 'Kareem', 'Taha', 'Moaz', 'Anas'];
export const FEMALE = ['Nour', 'Salma', 'Mariam', 'Habiba', 'Farida', 'Jana', 'Malak', 'Laila', 'Yasmin', 'Hana', 'Aya', 'Rana', 'Dina', 'Mona', 'Heba', 'Reem', 'Nada', 'Sara', 'Menna', 'Shahd', 'Rawan', 'Lina', 'Jumana', 'Nadine', 'Dalia', 'Ghada', 'Rania', 'Amira', 'Hoda', 'Noha'];
export const FAMILY = ['Hassan', 'Mansour', 'Abdelrahman', 'El-Sayed', 'Fahmy', 'Ibrahim', 'Saleh', 'Khalil', 'Gamal', 'Farouk', 'Nasser', 'Ezzat', 'Zaki', 'Hamdy', 'Kamel', 'Ragab', 'Soliman', 'Badawi', 'El-Masry', 'Abdelaziz', 'Shawky', 'Helmy', 'Fawzy', 'Rashad', 'Lotfy', 'Osman', 'Wahba', 'Naguib', 'Morsy', 'Tawfik', 'Sabry', 'Anwar', 'Hegazy', 'Shaker', 'Raafat'];
export const INTL: [string, string, 'm' | 'f'][] = [
  ['Emma', 'Clarke', 'f'], ['Lucas', 'Martin', 'm'], ['Sofia', 'Rossi', 'f'], ['Daniel', 'Becker', 'm'], ['Amelia', 'Wright', 'f'], ['Noah', 'Fischer', 'm'],
  ['Chloe', 'Dubois', 'f'], ['Leo', 'Moreau', 'm'], ['Hannah', 'Kim', 'f'], ['Arjun', 'Mehta', 'm'], ['Aisha', 'Rahman', 'f'], ['Rami', 'Haddad', 'm'],
  ['Maya', 'Patel', 'f'], ['Ethan', 'Brooks', 'm'], ['Isabella', 'Costa', 'f'], ['Mateo', 'Alvarez', 'm'], ['Zara', 'Khan', 'f'], ['Oliver', 'Hughes', 'm'],
];
// Full names that belong to well-known people: never produced.
export const PUBLIC_FIGURES = ['mohamed salah', 'amr diab', 'ahmed zewail', 'omar sharif', 'naguib mahfouz', 'mohamed elneny', 'ahmed hassan', 'hany ramzy', 'mona zaki', 'yousra', 'ahmed helmy', 'tamer hosny', 'sherine abdelwahab'];

export type SubjectKey = 'ENG' | 'MATH' | 'SCI' | 'ARB';
export interface SubjectDef {
  key: SubjectKey; subject: string; courseName: string; type: string; languages: string[]; rtl: boolean;
  lessons: { title: string; spec?: { objectives: string[]; vocabulary: string[]; grammar: string[]; skills: string[] } }[];
  objectives: { code: string; title: string }[];
  quizzes: { title: string; questions: { id: string; type: 'multiple-choice' | 'short-answer'; text: string; options?: string[]; correctAnswer: string; wrong: string }[] }[];
  errors: { code: string; label: string }[];
  reviews: { question: string; answer: string; options?: string[] }[];
  chats: { title: string; turns: [string, string][] }[];
  avatarLessons: string[];
}

export const SUBJECTS: Record<SubjectKey, SubjectDef> = {
  ENG: {
    key: 'ENG', subject: 'English', courseName: 'English', type: 'Language', languages: ['English'], rtl: false,
    lessons: [
      { title: 'Greetings and introductions', spec: { objectives: ['Greet people and introduce yourself'], vocabulary: ['hello', 'nice to meet you', 'my name is'], grammar: ['to be: I am / you are'], skills: ['speaking', 'writing'] } },
      { title: 'My family', spec: { objectives: ['Talk about family members'], vocabulary: ['mother', 'father', 'brother', 'sister', 'cousin'], grammar: ['have got / has got'], skills: ['reading', 'speaking'] } },
      { title: 'Daily routines', spec: { objectives: ['Describe a daily routine'], vocabulary: ['get up', 'have breakfast', 'go to school'], grammar: ['present simple with he / she'], skills: ['writing'] } },
      { title: 'Food and shopping', spec: { objectives: ['Ask for things in a shop'], vocabulary: ['bread', 'milk', 'how much'], grammar: ['some / any'], skills: ['speaking', 'listening'] } },
      { title: 'Last holiday', spec: { objectives: ['Talk about the past'], vocabulary: ['went', 'saw', 'visited'], grammar: ['past simple: regular and irregular verbs'], skills: ['writing', 'speaking'] } },
    ],
    objectives: [{ code: 'ENG.1', title: 'Introduce yourself and others' }, { code: 'ENG.2', title: 'Use the present simple for routines' }, { code: 'ENG.3', title: 'Use the past simple for past events' }],
    quizzes: [
      { title: 'Family words quiz', questions: [
        { id: 'q1', type: 'multiple-choice', text: 'My father\'s sister is my ...', options: ['aunt', 'uncle', 'cousin'], correctAnswer: 'aunt', wrong: 'cousin' },
        { id: 'q2', type: 'short-answer', text: 'Complete: She ___ got two brothers.', correctAnswer: 'has', wrong: 'have' },
        { id: 'q3', type: 'multiple-choice', text: 'Which word is a family member?', options: ['cousin', 'kitchen', 'garden'], correctAnswer: 'cousin', wrong: 'garden' } ] },
      { title: 'Daily routine check', questions: [
        { id: 'q1', type: 'short-answer', text: 'Complete: He ___ (get) up at seven.', correctAnswer: 'gets', wrong: 'get' },
        { id: 'q2', type: 'multiple-choice', text: 'We ___ breakfast at eight.', options: ['have', 'has', 'having'], correctAnswer: 'have', wrong: 'has' },
        { id: 'q3', type: 'short-answer', text: 'Complete: She ___ (go) to school by bus.', correctAnswer: 'goes', wrong: 'go' } ] },
      { title: 'Past simple practice', questions: [
        { id: 'q1', type: 'short-answer', text: 'Yesterday I ___ (go) to the park.', correctAnswer: 'went', wrong: 'goed' },
        { id: 'q2', type: 'multiple-choice', text: 'Last summer we ___ Alexandria.', options: ['visited', 'visit', 'visiting'], correctAnswer: 'visited', wrong: 'visit' },
        { id: 'q3', type: 'short-answer', text: 'They ___ (see) a film on Friday.', correctAnswer: 'saw', wrong: 'seen' } ] },
    ],
    errors: [{ code: 'third_person_s', label: 'Missing -s with he / she' }, { code: 'past_irregular', label: 'Irregular past forms' }, { code: 'have_has', label: 'have / has' }],
    reviews: [{ question: 'Complete: He ___ (play) football on Fridays.', answer: 'plays' }, { question: 'Past of "go"?', answer: 'went', options: ['goed', 'went', 'gone'] }, { question: 'My mother\'s brother is my ...', answer: 'uncle', options: ['uncle', 'aunt', 'cousin'] }],
    chats: [
      { title: 'Present simple with he and she', turns: [['Why do we say "she goes" and not "she go"?', 'Good question! With he, she and it we add -s or -es to the verb in the present simple: she goes, he plays, it works. Try one: My brother ___ (watch) TV every evening.'], ['My brother watches TV every evening', 'Yes, "watches" is right: watch ends in -ch, so we add -es. Next: My sister ___ (study) English.']] },
      { title: 'Talking about my holiday', turns: [['how do I say I went to the sea', 'You can say: "Last summer I went to the sea." "Went" is the past of "go". What did you do there? Write one sentence.'], ['I swimmed every day', 'Nearly! "Swim" is irregular: the past is "swam". So: "I swam every day." Can you say one more thing you did?']] },
    ],
    avatarLessons: ['Speaking: my daily routine', 'Speaking: my family', 'Speaking: last weekend'],
  },
  MATH: {
    key: 'MATH', subject: 'Maths', courseName: 'Mathematics', type: 'National', languages: ['English'], rtl: false,
    lessons: [{ title: 'Fractions' }, { title: 'Decimals' }, { title: 'Percentages' }, { title: 'Area and perimeter' }, { title: 'Simple equations' }],
    objectives: [{ code: 'MATH.1', title: 'Add and subtract fractions' }, { code: 'MATH.2', title: 'Find area and perimeter of rectangles' }, { code: 'MATH.3', title: 'Solve one-step equations' }],
    quizzes: [
      { title: 'Fractions quiz', questions: [
        { id: 'q1', type: 'short-answer', text: 'What is 2/8 + 3/8?', correctAnswer: '5/8', wrong: '5/16' },
        { id: 'q2', type: 'multiple-choice', text: 'Which fraction is bigger?', options: ['1/2', '1/3', '1/4'], correctAnswer: '1/2', wrong: '1/4' },
        { id: 'q3', type: 'short-answer', text: 'Write 3/4 as a decimal.', correctAnswer: '0.75', wrong: '0.34' } ] },
      { title: 'Area and perimeter check', questions: [
        { id: 'q1', type: 'short-answer', text: 'Perimeter of a 7 cm by 3 cm rectangle?', correctAnswer: '20 cm', wrong: '21 cm' },
        { id: 'q2', type: 'short-answer', text: 'Area of a 6 m by 4 m rectangle?', correctAnswer: '24 m²', wrong: '20 m²' },
        { id: 'q3', type: 'multiple-choice', text: 'Area is measured in ...', options: ['square units', 'units', 'degrees'], correctAnswer: 'square units', wrong: 'units' } ] },
      { title: 'Equations practice', questions: [
        { id: 'q1', type: 'short-answer', text: 'Solve: x + 7 = 12', correctAnswer: '5', wrong: '19' },
        { id: 'q2', type: 'short-answer', text: 'Solve: 3x = 18', correctAnswer: '6', wrong: '15' },
        { id: 'q3', type: 'short-answer', text: 'Solve: 2x - 6 = 10', correctAnswer: '8', wrong: '2' } ] },
    ],
    errors: [{ code: 'fraction_add_denominators', label: 'Adding the bottom numbers' }, { code: 'area_perimeter_mixup', label: 'Area and perimeter mixed up' }, { code: 'inverse_operation', label: 'Undoing steps in the wrong order' }],
    reviews: [{ question: 'What is 1/4 + 2/4?', answer: '3/4' }, { question: 'Perimeter of a 5 cm square?', answer: '20 cm' }, { question: 'Solve: x - 4 = 9', answer: '13' }],
    chats: [
      { title: 'Adding fractions', turns: [['how do i add 2/8 and 3/8', 'When the bottom numbers are the same, keep the bottom number and add the top ones: 2 + 3 = 5, so 2/8 + 3/8 = 5/8. Try this one: 1/6 + 4/6 = ?'], ['5/12', 'Close, but we only add the top numbers. The bottom stays 6, so 1/6 + 4/6 = 5/6. Try: 2/9 + 5/9 = ?']] },
      { title: 'Area of a rectangle', turns: [['whats the difference between area and perimeter', 'Perimeter is the distance around the edge; area is the space inside. For a 4 cm by 3 cm rectangle: perimeter = 4 + 3 + 4 + 3 = 14 cm, area = 4 × 3 = 12 cm². What is the area of a 5 cm by 2 cm rectangle?'], ['10 cm²', 'Exactly right: 5 × 2 = 10 cm². Now its perimeter?']] },
    ],
    avatarLessons: ['Fractions with pictures', 'Area and perimeter'],
  },
  SCI: {
    key: 'SCI', subject: 'Science', courseName: 'Science', type: 'National', languages: ['English'], rtl: false,
    lessons: [{ title: 'Living things' }, { title: 'States of matter' }, { title: 'Forces and motion' }, { title: 'Electric circuits' }, { title: 'The water cycle' }],
    objectives: [{ code: 'SCI.1', title: 'Describe the three states of matter' }, { code: 'SCI.2', title: 'Explain how a simple circuit works' }, { code: 'SCI.3', title: 'Describe the water cycle' }],
    quizzes: [
      { title: 'States of matter quiz', questions: [
        { id: 'q1', type: 'multiple-choice', text: 'Ice is a ...', options: ['solid', 'liquid', 'gas'], correctAnswer: 'solid', wrong: 'liquid' },
        { id: 'q2', type: 'short-answer', text: 'Water turning into vapour is called ...', correctAnswer: 'evaporation', wrong: 'condensation' },
        { id: 'q3', type: 'multiple-choice', text: 'Which takes the shape of its container?', options: ['liquid', 'solid', 'rock'], correctAnswer: 'liquid', wrong: 'solid' } ] },
      { title: 'Circuits check', questions: [
        { id: 'q1', type: 'multiple-choice', text: 'A bulb lights when the circuit is ...', options: ['complete', 'broken', 'open'], correctAnswer: 'complete', wrong: 'open' },
        { id: 'q2', type: 'short-answer', text: 'A material that lets current flow is a ...', correctAnswer: 'conductor', wrong: 'insulator' },
        { id: 'q3', type: 'multiple-choice', text: 'Which is an insulator?', options: ['plastic', 'copper', 'iron'], correctAnswer: 'plastic', wrong: 'copper' } ] },
      { title: 'Water cycle practice', questions: [
        { id: 'q1', type: 'short-answer', text: 'Vapour cooling into drops is called ...', correctAnswer: 'condensation', wrong: 'evaporation' },
        { id: 'q2', type: 'multiple-choice', text: 'What heats the water in the sea?', options: ['the Sun', 'the Moon', 'the wind'], correctAnswer: 'the Sun', wrong: 'the wind' },
        { id: 'q3', type: 'short-answer', text: 'Rain, snow and hail are kinds of ...', correctAnswer: 'precipitation', wrong: 'evaporation' } ] },
    ],
    errors: [{ code: 'evaporation_condensation', label: 'Evaporation and condensation mixed up' }, { code: 'open_circuit', label: 'Open and closed circuits' }, { code: 'states_particles', label: 'Particles in each state' }],
    reviews: [{ question: 'Steam is a ...', answer: 'gas', options: ['solid', 'liquid', 'gas'] }, { question: 'Copper is a conductor or an insulator?', answer: 'conductor' }, { question: 'Clouds form by ...', answer: 'condensation' }],
    chats: [
      { title: 'How clouds form', turns: [['how do clouds form?', 'The Sun heats water, it evaporates into vapour, the vapour rises and cools, and it condenses into tiny drops that make clouds. What do we call the cooling step?'], ['condensation', 'Yes! Condensation is vapour turning back into liquid drops. When the drops get heavy, what happens?']] },
      { title: 'Why my bulb will not light', turns: [['why wont my bulb light if theres a gap in the wires', 'A circuit must be a complete loop: battery, wire, bulb, wire, back to the battery. A gap breaks the loop, so no current flows. What could you use to close the gap: a copper wire or a plastic straw?'], ['a copper wire', 'Right: copper is a conductor, so current flows and the bulb lights.']] },
    ],
    avatarLessons: ['The water cycle', 'States of matter'],
  },
  ARB: {
    key: 'ARB', subject: 'اللغة العربية', courseName: 'اللغة العربية', type: 'National', languages: ['Arabic'], rtl: true,
    lessons: [{ title: 'الجملة الاسمية' }, { title: 'الجملة الفعلية' }, { title: 'المفعول به' }, { title: 'كان وأخواتها' }, { title: 'حروف الجر' }],
    objectives: [{ code: 'ARB.1', title: 'تحديد المبتدأ والخبر' }, { code: 'ARB.2', title: 'تحديد الفاعل والمفعول به' }, { code: 'ARB.3', title: 'إعراب الاسم بعد حرف الجر' }],
    quizzes: [
      { title: 'تقييم الجملة الاسمية', questions: [
        { id: 'q1', type: 'short-answer', text: 'ما المبتدأ في جملة «الطالبُ مجتهدٌ»؟', correctAnswer: 'الطالب', wrong: 'مجتهد' },
        { id: 'q2', type: 'short-answer', text: 'ما الخبر في جملة «السماءُ صافيةٌ»؟', correctAnswer: 'صافية', wrong: 'السماء' },
        { id: 'q3', type: 'multiple-choice', text: 'الجملة الاسمية تبدأ بـ ...', options: ['اسم', 'فعل', 'حرف'], correctAnswer: 'اسم', wrong: 'فعل' } ] },
      { title: 'أسئلة الفاعل والمفعول به', questions: [
        { id: 'q1', type: 'short-answer', text: 'ما الفاعل في «نجحَ الطالبُ»؟', correctAnswer: 'الطالب', wrong: 'نجح' },
        { id: 'q2', type: 'short-answer', text: 'استخرج المفعول به: «قرأ عليٌّ الكتابَ»', correctAnswer: 'الكتاب', wrong: 'علي' },
        { id: 'q3', type: 'multiple-choice', text: 'المفعول به يكون ...', options: ['منصوبًا', 'مرفوعًا', 'مجرورًا'], correctAnswer: 'منصوبًا', wrong: 'مرفوعًا' } ] },
      { title: 'تدريب حروف الجر', questions: [
        { id: 'q1', type: 'multiple-choice', text: 'أيّ كلمة حرف جر؟', options: ['في', 'كتب', 'جميل'], correctAnswer: 'في', wrong: 'كتب' },
        { id: 'q2', type: 'short-answer', text: 'أكمل: ذهبتُ إلى ... (المدرسة)', correctAnswer: 'المدرسةِ', wrong: 'المدرسةُ' },
        { id: 'q3', type: 'multiple-choice', text: 'الاسم بعد حرف الجر يكون ...', options: ['مجرورًا', 'منصوبًا', 'مرفوعًا'], correctAnswer: 'مجرورًا', wrong: 'منصوبًا' } ] },
    ],
    errors: [{ code: 'khabar_case', label: 'رفع الخبر' }, { code: 'object_case', label: 'نصب المفعول به' }, { code: 'jar_case', label: 'جر الاسم بعد حرف الجر' }],
    reviews: [{ question: 'ما الخبر في «الجوُّ جميلٌ»؟', answer: 'جميل' }, { question: 'الاسم بعد «إلى» يكون ...', answer: 'مجرورًا', options: ['مجرورًا', 'منصوبًا', 'مرفوعًا'] }, { question: 'ما المفعول به في «شرب الولدُ الحليبَ»؟', answer: 'الحليب' }],
    chats: [
      { title: 'المبتدأ والخبر', turns: [['يعني إيه جملة اسمية؟', 'الجملة الاسمية تبدأ باسم، ولها ركنان: المبتدأ والخبر. مثال: «الطالبُ مجتهدٌ». ما المبتدأ في «الشمسُ مشرقةٌ»؟'], ['الشمس', 'أحسنت! «الشمسُ» مبتدأ مرفوع، و«مشرقةٌ» خبر. ما الخبر في «البيتُ كبيرٌ»؟']] },
      { title: 'المفعول به', turns: [['إزاي أعرف المفعول به؟', 'بعد الفعل والفاعل اسأل: ماذا؟ في «قرأ الولدُ القصةَ»: ماذا قرأ الولد؟ القصةَ، وهي مفعول به منصوب. جرّب: ما المفعول به في «كتبتْ مريمُ الدرسَ»؟'], ['الدرس', 'صحيح، «الدرسَ» مفعول به منصوب بالفتحة.']] },
    ],
    avatarLessons: ['محادثة: الجملة الاسمية'],
  },
};

export interface SchoolDef {
  id: string; name: string; status: 'active' | 'suspended'; portal: 'off' | 'free'; results: 'immediately' | 'after_release'; emailLanguage: 'en' | 'ar';
  pathwayMode: 'strict_sequence' | 'teacher_controlled' | 'adaptive'; adultLearners?: boolean; lmsSystem?: string; createdDaysAgo: number; onboarding: string;
  groups: { key: string; name: string; age: number; size: number; subjects: SubjectKey[] }[];
  releasePolicy: 'auto' | 'manual';
}

export const SCHOOLS: SchoolDef[] = [
  {
    id: 'SCH-NVIS', name: 'Nile Valley International School', status: 'active', portal: 'free', results: 'after_release', emailLanguage: 'en', pathwayMode: 'teacher_controlled',
    createdDaysAgo: 70, onboarding: 'running: every class in use', releasePolicy: 'manual',
    groups: [
      { key: 'G3A', name: 'Grade 3A', age: 8, size: 9, subjects: ['ENG', 'MATH', 'ARB'] },
      { key: 'G5A', name: 'Grade 5A', age: 10, size: 9, subjects: ['ENG', 'MATH', 'SCI', 'ARB'] },
      { key: 'G7A', name: 'Grade 7A', age: 12, size: 9, subjects: ['ENG', 'MATH', 'SCI'] },
      { key: 'G9B', name: 'Grade 9B', age: 14, size: 9, subjects: ['ENG', 'MATH', 'SCI'] },
      { key: 'G11A', name: 'Grade 11A', age: 16, size: 9, subjects: ['ENG', 'MATH'] },
    ],
  },
  {
    id: 'SCH-NOUR', name: 'Al Nour Language School', status: 'active', portal: 'free', results: 'immediately', emailLanguage: 'ar', pathwayMode: 'adaptive',
    createdDaysAgo: 63, onboarding: 'running: results shown at once', releasePolicy: 'auto',
    groups: [
      { key: 'G2B', name: 'Grade 2 Blue', age: 7, size: 9, subjects: ['ARB', 'ENG'] },
      { key: 'G4G', name: 'Grade 4 Green', age: 9, size: 9, subjects: ['ARB', 'ENG', 'MATH'] },
      { key: 'G6R', name: 'Grade 6 Red', age: 11, size: 9, subjects: ['ARB', 'ENG', 'MATH', 'SCI'] },
      { key: 'G8Y', name: 'Grade 8 Gold', age: 13, size: 9, subjects: ['ARB', 'ENG', 'SCI'] },
    ],
  },
  {
    id: 'SCH-RLC', name: 'Riverside Language Centre', status: 'active', portal: 'off', results: 'after_release', emailLanguage: 'en', pathwayMode: 'strict_sequence', adultLearners: true,
    lmsSystem: 'Moodle', createdDaysAgo: 12, onboarding: 'new: Moodle invite sent, not registered yet', releasePolicy: 'manual',
    groups: [
      { key: 'EVB1', name: 'Evening English B1', age: 27, size: 12, subjects: ['ENG'] },
      { key: 'BUSA2', name: 'Business English A2', age: 34, size: 12, subjects: ['ENG'] },
    ],
  },
  {
    id: 'SCH-GHA', name: 'Green Hills Academy', status: 'suspended', portal: 'free', results: 'immediately', emailLanguage: 'en', pathwayMode: 'teacher_controlled',
    createdDaysAgo: 56, onboarding: 'suspended by the platform', releasePolicy: 'auto',
    groups: [
      { key: 'G8A', name: 'Grade 8A', age: 13, size: 8, subjects: ['ENG', 'MATH'] },
      { key: 'G10A', name: 'Grade 10A', age: 15, size: 8, subjects: ['ENG', 'MATH'] },
    ],
  },
];

// Visible-text guard: none of these may appear in anything a user can see.
export const FORBIDDEN_WORDS = /\b(seed|seeded|seeding|demo|demos|test|tests|testing|sample|samples|fake|dummy|placeholder)\b|تجريبي|تجريبية|تجربة|عينة|وهمي|وهمية/i;
