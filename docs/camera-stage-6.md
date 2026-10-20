# Camera upgrade: stage 6 (transcript, correction and sentence output)

Implemented on 21 October 2026 from `promptforCamera.txt`. Stages 1–5, the
avatar animation library, model weights and saved personal recordings are
unchanged. This stage changes what happens after a sign is committed; it does
not change what is recognized or how accurately.

## Committed sign events

Every committed recognition now carries a `SignEvent` (`lib/sign/types.ts`):

| Field | Meaning |
| --- | --- |
| `kind` | `word`, `letter` or `number` |
| `canonical` | Namespaced vocabulary ID, e.g. `word:THANK_YOU`, `letter:I` |
| `text` | Readable text shown in the transcript, e.g. `THANK YOU` |
| `source` | `word-model`, `personal-words`, `thumbs-up-shortcut` or `letters-numbers` |
| `commit` | `automatic` (hold or the model's calibrated gate) or `confirmed` (the user tapped it) |
| `startedAt`, `endedAt` | Wall-clock span from the start of the hands-visible segment to the commit |
| `score` | The source's own score and what it measures (`basis`), when it has one |

Scores keep their basis (word model vote share, personal recording
similarity, gesture classifier score or handshape reference score). They are
not comparable across sources and are never shown as a percentage or as the
chance that a sign is right. The thumbs-up YES is labelled as the app gesture,
not as the word model.

The transcript still stores characters, so the 1,200-character limit, spacing
between words, repeated letters/digits and the text-only sentence request work
as before. Each character of a sign references its event, and the boundary space
a sign needed belongs to that sign.

## Correction and undo

`transcriptReducer` (`lib/sign/transcript-tokens.ts`) owns all changes:
recognized commits, Space, Backspace, Clear, typed edits, removing one sign and
Undo. Undo reverts the latest change, whatever its type: a whole word with its
space, one letter of a spelled name, one of two repeated digits, a Backspace,
Clear or an editing session. Consecutive keystrokes form one undo step; closing
the editor ends that step. History keeps the latest 50 changes.

Backspace still deletes one character. Typed corrections keep the metadata of
every untouched character, so editing one word does not erase the details of
the others. A sign whose own characters were changed is reported as edited.

The editor lists the recognized signs with kind, source, how they were
committed, duration and score basis, each with a Remove button. The transcript
heading shows the latest sign and whether it was confirmed or automatic.
Provisional candidates stay in their own row, labelled "not added until you tap
it". Nothing in that row reaches the transcript without a tap.

## Announcements

The screen reader live region announces only committed changes: "Added HELLO",
"Added letter A", "Deleted O", "Removed WATER", "Undid clear", "Transcript
cleared", or that a full transcript did not accept a sign. It no longer re-reads
the whole transcript after every character. The transcript's visual tracking
hint is no longer a second live region; the camera hint keeps that role, and
fullscreen notices are still announced.

## Raw gloss and sentence output

The transcript is the raw recognized gloss. Copy and Speak in the transcript
controls always use it. "Make it a sentence" shows its result in a separate
card labelled "Suggested English/Hindi sentence · AI" (or "Formatted text" when
the service is off), with the right `lang` attribute. The suggestion is used
only through its own Speak suggestion / Copy suggestion buttons, and it is
hidden whenever the transcript or output language no longer matches the text
it was made from.

Before a suggestion can be spoken or copied, `reviewSentence`
(`lib/sign/sentence.ts`) compares it with the raw text:

- every fingerspelled group (names, unknown words) must appear exactly;
- every number must keep its digits (Devanagari digits count as the same);
- no number may be added;
- a negation may not be dropped or added (English and Hindi markers).

A suggestion that fails shows the reason ("Not usable: this suggestion changes
or drops the number 2") and its buttons stay disabled. These checks are a
safety net for the listed cases, not proof that a suggestion keeps the signer's
meaning. ISL grammar differs from English word order; the service prompt now
says that the input is ISL gloss, must keep spelled terms in Latin letters, and
must return the raw text if the meaning is unclear rather than guessing.

The request accepts a `keep` list (the spelled terms), validated on the server
to be whole words from the same text. It still accepts only text characters and
rejects any other field, such as frames or landmarks.

## Privacy and lifecycle

Video and landmarks stay on the device. The output settings now say that
sentence cleanup sends only the transcript text to an online AI service, and
that nothing is spoken or copied without a choice. Camera consent, pause on
hide, track-end handling, pagehide cleanup and explicit restart are unchanged.
Leaving the workspace stops speech, recognition and the camera.

## Files

- `lib/sign/types.ts`: `SignSource`, `SignEvent`, `TranscriptToken.sign`.
- `lib/sign/transcript-tokens.ts`: reducer, undo history, sign removal,
  metadata-preserving edits, sign summaries and spelled terms.
- `lib/sign/sentence.ts`, `app/api/sign/sentence/route.ts`: `keep` terms,
  `reviewSentence`, revised prompt.
- `lib/sign/use-sign-recognition.ts`, `unified-recognizer.ts`,
  `temporal-recognizer.ts`, `temporal-forest.ts`: source, score basis and time
  span for automatic and confirmed commits.
- `components/sign/transcript.tsx`, `sign-stage.tsx`, `app/sign.css`: Undo,
  sign details, suggestion card, announcements.
- Tests: `test/sign-transcript.test.cjs`, `test/sign-recognition.test.cjs`,
  `test/browser/transcript.check.cjs`, `test/browser/signer-tracking.check.cjs`.

## Verification

Recorded on 21 October 2026: `npm run check` passes (coverage freshness,
TypeScript, 153 unit tests, production build). Against that production build,
served on port 3100 with an empty `GEMINI_API_KEY`, all nine browser suites
pass: 171 checks, including the new 19-check `transcript` suite and three new
signer-tracking checks.

The `transcript` suite uses Chromium's fake camera, stubbed speech and a mocked
sentence service. It checks that a live camera sends no POST and no
cross-origin request; that the only POST is the explicit sentence request,
whose body is exactly `tokens`, `language` and `keep`; that a suggestion
dropping a number is flagged and cannot be spoken or copied; that a faithful
suggestion is spoken only through its own button and never replaces the
transcript; that Backspace, Clear and Undo work and are announced; that the
transcript feedback is not a second live region; and that closing the workspace
stops speech and the camera tracks.

The signer-tracking suite now confirms the real-photo thumbs-up YES and checks
the "Added YES" announcement, the "you confirmed" status, the sign details
naming the thumbs-up app gesture, and that Undo removes YES without the still
held hand adding it again.

One regression was found and fixed during this run: after a typed edit that
removes letters in the middle, the browser's scroll anchoring moved the newest
caption 30 px out of view when the removed letters finished animating.
`.sign-raw-line` now sets `overflow-anchor: none`. In software-rendered headless
Chromium with live CPU tracking, a removed letter took about 4 s to finish
animating out (about 1 s without the camera); the test waits for it.

Screenshots and the browser log are in `.sign-data-cache/camera-stage6/`
(local, git-ignored). These are automated checks with fake streams and
pre-recorded photos. They do not test a physical screen reader, audible speech,
real AI output quality, physical cameras or Deaf signers.

## Remaining limitations and next dependency

- Event time spans are approximate: they start when the hands entered view (or
  after the previous sign) and are not annotated sign boundaries.
- The sentence checks cover names, digits and negation only. Number words,
  tense, questions and other meaning changes are not detected; the user still
  has to read the suggestion.
- Undo history lives in memory for the open page; it is not saved.
- Announcements were checked in the DOM, not with a physical screen reader.
- No Deaf ISL reviewer has evaluated the suggestion wording.
- Next: stage 7 cross-device, browser, screen reader and independent signer
  validation.
