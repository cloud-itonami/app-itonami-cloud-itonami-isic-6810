// UI for the registry app. All records live in IndexedDB on this device; the
// only network request is the consented Wikidata lookup (lookup.js).
import descriptor from "./descriptor.js";
import facts from "./jurisdictions.js";
import { createClientConsentHost } from "./kotoba-client-runtime.js";
import { openStore } from "./store.js";
import { PROPERTY_KINDS, RIGHT_TYPES, createRecord, amendRecord, recordProblems, checklist } from "./records.js";
import { createLookup, RADII_KM } from "./lookup.js";

const catalog = facts.catalog;
const KEY = "records";
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
};

let records = [];
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
    selected = null;
    await save();
    render();
  } }, "削除");
  return b;
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
