# Bundled ISL recognition data

Prepared 19 October 2026. These are labelled observations of real signs, not
illustration geometry, invented coordinates, or ASL relabelled as ISL.

## Letters and numbers

`isl-samples.json`: **3,636 reference poses**, covering **A–Z and 1–9**.
Digit 0 is not present in the source, so it is not advertised as pretrained.
Personal examples can still enable it through Training Studio.

Source: [Indian Sign Language (ISL), Prathum Arikeri, version 1](https://www.kaggle.com/datasets/prathumarikeri/indian-sign-language-isl).
Source and derived landmark dataset license: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
The images were converted to landmarks using MediaPipe 1.1.1 and the same
`hand_landmarker.task` used by the application. Translation/scale normalization
is `wrist-maxdist-v1`; hands are sorted by raw wrist x. Each observed training
pose also has a labelled horizontal reflection for left-handed signing.
The mirrored pose is an augmentation, not another independent observation.

Source archive SHA-256:
`6c5cc18850a2581c5b5a070754047478531789bc6f784b4aa4ea2e9bce3fdfd5`.
Landmarker SHA-256:
`fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`.
Original image paths are recorded in `static-provenance.json`; IDs ending in
`-mirror` derive from the corresponding unmirrored observation.

Rebuild with `python scripts/prepare-sign-data.py`. Downloads and temporary
evaluation data stay in the git-ignored `.sign-data-cache/` directory.

## Words Beta

`isl-words.json`: **60 motion references**, five each for **HELLO, THANK YOU,
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

## Validation and limits

`node scripts/evaluate-sign-data.cjs` evaluates source observations excluded
from the bundled references, using the live confidence gate of 0.8:

| Mode | Held-out observations | Accepted correct | Accepted wrong | Rejected |
| --- | ---: | ---: | ---: | ---: |
| Static | 350 | 334 | 0 | 16 |
| Words Beta | 12 | 4 | 0 | 8 |

This is a source-domain sanity check. Signer identities are not available for
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
