# Changelog

## Unreleased

- Implemented Supabase email/password authentication in the frontend with session bootstrapping, login/register screens, and sign-out support.
- Added a dedicated split auth layout component with glassmorphism styling and a teaser panel, reusing existing dialog field styling tokens/components.
- Updated the dashboard header to show the logged-in user avatar badge (initials) with sign-out action instead of a login entry point.
- Updated Supabase auth environment setup docs (`/home/runner/work/family-butler-v2/family-butler-v2/frontend/.env.example`, `/home/runner/work/family-butler-v2/family-butler-v2/README.md`, `/home/runner/work/family-butler-v2/family-butler-v2/docs/SUPABASE.md`).
- Added auth UI reference image URL for issue alignment: `https://github.com/user-attachments/assets/a37f8281-eace-43de-8611-258b5928fd0a`.
- Added runtime auth-config fallback (`GET /api/auth-config`) so deployed frontend auth can initialize from Azure app settings when build-time `VITE_*` values are not embedded.
- Replaced Household Setting with a first-class Households workspace section, including household creation, selected-state badge, and one-click household switching.
- Updated household creation to use a dedicated dialog consistent with the member/contact create flows.
- Added active household context loading/retry behavior so household members and contact lists reload when switching households.
- Added household API workspace endpoints for listing and creating households: `GET /api/households` and `POST /api/households`.
- Hardened household-scoped writes by rejecting member/contact IDs that are not already part of the active household.
- Added updated Households settings screenshot: `/home/runner/work/family-butler-v2/family-butler-v2/docs/screenshots/households-workspace-selector.png`.
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
- Added a dashboard avatar context menu for logged-in users with profile info, households list, active household summary, and logout action; households listing in Settings now directs users to this menu.
- Added avatar menu visualization reference for issue alignment: `https://github.com/user-attachments/assets/a68ea3ad-d064-4f7e-a47d-742c973d40ba`.
