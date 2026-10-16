# Rewind

A photo-a-day app: take a consistent daily portrait, keep a streak, and watch the face change in
a face-aligned timelapse. Expo + React Native, dark theme, Android-first (iOS unverified).
Open source (MIT); contributor docs are in `README.md` and `CONTRIBUTING.md`.

## Package Manager

Always use `bun` — never npm or npx. Use `bun install`, `bun run`, `bunx` for all operations.

## Commands

- `bun start` — Metro for a development build (`bun run ios` / `bun run android` build one; Expo Go can't run this app)
- `bun run start:mock` — Metro with `EXPO_PUBLIC_MOCK_DATA=1` (seeds mock photos/profile)
- `bun run typecheck` — `tsc --noEmit`
- `bun run lint` — ESLint (Expo config; React Compiler rules are off on purpose, see `eslint.config.js`)
- `bun run test` — Jest (`bun run test:coverage` for coverage). Not bare `bun test`, which runs Bun's own runner.
- `bunx expo-doctor` — dependency check CI runs; fix drift with `bunx expo install --fix`
- `eas build --profile development|preview|production`, `eas update --branch preview` — EAS (CI does both, see `CONTRIBUTING.md`)

Verify changes with typecheck + lint + tests, and on a device for UI/camera work. Measure
performance only in a release build.

## Tech Stack

- **Expo SDK 57**, React Native 0.86, React 19, **expo-router** (file-based routing)
- **react-native-vision-camera** + MLKit frame processor — live face guide and auto-capture
- **MediaPipe Face Landmarker** (`modules/face-mesh`, local Expo module) — per-photo eye positions and face measurements
- **react-native-reanimated 4** / **react-native-worklets 0.10** — UI-thread animation, timelapse clock
- **expo-image** — photo display (local files use `cachePolicy` 'memory', see `utils/imageSource.ts`)
- Persistence: **AsyncStorage** (metadata) + **expo-file-system** (photo files, stored as q95 JPEGs)
- Type-only `@/types` (`PhotoEntry`, `FaceScan`, `FaceMeasure`, `Framing`, `UserProfile`, `AppSettings`, `Album`)

## Architecture

- `app/` — expo-router screens. `(tabs)/` = home/camera/profile; `album/[id]`, `album/timelapse`, `album/compare`, `album/settings`, `onboarding`.
- `components/` — grouped by domain: `camera/`, `timelapse/`, `timeline/`, `face/`, `profile/`, `ui/`.
- `context/AppContext.tsx` — **single source of truth** for photos/profile/settings/albums. Loads from storage on mount; mutations update React state then save through a serial queue (errors log + haptic, never throw); `updatePhotos` resolves with whether its save succeeded. Also owns album unlock state.
- `hooks/` — feature logic (`usePhotos`, `useStreak`, `useTimelapse`, `useFaceDetection`, `useAutoCapture`, `useAlbumLock`, `useFaceScanBackfill`, `usePhotoEncodeBackfill`).
- `utils/` — pure helpers: `faceScan` (MediaPipe scan), `faceMetrics` / `faceTrend` (measurements, trend), `faceAlign` / `ghost` (eye-anchored layouts, album framing), `cameraPreview` (detector → preview coordinates), `playback`, `photoEncode`, `storage`, `import` / `export`, `pin`, `notifications`, `haptics`.
- `modules/face-mesh/` — native module (Kotlin + Swift) + bundled `face_landmarker.task`.
- `patches/` — dependency patches applied by `bun install` (VisionCamera: no video output for frame processors).
- `constants/theme.ts` — design tokens. `constants/mockData.ts` — `USE_MOCK_DATA` (env-gated) + fixtures.

## Conventions

- Import via the `@/` alias (maps to repo root) — `@/utils/storage`, `@/types`, etc.
- **Read/write app data through `AppContext`, not `utils/storage` directly**, so React state stays in sync. `storage.ts` is the persistence layer behind it.
- Use the `Colors` / `Typography` / `Spacing` / `BorderRadius` / `Sizes` tokens from `constants/theme.ts` — don't hardcode colors or font families (the app uses the CommitMono mono font throughout).
- Storage reads guard `JSON.parse` and fall back to empty/defaults on corruption — preserve that resilience.
- Haptics go through `utils/haptics` (`haptics.error()`, etc.), never `expo-haptics` directly.
- Conventional Commits (`type(scope): description`).

## Gotchas

- **expo-file-system v2 (`File`/`Directory`) is async for `copy`/`move`/`base64`** (since SDK 56) — always `await` them (`copySync`/`moveSync`/`base64Sync` exist but block JS). `write`/`delete`/`create` stay sync.
- **`android/` and `ios/` are generated** (`expo prebuild`) and gitignored. Change native config via `app.json`, `modules/` or `patches/`, never in the generated folders.
- **Camera coordinates**: MLKit frame-processor px are in the upright, unmirrored frame; VisionCamera always mirrors the front preview. Map with `utils/cameraPreview.ts`. Frame-processor results reach JS as **read-only arrays** — map into new arrays, never in place.
- **Photos are re-encoded once** (`encoding: 'q95'`); never re-encode a flagged photo. Bump `FACE_SCAN_VERSION` in `utils/faceScan.ts` to rescan after changing what a scan stores.
- **Layout**: a bordered `flex: 1` item comes out bigger than its siblings (Yoga floors its base size at the border) — draw borders as an inner overlay. `StyleSheet.absoluteFillObject` no longer exists in RN 0.86.
- `REFINEMENT_BACKLOG.md` (untracked, local) tracks audit findings and remaining taste calls.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
