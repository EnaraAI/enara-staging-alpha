# Parents portal: desktop layout (21 Nov 2026)

Owner request: "The parents portal is showing the UI as a phone UI, even on a desktop. Fix it." The owner gave this go in the Tutor session ("Yes, do it"), on branch `claude/parents-desktop`.

- **Cause:** `.pp` had `max-inline-size: 480px` with no wider layout, so a desktop showed a 480 px phone column. The bottom sheet had the same limit.
- **Fix:** a CSS-only `@media (min-width: 900px)` block in `frontend/parents/parents.css`:
  - the page is up to 1120 px wide, with the header across the top;
  - the sections become a side navigation (left in English, right in Arabic, using logical properties);
  - the content sits in a column of up to 820 px;
  - sheets open as centred dialogs of up to 560 px.
  - Phones are unchanged.
- **Test:** E2E scenario 10 checks that at 1366 px the portal is wider than 900 px and the navigation is a side column, and that at 390 px it is back to the phone layout.
