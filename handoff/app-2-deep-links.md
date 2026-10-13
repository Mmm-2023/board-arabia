# APP-2 handoff: deep links and the WebView crash

Base: `main`. No migration. No Edge. `pages.yml` gained only the two Actions variable lines for `APPLE_TEAM_ID` and `ANDROID_APP_LINK_SHA256`. The other locked Pages files were not edited.

## WebView crash

The native splash starts, then the WebView renderer traps before Home can paint. The page's CSS and JS are never requested, so this is not a CSP failure, a bad base path, or the slashless router.

| Image | WebView | Result |
| --- | --- | --- |
| API 34 Google APIs x86_64 (Android 14) | 113.0.5672.136 | `CrRendererMain` SIGTRAP (`SI_KERNEL`) inside the Trichrome library `libmonochrome_64.so` |
| API 35 Google ATD x86_64 | 124.0.6367.219 | SIGTRAP inside `libwebviewchromium.so`, then crashpad aborts the app. Removing the relative-color `rgb(from ...)` rule from the CSS did not change it |
| API 36 Google ATD x86_64 | 133.0.6943.137 | Same SIGTRAP inside `libwebviewchromium.so`, including with WebView flags `--single-process --disable-gpu` (the log confirmed those flags loaded) |

This host cannot use KVM. Creating a vCPU hits a kernel BUG in `kvm_arch_vcpu_create` (`arch/x86/kvm/x86.c`). Every boot used `-no-accel`. The guest logs `Unexpected CPU variant for x86: x86_64`. A `-cpu qemu64` boot hung before adb. ATD screenshots came back as a black 720x1280 frame. The API 34 image could capture the system UI, and that capture showed the splash path, not Home.

A working image that paints Home was not found on this machine. The trap is inside the WebView library, before the site's script runs, on three WebView versions under software CPU emulation.

## Deep links

| Item | Where | Grade |
| --- | --- | --- |
| Incoming URL helper (https site, custom scheme, external hosts) | `src/shell/incomingLink.ts:28` | VERIFIED |
| Android back: history, then exit | `src/shell/incomingLink.ts:17`, `src/shell/NativeShell.tsx:85` | VERIFIED |
| Open handler for app links and the custom scheme | `src/shell/NativeShell.tsx:82` | VERIFIED |
| External http(s) links open in the system browser | `src/shell/NativeShell.tsx:48` | VERIFIED |
| Safe area padding only when the native class is set | `src/index.css:1402` | VERIFIED |
| Status bar style dark (light icons) on brand indigo | `capacitor.config.ts:10`, `android/app/src/main/res/values/colors.xml` | VERIFIED |
| Android app links and `com.boardarabia.app` | `android/app/src/main/AndroidManifest.xml:22` | VERIFIED |
| iOS custom scheme | `ios/App/App/Info.plist:74` | VERIFIED |
| Associated domains | `ios/App/App/App.entitlements` | VERIFIED |
| Well-known files from Actions vars, skipped when unset | `scripts/write-well-known.mjs:78` | VERIFIED |
| `pages.yml` does not reference those vars | `scripts/app-links.test.ts:141` | VERIFIED |

Auth emails stay on `https://boardarabia.com/auth/confirm`. The app accepts that URL, `/login`, `/apply`, `/register`, `/dashboard`, and the same paths on the `com.boardarabia.app` scheme. Web redirect URLs were not changed.

Covered by `scripts/app-links.test.ts`: magic link query, recovery hash, OAuth `code`, invite query, custom scheme, localhost, external hosts, unsafe paths, and the back button.

## What the owner sets later

Names only. No values belong in git. The Pages build reads these Actions variables and writes nothing when they are empty:

- `APPLE_TEAM_ID` (10 letters or digits)
- `ANDROID_APP_LINK_SHA256` (one or more certificate fingerprints, colon form or 64 hex digits)

The Apple app id also needs the Associated Domains capability when a signed build is made. Android app link checks use the upload certificate fingerprint in `ANDROID_APP_LINK_SHA256`.

## Not done

No migration. No Edge deploy. No store upload. No signing material in git. Home was not captured on an Android emulator here. `handoff/app-2-deep-links/ios-home.png` is Home on the iOS simulator from the macOS CI job (workflow run 38471390614, artifact `ios-home-screenshot`). The headline "Where Saudi boardrooms meet international capital" is on screen.

## Secrets grade

VERIFIED. The diff adds no private key, certificate, keystore, provisioning profile, team id, fingerprint, mailbox, or API key. The well-known writer refuses to emit a file when the vars are unset, and the test team id exists only inside the test process.
