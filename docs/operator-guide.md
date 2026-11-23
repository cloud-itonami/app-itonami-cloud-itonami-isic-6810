# Operator Guide

For the Self-hosted Launch (setup) tier, the steps from install to a usable setup and
their current state are in [onboarding-managed-starter.md](onboarding-managed-starter.md)
(note: that file is still titled "Managed Starter" from the retired tier; its step table marks 5/6/10/12–13 as missing — see M2/M4 in [self-hosted-offer.md](self-hosted-offer.md)).

## First Deployment
1. Register agency, parcels, agents and operators.
2. Import listings and active leases.
3. Run read-only term-overlap validation.
4. Configure escalation and rent-collection paths.
5. Publish a dry-run tenancy audit export.

## Minimum Production Controls
- parcel identification before any listing
- term-overlap gate before any lease commit
- rent-collection reconciliation
- audit export for every listing, lease and disclosure
- backup manual lettings process
- closing/title-transfer recording and escrow-fund disbursement always
  require human sign-off (RealtorGovernor actuation gate -- see README)
- extend `realty.facts/catalog` for every jurisdiction you close in, each
  entry citing the jurisdiction's own official land-registry authority as
  `:provenance`

## Certification
Certified operators must prove listing integrity, conflict-free leasing,
human review for disclosure-affecting actions, and -- for the closing
actor -- proof that every closing/escrow-disbursement passes through a
human approval step (never bypassed, never auto-committed) and that real
buyer/seller identification documents are not stored in Git.
