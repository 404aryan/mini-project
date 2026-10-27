# Yap & Render: Tech Stack Explained

This guide explains the technologies used by Yap & Render, what each one does
in this particular project, and how they work together. It is written for a
student who is learning web development.

For a complete project introduction and Windows run instructions, also see
[`beginner.d`](./beginner.d) and [`README.md`](./README.md).

## 1. The short version

Yap & Render is a web application. The user's browser displays the interface
and runs most interactive features. A Next.js server serves the pages and
provides API routes for operations that need the server, including optional
Gemini requests.

```text
Browser (React UI, speech, camera, avatar, recognition)
                   |
             HTTP requests
                   |
Next.js server (pages and API routes)
                   |
       Optional Google Gemini API
```

The main languages and technologies are:

| Technology | What it means | How this project uses it |
|---|---|---|
| TypeScript | JavaScript with optional static types | Most React pages, UI components, API routes and libraries |
| JavaScript | The language that runs in browsers and Node.js | Some existing translation and sign-animation modules |
| React | A library for building user interfaces from components | Builds the page, controls, camera stage and training screens |
| Next.js | A web framework built around React | Serves pages, supports server-side API routes, bundles assets and runs the development server |
| Node.js and npm | JavaScript runtime and package manager | Node runs development/build/test commands; npm installs packages |
| CSS, Tailwind CSS and PostCSS | Styling technologies and build-time CSS processing | Tailwind is included; the project also has substantial custom CSS for its visual design and camera experience |
| Three.js | A browser 3D graphics library | Loads and renders the signing avatar and animates its bones |
| MediaPipe Tasks Vision | Browser-based computer-vision tools | Tracks hands locally for the separate camera-based Sign → Text feature |
| Google Gemini API | A hosted generative AI service | Optional online text-to-ISL-gloss translation and optional transcript sentence formatting |

The exact package versions and runnable commands are in `package.json`.

## 2. What runs where?

It helps to separate the browser, the local development server, and external
services:

### In the browser

React renders the interface. The browser also runs the offline translator,
speech recognition integration, Three.js avatar, MediaPipe tracking, camera
preview, and recognition logic. User camera frames are processed locally by
the sign-tracking code.

The browser uses built-in Web APIs too:

- `fetch` sends requests to this app's API routes.
- Web Speech API interfaces provide speech recognition where supported.
- `getUserMedia` is used to request camera video after the user chooses the
  camera feature and grants permission.
- IndexedDB stores personal training samples on the current browser/device.
- `localStorage` stores small local profile and preference data.
- Web Workers run some recognition matching work away from the main UI thread.

These are browser features, not extra server products. Availability can differ
between browsers and devices.

### On the Next.js server

Next.js serves the application and runs route handlers under `app/api/`.
For example, `app/api/translate-isl/route.ts` receives a text request, reads
the server-side `GEMINI_API_KEY`, calls Gemini if configured, validates the
result, and sends a response to the browser.

The browser should call this app's API route rather than receiving a Gemini
secret key. This is why the key is named `GEMINI_API_KEY`, not
`NEXT_PUBLIC_GEMINI_API_KEY`.

### At Google's Gemini service

When the online translator is selected and a key is configured, the server
sends the text to Gemini and receives a candidate gloss-token list. That
service is optional: the app has an offline rule-based translator as a
fallback.

## 3. Front end: React and Next.js

### React components

React lets the interface be broken into components. A component is typically a
function that returns a piece of the page. For example:

- `app/page.tsx` assembles the landing page and main translator experience.
- `components/avatar/AvatarPlayer.tsx` owns the avatar player.
- `components/sign/sign-stage.tsx` renders the camera recognition experience.
- `components/sign/training-studio.tsx` renders the static-sign training page.

The page passes information to child components through **props**. For example,
the page gives `AvatarPlayer` a list of requests and controls for speed, reset,
avatar type and status.

React **state** is used for values that should update the page, such as the
selected translation engine or current input text. **Refs** hold values such as
a video element or animation runtime that can change without requiring a
re-render. **Effects** connect React to external browser behavior, such as
camera events, observers, timers and animation-frame loops.

`'use client'` at the top of a component marks it as client-side interactive
code. Browser-only APIs such as `window`, `navigator`, camera elements and
WebGL belong in client-side code rather than a server-rendered component.

### Next.js App Router

This project uses the Next.js `app/` directory:

- `app/page.tsx` is the home page (`/`).
- `app/sign/train/page.tsx` maps to `/sign/train`.
- `app/sign/train/words/page.tsx` maps to `/sign/train/words`.
- `app/sign/validate/page.tsx` maps to `/sign/validate`.
- `app/api/translate-isl/route.ts` provides the `/api/translate-isl` API route.

Next.js supplies the development server, route system, asset handling, and
production build. `app/layout.tsx` is the shared outer layout; it sets page
metadata, loads the fonts, imports global styles, and includes Vercel Analytics
only in production.

### TypeScript and JavaScript

TypeScript adds type annotations to JavaScript. A type can describe the shape
of data, such as a translation result containing tokens and a selected mode.
This helps the editor and the `typecheck` command catch some mistakes before
the app runs.

Most current app and library code is TypeScript (`.ts` or `.tsx`), while some
older translation and animation code is JavaScript (`.js`). The TypeScript
configuration allows JavaScript imports so these modules can work together.
The `@/` prefix is an import alias for the project root; for example,
`@/lib/islTranslator` refers to a file in `lib/`.

## 4. Styling and animation

### CSS, Tailwind and PostCSS

The user interface is styled with CSS. The project imports Tailwind CSS through
`app/globals.css`, and `postcss.config.mjs` connects Tailwind to PostCSS during
the build.

This project also uses detailed custom styles:

- `app/globals.css` sets theme variables and much of the landing-page layout.
- `app/sign.css` styles the camera stage and sign-related views.
- `app/sign-story.css` styles the sign-to-text story.

So it is more accurate to say the project uses **Tailwind plus substantial
custom CSS**, not that every visual element is built only from Tailwind utility
classes. The `components.json` file is configuration for the project's
shadcn-style UI setup. The package list also includes Base UI and shared class
helpers; a dependency being installed does not necessarily mean every screen
uses it.

### Motion

The `motion` package (imported in code from `motion/react`) animates interface
elements: transitions, reveals and interactive visual effects. This is separate
from the avatar's sign animation. The avatar movements are driven by Three.js
and the project's own animation frame tables.

## 5. Text-to-sign: how the stack works together

Here is a typed-message example:

```text
1. React input in app/page.tsx holds the user's text.
2. The user selects Play.
3. lib/islTranslator.ts chooses online or offline translation.
4. If online, fetch() calls this app's /api/translate-isl endpoint.
5. The Next.js API route calls Gemini on the server, if configured.
6. The result is checked against lib/islVocabulary.ts.
7. If the online request fails, times out or is unavailable, the client uses
   components/avatar/textToGloss.js instead.
8. The page sends the resulting gloss tokens to AvatarPlayer.
9. Three.js draws the avatar and applies the authored bone movements.
```

### Gloss is the hand-off format

The translator and avatar need to agree on token names. They use **gloss
tokens**, such as `WATER`, `THANK_YOU` or `A-M-I-T`. `lib/islVocabulary.ts`
contains the shared vocabulary and sanitizing helpers that keep tokens
playable.

For example, if an input word has no dedicated word animation, it may be
represented as hyphen-separated letters. The avatar then selects alphabet
animations for those characters.

### Gemini is optional

`app/api/translate-isl/route.ts` uses the `@google/genai` package on the server.
It requests JSON containing a list of supported tokens and checks that the
tokens are usable. The client does not wait forever: the bridge has a short
timeout and falls back to offline translation. Therefore the demo can run
without a Gemini key.

The offline path is not a large language model. It consists of authored rules
and mappings in `components/avatar/textToGloss.js`,
`components/avatar/glossDictionary.js`, and `components/avatar/hindiToGloss.js`.
It is deterministic: the same input and code generally produce the same gloss.

## 6. The 3D avatar: Three.js

Three.js provides the low-level browser 3D scene: renderer, camera, lights,
model loading and bones. `components/avatar/AvatarPlayer.tsx` imports Three.js
directly and uses `GLTFLoader` to load a 3D model. It applies authored
rotations to the model's rig (the collection of bones controlling the avatar).

Animation data is organized under `components/avatar/animations/`:

- Word modules describe movements for individual supported words.
- Alphabet modules describe fingerspelling letters.
- Number modules describe digit signs.
- `defaultPose.js` describes the neutral position.
- `components/avatar/signQueue.ts` schedules and advances movement frames.

In simplified terms:

```text
gloss token → find word animation → enqueue bone instructions
             → if no word animation, enqueue letters/digits
             → Three.js updates the rig and draws each frame
```

The dependency manifest also lists `@react-three/fiber` and `@react-three/drei`,
which are React-oriented Three.js packages. The main `AvatarPlayer.tsx` path,
however, imports and manages Three.js directly. When studying the current
avatar, follow its imports rather than assuming every installed 3D package
participates in that renderer.

## 7. Sign-to-text: MediaPipe and recognition

Sign → Text is a different feature from the avatar translator. It uses
`@mediapipe/tasks-vision` to estimate hand landmarks from camera frames in the
browser. A landmark is a point on a detected hand, such as a fingertip or
joint. The app turns those points into numeric features, then compares them
with sign samples or motion models.

```text
camera video → MediaPipe hand landmarks → normalized features / motion windows
             → recognizer → stable candidate → user confirmation or transcript
```

Relevant source files include:

- `components/sign/sign-stage.tsx`: camera-stage user interface and controls.
- `lib/sign/hand-tracker.ts`: local MediaPipe setup and video-frame tracking.
- `lib/sign/features.ts`: converts hand landmarks into features.
- `lib/sign/knn-classifier.ts`: compares static poses with reference samples.
- `lib/sign/word-recognizer.ts` and `lib/sign/temporal-recognizer.ts`: word
  motion recognition paths.
- `lib/sign/use-sign-recognition.ts`: connects tracking and recognition to the
  React camera stage.
- `lib/sign/sample-store.ts`: validates and stores static training samples.

Tracking and recognition can use browser capabilities such as Web Workers.
Training data and word data have distinct formats. Personal recordings are
stored locally in IndexedDB and can be exported or imported as JSON. The model
assets and bundled datasets are under `public/models/`; MediaPipe runtime
assets are under `public/mediapipe/`.

Camera processing is designed to run locally in the browser. Do not infer that
this makes every part of every feature offline: Gemini-based translation and
some browser-provided speech recognition may communicate with online services.
The camera privacy and dataset limits are explained in `docs/` and
`public/models/SIGN-DATA.md`.

## 8. APIs and data storage

An **API** is a defined way for one part of a program to ask another part to do
something. In this project, the browser sends an HTTP `POST` request to
`/api/translate-isl` with text. The route responds with JSON, for example a
list of tokens or an error.

The project has two relevant storage types:

- `localStorage` holds small browser-local values, including the simple local
  profiles implemented in `lib/local-account.ts`. These profiles are not
  accounts on a shared server and do not sync between devices.
- IndexedDB stores the larger static and word training datasets for the
  current browser and site origin.

The repository does not show a conventional remote application database or
server-side account system for these features. Avoid describing local browser
storage as cloud storage.

## 9. Supporting packages in `package.json`

The direct dependencies include more than the technologies discussed above:

- `@google/genai`: Gemini API client used by server-side API routes.
- `@mediapipe/tasks-vision`: hand/vision task APIs used by camera features.
- `three`: 3D rendering used directly by the avatar player.
- `@react-three/fiber`, `@react-three/drei`: React-oriented Three.js packages
  present in the dependency manifest.
- `motion`: interface animation.
- `lucide-react`: SVG icon components used in the UI.
- `@base-ui/react`, `shadcn`, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `tw-animate-css`: UI primitives, class/style helpers and
  animation-related styling packages.
- `@vercel/analytics`: analytics component included by the root layout in
  production.

Development dependencies include TypeScript and React/Node/Three type
definitions, Tailwind's PostCSS integration, and Playwright for browser testing.
An installed dependency is available to the project, but it may not be imported
by the main application path; verify usage before attributing behavior to it.

## 10. Build and test tools

From PowerShell, in the project folder:

```powershell
npm install
npm run dev
```

`npm install` reads `package.json` and the lock file to install dependencies.
`npm run dev` starts the Next.js development server.

Other useful scripts:

| Command | Purpose |
|---|---|
| `npm run typecheck` | Run TypeScript checks without producing output files |
| `npm test` | Run the project's Node-based test suite |
| `npm run test:sign` | Run the sign-recognition-focused test files |
| `npm run test:app` | Run the app/API-focused test files |
| `npm run build` | Create an optimized Next.js production build |
| `npm run start` | Serve a build made by `npm run build` |
| `npm run check` | Check vocabulary coverage, types, tests and production build |

The test scripts use Node's built-in test runner; Playwright is used by the
optional browser-test script. Many helpers are deliberately separated from
React and browser globals so they can be tested as ordinary data-processing
functions.

## 11. Mental model: put it all together

Use this summary when explaining the stack to someone else:

```text
React builds the screens.
Next.js connects those screens to web routes and supplies the server/build tools.
TypeScript helps describe and check the application's data and functions.
CSS and Tailwind style the screens; Motion animates interface transitions.
Three.js renders the 3D avatar and plays authored bone movements.
MediaPipe detects hand landmarks for a separate local camera-recognition feature.
Gemini optionally translates text on the server; authored local rules are the fallback.
Node.js and npm run the development, test and build commands.
```

The text-to-avatar path and the camera-recognition path share ISL vocabulary and
some project data, but they solve different problems. One translates text into
avatar animation requests; the other estimates signs from camera movement and
produces a transcript.

## 12. Where to continue learning in this repository

1. Start the project using `beginner.d`.
2. Read `package.json` to see actual dependencies and scripts.
3. Follow typed Play from `app/page.tsx` to `lib/islTranslator.ts`.
4. Follow the output tokens into `components/avatar/AvatarPlayer.tsx` and
   `components/avatar/signQueue.ts`.
5. Separately, follow the camera stage into `lib/sign/use-sign-recognition.ts`
   and `lib/sign/hand-tracker.ts`.
6. Read `docs/sign-status.md` and `public/models/SIGN-DATA.md` before drawing
   conclusions about recognition or model accuracy.

The best way to learn the architecture is to trace one value through the code:
start with typed text, find where it becomes gloss tokens, find who receives
those tokens, and see where the avatar turns them into animation frames.
