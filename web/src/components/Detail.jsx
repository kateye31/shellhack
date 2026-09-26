import { useRef } from "react";
import {
  D, P, TIER, TIER_ORDER, CONF, RANGE, DEFAULT_ASSUMPTIONS, css, utilColor, utilName, fmtDate, money, moneyRange,
  day, explain, estimate, sourceHref, shortName,
} from "../lib/model";
import { CountUp, gsap, useGSAP, reducedMotion } from "../lib/anim";

function MiniGantt({ o }) {
  const a = P[o.a], b = P[o.b];
  const all = [a, b].flatMap(p => [day(p.window.start), day(p.window.in_service)]);
  const lo = Math.min(...all) - 90, hi = Math.max(...all) + 90;
  const x = v => `${((v - lo) / (hi - lo) * 100).toFixed(2)}%`;
  const w = (s, e) => `${((e - s) / (hi - lo) * 100).toFixed(2)}%`;
  const row = p => {
    const s = day(p.window.start), c = day(p.window.construction_start), e = day(p.window.in_service), col = utilColor(p.utility_code);
    return (
      <div className="mg-row" key={p.id}><span>{p.utility_code === "DESC" ? "DESC" : "Georgia"}</span><div className="mg-track">
        <div className="mg-bar" style={{ left: x(s), width: w(s, e), background: col }} />
        <div className="mg-bar c" style={{ left: x(c), width: w(c, e), background: col }} />
        <div className="mg-isd" style={{ left: x(e) }} title={`In service ${fmtDate(p.window.in_service)}`} />
      </div></div>
    );
  };
  const oc = Math.max(day(a.window.construction_start), day(b.window.construction_start));
  const oe = Math.min(day(a.window.in_service), day(b.window.in_service));
  const y0 = new Date(lo * 864e5).getFullYear(), y1 = new Date(hi * 864e5).getFullYear();
  return (
    <>
      <div className="mini-gantt">
        {row(a)}{row(b)}
        {oe > oc && <div className="mg-row"><span>overlap</span><div className="mg-track"><div className="mg-ovl" style={{ left: x(oc), width: w(oc, oe) }} /></div></div>}
        <div className="mg-axis"><span>{y0}</span><span>{Math.round((y0 + y1) / 2)}</span><span>{y1}</span></div>
      </div>
      <p className="note">Faint bar = planning window (start date → in service). Solid bar = final {D.params.construction_months} months of field construction. Black tick = in-service date.</p>
    </>
  );
}

function Why({ o, tw }) {
  const x = explain(o, tw), t = TIER[o.tier];
  const worst = [o.a_conf, o.b_conf].sort((p, q) => CONF[p] - CONF[q])[0];
  const seg = (v, c, label) => v > 0.05 && <span style={{ width: `${v}%`, background: c }} title={`${label}: ${v.toFixed(1)} pts`} />;
  return (
    <section className="block why"><h3>Why was this flagged?</h3>
      <p>
        These projects {o.distance_km < 0.1 ? "touch: they share a facility or cross" : <>come within <b>{o.distance_km.toFixed(2)} km</b> of each other at their closest points</>},
        which puts them in the {t.label.toLowerCase()} band (the limit is 40 km).{" "}
        {o.construction_overlap_days > 0
          ? <>Their construction windows <b>overlap for about {Math.round(o.construction_overlap_days / 30)} months</b>, so the same crews and equipment could serve both.</>
          : <>Their construction windows do <b>not</b> overlap (in-service dates {(o.isd_gap_days / 365).toFixed(1)} years apart), so timing adds {x.time < 1 ? "nothing" : "only a little"} to the score.</>}
        {x.conf < 1 ? <> Points were deducted because one location is only <b>{worst}</b>-confidence.</> : " Both locations are high-confidence matches."}
        {" "}At this distance the utilities could: <b>{t.why.toLowerCase()}</b>.
      </p>
      <div className="scorebar">
        {seg(x.prox * x.conf, css("--desc"), "Proximity")}{seg(x.time * x.conf, css("--good"), "Timing")}{seg(x.penalty, css("--t-crew"), "Confidence deduction")}
      </div>
      <div className="scorekey">
        <span><i style={{ background: css("--desc") }} />Proximity {x.prox.toFixed(1)}</span>
        <span><i style={{ background: css("--good") }} />Timing {x.time.toFixed(1)}</span>
        <span><i style={{ background: css("--t-crew") }} />Confidence −{x.penalty.toFixed(1)}</span>
        <span>= <b>{x.total.toFixed(1)}</b> / 100</span>
      </div>
      <p className="note">Geography is the primary signal ({Math.round((1 - x.w) * 100)}% of the weight). Timing is secondary ({Math.round(x.w * 100)}%, adjustable with the Timeline weight slider).</p>
    </section>
  );
}

function ProjectCard({ p }) {
  const w = p.window;
  return (
    <div className="pcard" style={{ borderLeftColor: utilColor(p.utility_code) }}>
      <div className="sub">{utilName(p)} · {p.utility_code === "DESC" ? "SCRTP project " : "TEAMS #"}{p.source_id}{p.zone ? ` · zone ${p.zone}` : ""} ·{" "}
        <a href={sourceHref(p)} target="_blank" rel="noopener">source PDF p.{p.source_page} ↗</a></div>
      <h3>{p.name}</h3>
      <p>{p.description || "—"}</p>
      <div className="sub">In service <b>{fmtDate(p.in_service)}</b> · {p.status}
        {p.cost_usd ? ` · budget ${money(p.cost_usd)}` : " · cost redacted in public filing"}
        {p.line_miles ? ` · ${p.line_miles} mi` : ""}{p.voltage_kv ? ` · ${p.voltage_kv} kV` : ""}
        {w ? ` · window ${fmtDate(w.start)} → ${fmtDate(w.in_service)}` : ""}</div>
      <div className="eps">
        {p.endpoints.map((e, i) => (
          <div key={i}>{e.lat != null ? "●" : "○"} {e.name}{" "}
            <span className={`conf ${e.method === "rejected" ? "rejected" : e.confidence}`}>{e.method === "rejected" ? "not located" : e.confidence}</span>{" "}
            <span className="sub">{e.note || (e.lat == null ? "not found in public map data" : "")}</span></div>
        ))}
      </div>
    </div>
  );
}

const INPUTS = [
  ["mobPct", "Mobilization % of cost", .5], ["mobShare", "% of mobilization shared", 5],
  ["yard", "Laydown yard $", 10000], ["landPerAcre", "Easement $/acre", 1000],
  ["rowShare", "ROW width saved (0-1)", .05], ["permitting", "Joint permitting $", 10000],
  ["crossing", "Coordinated crossing $", 10000], ["subDefault", "Substation work $ (GA est.)", 500000],
  ["perMile115", "115 kV $/mile (GA est.)", 100000], ["perMile230", "230 kV $/mile (GA est.)", 100000],
];

export default function Detail({ o, tw, A, setA, onBack, onReplay }) {
  const root = useRef(null);

  // Entrance choreography each time a different pair is opened.
  useGSAP(() => {
    if (!o || reducedMotion()) return;
    gsap.timeline({ defaults: { duration: 0.4 } })
      .from(".d-head, .kpi", { opacity: 0, y: 10, stagger: 0.06, clearProps: "opacity,transform" })
      .from(".scorebar span", { scaleX: 0, transformOrigin: "0% 50%", duration: 0.6, stagger: 0.12, ease: "power3.out", clearProps: "transform" }, "-=0.15")
      .from(".mg-bar", { scaleX: 0, transformOrigin: "0% 50%", duration: 0.7, stagger: 0.08, ease: "power3.out", clearProps: "transform" }, "<")
      .from(".mg-ovl", { opacity: 0, duration: 0.5, clearProps: "opacity" }, "-=0.2");
  }, { scope: root, dependencies: [o?.id] });

  if (!o) return <div id="detail" ref={root}><p className="empty">Select an opportunity.</p></div>;
  const a = P[o.a], b = P[o.b], t = TIER[o.tier], E = estimate(o, A);
  const tierIdx = TIER_ORDER.indexOf(o.tier);

  return (
    <div id="detail" ref={root}>
      <button className="back" onClick={onBack}>← All opportunities</button>
      <div className="d-head">
        <div><div className="sub" style={{ color: "var(--ink-3)", fontSize: 12 }}>Opportunity #{o.r} · {o.id}</div>
          <h2>{a.name.split(":")[0]} ⟷ {shortName(b.name)}</h2></div>
        <div className="big"><CountUp value={o.s} />{" "}<small>score / 100</small></div>
      </div>
      <div className="kpis">
        <div className="kpi"><b style={{ color: css(t.color) }}>{o.distance_km < 0.1 ? "0 km" : o.distance_km.toFixed(2) + " km"}</b><span>closest approach · {t.label.toLowerCase()}</span></div>
        <div className="kpi"><b><CountUp value={o.isd_gap_days} /> d</b><span>between in-service dates</span></div>
        <div className="kpi"><b>{E.aligned ? moneyRange(E.lo, E.hi) : moneyRange(E.plo, E.phi)}</b><span>{E.aligned ? "est. savings as scheduled" : "potential savings if aligned"}</span></div>
      </div>
      <button className="ghost" style={{ justifySelf: "start" }} onClick={onReplay}>▶ Replay reveal for this pair</button>
      <Why o={o} tw={tw} />
      <section className="block"><h3>What the two utilities could share</h3>
        <ul className="share">{TIER_ORDER.map(k => <li key={k} className={TIER_ORDER.indexOf(k) >= tierIdx ? "" : "off"}>{TIER[k].why}</li>)}</ul>
      </section>
      <section className="block tl"><h3>Timeline</h3>
        <p className="note" style={{ marginBottom: 8, color: "var(--ink-2)" }}>
          {o.construction_overlap_days > 0
            ? <>Field construction overlaps for about <b>{Math.round(o.construction_overlap_days / 30)} months</b>. Crews could move between the two jobs without re-mobilizing.</>
            : <>The in-service dates are <b>{(o.isd_gap_days / 365).toFixed(1)} years</b> apart. Resource sharing needs one project to shift, so savings are shown as <i>potential</i>.</>}
        </p>
        <MiniGantt o={o} />
      </section>
      <section className="block cost"><h3>Rough cost / impact estimate</h3>
        <table><tbody>
          {E.items.map(i => (
            <tr key={i.k} className={i.na ? "na" : ""}>
              <td>{i.k}<small>{i.d}{!i.na && !i.on ? " · only if schedules are aligned" : ""}</small></td>
              <td>{i.na ? "—" : i.on ? money(i.v) : `(${money(i.v)})`}</td>
            </tr>))}
          <tr className="total"><td>Estimated savings as scheduled<small>central estimate {money(E.total)} · range {RANGE[0]}× to {RANGE[1]}×</small></td><td>{moneyRange(E.lo, E.hi)}</td></tr>
          {E.potential > E.total && <tr><td>Potential if build windows are aligned<small>central estimate {money(E.potential)}</small></td><td>{moneyRange(E.plo, E.phi)}</td></tr>}
        </tbody></table>
        <p className="note">These are illustrative planning-level figures, not verified savings. Actual savings depend on engineering feasibility, procurement, land rights, outage schedules and approval by both utilities.</p>
        <p className="note">Project costs: DESC {money(E.ca.v)}{E.ca.est ? ` (est. ${E.ca.basis})` : " (filed budget)"} · Georgia {money(E.cb.v)}{E.cb.est ? ` (est. ${E.cb.basis}; Georgia Power costs are redacted in the public IRP)` : ""}.
          Planning-level assumptions below. Edit them and the estimate updates.</p>
        <div className="assump">
          {INPUTS.map(([k, label, step]) => (
            <label key={k}>{label}<input type="number" step={step} value={A[k]}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setA({ ...A, [k]: v }); }} /></label>
          ))}
        </div>
        <button className="ghost" style={{ justifySelf: "start" }} onClick={() => setA({ ...DEFAULT_ASSUMPTIONS })}>Reset assumptions</button>
      </section>
      <section className="block"><h3>The two projects</h3><div style={{ display: "grid", gap: 8 }}><ProjectCard p={a} /><ProjectCard p={b} /></div></section>
    </div>
  );
}
