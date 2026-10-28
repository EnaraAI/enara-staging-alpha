import { Schema, model, Document } from 'mongoose';

// One educator's AI chat over their documents (P3). Always loaded by
// institutionId + userId + id, never by id alone. Stored: the question, the
// answer and the server-validated citations (file, page/section, ids); not
// prompts, retrieved passage text, costs or provider details. Deleted 180
// days after the last message, like other AI records.
export const EDUCATOR_CHAT_RETENTION_DAYS = 180;

export interface IEducatorChatCitation {
  n: number;
  uploadId?: string;
  chunkId: string;
  fileName: string;
  page: number | null;
  section?: string;
}

export interface IEducatorChatMessage {
  role: 'user' | 'assistant';
  text: string;
  // assistant only: answered (cited), no_sources, unsupported, refused
  status?: 'answered' | 'no_sources' | 'unsupported' | 'refused';
  citations?: IEducatorChatCitation[];
  uploadIds?: string[];
  at: Date;
}

export interface IEducatorConversation extends Document {
  id: string;
  institutionId: string;
  userId: string;
  title: string;
  messages: IEducatorChatMessage[];
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const citationSchema = new Schema<IEducatorChatCitation>(
  { n: Number, uploadId: String, chunkId: String, fileName: String, page: { type: Number, default: null }, section: String },
  { _id: false },
);
const messageSchema = new Schema<IEducatorChatMessage>(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true },
    status: { type: String, enum: ['answered', 'no_sources', 'unsupported', 'refused'] },
    citations: { type: [citationSchema], default: undefined },
    uploadIds: { type: [String], default: undefined },
    at: { type: Date, required: true },
  },
  { _id: false },
);
const conversationSchema = new Schema<IEducatorConversation>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: { type: String, required: true },
    userId: { type: String, required: true },
    title: { type: String, required: true },
    messages: { type: [messageSchema], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'educator_conversations', timestamps: true },
);
conversationSchema.index({ institutionId: 1, userId: 1, updatedAt: -1 });
conversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EducatorConversation = model<IEducatorConversation>('EducatorConversation', conversationSchema);
