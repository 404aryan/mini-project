# Signer tracking assets

These additional Google MediaPipe model bundles are self-hosted. The runtime
does not download models or send camera frames to Google. Runtime WASM files
continue to come from the installed `@mediapipe/tasks-vision` package.

| File | Source | Bytes | SHA-256 |
| --- | --- | --- | --- |
| pose_landmarker_lite.task | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task | 5777746 | 59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a |
| face_landmarker.task | https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task | 3758596 | 64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff |

Official guides and model documentation:

- https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
- https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- https://github.com/google-ai-edge/mediapipe

Retain the upstream model notices and terms. The MediaPipe runtime is Apache 2.0;
this attribution does not change the separate research-use restrictions of the
ISL word classifier in `public/models/SIGN-DATA.md`.

The holistic bundle is used only for the reproducible benchmark and downloaded
into `.sign-data-cache/camera-stage34/`. It is not shipped with the application.
Public pose/portrait/thumb-up images used by browser diagnostics also stay in
that ignored cache. They are diagnostic images, not ISL annotations or training
recordings. `scripts/prepare-signer-fixtures.cjs` records their source URLs.
