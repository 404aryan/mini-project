# Camera upgrade: stage 5 (real data, training and coverage)

Implemented on 20 October 2026 from `promptforCamera.txt`. Stages 1–4, the
avatar animation library and saved personal recordings are unchanged. The
collection protocol for the data that does not exist yet is
[sign-data-collection.md](sign-data-collection.md); per-sign evidence and gaps
are in the regenerated [coverage report](sign-vocabulary-coverage.md).

Nothing here is general webcam accuracy or Deaf signer validation. All numbers
below are measured on pre-extracted landmark tracks or still photographs.

## Word model: signer-disjoint retraining

The temporal forest keeps its feature schema (`hand-temporal-stats-v1`, the
same 135-value hand frames and 2,160-value embedding the browser computes) and
its normalization. Only its data, split and acceptance rules changed.

- **Data:** all 15 ISL500 signers instead of 5 (every first-round clip; the
  `_mnt_` second-round copies are excluded), plus the existing ISLRTC
  dictionary, INCLUDE and canonical-motion recordings: 10,756 real tracks.
- **Split, fixed before evaluation and by signer:** train = ISL500 signers 1–3
  and 6–11, dictionary sources and INCLUDE train clips (6,549 tracks);
  calibration = signers 12–13 (1,471); test = signers 4, 5, 14, 15 and the
  separate INCLUDE clips (2,736). Each augmentation inherits its clip's side.
  `public/models/temporal-provenance.json` lists every track with its
  partition and SHA-256; a unit test checks that no signer or source crosses
  partitions and that the dataset and model digests match.
- **Gates and auto-accept classes are chosen on calibration only.** The gate
  search keeps calibration precision at or above 0.95 (chosen: confidence 0.56,
  margin 0.15). A class may add itself automatically only with at least 3
  training signers, 10 calibration clips and calibration precision of 0.95.
  52 classes qualify. Every other class, including all dictionary-only
  classes, is offered only as a "Possible match · tap to add" suggestion.
- **Scoring mirrors the browser.** Evaluation uses the exact float32 node table
  that ships and the live recognizer's trailing windows. The new
  `chooseWindow` rule in `lib/sign/temporal-forest.ts` (mirrored by
  `Scored.decide` in the training script) accepts a shorter window only when
  the whole buffered sign has the same top label.
- **Size:** 64 trees, 131,008 nodes, 5.24 MB (previously 96 trees, 2.95 MB).
  It loads when word recognition starts, under the existing 60 s deadline.

### Before and after on the same unseen test signers

The previous model trained on ISL500 signers 1–3, so signers 4, 5, 14, 15 and
the INCLUDE test clips are unseen by both models. Scored on all 2,736 test
clips with each model's own runtime selection:

| Model | Top choice correct | Accepted correct | Accepted wrong | Precision | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| Previous (0.55/0.15, any window) | 2,138 (78.1%) | 774 | 93 | 89.3% | 28.3% |
| Retrained, all classes at its gates | 2,382 (87.1%) | 1,487 | 66 | 95.7% | 54.4% |
| Retrained, shipped (agreement + auto-accept list) | 2,382 (87.1%) | 1,146 | 19 | 98.4% | 41.9% |

Coverage is accepted-correct / clips. Rejected clips are not lost in Auto: each
still offers its candidates for confirmation. Without the window-agreement rule
the shipped model would accept 1,145 correctly and 53 wrongly, so agreement
removes 34 wrong commits for one correct one.

Per test signer (accepted correct / wrong / clips): signer 4 310/11/709,
signer 5 112/2/339, signer 14 309/5/832, signer 15 415/1/852, INCLUDE 0/0/4.
Signer 5 has the lowest coverage (33%).

### End-to-end replay

`node scripts/check-word-recognition.cjs` replays held-out raw landmarks through
`TemporalWordRecognizer`, `chooseWindow` and the transcript writer. The replay
set is now every test clip of the 15 priority words that has ISL500 data:
459 clips (12 words; WANT, SORRY and COME have only a dictionary recording).

| Model | Correct transcript | Wrong | Rejected |
| --- | ---: | ---: | ---: |
| Previous | 165 (35.9%) | 20 | 274 |
| Retrained | 204 (44.4%) | 0 | 255 |

Per word, retrained (previous): HELLO 30/37 (22), YES 33/37 (7), NO 31/39 (26),
GOOD 35/38 (27, plus one OFFICE), BAD 24/41 (12), GO 16/38 (10), PLEASE 18/37 (14),
HELP 17/38 (3), THANK YOU 0/38 (8), WATER 0/38 (23, plus 7 DRINK),
DRINK 0/40 (13, plus 6 WATER), EAT 0/38 (0, plus 6 FOOD). 0 wrong is measured
on these 459 clips only. Average forest query 0.22 ms, maximum 3.16 ms in Node.

### YES → YOUR diagnosis

The earlier replay's wrong output came from ISL500 signer 5,
`Yes__session144__clip015`. Its windows scored (shortest first)
YOUR 0.68, YES 0.37, YES 0.41, YES 0.39. Only the 0.6 s tail passed the gates,
and the old worker accepted the most confident passing window, so the ending of
YES was committed as YOUR. Lowering thresholds would not have fixed this. The
agreement rule rejects that fragment (YOUR remains an optional suggestion), and
with more training signers the retrained model picks YES as the top choice for
all 37 test YES clips. That clip now replays as YES.

### Why many correct top choices are still rejected

The rejections are not fixed by lowering thresholds; the evidence points at data:

- **Confusable pairs:** EAT → FOOD (23 test clips), SIT → CHAIR (18),
  DRINK → WATER (14), FOOD → EAT (12), BUS → CAR (11), KEY → I (10). These
  need a Deaf ISL review of whether each pair shares one sign, in which case
  context rather than the classifier must decide.
- **Variant differences between signers:** THANK YOU is the top choice for
  24/38 test clips but only 3/22 calibration clips, where signers 12–13 were
  read as HAPPY or SCHOOL. That looks like a signing variant, so it stays a
  suggestion until the variant is reviewed and recorded.
- **No independent signer:** 76 word entries are trained only from ISLRTC
  dictionary recordings (one per word; two for seven words) and cannot be
  evaluated or auto-accepted. WANT, SORRY and COME are among them.
- **Calibration size:** two calibration signers keep 52 classes. More
  calibration signers are needed to promote more classes safely.

### Weak classes found by the untouched test

Three auto-accept classes fail the promotion rule (test precision 0.95 with 3+
signers and 15+ clips). They are reported, not retuned on the test signers:

- **GOOD:** recall 0.89 but precision 0.77; 9 OFFICE test clips were accepted
  as GOOD (calibration had no such error).
- **OFFICE:** precision 0.75; 9 of its clips accepted as other words.
- **MARKET:** 36/37 top choices correct but none passed the gates on test.

The coverage report marks them `auto-accept-below-test-target`. In Auto they
still need confirmation; in the isolated Words override they can commit, so
GOOD/OFFICE are the first pair for targeted calibration recordings.

## Letters and numbers: digit 0 and a cross-source test

Digit 0 now has real bundled data from
[Hambir et al., Mendeley Data v1](https://data.mendeley.com/datasets/2tj6c7pzfk/1)
(CC BY 4.0, license checked on the record page; each sample carries its own
license, source and attribution). 14 of its 20 unique photographs train it
(with labelled reflections, 28 references) and 6 are held out. The other
3,636 bundled poses are unchanged byte for byte.

**The digit-0 photographs are byte-identical to the same dataset's letter-O
photographs** (all 19 unique O files match a 0 file). The handshape alone
cannot separate them, and with 0 in the spelling set, 12 of 19 cross-source O
photographs were accepted as 0. Digit 0 is therefore offered only with Numbers
intent (`NUMBERS_INTENT_ONLY` in `lib/sign/knn-classifier.ts`). Numbers mode
now compares only digit references, so a digit cannot lose to a letter with
the same handshape; Spell and Auto exclude 0. The coverage report lists 0 as
`numbers-intent-only`.

Every other photograph of that source is a cross-source test of the bundled
library: other participants (four in that release), another camera and
background. `node scripts/evaluate-sign-data.cjs` scores it at the live 0.8 gate:

| Set | Photographs | Top choice correct | Accepted correct | Accepted wrong | Rejected |
| --- | ---: | ---: | ---: | ---: | ---: |
| Same-source holdout (all labels) | 356 | | 336 | 0 | 20 |
| Cross-source, Spell (A–Z, 1–9) | 609 | 434 (71%) | 61 | 0 | 548 |
| Cross-source, Numbers (1–9) | 154 | 149 (97%) | 41 | 0 | 113 |

Digit 0's own 6 holdouts: 2 accepted, 4 rejected (confidence 0.71–0.78), none
wrong. The cross-source result is the important one: the static baseline's
top choice transfers moderately, but the gate rejects about 90% of another
source's photographs. Its distance-based confidence is not calibrated across
cameras and signers, and 24 of 35 letters/digits had no accepted photograph.
Signer-identified recordings are needed before any static class is called
evaluated (see the collection manifest). The cross-source photographs are kept
out of the bundle so they stay a test.

## Coverage and collection manifest

`npm run coverage:sign` derives each entry's evidence from the shipped model,
`word-evaluation.json` and provenance: train/calibration/test clips and
signers, held-out recall and precision, main confusions and a concrete
collection need. Word status: 50 `evaluated-auto-accept`,
3 `auto-accept-below-test-target`, 23 `evaluated-suggestion-only`,
76 `trained-unevaluated` and 12 `no-real-data` (NEED, TOILET, TELL, PROJECT,
HOW, HOW MUCH, COME IN, GO OUT, BRING, NEED HELP, WAIT MINUTE, BECAUSE).
All 36 letters/digits have bundled image data; none has a signer-disjoint test.
No entry is `verifiedForGeneralUse`.

## Files

- `scripts/train-word-model.py`: all signers, fixed signer partitions,
  calibration gates, per-class auto-accept, provenance hashes,
  `word-evaluation.json`, replay set of the priority words.
- `scripts/evaluate-word-model.py`: re-scores the shipped binary on the test
  signers and fails if it differs from the recorded metadata.
- `scripts/check-word-recognition.cjs`: optional model arguments for
  before/after replays, per-word results.
- `scripts/prepare-sign-data.py`: Mendeley digit 0 (range requests, no 1.3 GB
  download), cross-source test file, per-source provenance.
- `scripts/evaluate-sign-data.cjs`: cross-source Spell and Numbers reports.
- `lib/sign/temporal-forest.ts`, `word-matcher.worker.ts`: `autoAccept`,
  `top`, `chooseWindow`.
- `lib/sign/knn-classifier.ts`, `use-sign-recognition.ts`: intent label filters.
- `scripts/generate-vocabulary-coverage.cjs`, `components/sign/vocabulary-coverage.tsx`:
  evidence, promotion rule, numbers-only status.
- `public/models/`: retrained forest and metadata, `word-evaluation.json`,
  `temporal-provenance.json`, `isl-samples.json`, `static-provenance.json`,
  `isl-coverage.json`.
- Tests: `test/sign-training-data.test.cjs`, `test/sign-temporal.test.cjs`,
  `test/sign-data.test.cjs`.

## Verification

Run `npm run check` (coverage freshness, TypeScript, unit tests, production
build) and the browser suites against a production server. With the cached
data: `python scripts/evaluate-word-model.py` (must match the metadata),
`node scripts/check-word-recognition.cjs` and `node scripts/evaluate-sign-data.cjs`.
Retraining: `python scripts/train-word-model.py --cached` after the first
full run (about 9 minutes on a 4-core laptop). Logs from this run are in
`.sign-data-cache/temporal-training-stage5.log` and
`static-build-stage5.log` (git-ignored local evidence).

## Remaining limitations and next dependency

- The word weights still inherit ISL500's research/academic-only terms.
- Two calibration signers and four test signers are a small population; there
  is no regional-variant labelling and no Deaf ISL review of any class.
- No continuous signing data, so Auto stays confirmation-only (stage 4 gate).
- Face/body observations still do not feed the classifier; that needs
  annotated recordings in the `signer-frame-v2` schema.
- Static letters/numbers have no signer-identified test set.
- Next: consented recordings per the collection manifest (12 missing words,
  the confusable pairs above, GOOD/OFFICE calibration, signer-identified
  letters and digits), then stage 6 transcript semantics.
