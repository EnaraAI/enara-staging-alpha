import { Schema, model, models, type Model } from 'mongoose';
import { requiredOrg } from './common';

// lms_mic_daily (mic / new tab, item 6): how often the microphone works, is
// blocked by the LMS frame, is refused, missing or busy, and how often "Open
// in a new tab" is used. Daily counts per school, browser family, frame and
// feature. IDs and enumerated values only: no user, no name, no user-agent
// string. Rows expire after about 13 months.
export const MIC_EVENTS = ['mic_ok', 'mic_blocked_in_frame', 'mic_denied', 'mic_none', 'mic_busy', 'new_tab_opened'] as const;
export const BROWSER_FAMILIES = ['chrome', 'safari', 'firefox', 'edge', 'other'] as const;
/** 'none': "Open in new tab" from the frame bar or the launch page (no mic feature). */
export const MIC_FEATURES = ['speaking', 'tutor_voice', 'avatar', 'none'] as const;
export type MicEvent = (typeof MIC_EVENTS)[number];
export type BrowserFamily = (typeof BROWSER_FAMILIES)[number];
export type MicFeature = (typeof MIC_FEATURES)[number];

export interface ILmsMicDaily {
  institutionId: string;
  /** UTC day, YYYY-MM-DD. */
  day: string;
  dayStart: Date;
  event: MicEvent;
  browserFamily: BrowserFamily;
  inFrame: boolean;
  feature: MicFeature;
  count: number;
}

const micDailySchema = new Schema<ILmsMicDaily>(
  {
    institutionId: requiredOrg,
    day: { type: String, required: true },
    dayStart: { type: Date, required: true },
    event: { type: String, enum: MIC_EVENTS, required: true },
    browserFamily: { type: String, enum: BROWSER_FAMILIES, required: true },
    inFrame: { type: Boolean, required: true },
    feature: { type: String, enum: MIC_FEATURES, required: true },
    count: { type: Number, default: 0 },
  },
  { collection: 'lms_mic_daily', versionKey: false },
);
micDailySchema.index({ institutionId: 1, day: 1, event: 1, browserFamily: 1, inFrame: 1, feature: 1 }, { unique: true, name: 'one_counter' });
micDailySchema.index({ dayStart: 1 }, { expireAfterSeconds: 400 * 86400 });

export const LmsMicDaily = (models.LmsMicDaily as Model<ILmsMicDaily>) || model<ILmsMicDaily>('LmsMicDaily', micDailySchema);
