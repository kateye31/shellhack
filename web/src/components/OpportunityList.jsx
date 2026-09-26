import { useRef } from "react";
import { P, TIER, CONF_RANK, css, utilColor } from "../lib/model";
import { gsap, useGSAP, reducedMotion } from "../lib/anim";

export default function OpportunityList({ list, selectedId, onSelect, onHover }) {
  const root = useRef(null);
  const key = list.map(o => o.id).join(",");

  // Stagger the cards in whenever the filtered set changes (first screenful only).
  useGSAP(() => {
    if (reducedMotion()) return;
    const cards = gsap.utils.toArray(".opp", root.current).slice(0, 14);
    gsap.from(cards, { opacity: 0, y: 10, duration: 0.35, stagger: 0.03, clearProps: "opacity,transform" });
  }, { scope: root, dependencies: [key] });

  if (!list.length) return <ol className="opps" ref={root}><li className="empty">No overlaps pass these filters.</li></ol>;
  return (
    <ol className="opps" ref={root}>
      {list.map(o => {
        const a = P[o.a], b = P[o.b], t = TIER[o.tier];
        const weak = Math.min(CONF_RANK[o.a_conf], CONF_RANK[o.b_conf]) < 2;
        return (
          <li key={o.id} className={`opp${selectedId === o.id ? " sel" : ""}`}
              onClick={() => onSelect(o.id, true)} onMouseEnter={() => onHover(o, true)} onMouseLeave={() => onHover(o, false)}>
            <div className="rank">{o.r}</div>
            <div className="pj"><i style={{ background: css("--desc") }} /><span title={a.name}>{a.name}</span></div>
            <div className="score"><b>{o.s.toFixed(0)}</b><small>score</small></div>
            <div className="pj"><i style={{ background: utilColor(b.utility_code) }} /><span title={b.name}>{b.name}</span></div>
            <div className="meta">
              <span className="chip tier" style={{ background: css(t.color) }}>{t.short}</span>
              <span className="chip">{o.distance_km < 0.1 ? "shared point" : o.distance_km.toFixed(1) + " km"}</span>
              {o.construction_overlap_days > 0
                ? <span className="chip good">builds overlap {Math.round(o.construction_overlap_days / 30)} mo</span>
                : <span className={`chip${o.isd_gap_days > 1095 ? " warn" : ""}`}>{(o.isd_gap_days / 365).toFixed(1)} yr apart</span>}
              {weak && <span className="chip warn">low-confidence location</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
