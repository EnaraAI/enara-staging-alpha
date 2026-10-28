import Anthropic from '@anthropic-ai/sdk';
import { meteredMessage } from './aiGateway';
import { textTokenBound } from './priceCatalog';
import { getConfig } from '../config/env';
import { logger } from '../utils/logging';

// Visual aid for the live avatar's side panel (ported from the avatar adapter):
// after an answer, Claude decides whether a table, diagram or step list would
// help and, if so, returns self-contained HTML/SVG.

const MAX_HTML_CHARS = 60_000;

// Generated drawings tended to put labels on top of each other or on lines.
// Text goes in normal HTML flow (which can't overlap); SVG only carries shapes
// with a few short, well-spaced labels.
const LAYOUT_RULES = `Layout rules (follow all of them):
- It is shown in a panel about 720px wide and 600px tall; vertical scrolling is fine, horizontal is not. Use max-width:100% on everything and box-sizing:border-box.
- Put titles, explanations, steps, equations and tables in HTML elements (h2, p, ol, table, div with flex or grid and gap), never in SVG.
- Use SVG only for the picture itself (scale, number line, shapes, graph axes, bar model). Give it a viewBox, width="100%" and no fixed height.
- Inside SVG, use at most 8 text labels, each at most 4 words, font-size 14 to 18. Keep every label at least 14px away from other labels and from lines, and never draw text across a line or another shape.
- Label inside a shape only if the shape is wider than 10px per character of the label plus 24px padding; centre it with text-anchor="middle" and dominant-baseline="middle". Otherwise put the label just above or below the shape.
- Leave at least 24px of empty margin inside the viewBox on every side so nothing is clipped.
- Keep it compact: one picture plus a few short steps, under about 120 lines, and plain CSS without repetition.
- Equations and numbers are left-to-right even in Arabic: wrap them in <span dir="ltr"> in HTML and <tspan direction="ltr" unicode-bidi="embed"> in SVG.`;

let client: Anthropic | undefined;

export function sanitizeVisualHtml(value: string): string {
  // The page renders this in a fully sandboxed iframe; this is a second layer.
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<(iframe|object|embed|form|meta|link|base)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|form|meta|link|base|script)\b[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*(['"])[\s\S]*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src|xlink:href)\s*=\s*(['"])\s*(javascript|data):[\s\S]*?\2/gi, '$1=$2$2')
    .replace(/url\(\s*(['"]?)\s*(https?:|\/\/)[^)]*\)/gi, 'none')
    .slice(0, MAX_HTML_CHARS);
}

// The student explicitly asking to see something: a drawing, diagram, picture,
// table or chart, in English or (Egyptian) Arabic.
const VISUAL_REQUEST =
  /\b(draw|diagram|picture|image|visual|visuali[sz]e|chart|graph|table|sketch|illustrat\w*|artifact|show me|on (the )?screen|mind ?map)\b|ارسم|ارسملي|رسمة|رسم|صورة|صوره|شكل|جدول|مخطط|وريني|ورّيني|اعرض|وضح بالرسم|خريطة ذهنية/i;

export function isVisualRequest(text: string): boolean {
  return VISUAL_REQUEST.test(text);
}

// In Arabic (right-to-left) text the browser reorders a bare equation like
// "2x - 3 + 3 = 7 + 3" into nonsense. Equation-like runs in HTML text are
// isolated as left-to-right; SVG labels pick their direction from their content.
const EQUATION_RUN = /[0-9A-Za-z][0-9A-Za-z.,²³√()\s]*(?:\s*[-+−×÷=*/<>≤≥^]\s*[0-9A-Za-z.,²³√()]+)+/g;

export function isolateEquations(html: string): string {
  if (!/[\u0600-\u06FF]/.test(html)) return html;
  let inSvg = 0;
  const out = html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<svg\b/i.test(part)) inSvg += 1;
        else if (/^<\/svg>/i.test(part)) inSvg = Math.max(0, inSvg - 1);
        return part;
      }
      if (inSvg) return part;
      return part.replace(EQUATION_RUN, (run) => {
        const trimmed = run.trim();
        const lead = run.slice(0, run.indexOf(trimmed));
        const trail = run.slice(run.indexOf(trimmed) + trimmed.length);
        return `${lead}<bdi dir="ltr">${trimmed}</bdi>${trail}`;
      });
    })
    .join('');
  return '<style>bdi{unicode-bidi:isolate}svg text{unicode-bidi:plaintext}</style>' + out;
}

export async function generateVisualAid(params: {
  question: string;
  answer?: string;
  // What the call is about, for a visual requested before the answer exists.
  context?: string;
  // The student asked for it: always draw something.
  requested?: boolean;
}): Promise<string | null> {
  const { question, answer, context, requested } = params;
  const config = getConfig();
  if (!config.anthropicApiKey) return null;
  client ??= new Anthropic({ apiKey: config.anthropicApiKey, timeout: 40_000, maxRetries: 0 });

  try {
    // Bound: the variable parts plus 4,000 tokens for the fixed instructions.
    const bound = { inputTokens: textTokenBound(question, answer, context, LAYOUT_RULES) + 4000, outputTokens: 12_000 };
    const response = await meteredMessage({ feature: 'avatar_visual', modelName: config.anthropicVisualModel, bound }, () => client!.messages.create({
      model: config.anthropicVisualModel,
      max_tokens: 12_000,
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content:
            'You make visual aids for an AI tutor talking with a school student.\n\n' +
            (context ? `<lesson_context>${context}</lesson_context>\n` : '') +
            `<student_message>${question}</student_message>\n` +
            (answer ? `<tutor_answer>${answer}</tutor_answer>\n` : '') +
            '\n' +
            (requested
              ? 'The student asked to see this visually. Make the clearest visual explanation of the concept they ' +
                'are asking about (use the lesson context if they say "this" or "it"): a labelled diagram, worked ' +
                'steps, a table, a number line, a graph or a simple illustration drawn in inline SVG.\n'
              : 'Decide whether a visual aid genuinely helps here. Good cases: worked steps, formulas, tables, ' +
                'comparisons, timelines, vocabulary lists, diagrams. Small talk and simple yes/no answers do not need one.\n') +
            'Reply with ONLY clean, self-contained HTML/CSS/inline SVG: no JavaScript, forms, iframes, ' +
            'external images, fonts or links, and no Markdown fences. White background, blue #0056D2 accents, ' +
            'system-ui font. Write it in the language of the student message (dir="rtl" on the root for Arabic).\n' +
            LAYOUT_RULES +
            (requested ? '' : '\nIf it does not help, reply with exactly NO_VISUAL'),
        },
      ],
    }));
    if (response.stop_reason === 'refusal') return null;
    // A cut-off page shows half a drawing; better none.
    if (response.stop_reason === 'max_tokens') {
      logger.warn('avatar_visual_truncated', { outputTokens: response.usage.output_tokens });
      return null;
    }
    let html = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
    if (!html || (!requested && html.includes('NO_VISUAL'))) return null;
    html = html.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    html = isolateEquations(sanitizeVisualHtml(html));
    return html.includes('<') ? html : null;
  } catch (error) {
    logger.warn('avatar_visual_failed', { message: (error as Error).message });
    return null;
  }
}
