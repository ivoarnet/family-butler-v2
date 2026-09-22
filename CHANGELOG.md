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
