// LTI 1.3 / LTI Advantage claim names (1EdTech LTI Core 1.3, AGS 2.0, NRPS 2.0).
const LTI = 'https://purl.imsglobal.org/spec/lti/claim/';

export const CLAIM = {
  messageType: `${LTI}message_type`,
  version: `${LTI}version`,
  deploymentId: `${LTI}deployment_id`,
  targetLinkUri: `${LTI}target_link_uri`,
  resourceLink: `${LTI}resource_link`,
  roles: `${LTI}roles`,
  context: `${LTI}context`,
  custom: `${LTI}custom`,
  launchPresentation: `${LTI}launch_presentation`,
  toolPlatform: `${LTI}tool_platform`,
  ags: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
  nrps: 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice',
} as const;

export const LTI_VERSION = '1.3.0';

/** Phase 1a accepts resource-link launches only. Deep linking arrives in Phase 2. */
export const SUPPORTED_MESSAGE_TYPES = ['LtiResourceLinkRequest'] as const;
