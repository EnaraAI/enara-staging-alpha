import React from 'react';
import { TutorText, type TutorCitation } from './TutorText';

/**
 * Strips model thinking/reasoning tags or thinking headers from raw LLM output.
 * Handles <think>...</think>, <thought>...</thought>, <reasoning>...</reasoning>,
 * "Thinking Process:", "Thought:", and unclosed tags.
 */
export function stripThinkingContent(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // 1. Remove closed thinking/thought/reasoning XML tags
  cleaned = cleaned.replace(/<(think|thought|reasoning)>[\s\S]*?<\/\1>/gi, '');

  // 2. Remove unclosed opening thinking tags up to end or next main header
  cleaned = cleaned.replace(/<(think|thought|reasoning)>[\s\S]*/gi, '');

  // 3. Remove "Thinking Process:" or "Thought Process:" header blocks
  cleaned = cleaned.replace(/^(?:Thinking|Thought)\s+Process:\s*[\s\S]*?(?=\n\n|\n#|\n\*\*|$)/gi, '');

  // 4. Remove standalone "Thought:" or "Thinking:" prefix blocks
  cleaned = cleaned.replace(/^Thought:\s*[\s\S]*?(?=\n\n|\n#|\n\*\*|$)/gi, '');

  // 5. Remove bracketed thinking tags like [Thinking: ...]
  cleaned = cleaned.replace(/\[Thinking:\s*[\s\S]*?\]/gi, '');

  return cleaned.trim();
}

export interface MessageContentProps {
  text: string;
  onNavigate?: (page: string) => void;
  onStartAssessment?: (id: string) => void;
  className?: string;
  /** The reply is still streaming in. */
  streaming?: boolean;
  /** The reply's sources (meta.citations), for the [n] chips. */
  citations?: TutorCitation[] | null;
}

/** A tutor or assistant reply: thinking removed, then the shared TutorText renderer. */
export const MessageContent: React.FC<MessageContentProps> = ({ text, onNavigate, onStartAssessment, className = '', streaming, citations }) => {
  const cleanedText = stripThinkingContent(text);
  if (!cleanedText) {
    return streaming ? null : <span className="text-slate-400 italic">No content generated.</span>;
  }
  return (
    <TutorText
      text={cleanedText}
      streaming={streaming}
      citations={citations}
      onNavigate={onNavigate}
      onStartAssessment={onStartAssessment}
      className={`markdown-body ${className}`}
    />
  );
};
