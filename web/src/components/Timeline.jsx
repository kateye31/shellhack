import { useRef } from "react";
import { D, P, day, utilColor, shortName } from "../lib/model";
import { gsap, useGSAP, reducedMotion } from "../lib/anim";

export default function Timeline({ list, onHoverProject, onPickProject }) {
  const root = useRef(null);
  const ids = [...new Set(list.flatMap(o => [o.a, o.b]))].map(id => P[id]).filter(p => p.window);

  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.from(".g-row .mg-bar", { scaleX: 0, transformOrigin: "0% 50%", duration: 0.6, stagger: 0.012, ease: "power2.out", clearProps: "transform" });
    gsap.from(".g-today", { scaleY: 0, duration: 0.6, delay: 0.3, clearProps: "transform" });
  }, { scope: root, dependencies: [ids.length] });

  if (!ids.length) return <div id="gantt" ref={root}><p className="empty">No overlaps pass these filters.</p></div>;

  const area = p => { const c = p.geometry.type === "Point" ? p.geometry.coordinates : p.geometry.coordinates[0]; return c[1] > 32.8 ? "Augusta / Aiken area" : "Savannah / Lowcountry area"; };
  const groups = {};
  ids.forEach(p => (groups[area(p)] ||= []).push(p));
  const all = ids.flatMap(p => [day(p.window.start), day(p.window.in_service)]);
  const lo = Math.min(...all) - 60, hi = Math.max(...all) + 60;
  const x = v => (v - lo) / (hi - lo) * 100;
  const y0 = new Date(lo * 864e5).getFullYear() + 1, y1 = new Date(hi * 864e5).getFullYear();
  const years = []; for (let y = y0; y <= y1; y++) years.push(y);
  const today = x(Date.now() / 864e5);
  const partnersOf = pid => new Set(list.filter(o => o.a === pid || o.b === pid).flatMap(o => [o.a, o.b]));

  return (
    <div id="gantt" ref={root}>
      <div className="g-head"><h3 style={{ fontSize: 13 }}>Build windows of every project in a flagged overlap</h3></div>
      <p className="note" style={{ marginBottom: 8 }}>Hover a row to see its partners on the map. Click it to open its top opportunity. Solid = final {D.params.construction_months} months of construction.</p>
      <div className="g-axis"><span /><div className="ticks">{years.map(y => <span key={y} style={{ left: `${x(day(`${y}-01-01`)).toFixed(2)}%` }}>{String(y).slice(2)}'</span>)}</div></div>
      <div className="g-grid">
        {Object.entries(groups).sort().map(([g, ps]) => (
          <div key={g}>
            <div className="g-group">{g}</div>
            {ps.sort((a, b) => a.utility_code.localeCompare(b.utility_code) || a.window.in_service.localeCompare(b.window.in_service)).map(p => {
              const col = utilColor(p.utility_code);
              const s = x(day(p.window.start)), c = x(day(p.window.construction_start)), e = x(day(p.window.in_service));
              return (
                <div className="g-row" key={p.id}
                     onMouseEnter={ev => { const set = partnersOf(p.id); onHoverProject(set); ev.currentTarget.closest(".g-grid").querySelectorAll(".g-row").forEach(r => r.classList.toggle("hl", set.has(r.dataset.pid))); }}
                     onMouseLeave={ev => { onHoverProject(null); ev.currentTarget.closest(".g-grid").querySelectorAll(".g-row").forEach(r => r.classList.remove("hl")); }}
                     onClick={() => onPickProject(p.id)} data-pid={p.id}>
                  <span className="nm" title={p.name}><i style={{ background: col }} />{shortName(p.name)}</span>
                  <div className="mg-track">
                    <div className="mg-bar" style={{ left: `${s}%`, width: `${e - s}%`, background: col }} />
                    <div className="mg-bar c" style={{ left: `${c}%`, width: `${e - c}%`, background: col }} />
                    {today > 0 && today < 100 && <div className="g-today" style={{ left: `${today}%` }} />}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
