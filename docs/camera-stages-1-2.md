# Camera upgrade: stages 1 and 2

Implemented on 20 October 2026 from `promptforCamera.txt`.

## Stage 1: camera and captions

The compact camera workspace places the live transcript directly below the
preview. Vocabulary, personal recording/import controls and voice/sentence
settings are collapsed. Copy, edit and speech remain beside the transcript.
The camera shows the full source image with letterboxing; the hand overlay uses
the same contain projection and mirror setting. Recognition always sees the
unmirrored camera input.

Camera controls include pause, preview mirroring and fullscreen. Fullscreen
targets the entire signing surface, including captions and controls. A refused
or unavailable browser fullscreen request opens an expanded in-page view.
Escape exits the expanded view before closing Sign to Text. Exiting preserves
the existing stream/transcript and restores button focus. The floating dock and
avatar reference are hidden in expanded view. The avatar reference is optional
on screens at least 1480px wide, where it can sit outside the camera area.

Latest captions scroll within their own region; reading earlier text suspends
automatic scrolling. Small landscape windows and larger text may scroll the
workspace to preserve readable controls. Camera consent, explicit restart after
backgrounding, stream cleanup and existing personal recordings are retained.

## Stage 2: shared vocabulary and coverage

`lib/islVocabulary.ts` now provides word/letter/number metadata with namespaced
IDs, readable labels, English aliases, animation exports and modality/review
flags. `word:I` and `letter:I` remain distinct. Hindi translation continues
through the existing lexicon; Hindi aliases are not newly certified here.
Word training labels derive from that same source. HI/HEY map to HELLO even
inside mixed phrases, and compound recognition output displays THANK YOU.

Run `npm run coverage:sign` to regenerate the checked-in
[coverage table](sign-vocabulary-coverage.md) and
[machine-readable report](../public/models/isl-coverage.json).
`npm run check` checks that these artifacts are current.

The generator checks every canonical animation for valid YBot bones, finite
targets, queue completion and return to rest. It derives data availability,
model aliases, versions, sources and licenses from shipped model assets and
provenance. It does not modify authored animation tables or model weights.

Coverage: 200 entries; 164 words, 26 letters and 10 digits. There are 152 bundled
word entries representing 150 distinct classes (HOUSE/HOME and BEGIN/START use
model aliases). The bundled static dataset covers 35 letters/digits. The twelve
missing word entries and zero remain available for personal training, with no
claim of pretrained support. (Stage 5 later bundled real digit-0 data for
Numbers mode and retrained the word model; see [stage 5](camera-stage-5.md).)
The in-app searchable coverage disclosure loads
its report only when opened and shows these distinctions.

All sign-variant and Deaf ISL linguistic reviews remain pending, including the
two model alias pairs and the special thumbs-up app gesture. Mechanical checks
do not establish the accuracy of a sign, an animation's grammatical facial
expression, or general webcam recognition. This change does not add body/face
recognition or automatic arbitration between words and fingerspelling; those
are stages 3 and 4.

## Verification

`npm run check` covers generated report freshness, TypeScript, unit tests and
the production build. `npm run test:browser -- http://localhost:3000` covers
existing app flows plus the new camera workspace checks. Playwright is a dev
dependency; install its browser using `npx playwright install chromium`, or set
`PLAYWRIGHT_CHROMIUM` to an already installed executable. Serve with an empty
`GEMINI_API_KEY` during regression runs.

On Windows PowerShell, assigning an empty environment variable can remove it,
allowing `.env.local` to populate it again. For an isolated production test
server with AI disabled, set it inside Node before Next loads:

```sh
node -e "process.env.GEMINI_API_KEY='';process.argv=['node','next','start','--hostname','127.0.0.1','--port','3100'];require('next/dist/bin/next')"
```

Recorded results: report freshness, TypeScript, 123 unit tests and the production
build pass. The six existing browser suites passed 113 checks. Visual review
found a clipped camera start button at 200% text size; the camera now has a
text-scaled minimum height. After that correction, all 20 camera checks passed
against the final production build. Screenshots were inspected for desktop,
mobile, fullscreen, fallback and enlarged text. The final camera log and images
are under `.sign-data-cache/camera-stage12/` and
`.sign-data-cache/camera-stage12-final/` (local, git-ignored evidence).

The camera checks use isolated fake streams, typed captions and simulated
fullscreen refusal. They exercise layout at 1366x768, 1920x1080, 1280x720,
390x844 and 375x812, larger text, fullscreen containment/exit, focus, mirroring,
camera pause, long captions and vocabulary search. These checks do not measure
physical camera behavior, audible speech, Safari/iOS performance, recognition
accuracy or Deaf signer comprehension.
