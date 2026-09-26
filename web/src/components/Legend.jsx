import { TIER, TIER_ORDER, css } from "../lib/model";

export default function Legend({ partners }) {
  const sw = (color, dash) => <span className={`sw${dash ? " dash" : ""}`} style={{ borderColor: color }} />;
  return (
    <div className="legend">
      <h4>Planned projects</h4>
      <div className="li">{sw(css("--desc"))}Dominion Energy SC</div>
      <div className="li">{sw(css("--gpc"))}Georgia Power</div>
      {partners && <div className="li">{sw(css("--partner"))}GTC / MEAG / Dalton</div>}
      <div className="li">{sw(css("--ink-3"), true)}Low-confidence location</div>
      <h4>Overlap (closest points)</h4>
      {TIER_ORDER.map(k => <div className="li" key={k}>{sw(css(TIER[k].color), true)}{TIER[k].label}</div>)}
    </div>
  );
}
