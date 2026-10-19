# Sign → Text — Phase 2

Phase 3 now provides persistent recordings/imports and a working Training Studio.
The session-only storage notes below describe Phase 2; see [Phase 3](sign-phase-3.md)
for current storage behavior and tests.

Phase 2 adds real two-hand detection, a canvas skeleton overlay, a replaceable
k-NN recognizer, hold-to-commit, transcript editing, sentence cleanup, and speech.
Run `npm run dev` and open <http://localhost:3000/?mode=sign>.

## What you can test now

1. Open the camera and show both hands. Skeletons follow the mirrored preview;
   inference uses the original camera pixels. Portrait/landscape crops use the
   same cover projection for the video and overlay.
2. The bundled dataset is deliberately empty. The UI reports **Recognition needs
   training data** and the actual number of trained signs. Tracking does not
   manufacture letters. `/sign/train` is a working Phase 3 introduction, not the
   recording studio yet.
3. Import a JSON file containing genuine labelled samples. Import replaces the
   current session’s samples and never uploads them. A label needs at least three
   samples to participate. Invalid files preserve the current classifier and
   explain the error. Reloading the page clears imported samples; IndexedDB
   persistence and recording are Phase 3.
4. Hold a trained sign: after the frame vote settles, a radial ring fills over
   700 ms. A committed character moves into the transcript. The same sign cannot
   repeat until a release lasting 200 ms or a different stable sign. Frame stalls
   do not count as releases. This is an experimental static-sign classifier,
   not general ISL understanding or a calibrated confidence probability.
5. Use **Edit text** to enter your own test phrase without training data. Space,
   backspace, clear, and copy work on the transcript. Manual edits are labelled
   as typed text and never represented as camera recognition.
6. **Make it a sentence** sends only character tokens and the chosen language to
   `/api/sign/sentence`. It reuses the existing server-side Gemini configuration;
   no new service or client key is added. It works with the existing configured
   key. If unavailable, the result is explicitly labelled **Formatted text** and
   says that no translation occurred. Raw text remains visible. Editing raw text,
   switching language, or leaving the mode invalidates outstanding results.
7. **Speak** uses the browser’s Web Speech API. Choose English or Hindi and an
   available system voice. The picker labels device and online voices. The
   waveform follows speech events. Exit/backgrounding cancels speech and camera
   capture. Voice installation and pronunciation depend on the device.

## Sample format

The root is `{ "version": 1, "normalization": "wrist-maxdist-v1", "samples": [] }`.
Each real sample has a unique string `id`, a single `label` from A–Z / 0–9, and
126 finite numeric `features`. The array is two consecutive 21 × (x,y,z) hands:

- Sort detected hands by their **raw wrist x** before normalization.
- Subtract each hand’s wrist from its 21 landmarks.
- Divide that hand’s coordinates by its maximum 3D wrist-to-joint distance.
- Put a single detected hand in the first 63 values; zero-pad the other 63.
- Keep input pixels unmirrored. Overlay smoothing is never used as sample data.

Use `extractFeatures` in `lib/sign/features.ts` when recording. Do not hand-author
feature arrays or substitute ASL labels for validated ISL samples. The UI accepts
up to 5,000 samples / 10 MB per file. No word or sequence datasets are supported
in this phase; the badge therefore reports zero words.

## Verification completed

- `npm run build`, `npx tsc --noEmit`, and `git diff --check`.
- `npm run test:sign`: 28 tests covering feature invariance, sample validation,
  k-NN ambiguity/outlier rejection, voting/hold/repeat rules, frame throttling,
  requestVideoFrameCallback/rAF cancellation, GPU-to-CPU initialization fallback,
  camera permission races, and text-only request validation.
- Chromium browser checks at 1280/1440 desktop sizes and 375 × 812: no horizontal
  overflow, usable transcript controls, no avatar card obscuring them, copy/edit,
  English/Hindi voice selection, reduced-motion mode, import rejection, and
  navigation to/from the Phase 3 introduction without automatically starting video.
- Actual MediaPipe GPU inference on a test-only video stream drawn from the
  [official two-hand fixture](https://storage.googleapis.com/mediapipe-assets/right_hands.jpg):
  both hands detected and overlay pixels drawn. Blank frames produced no letters.
  Test media is not shipped as a dataset or exposed as a product replay.
- A live sentence request containing `HELLO WORLD` returned `Hello, world.` through
  the existing server integration. The network payload contained only tokens and
  language; landmark-bearing and empty requests returned HTTP 400.
- Speech event wiring, waveform, voice selection, and cancellation checked with
  a browser speech spy. Audible playback, physical camera behavior on phones,
  Safari/Edge, and performance on a mid-range Android device remain manual checks.

The inference loop is outside React, capped near 30 fps, and runs only on new video
frames. Landmarks, overlay smoothing, and ring painting stay in refs/canvas.
React receives stable candidates/status at most about eight times per second,
plus immediate commit events. MediaPipe’s synchronous detector still runs on the
main thread; real-device performance profiling is part of Phase 5.

Reference: [MediaPipe Hand Landmarker for web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).
