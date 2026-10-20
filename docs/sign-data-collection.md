# ISL word data: collection, splits and promotion rules

Stage 5 of `promptforCamera.txt`. This file is the collection manifest for the
recognition data that does not exist yet. The per-sign gap list is generated:
see the `evidence` block of each entry in
[isl-coverage.json](../public/models/isl-coverage.json) and the summary table in
[sign-vocabulary-coverage.md](sign-vocabulary-coverage.md). Results of the
current model are in [camera-stage-5.md](camera-stage-5.md).

Nothing here is a claim that data has been collected. A label is promoted only
after the measurements below exist for it.

## Consent and licensing

- Record only with informed, written consent that names every use: recording,
  landmark extraction, model training, evaluation, and whether derived models or
  landmarks will be redistributed. Signers can withdraw; their clips and every
  derived track are then removed and the model is retrained.
- Minors need guardian consent in addition to their own assent.
- Manifests store a pseudonymous signer ID and a consent record ID, never names,
  faces or contact details.
- The license must permit the intended distribution. The current word weights
  inherit ISL500's research/academic-only terms. A commercial build needs
  recordings whose terms allow it, and a retrained model.
- Video stays with the data custodian. The app only needs landmark tracks.

## Who and what to record

- Deaf ISL signers first. Interpreters, CODAs and learners are recorded as such,
  in a separate signer-type field, and are never the only signers of a class.
- Record the signer's region and the sign variant they use. Regional variants are
  separate variant IDs under one canonical concept, evaluated separately, and
  never silently merged.
- Per variant: at least 10 training signers and at least 3 further signers kept
  for testing, each with at least 5 performances across 2 or more sessions.
- Vary distance, framing, lighting, background, clothing, camera device and
  frame rate. Include left- and right-dominant signers as observed, rather than
  relying only on mirrored augmentation.
- Hard negatives: hands at rest in view, scratching, adjusting hair or glasses,
  phone use, reaching, waving to someone, and the transitions between signs.
- Confusable pairs measured in evaluation (for example EAT/FOOD, WATER/DRINK,
  SIT/CHAIR, KEY/I, YES/YOUR) need targeted recordings and a review of whether the
  pair shares one sign in ISL, in which case context, not the classifier, decides.
- Continuous signing with gloss-level boundaries is required before any claim of
  sentence recognition.

## Annotation record (one per clip)

```json
{
  "clipId": "c-000123",
  "signerId": "s-017",
  "signerType": "deaf-isl-signer",
  "sessionId": "s-017-02",
  "deviceId": "android-a14-front",
  "consentId": "consent-2026-0042",
  "license": "CC-BY-4.0",
  "canonicalId": "word:HELLO",
  "variantId": "HELLO/v1",
  "variantReference": "ISLRTC dictionary entry, region noted by reviewer",
  "region": "Maharashtra",
  "dominantHand": "right",
  "handCount": 1,
  "signStartMs": 640,
  "signEndMs": 1810,
  "nonManual": { "eyebrows": "neutral", "mouth": "none", "head": "none" },
  "quality": ["hand-partly-out-of-frame"],
  "annotator": "a-03",
  "reviewers": ["r-01", "r-04"],
  "reviewStatus": "agreed"
}
```

Two Deaf ISL reviewers check each variant. Disagreements stay unresolved and the
clip is excluded from training and test until they are settled.

## Split rules

- Assign whole signers to train, calibration or test before extracting windows.
  Every window, crop, mirror and other augmentation of a clip inherits that clip's
  partition, so no source performance appears on both sides.
- Calibration signers select acceptance gates and hyperparameters. Test signers
  are used once, to report the chosen model.
- Classes whose only data is a single dictionary recording are trained but have no
  independent evaluation. They stay suggestion-only.
- Animation renders of the avatar are not training or test data. They may be
  used only as separately labelled supplementary material after a measured
  domain-transfer check.

## Promotion rule for a word class

A class may be described as evaluated only when its held-out test set contains
at least 3 unseen signers and 15 clips. Its precision at the runtime gates must be
at least 0.95 on that test set, and its recall is reported next to it. Classes
below that stay experimental. Adding a label to a JSON file is not completion.

## Reproducing the current model

```sh
pip install -r scripts/sign-training-requirements.txt
python scripts/train-word-model.py            # downloads public sources into .sign-data-cache/
python scripts/train-word-model.py --cached   # retrains from cached tracks only
python scripts/evaluate-word-model.py         # re-scores the shipped binary
node scripts/check-word-recognition.cjs       # replays held-out tracks end to end
npm run coverage:sign                         # refreshes the coverage/gap report
```

`public/models/temporal-provenance.json` lists each track with its partition and
SHA-256; `public/models/isl-temporal-model.json` records the dataset digest, the
model digest, the partitions and the calibrated gates.
