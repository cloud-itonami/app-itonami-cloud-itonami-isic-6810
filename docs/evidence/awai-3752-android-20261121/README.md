# 登記 app: closing preparation on Android — evidence of 2026-11-21

Tracking: [AWAI-3752](https://linear.app/kotobalabs/issue/AWAI-3752). Feature:
[AWAI-3748](https://linear.app/kotobalabs/issue/AWAI-3748) (`app/src/closing.js`).

## Build

Debug APK from this branch (`npm run build && npx tauri android build --apk --debug --target aarch64`,
`CARGO_BUILD_JOBS=4 nice -n 10`, through `forest-storage run`). Rust 1.95.0 with the
`aarch64-linux-android` target, NDK 27.0.12077973, JDK 21, build-tools 36.1.0. No other Gradle or
Android cargo build was running on the host; one unrelated `cargo build --release` of another
session was.

Two builds were made. The first (from `803a48e`) showed the defect described below; the second
includes the fix and is the one recorded here.

| Check | Result |
| -- | -- |
| APK | sha256 `aa3ccf1c2681279d69f617f66c49f705aa8fef943674d11ea0523650e8374bec`, 134,962,963 B (debug). Permissions: `INTERNET` and the app's own `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` |
| ELF | `llvm-readelf -lW lib/arm64-v8a/libitonami_registry_lib.so`: 4 LOAD segments, all `Align 0x4000` (16 KB, AWAI-3393) |
| Zip | `zipalign -c -P 16 -v 4`: verification successful |

## VM

Disposable AVD from the `android-35` default arm64 image (Android 15, 4 KB pages, 1080x1920),
headless, started with `-wipe-data`, deleted afterwards. Input by `adb shell input`; state read from
screenshots.

1. Launch: empty list; the notice names the closing preparation; the footer reports the Awai shell
   host (`01-launch.jpg`).
2. Create `JPN-00000001` through the form.
3. Closing preparation: name a seller and a buyer, start. Draft a proposal with 0 of 5 documents:
   **held**, "法域の必要書類がそろっていません", no approval control (`04-hold.jpg`).
4. Tick the five required documents. The card says the proposal was judged on older facts and
   cannot be approved. Set both parties to 一致なし through the native picker, draft again:
   **人の承認待ち**, with the spec-basis source shown (`06-awaiting.jpg`).
5. Type an approver's name and qualification, record the approval: the jurisdiction's human gates
   are listed (`08-approved.jpg`). Note the registration as completed: **成約済み（控え）**.
6. Force-stop the app, switch the system to dark mode, relaunch: the record, the five ticks and the
   case with its seven events are still there, in the dark theme, clear of the system bars
   (`10-restart-dark.jpg`). The state also survived `adb install -r` of the second build.

## Defect found and fixed

With every party screened, the proposal area printed the text `null` under the spec-basis line:
`Node.append()` stringifies a `null` argument. The browser run for AWAI-3748 had unscreened
parties, so that branch was never drawn. Fixed in `app/src/app.js`; the second build shows the
line without it (`06-awaiting.jpg`).

## Observed, not changed

- On the slow VM a tap on a button was once taken as a long press and opened the text selection
  menu on the button label.
- `adb shell input text` dropped characters while the keyboard was still opening; the text was
  typed again. Only ASCII was typed (adb cannot send Japanese text).

## Not established

- A physical device, a 16 KB-page device or image, a release-signed build, Store listing.
- The hold paths other than missing documents (a hit, an uncovered jurisdiction, a second closing)
  were not driven on Android; they are covered by `app/test/closing.test.mjs` and the browser run.
- The uiautomator dump did not follow WebView scrolling, so no accessibility-tree assertions were
  made.
