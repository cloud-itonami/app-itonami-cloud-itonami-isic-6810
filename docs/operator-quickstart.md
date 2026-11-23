# Operator Quickstart

Get the Community Real-Estate Agency running locally in under 5 minutes.

## Who This Is For

- **Licensed real-estate agents** who want an open-source, governed closing workflow
- **Property-management operators** needing jurisdiction-specific disclosure checklists and audit trails
- **Housing cooperatives &amp; community land trusts** building transparent listing and lease systems
- **Developers** extending a proven actor pattern with built-in safeguards

## Prerequisites

- **Java** (21+) and **Clojure CLI** (≥1.11) — [install](https://clojure.org/guides/install_clojure) (`clojure -Spath` must resolve; `/usr/bin/java` stub on macOS needs `JAVA_HOME=/opt/homebrew/opt/openjdk`)
- **Git** — clone this repository
- **kbb** — the JVM-free test/demo runner (`bin/kbb` in `kotoba-lang/kotoba`, engine `kotoba-lang/org-babashka-nbb`); see `scripts/setup.sh`
- **langgraph** — a git coordinate in `deps.edn` (`io.github.kotoba-lang/langgraph` → `https://github.com/kotoba-lang/kotoba.git`, `:deps/root "lib/kotoba.langgraph"`). No monorepo checkout is needed.

This repo is standalone-installable (M2/M4 step 1): every dependency in
`deps.edn` is a git coordinate (or Maven), with no `:local/root` into a
monorepo checkout. A fresh clone in an empty directory outside any
monorepo resolves on its own:

```bash
git clone https://github.com/cloud-itonami/app-itonami-cloud-itonami-isic-6810.git
cd app-itonami-cloud-itonami-isic-6810
./scripts/setup.sh   # resolve deps -> seed (in-memory) -> demo
```

Docker is **not used** — there is no `docker-compose.yml`, `Dockerfile`, or
container step in this repo or in `scripts/setup.sh`. The demo is a
`kbb`/`clojure` JVM-free run against in-memory stores.

## Run Tests

```bash
kbb -M:dev:physai-test
```

This is the kbb test suite (7 namespaces, the ones that load on the
kbb/SCI engine):

- **Physics spec** — `physics.edn` is valid and every declared run is measured
- **Governor contract** — spec-basis citations, KYC hold enforcement, actuation gate (never auto-closes)
- **Phase invariants** — read-only → assisted intake → assess/screen → supervised (closing always human)
- **Store parity** — in-memory ‖ Datomic consistency
- **Registry conformance** — closing record spec-compliance
- **Facts coverage** — honest reporting of jurisdiction coverage (currently 6 seeded; no fabrication)
- **Observation contract** — provenance-preserving observations of recorded registry events

Key invariant verified: **`:closing/submit` is never in any phase's `:auto` set.** A human is always the one who records the title transfer and releases escrow.

`kbb -M:dev:test` is the full suite alias and additionally tries to load
`realty.corporate-intel-test`, which requires `dossier.*` from
`cloud-itonami-isic-8291`. That upstream is `.kotoba`-only on main, so it
does not load on kbb/SCI or JVM Clojure (see README "What does NOT work").

## Run the Demo

```bash
kbb -M:dev:run
```

This walks two scenarios through the actor:
1. A clean closing proposal (passes all governors, routes to human approval)
2. A hard-hold case (sanctions hit, un-overridable, escalates)

Output includes the closing record, audit ledger entries, and governor decision logs.
The seed is in-memory (`realty.store/seed-db`); there is no database to seed.

## Understand the Governor

The **RealtorGovernor** is the independent approval layer that wraps the Realtor-LLM.

- **File:** `src/realty/governor.cljk`
- **Role:** spec-basis validation, sanctions screening, document completeness, confidence floor, actuation gate
- **Key gate:** `(governor/actuation governor ...)` — controls whether a high-stakes action (title recording, escrow disbursement) can proceed (returns `:hold` or `:commit`)
- **Spec basis:** All holds cite the jurisdiction's official requirement source; no fabricated law
- **Contract:** Once a hold is issued (e.g., sanctions hit), it **cannot be overridden** by any phase or role

Related files:
- `src/realty/phase.cljk` — phase-table enforcement (0→3, closing always supervised)
- `src/realty/operation.cljk` — the StateGraph actor that orchestrates Realtor-LLM → Governor → human approval
- `src/realty/facts.cljk` — per-jurisdiction disclosure/title requirement catalog with spec-basis citations
- `test/realty/phase_test.cljk` — test verifying `:closing/submit` is never auto-approved at any phase

## Access the Operator Console

A read-only sample of the operator console (pure-data HTML output) is rendered at:

```
docs/samples/operator-console.html
```

This shows how the UI renders listings, closings, audit trails, and governor holds.

## Deploy to Production

See [`docs/operator-guide.md`](operator-guide.md) for:
- First deployment checklist (register agency, import listings, configure escalation)
- Minimum production controls (parcel ID validation, term-overlap gates, audit exports)
- Actuation gates (no recording, no escrow release without human sign-off)

For jurisdiction-specific details (e.g., Dutch closing profile), see [`docs/nld-operator-guide.md`](nld-operator-guide.md) and the architecture decisions in [`docs/adr/`](adr/).

## Next Steps

1. **Fork** this repo on GitHub
2. **Customize** `src/realty/facts.cljk` with your jurisdiction's requirements
3. **Extend** `src/realty/corporate_intel.cljk` to integrate your own sanctions/PEP data sources
4. **Deploy** with your real KYC/AML program, land-registry integration, and escrow partner
5. **Operate** as a licensed agent/operator; the actor provides the governance scaffold, not the license

## Support

- **Architecture & decisions:** [`docs/adr/`](adr/)
- **Full README:** [`../README.md`](../README.md)
- **Business model:** [`business-model.md`](business-model.md)
- **License:** AGPL-3.0-or-later — see [`../LICENSE`](../LICENSE)
