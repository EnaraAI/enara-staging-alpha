import type { UserRole } from '../auth/roles';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      rawBody?: Buffer;
      user?: {
        id: string;
        email: string;
        role: UserRole;
        studentId?: string;
        institutionId?: string;
      };
    }
  }
}

export {};
