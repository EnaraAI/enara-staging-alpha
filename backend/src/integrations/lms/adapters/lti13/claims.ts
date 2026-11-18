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
  // LTI Deep Linking 2.0 (Phase 2, the activity picker)
  deepLinkingSettings: 'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
  deepLinkingContentItems: 'https://purl.imsglobal.org/spec/lti-dl/claim/content_items',
  deepLinkingData: 'https://purl.imsglobal.org/spec/lti-dl/claim/data',
  deepLinkingMsg: 'https://purl.imsglobal.org/spec/lti-dl/claim/msg',
} as const;

export const LTI_VERSION = '1.3.0';

/** Resource-link launches (Phase 1a) and, behind LMS_DEEP_LINKING_ENABLED, the activity picker (Phase 2). */
export const SUPPORTED_MESSAGE_TYPES = ['LtiResourceLinkRequest', 'LtiDeepLinkingRequest'] as const;
export const DEEP_LINKING_REQUEST = 'LtiDeepLinkingRequest';
export const DEEP_LINKING_RESPONSE = 'LtiDeepLinkingResponse';
