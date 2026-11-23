# Self-hosted offer: product definitions and checkout (PLACEHOLDER)

**NOT FOR SALE until M2/M4 are closed** — do not create links or sell until the installable package exists (see §6).

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
| Description (Stripe) | 宅地建物取引業の免許を持つ事業者への導入支援（リポジトリのセットアップ支援、初期在庫移行の手順書提供、研修1回）。registry の一式導入（登記・締結前確認・引渡しの 3app + 4ロール bot）は、installable パッケージが無いため M2/M4 が閉じるまで含まない。事業者の環境で動く。データは事業者のもとに残り、こちら側に常時インスタンスは保持しない。 |
| Price | ¥150,000（税別）+ 消費税10%を別途 (JPY) |
| Tax | 手動計算（Stripe Tax は使わない — 有料のため）。請求書に税抜 / 消費税10% / 税込の3行を明示。Stripe の自動税計算に依存しない |
| Billing cycle | 一括請求（one-time）。契約時の請求を案とする（初回請求タイミングは見積・発注書で確定）。 |
| Cancellation (案) | 導入作業開始後の中途解約は作業実績に応じた清算。納品完了後の返金はしない（案。オーナー確認待ち） |
| Customer | 店舗1–3・管理戸数100–500戸・内勤3–10名の地域密着型仲介兼管理会社（免許事業者） |

Includes (initial delivery, ¥150,000 — only what is deliverable today):
- リポジトリのセットアップ支援（事業者の環境での組み立て支援。installable パッケージが無い部分は、現状できないことを正直に記載する）
- 初期在庫移行の手順書＋移行支援（listings / parties の初期ロード手順。データの投入は事業者の確認を経て行う）
- 研修1回

Excludes (not part of this product):
- **registry の一式導入（登記・締結前確認・引渡しの 3app + 4ロール bot の installable 一式）: M2/M4 が閉じるまで含まない。** 現状 repo に installable パッケージが無く、`onboarding-managed-starter.md` の steps 5/6/10 が missing。この範囲を価格表で約束しない。
- 管轄パック1か国分の正式設定: M6 のとおり暫定。達し得るのは確認支援まで（「維持」は有資格レビュアー確定後）
- Managed hosting（ホスティング）: not offered. 本サービスはmanagedではない。
- 家賃収受・送金、登記申請代行、エスクロー送金の実行
- 事業者側サーバ／回線費用（事業者負担）
- 宅建業の資格行為（宅地建物取引士の業務は事業者の有資格者が行う）

## 2. Product 2 — Support & updates (monthly)

| Field | Definition (final wording proposal, owner confirmation pending) |
|---|---|
| Name (Stripe product name) | `Support & updates｜月額サポート・更新` |
| Description (Stripe) | 導入済み事業者への月額サポート。法改正への追随準備（暫定パック。有資格レビュアー確定後に「維持」と表記）、更新提供、不具合修正、事業者環境の運用相談、監査台帳の出力支援を含む。サポートは平日 10:00–18:00 JST のベストエフォート、窓口は1つ（メール）。数値の応答約束はしない。事業者の環境で運用し、ホスティングは含まない。 |
| Price | ¥30,000 / month（税別）+ 消費税10%を別途 (JPY) |
| Tax | 手動計算（Stripe Tax は使わない）。請求書に税抜 / 消費税10% / 税込の3行を明示 |
| Billing cycle | 月額課金（monthly recurring）。Launch 納品完了月の翌月1日を開始案とする（開始日は契約で確定）。 |
| Cancellation (案) | 解約は1か月前通知（月末締め）。継続中の月は請求対象。提供済み更新分の返金はしない（案。オーナー確認待ち） |
| Customer | 同上（導入済み事業者のみ） |

Includes (monthly, ¥30,000):
- 法改正への追随準備（暫定パック。有資格レビュアー確定後に「維持」と表記。仕様引用付きカタログの更新：`realty.facts/catalog`）
- 更新提供と不具合修正
- 導入環境の運用相談・監査台帳の出力支援
- サポート受付: 平日 10:00–18:00 JST のベストエフォート、窓口は1つ（メール）。数値の応答約束（例: 2営業日）を入れるかはオーナー判断 — 本案は入れない

Excludes (not part of this product):
- Managed hosting（当方サーバでの運用代行）
- 事業者の宅建業資格行為・登記申請・決済実行・家賃収受
- 追加の jurisdiction パック（別途で案：月額外。価格は未確定）

## 3. Delivery correspondence (納品対応表)

| | ¥150,000 (Launch) | ¥30,000/月 (Support) |
|---|---|---|
| When | 契約・構築時（一度） | Launch 納品後から毎月 |
| Who acts | 当方が導入支援を行う（セットアップ支援＋手順書＋研修）。データは事業者の環境に残る | 当方が更新・サポートを行う。運用は事業者環境で行う |
| Server | 事業者の環境（自社サーバ等）で動く。当方に常時インスタンスは置かない | 同左。ホスティングは含まない |
| Data | 初期在庫移行の手順書＋移行支援。個人データはGitに置かない | 監査台帳の出力支援。個人データの保持は行わない |
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

裁定（2026-11-23, Organizer）反映後。**リンクは作らない（M2/M4 が閉じるまで）。**

- **M1 — closed in PR #20 (M1+M3)**. `docs/business-model.md` bullet struck and replaced with self-contained wording.
- **M2 — still open (blocked).** `docs/onboarding-managed-starter.md` still assumes Managed Starter; steps 5 (install), 6 (roles), 10 (console), 12–13 (support/cancel) are missing. **このPRでLaunchのスコープを deliverable な作業（リポジトリセットアップ支援＋初期在庫移行の手順書＋研修1回）に絞り、registry 一式導入を価格表から外した** ("cannot sell what the repo marks missing")。Full 3-app install はM2/M4 クローズまで売らない。
- **M3 — closed in PR #20 (M1+M3)**. `docs/operator-guide.md` 冒頭を Self-hosted Launch (setup) tier に修正。
- **M4 — still open (blocked).** “3app + 4ロールbot” の installable 一式（steps 5/6/10）は無い（現 repo にパッケージが無い）。**このPRで Launch の約束を deliverable 範囲に書き換えた**ため、できない約束を価格表に残さない。一式導入の販売は installable パッケージが出来るまで行わない。
- **M5 — wording closed in this PR.** 「SLA」削除。平日 10:00–18:00 JST のベストエフォート、窓口は1つ（メール）。数値の応答約束は入れない（守れない数字を契約に入れない — オーナー推奨）。Billing start / cancellation/refund は案のまま（オーナー承認待ち）。
- **M6 — wording weakened in this PR.** 「管轄パックの維持」→「法改正への追随準備（暫定パック。有資格レビュアー確定後に『維持』と表記）」。JPN は provisional、licensed reviewer unknown のまま。暫定を維持と書かない。
- **M7 — decided (manual) in this PR.** Stripe Tax は使わない（有料のため。「有料系を使わない」方針）。請求書は税抜 / 消費税10% / 税込の3行を手動計算。価格表記は「¥150,000（税別）＋消費税10%を別途」で統一。

No link is issued from this PR. The next step after owner resolves M1–M7 is: pick credential (a) restricted API key or (b) MCP/Composio (see §6 + report), create the two products/links, then swap the placeholders for real URLs in a follow-up PR.
