#!/usr/bin/env sh
# scripts/build-release-apk.sh -- release APK build for the registry app.
#
#   ./scripts/build-release-apk.sh
#
# The owner exports AWAI_KEYSTORE_PATH, AWAI_KEYSTORE_PASSWORD,
# AWAI_KEY_ALIAS and AWAI_KEY_PASSWORD in their own shell first.
# This script only checks that each one is non-empty; it never reads,
# copies or logs a keystore or a password.
set -eu

missing=""
for name in AWAI_KEYSTORE_PATH AWAI_KEYSTORE_PASSWORD AWAI_KEY_ALIAS AWAI_KEY_PASSWORD; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    if [ -z "$missing" ]; then
      missing="$name"
    else
      missing="$missing, $name"
    fi
  fi
done

if [ -n "$missing" ]; then
  echo "signing env not set: missing $missing -- release signing requires AWAI_KEYSTORE_PATH, AWAI_KEYSTORE_PASSWORD, AWAI_KEY_ALIAS, AWAI_KEY_PASSWORD (debug build stays as-is)" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

# Release build: `tauri android build` without --debug is the release
# build, and Gradle's release signingConfig reads the env above.
# This is the existing app build (npm run build:android in app/).
npm --prefix app run build:android

apk_dir="app/src-tauri/gen/android/app/build/outputs/apk"
apk="$(find "$apk_dir" -name '*.apk' -type f | sort | tail -n 1)"

if [ -z "$apk" ] || [ ! -f "$apk" ]; then
  echo "build-release-apk: no APK found under $apk_dir" >&2
  exit 1
fi

bytes="$(wc -c < "$apk" | tr -d ' ')"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$apk"
else
  shasum -a 256 "$apk"
fi
echo "bytes: $bytes"
echo "apk: $apk"
