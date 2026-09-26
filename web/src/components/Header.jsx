import { D, TIER_ORDER } from "../lib/model";
import { CountUp } from "../lib/anim";

const DESC_N = D.projects.filter(p => p.utility_code === "DESC").length;
const GPC_N = D.projects.filter(p => p.utility_code === "GPC").length;

export default function Header({ list, onReveal, onMethod, onExport, onTheme }) {
  const tiers = TIER_ORDER.map(t => list.filter(o => o.tier === t).length);
  const stats = [
    [<CountUp value={DESC_N} />, "DESC projects"],
    [<CountUp value={GPC_N} />, "Georgia Power"],
    [<CountUp value={list.length} />, "overlapping pairs"],
    [`${tiers[0]} · ${tiers[1]} · ${tiers[2]}`, "touch · ROW · site"],
    [<CountUp value={list.filter(o => o.construction_overlap_days > 0).length} />, "same build window"],
  ];
  return (
    <header className="top">
      <div className="brand">
        <svg viewBox="0 0 24 24" className="logo" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
        <div>
          <h1>GridLock</h1>
          <p>Where Dominion Energy SC and Georgia Power plan work near each other, and when</p>
        </div>
      </div>
      <div className="stats">
        {stats.map(([v, l]) => <div className="stat" key={l}><b>{v}</b><span>{l}</span></div>)}
      </div>
      <div className="top-actions">
        <button className="ghost reveal-btn" onClick={onReveal} title="Walk through the top opportunity step by step">▶ Reveal top opportunity</button>
        <button className="ghost" onClick={onMethod}>Methodology</button>
        <button className="ghost" onClick={onExport}>Export CSV</button>
        <button className="ghost icon" onClick={onTheme} title="Toggle theme" aria-label="Toggle theme">◐</button>
      </div>
    </header>
  );
}
