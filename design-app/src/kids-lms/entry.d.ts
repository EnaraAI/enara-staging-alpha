import type { FC, ReactNode } from 'react';
export interface KidsAppProps {
  userName: string; tourPending?: boolean; sharedAssessmentId?: string | null; sharedCourseId?: string | null;
  lmsAssignmentId?: string | null; lmsPage?: string | null; lmsStudent?: boolean; onSignOut: () => void;
}
export declare const KidsApp: FC<KidsAppProps>;
export declare const ToastContainer: FC;
export declare const ErrorBoundary: FC<{ children?: ReactNode }>;
export declare function getSessionUser(): { email: string; name?: string; role: string; tourPending?: boolean; lmsAccount?: boolean } | null;
export declare function isLmsSession(): boolean;
export declare const SESSION_EXPIRED_EVENT: string;
