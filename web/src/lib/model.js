// Pure data + scoring logic. Mirrors pipeline/overlaps.py so the UI can re-rank live.
import D from "../data/grid.json";

export { D };
export const P = Object.fromEntries(D.projects.map(p => [p.id, p]));

export const TIER = {
  cross: { label: "Touching / crossing", short: "Touching", max: 0.1, base: 100, next: 85, color: "--t-cross",
           why: "Must coordinate: outage timing, crossing structures, shared terminal work" },
  row:   { label: "Under 1.6 km", short: "< 1.6 km", max: 1.6, base: 85, next: 65, color: "--t-row",
           why: "Can share the land itself: right-of-way, access roads, permits" },
  site:  { label: "Under 8 km", short: "< 8 km", max: 8, base: 65, next: 40, color: "--t-site",
           why: "Can share site logistics: laydown yards, material deliveries" },
  crew:  { label: "Under 40 km", short: "< 40 km", max: 40, base: 40, next: 0, color: "--t-crew",
           why: "Can share crews, cranes and contractors from one staging yard" },
};
export const TIER_ORDER = ["cross", "row", "site", "crew"];
const TIER_LO = { cross: 0, row: 0.1, site: 1.6, crew: 8 };
export const CONF = { high: 1, medium: 0.9, low: 0.75, none: 0 };
export const CONF_RANK = { high: 3, medium: 2, low: 1, none: 0 };

/* ------------------------------------------------------------------ formatting */
export const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const utilColor = code => code === "DESC" ? css("--desc") : code === "GPC" ? css("--gpc") : css("--partner");
export const utilName = p => p.utility_code === "DESC" ? "Dominion Energy SC" : p.utility;
export const fmtDate = s => s ? new Date(s + "T00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—";
export const money = n => n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : `$${Math.round(n / 1e3)}k`;
export const RANGE = [0.6, 1.5];
export const moneyRange = (lo, hi) => lo === hi ? money(lo) : `${money(lo)}–${money(hi)}`;
export const day = s => new Date(s + "T00:00").getTime() / 864e5;
export const shortName = s => s.replace(/^\w+:\s*/, "");
export const areaOf = o => o.closest_a[1] > 32.8 ? "Augusta / Aiken" : "Savannah / Lowcountry";

export const SOURCE_PDF = { DESC: "sources/desc.pdf", GA: "sources/georgia-power-irp.pdf" };
export const sourceHref = p => `${p.utility_code === "DESC" ? SOURCE_PDF.DESC : SOURCE_PDF.GA}#page=${p.source_page}`;

/* ------------------------------------------------------------------ scoring */
// Break the score into additive parts so a judge can see exactly where the points came from.
export function explain(o, tw) {
  const t = TIER[o.tier];
  const geo = t.base - (t.base - t.next) * (o.distance_km - TIER_LO[o.tier]) / (t.max - TIER_LO[o.tier]);
  const timing = o.construction_overlap_days > 0 ? 1 : Math.max(0, 1 - o.isd_gap_days / (365 * 4));
  const conf = Math.min(CONF[o.a_conf], CONF[o.b_conf]);
  const w = tw / 100;
  const prox = geo * (1 - w), time = geo * w * timing;
  return { geo, timing, conf, w, prox, time, penalty: (prox + time) * (1 - conf), total: (prox + time) * conf };
}
export const score = (o, tw) => Math.round(explain(o, tw).total * 10) / 10;

export const DEFAULT_FILTERS = { km: 40, gapYears: 10, tw: 40, overlapOnly: false, partners: false, minConf: 1, group: "pair" };

export function filterOverlaps(f) {
  let list = D.overlaps.filter(o =>
    o.distance_km <= f.km &&
    (f.gapYears >= 10 || o.isd_gap_days <= f.gapYears * 365) &&
    (!f.overlapOnly || o.construction_overlap_days > 0) &&
    (f.partners || o.b_utility_code === "GPC") &&
    Math.min(CONF_RANK[o.a_conf], CONF_RANK[o.b_conf]) >= f.minConf
  ).map(o => ({ ...o, s: score(o, f.tw) }));
  list.sort((a, b) => b.s - a.s || a.distance_km - b.distance_km);
  if (f.group === "cluster") {
    const seen = new Set();
    list = list.filter(o => !seen.has(o.a) && seen.add(o.a));
  }
  return list.map((o, i) => ({ ...o, r: i + 1 }));
}

/* ------------------------------------------------------------------ cost / impact model */
export const DEFAULT_ASSUMPTIONS = {
  landPerAcre: 15000,     // $/acre easement, rural coastal/Piedmont SC-GA
  rowShare: 0.35,         // fraction of the second corridor's width avoided by sharing
  permitting: 150000,     // $ for one joint environmental / permitting package instead of two
  yard: 300000,           // $ per laydown / staging yard (lease, grading, security, restoration)
  mobPct: 4,              // mobilization + demobilization as % of construction cost
  mobShare: 50,           // % of the smaller project's mobilization avoided by sharing crews
  crossing: 250000,       // $ avoided per coordinated crossing / shared-terminal outage
  perMile115: 2.0e6, perMile230: 3.0e6, perMile500: 4.5e6, perMile46: 1.2e6, subDefault: 8e6,
};

const ROW_FT = kv => kv >= 500 ? 200 : kv >= 230 ? 150 : kv >= 115 ? 100 : 60;
function projMiles(p) {
  if (p.line_miles) return p.line_miles;
  if (p.geometry?.type === "LineString") {
    const [[x1, y1], [x2, y2]] = p.geometry.coordinates;
    const R = 6371.0088, r = Math.PI / 180;
    const a = Math.sin((y2 - y1) * r / 2) ** 2 + Math.cos(y1 * r) * Math.cos(y2 * r) * Math.sin((x2 - x1) * r / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a)) / 1.609 * 1.15;   // 15% routing factor
  }
  return 0;
}
const EQUIPMENT = /REACTOR|TRANSFORMER|AUTO ?BANK|\bBANK\b|SUBSTATION|\bSUB\b|SWITCHING|CAPACITOR|STATCOM|BREAKER|RING BUS/i;
function projCost(p, A) {
  if (p.cost_usd) return { v: p.cost_usd, est: false };
  const kv = p.voltage_kv || 115, mi = p.line_miles ?? (p.kind === "line" ? projMiles(p) : 0);
  const per = kv >= 500 ? A.perMile500 : kv >= 230 ? A.perMile230 : kv >= 115 ? A.perMile115 : A.perMile46;
  const equip = EQUIPMENT.test(p.name + " " + p.description) || !mi;
  const v = mi * per + (equip ? A.subDefault : 0);
  const basis = [mi ? `${mi.toFixed(1)} mi × ${money(per)}/mi (${kv} kV)` : "", equip ? `${money(A.subDefault)} substation / equipment work` : ""].filter(Boolean).join(" + ");
  return { v, est: true, basis };
}

export function estimate(o, A) {
  const a = P[o.a], b = P[o.b];
  const aligned = o.construction_overlap_days > 0;
  const ca = projCost(a, A), cb = projCost(b, A);
  const items = [];
  const tierIdx = TIER_ORDER.indexOf(o.tier);

  const smaller = Math.min(ca.v, cb.v);
  items.push({ k: "Shared crews & equipment mobilization", v: smaller * A.mobPct / 100 * A.mobShare / 100, on: aligned,
    d: `${A.mobShare}% of ${A.mobPct}% mobilization on the smaller project (${money(smaller)})` });

  if (tierIdx <= 2) items.push({ k: "One shared laydown / staging yard", v: A.yard, on: aligned, d: "one yard instead of two, plus consolidated material deliveries" });
  else items.push({ k: "Shared laydown yard", v: 0, on: false, na: true, d: "needs < 8 km" });

  // Right-of-way: only the stretch where the two lines actually run side by side.
  if (tierIdx <= 1) {
    const sharedMi = (o.parallel_km || 0) / 1.609;
    const width = Math.min(ROW_FT(a.voltage_kv || 115), ROW_FT(b.voltage_kv || 115));
    const acres = sharedMi * 5280 * width * A.rowShare / 43560;
    items.push({ k: "Shared right-of-way corridor & permits", v: acres * A.landPerAcre + A.permitting, on: true,
      d: sharedMi > 0.05
        ? `${acres.toFixed(1)} acres avoided (${sharedMi.toFixed(1)} mi side by side × ${width} ft × ${Math.round(A.rowShare * 100)}%) + one joint permit package`
        : "lines meet at a shared facility rather than running side by side: one joint permit / siting package" });
  } else items.push({ k: "Shared right-of-way / permits", v: 0, on: false, na: true, d: "needs < 1.6 km" });

  if (o.tier === "cross") items.push({ k: "Coordinated outage & crossing / shared terminal", v: A.crossing, on: true, d: "one outage window and one crossing design instead of two" });

  const total = items.filter(i => i.on).reduce((s, i) => s + i.v, 0);
  const potential = items.filter(i => !i.na).reduce((s, i) => s + i.v, 0);
  return { items, total, potential, ca, cb, aligned,
    lo: total * RANGE[0], hi: total * RANGE[1], plo: potential * RANGE[0], phi: potential * RANGE[1] };
}

export function toCsv(list, A) {
  const rows = [["rank", "score", "tier", "distance_km", "isd_gap_days", "construction_overlap_days", "desc_project", "desc_in_service", "georgia_project", "georgia_sponsor", "georgia_in_service", "est_savings_as_scheduled", "est_savings_if_aligned"]];
  list.forEach(o => { const E = estimate(o, A); rows.push([o.r, o.s, o.tier, o.distance_km, o.isd_gap_days, o.construction_overlap_days, P[o.a].name, P[o.a].in_service, P[o.b].name, P[o.b].sponsor, P[o.b].in_service, Math.round(E.total), Math.round(E.potential)]); });
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

/* ------------------------------------------------------------------ persistence */
export const store = (() => { try { return window.localStorage; } catch { return null; } })();
export const loadSaved = () => { try { return JSON.parse(store?.getItem("gridlock") || "{}"); } catch { return {}; } };
export const save = patch => { try { store?.setItem("gridlock", JSON.stringify({ ...loadSaved(), ...patch })); } catch { /* storage unavailable */ } };
