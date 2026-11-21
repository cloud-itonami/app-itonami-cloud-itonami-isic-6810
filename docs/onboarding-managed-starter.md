# Managed Starter onboarding: from checkout to a usable instance

Status as of 2026-11-21, revision `26f6f67`. Tracking:
[AWAI-3718](https://linear.app/kotobalabs/issue/AWAI-3718). This is a draft
prepared for the `itonami-fudosan` bot's first work order
(`hermes/profiles/itonami-fudosan/tasks/first-turn.md`).

`docs/business-model.md` sells one tier, Managed Starter, at JPY 30,000 per
month through a hosted checkout link, and says fulfilment is manual. This page
lists every step between a completed checkout and an operator who can use the
service, and marks what exists. **Most of the managed service does not exist
yet.** What exists is the governed actor, its tests, a read-only sample
console and the 登記 app.

Not known from this repository: the number of subscribers today (the business
model records zero as of 2026-08-10), any operator's identity, and revenue.

## Steps

| # | Step | State | Evidence |
|---|---|---|---|
| 1 | Operator pays through the checkout link | exists | `docs/business-model.md`, "Subscribe" |
| 2 | The seller learns that a payment arrived | manual | No webhook or notification code in `src/` |
| 3 | Confirm the operator holds the licence for the jurisdiction | missing | No licence or credential record; design is AWAI-341 |
| 4 | Confirm the jurisdiction is covered | exists | `realty.facts/coverage`, `src/realty/facts.cljk` (6 jurisdictions; human gates for NLD and JPN, JPN provisional) |
| 5 | Create the operator's own instance | missing | `realty.store` has `MemStore` and `DatomicStore` but no per-agency separation, and the repository has no hosting or deployment configuration |
| 6 | Give the operator's staff a way to sign in, with roles | missing | No sign-in code; `realty.operation` takes an injected actor id, role and phase |
| 7 | Load the operator's listings and parties | manual | `Store/with-listings` and `with-parties` take maps; there is no file import |
| 8 | Set the phase (0 read-only to 3 supervised) | exists | `src/realty/phase.cljk`; `:closing/submit` is never automatic |
| 9 | Route held and escalated proposals to the operator's approver | manual | The approver resumes the graph with `{:approval {:status :approved}}`; no inbox or notification |
| 10 | Show the operator their console | missing | `docs/samples/operator-console.html` is a generated, read-only sample of demo data |
| 11 | Export the audit ledger for the operator | manual | `Store/ledger` returns the facts; no export command |
| 12 | Support and incident contact | missing | `docs/operator-guide.md` names a support retainer; no channel is defined |
| 13 | Cancel, and return or delete the operator's data | missing | Not described anywhere |

The 登記 app (`app/`) is separate from this path: it keeps records on the
device and does not connect to a managed instance.

## What an operator can use today

Without any of the missing steps, a licensed operator can fork the repository
and run it themselves (`docs/operator-quickstart.md`). That is the self-host
offer, not Managed Starter.

## Worksheet for the first operator

Fill in from what the operator supplies. Leave a field `unknown` until then.

| Field | Value |
|---|---|
| Legal form and licence (for Japan: 宅地建物取引業 licence number and issuing authority) | unknown |
| Offices, units under management, back-office staff | unknown |
| Jurisdiction, and whether `realty.facts` covers it | unknown |
| The repeated task to hand over (intake, disclosure checklist, KYC screening, closing proposal) | unknown |
| Volume per month | unknown |
| Who approves a closing proposal (name of role, licence) | unknown |
| Where identity documents are kept (never in Git) | unknown |
| "Usable on day one" means | unknown |
| Support hours and contact | unknown |
| Stop conditions (for example: jurisdiction not covered, no licensed approver, personal data would leave the operator) | unknown |

## Before taking a first payment

1. Decided 2026-11-21: the first operators are existing licensed real-estate
   businesses ([fudosan-roles.md](fudosan-roles.md)). Still open: what is sold
   first (AWAI-3719, owner decision).
2. Either build steps 5, 6 and 10, or sell the self-host setup instead of the
   managed tier until they exist.
3. Write down steps 12 and 13.

Until then, a payment through the checkout link buys a service that cannot be
delivered as described.
