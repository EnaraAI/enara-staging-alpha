import React from 'react';
import Markdown from 'react-markdown';
import { Zap, ArrowRight } from 'lucide-react';

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
}

export const MessageContent: React.FC<MessageContentProps> = ({ 
  text, 
  onNavigate, 
  onStartAssessment,
  className = ''
}) => {
  const cleanedText = stripThinkingContent(text);

  if (!cleanedText) {
    return <span className="text-slate-400 italic">No content generated.</span>;
  }

  return (
    <div className={`markdown-body space-y-2 text-sm leading-relaxed ${className}`}>
      <Markdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-base font-bold text-slate-900 mt-3 mb-1.5 pb-1 border-b border-slate-100 flex items-center gap-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-bold text-slate-900 mt-2.5 mb-1 flex items-center gap-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-bold text-teal-800 uppercase tracking-wider mt-2 mb-1">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-bold text-slate-800 mt-1.5 mb-1">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="mb-2 leading-relaxed text-slate-700 font-normal">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 mb-2 pl-1 text-slate-700">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 mb-2 pl-1 text-slate-700 font-medium">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed marker:text-teal-600">
              <span className="text-slate-700">{children}</span>
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-slate-900">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-slate-800">{children}</em>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isInline = !codeClassName && !String(children).includes('\n');
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 rounded-md bg-slate-100 text-teal-800 font-mono text-xs font-semibold border border-slate-200" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <div className="my-2 rounded-xl bg-slate-900 text-slate-100 p-3 font-mono text-xs overflow-x-auto shadow-inner border border-slate-800">
                <code {...props}>{children}</code>
              </div>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-teal-500 pl-3 py-1 my-2 bg-teal-50/50 rounded-r-lg text-slate-700 italic text-xs">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>;

            const isQuickJump = href.startsWith('#navigate:') || href.startsWith('#assessment:') || String(children).toLowerCase().includes('jump');

            const handleClick = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              if (href.startsWith('#navigate:')) {
                const page = href.replace('#navigate:', '');
                if (onNavigate) onNavigate(page);
                window.dispatchEvent(new CustomEvent('enara-navigate', { detail: { page } }));
              } else if (href.startsWith('#assessment:')) {
                const id = href.replace('#assessment:', '');
                if (onStartAssessment) onStartAssessment(id);
                window.dispatchEvent(new CustomEvent('enara-navigate', { detail: { assessmentId: id } }));
              }
            };

            if (isQuickJump) {
              return (
                <button
                  type="button"
                  onClick={handleClick}
                  className="inline-flex items-center gap-1.5 px-3 py-1 my-1 mx-1 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold text-xs shadow-xs hover:shadow transition-all cursor-pointer group shrink-0"
                >
                  <Zap size={12} className="fill-current text-teal-200 group-hover:animate-bounce shrink-0" />
                  <span>{children}</span>
                  <ArrowRight size={12} className="opacity-70 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
              );
            }

            return (
              <a
                href={href}
                onClick={handleClick}
                className="text-teal-600 font-semibold underline hover:text-teal-800 transition-colors"
              >
                {children}
              </a>
            );
          }
        }}
      >
        {cleanedText}
      </Markdown>
    </div>
  );
};
