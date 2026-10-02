# Apple TV app evaluation

## Scope and conclusion

This document evaluates how Family Butler could add an Apple TV app. It does not convert the current application or add tvOS code.

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

The exact Xcode project structure should be chosen when implementation starts. Avoid moving or restructuring the current frontend/API just to accommodate Xcode. If client contracts need to be shared, document them or add a small platform-neutral contract/specification location; do not try to make Swift consume browser-oriented TypeScript modules.

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
