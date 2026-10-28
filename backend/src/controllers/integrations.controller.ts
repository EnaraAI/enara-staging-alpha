import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { currentUser } from '../auth/authorization';
import { getConfig } from '../config/env';
import { User } from '../models/User';
import { Institution } from '../models/Institution';
import { ApiKey, API_KEY_PERMISSIONS } from '../models/ApiKey';
import {
  findApiKey,
  generateAdminPassword,
  generateApiKey,
  generateApiKeyId,
  generateInstitutionId,
  isApiKeyExpired,
} from '../services/apiKeyService';
import {
  ensurePlainObject,
  escapeRegex,
  getOptionalString,
  getRequiredId,
  getRequiredString,
  normalizeEmail,
  rejectMongoOperators,
} from '../utils/validation';

function serializeApiKey(key: InstanceType<typeof ApiKey>) {
  return {
    id: key.id,
    keyPrefix: key.keyPrefix,
    institutionId: key.institutionId,
    adminEmail: key.adminEmail,
    lmsSystemId: key.lmsSystemId,
    permissions: key.permissions,
    status: isApiKeyExpired(key) && key.status === 'active' ? 'expired' : key.status,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
  };
}

async function issueApiKey(params: {
  institutionId: string;
  adminUserId: string;
  adminEmail: string;
  lmsSystemId?: string;
  createdBy: string;
}) {
  const { key, keyHash, keyPrefix } = generateApiKey();
  const record = await ApiKey.create({
    id: generateApiKeyId(),
    keyHash,
    keyPrefix,
    institutionId: params.institutionId,
    adminUserId: params.adminUserId,
    adminEmail: params.adminEmail,
    lmsSystemId: params.lmsSystemId,
    permissions: [...API_KEY_PERMISSIONS],
    createdBy: params.createdBy,
  });
  return { key, record };
}

// POST /api/integrations/institutions
// Creates the institution, its first admin login and an API key. The password and key are
// returned once and never stored in plain text.
export const createInstitution = asyncHandler(async (req: AuthRequest, res: Response) => {
  const actor = currentUser(req);
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);

  const name = getRequiredString(body, 'institutionName', { max: 160 });
  const lmsSystem = getOptionalString(body, 'lmsSystem', { max: 120 });
  const adminName = getRequiredString(body, 'adminName', { max: 120 });
  const adminEmail = normalizeEmail(body.adminEmail);
  const adminPhone = getOptionalString(body, 'adminPhone', { max: 40 });

  if (await User.exists({ email: adminEmail })) {
    throw new AppError('An account with this admin email already exists', 409, 'CONFLICT');
  }

  const institutionId = generateInstitutionId();
  const password = generateAdminPassword();
  const institution = await Institution.create({
    id: institutionId,
    name,
    lmsSystem,
    contactName: adminName,
    contactEmail: adminEmail,
    contactPhone: adminPhone,
    createdBy: actor.id,
  });

  let admin;
  try {
    admin = await User.create({
      email: adminEmail,
      password: await bcrypt.hash(password, getConfig().bcryptRounds),
      role: 'admin',
      name: adminName,
      institutionId,
    });
  } catch (err) {
    await Institution.deleteOne({ _id: institution._id });
    throw err;
  }

  const { key, record } = await issueApiKey({
    institutionId,
    adminUserId: admin._id.toString(),
    adminEmail,
    lmsSystemId: lmsSystem,
    createdBy: actor.id,
  });

  res.status(201).json({
    success: true,
    message: 'Institution created with an admin login and an API key.',
    institutionId,
    institution: { id: institution.id, name: institution.name, lmsSystem: institution.lmsSystem, status: institution.status },
    credentials: { username: adminEmail, password },
    apiKey: key,
    apiKeyInfo: serializeApiKey(record),
  });
});

// GET /api/integrations/institutions
export const listInstitutions = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const [institutions, keyCounts] = await Promise.all([
    Institution.find().sort({ createdAt: -1 }).limit(200).lean(),
    ApiKey.aggregate<{ _id: string; active: number }>([
      { $match: { status: 'active' } },
      { $group: { _id: '$institutionId', active: { $sum: 1 } } },
    ]),
  ]);
  const activeByInstitution = new Map(keyCounts.map(k => [k._id, k.active]));
  res.json({
    data: institutions.map(inst => ({
      id: inst.id,
      name: inst.name,
      lmsSystem: inst.lmsSystem,
      contactName: inst.contactName,
      contactEmail: inst.contactEmail,
      status: inst.status,
      activeApiKeys: activeByInstitution.get(inst.id) || 0,
      createdAt: (inst as { createdAt?: Date }).createdAt,
    })),
  });
});

// POST /api/integrations/institutions/:id/api-keys
// Issues another key for an existing institution, owned by one of its admins.
export const createInstitutionApiKey = asyncHandler(async (req: AuthRequest, res: Response) => {
  const actor = currentUser(req);
  const institutionId = getRequiredId(req.params, 'id');
  const body = ensurePlainObject(req.body ?? {});
  rejectMongoOperators(body);

  const institution = await Institution.findOne({ id: institutionId });
  if (!institution) throw new AppError('Institution not found', 404, 'NOT_FOUND');

  const adminEmail = body.adminEmail === undefined ? institution.contactEmail : normalizeEmail(body.adminEmail);
  const admin = adminEmail
    ? await User.findOne({ email: adminEmail, institutionId, role: 'admin', status: 'active' })
    : null;
  if (!admin) {
    throw new AppError('No active admin with that email in this institution', 400, 'VALIDATION_ERROR');
  }

  const { key, record } = await issueApiKey({
    institutionId,
    adminUserId: admin._id.toString(),
    adminEmail: admin.email,
    lmsSystemId: institution.lmsSystem,
    createdBy: actor.id,
  });
  res.status(201).json({ apiKey: key, apiKeyInfo: serializeApiKey(record) });
});

// GET /api/integrations/api-keys?institutionId=
export const listApiKeys = asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  const keys = await ApiKey.find(institutionId ? { institutionId } : {}).sort({ createdAt: -1 }).limit(200);
  res.json({ data: keys.map(serializeApiKey) });
});

// POST /api/integrations/api-keys/:id/revoke
export const revokeApiKey = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = getRequiredId(req.params, 'id');
  const key = await ApiKey.findOneAndUpdate({ id }, { $set: { status: 'revoked' } }, { new: true });
  if (!key) throw new AppError('API key not found', 404, 'NOT_FOUND');
  res.json({ data: serializeApiKey(key) });
});

// POST /api/integrations/api-keys/validate
// Checks a key and whether it belongs to the given admin, institution and LMS.
export const validateApiKey = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const rawKey = getRequiredString(body, 'apiKey', { max: 200 });
  const adminIdentifier = getRequiredString(body, 'adminIdentifier', { max: 254 });
  const institutionIdentifier = getRequiredString(body, 'institutionIdentifier', { max: 160 });
  const lmsSystemId = getOptionalString(body, 'lmsSystemId', { max: 120 });

  const key = await findApiKey(rawKey);
  if (!key) {
    res.json({
      isValid: false,
      message: 'Invalid API key. Key not found in our records.',
      details: {
        apiKeyStatus: 'not_found',
        adminMatch: false,
        institutionMatch: false,
        lmsMatch: false,
        hasPermissions: false,
        permissions: [],
      },
    });
    return;
  }

  const institution = await Institution.findOne({ id: key.institutionId });
  const adminMatch =
    adminIdentifier.toLowerCase() === key.adminEmail || adminIdentifier === key.adminUserId;
  const institutionMatch =
    institutionIdentifier === key.institutionId ||
    (!!institution && new RegExp(`^${escapeRegex(institutionIdentifier)}$`, 'i').test(institution.name));
  const lmsMatch = !lmsSystemId || lmsSystemId.toLowerCase() === (key.lmsSystemId || '').toLowerCase();
  const isExpired = isApiKeyExpired(key);
  const isRevoked = key.status === 'revoked';
  const isValid = !isExpired && !isRevoked && adminMatch && institutionMatch && lmsMatch;

  let message = 'API key validated successfully.';
  if (isRevoked) message = 'API key has been revoked.';
  else if (isExpired) message = 'API key has expired.';
  else if (!adminMatch) message = 'API key is not issued for this administrator.';
  else if (!institutionMatch) message = 'API key is not issued for this institution.';
  else if (!lmsMatch) message = 'API key is not issued for this LMS system.';

  res.json({
    isValid,
    message,
    details: {
      apiKeyStatus: isRevoked ? 'revoked' : isExpired ? 'expired' : 'active',
      adminMatch,
      institutionMatch,
      lmsMatch,
      hasPermissions: key.permissions.length > 0,
      permissions: key.permissions,
    },
  });
});
