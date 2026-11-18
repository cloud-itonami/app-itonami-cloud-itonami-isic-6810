# 登記 app on Android — evidence of 2026-11-18

Tracking: [AWAI-3144](https://linear.app/kotobalabs/issue/AWAI-3144).

## Build

Clean debug APK (`npm run build && npx tauri android build --apk --debug --target aarch64`,
`CARGO_BUILD_JOBS=4 nice -n 10`, through `forest-storage run`, under the shared AWAI-3393 build lock).

| Check | Result |
| -- | -- |
| APK | sha256 `e8177dceb0b3372b4de134f35a2afe71492920a645c52c39d4036f51c319cb7e`, 147,742,339 B (debug). Permissions: `INTERNET` only (for the consented lookup) |
| ELF | `llvm-readelf -lW lib/arm64-v8a/libitonami_registry_lib.so`: 4 LOAD segments, all `Align 0x4000` (16 KB, AWAI-3393) |
| Zip | `zipalign -c -P 16 -v 4`: verification successful |

## VM

Disposable AVD from the `android-35` default arm64 image (Android 15, 4 KB pages), started with
`-wipe-data`, deleted afterwards.

1. Launch: empty list, the page sits below the status bar and above the navigation bar, and the
   footer reports the Awai shell host (`01-launch-light.jpg`).
2. Create `JPN-00000001` through the form (text typed with `adb input`; the keyboard does not
   cover the focused field). The detail shows the JPN procedure from `realty.facts`, marked
   provisional (`04-created.jpg`).
3. Tick a required document: history gains "修正: 必要書類".
4. Lookup → the shared consent dialog shows service, operation, endpoint and the full query
   with the coordinates (`06-consent.jpg`). **Deny** → "照会しませんでした（何も送っていません）".
5. Lookup again → **Allow once** → 19 places within 1 km, with owners (`08-results.jpg`).
6. Keep one result as a reference, force-stop the app, switch the system to dark mode, relaunch:
   the record is still there, in the dark theme, clear of the bars (`09-restart-dark.jpg`).

## Not established

- A 16 KB-page device or image (the VM uses 4 KB pages; alignment is shown by the ELF above).
- A physical device, a release-signed build, and Store listing.
