# Bundled ISL recognition data

Prepared 19 October 2026; retrained and extended on 20 October 2026
([stage 5](../../docs/camera-stage-5.md)). These are labelled observations of real signs, not
illustration geometry, invented coordinates, or ASL relabelled as ISL.

## Letters and numbers

`isl-samples.json`: **3,664 reference poses**, covering **A–Z and 0–9**.
3,636 come from the source below. Digit 0 is not in that source; its 28
references (14 photographs and their reflections) come from
[Hambir et al., A Multimodal Indian Sign Language Dataset for English and Marathi Alphabets, Mendeley Data v1](https://data.mendeley.com/datasets/2tj6c7pzfk/1),
doi:10.17632/2tj6c7pzfk.1, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Those samples carry their own `license`, `source` and `attribution` fields,
which import, storage and export preserve.

That dataset's digit-0 photographs are byte-identical to its letter-O
photographs, so digit 0 is recognized only in Numbers mode, which compares
digit references only. Spell and Auto do not offer 0.

Source: [Indian Sign Language (ISL), Prathum Arikeri, version 1](https://www.kaggle.com/datasets/prathumarikeri/indian-sign-language-isl).
Source and derived landmark dataset license: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
The images were converted to landmarks using MediaPipe 1.1.1 and the same
`hand_landmarker.task` used by the application. Translation/scale normalization
is `wrist-maxdist-v1`; hands are sorted by raw wrist x. Each observed training
pose also has a labelled horizontal reflection for left-handed signing.
The mirrored pose is an augmentation, not another independent observation.
Two-hand poses also carry `relation`: the second wrist relative to the first,
in mean hand-size units, because the hand shapes are each wrist-centred and
otherwise lose where the hands are. Recognition adds it to the distance with
`RELATION_WEIGHT` (lib/sign/knn-classifier.ts). Older personal samples without
it are still matched on hand shape alone.

Source archive SHA-256:
`6c5cc18850a2581c5b5a070754047478531789bc6f784b4aa4ea2e9bce3fdfd5`.
Landmarker SHA-256:
`fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`.
Original image paths are recorded in `static-provenance.json` (the digit-0
photographs, with SHA-256 hashes, under `additional`); IDs ending in
`-mirror` derive from the corresponding unmirrored observation.

Rebuild with `python scripts/prepare-sign-data.py`. Downloads and temporary
evaluation data stay in the git-ignored `.sign-data-cache/` directory.

## Current Words Beta model

Live word recognition loads `isl-temporal-model.json` and the 5.24 MB
`isl-temporal-forest.bin`: 64 trained decision trees covering **152 of the
avatar's 164 vocabulary entries** (150 distinct word classes; HOUSE shares
HOME and BEGIN shares START). Training uses real hand tracks, spatial/temporal
features, and explicitly labelled camera/left-handed augmentations.

The corpus has 10,756 real recordings from all 15 ISL500 signers plus the
dictionary, INCLUDE and canonical-motion sources, split by signer before
training: 6,549 train, 1,471 calibration (signers 12 and 13) and 2,736 test
(signers 4, 5, 14, 15 and separate INCLUDE clips). The five variants of an
observed training recording are augmentations, not five independent recordings.

Acceptance gates (0.56 confidence, 0.15 margin) and the 52 classes allowed to
add themselves automatically were chosen on calibration signers only. On the
untouched test signers, the exact shipped forest with the live trailing
windows chose the right word for **2,382/2,736 (87.1%)** clips and committed
**1,146 correct and 19 wrong** (98.4% precision, 41.9% coverage); a rejected
clip can still be offered as a tap-to-add suggestion. The previous model scored 774 correct
and 93 wrong on the same signers. Per-class results, confusions and per-signer
breakdowns are in `word-evaluation.json`; weak classes such as GOOD/OFFICE
are listed in [stage 5](../../docs/camera-stage-5.md). Dictionary-only classes
have no independent evaluation and never auto-commit. These are source-domain
results, not physical-webcam validation. Words remain experimental.

The recognizer considers different movement durations and commits completed
words after a finish/release, without passing them through the letters' 700 ms
hold gate. A shorter window counts only when the whole buffered sign has the
same top word. Uncertain candidates appear as **Possible match · tap to add**;
they are inserted only after explicit confirmation. Confirmed/committed words
cannot auto-insert again until the hands are lowered.

The avatar's **thumbs-up → YES** gesture has an additional learned classifier:
[MediaPipe Gesture Recognizer](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js).
A `Thumb_Up` score of at least 0.7 held for 500 ms inserts YES once. This is an
explicit app gesture matching the avatar, not a claim that every ISL dialect
uses the same YES motion. Other canned hand gestures are not relabelled as ISL.
The detector is self-hosted as `public/mediapipe/gesture_recognizer.task`:
`https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task`
(SHA-256 `97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482`).

Sources for the expanded model:

- [ISL500 / ISL-DATA](https://huggingface.co/datasets/ISL500/ISL-DATA): research/academic use only; users 4, 5, 12–15 excluded from training.
- [ISLRTC dictionary re-encode](https://huggingface.co/datasets/Vignesh3816/Indian_Sign_Language_Data.gov_Rencoded): MIT-labelled release, with original ISLRTC/data.gov.in attribution retained.
- [INCLUDE, AI4Bharat](https://huggingface.co/datasets/ai4bharat/INCLUDE): CC BY 4.0; parent, brother, clothes and park recordings, with separate clip holdouts.
- [ISL canonical motion v1](https://www.kaggle.com/datasets/hariragavendramg/isl-canonical-motion-v1): CC0-labelled release of ISLRTC-derived coordinates; KEEP source verified against the publisher's checksum audit.

The **combined word weights inherit the research-only ISL500 restriction**.
`temporal-provenance.json` lists every real track with its signer, partition and SHA-256. For a
commercial deployment, retrain from appropriately licensed recordings.

Remaining vocabulary without usable labelled recordings: **NEED, TOILET, TELL,
PROJECT, HOW, HOW MUCH, COME IN, GO OUT, BRING, NEED HELP, WAIT MINUTE, BECAUSE**.
The app does not advertise these as pretrained. They can be trained in the
personal studio, which now uses the same 164-entry vocabulary as the avatar.
Broader CISLR access requires approval; no gate or access condition was bypassed.

Rebuild with `python scripts/train-word-model.py`; after data preparation,
`python scripts/train-word-model.py --cached` reuses the real tracks. Evaluate
the exported runtime artifact with `python scripts/evaluate-word-model.py` and
the live word-to-transcript flow with `node scripts/check-word-recognition.cjs`.
Temporary downloads and tracks stay in `.sign-data-cache/` and are not shipped.

## Legacy word templates

The compatibility file `isl-words.json` retains **60 motion references**, five each for **HELLO, THANK YOU,
PLEASE, WATER, YES, NO, GOOD, WAIT, GO, EAT, DRINK, SCHOOL**. The other Training
Studio slots remain available for personal recordings, and are not listed as
built-in words. HELP candidates did not meet the continuous-tracking criterion
and were excluded rather than padded with fabricated hand poses.

Source: [ISL500 / ISL-DATA](https://huggingface.co/datasets/ISL500/ISL-DATA).
**The source permits research and academic use only; contact its authors for
commercial use. These word references inherit that use restriction.** This is
separate from the CC BY-SA static alphabet/number dataset above. For a commercial
distribution, replace `isl-words.json` with appropriately licensed recordings.

Only real hand coordinates from the source's `intermediate` HDF5 array are
used. A consistent, continuously detected hand count must persist for at least
1.4 seconds. Coordinates are interpolated to the runtime's 30-frame format,
wrist-normalized and encoded with the actual wrist trajectory. Missing hands
are never invented. Filenames and per-source checksums are in
`word-provenance.json`. Rebuild with `python scripts/prepare-word-data.py`.

## Legacy/static validation and limits

`node scripts/evaluate-sign-data.cjs` evaluates source observations excluded
from the bundled references, using the live confidence gate of 0.8. It exits
with an error when the cached held-out files are missing, so a fresh checkout
cannot report an empty evaluation as a pass:

| Mode | Held-out observations | Accepted correct | Accepted wrong | Rejected |
| --- | ---: | ---: | ---: | ---: |
| Static | 356 | 336 | 0 | 20 |
| Words Beta | 12 | 4 | 0 | 8 |

The same script also scores the second source's other photographs (A–Z and
1–9 from other participants and another camera): in Spell, 61 of 609 accepted
correctly, 0 wrongly, 548 rejected (top choice correct for 434); in Numbers,
41 of 154 digits accepted, 0 wrongly (top choice correct for 149). The bundled
letters and digits therefore transfer only partly to a new source at the live
gate.

The held-out rows are a source-domain sanity check. Signer identities are not available for
the static image source; images may be correlated or augmented. Word holdouts
are separate source recordings, not a signer-independent test. These numbers
are not webcam accuracy, accessibility certification, or evidence of broad
generalization. Words remain experimental and frequently reject unfamiliar
motions; use letters/numbers for the stronger baseline. Real camera testing on
new signers and devices is still required. No physical-camera or browser UI
verification was available in this session.

The runtime does not fetch datasets from Kaggle or Hugging Face. Both JSON files
are served by this app and automatically loaded; camera frames stay on-device.
Personal recordings remain in IndexedDB and override a trained baseline label.
Dataset merging preserves the existing 5,000-pose / five-word-recordings-per-label
limits without deleting any saved user samples.
