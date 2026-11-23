#!/usr/bin/env sh
# scripts/setup.sh -- one-command standalone setup for cloud-itonami-isic-6810
# (M2/M4 step 1).
#
#   ./scripts/setup.sh
#
# Resolves dependencies (git coordinates only, no monorepo), seeds the
# in-memory demo store (realty.store/seed-db -- there is no database),
# and runs the demo (realty.sim). Docker is not used.
#
# Prerequisites: git, Java 21+ (for the kbb engine's nbb-deps bootstrap),
# and kbb. If kbb is not on PATH, this script tries the kotoba monorepo
# checkout at $KBB_HOME (default ~/github/repos/kotoba-lang/kotoba) and
# fails with the exact missing command otherwise -- it does not download
# a different runner.
set -eu

cd "$(dirname "$0")/.."

if ! command -v git >/dev/null 2>&1; then
  echo "setup: git not found on PATH" >&2
  exit 1
fi

# Java: /usr/bin/java on macOS is a stub that prints "Unable to locate a
# Java Runtime". Use the Homebrew JDK if JAVA_HOME is unset and the stub
# is what `java` resolves to.
if [ -z "${JAVA_HOME:-}" ] && [ -x /opt/homebrew/opt/openjdk/bin/java ]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk
  export PATH="$JAVA_HOME/bin:$PATH"
fi

# kbb: use PATH, else $KBB_HOME/bin (kotoba monorepo checkout).
if ! command -v kbb >/dev/null 2>&1; then
  KBB_HOME="${KBB_HOME:-$HOME/github/repos/kotoba-lang/kotoba}"
  if [ -x "$KBB_HOME/bin/kbb" ]; then
    export PATH="$KBB_HOME/bin:$PATH"
    export KBB_HOME
  else
    echo "setup: kbb not found on PATH" >&2
    echo "setup: install kbb (kotoba-lang/kotoba bin/kbb, engine" >&2
    echo "setup: kotoba-lang/org-babashka-nbb/cli.js) or set KBB_HOME" >&2
    echo "setup: to a kotoba checkout containing bin/kbb" >&2
    exit 1
  fi
fi

if [ -z "${KBB_ENGINE:-}" ]; then
  # Engine: $KBB_HOME/../org-babashka-nbb/cli.js (orgs/kotoba-lang layout),
  # or an existing west sibling checkout.
  for candidate in \
    "${KBB_HOME:-$HOME/github/repos/kotoba-lang/kotoba}/../org-babashka-nbb/cli.js" \
    "$HOME/github/repos/kotoba-lang/org-babashka-nbb/cli.js"; do
    if [ -f "$candidate" ]; then
      export KBB_ENGINE="$candidate"
      break
    fi
  done
fi

# The kotoba monorepo's implicit-stdlib bootstrap (bin/kbb stdlib_tail)
# tries to clone the deleted kotoba-lang/text.git repo and fails. Skip
# it: this repo's own nbb.edn already names kotoba.lang.text as a git
# coordinate, which is all the engine needs to load kbb_deps.cljk.
export KBB_NO_STDLIB=1

echo "setup: resolving dependencies (kbb -Spath -M:dev:test)"
kbb -Spath -M:dev:test >/dev/null

echo "setup: seeded demo store is in-memory (realty.store/seed-db);"
echo "setup: no database to seed."

echo "setup: running demo (kbb -M:dev:run)"
kbb -M:dev:run

echo "setup: done. Tests: kbb -M:dev:physai-test"
