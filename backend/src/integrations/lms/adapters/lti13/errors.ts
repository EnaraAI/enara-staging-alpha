// Every way an LTI login or launch can be refused. The code goes to the audit
// log and is shown on the error page as a reference; the text never contains
// personal data or anything from the token.
export const LTI_ERRORS = {
  lti_disabled: [404, 'This page is not available.'],
  missing_parameters: [400, 'The LMS sent an incomplete sign-in request.'],
  invalid_target_link_uri: [400, 'The LMS asked to open an address that is not part of ENARA.'],
  unknown_platform: [400, 'This LMS is not connected to ENARA. Ask your school administrator to connect it.'],
  ambiguous_platform: [400, 'This LMS is connected more than once. Ask your school administrator to check the connection.'],
  platform_pending: [403, 'This LMS connection is waiting for approval by ENARA. Please try again later.'],
  platform_disabled: [403, 'This LMS connection has been switched off. Ask your school administrator.'],
  platform_misconfigured: [500, 'This LMS connection is incomplete. Ask your school administrator to check it.'],
  state_missing: [400, 'The sign-in request is incomplete. Please open the activity again from your LMS.'],
  state_invalid: [400, 'This sign-in link has already been used or has expired. Please open the activity again from your LMS.'],
  state_cookie_mismatch: [400, 'This sign-in did not start in this browser. Please open the activity again from your LMS.'],
  storage_mismatch: [400, 'This sign-in did not start in this browser. Please open the activity again from your LMS.'],
  id_token_missing: [400, 'The LMS did not send a sign-in token.'],
  invalid_token: [401, 'The sign-in token from your LMS could not be read.'],
  invalid_signature: [401, 'The sign-in token from your LMS could not be verified.'],
  unknown_kid: [401, 'The sign-in token was signed with a key ENARA does not know.'],
  jwks_unavailable: [503, 'ENARA could not reach your LMS to check the sign-in. Please try again in a minute.'],
  invalid_alg: [401, 'The sign-in token uses a method ENARA does not accept.'],
  invalid_iss: [401, 'The sign-in token came from a different LMS.'],
  invalid_aud: [401, 'The sign-in token was meant for a different tool.'],
  invalid_azp: [401, 'The sign-in token was meant for a different tool.'],
  token_expired: [401, 'The sign-in token has expired. Please open the activity again from your LMS.'],
  missing_iat: [401, 'The sign-in token is missing its time of issue.'],
  iat_in_future: [401, "The sign-in token's time is in the future. The LMS server clock may be wrong."],
  nonce_invalid: [401, 'This sign-in token has already been used. Please open the activity again from your LMS.'],
  invalid_version: [400, 'The LMS uses an LTI version ENARA does not support.'],
  unsupported_message_type: [400, 'ENARA cannot handle this kind of LMS request yet.'],
  missing_deployment: [400, 'The LMS did not say which installation of ENARA this is.'],
  unknown_deployment: [403, 'This installation of ENARA in your LMS is not registered. Ask your school administrator.'],
  deployment_pending: [403, 'This installation of ENARA in your LMS is waiting for approval.'],
  anonymous_launch: [400, 'Your LMS did not say who you are. ENARA needs an LMS account to sign you in.'],
  missing_roles: [400, 'Your LMS did not send your role in this course.'],
  missing_context: [400, 'ENARA must be opened from inside a course in your LMS.'],
  missing_resource_link: [400, 'The LMS did not say which activity to open.'],
  deep_link_not_allowed: [403, 'Only teachers and administrators can add ENARA activities.'],
  deep_link_invalid: [400, 'Your LMS sent an activity-picker request ENARA cannot use. Ask your school administrator to check the ENARA tool settings.'],
  picker_session_used: [410, 'This activity picker has already been used or has expired. Click "Select content" again in your LMS.'],
  observer_not_supported: [403, 'Parent and mentor access from the LMS is not available yet.'],
  institution_suspended: [403, "Your school's ENARA access is suspended. Contact your school administrator."],
  role_conflict: [409, 'Your ENARA account has a different role from the one your LMS sent. Ask your school administrator.'],
  student_as_instructor: [409, 'Your ENARA account is a student account, so ENARA cannot open this activity for you as a teacher. If you teach this course, ask your school administrator to set up a teacher account for you.'],
  test_user_not_supported: [403, 'This is a test student from your LMS. ENARA does not create accounts for test students. To preview the student view, open the activity as yourself and use your LMS\'s "switch role to student".'],
  account_disabled: [403, 'Your ENARA account is switched off. Ask your school administrator.'],
  account_conflict: [409, 'Your ENARA account could not be matched. Ask your school administrator.'],
  seat_limit_reached: [403, 'Your school has used all of its ENARA seats. Ask your school administrator.'],
  identity_suppressed: [403, "This account was permanently deleted at your school's request. ENARA cannot recreate it. Ask your school administrator."],
  invalid_activity_binding: [400, "This activity points to ENARA work that isn't available (unknown, not published, or from another school). Ask your teacher to check the activity's ENARA setting."],
  // Phase 1b: the one-URL "Connect Moodle" link (LTI Dynamic Registration).
  registration_code_invalid: [404, 'This ENARA connection link is not valid (it may have been cancelled). Ask ENARA or your school administrator for a new link.'],
  registration_code_used: [410, 'This ENARA connection link has already been used. Each link works once. Ask for a new link if you need to connect again.'],
  registration_code_expired: [410, 'This ENARA connection link has expired (links work for 7 days). Ask ENARA or your school administrator for a new link.'],
  registration_in_progress: [409, 'This ENARA connection link is being used right now. Wait a minute, then try again from your LMS.'],
  registration_missing_parameters: [400, 'Your LMS did not send its registration details. In Moodle, paste this link in Site administration › Plugins › Activity modules › External tool › Manage tools › "Tool URL" and click "Add LTI Advantage".'],
  registration_insecure_url: [400, "Your LMS's address must start with https://. ENARA only connects to an LMS over a secure connection."],
  registration_openid_invalid: [502, 'ENARA could not read the settings of your LMS. Please try again in a minute; if it keeps happening, send this reference to ENARA support.'],
  registration_issuer_mismatch: [400, 'Your LMS sent settings that do not match its own address, so ENARA did not connect. Send this reference to ENARA support.'],
  registration_update_not_supported: [400, 'Moodle asked to update an existing tool. Paste the link again and choose "Register as a new external tool" instead of "Update".'],
  registration_failed: [502, 'Your LMS did not accept the registration. Nothing was changed in ENARA, and the link still works: try again from your LMS. If it keeps happening, send this reference to ENARA support.'],
  registration_conflict: [409, 'This LMS tool is already connected to ENARA for another school. Paste the link again and choose "Register as a new external tool".'],
  internal_error: [500, 'Something went wrong on our side while opening ENARA. Please try again in a minute; if it keeps happening, send this reference to ENARA support.'],
} as const satisfies Record<string, readonly [number, string]>;

export type LtiErrorCode = keyof typeof LTI_ERRORS;

export class LtiError extends Error {
  readonly status: number;
  constructor(
    public readonly code: LtiErrorCode,
    public readonly context: { platformId?: string; institutionId?: string; frameOrigins?: string[] } = {},
  ) {
    super(LTI_ERRORS[code][1]);
    this.name = 'LtiError';
    this.status = LTI_ERRORS[code][0];
  }
}
