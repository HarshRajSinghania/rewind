# Rewind — Refinement Backlog

_From a verified multi-area audit (originally 49 confirmed findings). **Every actionable finding is now shipped** — what remains is taste calls (need a human design decision), a few documented sub-items, and on-device verification of the ghost overlay._

> **Legend:** `[x]` shipped · `[~]` partial · `[ ]` open · 🎨 deferred taste call

## ✅ Infra wave (Sep 2026)

| What | Detail |
|------|--------|
| SDK 55 → 57 | `expo@57.0.19`, RN 0.86.3, TS 6.0.3, worklets 0.10. Fixes the SDK 56 Hermes V1 memory regression (hit this app's reanimated/worklets stack). Direct jump justified: 56's only value was Expo UI/router fork, neither used here |
| File-system async migration | SDK 56 made `copy`/`move`/`base64` async — `createPhotoEntry` + `CapturePreview` save + import/export now `await` (export's un-awaited `base64()` only worked by accident via JSZip promise-input) |
| Deployment target | iOS 16.0 → 16.4 (SDK 57 minimum); root `splash` → `expo-splash-screen` plugin; `absoluteFillObject` (removed in RN 0.86) inlined; stale `expo-modules-core` iOS patch dropped (fixed upstream via `default:` case) |
| EAS | `eas.json` (development/preview/production + submit), `expo-updates` + `runtimeVersion: appVersion`. Still needs: `eas init` (projectId placeholder is zeros), `EXPO_TOKEN` secret, first device build |
| Tests | Jest + `jest-expo` + RNTL v14, 103 tests, ~83% line coverage w/ enforced thresholds. Pure extractions: `utils/streak.ts`, `utils/alignment.ts`. Mocks: AsyncStorage, expo-haptics/crypto/notifications/localization, in-memory `File`/`Directory` |
| CI | `.github/workflows/ci.yml` (bun install → typecheck → jest coverage → doctor → Metro export); `eas-build.yml` (manual dispatch, needs `EXPO_TOKEN`) |
| Bugs found by tests | `getDayNumber` DST undercount (`floor` across 23h days) + afternoon inflation (compared against now instead of today-midnight); `addPhotos` return counts depended on React eager-eval timing (fixed via `photosRef` mirror) |
| Auto-capture efficiency | Frame processor + `video` now gated on face-guide visibility (was always-on); every-2nd-frame MLKit skip via worklets shared value; React propagation throttled to ~10Hz (presence changes instant); stale face state reset on guide-off |

## 🔬 Needs on-device verification

## ✅ Shipped

| Commit | What |
|--------|------|
| `b4e38c2` | Schedule daily reminder on onboarding completion |
| `d86ead4` | Storage hardening: guarded JSON.parse, allSettled load, catching saves, CapturePreview copy-failure |
| `adff56d` | Remove dead screens, dedupe Typography, prune tokens, kill Coming-Soon stubs |
| `2f86707` | Face pipeline refinement + capture robustness (re-entrancy, MLKit availability, permission deep-link) |
| `2d47a14` | Timelapse playback edge cases (frame clamp, stale timer, seek-pauses) |
| `99bdebd` | PIN remove/intent/lockout, album empty-state + join-date stat, import validation/progress/batch |
| `7e457ca` | Ghost overlay landmark alignment (⚠️ needs on-device verification) |
| `c3f4633` | Camera UX: timer cancel, timer-armed tint, graduated auto-capture haptic, face-guide status line |
| `72ad9e7` | Timelapse export/playback: dismissible progress, honest counts, <2 guard, image transition, lock haptic |
| `20f3cd4` | Streak join-date bound, greeting foreground refresh, calendar empty affordance, rename validation |
| `a2f03e8` | Back/skip navigation in onboarding + indexed import review |

### Shipped by area (audit findings, all `[x]`)

- **Camera:** takePhoto error handling/re-entrancy · CapturePreview copy-failure · MLKit-unavailable toggle · permission deep-link · ghost landmark alignment · face-guide status line · timer cancel · timer-armed feedback · auto-capture haptic
- **Timelapse:** frame-index clamp · stale-timer teardown · seek-pauses-playback · dismissible export progress · honest export counts (remote skip) · <2-photo guard · image loading transition · MP4 copy fix
- **Albums:** empty-album state · join-date 'missed' stat · lock confirmation haptic · rename empty-input validation
- **Home/timeline:** 'missed' stat join-date · PhotoModal edit stub removed · currentStreak join-date bound · calendar empty-month affordance · greeting/day foreground refresh
- **Profile/PIN:** onboarding reminder · explicit PinModal intent · remove-passcode · lockout countdown · onboarding back nav
- **Data/import:** fire-and-forget saves · corrupt-JSON isolation · manifest validation/filenames/progress · missing-file hard-fail · batch addPhotos (O(n²) fix) · dedup + honest counts · import review back/skip
- **Cross-cutting:** dead duplicate screens removed · Typography dedup · unused theme tokens pruned

---

## 🔬 Needs on-device verification

- [~] **Ghost overlay landmark alignment** (`7e457ca`) — wired and reviewed-correct, but MLKit is simulator-only so real alignment is unconfirmed. **Known limitation:** ghost landmarks are stored in preview space, so toggling `mirrorSelfies` between capture and view (+ the save-time front-camera flip) can mirror the X alignment. **Resolve after hardware test** — likely by persisting capture-time mirror/facing state on `PhotoEntry` and reconciling; confirm the image-vs-landmark orientation against real frames first.
- [~] **Timelapse face alignment** — **Android verified on device** (OnePlus CPH2583, Android 16, Oct 2026) with a 14-day synthetic set (one AI face, known shift/scale/tilt): eyes lock across all face frames incl. mirrored, far-away, 18° tilt, **EXIF-rotated**, landscape; no-face day plays unaligned; mean of aligned frames is a sharp face vs a smear unaligned. Device testing found + fixed: `transformOrigin` string crashed Android (RN parser is integer-px only → array form), and per-frame `recyclingKey` flashed on most 4× transitions even warm (→ double buffer: 0 blank frames cold/warm). **Still open:** (a) iOS — untested, and `react-native.config.js` excludes the face detector from iOS, so the toggle is hidden there until device builds drop that exclusion; (b) real front/back camera captures (synthetic frames only so far); (c) large-album first scan time + memory (14 photos scanned in <3 s); (d) 4× pacing: median frame hold 150 ms vs 125 ms target, ~1 in 5 held ~250 ms (onLoad round trip) — pre-mount the *next* frame hidden ahead of its tick to smooth it.
- [x] **Android native build needed Skia's binaries** — bun blocked `@shopify/react-native-skia`'s postinstall, so `assembleDebug` failed ("Skia prebuilt binaries not found"). Skia was unused since `2f86707`, so it was removed from `package.json`; autolinking no longer links it. It stays in `bun.lock` only as VisionCamera's optional peer (not built into the app).
- [x] 🎨 **Duplicate "take photo" on an empty album** → decided: removed the empty-state "take a photo" CTA; the bottom-bar "Take photo" is the single entry point.

## 📌 Open sub-items

_All cleared (`77a8abf`)._

- [x] **Import cancel mid-loop** — `importFromBackup` now checks the cancel flag between entries; `settings.tsx` passes `importCancelRef` and suppresses the error Alert on 'Cancelled'. `utils/import.ts`
- [x] **Broken-image fallback** — new `components/ui/PhotoImage.tsx` shows a placeholder tile when a local file is missing/evicted; swapped in at the home hero + recent thumbnail, Filmstrip, PhotoModal, and calendar cells. (Optional `File(uri).exists()` integrity-on-load not pursued — fallback covers the user-visible case.)
- [x] **Calendar dashed-cell on Android** — dashed border is now iOS-only via `Platform.select`, solid border elsewhere. `components/timeline/CalendarGrid.tsx`

---

## 🎨 Taste Calls — decided

All surfaced to the user and resolved:

- [x] **Week-start convention** → auto from device locale (`expo-localization`, Sunday fallback) — `f084ff3`
- [x] **Album list sort order** → most-recent activity (newest photo, fallback createdAt) — `0033c83`
- [x] **Per-row album management** → swipe-to-reveal rename + delete on the home list — `0033c83`
- [x] **Row density** → resolved by moving rename/delete into the swipe menu — `0033c83`
- [x] **'photo quality' setting** → wired into VisionCamera `photoQualityBalance` + storage estimate — `e518c7a`
- [x] **Shutter long-press affordance** → contextual hint + "reference set" confirmation + neutral idle color — `e518c7a`
- [ ] **Real GIF/MP4 export** → decision: **leave as coming-soon** (large feature, no work done)
- [ ] **Cloud backup field** → decision: **keep** `cloudBackupEnabled` for a future backup service (no change)
- [ ] **Storage schema version** → decision: **defer** until a real migration is needed (no change)

### ⚠️ Note on the album work
The audit referenced `app/(tabs)/albums.tsx`, but that screen was deleted as an orphan in `adff56d` — the **live** album list is `HomeScreen` in `app/(tabs)/index.tsx`. The sort + swipe were applied there (a workflow agent first recreated the orphan from the stale path; it was deleted and the work re-homed correctly).

### Needs a dev-client rebuild to take effect
- `expo-localization` (week-start) — native module, added to `app.json` plugins.
- VisionCamera `photoQualityBalance` — already-native, but verify on device.
- Ghost overlay alignment (`7e457ca`) — still pending on-device verification (see above).

---

## TODO.md Cross-Reference

| TODO.md item | Status |
|---|---|
| Persist face landmarks (line 5) | ✅ Done (capture saves `faceLandmarks`); powers ghost alignment |
| Wire up `useAutoCapture` (line 6) | ✅ Wired + haptic polish (`c3f4633`) |
| Fix FaceGuide contour rendering (line 7) | ✅ Committed in face pipeline (`2f86707`) |
| Consolidate `(tabs)/timelapse.tsx` (line 12) | ✅ `adff56d` |
| Home vs Albums navigation (line 13) | ✅ `adff56d` |
| Remove cloud backup toggle (line 14) | ✅ Row removed (`adff56d`); field cleanup deferred 🎨 |
| Deduplicate FontContext vs theme.ts (line 15) | ✅ `adff56d` |
| Delete empty `components/home/` (line 16) | ✅ Already absent |
| Wire Export GIF/MP4 or remove (line 17) | ✅ MP4 copy fixed; real export deferred 🎨 |
