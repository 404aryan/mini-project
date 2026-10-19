# Phase 4 — Sign to Text story

The landing page now includes “You Sign. We Speak.” between How it works and
Why it matters. It reuses the existing colors, type, Motion, and icons.

## What changed

- A 400svh track pins the story on screens at least 900px wide and 620px high.
  Native scrolling drives four beats: the hand enters, 21 joints draw in,
  normalized features move toward the sample node, and example letters assemble
  beside a waveform. Scrolling backward reverses the scene.
- Chapter buttons seek within the story; a skip link jumps to its final CTA.
- Mobile, short windows, and reduced-motion preferences use four ordinary cards.
  Resizing or changing the motion preference updates the layout immediately.
- “Try it live” uses the existing camera flow and the exact center of the dock's
  Sign to Text button as its portal origin. Hover/focus/touch can warm the model,
  but scrolling and chapter navigation never open the camera.
- The dock highlights Sign to Text while the story crosses the viewport center.
- The illustration is explicitly labeled as a concept with example text. It
  neither predicts signs nor plays speech. Recognition still requires recorded
  training samples; no samples were added or changed in this phase.

The implementation uses native scrolling, preserving the existing anchor and
modal behavior without adding Lenis or GSAP. The landing shell uses
`overflow-x: clip` so it contains horizontal content without becoming the sticky
scene's scrolling ancestor.

## Try it

1. Run `npm run dev` and visit `http://localhost:3000/#sign-story`.
2. On a desktop window, scroll through all four chapters, reverse direction,
   and select the numbered chapter controls. The dock should highlight Sign to
   Text without changing the mode URL or asking for camera permission.
3. Select “Try it live.” The existing privacy primer appears on a first visit;
   after acceptance, the usual camera and recognition states apply. Escape closes
   the stage and returns focus to the CTA.
4. Repeat at 375px width, below 620px window height, or with reduced motion enabled.
   The story should become four readable cards without pinning or horizontal
   overflow. Use the skip link and keyboard focus controls as well.

## Verification

- `npm run build`, `npx tsc --noEmit`, and `git diff --check` pass. TypeScript is
  checked separately because the existing Next configuration skips it at build.
- All 37 existing sign tests pass with `npm run test:sign`.
- Chromium checks covered the four beats, backward scrolling, chapter buttons,
  sticky positioning, dock scroll-spy, and horizontal containment at desktop size.
- The 375 × 812 mobile layout, 1024 × 600 short-window fallback, and live changes
  to the reduced-motion preference were checked.
- In an isolated browser context, a camera-request spy remained at zero through
  scrolling, chapter changes, and opening the first-time primer. Accepting the
  primer made exactly one request; a denied request showed its recovery state.
- The portal's clip-path center matched the dock icon center. Escape returned
  focus to “Try it live,” and the existing avatar canvas remained mounted when
  returning to Speak to Sign.

Phase 5 adds Chrome/Edge checks and Lighthouse measurements; see
[sign-phase-5.md](sign-phase-5.md). Safari and physical Android checks remain manual.

Phase 4 is complete. The Phase 5 implementation is now ready for device testing.
