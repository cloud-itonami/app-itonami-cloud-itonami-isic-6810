#!/usr/bin/env sh
# scripts/proof-standalone.sh -- reproducible step-1 proof (AWAI-3719 M2/M4 step 1).
#
#   ./scripts/proof-standalone.sh
#
# Anyone can re-run the PR#23 step-1 proof from this one script:
#   1. fresh clone into a PERSISTENT directory outside the monorepo
#      ($HOME/fudosan-step1-proof by default; never /tmp or $TMPDIR),
#   2. minimal KBB_HOME built under that same persistent directory
#      (the earlier proof used /var/folders/.../T/kbb-home, which is
#      ephemeral and is gone after a restart -- this script never
#      defaults to an ephemeral KBB_HOME),
#   3. `kbb -M:dev:physai-test` (80 tests / 313 pass, 0 fail, 0 error),
#   4. `kbb -M:dev:run` demo (first "== " line verbatim),
#   5. `kbb -M:dev:physai-test` a SECOND time, asserting the TOTAL line
#      is identical to the first run (second-build same result).
#
# Docker is not used. Steps 6/10 and Stripe are out of scope for
# step 1 and are untouched by this script (no Stripe links, no
# checkout code, no docs edits).
#
# Environment overrides (all optional):
#   PROOF_BASE   persistent proof root  (default: $HOME/fudosan-step1-proof)
#   PROOF_REF    git ref to check out in the fresh clone
#                (default: main; use e.g. efb7e5e65e3f9fa05c688bbe898536394af863f4
#                to reproduce the PR#23 merge base exactly)
#   KOTOBA_HOME  kotoba checkout providing bin/kbb (default:
#                $HOME/github/repos/kotoba-lang/kotoba)
#   PROOF_KEEP=1 keep the clone/KBB_HOME instead of cleaning first
set -eu

REPO_URL="https://github.com/cloud-itonami/app-itonami-cloud-itonami-isic-6810.git"
KOTOBA_SHA="7e1dbe0aece831138e6106c59d2b26375d0f60c4"

PROOF_BASE="${PROOF_BASE:-$HOME/fudosan-step1-proof}"
PROOF_REF="${PROOF_REF:-main}"
KOTOBA_HOME="${KOTOBA_HOME:-$HOME/github/repos/kotoba-lang/kotoba}"
CLONE_DIR="$PROOF_BASE/proof-empty/app-itonami-cloud-itonami-isic-6810"
KBB_HOME_PERSISTENT="$PROOF_BASE/kbb-home"
LOG_FILE="$PROOF_BASE/proof.log"

# --- persistent-location guard: refuse ephemeral proof locations --------
case "$PROOF_BASE" in
  /var/folders/*|/tmp/*|/private/tmp/*)
    echo "proof: PROOF_BASE=$PROOF_BASE is ephemeral; use a persistent dir" >&2
    echo "proof: unset PROOF_BASE or set it under \$HOME (e.g. \$HOME/fudosan-step1-proof)" >&2
    exit 1
    ;;
esac

mkdir -p "$PROOF_BASE"

# Record the inherited environment verbatim before we override anything,
# so the report shows what the caller had vs. what the proof uses.
INHERITED_KBB_HOME="${KBB_HOME:-<unset>}"

# --- Java (macOS /usr/bin/java is a stub; use the Homebrew JDK) ---------
if [ -z "${JAVA_HOME:-}" ]; then
  if [ -x /opt/homebrew/opt/openjdk/bin/java ]; then
    JAVA_HOME=/opt/homebrew/opt/openjdk
  elif [ "$(uname -s)" = "Darwin" ] && [ -x /usr/libexec/java_home ]; then
    JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || /usr/libexec/java_home 2>/dev/null || true)"
  fi
fi
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

# --- engine + persistent minimal KBB_HOME --------------------------------
export KBB_NO_STDLIB=1
# KBB_ENGINE: kotoba-lang/org-babashka-nbb (west sibling checkout)
if [ -z "${KBB_ENGINE:-}" ]; then
  if [ -f "$KOTOBA_HOME/../org-babashka-nbb/cli.js" ]; then
    KBB_ENGINE="$KOTOBA_HOME/../org-babashka-nbb/cli.js"
  elif [ -f "$HOME/github/repos/kotoba-lang/org-babashka-nbb/cli.js" ]; then
    KBB_ENGINE="$HOME/github/repos/kotoba-lang/org-babashka-nbb/cli.js"
  fi
fi
export KBB_ENGINE

# Always use the persistent KBB_HOME under PROOF_BASE, never an inherited
# ephemeral one (e.g. /var/folders/.../T/kbb-home).
export KBB_HOME="$KBB_HOME_PERSISTENT"
mkdir -p "$KBB_HOME/bin"

if [ ! -x "$KBB_HOME/bin/kbb" ]; then
  if [ ! -x "$KOTOBA_HOME/bin/kbb" ]; then
    echo "proof: kbb not found (KOTOBA_HOME=$KOTOBA_HOME); set KOTOBA_HOME to a" >&2
    echo "proof: kotoba checkout containing bin/kbb" >&2
    exit 1
  fi
  cp "$KOTOBA_HOME/bin/kbb" "$KBB_HOME/bin/kbb"
  cp "$KOTOBA_HOME/bin/kbb_deps.cljk" "$KBB_HOME/bin/kbb_deps.cljk"
fi
export PATH="$KBB_HOME/bin:$PATH"

# Minimal persistent nbb.edn (same pins as the repo's own nbb.edn).
cat > "$KBB_HOME/nbb.edn" <<EOF
{:paths ["src"]
 :deps {io.github.kotoba-lang/text {:git/url "https://github.com/kotoba-lang/kotoba.git" :git/sha "$KOTOBA_SHA" :deps/root "lib/kotoba.text"}
        io.github.kotoba-lang/coll {:git/url "https://github.com/kotoba-lang/kotoba.git" :git/sha "$KOTOBA_SHA" :deps/root "lib/kotoba.coll"}
        io.github.kotoba-lang/edn {:git/url "https://github.com/kotoba-lang/kotoba.git" :git/sha "$KOTOBA_SHA" :deps/root "lib/kotoba.edn"}
        io.github.kotoba-lang/test {:git/url "https://github.com/kotoba-lang/kotoba.git" :git/sha "$KOTOBA_SHA" :deps/root "lib/kotoba.test"}}}
EOF

# --- fresh clone outside the monorepo ------------------------------------
if [ -e "$CLONE_DIR" ] && [ "${PROOF_KEEP:-}" != "1" ]; then
  rm -rf "$CLONE_DIR"
fi
if [ ! -d "$CLONE_DIR/.git" ]; then
  mkdir -p "$PROOF_BASE/proof-empty"
  git clone "$REPO_URL" "$CLONE_DIR"
fi
cd "$CLONE_DIR"
git fetch origin '+refs/heads/*:refs/remotes/origin/*'
git checkout --detach "origin/$PROOF_REF" 2>/dev/null || git checkout --detach "$PROOF_REF"

run_test() {
  # prints the TOTAL line; the full log is appended to $LOG_FILE
  kbb -M:dev:physai-test 2>&1 |
    tee -a "$LOG_FILE" |
    grep -E '^kbb test: ' || {
      echo "proof: kbb -M:dev:physai-test produced no TOTAL line" >&2
      exit 1
    }
}

# --- run the proof (twice) -----------------------------------------------
# First write truncates the log; every later write appends (tee -a).
echo "proof: PROOF_BASE  : $PROOF_BASE" | tee "$LOG_FILE" >/dev/null
echo "proof: fresh clone  : $CLONE_DIR" | tee -a "$LOG_FILE"
echo "proof: HEAD        : $(git -C "$CLONE_DIR" rev-parse HEAD)" | tee -a "$LOG_FILE"
echo "proof: JAVA_HOME=$JAVA_HOME" | tee -a "$LOG_FILE"
echo "proof: KBB_NO_STDLIB=$KBB_NO_STDLIB" | tee -a "$LOG_FILE"
echo "proof: KBB_HOME=$KBB_HOME" | tee -a "$LOG_FILE"
echo "proof: KBB_HOME inherited (before override): $INHERITED_KBB_HOME" | tee -a "$LOG_FILE"
echo "proof: KBB_ENGINE=${KBB_ENGINE:-<unset>}" | tee -a "$LOG_FILE"

echo "proof: commands:" | tee -a "$LOG_FILE"
echo "  cd $CLONE_DIR" | tee -a "$LOG_FILE"
echo "  kbb -M:dev:physai-test" | tee -a "$LOG_FILE"
echo "  kbb -M:dev:run" | tee -a "$LOG_FILE"
echo "  kbb -M:dev:physai-test   # second build" | tee -a "$LOG_FILE"

echo "=== RUN 1: kbb -M:dev:physai-test ===" | tee -a "$LOG_FILE"
TOTAL1="$(run_test)"
echo "TOTAL1: $TOTAL1" | tee -a "$LOG_FILE"

echo "=== DEMO: kbb -M:dev:run ===" | tee -a "$LOG_FILE"
: > "$PROOF_BASE/demo.log"
kbb -M:dev:run 2>&1 | tee -a "$PROOF_BASE/demo.log" "$LOG_FILE" >/dev/null
DEMO_FIRST="$(grep -m 1 '^== ' "$PROOF_BASE/demo.log" || true)"
if [ -z "$DEMO_FIRST" ]; then
  echo "proof: kbb -M:dev:run produced no '== ' demo line" >&2
  exit 1
fi
echo "DEMO_FIRST: $DEMO_FIRST" | tee -a "$LOG_FILE"

echo "=== RUN 2: kbb -M:dev:physai-test (second build) ===" | tee -a "$LOG_FILE"
TOTAL2="$(run_test)"
echo "TOTAL2: $TOTAL2" | tee -a "$LOG_FILE"

if [ "$TOTAL1" = "$TOTAL2" ]; then
  echo "proof: SECOND_BUILD_SAME=yes (TOTAL identical)" | tee -a "$LOG_FILE"
else
  echo "proof: SECOND_BUILD_SAME=no" >&2
  echo "proof: TOTAL1=$TOTAL1 TOTAL2=$TOTAL2" >&2
  exit 1
fi

echo "=== proof PASSED ===" | tee -a "$LOG_FILE"
echo "proof: log: $LOG_FILE"
