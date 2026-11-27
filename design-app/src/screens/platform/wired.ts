// Screens in this area that are wired to the lms-test API (the rest show the 'sample data' ribbon).
// Platform (enara-admin): /api/integrations/institutions, /api/credits, /api/analytics/ai-usage, /api/ai-controls/budgets/:id, public /ready.
// /api/platform/status (Mishkat, email counts, models; switch LMS_DESIGN_PLATFORM_STATUS). Still no endpoint: incidents, QWK, alert settings ("Not available yet").
export const wired: string[] = ['platform-schools', 'platform-usage', 'platform-models'];
