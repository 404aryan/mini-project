# Yap & Render: Beginner's Project Guide

This guide is for a computer-science student who wants to run Yap & Render,
understand its main parts, and know where to start when reading or changing
the code.

## 1. What this project does

Yap & Render is a web application for Indian Sign Language (ISL). It has two
different experiences:

1. **Speak / type → Sign:** enter text or use browser speech recognition. The
   app converts the words to a sequence of ISL gloss tokens and plays authored
   sign animations on a 3D avatar.
2. **Sign → Text:** open the camera and use experimental computer-vision
   recognition to suggest or recognize hand signs and show them in a transcript.

These are separate pipelines. The 3D avatar translator does not learn signs
from the camera, and the camera recognizer does not control the avatar.

The project is a learning/demo application, not a certified interpreter. A gloss
is a simplified representation of signs; grammar, facial expression, body
movement and regional variation are important in real ISL. Treat translations
and camera predictions as experimental and have sign content reviewed by Deaf
ISL signers.

## 2. Run the project on Windows

### Requirements

- Windows 10 or 11
- Node.js 20.9 or newer, with npm
- A modern browser such as Chrome or Edge
- Internet access for installing npm packages; an internet connection and API
  key are optional for online Gemini translation

Check the installed versions in PowerShell:

```powershell
node --version
npm --version
```

### Install and start the development server

Open PowerShell and run:

```powershell
cd "C:\Users\gupta\Desktop\3-d model\yap-render"
npm install
npm run dev
```

Wait for Next.js to print that the server is ready, then open:

```text
http://localhost:3000
```

Leave the PowerShell window open while using the site. To stop the server,
press **Ctrl+C** in that window.

`npm install` reads `package.json` and installs the app's dependencies. `npm
run dev` starts the local Next.js development server. You normally install
dependencies once, then start the server each time you work on the project.

### Optional: enable Gemini translation

The app works without a Gemini API key: choose **Offline** in the avatar
workspace, or leave the AI option selected and the app will fall back to its
offline translator when the API is unavailable.

To enable online translation, create a file named `.env.local` in the project
root and add your key:

```text
GEMINI_API_KEY=put_your_key_here
```

Get a key from Google AI Studio. Restart `npm run dev` after changing the
environment file. Do not commit `.env.local`, share the key, or rename it to a
`NEXT_PUBLIC_...` variable: the API key belongs on the server, not in browser
code.

### Production-style local run

To build the app and serve the production build:

```powershell
npm run build
npm run start
```

Then open `http://localhost:3000`. `npm run start` expects a successful build.

## 3. A simple way to picture the architecture

Think of the application as three cooperating parts:

1. **Browser UI:** React components display the page, read user input and track
   interface state.
2. **Next.js server:** API routes handle requests that need server-side work,
   including calls to Gemini. The browser does not receive the Gemini key.
3. **Browser-side engines and assets:** JavaScript translates text, Three.js
   renders the avatar, and MediaPipe processes camera frames for the separate
   Sign → Text feature.

The site is built with **Next.js** and **React**. Next.js uses the `app/`
directory for pages and API routes. TypeScript is used for most new code;
some existing translation and animation modules are JavaScript.

### The central Speak / Sign flow

```text
Typed text ───────────────────────────────┐
                                          v
Voice → browser speech recognition → app/page.tsx
                                          |
                           lib/islTranslator.ts
                           online or offline gloss
                                          |
                               gloss token list
                                          v
                  components/avatar/AvatarPlayer.tsx
                          Three.js animation queue
                                          |
                                          v
                                 3D avatar signs
```

For online translation, `lib/islTranslator.ts` sends the text to the
`/api/translate-isl` route. That server route asks Gemini for tokens from the
project's supported vocabulary, checks the response, and returns playable
tokens. The client falls back to offline translation if the request fails,
times out, returns no usable tokens, or the browser is offline.

### The separate Sign → Text flow

```text
Camera permission → local video preview → MediaPipe hand landmarks
                                              |
                      static-sign or word recognizer + sample/model data
                                              |
                                 stable / confirmed sign
                                              v
                                          transcript
                                              |
                        optional sentence formatting and speech
```

The camera workflow is activated by the **Sign → Text** camera mode and uses
files under `components/sign/` and `lib/sign/`. Hand tracking and recognition
run in the browser. Camera frames are not sent to the translation API.

## 4. How Speak / Sign translates a message

### Input

- **Typed text:** the input and Play button are in the avatar workspace. Press
  Enter or click Play.
- **Voice:** uses the browser's Web Speech API. English (India) and Hindi can
  be selected. Support and recognition quality depend on the browser, device,
  permissions and available speech service.
- **Live:** continuously processes stable pieces of speech. It uses the fast
  offline translator for those pieces so it does not wait for a network request
  for every word.
- **Quick phrases:** buttons for known vocabulary send canonical gloss tokens
  directly to the avatar.

### Translation to gloss

A **gloss token** is an uppercase label for a sign, for example `WATER`,
`THANK_YOU`, or `A-M-I-T`. It is an internal representation the app can map
to an animation; it is not a written description of every grammatical detail
of ISL.

`lib/islTranslator.ts` is the bridge used by the page:

- `translateToGloss(...)` tries the online API unless offline was selected or
  the browser is offline.
- `translateOffline(...)` uses the deterministic rule-based JavaScript
  translator in `components/avatar/textToGloss.js`.
- `lib/islVocabulary.ts` defines supported tokens and validates or converts
  results into tokens the avatar can play.

The offline translator includes English rules, Hindi/Devanagari handling,
dictionary aliases, a supported-sign vocabulary, token ordering and
fingerspelling for words without a supported sign. For example, an unknown
name can become `A-M-I-T`. A recognized word such as `THANK YOU` can become
one token, `THANK_YOU`.

The online route, `app/api/translate-isl/route.ts`, contains the server-side
Gemini prompt and validates the model output against the same vocabulary.
`GEMINI_API_KEY` is read by this server route; it is not a browser setting.

### From gloss to movement

`components/avatar/AvatarPlayer.tsx` creates a Three.js scene, loads the avatar
model, and plays a queue of sign animation frames. The animation modules under
`components/avatar/animations/` describe movements as changes to avatar bone
rotations:

- `Words/` contains authored word-sign movements.
- `Alphabets/` and `alphabets.js` contain letter movements.
- `numbers.js` contains digit movements.
- `defaultPose.js` defines the neutral pose.
- `signQueue.ts` contains queue and frame-stepping helpers that can be tested
  without a browser or 3D renderer.

For each gloss token, the player looks for a word animation. If there is no
word animation, it fingerspells the token using letter or number animations.
The **Default** and **Human** choices use different visual treatments of the
avatar; they share the sign animation system.

The React page sends avatar requests with increasing IDs. The avatar uses those
IDs to avoid replaying the same request during re-renders. Stop, reset, speed,
and append/replace behavior are also passed as props. The avatar is loaded
lazily so the large 3D code and model need not load before the user reaches the
demo.

## 5. How Sign → Text works

The root page includes a camera mode; the camera stage itself is in
`components/sign/sign-stage.tsx`. The user must deliberately accept the camera
privacy prompt before capture begins. The app requests camera video, not
microphone audio, for this feature.

`lib/sign/hand-tracker.ts` loads the local MediaPipe task and its local WASM
runtime from `public/mediapipe/`. It processes decoded video frames in the
browser and produces hand landmarks. The displayed preview can be mirrored,
but the tracker uses the original camera image.

The default Auto Preview can also use `lib/sign/signer-tracker.ts` to estimate
body and face landmarks locally. The static-pose and word-motion datasets are
still hand-focused; extra tracking information should not be confused with
proof that the recognizer understands all ISL body or facial grammar.

The recognition path uses code in `lib/sign/`:

- `features.ts` converts landmarks into normalized features.
- `knn-classifier.ts` matches static hand poses against labelled samples.
- `temporal-recognizer.ts`, `temporal-forest.ts`, and `word-recognizer.ts`
  implement the experimental movement/word recognition path.
- `unified-recognizer.ts` combines candidate sources and applies confirmation
  rules for Auto Preview.
- `stabilizer.ts` avoids adding a sign because of one noisy camera frame.
- `transcript-tokens.ts` tracks committed signs and transcript edits.
- `sentence.ts` and `app/api/sign/sentence/route.ts` support optional sentence
  formatting. If Gemini is unavailable, the route reports basic formatting
  rather than claiming it translated the sign.

The UI offers **Auto Preview**, **Spell**, **Numbers**, and **Words** modes.
Recognition may show possible matches that the user must confirm. The project
documentation describes recognition as experimental; source-dataset evaluation
does not guarantee webcam accuracy on a particular person's signs, camera or
lighting.

### Training and stored data

- `/sign/train` opens the static letter/number Training Studio.
- `/sign/train/words` opens the separate motion/word Training Studio.
- `/sign/validate` is a facilitated signer-validation tool.

Training uses the camera only after the user opens it and starts a recording.
Static pose samples and word-motion samples have different formats and are
stored in IndexedDB on that browser/device. The app also supports local JSON
import/export. These recordings are not automatically uploaded to the server.
The recognition baseline data and trained model files are in `public/models/`.

The bundled static dataset has reference poses for A–Z and 0–9; digit zero is
restricted to Numbers mode because its source images overlap with letter O.
The bundled temporal word model covers 152 of the avatar's 164 vocabulary
entries. Check `public/models/SIGN-DATA.md` for the exact sources, missing
classes, evaluation setup and licensing. Reported source-dataset results are
not equivalent to recognition accuracy from a live webcam.

Review `public/models/SIGN-DATA.md` before redistributing bundled recognition
data or model weights. Their source licenses and research-use restrictions
matter, and an experimental model should not be described as a validated
general-purpose ISL interpreter.

## 6. Project map: where to look first

```text
app/
  page.tsx                       Main landing page and Speak / Sign UI
  layout.tsx                     Shared HTML layout, metadata and global fonts
  globals.css                    Global styles
  api/
    translate-isl/route.ts       Server-side Gemini gloss endpoint
    sign/sentence/route.ts       Optional sign-transcript sentence formatting
  sign/
    train/page.tsx               Static-sign training route
    train/words/page.tsx         Word-motion training route
    validate/page.tsx            Facilitated validation route

components/
  avatar/
    AvatarPlayer.tsx             Three.js avatar, model loading and playback
    textToGloss.js               Offline text-to-gloss translation
    hindiToGloss.js              Hindi processing and transliteration
    glossDictionary.js           Dictionary-based language mappings
    signQueue.ts                 Testable animation queue helpers
    animations/                   Word, letter, number and neutral-pose movements
  sign/
    sign-stage.tsx               Camera stage and recognition controls
    training-studio.tsx          Static sample recorder and library UI
    word-training-studio.tsx     Word-motion recorder and library UI
    transcript.tsx               Sign transcript interface

lib/
  islTranslator.ts               Online/offline translation bridge
  islVocabulary.ts               Canonical playable tokens and validation
  live-speech.ts                 Helpers for streaming speech results
  local-account.ts               Device-local profile logic
  sign/                          Tracking, recognition, storage and transcript logic

public/
  models/                        Avatar, sign datasets, and trained model assets
  mediapipe/                     Self-hosted vision models and WASM support files

scripts/                         Data preparation, evaluation and coverage scripts
test/                            Node-based unit and integration tests
docs/                            Feature notes, architecture and sign-data documentation
```

Additional files to know:

- `package.json` declares dependencies and the commands described below.
- `tsconfig.json` enables strict TypeScript checks and the `@/` import alias.
- `next.config.mjs` contains Next.js configuration.
- `README.md` is the short overview and demo entry point.
- `docs/sign-status.md` summarizes the Sign → Text implementation and current
  limitations; individual `docs/sign-phase-*.md` files explain its development.
- `public/models/SIGN-DATA.md` records the sources and licensing of recognition
  data/model assets.

## 7. Commands for development and tests

Run these from the project root:

```powershell
npm run typecheck
npm test
npm run test:sign
npm run test:app
npm run build
```

- `npm run typecheck` checks TypeScript without emitting JavaScript.
- `npm test` runs the Node test files under `test/`.
- `npm run test:sign` runs tests for the recognition/sign subsystem.
- `npm run test:app` runs the app-facing test files.
- `npm run build` makes a production build.
- `npm run check` runs the vocabulary coverage check, typecheck, tests and
  production build in sequence.
- `npm run test:browser` runs the browser test runner; it needs the app running
  and Playwright/browser support available. See `test/browser/` for details.

Tests use Node's built-in test runner. Many of the translation and animation
tests load modules directly, which is why useful parts of the code are kept
independent of React and browser-only APIs.

## 8. Beginner-friendly code-reading order

Try this order rather than opening every file at once:

1. Read `README.md` for the short product description and demo.
2. Read `package.json` to see the scripts and technologies.
3. Read `app/layout.tsx`, then inspect the imports and state near the top of
   `app/page.tsx`. `layout.tsx` wraps the page; `page.tsx` is the main route.
4. Follow typed Play from the page to `lib/islTranslator.ts`, then to
   `components/avatar/textToGloss.js` for the offline path.
5. Follow the translation result back to the page and into
   `components/avatar/AvatarPlayer.tsx`.
6. Read `components/avatar/signQueue.ts`, then open one word animation and one
   letter animation to see how movement frames are authored.
7. For the camera feature, start at `components/sign/sign-stage.tsx`, then
   follow `useSignRecognition` in `lib/sign/use-sign-recognition.ts` to the
   tracker, recognizer and data store.
8. Read `docs/sign-status.md` and `public/models/SIGN-DATA.md` before making
   claims about model accuracy or data licensing.

### React ideas used in the app

- A **component** is a reusable function that returns part of the UI.
- **Props** pass information from a parent component to a child. The page passes
  translation requests and playback controls to `AvatarPlayer`.
- **State** (usually `useState`) stores values that should update the UI, such
  as selected language or whether the camera is open.
- **Refs** (usually `useRef`) hold changing values or browser objects without
  triggering a render, such as an abort controller, video element, or animation
  runtime.
- **Effects** (`useEffect`) connect React to browser systems such as camera
  events, timers, observers and keyboard listeners. They should clean up what
  they start.
- **Async/await** is used for network calls, camera/model initialization and
  browser storage.
- **API routes** run on the server and give the browser a controlled way to
  request operations such as Gemini translation.

## 9. Troubleshooting

### `npm` or `node` is not recognized

Install Node.js, close and reopen PowerShell, and check `node --version` and
`npm --version` again.

### Port 3000 is already in use

Stop the other development server, or follow the port printed by Next.js if it
offers another one. Do not start duplicate servers unless you intend to use
different ports.

### The avatar is blank or reports WebGL/model errors

Try a current Chrome or Edge browser, update graphics drivers, and reload the
page. The 3D avatar needs browser WebGL support and its model asset must load.
The app has a retry control when loading fails.

### Voice controls are disabled

The browser may not support the Web Speech API. Try a supported desktop
browser. Microphone access is for speech input; it is separate from the
Sign → Text camera flow.

### Camera access fails

Use `http://localhost:3000` for local development, allow camera access in the
browser, close other camera apps, and try again. The browser may not grant
camera access on an insecure non-local network address. Closing or pausing the
camera stage should stop the camera stream.

### Online translation does not work

Confirm that `.env.local` is in the project root and contains
`GEMINI_API_KEY=...`, restart the dev server, and check the server terminal for
errors. You can still select Offline mode; the API key is not needed for that.

## 10. Privacy, accuracy and scope notes

- Gemini translation is optional and the API key stays in the server
  environment. Text sent to the online translator is processed by the
  configured provider. Offline mode does not need that API call.
- Browser speech recognition is provided by the browser and may depend on its
  own services and settings.
- Sign → Text uses the camera locally for tracking. The training studios save
  landmark samples/motion data on the device rather than saving photos or
  uploading the camera stream.
- Landing-page profiles are device-local (`localStorage`), not server accounts.
  They do not synchronize to another browser or computer.
- A list of supported tokens or model labels does not prove that every sign is
  linguistically correct or works for every signer. Check the documentation,
  data provenance and evaluation limits before relying on a prediction.

For setup, vocabulary and feature-specific details, use this file together
with `README.md`, `docs/`, and the comments near the relevant source code.
