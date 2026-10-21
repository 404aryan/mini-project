# Independent signer validation

Stage 7 of `promptforCamera.txt` asks for consented physical-camera sessions with
Deaf ISL signers whose recordings were never used for training. This file is the
protocol, and `/sign/validate` with `scripts/evaluate-signer-validation.cjs` is
the tooling. **No independent signer session has been run yet.** No result
from this tooling exists until real sessions are recorded.

## What counts as independent

- The signer is a Deaf (or hard-of-hearing) ISL signer.
- Their recordings were never used for training or calibration. The current
  model uses ISL500 (15 signers), INCLUDE and ISLRTC dictionary recordings.
  Ask; if the signer cannot say, record "unknown". Only signers recorded as
  "No" count as unseen.
- At least 3 unseen ISL signers before any result is described as an
  independent signer evaluation. The report states this itself and keeps every
  target at "insufficient data" until then.
- A class is promoted only with at least 3 unseen signers, 15 trials and
  precision of at least 0.95 (the rule in
  [sign-data-collection.md](sign-data-collection.md)).

Interpreters, CODAs and learners can be recorded too. They appear in the
signer-type breakdown, but they never make a result independent.

## Consent (before the camera opens)

Use a written form in the signer's preferred language, explained in ISL by a
fluent signer. It should say:

1. What happens: the signer signs prompted words, letters, digits and short
   sequences in front of this app's camera for about 20–40 minutes.
2. What is kept: only which signs the app recognized, when, and its scores.
   No video, photos, face images or hand landmarks are saved. Video is
   processed on the device and discarded.
3. What it is for: measuring this app's recognition. It is not used to train
   the model. Training would need a separate consent (see the collection
   manifest).
4. Identity: results carry a code such as `s-017`, never a name. The consent
   form, kept separately by the team, links the code to the person.
5. Voluntary: the signer can stop at any time and ask for their session to be
   deleted, without giving a reason.
6. Minors need guardian consent and their own assent.

Give the consent record an ID (for example `consent-2026-0042`). The app will
not start a session without that ID and the confirmation checkbox.

## Before the session

- Run the production build with AI text cleanup disabled, on the device being
  tested. Use a clean browser profile: the validation page always ignores
  personal recordings, but a clean profile also avoids extensions and stale data.
- Plan a spread of conditions across sessions: desktop webcam and at least one
  Android and one iOS phone; bright, dim and backlit light; plain and busy
  backgrounds; left- and right-dominant signers.
- Frame the head, elbows and both hands with room to move, as in the app.

## Running a session at `/sign/validate`

1. Enter the signer code, signer type, whether their recordings were used for
   training, dominant hand, region or variant, device, lighting, background and
   the consent record ID. Choose the word set (15 priority words, or the 52 words
   that can commit automatically), repeats (3 recommended), sequences, letters,
   digits, names to fingerspell, and the non-sign duration (60 s or more per
   block).
2. Open the camera. The page uses the same tracking and recognition as the live
   app, with the shipped models only.
3. For each trial, show the prompt to the signer, press **Start trial**, let them
   sign once in their own way, wait about two seconds after the hands are
   lowered, then press **End trial**. Recognition output stays hidden while a
   trial runs, so the signer is not coached by the app.
4. Mark the trial: **Counted**; **Different sign variant** (the signer used a
   valid regional or personal variant that differs from the target; excluded
   from accuracy and counted separately); **Signing error · redo** (excluded, and
   the trial repeats); or **Skip**. Add a short note if useful, never a name.
5. Non-sign blocks run by themselves. Ask the signer to rest their hands, scratch,
   adjust hair or glasses, use a phone and wave to someone. Any sign added in
   that time is a false commit.
6. Export the session JSON at the end. Sessions stay in the browser until deleted.

Prompts are shown as text. Showing the avatar would bias the signer towards the
avatar's variant. Word sequences are gloss sequences of bundled words, not
natural ISL sentences; the app has no continuous signing model.

## Analysing sessions

```sh
node scripts/evaluate-signer-validation.cjs exports/ --json validation-report.json
```

The report gives, for Words, Spell and Numbers separately:

- isolated-sign top choice correct, and per-class precision and recall, with
  every weak class listed by name;
- automatic-commit precision **and** correct-output coverage and rejection,
  with Wilson 95% intervals and raw counts;
- duplicate and extra commits per trial;
- sequence token error rate with substitutions, insertions and deletions;
- false commits per 10 minutes of non-sign activity;
- latency from the last release (both hands leaving the picture) to the
  caption, p50 and p95, and how many commits happened before release;
- breakdowns by signer, signer type, device and lighting, with sample counts;
- the provisional targets: at least 95% word precision with at least 80%
  coverage, at most 1 false commit per 10 minutes, and p95 latency within 1 s.
  "Met" is a point estimate; read the intervals.

The same export counted twice is merged by session ID. Invalid files are
skipped and make the script exit with status 1.

## Limits of this tooling

- Latency uses the hand-count updates the recognizer publishes (accurate to
  about 120 ms) and starts when the hands leave the picture. Signers who keep their
  hands in view are reported under "committed before release".
- The page measures the Words, Spell and Numbers intents, which can commit
  automatically. Auto Preview always asks for confirmation, so for it the
  "target offered or added" rate is the useful number.
- The checks in this repository use synthetic sessions and Chromium's fake
  camera. They test the tooling and its privacy rules, not recognition accuracy.
- The tooling cannot judge whether a signer's variant is correct ISL. That
  needs a fluent Deaf reviewer, ideally present during the session.

Tooling checks recorded on 21 October 2026: `npm run check` (164 unit tests,
including 10 synthetic-session metric tests and a check that validation never
reads or watches personal recordings) and all ten browser suites (186 checks,
including the 15-check `validation` suite) pass against the production build.

## Reporting

Report the number of signers, sessions, trials per class, devices and lighting
conditions next to every metric. Do not merge these results with the
pre-extracted track results in [camera-stage-5.md](camera-stage-5.md); they
measure different things. Keep the "Experimental" labels in the app until
classes pass the promotion rule on independent signers.
