// UI for the registry app. All records live in IndexedDB on this device; the
// only network request is the consented Wikidata lookup (lookup.js).
import descriptor from "./descriptor.js";
import facts from "./jurisdictions.js";
import { createClientConsentHost } from "./kotoba-client-runtime.js";
import { openStore } from "./store.js";
import { PROPERTY_KINDS, RIGHT_TYPES, createRecord, amendRecord, recordProblems, checklist } from "./records.js";
import { createLookup, RADII_KM } from "./lookup.js";
import { PARTY_ROLES, VERDICTS, RULES, basisOf, openCase, caseState, recordScreening, propose, approve, decline, markClosed, withdraw, caseProblems } from "./closing.js";

const catalog = facts.catalog;
const KEY = "records";
const CASES_KEY = "closings";
const store = openStore();
const consentHost = createClientConsentHost();
const lookup = createLookup({ descriptor, consentHost });

const GATE_LABELS = {
  "important-matters-explained": "重要事項説明（宅地建物取引士）",
  "contract-signed": "売買契約の締結",
  "identity-confirmed": "本人確認",
  "registration-tax-paid": "登録免許税の納付",
  "application-filed": "登記の申請（当事者または司法書士）",
  "registration-completed": "登記の完了（登記官）",
  "funds-released": "代金の受け渡し",
  "notary-approved": "公証人の承認",
  "deed-signed": "譲渡証書への署名",
  "kadaster-registered": "Kadaster への登録",
  "funds-released-by-notary": "公証人による代金の受け渡し",
};
const PROBLEM_LABELS = {
  jurisdiction: "法域コード（例: JPN、USA-CA）を入れてください。",
  kind: "種類を選んでください。",
  address: "所在を入れてください。",
  areaM2: "面積は正の数で入れてください。",
  location: "緯度と経度は両方を、範囲内（緯度 ±90、経度 ±180）で入れてください。",
  "rights.type": "権利の種類を選んでください。",
  "rights.holder": "権利者を入れてください。",
  "rights.since": "日付は YYYY-MM-DD で入れてください。",
  "jurisdiction-fixed": "法域は作成後に変えられません。新しい記録を作ってください。",
  "pii-prohibited": "連絡先や公的識別子（メール・電話・マイナンバー等）は記録に保存できません。取り除いてください（docs/pii-boundary.md）。",
};

const CASE_PROBLEMS = {
  parties: "関係者の役割と名前を 1 人以上入れてください。",
  "case-open": "この記録には進行中の成約の準備があります。",
  held: "保留中の提案は承認できません。理由を解消して、提案を作り直してください。",
  "stale-proposal": "提案のあとに書類か照合結果が変わりました。提案を作り直してください。",
  "no-proposal": "承認を待っている提案がありません。",
  approver: "承認する人の名前と資格・役割を入れてください。",
  "not-approved": "承認の記録がありません。",
  "case-settled": "この成約の準備は確定済みです。",
};
const STATUS_LABELS = { open: "準備中", hold: "保留", "awaiting-human": "人の承認待ち", approved: "承認を記録済み", declined: "差し戻し", closed: "成約済み（控え）", withdrawn: "取り下げ" };

let records = [];
let cases = [];
let casesRejected = [];
let selected = null;
let view = "detail"; // detail | form
let lastLookup = null; // { id, results, retrievedAt }
let lookupAbort = null;

// --- tiny DOM helper: text nodes only, never HTML strings ---
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const $ = (id) => document.getElementById(id);
const jurName = (code) => (catalog[code] ? `${code} — ${catalog[code].name}` : code);
const fmtArea = (m2) => (m2 === null ? "—" : `${m2.toLocaleString("ja-JP")} m²`);
const fmtDate = (iso) => new Date(iso).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });

async function load() {
  const saved = await store.get(KEY);
  const list = Array.isArray(saved) ? saved : [];
  records = list.filter((r) => recordProblems(r).length === 0);
  const dropped = list.length - records.length;
  $("storage").textContent = dropped ? `整合しない記録 ${dropped} 件を読み込みませんでした（端末には残っています）。` : "";
  if (dropped) records.rejected = list.filter((r) => recordProblems(r).length);
  const savedCases = await store.get(CASES_KEY);
  const all = Array.isArray(savedCases) ? savedCases : [];
  cases = all.filter((c) => caseProblems(c).length === 0);
  casesRejected = all.filter((c) => caseProblems(c).length);
  if (casesRejected.length) $("storage").textContent += ` 整合しない成約の準備 ${casesRejected.length} 件を読み込みませんでした（端末には残っています）。`;
}

async function saveCases() {
  const ok = await store.set(CASES_KEY, [...cases, ...casesRejected]);
  if (!ok) $("storage").textContent = "この端末に保存できませんでした。アプリを閉じると失われます。";
  return ok;
}

// Apply a closing.js result: keep the new case, or show why it was refused.
async function applyCase(result, errors) {
  if (result.problems) { errors?.replaceChildren(...result.problems.map((p) => h("li", {}, CASE_PROBLEMS[p] ?? p))); return false; }
  if (result.unchanged) return true;
  cases = cases.some((c) => c.id === result.case.id) ? cases.map((c) => (c.id === result.case.id ? result.case : c)) : [...cases, result.case];
  await saveCases();
  render();
  return true;
}

async function save() {
  const keep = [...records, ...(records.rejected ?? [])];
  const ok = await store.set(KEY, keep);
  $("storage").textContent = ok ? "" : "この端末に保存できませんでした。アプリを閉じると失われます。";
  return ok;
}

function renderList() {
  const ul = $("list");
  ul.replaceChildren(...records.map((r) => h("li", {},
    h("button", { type: "button", class: "item", "aria-current": r.id === selected ? "true" : false, onclick: () => select(r.id) },
      h("span", { class: "id" }, r.id),
      h("span", { class: "addr" }, r.data.address),
      h("span", { class: "muted" }, `${PROPERTY_KINDS[r.data.kind]} ・ 権利 ${r.data.rights.length} 件`)))));
  $("empty").hidden = records.length > 0;
}

function select(id) {
  selected = id; view = "detail";
  render();
  $("detail").scrollIntoView({ block: "start", behavior: "smooth" });
}

function render() {
  renderList();
  const d = $("detail");
  const record = records.find((r) => r.id === selected);
  if (view === "form") d.replaceChildren(form(record ?? null));
  else if (record) d.replaceChildren(...detail(record));
  else d.replaceChildren(h("p", { class: "muted" }, "記録を選ぶと、内容・法域の手続き・照会・履歴を表示します。"));
}

// --- form ---
function rightRow(r = {}) {
  const row = h("div", { class: "right-row" },
    h("select", { "aria-label": "権利の種類", name: "type" }, ...Object.entries(RIGHT_TYPES).map(([k, v]) => h("option", { value: k, selected: r.type === k }, v))),
    h("input", { "aria-label": "権利者", name: "holder", placeholder: "権利者", value: r.holder ?? "" }),
    h("input", { "aria-label": "持分", name: "share", placeholder: "持分（例: 1/2）", value: r.share ?? "" }),
    h("input", { "aria-label": "登記・取得日", name: "since", type: "date", value: r.since ?? "" }),
    h("button", { type: "button", class: "secondary small", "aria-label": "この権利を除く", onclick: () => row.remove() }, "除く"));
  return row;
}

function form(record) {
  const d = record?.data ?? { jurisdiction: "JPN", kind: "land", rights: [{ type: "ownership" }] };
  const rights = h("div", { class: "rights" }, ...(d.rights.length ? d.rights : [{ type: "ownership" }]).map(rightRow));
  const errors = h("ul", { class: "error", role: "alert" });
  const field = (label, input) => h("label", { class: "field" }, h("span", {}, label), input);
  const f = h("form", { class: "card", novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(); } },
    h("h2", {}, record ? `${record.id} を修正` : "新しい記録"),
    field("法域", h("input", { name: "jurisdiction", list: "jur-list", value: d.jurisdiction, disabled: !!record, autocomplete: "off", "aria-describedby": "jur-hint" })),
    h("datalist", { id: "jur-list" }, ...Object.keys(catalog).map((k) => h("option", { value: k }, catalog[k].name))),
    h("p", { id: "jur-hint", class: "hint" }, `手続きの情報があるのは ${Object.keys(catalog).join("、")} です。ほかの法域も記録できますが、必要書類は表示しません。`),
    field("種類", h("select", { name: "kind" }, ...Object.entries(PROPERTY_KINDS).map(([k, v]) => h("option", { value: k, selected: d.kind === k }, v)))),
    field("所在", h("input", { name: "address", value: d.address ?? "", placeholder: "例: 東京都港区芝公園四丁目" })),
    field("地番・家屋番号", h("input", { name: "parcel", value: d.parcel ?? "" })),
    field("面積（m²）", h("input", { name: "areaM2", inputmode: "decimal", value: d.areaM2 ?? "" })),
    h("div", { class: "pair" },
      field("緯度", h("input", { name: "lat", inputmode: "decimal", value: d.lat ?? "", placeholder: "35.6586" })),
      field("経度", h("input", { name: "lon", inputmode: "decimal", value: d.lon ?? "", placeholder: "139.7454" }))),
    h("fieldset", {}, h("legend", {}, "権利"), rights,
      h("button", { type: "button", class: "secondary small", onclick: () => rights.append(rightRow({ type: "ownership" })) }, "権利を加える")),
    field("メモ", h("textarea", { name: "note", rows: 3 }, d.note ?? "")),
    errors,
    h("div", { class: "row" },
      h("button", { type: "submit" }, record ? "修正を記録する" : "記録する"),
      h("button", { type: "button", class: "secondary", onclick: () => { view = "detail"; render(); } }, "やめる")));

  async function submit() {
    const val = (n) => f.elements[n].value;
    const input = {
      jurisdiction: record ? record.data.jurisdiction : val("jurisdiction"), kind: val("kind"), address: val("address"), parcel: val("parcel"),
      areaM2: val("areaM2"), lat: val("lat"), lon: val("lon"), note: val("note"),
      rights: [...rights.children].map((row) => Object.fromEntries(["type", "holder", "share", "since"].map((n) => [n, row.querySelector(`[name=${n}]`).value]))),
      docs: record?.data.docs ?? [], references: record?.data.references ?? [],
    };
    const result = record ? amendRecord(record, input, { catalog }) : createRecord(records, input, { catalog });
    if (result.problems) { errors.replaceChildren(...result.problems.map((p) => h("li", {}, PROBLEM_LABELS[p] ?? p))); return; }
    if (record) records = Object.assign(records.map((r) => (r.id === record.id ? result.record : r)), { rejected: records.rejected });
    else records = Object.assign([...records, result.record], { rejected: records.rejected });
    await save();
    select(result.record.id);
  }
  return f;
}

// --- detail ---
async function amend(record, changes) {
  const result = amendRecord(record, { ...record.data, ...changes }, { catalog });
  if (result.problems || result.unchanged) return;
  records = Object.assign(records.map((r) => (r.id === record.id ? result.record : r)), { rejected: records.rejected });
  await save();
  render();
}

function detail(r) {
  const d = r.data;
  const spec = catalog[d.jurisdiction];
  const out = [];
  out.push(h("div", { class: "card" },
    h("div", { class: "head" }, h("h2", {}, r.id), h("span", { class: "chip" }, "下書き・未署名")),
    h("dl", {},
      h("dt", {}, "法域"), h("dd", {}, jurName(d.jurisdiction)),
      h("dt", {}, "種類"), h("dd", {}, PROPERTY_KINDS[d.kind]),
      h("dt", {}, "所在"), h("dd", {}, d.address),
      h("dt", {}, "地番・家屋番号"), h("dd", {}, d.parcel || "—"),
      h("dt", {}, "面積"), h("dd", {}, fmtArea(d.areaM2)),
      h("dt", {}, "位置"), h("dd", {}, d.lat === null ? "—" : `${d.lat}, ${d.lon}`),
      d.note ? [h("dt", {}, "メモ"), h("dd", { class: "pre" }, d.note)] : null),
    h("table", { class: "rights-table" },
      h("caption", {}, "権利"),
      h("thead", {}, h("tr", {}, h("th", {}, "種類"), h("th", {}, "権利者"), h("th", {}, "持分"), h("th", {}, "日付"))),
      h("tbody", {}, ...(d.rights.length ? d.rights.map((x) => h("tr", {}, h("td", {}, RIGHT_TYPES[x.type]), h("td", {}, x.holder), h("td", {}, x.share || "—"), h("td", {}, x.since || "—")))
        : [h("tr", {}, h("td", { colspan: 4, class: "muted" }, "権利の記載はありません。"))]))),
    h("div", { class: "row" },
      h("button", { type: "button", class: "secondary", onclick: () => { view = "form"; render(); } }, "修正する"),
      deleteButton(r))));

  // jurisdiction procedure from realty.facts
  const cl = checklist(r, catalog);
  out.push(h("div", { class: "card" },
    h("h3", {}, "法域の手続き"),
    spec ? [
      h("dl", {},
        h("dt", {}, "登記の機関"), h("dd", {}, spec["owner-authority"]),
        h("dt", {}, "根拠"), h("dd", {}, spec["legal-basis"]),
        spec["national-spec"] ? [h("dt", {}, "申請の方法"), h("dd", {}, spec["national-spec"])] : null,
        h("dt", {}, "出典"), h("dd", { class: "url" }, spec.provenance)),
      spec["actuation-authority"] ? h("p", { class: "hint" }, `実行するのは: ${spec["actuation-authority"]}`) : null,
      spec["gates-status"] === "provisional" ? h("p", { class: "hint warn" }, "この法域の手続きは暫定で、現地の資格者の確認を受けていません。") : null,
      spec["human-gates"]?.length ? [h("h4", {}, "人が行う手続き（このアプリは代行しません）"),
        h("ul", { class: "gates" }, ...spec["human-gates"].map((g) => h("li", {}, GATE_LABELS[g] ?? g)))] : null,
      h("h4", {}, "必要書類（手元にあるものに印）"),
      h("ul", { class: "docs" }, ...cl.items.map(({ doc, held }) => h("li", {},
        h("label", {}, h("input", { type: "checkbox", checked: held, onchange: (e) => amend(r, { docs: e.target.checked ? [...d.docs, doc] : d.docs.filter((x) => x !== doc) }) }), doc)))),
      spec.notes ? h("details", {}, h("summary", {}, "注記"), h("p", { class: "hint pre" }, spec.notes)) : null,
    ] : h("p", { class: "muted" }, `${d.jurisdiction} の手続きの情報は realty.facts にありません。推測で補わず、表示しません。`)));

  out.push(closingCard(r));

  out.push(lookupCard(r));

  if (d.references.length) out.push(h("div", { class: "card" }, h("h3", {}, "照会から残した参考"),
    h("ul", { class: "refs" }, ...d.references.map((x) => h("li", {},
      h("strong", {}, x.label), ` — 所有者（Wikidata）: ${x.owners.map((o) => o.label).join("、")}`,
      h("span", { class: "muted" }, ` ${x.item}・${fmtDate(x.retrievedAt)} 取得`))))));

  out.push(h("div", { class: "card" }, h("h3", {}, "履歴（追記のみ）"),
    h("ol", { class: "history" }, ...r.history.map((e) => h("li", {},
      h("span", { class: "muted" }, fmtDate(e.at)), " ",
      e.kind === "created" ? "作成" : `修正: ${Object.keys(e.changed).map(fieldLabel).join("、")}`)))));
  return out;
}

const FIELD_LABELS = { kind: "種類", address: "所在", parcel: "地番", areaM2: "面積", lat: "緯度", lon: "経度", rights: "権利", docs: "必要書類", references: "参考", note: "メモ" };
const fieldLabel = (f) => FIELD_LABELS[f] ?? f;

function deleteButton(r) {
  let armed = false;
  const b = h("button", { type: "button", class: "secondary danger", onclick: async () => {
    if (!armed) { armed = true; b.textContent = "本当に端末から削除"; setTimeout(() => { armed = false; b.textContent = "削除"; }, 4000); return; }
    records = Object.assign(records.filter((x) => x.id !== r.id), { rejected: records.rejected });
    cases = cases.filter((c) => c.recordId !== r.id);
    selected = null;
    await save();
    await saveCases();
    render();
  } }, "削除");
  return b;
}

// --- closing preparation (closing.js; the device-side form of realty.governor) ---
function partyRow(p = {}) {
  const row = h("div", { class: "party-row" },
    h("select", { "aria-label": "役割", name: "role" }, ...Object.entries(PARTY_ROLES).map(([k, v]) => h("option", { value: k, selected: p.role === k }, v))),
    h("input", { "aria-label": "名前", name: "name", placeholder: "名前（法人名・氏名）", value: p.name ?? "" }),
    h("button", { type: "button", class: "secondary small", "aria-label": "この関係者を除く", onclick: () => row.remove() }, "除く"));
  return row;
}

const EVENT_TEXT = {
  opened: (e) => `受理: 関係者 ${e.parties.length} 名`,
  screened: (e, s) => `照合結果: ${s.parties[e.party]?.name ?? ""} — ${VERDICTS[e.verdict]}`,
  proposed: (e) => (e.disposition === "hold" ? `提案: 保留（${e.violations.length} 件）` : "提案: 人の承認待ち"),
  approved: (e) => `承認: ${e.by}（${e.role}）`,
  declined: (e) => `差し戻し: ${e.by}${e.reason ? ` — ${e.reason}` : ""}`,
  closed: (e) => `登記完了の控え: ${e.by}${e.reference ? `（${e.reference}）` : ""}`,
  withdrawn: () => "取り下げ",
};

function closingCard(r) {
  const spec = catalog[r.data.jurisdiction];
  const mine = cases.filter((c) => c.recordId === r.id);
  const current = mine.at(-1) ?? null;
  const state = current ? caseState(current) : null;
  const active = state && !["closed", "withdrawn"].includes(state.status);
  const errors = h("ul", { class: "error", role: "alert" });
  const card = h("div", { class: "card" },
    h("div", { class: "head" }, h("h3", {}, "成約の準備"), state ? h("span", { class: `chip status-${state.status}` }, STATUS_LABELS[state.status]) : null),
    h("p", { class: "hint" }, "受理、必要書類の確認、成約提案の下書き、人の承認までをこの端末の中で控えます。照合・登記の申請・代金の受け渡しは行いません。承認できるのは人だけです。"));

  if (!spec) card.append(h("p", { class: "hint warn" }, `${r.data.jurisdiction} の公式な根拠が realty.facts にないため、成約の提案は必ず保留になります。`));

  if (!active) {
    if (current) card.append(caseHistory(current, state));
    const rows = h("div", { class: "rights" }, partyRow({ role: "seller" }), partyRow({ role: "buyer" }));
    card.append(
      h("h4", {}, current ? "新しい準備を始める" : "受理（関係者）"), rows,
      h("button", { type: "button", class: "secondary small", onclick: () => rows.append(partyRow({ role: "buyer" })) }, "関係者を加える"),
      errors,
      h("div", { class: "row" }, h("button", { type: "button", onclick: () => applyCase(openCase(cases, r, {
        parties: [...rows.children].map((row) => ({ role: row.querySelector("[name=role]").value, name: row.querySelector("[name=name]").value })) }), errors) }, "準備を始める")));
    return card;
  }

  const c = current;
  const settled = state.status === "approved";
  card.append(h("h4", {}, "関係者と照合結果"),
    h("p", { class: "hint" }, "制裁・PEP リストとの照合は、事業者が自分の手段で行います。ここには結果だけを控えます。"),
    h("ul", { class: "parties" }, ...state.parties.map((p, i) => h("li", {},
      h("span", {}, `${PARTY_ROLES[p.role]}: ${p.name}`),
      h("select", { "aria-label": `${p.name} の照合結果`, disabled: settled, onchange: (e) => applyCase(recordScreening(c, i, e.target.value), errors) },
        ...Object.entries(VERDICTS).map(([k, v]) => h("option", { value: k, selected: state.verdicts[i] === k }, v)))))));

  const cl = checklist(r, catalog);
  const held = cl.items.filter((x) => x.held).length;
  card.append(h("h4", {}, "必要書類"),
    h("p", { class: cl.covered && held === cl.items.length ? "muted" : "hint warn" },
      cl.covered ? `${held} / ${cl.items.length} 件に印があります（上の「法域の手続き」で印を付けます）。` : "この法域の必要書類は表示できません。"));

  const p = state.proposal;
  // A proposal judged on documents or screening results that have since changed cannot be approved.
  const stale = !!p && !settled && JSON.stringify(p.basis) !== JSON.stringify(basisOf(c, r, catalog));
  if (p) {
    card.append(h("h4", {}, "成約提案（下書き）"));
    if (p.disposition === "hold") card.append(h("ul", { class: "holds" }, ...p.violations.map((v) => h("li", {}, RULES[v]))),
      h("p", { class: "hint" }, "保留は承認で通せません。理由を解消してから、提案を作り直してください。"));
    else {
      card.append(h("p", { class: "muted" }, `保留の理由はありません。根拠: ${p.basis.specBasis.provenance}`));
      // Node.append() would print a null child as the text "null".
      if (p.unscreened) card.append(h("p", { class: "hint warn" }, `照合していない関係者が ${p.unscreened} 名います。`));
    }
    if (stale) card.append(h("p", { class: "hint warn" }, "提案のあとに書類か照合結果が変わりました。この提案は承認できません。提案を作り直してください。"));
  }
  if (!settled) card.append(h("div", { class: "row" },
    h("button", { type: "button", onclick: () => applyCase(propose(c, r, catalog, cases), errors) }, p ? "提案を作り直す" : "成約提案を作る"),
    h("button", { type: "button", class: "secondary", onclick: () => applyCase(withdraw(c), errors) }, "取り下げる")));

  if (state.status === "awaiting-human" && !stale) {
    const by = h("input", { "aria-label": "承認する人の名前", placeholder: "承認する人の名前" });
    const role = h("input", { "aria-label": "資格・役割", placeholder: "資格・役割（例: 宅地建物取引士）" });
    card.append(h("h4", {}, "人の承認"),
      h("p", { class: "hint" }, "承認は、資格を持つ人が内容を確かめたという控えです。このアプリは登記を申請せず、代金も動かしません。"),
      h("div", { class: "pair" }, by, role),
      h("div", { class: "row" },
        h("button", { type: "button", onclick: () => applyCase(approve(c, r, catalog, cases, { by: by.value, role: role.value }), errors) }, "承認を記録する"),
        h("button", { type: "button", class: "secondary", onclick: () => applyCase(decline(c, { by: by.value }), errors) }, "差し戻す")));
  }
  if (settled) {
    const by = h("input", { "aria-label": "控える人の名前", placeholder: "控える人の名前", value: state.approval.by });
    const ref = h("input", { "aria-label": "受付番号など", placeholder: "受付番号など（任意）" });
    card.append(h("h4", {}, "このあと人が行う手続き"),
      spec?.["human-gates"]?.length ? h("ul", { class: "gates" }, ...spec["human-gates"].map((g) => h("li", {}, GATE_LABELS[g] ?? g)))
        : h("p", { class: "muted" }, "この法域の人の手続きの一覧は realty.facts にありません。"),
      h("p", { class: "hint" }, "登記が完了したら、その事実を控えます。完了させるのは登記の機関です。"),
      h("div", { class: "pair" }, by, ref),
      h("div", { class: "row" }, h("button", { type: "button", onclick: () => applyCase(markClosed(c, { by: by.value, reference: ref.value }), errors) }, "登記の完了を控える")));
  }
  card.append(errors, caseHistory(c, state));
  return card;
}

function caseHistory(c, state) {
  return h("details", {}, h("summary", {}, `${c.id} の履歴（追記のみ、${c.events.length} 件）`),
    h("ol", { class: "history" }, ...c.events.map((e) => h("li", {}, h("span", { class: "muted" }, fmtDate(e.at)), " ", EVENT_TEXT[e.kind](e, state)))));
}

function lookupCard(r) {
  const d = r.data;
  const card = h("div", { class: "card" }, h("h3", {}, "周辺の所有者情報を照会"));
  if (d.lat === null) {
    card.append(h("p", { class: "muted" }, "位置（緯度・経度）を記録すると照会できます。"));
    return card;
  }
  const radius = h("select", { "aria-label": "照会する範囲" }, ...RADII_KM.map((km) => h("option", { value: km, selected: km === 1 }, `半径 ${km} km`)));
  const status = h("p", { class: "muted", role: "status" });
  const results = h("ul", { class: "results" });
  const go = h("button", { type: "button" }, "Wikidata に照会");
  card.append(
    h("p", { class: "hint" }, "Wikidata に「所有者」（P127）が書かれた周辺の場所を探します。押すと、送る内容（この記録の緯度・経度と範囲）を示して毎回確認します。拒否すれば何も送りません。結果は Wikidata の記載で、登記簿ではありません。個人の所有者は名前を表示しません。"),
    h("div", { class: "row" }, radius, go), status, results);

  const show = (found) => {
    results.replaceChildren(...found.results.map((x) => {
      const kept = d.references.some((ref) => ref.item === x.item);
      return h("li", {},
        h("div", {}, h("strong", {}, x.label), h("span", { class: "muted" }, ` ${x.distanceKm === null ? "" : `${x.distanceKm.toFixed(2)} km`} ・ ${x.item}`)),
        h("div", {}, `所有者: ${x.owners.map((o) => o.label).join("、")}`),
        h("button", { type: "button", class: "secondary small", disabled: kept, onclick: () => amend(r, { references: [...d.references, { source: "wikidata", ...x, retrievedAt: found.retrievedAt }] }) }, kept ? "参考に残しました" : "参考に残す"));
    }));
    status.textContent = found.results.length ? `${found.results.length} 件（${fmtDate(found.retrievedAt)} 取得、CC0）` : "この範囲に該当する記載はありませんでした。";
  };
  if (lastLookup?.id === r.id) show(lastLookup);

  go.addEventListener("click", async () => {
    lookupAbort?.abort();
    lookupAbort = new AbortController();
    go.disabled = true; status.textContent = "確認しています…"; status.classList.remove("error");
    try {
      const found = await lookup.search({ lat: d.lat, lon: d.lon, radiusKm: Number(radius.value), signal: lookupAbort.signal });
      lastLookup = { id: r.id, ...found };
      show(lastLookup);
    } catch (e) {
      const denied = /not approved/.test(e.message);
      status.textContent = denied ? "照会しませんでした（何も送っていません）。" : `照会できませんでした: ${e.message}`;
      status.classList.toggle("error", !denied);
    } finally { go.disabled = false; }
  });
  return card;
}

$("new").addEventListener("click", () => { selected = null; view = "form"; render(); $("detail").scrollIntoView({ block: "start" }); });
$("facts-count").textContent = `${Object.keys(catalog).length} 法域、facts.cljk ${facts.sha256.slice(0, 12)}`;

(async () => {
  await load();
  selected = records[0]?.id ?? null;
  render();
  try {
    const info = await globalThis.__TAURI__?.core?.invoke("awai_host_info");
    if (info) $("env").textContent = ` 実行環境: Awai shell（${info.app}）`;
  } catch { /* plain browser */ }
})();
