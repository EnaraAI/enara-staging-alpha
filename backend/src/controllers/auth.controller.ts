import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { User, UserRole } from '../models/User';
import { Student } from '../models/Student';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { generateStudentId, initialsFromName } from '../utils/idGenerator';
import { getConfig } from '../config/env';
import { signAccessToken } from '../auth/jwt';
import {
  PUBLIC_REGISTRATION_ROLE,
  isPrivilegedRole,
  isUserRole,
  UserRole as Role,
} from '../auth/roles';
import { AuthRequest } from '../middleware/auth.middleware';
import { currentUser, resolveWriteInstitutionId } from '../auth/authorization';
import {
  ensurePlainObject,
  getOptionalId,
  getOptionalString,
  normalizeEmail,
  rejectMongoOperators,
  validatePassword,
} from '../utils/validation';
import { DEMO_INSTITUTION_ID, DEMO_USER_EMAILS, isDemoRole } from '../config/demo';
import { confirmPasswordReset, requestPasswordReset } from '../services/accountTokens';

function signToken(user: {
  _id: { toString(): string };
  email: string;
  role: UserRole;
  studentId?: string;
  institutionId?: string;
}) {
  return signAccessToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    studentId: user.studentId,
    institutionId: user.institutionId,
  });
}

async function ensureStudentLink(user: InstanceType<typeof User>) {
  if (user.role !== 'student') return user;

  if (user.studentId) {
    const existing = await Student.findOne({ id: user.studentId });
    if (existing) return user;
  }

  let student = await Student.findOne({ email: user.email.toLowerCase() });
  if (!student) {
    student = await Student.create({
      id: generateStudentId(),
      name: user.name || user.email.split('@')[0],
      email: user.email.toLowerCase(),
      grade: 'Grade 10',
      avatar: initialsFromName(user.name || user.email),
      institutionId: user.institutionId,
    });
  } else if (user.institutionId && !student.institutionId) {
    student.institutionId = user.institutionId;
    await student.save();
  }

  user.studentId = student.id;
  await user.save();
  return user;
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : undefined;

  if (!email || !password) {
    throw new AppError('Email and password are required');
  }

  let user = await User.findOne({ email }).select('+password');

  if (!user || user.status !== 'active') {
    throw new AppError('Invalid credentials', 401);
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new AppError('Invalid credentials', 401);
  }

  user = await ensureStudentLink(user);
  const token = signToken(user);

  res.json({
    token,
    user: {
      email: user.email,
      role: user.role,
      name: user.name,
      studentId: user.studentId,
      institutionId: user.institutionId,
    },
  });
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  // Invite-only (P1): accounts are created from invitations, not self-registration.
  if (getConfig().registrationInviteOnly) {
    throw new AppError('Registration is by invitation only', 403, 'INVITE_ONLY');
  }
  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  const requestedRole = body.role;
  const name = getOptionalString(body, 'name', { max: 120 }) || email.split('@')[0];

  if (requestedRole !== undefined) {
    if (!isUserRole(requestedRole)) {
      throw new AppError('Invalid role', 400, 'INVALID_ROLE');
    }
    if (requestedRole !== PUBLIC_REGISTRATION_ROLE) {
      throw new AppError(
        'Public registration is limited to student accounts',
        403,
        'PUBLIC_ROLE_NOT_ALLOWED'
      );
    }
  }

  if (getOptionalId(body, 'institutionId') || getOptionalId(body, 'schoolId')) {
    throw new AppError(
      'Public registration cannot assign institution scope',
      403,
      'PUBLIC_INSTITUTION_SCOPE_NOT_ALLOWED'
    );
  }

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('User already exists', 409);
  }

  const hashed = await bcrypt.hash(password, getConfig().bcryptRounds);
  let user = await User.create({
    email,
    password: hashed,
    role: PUBLIC_REGISTRATION_ROLE,
    name,
  });

  user = await ensureStudentLink(user);
  const token = signToken(user);

  res.status(201).json({
    token,
    user: {
      email: user.email,
      role: user.role,
      name: user.name,
      studentId: user.studentId,
      institutionId: user.institutionId,
    },
  });
});

// One-click, no-password login used only by the public demo (enara.app "Try
// Demo" -> enara-platform /demo). Gated behind DEMO_MODE_ENABLED so it can
// never be reachable in a real production deploy without an explicit,
// separate opt-in (see config/env.ts). Deliberately does NOT accept email or
// password, and never creates a user on the fly -- it can only issue a token
// for one of a fixed set of pre-seeded demo accounts (see scripts/seedDemo.ts
// and config/demo.ts). This mirrors the lesson from a prior incident where
// login used to auto-create an admin account for any unrecognized credentials.
export const demoLogin = asyncHandler(async (req: Request, res: Response) => {
  if (!getConfig().demoModeEnabled) {
    throw new AppError('Demo login is not enabled', 404, 'NOT_FOUND');
  }

  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const role = body.role;

  if (!isDemoRole(role)) {
    throw new AppError(
      'role must be one of: student, teacher, admin',
      400,
      'INVALID_ROLE'
    );
  }

  const email = DEMO_USER_EMAILS[role];
  const user = await User.findOne({
    email,
    institutionId: DEMO_INSTITUTION_ID,
  }).select('+password');

  if (!user || user.status !== 'active') {
    throw new AppError(
      'Demo account is not provisioned. Run scripts/seedDemo.ts.',
      503,
      'DEMO_NOT_SEEDED'
    );
  }

  const token = signToken(user);

  res.json({
    token,
    user: {
      email: user.email,
      role: user.role,
      name: user.name,
      studentId: user.studentId,
      institutionId: user.institutionId,
    },
  });
});

export const createUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const actor = currentUser(req);
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);

  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  const name = getOptionalString(body, 'name', { max: 120 }) || email.split('@')[0];
  const requestedRole = body.role;
  if (!isUserRole(requestedRole)) {
    throw new AppError('Invalid role', 400, 'INVALID_ROLE');
  }

  if (actor.role !== 'enara-admin' && isPrivilegedRole(requestedRole as Role)) {
    throw new AppError('Only Enara admins can create privileged accounts', 403, 'FORBIDDEN');
  }

  const requestedInstitutionId = getOptionalId(body, 'institutionId') || getOptionalId(body, 'schoolId');
  const institutionId =
    requestedRole === 'enara-admin'
      ? requestedInstitutionId
      : resolveWriteInstitutionId(req, requestedInstitutionId);

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('User already exists', 409, 'CONFLICT');
  }

  const hashed = await bcrypt.hash(password, getConfig().bcryptRounds);
  let user = await User.create({
    email,
    password: hashed,
    role: requestedRole,
    name,
    institutionId,
  });

  if (requestedRole === 'student') {
    user = await ensureStudentLink(user);
  }

  res.status(201).json({
    user: {
      email: user.email,
      role: user.role,
      name: user.name,
      studentId: user.studentId,
      institutionId: user.institutionId,
      status: user.status,
    },
  });
});

// POST /api/auth/password-reset/request { email } (P1). Always 202, so the
// answer does not reveal whether an account exists.
export const requestPasswordResetHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  let email: string | undefined;
  try {
    email = normalizeEmail(body.email);
  } catch {
    email = undefined;
  }
  if (email) await requestPasswordReset(email);
  res.status(202).json({ ok: true });
});

// POST /api/auth/password-reset/confirm { token, password } (P1): single use.
export const confirmPasswordResetHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const token = typeof body.token === 'string' && body.token.length <= 200 ? body.token : '';
  if (!token) throw new AppError('This reset link is invalid, used or expired', 400, 'RESET_TOKEN_INVALID');
  await confirmPasswordReset(token, validatePassword(body.password));
  res.json({ ok: true });
});
