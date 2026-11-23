# Self-hosted offer: product definitions and checkout (PLACEHOLDER)

Status: 2026-11-23 DRAFT — Stripe links are **not yet created**. This document is a
replacement proposal for the Checkout section of `docs/business-model.md`. **Do not
treat any price below as purchasable until the owner confirms link creation and the
Stripe credential (a) or (b) is in place.** No live link appears here on purpose.

Owner decision (2026-11-23, AWAI-3719): what is sold first is **Self-hosted
Launch** (setup ¥150,000 税別) plus **Support & updates** (monthly ¥30,000 税別),
for 店舗1–3・管理戸数100–500戸・内勤3–10名の地域密着型仲介兼管理会社.
Price basis: `docs/business-model.md` market-anchored section (いえらぶ 初期15万/月3万税別 etc.).

## 1. Product 1 — Self-hosted Launch (setup)

| Field | Definition (final wording proposal, owner confirmation pending) |
|---|---|
| Name (Stripe product name) | `Self-hosted Launch｜不動産registry 導入（初期構築）` |
| Description (Stripe) | 宅地建物取引業の免許を持つ事業者が、自社環境にregistry（登記・締結前確認・引渡し）を導入するための初期構築。事業者の環境で動く。初期在庫の移行、管轄パック1か国分の設定、研修1回を含む。データは事業者のもとに残り、こちら側に常時インスタンスは保持しない。 |
| Price | ¥150,000 (JPY) |
| Tax | 税別（消費税は別途。標準税率10%を別途加算する前提で請求書に明示） |
| Billing cycle | 一括請求（one-time）。契約時の請求を案とする（初回請求タイミングは見積・発注書で確定）。 |
| Cancellation (案) | 導入作業開始後の中途解約は作業実績に応じた清算。納品完了後の返金はしない（案。オーナー確認待ち） |
| Customer | 店舗1–3・管理戸数100–500戸・内勤3–10名の地域密着型仲介兼管理会社（免許事業者） |

Includes (initial delivery, ¥150,000):
- registry を事業者の自社環境に導入（構成：Realtor-LLM ⊣ RealtorGovernor、登記 app、4ロール bot）
- 初期在庫の移行（listings / parties の初期ロード）
- 管轄パック1か国分の設定（`realty.facts` の選択）
- 研修1回

Excludes (not part of this product):
- Managed hosting（ホスティング）: not offered. 本サービスはmanagedではない。
- 家賃収受・送金、登記申請代行、エスクロー送金の実行
- 事業者側サーバ／回線費用（事業者負担）
- 宅建業の資格行為（宅地建物取引士の業務は事業者の有資格者が行う）

## 2. Product 2 — Support & updates (monthly)

| Field | Definition (final wording proposal, owner confirmation pending) |
|---|---|
| Name (Stripe product name) | `Support & updates｜月額サポート・更新` |
| Description (Stripe) | 導入済み事業者への月額サポート。管轄パックの維持（法改正追随）、更新提供、不具合修正、事業者環境の運用相談、監査台帳の出力支援を含む。事業者の環境で運用し、ホスティングは含まない。 |
| Price | ¥30,000 / month (JPY) |
| Tax | 税別（消費税は別途。同上） |
| Billing cycle | 月額課金（monthly recurring）。Launch 納品完了月の翌月1日を開始案とする（開始日は契約で確定）。 |
| Cancellation (案) | 解約は1か月前通知（月末締め）。継続中の月は請求対象。提供済み更新分の返金はしない（案。オーナー確認待ち） |
| Customer | 同上（導入済み事業者のみ） |

Includes (monthly, ¥30,000):
- 管轄パックの維持（仕様引用付きカタログの更新：`realty.facts/catalog`）
- 更新提供と不具合修正
- 導入環境の運用相談・監査台帳の出力支援

Excludes (not part of this product):
- Managed hosting（当方サーバでの運用代行）
- 事業者の宅建業資格行為・登記申請・決済実行・家賃収受
- 追加の jurisdiction パック（別途で案：月額外。価格は未確定）

## 3. Delivery correspondence (納品対応表)

| | ¥150,000 (Launch) | ¥30,000/月 (Support) |
|---|---|---|
| When | 契約・構築時（一度） | Launch 納品後から毎月 |
| Who acts | 当方が導入作業を行う。データは事業者の環境に残る | 当方が更新・サポートを行う。運用は事業者環境で行う |
| Server | 事業者の環境（自社サーバ等）で動く。当方に常時インスタンスは置かない | 同左。ホスティングは含まない |
| Data | 初期在庫を移行。個人データはGitに置かない | 監査台帳の出力支援。個人データの保持は行わない |
| What stops | 納品完了で初回構築は完了 | 解約通知で停止（未済月の扱いは上記案） |

マネージドホスティングではない、という前提は守られている：両商品とも**事業者の自社環境**で実行し、当方側に事業者ごとのインスタンスや状態を持たない。

## 4. Checkout replacement (placeholder)

| Link | Product | Price | Status in this PR |
|---|---|---|---|
| *(placeholder: future Payment Link for setup)* | Self-hosted Launch | ¥150,000 (税別) one-time | **Not yet created — no live link** |
| *(placeholder: future Payment Link for monthly)* | Support & updates | ¥30,000 (税別) / month | **Not yet created — no live link** |

Do not write “buy now / subscribe” for these. This table is the slot the real links fill after owner confirmation.

## 5. Old link retirement (1 paragraph)

旧 Stripe Payment Link “Managed Starter” (`https://buy.stripe.com/aFadRa72vfVSe9OdiieEo06`, ¥30,000/月 flat, created 2026-08-10) は、当方サーバで事業者ごとのテナントを持つ “managed hosting subscription” を売るリンクであった。Owner decision 2026-11-21（AWAI-3719）により本サービスは事業者の自社環境で実行し、当方に常時インスタンスを持たない自己完結型になったため、このリンクは納品しないサービスを説明しており、説明不一致として2026-11-23に retire（退役）した。退役後もゼロ paid tenants の事実は変わらない。

## 6. Pricing / delivery mismatches (stop-and-report, owner review required before any link)

These are not fixed in this PR; they are flagged so a link is not published into a mismatch.

- **M1 — Business-model bullets still list “managed hosting subscription per agency”** (`docs/business-model.md` Revenue bullets). Contradicts the 2026-11-21 delivery decision. The bullet has not been removed here pending owner OK to strike a retired line.
- **M2 — `docs/onboarding-managed-starter.md` assumes Managed Starter.** Title/steps are managed-tenant flow; the step table itself (13 steps) marks 5 (install in operator’s env), 6 (roles), 10 (console from own data) as missing, and 12–13 (support/cancel) as missing. The ¥150,000 Launch promise includes install/role/console that the repo currently marks missing. Cannot sell as “installable” without those steps built.
- **M3 — `docs/operator-guide.md` first line references “Managed Starter tier”.** Stale reference to the retired tier.
- **M4 — “3app + 4ロールbot” vs. what is in the repo.** PR #18 defines the registry as 登記・締結前確認・引渡しの3app + 4ロールbot. The repo holds `app/`（登記） plus the closing actor, but has no installable package for parts of steps 5/6/10 (per M2). Selling ¥150,000 for all 3 apps is broader than the currently installable set.
- **M5 — SLA / support terms undefined.** Monthly ¥30,000 is “support retainer with SLA” per current pages, but support hours, contact channel, SLA target and response time are not written. Steps 12–13 of the onboarding doc are missing. Billing start / cancellation/refund are proposals above, not owner-approved.
- **M6 — Jurisdiction pack maintenance risk (JPN).** `realty.facts` JPN entry is provisional and the licensed reviewer is unknown (`docs/fudosan-roles.md` open item). Monthly promise of “keep jurisdiction pack current” for JPN rests on a pack whose gate set is provisional.
- **M7 — Tax rate handling.** Pages say “税別” only. Stripe invoice must show consumption-tax line explicitly; who calculates tax (Stripe Tax vs. manual) is not yet chosen.

No link is issued from this PR. The next step after owner resolves M1–M7 is: pick credential (a) restricted API key or (b) MCP/Composio (see §7), create the two products/links, then swap the placeholders for real URLs in a follow-up PR.
