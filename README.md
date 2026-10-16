# Rewind

A photo-a-day app. Take a consistent daily selfie, keep a streak, and watch your face change
over months in a face-aligned timelapse. Built with Expo and React Native; everything stays on
your phone.

[![ci](https://github.com/Wavefire5201/rewind/actions/workflows/ci.yml/badge.svg)](https://github.com/Wavefire5201/rewind/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- **Daily capture with a framing guide.** Yesterday's photo appears as a faint ghost, placed
  where your face should go. Live face detection tracks your face, tells you to move closer or
  back, and can take the shot automatically once you're lined up. Hold the shutter to save your
  current framing for the album.
- **Streaks and reminders.** A calendar per album, streak and consistency stats, and an optional
  daily reminder.
- **Face-aligned timelapse.** Every photo is lined up on your eyes, so the timelapse holds still
  while your face changes. Plays smoothly up to 8x (16 photos a second), with a scrubber,
  filmstrip and date range.
- **Face change over time.** Measures face width relative to eye spacing in each photo
  (MediaPipe Face Landmarker), corrects for how close you held the camera, and shows the trend:
  "lower face 4% thinner than 6 months ago". Compare any two days side by side.
- **Albums**, each optionally locked with a PIN or biometrics.
- **Import and export.** Import from your camera roll or a Rewind backup; export to a backup
  file or to your photo library.

## Privacy

Photos, face measurements and settings live only on the device (app storage and
AsyncStorage). Face detection and measurement run on-device. There is no account and no
server.

## Getting started

Rewind uses native modules (VisionCamera, MLKit and a MediaPipe module in `modules/face-mesh`),
so it runs in a **development build**, not Expo Go.

**Prerequisites:** [Bun](https://bun.sh) 1.3+, and Android Studio (JDK 21, Android SDK) and/or
Xcode.

```bash
bun install            # also applies patches/ to dependencies
bun run android        # build and install a development build on a device/emulator
bun start              # then start Metro for that build
```

`bun run start:mock` seeds mock photos so you can explore without a camera.

Android is the primary test platform. iOS builds aren't verified yet: the MLKit face detector is
excluded on iOS (see `react-native.config.js`), and the MediaPipe module's iOS side is untested.

## Development

| Command | What it does |
|---|---|
| `bun run typecheck` | TypeScript (`tsc --noEmit`) |
| `bun run lint` | ESLint with the Expo config |
| `bun run test` | Jest unit and component tests (`bun run test:coverage` for coverage) |
| `bunx expo-doctor` | Checks dependencies match the Expo SDK |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the architecture, conventions, native code,
device testing and how releases work.

## Tech

Expo SDK 57 · React Native 0.86 · React 19 · expo-router · react-native-vision-camera ·
MLKit (live face guide) · MediaPipe Face Landmarker (photo measurement) · Reanimated 4 ·
expo-image · TypeScript · Jest

## License

[MIT](LICENSE)
