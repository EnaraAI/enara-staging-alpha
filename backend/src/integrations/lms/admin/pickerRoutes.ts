import { Router, type NextFunction, type Request, type Response } from 'express';
import { asyncHandler } from '../../../middleware/errorHandler';
import { buildDeepLinkResponse, findPickerSession } from '../adapters/lti13/deepLinking';
import { LtiError } from '../adapters/lti13/errors';
import { lmsFlags } from '../core/flags';
import { checkPickerDue, DUE_PARAM, formatDueLine } from '../core/dueDate';
import { alreadyAddedKeys, itemKey, pickerType, pickerTypes, type PickerItem } from '../core/picker';
import '../core/pickerTypes';
import '../core/pickerPages';
import { LmsPlatform } from '../models';
import { DEFAULT_SCHOOL_TIME_ZONE } from '../../../services/institutionTimeZone';

// Phase 2 activity picker API (the picker page inside the LMS). No ENARA
// sign-in: the caller holds the picker session secret (header X-Lms-Picker),
// which came from a validated LtiDeepLinkingRequest of a teacher or admin,
// lives 10 minutes and is used once. Everything is scoped to that session's
// school and LMS course. 404 unless LMS_DEEP_LINKING_ENABLED (and LTI) is on.
//
//   GET  /api/lms/picker/session   locale, course title, item types, multi-select, school time zone
//   GET  /api/lms/picker/items     the school's items, with "already added in this course"
//   POST /api/lms/picker/submit    { items: [{ type, id, due? }] } -> { returnUrl, jwt }
//
// Phase 2b (D13): `due` is an optional local date-time ("YYYY-MM-DDTHH:mm") in
// the school's time zone, for item types with dueDate (assessments and
// assignments). It is checked (future, at most 2 years ahead), sent to the LMS
// as enara_due=<ISO UTC> and added as a "Due: ..." line to the description.

const LIST_LIMIT = 200;
export const pickerRouter = Router();

pickerRouter.use((_req: Request, res: Response, next: NextFunction) => {
  if (!lmsFlags().deepLinking) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
});

async function session(req: Request, res: Response) {
  const found = await findPickerSession(req.headers['x-lms-picker']);
  if ('error' in found) {
    res.status(found.error === 'picker_session_invalid' ? 401 : 410).json({ error: found.error });
    return null;
  }
  return found.session;
}

/** The item as the teacher's language shows it (title and description sent to the LMS). */
const localized = (i: PickerItem, locale: 'en' | 'ar'): PickerItem => (locale === 'ar' && i.ar ? { ...i, title: i.ar.title, description: i.ar.description ?? i.description } : i);

const publicItem = (i: PickerItem, added: Set<string>) => {
  const { custom, ...rest } = i;
  void custom;
  return { ...rest, alreadyAdded: added.has(itemKey(i.type, i.id)) };
};

pickerRouter.get(
  '/session',
  asyncHandler(async (req: Request, res: Response) => {
    const s = await session(req, res);
    if (!s) return;
    res.json({
      locale: s.locale,
      courseTitle: s.contextTitle ?? null,
      acceptMultiple: s.acceptMultiple,
      expiresAt: s.expiresAt,
      timeZone: s.timeZone ?? DEFAULT_SCHOOL_TIME_ZONE,
      types: pickerTypes().map((t) => ({ type: t.type, label: t.label, dueDate: t.dueDate === true })),
    });
  }),
);

pickerRouter.get(
  '/items',
  asyncHandler(async (req: Request, res: Response) => {
    const s = await session(req, res);
    if (!s) return;
    const added = await alreadyAddedKeys(s.platformId, s.institutionId, s.externalContextId);
    const lists = await Promise.all(pickerTypes().map((t) => t.list(s.institutionId, LIST_LIMIT)));
    res.json({ items: lists.flat().map((i) => publicItem(i, added)) });
  }),
);

pickerRouter.post(
  '/submit',
  asyncHandler(async (req: Request, res: Response) => {
    const s = await session(req, res);
    if (!s) return;
    const raw = (req.body as { items?: unknown })?.items;
    if (!Array.isArray(raw) || raw.length > 20) {
      res.status(400).json({ error: 'items must be a list of at most 20' });
      return;
    }
    const seen = new Set<string>();
    const items: PickerItem[] = [];
    for (const r of raw) {
      const type = typeof r?.type === 'string' ? r.type : '';
      const id = typeof r?.id === 'string' ? r.id : '';
      const t = pickerType(type);
      if (!t || !id) {
        res.status(400).json({ error: 'unknown item type' });
        return;
      }
      if (seen.has(itemKey(type, id))) continue;
      seen.add(itemKey(type, id));
      const resolved = await t.resolve(s.institutionId, id); // re-checked: this school, still usable
      if (!resolved) {
        res.status(409).json({ error: 'item_not_available', type, id });
        return;
      }
      let item = localized(resolved, s.locale);
      const due = r?.due;
      if (due !== undefined && due !== null && due !== '') {
        if (!t.dueDate) {
          res.status(400).json({ error: 'due_not_supported', type, id });
          return;
        }
        const tz = s.timeZone ?? DEFAULT_SCHOOL_TIME_ZONE;
        const checked = checkPickerDue(due, tz);
        if (!checked.ok) {
          res.status(400).json({ error: checked.error, type, id });
          return;
        }
        const line = formatDueLine(checked.due, tz, s.locale);
        item = {
          ...item,
          custom: { ...item.custom, [DUE_PARAM]: checked.due.toISOString() },
          description: item.description ? `${item.description}\n\n${line}` : line,
        };
      }
      items.push(item);
    }
    if (!s.acceptMultiple && items.length > 1) {
      res.status(400).json({ error: 'This LMS accepts one item at a time.' });
      return;
    }
    const platform = await LmsPlatform.findOne({ id: s.platformId, institutionId: s.institutionId, status: 'active' }).lean();
    if (!platform) {
      res.status(409).json({ error: 'platform_not_active' });
      return;
    }
    try {
      res.json(await buildDeepLinkResponse(String(req.headers['x-lms-picker']), items, platform));
    } catch (error) {
      if (error instanceof LtiError) {
        res.status(error.status).json({ error: error.code });
        return;
      }
      throw error;
    }
  }),
);
