# Apple TV app evaluation

## Scope and conclusion

This document evaluates how Family Butler can add an Apple TV app and records the isolated SwiftUI proof of concept under `/home/runner/work/family-butler-v2/family-butler-v2/tvos`. The current web application has not been converted or replaced.

**A monorepo containing both the existing web app and a tvOS app is feasible and is the recommended direction if an Apple TV app is pursued.** Keep the React/Vite web app, Azure Functions API, and Supabase data layer as they are. Add a separate native tvOS client that consumes the existing backend over HTTPS. The clients can share the product, backend, and documented API contracts, but should not be expected to share their UI or most client code.

Apple TV is not a general-purpose web browsing platform: users cannot launch this React site in Safari on Apple TV. A web-only deployment therefore does not deliver an Apple TV app. A native app is needed for a first-class TV experience and App Store distribution.

## Existing project and what can be reused

The repository currently has two npm workspaces:

- `frontend/`: React, TypeScript, and Vite; deployed as a static site through Azure Static Web Apps.
- `api/`: Azure Functions HTTP handlers; also hosted through Azure Static Web Apps and backed by provider-based Supabase access in `api/shared/db`.

The API already exposes household operations at `/api/households` and `/api/households/{householdId}`. Those handlers require a Supabase user access token and resolve the user on the server. The frontend uses Supabase authentication and sends the authenticated session token to protected API operations. This is a useful foundation for another client, but it does not mean every API route has the same access controls: for example, the current `/api/tasks` handler does not perform that authentication check. Review authorization before using any endpoint for family data.

Reusable pieces are the backend, database, business rules enforced by the API, and stable request/response contracts. The React components, browser routing, CSS, and web-specific state/UI code are not directly reusable in a native SwiftUI app. The existing npm workspaces can remain unchanged; an Xcode project can live alongside them without being an npm workspace.

## Proposed repository layout

If implementation is approved, keep the platform clients visibly separate:

```text
.
├── api/                 # Existing Azure Functions API
├── frontend/            # Existing React/Vite web client
├── tvos/                # New Xcode project and native tvOS client
└── docs/
```

The prototype uses a separate Xcode application target, XCTest target, and UI-test target with a shared `FamilyButler` scheme. No frontend/API restructuring or npm workspace changes are required.

## Client options

| Option | Assessment |
| --- | --- |
| **Native SwiftUI tvOS app** | Recommended. Supports the platform's focus-and-remote interaction model and can call the same HTTPS API. It requires a separate Swift codebase and Apple development/release tooling. |
| **Embed the existing web app in a web view** | Not recommended as the primary client. It does not turn the site into a TV-browser experience, and still requires a native app shell, review, remote-friendly interaction, and testing. Consider only for a narrow embedded web-content use case after validating current platform and review requirements. |
| **React Native or another cross-platform UI framework** | Possible in principle, but it would introduce a new client stack and framework-specific tvOS compatibility and maintenance questions. Evaluate its current tvOS support, library coverage, remote/focus behavior, accessibility, and release path with a small proof of concept before selecting it. It would not reuse the current React DOM UI as-is. |

## Suggested implementation path

1. **Confirm the product scope.** Start with a TV-oriented, read-mostly household calendar or upcoming-events view. Decide which account, household selection, and family data should be available on a shared television before building screens.
2. **Check backend readiness.** Inventory the intended endpoints, authentication requirements, response formats, error behavior, and data permissions. Reuse the authenticated household endpoints where they meet the use case. Add or adjust API functionality only when needed, keeping database access provider-based and authorization on the server.
3. **Prototype authentication and one read flow.** Create a minimal native tvOS target, sign in using a flow supported for tvOS, select a household, and fetch its data from the API. Validate token refresh, sign-out, expired sessions, and errors on a physical Apple TV or simulator before committing to a larger implementation. Do not assume the browser's sign-in UI can simply be embedded in the TV app.
4. **Build for the television.** Design for viewing at a distance, large readable type, clear focus indication, predictable directional navigation, and the Siri Remote. Forms and text entry are costly on a TV; keep them limited and make the initial experience useful without frequent typing.
5. **Add a separate build and release path.** Retain the current Azure Static Web Apps workflow for the web/API. Build, sign, test, and distribute the tvOS target separately using Xcode and Apple's distribution tooling. A macOS/Xcode-capable environment is required for native builds; determine signing identities, bundle identifiers, provisioning, App Store Connect access, and team ownership before release work.
6. **Test both products independently.** Continue running the existing root npm build for web/API changes. Add tvOS build and UI/remote-navigation checks in an Apple toolchain environment. Exercise authentication and API behavior against a development backend and verify that web deployment is unaffected.

## Security and operational considerations

- Use HTTPS and the existing user-scoped API authorization for household data. The API must verify the authenticated user and household access on every protected operation; never trust a household identifier supplied by the client alone.
- A Supabase publishable key may be present in a client, but `SUPABASE_SECRET_KEY` and any service-role credential must remain server-side in Azure settings. Never place them in the Xcode project, app configuration, source, or client build artifacts.
- Treat a television as a shared device. Provide a clear sign-out/account-switch path, avoid exposing private details on launch or after a session is stale, and consider what happens when household membership changes.
- Decide how native authentication securely stores and refreshes sessions, handles revoked credentials, and limits data retained on-device. Do not log tokens or sensitive family data.
- Keep API contracts explicit and compatible across clients. The repository currently does not provide a dedicated OpenAPI contract in the described architecture; documenting endpoint behavior is a prerequisite to keeping independent clients aligned.
- The current `/api/tasks` endpoint is not authenticated in its handler. Do not use it as a pattern for new tvOS operations or assume all existing endpoints are appropriate for sensitive data.

## Feasibility summary

| Area | Evaluation |
| --- | --- |
| Coexistence in this repository | Feasible; keep the native Xcode project separate from npm workspaces. |
| Backend and data reuse | Feasible through the existing HTTPS API, subject to endpoint authorization and contract review. |
| Sharing the web UI with tvOS | Not a realistic assumption; build a TV-specific native interface. |
| Hosting and deployment | Keep the web/API Azure deployment; distribute the signed native app through Apple's tvOS app distribution path. |
| Main investment and risks | A second client to maintain, tvOS-specific UX/accessibility, secure shared-device authentication, API contract quality, and Apple signing/release operations. |

**Recommendation:** proceed only after confirming the desired Apple TV use case and user privacy expectations. Then run a small native SwiftUI authentication-and-calendar proof of concept before deciding on full product scope. This validates the highest-risk parts without changing the existing web application.

## Apple references

- [Get started with tvOS](https://developer.apple.com/tvos/get-started/)
- [SwiftUI documentation](https://developer.apple.com/documentation/swiftui)
- [tvOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/tvos/)
- [Focus-based navigation](https://developer.apple.com/documentation/uikit/focus-based_navigation_for_uis_in_your_app)
- [Distributing your app for beta testing and releases](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)

## Implemented proof of concept

### Scope and setup

- Project: `/home/runner/work/family-butler-v2/family-butler-v2/tvos/FamilyButler.xcodeproj`.
- Native SwiftUI, tvOS 17 or later, Xcode 16 or later; Foundation networking only, no third-party runtime dependencies.
- Read-only: native email/password sign-in, household selection, next-30-days calendar, refresh, event summary, and sign-out.
- Existing accounts only. Create accounts, reset passwords, and manage household/calendar data in the web app. Native secure text entry uses the tvOS system keyboard/Siri Remote; this is not a browser OAuth flow or an invented device-code protocol.
- Set **API_BASE_URL** on the application target to the deployed HTTPS origin, for example `https://your-site.azurestaticapps.net`. Do not include a path, credentials, query, or fragment. The default invalid origin displays a configuration message and cannot send credentials.
- Azure must already have `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SECRET_KEY` configured. Never copy the secret/service-role key into the native project.

### Reused contracts and authorization

| Request | Client usage / expected response |
| --- | --- |
| `GET /api/auth-config` | Public `{supabaseUrl, supabasePublishableKey, isConfigured}`. Require HTTPS and a publishable key or legacy JWT with `role: anon`; reject secret/service-role keys. |
| Supabase `POST /auth/v1/token?grant_type=password` | HTTPS email/password authentication with the public `apikey`; decode `access_token`, `refresh_token`, `expires_in`. |
| Supabase `POST /auth/v1/token?grant_type=refresh_token` | Refresh the in-memory session before reads when less than 60 seconds remain. |
| `GET /api/households` | `{households: [{id, name}]}` restricted by `created_by_user_id` on the server. |
| `GET /api/households/{id}` | Decode only `events: [{id, title, date, allDay, startTime?, endTime?, location?, repeatRule?}]` from the existing full household response. The provider checks household ownership before loading relations. |
| Supabase `POST /auth/v1/logout?scope=local` | Best-effort revocation of this session's refresh token on explicit sign-out, without signing out other devices. |

Protected API requests send both the user bearer `Authorization` header and `x-supabase-auth-token`, matching the web client and Azure Static Web Apps forwarding behavior. The API resolves the token through Supabase `/auth/v1/user` for each request; the client never queries database REST endpoints directly or treats its own household list as authorization. `401` clears the session and private UI; `403`/`404` remove the selected household/events and allow household reselection. Response bodies and credentials are not logged or displayed as errors.

### Shared-TV security and interaction

- Credentials, access/refresh tokens, household lists, and events are held only in memory. No UserDefaults, files, Keychain persistence, analytics, or token logging. Password input is cleared on submission and all form/private state is cleared when the scene is backgrounded. Inactive scenes are hidden without disrupting transient system keyboard interactions. Relaunching/returning from the background requires sign-in. This deliberately trades convenience for shared-TV privacy.
- Explicit sign-out clears local state immediately, even offline. Remote revocation is best effort; Supabase access JWTs may remain valid until expiry. Leaving the foreground forgets the session locally but does not promise server revocation.
- An ephemeral URLSession disables disk caching, cookies, and credential storage. Redirects are refused rather than forwarding passwords/tokens to another origin. There are no App Transport Security exceptions.
- A generation guard prevents requests started before sign-out/backgrounding from repopulating private state. No selection/data is restored from disk. Foreground reads are reauthorized every minute and via Refresh; stale data is cleared before those reads. Permission changes can still take up to one minute to disappear while viewing an idle foreground app.
- Large system type, generous spacing, dark high-contrast surfaces, scrollable lists, and blue/white focused-button outlines support TV-distance reading. Remote Back returns from calendar to households; system Back dismisses event summaries. Native fields retain system focus/keyboard behavior.

### Gaps / risks before expanding the prototype

- **Ownership, not shared membership:** current backend authorization permits only household creators. Family-member/contact records are not login memberships. Do not broaden access in the client; delegated household membership requires a separate backend design.
- **Calendar fidelity:** the app sorts stored dates in the TV's local timezone and shows all-day events today plus timed events that start in the future, within 30 calendar days. The API has no occurrence/range endpoint, timezone contract, or pagination; RRULE recurrences, ongoing timed events, birthdays, and day configurations are not expanded. The UI states the recurrence limit explicitly. This is a stored-date proof of concept, not parity with the web calendar.
- **Overfetch:** the existing authorized household endpoint also sends members, contacts, and notes; the app does not decode/display those fields, but they still transit the device. A minimal events/occurrences endpoint is preferable before production or larger households.
- **Authentication:** existing email/password accounts are supported. MFA challenges, social OAuth, account registration, recovery, and phone/device pairing are out of scope. Do not assume Supabase supports an OAuth device grant for this project. TV keyboard behavior and real project auth policies still need device validation.
- **Deployment:** default ATS requirements apply to both API and Supabase TLS. A staging HTTPS backend is needed for real integration checks. There are no Azure resource/IaC or existing deployment-workflow changes.
- **Distribution:** the bundle identifier is a prototype identifier. Signing, icons/top-shelf assets, accessibility review, App Store distribution, and persisted-session policy are not production-ready.
- `/api/tasks` remains unauthenticated and is not used. No API routes or providers were changed.

### Apple-toolchain validation (required, not yet claimed complete)

On a Mac with the tvOS simulator runtime installed, discover the simulator UUID with `xcrun simctl list devices available`. Replace `SIMULATOR_UUID` and the example HTTPS origin below:

```bash
xcodebuild test \
  -project /home/runner/work/family-butler-v2/family-butler-v2/tvos/FamilyButler.xcodeproj \
  -scheme FamilyButler \
  -destination 'platform=tvOS Simulator,id=SIMULATOR_UUID' \
  -derivedDataPath /tmp/family-butler-tvos \
  -resultBundlePath /tmp/family-butler-tvos-tests.xcresult \
  API_BASE_URL=https://your-site.azurestaticapps.net \
  CODE_SIGNING_ALLOWED=NO
```

Use the equivalent checkout path on your Mac. Select the same simulator in Xcode and run the app. Automated tests mock authentication/API responses without real credentials; the UI smoke test launches the app, checks secure sign-in controls, exercises remote Up/Down focus, and attaches a screenshot to the test result. `/home/runner/work/family-butler-v2/family-butler-v2/.github/workflows/tvos.yml` performs this separately on macOS and retains the `.xcresult` (including screenshot attachments) as `tvos-simulator-results`.

Manual staging validation, using disposable accounts and non-sensitive events:

1. Run `GET /api/health?checks=1` against the existing staging API; verify Supabase connectivity.
2. Sign in using the tvOS keyboard (and paired iPhone keyboard if available); verify invalid credentials show only a generic message and password text is never visible.
3. Use accounts A/B with separate owned households. A must see only A's households/events. Verify an API request for B's ID with A's user token returns `404`, and a missing/invalid token returns `401`.
4. Navigate all controls with the simulator remote/Siri Remote, scroll beyond one screen of events, open/close a summary, return to households with Back, and select another household. Check focus outlines and readability at TV distance.
5. Leave the app idle across token refresh; revoke/invalidate the session and Refresh. Private state must disappear. Remove access and Refresh; no old events may remain.
6. Sign out and test offline sign-out. Background/relaunch the app and verify both form and private data are empty. Sign out/background during an in-flight read and verify no late response restores data.
7. Capture sign-in, household, and calendar screenshots using `xcrun simctl io SIMULATOR_UUID screenshot /tmp/family-butler-tvos-calendar.png`. Attach a non-sensitive simulator screenshot to the PR and record actual Xcode/runtime/device versions and results before accepting the issue.

**Validation recorded in this implementation environment:** the root `npm run build` passes; nine Foundation/networking XCTest tests pass using Swift on Linux; all native sources parse and the Xcode project references resolve. Linux cannot import the Apple SwiftUI SDK or run `xcodebuild`/Apple TV simulators. Apple-only model/UI tests, the tvOS build/launch, live Supabase flow, and an actual updated simulator screenshot are **pending**, not simulated or asserted as successful. The screenshot attachment/workflow is provided to complete that validation on a Mac; this limitation leaves the Apple-toolchain acceptance criteria unverified.
