# Contributing

## Development workflow

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Use workspace scripts from the root `package.json`:

   - `npm run dev`
   - `npm run build`
   - `npm run storybook --workspace frontend`
   - `npm run build-storybook --workspace frontend`

3. Keep API runtime compatibility with Azure Functions (`function.json` + `index.js` handlers).
4. Keep API data access provider-based under `/home/runner/work/family-butler-v2/family-butler-v2/api/shared/db`.

## Change expectations

- Prefer surgical refactors that preserve behavior and public APIs.
- Reuse existing shared modules/components before adding duplicates.
- Update Storybook for new or modified frontend components.
- Update `README.md`/`CHANGELOG.md` when structure or architecture guidance changes.
- Never commit secrets; keep real credentials in GitHub/Azure secret stores.
