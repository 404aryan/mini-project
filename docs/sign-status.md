# Sign → Text — current status

## Transcript, correction and sentence output, 21 October 2026

Stage 6 records each committed sign with its kind, canonical ID, readable text,
source, automatic or confirmed commit, time span and the source's own score
(never shown as a probability). Undo reverts the latest change of any type,
including a whole word, one spelled letter, Clear or an editing session; the
editor can remove individual signs and keeps the details of untouched ones.
Screen readers hear committed changes only. "Make it a sentence" results stay
in a separate card and cannot be spoken or copied when they change a spelled
name, a number or a negation. See [stage 6](camera-stage-6.md).

## Real data and retraining, 20 October 2026

Stage 5 retrains the word forest on all 15 ISL500 signers with a fixed
signer-disjoint train/calibration/test split. Gates and the 52 classes that
may commit automatically are chosen on calibration signers. On the unseen test
signers it commits 1,146 correct and 19 wrong of 2,736 clips (previous model:
774 and 93). The YES → YOUR replay error is diagnosed and fixed. Digit 0 has
real bundled data, offered in Numbers mode only because its photographs are the
same captures as letter O. A second photo source shows that the static baseline
transfers only partly to other signers. See
[stage 5 results and limits](camera-stage-5.md) and the
[collection manifest](sign-data-collection.md).

## Signer tracking and Auto Preview, 20 October 2026

Stages 3 and 4 add synchronized local hand/body/face tracking, versioned signer
observations, CPU/hands-only fallback, and one default Auto Preview workspace.
Auto uses explicit typed confirmation until independent mixed-stream evaluation
is available. Spell, Numbers and isolated Words overrides remain. The shipped
word classifier and personal sample formats remain hand-only. See
[implementation, benchmark and validation limits](camera-stages-3-4.md).

## Camera upgrade, 20 October 2026

The first two stages in `promptforCamera.txt` are implemented: compact camera
and adjacent captions, pause/mirror/fullscreen with expanded fallback, and a
shared 200-entry vocabulary manifest with generated recognition coverage.
HI/HEY survive mixed phrases as HELLO. See
[implementation and verification](camera-stages-1-2.md) and the
[coverage matrix](sign-vocabulary-coverage.md). All linguistic reviews remain
pending. Hands-only recognition and its existing accuracy limits still apply.

The notes below describe the preceding recognition work and its measurements.

Checked against the working tree on 19 October 2026. All five phases have an
implementation. Recognition now automatically loads bundled real ISL samples.
See [dataset sources, licenses and validation](../public/models/SIGN-DATA.md).

Release checks: `npm run check` runs the TypeScript check, every unit test and
the production build (which now type-checks too). With the app running,
`npm run test:browser -- http://localhost:3000` drives the main flows in
Chromium; it needs Playwright installed (see `test/browser/browser.cjs`).
Start the app with an empty `GEMINI_API_KEY` for those runs so no paid AI
requests are made.

## Current camera recognition follow-up

Words now use a trained, self-hosted temporal forest covering 152/164 avatar
vocabulary entries, prepared from 2,207 real recordings. The 12 missing entries
are listed in the model metadata and data notes; they are not advertised as
pretrained. The model uses shape, hand positions and temporal features across
different durations. Completed word events go directly to the transcript after
a finish/release, rather than requiring the letters' additional 700ms hold.

The same thumbs-up used by the avatar for YES is also recognized by MediaPipe's
pretrained gesture model. A stable 500ms detection adds YES once. Transcript
status now reports collecting/matching and exposes uncertain candidates as
explicit tap-to-add suggestions. Confirmation cancels a pending auto-insert of
the same gesture. The personal studio shares the avatar's full vocabulary.

The exact deployed forest scored 563/763 (73.8%) top-choice accuracy on the
withheld source set: 176 correct auto-accepts, 12 incorrect auto-accepts and 575
rejections at the current gates. Dictionary-only classes have no independent
test set. This is still an experimental recognizer, not production accuracy.
Source-based replay and real-image gesture tests verify the recognition-to-text
path; physical-webcam and browser UI verification remain unavailable.

Verified: 76 tests, TypeScript and production build. Word weights retain their
source's academic/research restriction. Current implementation details and
rebuild commands are in [SIGN-DATA.md](../public/models/SIGN-DATA.md).

| Phase | Implemented | Details |
| --- | --- | --- |
| P1 | Dock, mode URL, portal, retained avatar/PiP, consent and camera lifecycle | [Phase 1](sign-phase-1.md) |
| P2 | Local two-hand tracker, skeleton, k-NN, vote/hold, transcript, sentence cleanup and speech | [Phase 2](sign-phase-2.md) |
| P3 | `/sign/train`, countdown recording, review/delete/undo, IndexedDB and JSON import/export | [Phase 3](sign-phase-3.md) |
| P4 | Four-beat sticky story and static mobile/reduced-motion cards | [Phase 4](sign-phase-4.md) |
| P5 | Keyboard/focus, reduced motion, responsive layouts, lazy loading and avatar power savings | [Phase 5](sign-phase-5.md) |
| Optional v2 | Local DTW worker, 30-frame word recording, separate word library and live Words mode | [Words Beta](sign-words.md) |

## What still needs work

- **Real ISL data:** 3,664 bundled poses enable A–Z and 0–9 on a fresh device
  (0 in Numbers mode only). Source-image validation accepted 336 of 356
  withheld observations correctly, rejected 20, and accepted no incorrect
  labels. Photographs from a second source were accepted far less often
  (61 of 609 in Spell, none wrong). This is not webcam accuracy.
- **Device verification:** Safari/iOS, a physical Android phone, actual camera
  permission/light behavior, audible speech, and sustained frame rates still
  need hands-on checks. Lighthouse scores in the Phase 5 notes are previous lab
  measurements; they were not rerun in this follow-up.
- **Word data:** 152 vocabulary entries now use the trained temporal model;
  12 entries still need labelled recordings. 76 dictionary-only entries need
  more signers and independent testing. See [stage 5](camera-stage-5.md).

## Bundled-data follow-up

Users no longer need to record/import samples before recognition can start.
The stage lists its actual supported signs, offers retry if loading fails, and
puts optional training/import controls under Personalize recognition. Personal
labels override their baseline templates without overflowing either dataset's
limits. Word matching uses the closest observed performance instead of averaging
different signing styles; ambiguity and unknown-motion rejection remain active.

Verified: 67 sign tests, TypeScript, production build, HTTP responses for both
bundled datasets, and separate source-observation evaluation. Physical-camera
and browser UI verification were unavailable in this follow-up. Earlier phase
notes below describe the implementation before real datasets were bundled.

## Follow-up fix

Focusing the window or refreshing the sample library restarted inference and
its stabilizer. A sign held throughout that refresh could therefore commit
twice without a release. Recognition now swaps classifiers inside the running
loop, keeps the previous classifier while a refresh is pending, and preserves
the held-letter lock. Successful reads apply new/deleted labels immediately;
failed reads disable classification, and superseded reads are ignored.

Four regression tests cover slow refreshes/double letters, changed/deleted labels,
failed/superseded reads, and leaving/reopening the stage during a read. Synthetic
geometry in those tests is isolated from the product and its sample libraries.

Verified: `npm run test:sign` (62 passing), `npm run build`, `npx tsc --noEmit`,
and `git diff --check`. The local hand model matches its documented SHA-256;
all six self-hosted WASM runtime files match the installed MediaPipe package.

## Camera-session follow-up

- Backgrounding the first-use privacy primer now preserves that primer. All
  camera request paths require acceptance; background/resume cannot bypass it.
  If localStorage is blocked, acceptance is retained across mode changes for
  the lifetime of the mounted camera hook.
- Muted/ended camera tracks turn capture off and show the paused state. Track
  listeners attach before awaiting preview playback, so a disconnect during
  startup cannot later mark the stopped stream live. Stale track events cannot
  stop a newer stream, and ended/empty video streams never report live capture.
- `pagehide` stops tracks immediately, including when the page is cached without
  React unmounting. Returning does not reopen the camera. An unfinished training
  round and browser speech also stop when leaving the page.
- Seven additional regression tests cover these lifecycle and consent cases.
  Chromium integration checks cover the desktop stage and 375px Training Studio,
  using isolated blank-canvas streams and simulated visibility, page-cache and
  mute events. Both kept the primer, stopped/detached tracks, required an explicit
  resume, and had no page errors or horizontal overflow. The training countdown
  was cancelled; the speech spy stopped; manually typed transcript text survived.

These checks do not exercise physical cameras, genuine back/forward caching on
Safari, audible speech, or recognition accuracy. No synthetic recognition samples
were saved or added to the public dataset.

## Test the next practical step

1. Run `npm run dev` and open `/sign/train`. Choose a sign you know, select its
   hand count, open the camera, and record one round. Review the saved poses.
2. Open **Live recognition**, explicitly start the camera, and hold that pose.
   A letter should commit after the vote settles and the 700 ms ring completes.
3. Hold the same sign while another window gains/loses focus without hiding the
   signing page, or while a second tab refreshes the sample library. It should
   not add the same letter again. Release for over 200 ms, then sign again to
   intentionally produce a double letter.
4. Exit with Escape and confirm the camera turns off. Test the existing
   Speak → Sign workspace and its retained avatar.
5. On first use in a fresh browser profile, open the primer, switch tabs, and
   return. It must still ask you to accept the primer before requesting video.
6. During live capture, unplug/interrupt the camera or navigate away and Back.
   Verify capture is off and only an explicit Resume/Retry starts it again.
   Repeat during a Training Studio countdown: that unfinished round must cancel.
7. For word motions, open `/sign/train/words`, record three complete examples of
   a word you know, then try `/?mode=sign&recognizer=words`. Sign once, hold the
   finish, and lower hands between words. See [Words Beta](sign-words.md).
