# Sign → Text — Phase 1

This phase adds the dock, portal transition, privacy primer, and real mirrored
camera preview. Recognition, transcript output, and speech are Phase 2. The Beta
badge deliberately says “Camera preview” rather than claiming any supported signs.

Run `npm run dev`, then open <http://localhost:3000>.

## Manual checks

1. Hover the dock on desktop: nearby icons magnify, tooltips appear, and the active
   pill follows the selected section. Scrolling never asks for camera permission.
2. Tap Sign → Text: the portal starts at the dock icon, the avatar moves into its
   Render card, and the first-use privacy primer appears. Accept to request the
   camera. Later visits remember this choice when browser storage is available.
3. Check the mirrored preview. Exit with Escape, the close button, or another dock
   item: the camera light should turn off immediately. The original avatar canvas
   stays mounted and returns to its original position. Also try this while the
   Speak → Sign workspace is maximized.
4. Exit while the browser permission prompt is open, then grant permission. The
   late stream must stop without reopening the camera. Try rapid exit/reentry.
5. Open `/?mode=sign`: the mode is selected but video waits for an explicit tap.
   Test Back/Forward and confirm unrelated query parameters survive mode changes.
6. Deny camera permission, unplug a camera, and try with another app using it.
   Verify the recovery copy and retry button. Background the page: video stops
   and requires a tap to resume. Audio is never requested by camera mode.
7. At 375 × 812 and in landscape, verify the dock stays inside the viewport and
   stage content scrolls on short screens. Check phone safe areas, touch feedback,
   Tab/Shift+Tab, dock arrow keys, and reduced-motion OS/browser settings.
8. Repeat camera playback in Chrome, Edge, and Safari on real devices. Actual
   permissions and device camera indicators require this manual check.

## Local model assets

All runtime assets are under `public/mediapipe/`; no model CDN is used at runtime:

- `hand_landmarker.task` is the official float16 v1 hand model from
  <https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task>.
  SHA-256: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`.
- The six `wasm/vision_wasm*` JS/WASM files are copied from the installed
  `@mediapipe/tasks-vision/wasm` directory. Keep these in sync with that package
  when upgrading it.

Warm-up is lazy, shared, and camera-free. It tries the GPU delegate, then CPU.
The page can still preview the camera if model initialization fails. Local
assets work without a model CDN; a first visit still needs the app to be served.

## Verification

- `npm run build`
- `npx tsc --noEmit` (the existing Next config skips build-time type errors)
- `npm run test:sign` — twelve media lifecycle regression tests using a small
  hook host and controlled streams; these do not replace real-browser visual QA.

Browser automation was unavailable in the implementation session because its
tool required approval under an approval policy that disallowed it. Mobile visual
QA, physical camera playback, and Safari/Edge checks remain manual.
