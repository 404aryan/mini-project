# Phase 5 — Accessibility, motion and performance

## Changes

- The camera dialog now contains its dock in the accessibility tree. Keyboard
  focus starts at Close, wraps through the stage and dock, returns to the opener
  on Escape, and stays on the selected dock item when changing modes.
- A visible-on-focus skip link targets the hero. Dock arrow/Home/End navigation
  remains available; Training Studio adds up/down and Home/End label navigation.
- Small labels, footer text, controls, and large coral headings have stronger
  contrast using the existing palette. The avatar preview has an image role,
  and training buttons include their visible letter and sample count in their
  accessible names. Camera state changes are announced politely.
- Touch controls have larger targets. Focus destinations have space above the
  dock; the stage includes safe-area padding and `viewport-fit=cover` is enabled.
  On phones, the preview's engine controls sit below its badge, and playback
  buttons keep their size while the footer wraps into readable rows.
- A shared reduced-motion hook uses a server snapshot that matches hydration.
  CSS also enforces the preference before JavaScript loads. Reduced motion
  disables dock magnification, sliding highlights, ripple/scan motion, page
  entrance transforms, smooth scrolling, and decorative loops. The story uses
  ordinary cards, including when the preference changes during the session.
- The scan sweep now moves with a transform rather than changing `top` each frame.
- Mobile/reduced-motion story illustrations use native SVG without animation
  subscriptions. The desktop animated scene initializes near the viewport.
- Camera-stage UI is split into a bundle loaded on first entry and retained
  afterward. A cancellable loading card covers a slow bundle request; closing
  during loading cannot reopen the stage or start the camera later. Typed and
  recognized text persists across mode changes within the page.
- The 3D preview loads when at least 20% of its region is visible, or when Sign
  mode needs it. Its grid column can shrink correctly on phones. Once loaded,
  the same canvas/model stays mounted through scrolling and mode switches.
  A resting avatar no longer draws repeated WebGL frames; playback, loading,
  resize, reset, and power-mode changes invalidate the scene. Authored gestures
  and their instruction timing are unchanged.

No dataset, recognition thresholds, camera-consent rules, or sentence API payloads
were changed. No additional production dependencies were installed for this pass.

## Verification

- `npm run build`, `npx tsc --noEmit`, `npm run test:sign` (37 passing tests), and
  `git diff --check` pass. TypeScript is checked separately because the existing
  Next configuration skips build-time type checking.
- Chrome and Edge checks cover the landing page, camera stage, and Training
  Studio. The automated axe audit checks the full reduced-motion page, including
  content below the fold. All three screens have zero axe violations in both
  browsers. Fresh reduced-motion visits have no hydration errors.
- Viewports checked: 375 × 812, 812 × 375 landscape, 768 × 1024, and 1440 × 1000.
  Checks include horizontal containment and the preview's own bounds, rather
  than only the document's clipped scroll width.
- Keyboard checks exercise the skip link, dock arrows/Home/End, dialog entry,
  forward/backward focus wrapping, Escape, and focus after a dock mode change.
  Training label navigation includes moving from A down to G.
- With reduced motion enabled, the story has four static cards, dock/icon
  transforms are absent, and no infinite decorative animations remain active.
- An isolated cold-load test delayed stage JavaScript by 1.2 seconds. Escape
  cancelled the loading stage, left no mode query, returned focus to Sign to
  Text, and made zero camera requests. Reopening retained manually entered text.
- A 375px playback test made zero GLB requests above the fold, loaded one GLB on
  scrolling into the preview, made zero resting WebGL draws during the measured
  idle interval, resumed drawing for HELLO, and preserved the same canvas through
  entering/exiting Sign mode. Test browser contexts were discarded afterward.

## Performance measurements

Production builds were compared with an isolated archive of the original commit
`b229b9e`, using the same installed dependencies and Lighthouse 13.5.0 in Chrome.
The archive's only build-config adjustment sets Turbopack's root so it can resolve
the shared dependencies. No environment file was copied into it.

The comparison uses Lighthouse's mobile defaults and desktop preset, running
sequentially without builds or other browser tests in parallel. Reports are
saved under `.playwright-mcp/phase5-{original,final}-{mobile,desktop}.json`.
These are local lab snapshots, not device frame-rate or universal score guarantees.

| Measurement | Original desktop | Phase 5 desktop | Original mobile | Phase 5 mobile |
| --- | ---: | ---: | ---: | ---: |
| Performance score | 74 | 85 | 52 | 79 |
| Accessibility score | 92 | 100 | 92 | 100 |
| Largest contentful paint | 0.87 s | 0.59 s | 11.03 s | 5.27 s |
| Total blocking time | 672 ms | 340 ms | 1,088 ms | 135 ms |
| Cumulative layout shift | 0 | 0 | 0 | 0 |
| Initial transfer | 1,905 KiB | 1,986 KiB | 1,905 KiB | 791 KiB |

The mobile score improves relative to the original, but its measured LCP remains
above the usual fast-loading target. The runs do not establish 60 fps on hardware.

The isolated original source copy is at
`D:/code/PROJECTS/SIH 2026/yap-render-perf-baseline-20261018`; audit-only npm tools
were installed in the system temporary directory. The app's dependency manifest
does not include Lighthouse or axe.

Local production still requests the existing Vercel Analytics endpoint, which
returns 404 outside Vercel. Application runtime and hydration errors are checked
separately from that existing analytics request.

## Test it yourself

1. Run `npm run dev` and open `http://localhost:3000`. On a phone-size window,
   scroll into the preview and try HELLO. Open Sign to Text, exit, and confirm the
   avatar remains available. Test Tab, Shift+Tab, arrows, Home, End, and Escape.
2. Enable reduced motion before loading, then toggle it while the app is open.
   The dock should stay still, the story should become four cards, and the camera
   should remain off until a deliberate camera action. Rotate the mobile viewport.
3. Use `/sign/train` to record/import at least three real samples for a label,
   then test hold-to-commit, transcript editing, copy, sentence cleanup, and voice
   selection. The bundled dataset remains intentionally empty; no predictions
   are invented to make the beta look trained.
4. On physical devices, check the permission/denial instructions, camera light
   shutting off on exit/backgrounding, speech voices, and longer signing sessions.

Safari/iOS, physical Android GPU/frame-rate behavior, real camera hardware, and
audible speech still require device testing. The 60 fps target has not been
claimed from browser emulation or Lighthouse scores.

Phase 5 implementation is complete and ready for device testing.

## Follow-up — 19 October 2026

Sample-library refreshes now preserve the running recognition loop and its
held-letter lock, preventing duplicate commits when window focus triggers a
reload. Four regression tests bring the suite to 41 passing tests. Build and
standalone TypeScript checks also pass. See [sign-status.md](sign-status.md)
for the current phase map, remaining work, and the refresh/double-letter test.
The browser audits and performance scores above were not rerun for this fix.

### Camera-session pass

The next pass fixes a first-use primer bypass after backgrounding, camera-loss
races while preview playback is pending, and capture that could survive a
`pagehide` event without React unmounting. Camera mute/end events now stop the
stream and require an explicit resume. Storage-blocked visits retain privacy
acceptance across mode changes in the mounted camera hook. Leaving a cached page
also cancels an unfinished training round and browser speech.

Seven new regression cases pass, bringing the suite to 48. Production build and
standalone TypeScript checks pass. Isolated Chromium integration checks at desktop
and 375px cover primer preservation, stopped/detached tracks, explicit resume,
countdown cancellation, speech cancellation and transcript retention. The checks
use real blank-canvas MediaStreams plus simulated lifecycle/mute events and a
speech spy; they do not establish physical device behavior or audible playback.
Both screens had zero page errors and no horizontal overflow. Previous Lighthouse
and axe measurements were not rerun. Device checks remain listed in
[sign-status.md](sign-status.md).
