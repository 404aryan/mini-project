# Words Beta — local sequence matching

The optional v2 path is implemented alongside the existing static letters/numbers.
It provides 20 selectable word training slots, not 20 pretrained ISL translations.
No validated word recordings are bundled; an untrained device reports zero words.

## Try it

1. Run `npm run dev` and open `/sign/train/words`. The original `/sign/train`
   screen links to it under **Words · Beta**.
2. Choose a word whose ISL motion you know. Select one or two hands and keep the
   same hand count throughout the motion and across at least three recordings.
   Labels do not teach a sign or certify that a recording is correct ISL.
3. Explicitly open the camera. First use shares the existing privacy primer.
   Press **Record [word] motion**, wait for 3–2–1, sign once over about two seconds,
   and hold the finish while the remaining frames are captured.
4. Each completed motion contains 30 actual inference frames, sampled no faster
   than about 15 Hz. A slower device can take longer. Missing hands, frame stalls,
   still poses, cancellation and timeout cannot create a saved partial motion.
5. Record at least three complete examples with the same hand count. Keep up to
   five recordings per word. Review each sequence with its frame slider; remove a
   poor recording and use Undo during the visit if needed.
6. Open **Live word recognition**, or visit `/?mode=sign&recognizer=words`.
   The deep link selects Words but still requires a deliberate camera tap.
7. Bring the selected number of hands into frame, perform a trained motion over
   roughly two seconds, and hold its finish. A confident match uses the existing
   frame vote and 700 ms hold ring before adding the word.
8. Lower your hands for over 200 ms between words, then perform the next complete
   motion. Moving back to the finish of an already recognized word cannot count
   as a new performance. Switching to **Letters & numbers** retains the transcript.

The beta badge and trained counts reflect the selected vocabulary. Words enter
the transcript as editable character tokens, with spaces inserted between words.
Backspace, clear, copy, sentence cleanup, English/Hindi voice selection and the
1,200-character limit continue to use the existing text-only flow.

## Recognition and performance

- `DtwSignRecognizer` implements `SignRecognizer`. It matches rolling 30-frame
  windows against recorded references using a constrained DTW path (band width
  six). The two closest references for each label contribute to its score.
  Ambiguous labels, unknown motion, wrong hand counts and still windows are
  rejected. Scores are heuristic similarity, not calibrated probabilities.
- The 126 existing wrist-centered, hand-size-normalized pose coordinates are
  retained per frame. Six additional coordinates record each wrist's movement
  relative to the sequence's initial wrist and hand size. This preserves motion
  that per-frame wrist normalization alone removes. Missing hands are padded;
  raw wrist-x sorting is reused, never handedness labels or mirrored pixels.
- DTW comparisons run in a local Web Worker, loaded only for Words mode. The
  inference loop keeps video, overlays and feature collection outside React.
  Queries are throttled, with only one pending query. Stale replies after release,
  dataset changes or camera pause are discarded. The worker terminates on exit,
  route departure or vocabulary change. A worker failure is shown explicitly.
- A full 20-word/five-reference synthetic Node microbenchmark took about 29 ms
  per synchronous match on this machine, motivating the worker. That benchmark
  is not a camera FPS measurement. MediaPipe still uses the existing on-device
  tracker; no physical Android/iPhone frame-rate guarantee is claimed.

This is a personal matcher for a small vocabulary. Timing, viewpoint, hand
occlusion, crossing wrists and recordings with similar motion can limit accuracy.
It does not provide general sign-language understanding, grammar or certified
ISL recognition. Genuine annotated data and community validation are still needed.

## Storage and interchange

- Word recordings use the separate IndexedDB database `yap-render-words`, version
  1, object store `datasets`, record `user`. Static samples and their file format
  remain unchanged. Same-tab, BroadcastChannel and focus updates refresh words.
- Export/import uses `isl-words.json`. Imports merge transactionally, keep identical
  IDs once, and reject conflicting IDs without replacing saved recordings. A failed
  save retains an explicitly unsaved motion for retry/export/discard.
- The versioned format is `{ "version": 1, "normalization":
  "sequence-wrist-motion-v1", "samples": [] }`. Each sample has `id`, one of the
  supported `label` values, `handCount` (1/2), `durationMs` (1400–5000), 30 `frames`
  of 132 finite numbers, and optional millisecond `recordedAt`.
- Each frame's first 126 numbers use `wrist-maxdist-v1`; the last six use initial
  hand-size units for wrist trajectories. The first frame's wrist displacement
  is zero. Word files are capped at 100 recordings / five per label and 12 MB.
- `/public/models/isl-words.json` is intentionally empty. A reviewed real export
  can populate it for a curated deployment; do not substitute test geometry or
  an arbitrary label on a fixture image for an ISL dataset.

Video/images are not saved. Nothing is uploaded during recording, recognition or
import/export. Worker messages stay on the device. Only the existing optional
sentence-cleanup request sends text characters and language to the server.

## Verification

- `npm run test:sign`: 62 passing tests. New cases cover trajectory normalization,
  DTW speed variation/direction, ambiguity/rejection, minimum consistent references,
  sequence validation/merging, real-frame capture gates, word repeat locking,
  async/stale results, vocabulary switching, library refresh and transcript limits.
- `npm run build`, `npx tsc --noEmit`, and `git diff --check` pass.
- Isolated Chromium integration used actual MediaPipe detection on a moving video
  of the official two-hand fixture. Three 30-frame sequences were recorded/saved;
  reload persistence, delete/undo, JSON export, duplicate import, conflicting-ID
  rejection, the actual worker and a live word commit were exercised.
- The fixture was assigned HELLO solely to test the pipeline, not as an ISL
  annotation. Contexts were discarded afterward. Test recordings were never put
  into the user's browser profile or either public dataset. No POST requests or
  page errors occurred during those checks; tracks stopped on exit.
- Desktop and 375 × 812 layouts were inspected, including the review cards. No
  horizontal overflow occurred. Device accuracy, real camera behavior, Safari/iOS,
  physical Android performance and audible speech remain manual checks. Earlier
  Lighthouse/axe measurements were not rerun for this v2 feature.
- A production-server check loaded the emitted worker successfully, confirmed
  zero word workers on the initial landing page, and observed worker termination
  when switching back to letters. The production word-training route also loaded
  without page errors.
