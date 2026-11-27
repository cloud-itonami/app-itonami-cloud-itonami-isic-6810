# PII boundary — owner/tenant realty records (ZB20-SG01)

This document defines which personal information may exist in this
repository's device-side realty records, how long it is kept, and how it
is masked. It is the normative companion to the guards in
`app/src/records.js`, `app/src/store.js` and `app/src/lookup.js`; where
code and this document disagree, the stricter reading wins and the
disagreement is a bug.

Personal-information handling in Japan is governed by the Act on the
Protection of Personal Information (個人情報保護法, 平成15年法律第57号;
e-Gov law ID `415AC0000000057`, "APPI"). This software is a governed
execution scaffold run by a licensed operator in their own environment
(see README "Scope"); it is not itself a personal-information handling
business operator (個人情報取扱事業者) and holds no records centrally.
The boundary below keeps it that way by keeping personal data off the
device store in the first place.

## [CONFIRM] gate — required before any production / live deployment

> **[CONFIRM]** Before any production or live deployment of this
> software, a qualified legal reviewer must confirm in writing that the
> operator's intended use is correctly classified under the Real Estate
> Brokerage Act (宅地建物取引業法, "宅建業法") — in particular whether
> the deployment constitutes brokerage/mediation (媒介) requiring a
> licence, which acts must be performed by a licensed real-estate
> transaction specialist (宅地建物取引士), and how the APPI duties of a
> 個人情報取扱事業者 apply to the operator's own handling of any data
> outside this software. This repository's provisional jurisdiction
> packs (e.g. `realty.facts` JPN `:gates-status :provisional`) are not
> that confirmation. Do not deploy live on the basis of this document.

## Permitted fields

A record (`app/src/records.js`, schema
`network.itonami.registry.record.v1`) is a property-rights draft, never
an official registration. Only these fields may be stored:

| Field | Content | Notes |
|---|---|---|
| `jurisdiction`, `kind`, `parcel`, `areaM2`, `lat`, `lon` | Property descriptors | Coordinates are user-typed; lookup sends them rounded to 1e-5° (~1 m) |
| `address` | Property location (所在) | The property's address, not a person's home address or contact address |
| `rights[].type`, `rights[].share`, `rights[].since` | Right kind, share, date | Closed vocabularies / date format enforced by `recordData` |
| `rights[].holder` | Rights holder as an organisation name or role label | Must not contain contact details or government identifiers (see prohibited list); prefer organisations (`株式会社…`) or roles over natural-person names, and keep any unavoidable name to the minimum needed to identify the right |
| `rights[].note`, `note` | Free-text notes | Same prohibition scan as every other string field |
| `docs` | Jurisdiction document checklist keys | Only keys present in `realty.facts` for that jurisdiction are kept |
| `references[]` | Saved Wikidata lookup references | `source: "wikidata"`, QIDs, labels; natural-person owners are masked (below) |
| Closing-case parties (`app/src/closing.js`) | `role` + `name`, screening verdicts, approver `by`/`role` | The operator's own case workflow; names are the minimum needed for a human approval trail and never leave the device |

## Prohibited fields and content

The following must never be created, stored, or round-tripped through
`records.js` or `store.js`. Both layers reject them fail-closed
(`recordData` returns the `pii-prohibited` problem; `store.set` refuses
the write and returns `false`, which the UI surfaces as a save failure):

- Contact details: email addresses, telephone / mobile / fax numbers
  (including inside `holder`, `address`, or free-text notes).
- Government and financial identifiers: Individual Number
  (マイナンバー, 12-digit), social-security numbers, passport numbers,
  bank-account and credit-card numbers, dates of birth.
- Any field outside the permitted list whose key names such data
  (`email`, `phone`, `tel`, `mobile`, `mynumber`, `ssn`, `passport`,
  `bank-account`, `credit-card`, `date-of-birth`, …). Extra top-level
  keys are also dropped by construction: `recordData` copies only the
  allowlisted fields.
- Natural-person owner names obtained from lookup: Wikidata owners
  typed as human (Q5) are represented only as `{ id: "", label: "個人",
  person: true }` — in `lookup.js parseResults` and again in
  `records.js referenceData` when a reference is saved.

Detection (`piiFindings` in `records.js` / `store.js`) reports only a
kind and a field path (`input.rights[0].holder:email`), never the
matched value, so error messages and logs cannot leak what was
rejected. A record already in storage that contains prohibited content
is refused on load (`recordProblems` → `pii-prohibited`), not displayed.

## Redaction / masking policy

- **Mask, don't name:** natural persons from public statements are
  shown and stored as 「個人」 with no identifier.
- **Reject, don't store-and-hide:** prohibited contacts/identifiers in
  user input abort the create/amend (`{ problems: ["pii-prohibited"] }`)
  rather than being stored and masked at display time. There is no
  code path that persists an unredacted value and redacts later.
- **Coarsen before sending:** the only network operation
  (`query-owned-by-near`, Wikidata) sends coordinates rounded to 1e-5°
  and one of four fixed radii, only after a fresh per-operation
  consent; denying sends nothing. See `app/README.md` "Consent and
  network."

## Retention window

- Records and closing cases live only in the device's IndexedDB
  (`itonami.registry.v1`), in the operator's own environment. There is
  no server copy, sync, export, or backup in this software.
- Retention is therefore bounded by the device: data is kept until the
  user deletes the record/case, clears the app's data, or uninstalls
  the app. Operators must apply their own APPI retention and deletion
  schedule to anything they transcribe out of the app; this software
  provides no archival tier and must not be treated as one.
- Lookup results are transient unless the user explicitly saves a
  result as a record `reference` (an amendment, with retrieval time);
  saved references inherit the masking rules above.

## Tests

`app/test/pii-boundary.test.mjs` proves the negative with strictly
synthetic fixture identifiers (fictional `*.invalid` addresses,
reserved-style numbers): fixture PII is rejected by `records.js`,
refused by `store.js`, and never appears in anything either layer
returns or persists. No real personal data is used in tests, fixtures,
or this document.
