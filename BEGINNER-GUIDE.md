# Yap & Render: Beginner's Guide

Welcome! This guide explains what this project does, how its main parts fit
together, what the folders and important files are for, and where to start when
you want to understand the code. You do **not** need to read every file to run
the app or make a small change.

> **Start here:** follow the setup steps, then read the “Two features, two
> workflows” section and the “Project map.” The “Reading paths” section points
> to a small number of useful files for each task.

## 1. What is Yap & Render?

Yap & Render is a web application with two related but separate features:

1. **Speak or type → sign:** enter English or Hindi text, or use browser speech
   recognition. The app turns the text into **gloss tokens** (short labels such
   as `WATER` or `THANK_YOU`) and plays authored movements on a 3D avatar.
2. **Sign → text:** choose the camera experience. The browser uses MediaPipe
   landmarks and recognition code to suggest signs and build a transcript.

These are not one shared AI model. The first feature translates text for an
avatar. The second feature recognizes camera movement. They share vocabulary
and some sign-related data, but have different code and limitations.

**Important:** this is a demonstration and experimental learning project, not
a certified ISL interpreter. Gloss tokens simplify language; they do not
represent all ISL grammar, facial expression, body movement, or regional
variation. Camera predictions and authored signs need review by Deaf ISL
signers and qualified reviewers.

## 2. Run it on Windows

### You need

- Windows 10 or 11.
- Node.js and npm. The repository's CI workflows use Node 20 and Node 22.
- A modern browser. Chrome or Edge is a good starting point for camera, speech,
  and WebGL features.
- Internet access to install the Node packages. A Gemini key is optional.

Check Node and npm in PowerShell:

```powershell
node --version
npm --version
```

In PowerShell, move into **your own copy** of the project folder. For example:

```powershell
cd "C:\Users\your-name\Desktop\mini-project"
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Keep the PowerShell
window open while developing; press **Ctrl+C** there to stop the server.

- `npm install` reads `package.json` and `package-lock.json`, then installs
  the packages the project needs into `node_modules/`.
- `npm run dev` starts the Next.js development server. `localhost` means
  your own computer.
- You normally install packages once, then run `npm run dev` whenever you
  want to work on the site.

### Optional: online Gemini translation

The app has an offline rule-based text translator, so a Gemini key is not
required to start the app. To try the optional online translator:

1. Copy `.env.example` to `.env.local` in the project root.
2. Put your key after `GEMINI_API_KEY=`.
3. Restart the development server.

Keep `.env.local` private and never commit or share the key. It is read by the
server-side API route; it should **not** be renamed to a `NEXT_PUBLIC_...`
variable, which would expose it to browser code.

Speech recognition may use browser-provided services. The Sign → Text camera
workflow requests camera permission separately. Read the privacy and data
notes in the camera stage and `public/models/SIGN-DATA.md`.

## 3. Two features, two workflows

### Speak / type → avatar

```text
Typed text or browser speech
             |
             v
         app/page.tsx
             |
             v
   lib/islTranslator.ts
       /           \
online API       offline rules
       \           /
             v
       gloss tokens
             |
             v
AvatarPlayer + sign animation frames
             |
             v
       3D signing avatar
```

When online translation is used, the browser sends text to this app's
`/api/translate-isl` route. The route can call Gemini using the server-only
`GEMINI_API_KEY`, checks the returned tokens against the supported vocabulary,
and replies to the browser. If online translation is not configured or does
not work in time, the client uses the offline translator instead.

`components/avatar/AvatarPlayer.tsx` loads the 3D model and looks up animation
frames for each token. If there is no word sign for a word, the app may spell
it using letter animations.

### Sign → text

```text
User allows camera
        |
        v
Video frames in the browser
        |
        v
MediaPipe landmarks (hands; optional body/face tracking)
        |
        v
Feature extraction + sign recognition
        |
        v
Possible match / confirmation / transcript
        |
        +---- optional sentence formatting API
```

This feature lives mostly in `components/sign/` and `lib/sign/`. Camera
tracking and recognition are designed to run in the browser, using bundled
MediaPipe model/WASM assets. Training studios save samples in browser storage;
they are not automatically uploaded to a project server. Optional sentence
formatting can use the server-side Gemini integration.

**Do not confuse recognition scores or source-dataset test results with
guaranteed real-world webcam accuracy.** See `docs/sign-status.md` and
`public/models/SIGN-DATA.md` for current status, data sources, licensing, and
limitations.

## 4. The technology stack—in plain language

| Technology | What it is | What it does here |
|---|---|---|
| **JavaScript** | The language that runs in browsers and Node.js. | Runs the app; some existing translation and animation modules are `.js` files. |
| **TypeScript** | JavaScript with type descriptions checked by tools. | Used by most pages, components, API routes, and shared logic. |
| **React 19** | A UI library made of reusable components. | Builds the interactive page and camera/training screens. |
| **Next.js 16** | A web framework built on React. | Provides the `app/` routes, server API routes, development server, and production build. |
| **Node.js and npm** | JavaScript runtime and package manager. | Install dependencies and run development, test, type-check, and build commands. |
| **CSS, Tailwind CSS 4, PostCSS** | Styling and CSS build tools. | Tailwind is used alongside substantial hand-written CSS; PostCSS processes styles during builds. |
| **Three.js** | A browser 3D graphics library. | Renders the avatar and its rigged movements. `AvatarPlayer.tsx` imports Three.js directly. |
| **MediaPipe Tasks Vision** | Computer-vision task library. | Estimates hand landmarks (and optional body/face landmarks) for camera recognition. |
| **Google Gemini API** | Optional hosted AI service. | Provides online text-to-gloss translation and optional transcript sentence formatting. |
| **Motion** | UI animation library. | Animates interface elements; it is separate from the avatar sign-animation frames. |
| **Lucide React** | Icon component library. | Supplies icons used in the interface. |
| **Playwright** | Browser automation/testing tool. | Supports the optional browser test suite. |
| **Docker** | Tool for packaging an application into a container image. | The `Dockerfile` describes a production-style container; Docker is not needed for normal local development. |

`package.json` is the authoritative dependency list. A package being listed
there does not prove that every screen uses it: for example, React Three Fiber
and Drei are installed, but the main `AvatarPlayer` path manages Three.js
directly. The project uses local browser storage (`localStorage` and
IndexedDB), not a conventional remote application database or shared account
server.

### Useful terms

- **Route:** a URL handled by the app. In the App Router, folders under `app/`
  form URL parts.
- **API route:** a server endpoint the browser can request, often to do work
  that should not happen in public browser code.
- **Component:** a reusable React function that renders part of the interface.
- **Props:** values a parent component passes to a child component.
- **State:** a component's changing values, such as selected mode or input text.
- **Hook:** a React helper (often starting with `use`) that shares stateful
  behavior.
- **Gloss:** a short token/label used by this app to identify an animation;
  it is not a full written translation of ISL.
- **Landmark:** a tracked point, such as a fingertip or wrist.
- **Model:** here this may mean a 3D avatar asset, a computer-vision model, or
  a trained recognition model. These are different kinds of files.
- **Build:** the prepared output generated for production use.
- **Dependency:** an external package the app imports and relies on.

## 5. How Next.js turns files into pages

This project uses the Next.js **App Router**. A `page.tsx` file makes a
webpage; a `route.ts` file handles an API URL. For example:

| File | URL or purpose |
|---|---|
| `app/page.tsx` | Home page: `/` |
| `app/sign/train/page.tsx` | Static-sign training page: `/sign/train` |
| `app/sign/train/words/page.tsx` | Word-motion training page: `/sign/train/words` |
| `app/sign/validate/page.tsx` | Signer-validation page: `/sign/validate` |
| `app/api/translate-isl/route.ts` | Text translation API: `/api/translate-isl` |
| `app/api/sign/sentence/route.ts` | Transcript sentence API: `/api/sign/sentence` |
| `app/layout.tsx` | Shared outer HTML, fonts, metadata, styles, and production analytics |

The root layout wraps every page. The home page connects the main experiences.
The API routes run on the server; most camera, avatar, and interactive UI code
runs in the browser.

## 6. Project map: folders and important files

### Main folders

| Folder | What is inside / why it exists |
|---|---|
| `app/` | Next.js routes (pages and API endpoints), shared layout, and page-level styles. |
| `components/` | Reusable visual/interface pieces. `avatar/` is for the signing avatar; `sign/` is for camera, transcript, and training UI; `ui/` contains shared UI pieces. |
| `lib/` | Reusable logic that is not itself a page. Includes translation, vocabulary, local profile, and the camera recognition engine. |
| `public/` | Files served as static URLs: images, avatar/model files, datasets, and MediaPipe runtime assets. |
| `docs/` | Human-written feature notes, project status, data details, and architecture/demo material. |
| `scripts/` | Developer commands for preparing or evaluating data/models and checking vocabulary coverage. Most are not needed to run the web app. |
| `test/` | Automated tests and their small fixtures. |
| `.github/workflows/` | GitHub Actions workflow definitions for CI and a manually triggered automation. |
| `node_modules/` | Installed third-party packages. Generated by npm; do not edit or commit it. |
| `.next/` | Next.js generated development/build output. Do not edit or commit it. |

### `app/`: pages, APIs, and styles

- `page.tsx` — the home page and the main Speak/Sign experience.
- `layout.tsx` — shared HTML shell, fonts, metadata, global CSS, and Analytics
  in production.
- `error.tsx` — client-side error boundary with a retry action.
- `globals.css` — global theme and Tailwind imports; also imports the sign
  stylesheets.
- `sign.css` — styles for the camera/sign experience.
- `sign-story.css` — styles for the Sign → Text story experience.
- `api/translate-isl/route.ts` — server endpoint for optional Gemini
  text-to-gloss translation; validates its request and returned tokens.
- `api/sign/sentence/route.ts` — optional sentence formatting endpoint for a
  sign transcript; can return a basic formatted fallback.
- `sign/train/page.tsx` and `sign/train/training.css` — static sample training
  page and its styles.
- `sign/train/words/page.tsx` — word-motion training page; reuses the training
  stylesheet.
- `sign/validate/page.tsx` and `sign/validate/validation.css` — facilitated
  validation page and its additional styles.

### `components/`: visible interface

#### `components/avatar/`

- `AvatarPlayer.tsx` — loads and renders the 3D avatar and plays queued signs.
- `textToGloss.js` — offline rule-based text-to-gloss conversion.
- `hindiToGloss.js` — Hindi text processing/transliteration for that conversion.
- `glossDictionary.js` — word and phrase mappings used by conversion.
- `signQueue.ts` — helpers for ordering and advancing animation frames.
- `humanLayer.ts` — additional face/visual layer used by the avatar.
- `animation-source.json` — animation source/metadata data.
- `animations/alphabets.js` and `animations/Alphabets/` — letter animation
  exports and individual letter movements from **A.js through Z.js**.
- `animations/numbers.js` — digit animation mappings.
- `animations/defaultPose.js` — neutral/resting avatar pose.
- `animations/words.js` — exports the supported word-sign animations.
- `animations/Words/` — word movement modules. The current modules are
  `Actions.js`, `BasicSocial.js`, `CommonExtra.js`, `DailyHealth.js`,
  `Discourse.js`, `DRINK.js`, `EAT.js`, `Education.js`, `FoodKitchen.js`,
  `HOME.js`, `Objects.js`, `PeopleRelations.js`, `PERSON.js`, `Places.js`,
  `Questions.js`, `States.js`, `TechEmergency.js`, `TIME.js`, `Verbs.js`,
  and `YOU.js`. Some group many related words; a few provide individual
  exports.

#### `components/sign/`

- `sign-stage.tsx` — interactive camera workspace and recognition controls.
- `transcript.tsx` — transcript display and editing interface.
- `hand-overlay.tsx` — visual overlay for tracking/hand feedback.
- `dock.tsx` — navigation/control dock for sign experiences.
- `training-studio.tsx` — UI for collecting static hand samples.
- `word-training-studio.tsx` — UI for collecting word-motion samples.
- `validation-studio.tsx` — UI for facilitated recognition validation.
- `sample-preview.tsx` — preview of a sample before using it.
- `vocabulary-coverage.tsx` — UI that displays recognition vocabulary coverage.
- `scrolly-sign-to-text.tsx`, `story-scene.tsx`, and
  `static-story-scene.tsx` — story-style Sign → Text scenes.

#### `components/ui/`

- `button.tsx` — shared button UI component.

### `lib/`: reusable logic

Root-level modules:

- `islTranslator.ts` — chooses the online API or offline translator and
  returns playable tokens.
- `islVocabulary.ts` — canonical supported tokens, labels, and validation.
- `live-speech.ts` — helpers for processing streaming speech results.
- `local-account.ts` — simple device-local profile/account behavior; not a
  server account system.
- `api-guard.ts` — request limits, body-size checks, and API error helpers.
- `use-modal-dialog.ts` — reusable modal dialog behavior.
- `utils.ts` — shared utility helpers.

The `lib/sign/` folder is the camera recognition engine and supporting logic:

| File(s) | Main responsibility |
|---|---|
| `types.ts` | Shared data types for sign features and observations. |
| `hand-tracker.ts`, `signer-tracker.ts` | Set up and run local hand and signer landmark tracking. |
| `signer-tracker.worker.ts` | Worker-side signer tracking work. |
| `features.ts`, `signer-features.ts`, `sequence-features.ts`, `temporal-features.ts` | Convert tracked points and time sequences into numeric features for recognition. |
| `knn-classifier.ts`, `dtw-classifier.ts`, `temporal-forest.ts` | Recognition/matching algorithms for static or moving signs. |
| `temporal-recognizer.ts`, `word-recognizer.ts`, `unified-recognizer.ts` | Turn features into candidate signs and combine recognition paths. |
| `word-matcher.worker.ts` | Worker-side word matching. |
| `stabilizer.ts` | Reduce noisy frame-to-frame changes before a sign is committed. |
| `use-sign-recognition.ts`, `use-sign-mode.ts` | React hooks connecting camera recognition and selected UI mode. |
| `recorder.ts`, `word-recorder.ts` | Capture static samples and word-motion recordings. |
| `sample-store.ts`, `word-store.ts`, `use-sample-library.ts`, `use-word-library.ts` | Validate, persist, and access local training libraries. |
| `word-data.ts`, `story-data.ts` | Word model/data and story content helpers. |
| `transcript-tokens.ts`, `sentence.ts`, `tts.ts` | Transcript operations, sentence formatting helpers, and text-to-speech support. |
| `validation.ts`, `validation-store.ts` | Validation session logic and local result storage. |
| `provenance.ts` | Data/model source provenance helpers. |
| `fetch-deadline.ts` | Time limits for fetch requests. |
| `hand-overlay.ts` | Hand-overlay data/helpers. |
| `portal.ts` | Portal/overlay UI helper logic. |
| `use-camera-fullscreen.ts`, `use-reduced-motion.ts`, `use-unsaved-guard.ts` | Camera fullscreen, accessibility motion preference, and unsaved-change hooks. |

### `public/`: images and model/data files

Files in `public/` are static assets, not TypeScript modules:

- Root `icon*`, `apple-icon.png`, `yap-render-logo-mark.png`, and
  `placeholder*` files are app icons, branding, and placeholder artwork.
- `mediapipe/` holds local vision task models (`*.task`), documentation about
  the signer models, and the `wasm/` runtime files needed by MediaPipe.
- `models/ybot.glb` is the 3D avatar model.
- `models/isl-samples.json`, `isl-words.json`, and
  `isl-temporal-model.json` contain sign/reference or model metadata/data.
- `models/isl-temporal-forest.bin` is a binary trained word-recognition model.
- `models/isl-coverage.json`, `word-evaluation.json`, and the `*-provenance.json`
  files describe coverage, evaluation results, and data origins.
- `models/ATTRIBUTION.md` and `models/SIGN-DATA.md` explain attribution,
  sources, licensing, and important dataset limitations. Read these before
  reusing or redistributing model/data files.

The `.glb`, `.task`, `.wasm`, and `.bin` extensions identify binary assets;
they are not source-code files to edit like `.ts` files.

### `docs/`: project notes and evidence

- `sign-status.md` — current Sign → Text status and limitations.
- `sign-phase-1.md` through `sign-phase-5.md` — staged sign-feature notes.
- `sign-words.md`, `sign-data-collection.md`, `sign-vocabulary-coverage.md`,
  and `signer-validation.md` — word recognition, datasets, coverage, and
  validation details.
- `camera-stages-1-2.md`, `camera-stages-3-4.md`,
  `camera-stage-5.md`, and `camera-stage-6.md` — camera implementation and
  evaluation notes.
- `feature-comparison.md` — feature comparison notes.
- `avatar-restoration.md` — avatar restoration notes.
- `demo/` — recorded demo GIF and video.
- `architecture/` — architecture diagram sources, interactive HTML, images,
  and walkthrough video.

Treat design/phase notes as explanations of work, not necessarily a substitute
for checking current source code. Use the status and data documents for current
behavior and limits.

### `scripts/`: development and data commands

- `generate-vocabulary-coverage.cjs` — check/generate coverage from the
  vocabulary, animations, and shipped recognition assets.
- `prepare-sign-data.py`, `prepare-word-data.py` — prepare static and word
  training data (requires the Python packages described by the scripts).
- `train-word-model.py` — train the temporal word classifier.
- `evaluate-word-model.py`, `evaluate-sign-data.cjs`,
  `evaluate-signer-validation.cjs` — evaluate model/data or validation outputs.
- `check-word-recognition.cjs`, `benchmark-signer-tracking.cjs` — check or
  benchmark recognition/tracking behavior.
- `prepare-signer-fixtures.cjs` — prepare signer benchmark/test fixtures.
- `sign-training-requirements.txt` — Python packages for data/model work.

These scripts are for development/research workflows, not required for
`npm run dev`. Preparing/training data may download or process external source
datasets; check the documentation and licenses first.

### `test/`: automated checks

- `app-api.test.cjs` — API behavior.
- `app-avatar.test.cjs` — avatar behavior.
- `app-speech.test.cjs` — speech helpers/behavior.
- `app-translation.test.cjs` — translation behavior.
- `sign-data.test.cjs`, `sign-training-data.test.cjs` — data formats and
  training data.
- `sign-engine.test.cjs`, `sign-mode.test.cjs`, `sign-recognition.test.cjs`,
  `sign-relation.test.cjs`, `sign-signer.test.cjs`,
  `sign-signer-loop.test.cjs`, `sign-temporal.test.cjs`,
  `sign-tracker.test.cjs`, `sign-unified.test.cjs`, `sign-words.test.cjs`,
  `sign-validation.test.cjs` — recognition, tracking, mode, and validation.
- `sign-recorder.test.cjs`, `sign-transcript.test.cjs` — recording and
  transcript behavior.
- `load-module.cjs` — helper for loading project modules in tests.
- `fixtures/` — small fixed input samples used by tests.
- `browser/` — Playwright browser checks and their shared runner/helpers.

Tests help catch regressions when code changes. A passing test is useful
evidence, but does not establish that ISL content is linguistically correct or
that a model works for every signer.

### Important root files

| File | Why it matters |
|---|---|
| `package.json` | Project name, package dependencies, and commands such as `dev`, `test`, `typecheck`, and `build`. Start here to discover runnable commands. |
| `package-lock.json` | Exact npm dependency resolution for repeatable installs. Usually change this through npm when dependencies change. |
| `Dockerfile` | Instructions for building a multi-stage production container: build the Next.js app, then run it with Node. |
| `.dockerignore` | Files Docker skips when sending the project into the image build, such as local dependencies and environment files. |
| `.env.example` | Example environment variable names; contains no real key. |
| `.gitignore` | Files Git should not track, such as local secrets, generated output, and installed packages. |
| `next.config.mjs` | Next.js configuration; currently sets image optimization behavior. |
| `tsconfig.json` | TypeScript settings: strict checks, JavaScript imports, and the `@/` root import alias. |
| `next-env.d.ts` | Next.js-generated TypeScript declarations. Normally do not edit it manually. |
| `postcss.config.mjs` | Connects Tailwind's PostCSS plugin to the CSS build. |
| `components.json` | UI/shadcn-style generator configuration, component aliases, and icon-library setting. |
| `README.md` | Short project overview, demo, and quick start. |
| `AGENTS.md` | Repository guidance for coding agents and contributors. |
| `CLAUDE.md` | Imports the repository guidance from `AGENTS.md`. |
| `beginner.d` | Earlier beginner-draft file with an unusual extension; this guide is the Markdown version to use going forward. |
| `TECH-STACK-GUIDE.md` | Separate technology-focused guide; this beginner guide adds the folder-by-folder tour and reading paths. |
| `ERRORS.txt` | A dated generated bug/error analysis note. Treat it as a report to verify, not automatically as a list of current bugs. |
| `promptforCamera.txt` | Camera feature implementation brief and audit notes; not code executed by the app. |
| `phase2-*.png` | Camera feature screenshots/reference images, not app source code. |

### `.github/workflows/`: automation

- `ci.yml` and `node.js.yml` — GitHub Actions workflows that install Node
  dependencies and run checks on pushes/pull requests. They are similar but
  not identical; one uses Node 20 and the other Node 22.
- `auto-commit.yml` — a manually triggered GitHub workflow that runs an
  automated commit action. It is not part of the app runtime.

## 7. What does the Dockerfile do?

The **Dockerfile is a file, not a folder**. Docker reads it to build an image
that can run the app consistently on another machine or hosting environment.
It is optional; use `npm run dev` for ordinary local development.

This Dockerfile has two stages:

1. **Builder stage:** starts from Node 20 Alpine, copies package manifests,
   installs packages, copies the source, then runs `npm run build`.
2. **Runner stage:** starts from a fresh Node 20 Alpine image and copies in
   the production build, public assets, dependencies, and package manifest.
   It exposes port 3000 and runs `npm start`.

To build and run it (with Docker installed):

```powershell
docker build -t yap-render .
docker run --rm -p 3000:3000 yap-render
```

Then open `http://localhost:3000`. To use Gemini in the container, supply
`GEMINI_API_KEY` securely when running it (for example via your deployment
platform's secret/environment settings); do not bake a real key into the image.
The `.dockerignore` prevents local `.env*`, `node_modules`, and `.next` from
being sent as build inputs.

## 8. Commands you will use

Run these at the repository root in PowerShell:

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server with hot reload. |
| `npm run typecheck` | Check TypeScript types without producing output files. |
| `npm test` | Run the Node-based project test suite. |
| `npm run test:sign` | Run sign-related tests. |
| `npm run test:app` | Run app/API-facing tests. |
| `npm run test:browser` | Run browser checks; requires a running app and browser/Playwright support. |
| `npm run build` | Create the optimized Next.js production build. |
| `npm run start` | Serve a production build; run `npm run build` first. |
| `npm run coverage:sign` | Check/generate recognition-vocabulary coverage data. |
| `npm run check` | Run coverage check, typecheck, tests, and production build. |

For a small first check, run `npm run typecheck` or a focused test command. Use
`npm run check` before a larger handoff when you want the combined checks.

## 9. Where should I start reading the code?

### To understand the text-to-avatar feature

1. `app/page.tsx` — find the UI and follow the Play/speech handlers.
2. `lib/islTranslator.ts` — see how online and offline translation are chosen.
3. `components/avatar/textToGloss.js` — read the offline conversion rules.
4. `lib/islVocabulary.ts` — see which tokens are playable.
5. `components/avatar/AvatarPlayer.tsx` — see how the avatar receives tokens.
6. `components/avatar/signQueue.ts` — see how animation frames are queued.
7. Open one file under `components/avatar/animations/Words/` and one letter
   under `components/avatar/animations/Alphabets/`.

### To understand the camera-to-text feature

1. `components/sign/sign-stage.tsx` — start at the camera user interface.
2. `lib/sign/use-sign-recognition.ts` — see how the UI connects to recognition.
3. `lib/sign/hand-tracker.ts` — follow camera frames into MediaPipe tracking.
4. `lib/sign/features.ts` and `lib/sign/temporal-features.ts` — see how
   landmarks become numeric values.
5. `lib/sign/knn-classifier.ts` or `lib/sign/word-recognizer.ts` — inspect
   recognition logic.
6. `lib/sign/transcript-tokens.ts` — see how recognized signs reach the
   transcript.
7. `docs/sign-status.md` and `public/models/SIGN-DATA.md` — understand current
   limits and data provenance.

### To understand a page URL

Look for its `page.tsx` under `app/`. For example, start at
`app/sign/train/words/page.tsx` for `/sign/train/words`. If it imports a
component, follow that import into `components/`.

## 10. Why are there so many files?

The project separates code by responsibility:

- Each `app/.../page.tsx` defines a route, not a separate application.
- Components split a large screen into smaller pieces that can be reused and
  tested.
- `lib/sign/` separates tracking, feature extraction, matching, state,
  transcript, and storage logic instead of putting the camera engine in one
  enormous file.
- Each letter animation has its own module so it can be authored and reviewed
  independently. Word animation modules group signs by topic or exports.
- Tests are separate from app code so they can check behavior without becoming
  part of the user interface.
- `public/models/` and `public/mediapipe/` contain data and binary model files
  the running browser needs.
- `docs/` and `scripts/` support understanding, data preparation, and model
  evaluation; most are not loaded when the user opens the site.
- `node_modules/` and `.next/` are generated support folders, not files you
  need to edit.

**You do not need to understand every file before contributing.** Trace one
user action from the page to the relevant helper, then use its tests and
neighboring code as examples.

## 11. A few important cautions

- Do not commit `.env.local` or share a Gemini key.
- Do not treat a local profile as an online account; it is stored on that
  browser/device.
- Camera access needs user permission and browser support. Camera processing
  is intended to run locally; browser speech recognition and Gemini may use
  external services.
- Do not redistribute recognition data or weights without checking their
  source terms in `public/models/SIGN-DATA.md`.
- Do not describe the demo as a certified interpreter or imply that an
  evaluated dataset score guarantees webcam accuracy.
- When changing sign vocabulary or animation exports, check
  `lib/islVocabulary.ts`, the animation modules, coverage output, and related
  tests so the token and its animation stay aligned.

## 12. Quick recap

```text
app/          = URLs, pages, API routes, and page styles
components/   = visible reusable interface and avatar
lib/          = translation, camera recognition, and shared logic
public/       = images, avatar, vision models, and recognition data
docs/         = explanations, status, evaluation, and provenance
scripts/      = development/data preparation tools
test/         = automated checks
Dockerfile    = optional recipe for a production container
package.json  = dependencies and commands
```

The key mental model is: **React draws the interface; Next.js connects pages
and server endpoints; the browser runs the avatar and camera features; optional
Gemini requests go through the server; offline translation keeps the basic
text-to-avatar flow usable without a key.**
