import { Schema, model } from 'mongoose';

// lms-speed-5: the home page's one-line "next steps" note, written by the model once per student, day and
// set of steps, and shared by every serverless instance (it was kept in one instance's memory, so most
// page loads asked the model again). Deleted two days after it was written.
export interface INextStepsNote {
  _id: string; // `${studentId}:${yyyy-mm-dd}:${step titles}`
  note: string;
  createdAt: Date;
}

const nextStepsNoteSchema = new Schema<INextStepsNote>(
  { _id: String, note: { type: String, required: true }, createdAt: { type: Date, default: () => new Date() } },
  { collection: 'next_steps_notes', versionKey: false },
);
nextStepsNoteSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 86400 });

export const NextStepsNote = model<INextStepsNote>('NextStepsNote', nextStepsNoteSchema);
