# Avatar animation restoration

Source: https://github.com/mitarthpathak/yap-render/tree/bee74ac93b18afc1996d35d62d379dcfe5531335

All 49 source animation files were restored under `components/avatar/animations/`:
164 vocabulary entries, 284 exported word functions including aliases, all 26
letters, and the original default pose. The locally added 0–9 animations remain.
`components/avatar/animation-source.json` records source hashes; text hashes
normalize line endings and an optional UTF-8 BOM.

The existing `public/models/ybot.glb` matches the source binary exactly. The human
face layer also matches the source. Both avatar choices use YBot; Human adds the
procedural face and warm armor colors. The source's camera (31-degree field of
view, position 0/0.62/3), avatar position (y = -0.85), lights, bone-name resolution,
and rest-quaternion rotation setup already match the local player and were kept.
The source's unused `brunette.glb` is not required by either avatar choice.

The current player retains request queues, number playback, Hindi translation,
elapsed-time signing speed, stop/reset, model switching, retry/error recovery,
and power saving. Imported frames still pass through the current queue's
normalization and return-to-rest handling, so conflicting source instructions
(including CONFUSED) cannot stall playback. Letter A now uses the repository's
right-hand gesture; the independent sign-to-text training data was preserved.

Dock, sign-to-text, page controls, and recognition files were checked against
their pre-restoration hashes and left unchanged. Pre-restoration avatar files
are backed up in the ignored `.sign-data-cache/avatar-restore/before/` folder.

Validation: all 118 tests, TypeScript checking, and production build passed.
Tests cover every exported word, letter and digit reaching its targets and
returning to rest, source parity, and bone existence in the actual YBot asset.
Visual browser validation could not run because the connected browser tool
reported no available browsers.
