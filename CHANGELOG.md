# Changelog

## Unreleased

- Built the Settings screen with three sections: Household Setting, Household Members, and Contact List.
- Added shared family/contact models in `/home/runner/work/family-butler-v2/family-butler-v2/frontend/src/types/family.ts`, including ordered members and optional contact birth year support.
- Settings household name now saves via an explicit **Save** button and is reflected in the Dashboard header title.
- Added updated Settings screenshots:
  - Desktop: `/home/runner/work/family-butler-v2/family-butler-v2/docs/assets/03-settings.png`
  - Mobile: `/home/runner/work/family-butler-v2/family-butler-v2/docs/assets/09-settings-mobile.png`
- Added guidance to agent instructions to include a screenshot after UI changes in the PR comment.
- Added guidance to record UI screenshot-related updates in the changelog.
- Updated the dashboard day column to use abbreviated month labels (for example `21. Sept.`) with a smaller, non-wrapping date font.
- Added an updated dashboard screenshot at `/home/runner/work/family-butler-v2/family-butler-v2/docs/screenshots/dashboard-day-column-month-abbrev.png`.
- Refined the member creation dialog with reusable MUI + Emotion glassmorphism components and added an updated screenshot at `/home/runner/work/family-butler-v2/family-butler-v2/docs/screenshots/member-dialog-mui-glass.png`.
- Unified the member and contact dialogs under shared MUI + Emotion glass form styles with light/dark-aware tokens for consistent appearance.
- Added updated settings dialog screenshots for both modes:
  - Dark: `/home/runner/work/family-butler-v2/family-butler-v2/docs/screenshots/settings-contact-dialog-dark-glass.png`
  - Light: `/home/runner/work/family-butler-v2/family-butler-v2/docs/screenshots/settings-contact-dialog-light-glass.png`
- Refined dialog visual hierarchy by removing extra inner frames and aligning floating labels with outlined field borders; added screenshot `/home/runner/work/family-butler-v2/family-butler-v2/docs/screenshots/member-dialog-clean-border-labels.png`.
- Replaced the member avatar color dropdown with an accessible color swatch picker and added screenshot `/home/runner/work/family-butler-v2/family-butler-v2/docs/screenshots/member-dialog-color-picker.png`.
- Migrated member avatar color persistence from semantic names to real color values (hex/rgb-friendly strings) with legacy value normalization, and added screenshot `/home/runner/work/family-butler-v2/family-butler-v2/docs/screenshots/member-dialog-hex-color-storage.png`.
- Added Azure Static Web Apps Data API Builder deployment config at `/home/runner/work/family-butler-v2/family-butler-v2/swa-db-connections/staticwebapp.database.config.json` (read-only `Household` entity) and wired `data_api_location` in the SWA workflow.
- Added a frontend startup probe for `GET /data-api/rest/Household` with non-sensitive status/error messaging to verify SWA → Azure SQL Data API connectivity.
- Extended `GET /api/health` with optional deep checks via `?checks=1` to report environment-variable presence and database connectivity for Azure SQL troubleshooting.
