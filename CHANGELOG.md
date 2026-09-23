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
- Migrated API database access from Prisma/Azure SQL to a provider-based Supabase implementation under `/home/runner/work/family-butler-v2/family-butler-v2/api/shared/db`.
- Updated `/api/households`, `/api/tasks`, and `/api/health?checks=1` to use Supabase-backed persistence and connectivity checks.
- Removed Azure SQL Data API Builder and Prisma artifacts (`/home/runner/work/family-butler-v2/family-butler-v2/swa-db-connections`, `/home/runner/work/family-butler-v2/family-butler-v2/prisma`, and old Prisma deployment workflow).
- Added Supabase migration/cutover guide at `/home/runner/work/family-butler-v2/family-butler-v2/docs/SUPABASE.md`.
- Added Supabase email/password authentication with role-aware access (`admin` default, `demouser` read-only) across frontend and API.
- Added updated authentication UI screenshot at `/home/runner/work/family-butler-v2/family-butler-v2/docs/screenshots/auth-signin-screen.png`.
- Redesigned authentication into a polished responsive two-column login/registration experience with first-class light/dark modes, notched outlined fields, password visibility toggles, and forgot-password/reset affordances.
- Added updated premium authentication screenshot at `/home/runner/work/family-butler-v2/family-butler-v2/docs/screenshots/auth-screen-premium-layout.png`.
- Added `/api/user-settings` to provision/select per-user default households and support linked household-member context.
- Registration/first authenticated load now auto-provisions a default household for new admin users when none exists.
- Settings now lets users choose their default household and keeps owner-only edits disabled for linked (non-owned) households.
- Added updated authentication screenshot at `/home/runner/work/family-butler-v2/family-butler-v2/docs/screenshots/auth-default-household-flow.png`.
- Added admin household creation controls in Settings to create a new household and immediately switch it as the default household.
