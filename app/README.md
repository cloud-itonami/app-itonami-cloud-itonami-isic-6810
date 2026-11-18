# 登記 — Itonami registry app (Tauri v3)

An Awai / Itonami app that keeps land and building rights records **on the
device** and looks up public ownership statements nearby, with consent each
time. It is the first user-facing slice of this repository (ISIC 6810) and
reads the actor's own jurisdiction catalog, `realty.facts`.

What it is not: an official land register. It files nothing with any registry,
signs nothing, and moves no money (AWAI-350 boundary). Every record is marked
`draft-unsigned`, the same discipline as `realty.registry`.

## What it does

- **Records**: create a record for a parcel, building or unit (jurisdiction,
  address, parcel number, area, optional coordinates, rights with holder, share
  and date, note). Records are numbered per jurisdiction (`JPN-00000001`), as
  `realty.registry/register-closing` does, and kept in IndexedDB.
- **Append-only history**: a change adds an amendment entry; earlier entries
  are never rewritten. On load, each record's data is replayed from its history
  and a record that does not match is set aside, not shown.
- **Jurisdiction procedure**: authority, legal basis, filing route, source URL,
  the human steps the app never performs (`:human-gates`), and the required
  documents as a checklist. All of it comes from `src/realty/facts.cljk`, read
  at build time by a small EDN reader (`scripts/edn.mjs`). The app carries no
  second copy; `release.json` pins the digest of the facts file it was built
  from. A jurisdiction without an entry shows no procedure rather than a guess.
- **Ownership lookup**: for a record with coordinates, the app asks Wikidata for
  places within 0.5 / 1 / 5 / 25 km that have an "owned by" (P127) statement.
  This is the public source the `jinushi` land-ownership actor ingests. Owners
  that Wikidata types as humans (Q5) are shown as "個人", not by name, following
  jinushi's natural-person rule. A result can be kept in the record as a
  reference (an amendment, with the retrieval time).

## Consent and network

`src/descriptor.json` declares one external operation:

| Operation | Endpoint | Sent | Consent |
|---|---|---|---|
| `query-owned-by-near` | `GET https://query.wikidata.org/sparql` with `query` and `format=json` only | the record's coordinates (rounded to 1e-5°) and the radius; IP address and user agent | each operation |

It runs through the shared broker (`vendor/kotoba-client-runtime.js`, pinned to
kotoba-lang/kotoba `ecbfc15b`, digest-checked by the build). The dialog shows
the full request, coordinates included. Denying sends nothing. The page and
Tauri CSP allow only `query.wikidata.org` besides IPC, and the build fails if
either CSP differs from the one derived from the descriptor. The Tauri host
grants one read-only command and no filesystem, shell or network permission.

Why not jinushi's own dataset: its manifest points at an IPFS CID
(`bafybeihrzix…`) that public gateways did not serve on 2026-11-18 (HTTP 429,
no durable pin), and its runbook keeps person-bearing raw data off the public
tier. The committed `data/seed/parcels.edn` is a small seed, not a source of
real ownership. Querying Wikidata directly gives the same upstream, live, with
the person rule applied on the device.

## Data-use conditions checked (2026-11-18)

The app reads no official register. This records what each register in
`realty.facts` allows, so that a later slice does not assume access it lacks.
Items marked *unverified* could not be confirmed from a primary source in this
session.

| Jurisdiction | Official register access | Use in this app |
|---|---|---|
| JPN | Register extracts are issued for a fee by the 法務局, and online through the paid 登記情報提供サービス (民事法務協会). Its terms on reproduction and redistribution: *unverified* (the terms page was not retrieved). | None. The user types what they hold. |
| GBR (England & Wales) | Official copies of the register are paid per copy under the Land Registration Fee Order 2024. INSPIRE Index Polygons are published under the OGL, with Ordnance Survey geometry rights attached. | None yet. Polygons would need their own declared download and licence review. |
| DEU | Inspection of the Grundbuch requires showing a legitimate interest (§ 12 GBO). A business purpose alone has been held not to suffice (OLG Bamberg, 10 Wx 17/23). | None. Not suitable for bulk or automated lookup. |
| NLD | Ownership extracts from Kadaster are paid per request. Current fees and reuse conditions: *unverified* (no primary source found). | None. |
| AUS-NSW | Title searches are sold through approved information brokers. The NSW LRS online terms bar automated retrieval and unauthorised resale. | None. |
| USA-CA | Recording is per county; access and fees differ by county. *unverified* per county. | None. |
| CAN-ON | The `realty.facts` entry concerns agent registration (RECO), not land titles. Ontario land-registry access terms: *unverified*. | None. |
| Wikidata | Structured data is CC0. Use of the query service is subject to the Wikimedia API terms (user-agent policy, no high-rate use; 60 s of query time per client per minute). | One user-triggered query per approval. Browsers cannot set a custom User-Agent; requests carry the WebView's own. |

## Build and test

```bash
npm ci
npm test            # builds dist/ and runs the node tests
npm run build:android   # APK (aarch64); needs Android SDK 37, NDK 27.0.12077973, JDK 21
```

`dist/` is the whole app: static files only, no server, no bundler.

## Limits

- No GPS. Coordinates are typed in.
- No export or import yet. Records live only in this device's WebView storage
  and are lost if the app's data is cleared.
- The JPN procedure in `realty.facts` is provisional (`:gates-status
  :provisional`) and has not been reviewed by a licensed professional; the app
  says so on screen.
- Lookup results are Wikidata statements, often about notable buildings, and
  are neither complete nor authoritative.
