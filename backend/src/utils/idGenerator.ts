import { getConfig } from '../config/env';

export function generateCurriculumId(): string {
  return `CUR-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Date.now().toString().slice(-4)}`;
}

export function generateChapterId(): string {
  return `ch${Date.now()}${Math.random().toString(36).substring(2, 5)}`;
}

export function generateBatchId(): string {
  return `b${Date.now()}`;
}

export function generateInstanceId(): string {
  return `inst-${Date.now()}`;
}

export function generateStudentId(): string {
  return `STU${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
}

export function generateTutorSessionId(): string {
  return `tut-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

export function generateAssessmentId(): string {
  return `ASM${Date.now().toString().slice(-6)}`;
}

export function generateAttemptId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

export function generateAttendanceSessionId(): string {
  return `ATT-SES-${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
}

export function generateAttendanceRecordId(): string {
  return `ATT-REC-${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
}

export function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);
}

export function formatDate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

export function buildDeploymentLink(curriculumId: string): string {
  const base = getConfig().frontendUrl || 'http://localhost:5173';
  return `${base}/?course=${curriculumId}`;
}
