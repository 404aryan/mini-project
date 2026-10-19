# Sign → Text — current status

Checked against the working tree on 19 October 2026. All five phases have an
implementation. Recognition now automatically loads bundled real ISL samples.
See [dataset sources, licenses and validation](../public/models/SIGN-DATA.md).

| Phase | Implemented | Details |
| --- | --- | --- |
| P1 | Dock, mode URL, portal, retained avatar/PiP, consent and camera lifecycle | [Phase 1](sign-phase-1.md) |
| P2 | Local two-hand tracker, skeleton, k-NN, vote/hold, transcript, sentence cleanup and speech | [Phase 2](sign-phase-2.md) |
| P3 | `/sign/train`, countdown recording, review/delete/undo, IndexedDB and JSON import/export | [Phase 3](sign-phase-3.md) |
| P4 | Four-beat sticky story and static mobile/reduced-motion cards | [Phase 4](sign-phase-4.md) |
| P5 | Keyboard/focus, reduced motion, responsive layouts, lazy loading and avatar power savings | [Phase 5](sign-phase-5.md) |
| Optional v2 | Local DTW worker, 30-frame word recording, separate word library and live Words mode | [Words Beta](sign-words.md) |

## What still needs work

- **Real ISL data:** 3,636 bundled poses enable A–Z and 1–9 on a fresh device.
  Source-image validation accepted 334 of 350 withheld observations correctly,
  rejected 16, and accepted no incorrect labels. This is not webcam accuracy.
  Digit 0 still needs a personal recording or another genuine dataset.
- **Device verification:** Safari/iOS, a physical Android phone, actual camera
  permission/light behavior, audible speech, and sustained frame rates still
  need hands-on checks. Lighthouse scores in the Phase 5 notes are previous lab
  measurements; they were not rerun in this follow-up.
- **Word data:** 60 ISL500 recordings enable 12 words, with 20 personal training
  slots. Words remain experimental: 4 of 12 withheld source motions matched;
  8 were rejected and none were incorrectly accepted. ISL500 is licensed for
  research/academic use only. See the data notes before commercial distribution.

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
