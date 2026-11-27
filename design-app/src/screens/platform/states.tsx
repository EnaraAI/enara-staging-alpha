// Loading, empty, error and "not available yet" states for the platform admin screens.
import type { ReactNode } from 'react';
import { CircleSlash, RefreshCw, TriangleAlert } from 'lucide-react';
import { usePreview } from '@/lib/preview';
import { errorText } from '@/lib/api';
import { Alert, Button, Card, Skeleton } from '@/components/ui';

const T = {
  en: { retry: 'Retry', failed: 'This could not be loaded.', na: 'Not available yet', loading: 'Loading…' },
  ar: { retry: 'إعادة المحاولة', failed: 'تعذّر تحميل هذا المحتوى.', na: 'غير متاح بعد', loading: 'جارٍ التحميل…' },
};

export function LoadingBlock({ rows = 3, className }: { rows?: number; className?: string }) {
  const { lang } = usePreview();
  return (
    <div role="status" aria-label={T[lang].loading} className={className ?? 'flex flex-col gap-3'}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );
}

export function ErrorBlock({ error, onRetry, title }: { error: unknown; onRetry: () => void; title?: string }) {
  const { lang } = usePreview();
  const t = T[lang];
  return (
    <Alert tone="danger" icon={<TriangleAlert />} title={title ?? t.failed}>
      <div className="flex flex-wrap items-center gap-3">
        <span>{errorText(error, lang)}</span>
        <Button size="sm" variant="outline" onPress={onRetry}><RefreshCw />{t.retry}</Button>
      </div>
    </Alert>
  );
}

export function EmptyBlock({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">{icon ?? <CircleSlash />}</span>
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </Card>
  );
}

/** A planned item with no data source on lms-test yet (planned: a read-only platform status endpoint). */
export function NotAvailable({ children }: { children?: ReactNode }) {
  const { lang } = usePreview();
  return (
    <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
      <CircleSlash className="mt-0.5 size-3.5 shrink-0" />
      <span><span className="font-semibold text-foreground">{T[lang].na}</span>{children ? <> · {children}</> : null}</span>
    </div>
  );
}
