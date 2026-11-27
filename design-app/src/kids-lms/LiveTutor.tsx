// The copied lms-test LiveAvatarModal (src/lms) as the student Live tutor screen opens it: the same props CoursePage passes on
// lms-test (frontend/pages/CoursePage.tsx). Loaded in its own chunk on Start. Inside .lms-scope so its Tailwind classes get
// lms-test's styles (src/kids-lms/kids-lms.css) without changing the design screen around it.
import { useEffect } from 'react';
import './kids-lms.css';
import { LiveAvatarModal, ToastContainer } from './entry-avatar';
import { loadLmsFonts } from './fonts';

export interface LiveTutorProps { isOpen: boolean; onClose: () => void; lessonTitle: string; subject: string; courseId?: string; lessonId?: string }

export default function LiveTutor({ isOpen, onClose, lessonTitle, subject, courseId, lessonId }: LiveTutorProps) {
  useEffect(loadLmsFonts, []);
  return (
    <div className="lms-scope" style={{ display: 'contents' }}>
      <ToastContainer />
      <LiveAvatarModal isOpen={isOpen} onClose={onClose} lessonTitle={lessonTitle} subject={subject} courseId={courseId} lessonId={lessonId} isStudent={true} />
    </div>
  );
}
