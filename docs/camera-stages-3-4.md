# Camera upgrade: stages 3 and 4

Implemented on 20 October 2026. The first two stages and the user's animation
library are retained. Model weights and saved personal samples are unchanged.

## Stage 3: synchronized signer tracking

The live stage uses one local video stream and a worker running the installed
MediaPipe GestureRecognizer, PoseLandmarker Lite and FaceLandmarker. Each
processed bitmap has one timestamp shared by all three tasks. Output contains
hands/fingers, shoulders/elbows/wrists, face landmarks, facial blendshape scores
and a head transformation matrix. Canvas overlays show arms, eyebrows and mouth
along with hands, using the same letterboxing and mirror transform as the video.

`signer-frame-v2` explicitly separates these observations from the old hand-only
feature format. Shoulder-normalized x/y wrist locations contribute to the Auto
coordinator's motion suppression. Forearm configuration is represented by
image-plane elbow angles; palm normals estimate orientation. These are not
metric 3D depth or exact forearm-twist measurements. The normalization is named
`shoulder-xy-local-hand-z-v1`: z remains the hand model's local depth estimate,
not torso-relative physical depth. Missing observations remain absent/null.

Hand IDs combine pose wrist anchors with motion continuity. Anatomical sides
are reported when the anchors distinguish them, otherwise they remain unknown.
Long occlusions expire tracks; no invisible hands are fabricated. Preview
mirroring never changes inference coordinates. Tests cover crossed hands and
swapped detector order, occlusion expiry and normalization invariance.

The existing 135-value word feature frames and 126-value static poses keep their
original ordering and normalization. They are not silently replaced by v2.
The current word classifier still learns from hands, not facial grammar.
Pose/face features support framing and motion checks; learning additional sign
meanings or grammatical expressions requires stage 5 data and retraining.
The existing personal recorder continues to save its compatible v1 format.

There is one image in flight, no frame queue, an adaptive capture cadence and
late-result rejection. Pause/exit terminates the worker; late bitmaps are closed.
GPU initialization/inference failure retries the pipeline on CPU, then falls
back to the original hands-only tracker if necessary. A failed pose/face task
does not falsely report that modality as available. An advanced checkbox allows
hands-only tracking on a slower device. Framing hints and measured FPS/p50/p95
latency are available in the workspace. Timings can vary considerably under
software rendering and concurrent CPU load.

The new self-hosted model files add approximately 9.5 MB, loaded when the camera
starts. Sources, hashes and notices: [SIGNER-MODELS.md](../public/mediapipe/SIGNER-MODELS.md).
No camera image or landmark request is sent to an external service.

### Pipeline benchmark

`scripts/benchmark-signer-tracking.cjs` compares the installed JavaScript APIs
on Google's public pose image. On this Windows/headless Chromium 151 CPU run,
after three warmups and 13 measurements:

| Pipeline | Median inference | p95 inference |
| --- | ---: | ---: |
| Separate gesture + pose + face | 242 ms | 273 ms |
| Holistic + gesture (to retain the YES app gesture) | 331 ms | 400 ms |

The separate pipeline was chosen. Both detected 33 pose landmarks in this
fixture; neither detected a face in that full-body picture. The separate face
pipeline was subsequently tested on the public portrait fixture and returned
face landmarks, blendshapes and a 16-value head transform. These are lab
measurements of repeated still images, not sign accuracy, device minimums,
sustained thermals or a physical webcam test.

## Stage 4: one workspace and typed confirmation

The default is **Auto Preview**, combining word and static recognition in one
coordinator. It proposes typed word/letter/number candidates. Every candidate
needs a deliberate confirmation; Auto does not automatically append guesses.
This is the rollout gate until independent mixed-stream data can establish safe
automatic routing. It does not claim continuous ISL sentence translation.

Compact **Spell**, **Numbers** and isolated **Words** overrides remain for
deliberate intent. The old `recognizer=words` and explicit `recognizer=static`
links work. The absent/unknown recognizer query opens Auto Preview; Numbers uses
`recognizer=numbers`. Switching preserves the camera stream, signer worker and
transcript; only the recognition intent and its pending evidence change.

The coordinator keeps word candidates and static hold evidence separate, never
compares their uncalibrated scores, suppresses letter proposals during motion,
and distinguishes `word:I` from `letter:I`. A confirmation consumes its offer
once and locks a held sign. Release, significant new motion or a different
stable character permits the next sign. Stale offers/results are invalidated
on reset, dataset replacement and exit. A failed word backend removes its
offers while leaving spelling/number proposals available with a warning.

Completed words and their transient handshapes cannot silently insert letters
in Auto. The YES shortcut enters the same confirmation/duplicate rules. The
existing hand-only word model can suggest a completed sign after a pause;
confirming and beginning a distinct movement permits another sign without
requiring both hands to leave the picture. General coarticulated recognition
still needs labelled continuous signing data.

Typed transcript metadata groups letters and repeated digits, inserts word/type
boundaries, renders THANK_YOU as THANK YOU, and keeps the 1,200-character limit.
Numbers filters out letter classifications and advertises only available digit
coverage. Personal recordings are retained, imported in their original formats,
and continue to override their matching baseline labels.

## Verification and remaining release gates

Unit tests cover anatomical identity, missing masks, worker abort/backpressure,
GPU/CPU/fallback transitions, stale worker events, mixed typing, word-vs-letter
ambiguity, held/repeated signs, motion suppression, word-backend failure and the
Numbers override. Synthetic geometry in those tests is timing/control data,
not ISL annotations or a training dataset.

The `signer-tracking` browser suite uses genuine public diagnostic images through
the actual worker and camera-stream path. It checks pose, face outputs and the
app's real-image thumbs-up candidate; confirms that unconfirmed candidates add
no text; verifies YES is written only once after confirmation; and checks mode
switches, pause, worker teardown and hands-only fallback. Isolated contexts and
fixture recordings never modify the user's browser profile or bundled samples.

Recorded verification: 137 unit tests pass, as do report freshness, TypeScript
and the production build. Targeted production browser checks pass 20/20 for the
camera workspace, 15/15 for navigation/focus and avatar restoration, and 14/14
for real-image signer tracking and typed confirmation (49 total). Screenshots
were inspected. Lab output, benchmark JSON and screenshots are retained in
`.sign-data-cache/camera-stage34/` as ignored local evidence. This does not
establish real webcam accuracy or independent mixed-stream performance.

Run `npm run check`, then browser tests against a served production build.
The browser runner prepares public fixtures in the ignored cache on first use;
that preparation needs network access. No external models/images are fetched
by the running product. See the previous stage's notes for disabling AI text
requests and selecting an installed Playwright browser.

Independent mixed-stream signer validation has not been performed. Auto stays
confirmation-only. Facial grammar recognition, complete regional-variant review,
mobile hardware/thermal validation, physical cameras and the remaining missing
training classes are still release gates for later stages. Software tests do
not certify ISL correctness or the accuracy of a webcam translation.

Official API guides consulted:

- https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js
- https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
- https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker
