import type { FC } from 'react';
export interface LiveAvatarModalProps {
  isOpen: boolean; onClose: () => void; lessonTitle?: string; subject?: string; initialAvatarId?: string; isStudent?: boolean;
  courseId?: string; lessonId?: string; newTabPage?: string;
}
export declare const LiveAvatarModal: FC<LiveAvatarModalProps>;
export declare const ToastContainer: FC;
