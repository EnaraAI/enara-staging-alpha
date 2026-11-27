import React from 'react';
import Markdown, { type Components } from 'react-markdown';
import { Zap, ArrowRight } from 'lucide-react';
import { firstStrongDir, prepareTutorMarkdown } from '../services/tutorMarkdown';

// One renderer for every tutor reply a learner sees: the student tutor chat,
// the course tutor (streamed), the review tutor, the children's chat and the
// live call transcript in the chat history. Markdown (bold, italics, lists,
// line breaks, inline code), maths made readable, citation chips, each block
// in its own reading direction (Arabic right to left). Never raw HTML: the
// model's HTML is shown as text, links open only for http(s).

export interface TutorCitation {
  n: number;
  fileName?: string;
  page?: number | null;
  section?: string;
  url?: string;
}

export interface TutorTextProps {
  text: string;
  /** The reply is still arriving: unclosed markers are closed or hidden. */
  streaming?: boolean;
  /** The children's chat: no headings or lists, plain lines. */
  simple?: boolean;
  /** The reply's sources (meta.citations), shown on the [n] chips. */
  citations?: TutorCitation[] | null;
  onNavigate?: (page: string) => void;
  onStartAssessment?: (id: string) => void;
  className?: string;
}

// mdast helpers (react-markdown's tree), typed loosely to need no extra packages.
type MdNode = { type: string; value?: string; children?: MdNode[] };

/** Raw HTML from the model is shown as text, never rendered (also if rehype-raw is ever added). */
function remarkHtmlAsText() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      node.children?.forEach((child, i) => {
        if (child.type === 'html') {
          const text: MdNode = { type: 'text', value: child.value ?? '' };
          node.children![i] = node.type === 'root' ? { type: 'paragraph', children: [text] } : text;
        } else walk(child);
      });
    };
    walk(tree);
  };
}

/** A single line break in a paragraph is a line break (the model writes lines, not wrapped prose). */
function remarkLineBreaks() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type === 'text' && child.value?.includes('\n')) {
          return child.value.split('\n').flatMap((part, i) => (i ? [{ type: 'break' }, { type: 'text', value: part }] : [{ type: 'text', value: part }]));
        }
        walk(child);
        return [child];
      });
    };
    walk(tree);
  };
}

const SAFE_LINK = /^https?:\/\//i;
const textOf = (node: any): string => (node?.type === 'text' ? node.value || '' : (node?.children || []).map(textOf).join(''));
const listDir = (node: any) => firstStrongDir(textOf(node)) ?? undefined;

function citationTitle(n: number, c?: TutorCitation) {
  if (!c?.fileName) return `Source ${n}`;
  return [c.fileName, c.section, c.page ? `page ${c.page}` : ''].filter(Boolean).join(', ');
}

export const TutorText: React.FC<TutorTextProps> = ({ text, streaming, simple, citations, onNavigate, onStartAssessment, className = '' }) => {
  const source = prepareTutorMarkdown(text || '', { streaming, simple });
  const byNumber = new Map((citations || []).map((c) => [Number(c.n), c]));

  const quickJump = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (href.startsWith('#navigate:')) {
      const page = href.slice('#navigate:'.length);
      if (onNavigate) onNavigate(page);
      window.dispatchEvent(new CustomEvent('enara-navigate', { detail: { page } }));
    } else if (href.startsWith('#assessment:')) {
      const id = href.slice('#assessment:'.length);
      if (onStartAssessment) onStartAssessment(id);
      window.dispatchEvent(new CustomEvent('enara-navigate', { detail: { assessmentId: id } }));
    }
  };

  const block = simple ? { margin: '0 0 0.4em' } : undefined;
  const components: Components = {
    p: ({ children }) => (simple
      ? <p dir="auto" style={block}>{children}</p>
      : <p dir="auto" className="mb-2 last:mb-0 leading-relaxed text-slate-700 font-normal">{children}</p>),
    h1: ({ children }) => <h3 dir="auto" className="text-base font-bold text-slate-900 mt-3 mb-1.5">{children}</h3>,
    h2: ({ children }) => <h4 dir="auto" className="text-sm font-bold text-slate-900 mt-2.5 mb-1">{children}</h4>,
    h3: ({ children }) => <h5 dir="auto" className="text-sm font-bold text-teal-800 mt-2 mb-1">{children}</h5>,
    h4: ({ children }) => <h6 dir="auto" className="text-sm font-bold text-slate-800 mt-1.5 mb-1">{children}</h6>,
    h5: ({ children }) => <h6 dir="auto" className="text-sm font-bold text-slate-800 mt-1.5 mb-1">{children}</h6>,
    h6: ({ children }) => <h6 dir="auto" className="text-sm font-bold text-slate-800 mt-1.5 mb-1">{children}</h6>,
    ul: ({ node, children }) => <ul dir={listDir(node)} className="list-disc ps-5 space-y-1 mb-2 text-slate-700">{children}</ul>,
    ol: ({ node, children, start }) => <ol dir={listDir(node)} start={start} className="list-decimal ps-5 space-y-1 mb-2 text-slate-700">{children}</ol>,
    li: ({ children }) => <li dir="auto" className="leading-relaxed marker:text-teal-600">{children}</li>,
    strong: ({ children }) => <strong className={simple ? undefined : 'font-bold text-slate-900'} style={simple ? { fontWeight: 700 } : undefined}>{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    blockquote: ({ children }) => <blockquote dir="auto" className="border-s-2 border-teal-500 ps-3 py-1 my-2 text-slate-700">{children}</blockquote>,
    code: ({ className: codeClassName, children }) => {
      const value = String(children ?? '');
      if (!codeClassName && !value.includes('\n')) {
        return <code dir="ltr" className="px-1 py-0.5 rounded bg-slate-100 text-teal-800 font-mono text-[0.9em] border border-slate-200" style={simple ? { fontFamily: 'monospace' } : undefined}>{children}</code>;
      }
      return <code dir="ltr" className="block whitespace-pre-wrap">{children}</code>;
    },
    pre: ({ children }) => <pre dir="ltr" className="my-2 rounded-lg bg-slate-900 text-slate-100 p-3 font-mono text-xs overflow-x-auto" style={simple ? { whiteSpace: 'pre-wrap' } : undefined}>{children}</pre>,
    a: ({ href, children }) => {
      const url = href || '';
      const cite = /^#cite-(\d{1,2})$/.exec(url);
      if (cite) {
        const n = Number(cite[1]);
        const c = byNumber.get(n);
        const title = citationTitle(n, c);
        const chip = 'tutor-cite inline-block align-super text-[0.7em] leading-none font-semibold px-1 py-0.5 mx-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 no-underline';
        const style = simple ? { fontSize: '0.7em', verticalAlign: 'super', padding: '0 0.25em' } : undefined;
        return c?.url && SAFE_LINK.test(c.url)
          ? <a href={c.url} target="_blank" rel="noopener noreferrer" title={title} aria-label={`Source: ${title}`} className={chip} style={style} data-testid="tutor-cite">{children}</a>
          : <sup title={title} aria-label={`Source: ${title}`} className={chip} style={style} data-testid="tutor-cite">{children}</sup>;
      }
      if (url.startsWith('#navigate:') || url.startsWith('#assessment:')) {
        return (
          <button type="button" onClick={quickJump(url)} className="inline-flex items-center gap-1.5 px-3 py-1 my-1 mx-1 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs">
            <Zap size={12} className="fill-current text-teal-200 shrink-0" aria-hidden="true" />
            <span>{children}</span>
            <ArrowRight size={12} className="opacity-70 shrink-0" aria-hidden="true" />
          </button>
        );
      }
      if (SAFE_LINK.test(url)) {
        return <a href={url} target="_blank" rel="noopener noreferrer" className="text-teal-700 font-semibold underline hover:text-teal-900">{children}</a>;
      }
      return <span>{children}</span>;
    },
    // Pictures from the model are not loaded (no outside requests); the words stay.
    img: ({ alt }) => (alt ? <span>{alt}</span> : null),
    hr: () => (simple ? null : <hr className="my-2 border-slate-200" />),
  };

  return (
    <div className={`tutor-text ${simple ? '' : 'text-sm leading-relaxed'} ${className}`.trim()} data-testid="tutor-text" data-streaming={streaming ? 'true' : undefined}
      // The blocks carry the line breaks; a parent's pre-line (the kids' chat bubble) would add blank lines between them.
      style={{ whiteSpace: 'normal', unicodeBidi: 'isolate' }}>
      <Markdown
        remarkPlugins={[remarkHtmlAsText, remarkLineBreaks]}
        components={components}
        // Only these leave the page; anything else (javascript:, data:) becomes plain text above.
        urlTransform={(url) => (SAFE_LINK.test(url) || url.startsWith('#') ? url : '')}
        {...(simple ? { disallowedElements: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'hr'], unwrapDisallowed: true } : {})}
      >
        {source}
      </Markdown>
    </div>
  );
};

export default TutorText;
