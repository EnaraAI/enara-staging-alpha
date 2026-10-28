import { createTutorSessionWithRailway } from "./railwayApi";
import { stripThinkingContent } from "../components/MessageContent";

export const getTutorResponse = async (
  history: {role: 'user'|'model', parts: {text: string}[]}[], 
  prompt: string,
  lessonContext?: string
): Promise<string> => {
  try {
    // 1. Communicate with Enara Railway backend AI Tutor endpoint (/api/railway/me/tutor/sessions)
    const railwayResult = await createTutorSessionWithRailway({
      prompt,
      history,
      lessonContext,
      subjectId: 'general-tutor'
    });

    if (railwayResult) {
      const candidates = [
        railwayResult.response,
        railwayResult.text,
        railwayResult.message,
        railwayResult.answer,
        railwayResult.reply
      ].filter(Boolean);

      for (const text of candidates) {
        if (typeof text === 'string' && text.trim().length > 0) {
          return stripThinkingContent(text);
        }
      }
    }
  } catch (rwErr) {
    console.warn("Railway /api/me/tutor/sessions notice:", rwErr);
  }

  // 2. Direct Express local backend tutor endpoint (/api/me/tutor/sessions)
  try {
    const res = await fetch('/api/me/tutor/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, history, lessonContext })
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.response || data.answer || data.reply || data.text;
      if (typeof text === 'string' && text.trim().length > 0) {
        return stripThinkingContent(text);
      }
    }
  } catch (err) {
    console.warn("Local backend /api/me/tutor/sessions notice:", err);
  }

  // No canned answers: say plainly that the tutor didn't answer.
  throw new Error('The AI tutor is unavailable right now. Please try again.');
};

export const getEmbedding = async (text: string, _taskType?: string): Promise<number[]> => {
  // Deterministic pseudo-random embedding generator for 768 dimensions
  const vector: number[] = [];
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  for (let d = 0; d < 768; d++) {
    const val = Math.sin(hash + d * 0.123) * 0.5;
    vector.push(Number(val.toFixed(6)));
  }
  return vector;
};

export const generateSpeech = async (_text: string) => {
  return null;
};

// Was a placeholder returning made-up content; the real feature lives elsewhere.
export const generateAssessment = async (_params: any): Promise<any> => {
  throw new Error('AI drafts are made in the Assessment Builder, where every question is reviewed before publishing.');
};

// Was a placeholder returning made-up content; the real feature lives elsewhere.
export const getAssessmentRecommendations = async (_data: { mistakes: any[]; chatLogs: string[] }): Promise<any> => {
  throw new Error('Recommendations come from recorded evidence: see the Teaching Dashboard and Class Insights.');
};

// Was a placeholder returning made-up content; the real feature lives elsewhere.
export const generateRubric = async (_params: { topic: string; objectives: string; totalPoints: number }): Promise<any> => {
  throw new Error('Rubrics are written per open-response question in the Assessment Builder (AI drafts included).');
};

export const generateStudyPlan = async (courses: any[], _performanceData: any) => {
  const courseTitles = courses.map(c => c.title || c.name || 'Core Course');
  return {
    title: "Enara Personalized Academic Plan",
    objective: "Optimize study efficiency and achieve mastery across enrolled subjects",
    weeklySchedule: [
      {
        week: 1,
        focus: "Foundational Review & Concept Mapping",
        tasks: [
          { day: "Monday", subject: courseTitles[0] || "Core Subject", topic: "Fundamental Definitions", description: "Review lecture slides and create concept maps", estimatedTime: "45 mins" },
          { day: "Wednesday", subject: courseTitles[1] || courseTitles[0] || "Elective", topic: "Guided Problem Solving", description: "Complete practice problem set 1", estimatedTime: "60 mins" },
          { day: "Friday", subject: "Self-Assessment", topic: "Knowledge Check", description: "Take quick quiz on Enara platform", estimatedTime: "30 mins" }
        ]
      },
      {
        week: 2,
        focus: "Advanced Problem Solving & Active Recall",
        tasks: [
          { day: "Tuesday", subject: courseTitles[0] || "Core Subject", topic: "Complex Case Analysis", description: "Work through step-by-step analytical problems", estimatedTime: "60 mins" },
          { day: "Thursday", subject: "Enara AI Tutor", topic: "Socratic Q&A Session", description: "Ask AI Tutor about challenging edge cases", estimatedTime: "45 mins" }
        ]
      }
    ],
    tips: [
      "Use active recall after each study session rather than re-reading notes.",
      "Break complex topics into 25-minute Pomodoro focus blocks.",
      "Ask the Enara AI Tutor whenever you hit a conceptual roadblock."
    ]
  };
};

// Was a placeholder returning made-up content; the real feature lives elsewhere.
export const generateLessonPlan = async (_params: { courseName: string; gaps: string; outcomes: string }): Promise<any> => {
  throw new Error('Lesson plans are drafted in the Lesson Planner.');
};

export const generateInterventionPlan = async (params: { batchName: string, issue: string, studentCount: number }) => {
  return {
    title: `Intervention Plan for ${params.batchName}`,
    objective: `Resolve identified academic issue: ${params.issue}`,
    riskAnalysis: `${params.studentCount} students currently identified for proactive support. Early intervention reduces academic drop risks.`,
    remedialSteps: [
      { title: "Supplemental Workshop", description: "Conduct targeted review sessions covering weak topics.", targetGroup: "Impacted cohort" },
      { title: "AI Tutor Goal Setting", description: "Assign automated weekly review goals via Enara Assistant.", targetGroup: "All students in batch" }
    ],
    monitoringStrategy: "Weekly automated analytics check via Enara Admin dashboard."
  };
};

export const generateImage = async (_prompt: string, _aspectRatio: string = "1:1") => {
  return null;
};
