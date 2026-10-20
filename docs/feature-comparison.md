# Repository feature comparison

Compared the local project with `mitarthpathak/yap-render` at
`bee74ac93b18afc1996d35d62d379dcfe5531335` (the remote HEAD at audit time).

The repository's main features remain present locally: typed translation,
quick signs and scrolling, English voice input, live signing, AI/offline engine
selection and fallback, fingerspelling, Default/Human avatars, speed adjustment,
Stop/Reset, the expanded canvas, navigation, profiles/dashboard, and About.
The local Hindi, number signs, camera recognition, dock, training studios,
and playback recovery features were retained. No additional old core feature
needed to be copied from the repository after the animation restoration.

Three functional issues were reproduced and fixed:

- The expanded canvas advertised Escape to restore size but had no handler.
  Escape now restores it and lets About and Sign to Text close independently.
- On phones, the expanded command panel was fixed at 170px despite containing
  more controls than could fit. Quick signs were clipped. The panel now gives
  controls their full height, keeps the sign list scrollable, and lets short
  viewports scroll the workspace.
- `WAIT MINUTE` was translated into a spelled MINUTE plus WAIT, and canonical
  compound names could lose underscores in text normalization. Every supported
  vocabulary name and readable label now reaches its corresponding animation.
  WAIT A MINUTE remains supported, including within a covered sentence.

Validation:

- 119 automated tests passed, including source/model parity and every restored
  vocabulary name/label.
- 85 browser checks passed: landing/accounts/speech (26), English/Hindi/digit
  translation (12), avatar queues/switching/recovery (26), and playback controls
  at desktop, portrait and short landscape sizes (21).
- TypeScript and the production build passed.
- Mobile fullscreen screenshots were visually reviewed.

Browser speech tests use controlled recognition events; they do not validate
physical microphone hardware or an external speech service. AI tests cover
fallback behavior rather than promising provider availability.

Pre-change hashes confirmed all 164 existing files outside the five edited
source/test files were preserved in the audited app/components/lib/public/test
trees. The dock and sign-to-text implementation/data were unchanged. Diagnostic
screenshots and the comparison baseline live in the ignored
`.sign-data-cache/feature-audit/` folder.
