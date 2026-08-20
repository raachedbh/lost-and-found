# L9itha release QA — 2026-08-20

## Result

Passed for a deployment candidate, with one external setup item: real Google/Facebook login still needs the project's Firebase values and provider credentials. The code path and server verification are implemented; no production credentials were available for a live provider login.

## Visual evidence

- [Desktop home](audit/2026-08-20-release/01-desktop-home.png)
- [Mobile home](audit/2026-08-20-release/02-mobile-home.png)
- [Mobile sign-in](audit/2026-08-20-release/03-sign-in.png)
- Source reference: `/Users/yacine/.codex/generated_images/01a01dd8-9bfe-7f32-8e26-4192528fa7da/exec-2a919ae4-bf84-4e6e-ac27-6692b836f7f0.png`

The source and final desktop screen were inspected together. The implementation preserves its centered RTL promise, illustrated people, split lost/found actions, discovery controls, categories, nearby cases, and trust strip. Copy was shortened and the product controls remain functional.

## Browser checks

1. Home discovery — healthy: public cases load without authentication; search, categories, case cards, and primary actions are present.
2. Authentication — healthy: report, save, message, profile, settings, and notification actions require a session. Development demo sign-in works; mobile sign-out is visible.
3. Messaging — healthy: the authenticated wallet conversation loaded through the membership-scoped API.
4. Responsive layout — healthy: no horizontal overflow at 320, 375, 390, 430, 768, 1024, or 1440 CSS pixels.
5. Languages — healthy: Tunisian Arabic is RTL; English switches to LTR at 320 pixels without overflow.
6. Accessibility basics — healthy: dialogs are labelled, trap focus, close by button or Escape, and protected actions expose clear button names.
7. Console — healthy: no warnings or errors in the final state.

## Automated checks

- `npm test`: 16/16 passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm audit --audit-level=low`: 0 vulnerabilities.
- `git diff --check`: passed.

## Production checks

- Built server health: HTTP 200.
- Production demo sign-in: HTTP 404.
- Unconfigured Firebase sign-in: HTTP 503, fail closed.
- Headers: CSP, HSTS, no-store API caching, frame blocking, referrer policy, content-type hardening, and camera/geolocation/microphone disabled.
- Container: Dockerfile and health check are present. A local image build was unavailable because the Docker daemon was not running.

## Security remediation

The release scan found ten issues. The implementation closes the demo-auth exposure, cross-user message access/write paths, conversation enumeration, fixed document redaction logic, overly precise public locations, unbounded path rate-limit buckets, mixed timestamp expiry, and persistent browser drafts containing sensitive fields. Document images are now rejected instead of being published with a cosmetic mask.

Final result: passed with external Firebase credentials and a live Docker daemon explicitly unverified.
