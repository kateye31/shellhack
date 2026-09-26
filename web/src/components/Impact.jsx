import { useRef } from "react";
import { D, P, TIER_ORDER, estimate, moneyRange, money, shortName, areaOf } from "../lib/model";
import { CountUp, gsap, useGSAP, reducedMotion } from "../lib/anim";

export default function Impact({ list, partners, A, onSelect }) {
  const root = useRef(null);
  const nDesc = D.projects.filter(p => p.utility_code === "DESC" && p.geometry).length;
  const nGa = D.projects.filter(p => p.state === "GA" && p.geometry && (partners || p.utility_code === "GPC")).length;
  const checked = nDesc * nGa;
  const all40 = D.overlaps.filter(o => partners || o.b_utility_code === "GPC").length;
  const funnel = [
    [checked, "project pairs checked", "every located DESC project × every located Georgia project"],
    [all40, "within 40 km", `${(checked - all40).toLocaleString()} pairs filtered out as too far apart`],
    [list.length, "pass current filters", "the distance, timing and confidence filters on the Opportunities tab"],
    [list.filter(o => o.tier !== "crew").length, "within 8 km", "close enough to share yards, land or outages"],
    [list.filter(o => o.construction_overlap_days > 0).length, "same build window", "construction windows overlap, so savings are available as scheduled"],
  ];
  // Sum savings without double-counting: greedily use each project in at most one pairing.
  const est = list.map(o => ({ o, E: estimate(o, A) })).sort((p, q) => q.E.total - p.E.total || q.E.potential - p.E.potential);
  const used = new Set(), picks = [];
  for (const r of est) if (!used.has(r.o.a) && !used.has(r.o.b)) { used.add(r.o.a); used.add(r.o.b); picks.push(r); }
  const sum = k => picks.reduce((s, r) => s + r.E[k], 0);
  const areas = {};
  list.forEach(o => { const k = areaOf(o); areas[k] ||= { n: 0, aligned: 0 }; areas[k].n++; if (o.construction_overlap_days > 0) areas[k].aligned++; });
  const res = [
    ["Crews & equipment", list.length, "all pairs under 40 km"],
    ["Laydown / staging yards", list.filter(o => TIER_ORDER.indexOf(o.tier) <= 2).length, "pairs under 8 km"],
    ["Right-of-way & permits", list.filter(o => TIER_ORDER.indexOf(o.tier) <= 1).length, "pairs under 1.6 km"],
    ["Outage / crossing coordination", list.filter(o => o.tier === "cross").length, "touching or crossing"],
  ];
  const max = checked || 1;

  // The funnel narrows visibly: each bar grows to its width in sequence.
  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.timeline()
      .from(".fn-bar", { scaleX: 0, transformOrigin: "0% 50%", duration: 0.8, stagger: 0.12, ease: "power3.out", clearProps: "transform" })
      .from(".fn-txt", { opacity: 0, x: -6, stagger: 0.12, duration: 0.35, clearProps: "opacity,transform" }, 0.1)
      .from("#impact .block:not(:first-child)", { opacity: 0, y: 12, stagger: 0.08, clearProps: "opacity,transform" }, 0.4);
  }, { scope: root, dependencies: [list.length, partners] });

  return (
    <div id="impact" ref={root}>
      <section className="block"><h3>From {checked.toLocaleString()} pairs to a short list</h3>
        <div className="funnel">{funnel.map(([n, l, d], i) => (
          <div className="fn" key={l}>
            <div className="fn-bar" style={{ width: `${Math.max(2, Math.log10(n + 1) / Math.log10(max + 1) * 100)}%`, opacity: 1 - i * .13 }} />
            <div className="fn-txt"><b><CountUp value={n} /></b> {l}<small>{d}</small></div>
          </div>))}
        </div>
        <p className="note">Most pairs don't overlap, as the brief predicted. The engine discards anything 40 km or more apart before scoring. Bar widths use a log scale.</p>
      </section>
      <section className="block"><h3>Illustrative savings across the portfolio</h3>
        <div className="kpis">
          <div className="kpi"><b>{moneyRange(sum("lo"), sum("hi"))}</b><span>as scheduled today</span></div>
          <div className="kpi"><b>{moneyRange(sum("plo"), sum("phi"))}</b><span>if build windows were aligned</span></div>
          <div className="kpi"><b><CountUp value={picks.length} /></b><span>distinct pairings counted</span></div>
        </div>
        <p className="note">Each project is counted in at most one pairing, so savings aren't double-counted. These are planning-level ranges from the editable assumptions in the Detail view, not verified savings.</p>
      </section>
      <section className="block"><h3>Resources that could be shared</h3>
        <table className="itable"><tbody>{res.map(([k, n, d]) => <tr key={k}><td>{k}<small>{d}</small></td><td>{n} pairs</td></tr>)}</tbody></table>
      </section>
      <section className="block"><h3>Where the opportunities are</h3>
        <table className="itable"><tbody>{Object.entries(areas).sort().map(([k, v]) =>
          <tr key={k}><td>{k}<small>{v.aligned} with overlapping build windows</small></td><td>{v.n} pairs</td></tr>)}</tbody></table>
      </section>
      <section className="block"><h3>Top pairings by estimated value</h3>
        <ol className="toplist">{picks.slice(0, 6).map(r => (
          <li key={r.o.id} onClick={() => onSelect(r.o.id, true)}>
            <span>{P[r.o.a].name.split(":")[0]} ⟷ {shortName(P[r.o.b].name)}</span>
            <b>{r.E.aligned ? moneyRange(r.E.lo, r.E.hi) : `${moneyRange(r.E.plo, r.E.phi)}*`}</b>
          </li>))}
        </ol>
        <p className="note">* potential only if the two schedules are aligned. Central total as scheduled: {money(sum("total"))}.</p>
      </section>
    </div>
  );
}
