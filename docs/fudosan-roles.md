# Real-estate business: who does what

Decided 2026-11-21 (owner, [AWAI-3719](https://linear.app/kotobalabs/issue/AWAI-3719)):
the first operators are **existing licensed real-estate businesses**. The
company does not become a licensed operator itself. Tracking for this page:
[AWAI-3726](https://linear.app/kotobalabs/issue/AWAI-3726).

Four Itonami bot profiles in `hermes/profiles/` share the work. Each one reads
snapshots the owner supplies and writes drafts. None of them sends a message,
publishes, sets a price, spends, signs, changes Git or performs a licensed
act; `yakuwari.edn` in each profile is the authority. They run on demand and
have no cron job. A profile in this repository is not installed, deployed or
proven to work by being here.

## Bots

| Profile | Role | Produces | Hands to |
|---|---|---|---|
| `itonami-fudosan` | Steward | Handoff board for the four bots, decision requests to the owner, reports of mismatches between records and source | Owner |
| `itonami-fudosan-eigyo` | Operator acquisition | Target operator profile, candidate table from public sources the owner supplies, drafts of first-contact text and meeting material, a qualification worksheet per candidate | Owner, who sends and meets; then `itonami-fudosan-donyu` once an operator agrees to a trial |
| `itonami-fudosan-donyu` | Onboarding and support | Install steps in the operator's own environment, licence confirmation checklist, support and cancellation text, first-week usage record | Owner; `itonami-fudosan-hoiki` when a jurisdiction requirement is unclear |
| `itonami-fudosan-hoiki` | Jurisdiction and credentials | Source check of each `realty.facts` entry, review packet for a licensed reviewer, list of jurisdictions that are not covered | Licensed reviewer, through the owner |

Bots do not instruct each other. A handoff is a row on the steward's board and
a Linear issue or comment that the owner posts.

## People

| Role | Does |
|---|---|
| Owner | Sends every external message, meets operators, sets price and terms, signs contracts, publishes, approves issue text |
| Operator's licensed person | Brokerage, important-matter explanation and other licensed acts; approves every closing proposal; keeps identity documents |
| Licensed reviewer | Confirms the jurisdiction gates (the Japan gate set is provisional) |

## How operators are gathered

1. `eigyo` writes the target profile: licence held, size (the business model
   assumes 1 to 3 offices, 100 to 500 managed units, 3 to 10 back-office
   staff), a jurisdiction that `realty.facts` covers, the repeated task to
   hand over, and the exclusion conditions.
2. The owner supplies public sources (a public licence register, an industry
   association's member list, operators' own sites). `eigyo` builds the
   candidate table with the source and retrieval date for every row. If a
   source's terms of use are not verified, the table says so.
3. `eigyo` drafts the first-contact text and the meeting question sheet. The
   text gives what the product does and what it does not do (no registration
   filing, no escrow release, no rent collection) equal weight, and makes no
   claim about customers, results or prices beyond `docs/business-model.md`.
4. The owner checks the rules that apply to sending (for Japan, the anti-spam
   law for commercial e-mail; not verified here) and sends.
5. After a meeting, `eigyo` fills in the worksheet. When an operator agrees
   to a trial, the steward adds a handoff row and `donyu` takes over with
   `docs/onboarding-managed-starter.md`.

Not used: names or private contact details of natural persons, purchased
lists, automated collection, advertising accounts.

## Open

- What is sold first, whether the published checkout link stays, and how the
  登記 app is distributed (AWAI-3719). A hosted instance per operator on the
  company's servers would conflict with the shared app contract
  (`app-environment-contract.md` in kotoba-lang/kotoba), which keeps per-user
  state and request-time logic off the app origin; running in the operator's
  own environment does not.
- Who the licensed reviewer is.
- No operator has been contacted. Subscribers and revenue: unknown.
