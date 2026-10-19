# Sign → Text — Phase 3

Training Studio is available at <http://localhost:3000/sign/train>.
Run `npm run dev` if the server is not already running.

## Try a recording

1. Choose an A–Z or 0–9 label for an ISL sign you know. Select two hands (the
   default) or one hand to match that sign. No camera is requested on page load.
2. Open the camera. First use shares the same privacy primer as live recognition.
   Only the camera is requested, never microphone access.
3. Press **Record [label] samples**. The 3–2–1 countdown gives you time to get
   ready. The recorder then accepts up to 12 steady poses, at least 250 ms apart.
   It needs 200 ms of stable normalized features and the selected hand count.
   An eight-second capture timeout ends the round if it cannot collect 12 poses.
4. Completed poses save to IndexedDB. The label grid and library counts update
   after the transaction commits. A label needs at least three saved samples for
   the existing classifier. Capture several rounds with modest angle/distance
   changes to improve coverage. This remains a personal static-sign classifier;
   counts do not certify an ISL label or its recognition accuracy.
5. Review the reconstructed landmark thumbnails. They are not photographs, and
   the two hands are drawn separately because features are wrist-centered per
   hand. Delete individual poses or the selected label’s poses. **Undo last
   deletion** restores the last removed group during the current visit.
6. Choose **Live recognition**. Device samples load automatically. The deep link
   selects Sign → Text but still waits for a tap before starting the camera.
   Show the trained pose to use the existing vote and 700 ms hold-to-commit flow.

Cancel/Escape, stopping the camera, hiding the page, or leaving the route cancels
an unfinished round. No partial poses from that cancelled round are saved. An
already completed save can finish during navigation.

## Storage and backups

- IndexedDB database: `yap-render-sign`, version 1; object store: `datasets`;
  record key: `user`. A recording/import merges inside one read/write transaction.
  Successful UI notices follow transaction completion, not individual requests.
- Recordings and imports are available after reload, and live recognition combines
  them with `/public/models/isl-samples.json`. Same-tab events and BroadcastChannel
  refresh active views; focusing a window also refreshes the library.
- **Export JSON** downloads `isl-samples.json` containing all device samples and
  any unsaved round. **Import JSON** merges compatible samples. Identical sample
  IDs/poses are kept once; IDs with different labels/features reject the whole
  import. Existing saved poses are preserved on invalid files or failed writes.
- File format remains version 1 with `wrist-maxdist-v1` normalization. Samples have
  `id`, `label`, and 126 `features`; recordings also include optional millisecond
  `recordedAt`. Old Phase 2 files without that timestamp still import.
- Limits: 5,000 samples and a 25 MB input file. The file limit accommodates a full
  library exported as readable JSON. Keep a backup before clearing browser data;
  device storage is specific to the browser and site origin.
- If a completed round cannot be saved, it remains visibly **unsaved**. Retry,
  export it, or discard that round. It is not counted as saved or used by live
  recognition until the write succeeds.
- No camera frames, photos, audio, or landmark samples are uploaded. The only
  optional text API remains the sentence-cleanup feature from Phase 2.

The bundled `public/models/isl-samples.json` remains intentionally empty because
no validated ISL corpus has been supplied. Training does not invent a default
dataset. You can export a reviewed real dataset as `isl-samples.json` and use it
as that public file when preparing a curated deployment.

## Verification

- `npm run test:sign`: 37 passing native Node tests, including countdown timing,
  selected hand count, stability gates, frame gaps, timeout, unique sample IDs,
  normalized feature fidelity, metadata, safe merging, and training-camera guards.
- `npx tsc --noEmit`, `npm run build`, and `git diff --check` pass. The existing
  Next configuration skips build-time type checks, so TypeScript is run separately.
- Chromium browser checks in isolated profiles exercised real MediaPipe detection
  on the [official two-hand image](https://storage.googleapis.com/mediapipe-assets/right_hands.jpg)
  painted into a test video stream: 12 poses recorded and saved, reload persistence,
  deletion/undo, JSON export/import, duplicate import, conflicting-ID rejection,
  and cross-tab refresh.
- The test library loaded into live recognition and committed its test label once
  while held. That label was assigned solely to exercise the pipeline and is not
  claimed as an ISL annotation. Isolated contexts were closed afterward; their
  test samples were not put into the main browser profile or public dataset.
- A simulated quota error preserved the existing 12 saved poses, retained the
  next 12 as unsaved, then saved all 24 after retry. Cancelling a countdown and
  backgrounding another round left their label count at zero and stopped tracks.
- No POST requests occurred during capture, storage, export/import, or recognition.
  Exported sample fields were limited to ID, label, features, and timestamp.
- Desktop and 375 × 812 layouts were inspected; neither overflowed horizontally.
  No application console errors were observed. Physical camera behavior, audible
  speech, Safari/Edge, and Android performance still need real-device checks.

Phase 4 (scrollytelling) is now documented in [sign-phase-4.md](sign-phase-4.md).
Phase 5 is implemented; see [sign-phase-5.md](sign-phase-5.md). Current remaining
data/device checks and follow-up fixes are listed in [sign-status.md](sign-status.md).
