# APP-1 handoff: Capacitor shell and CI test builds

Base: `143e23e` (main). No migration. No Edge. The `/apply` route was not edited. Locked Pages files were not edited.

## What changed

| Item | Where | Grade |
| --- | --- | --- |
| App id `com.boardarabia.app`, name Board Arabia, web dir `dist` | `capacitor.config.ts:4` | VERIFIED |
| Android application id | `android/app/build.gradle:7` | VERIFIED |
| iOS display name Board Arabia | `ios/App/App/Info.plist:10` | VERIFIED |
| App web build forces base path `/` and does not run the Pages prerender | `scripts/build-app.mjs:4`, `scripts/build-app.mjs:15` | VERIFIED |
| Pages `npm run build` still runs the prerender. `build:app` is separate | `package.json:8` | VERIFIED |
| CI on pull request and workflow dispatch only. No schedule | `.github/workflows/app-builds.yml:3` | VERIFIED |
| Android debug APK artifact `android-debug-apk` | `.github/workflows/app-builds.yml:61` | VERIFIED |
| Unsigned iOS simulator artifact `ios-simulator-app` | `.github/workflows/app-builds.yml:95` | VERIFIED |
| Workflow reads no Actions secrets | `.github/workflows/app-builds.yml` has no `secrets.` reference | VERIFIED |
| Icons and splash generated from `public/favicon.svg` via `assets/logo.svg` | `assets/logo.svg` | VERIFIED |
| Local run steps | `README.md:62` | VERIFIED |
| Slash helper renamed so the iOS typecheck can resolve the component on macOS | `src/shell/slashlessPath.ts`, `src/shell/TrailingSlash.tsx:2` | VERIFIED |

The macOS typecheck resolves `./shell/TrailingSlash` to a `.ts` file when a sibling file differs only by case. `trailingSlash.ts` was renamed to `slashlessPath.ts`. `src/App.tsx` was not edited.

## CI

Run `38455137586` on `169910d` passed both jobs:

- Artifact `android-debug-apk` (`app-debug.apk`)
- Artifact `ios-simulator-app` (`BoardArabia-ios-simulator.zip`, contains `App.app` and `public/index.html`)

PR checks and the CSP crawl on the same commit also passed. The debug APK is signed by the keystore Android creates on the runner. The iOS job sets `CODE_SIGNING_ALLOWED=NO`.

## Shot

`handoff/app-1-capacitor-shell/android-emulator-splash.png` is the debug APK on an Android 14 emulator. The native splash shows the Board Arabia mark. The emulator WebView renderer then crashed inside `libwebviewchromium.so` before Home painted. That crash is in this emulator image, on both SwiftShader and GPU off. The packaged `index.html` is the Vite shell at `/`.

## Not done

No migration. No Edge deploy. No store upload. No signing material in git. The owner does not add Actions secrets for these test builds.

## Secrets grade

VERIFIED. The diff adds no private key, JWT, cloud API key, mailbox, password, keystore, certificate, or provisioning profile. The only private-key string is a test assertion that the workflow must not contain one. The only `@` hit is the icon filename `AppIcon-512@2x.png`. Keystore names appear only as gitignore rules and the same test. CI copies `.env.example` at build time and does not inline the anon key.
