import { useEffect, useRef } from "react";
import { D } from "../lib/model";

export default function MethodDialog({ open, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const n = D.projects.length, located = D.projects.filter(p => p.geometry).length;
  const conf = c => D.projects.filter(p => p.location_confidence === c).length;
  const count = f => D.projects.filter(f).length;
  return (
    <dialog id="method" ref={ref} onClose={onClose} onClick={e => e.target === ref.current && onClose()}>
      <article>
        <header><h2>How GridLock works</h2><button className="ghost icon" onClick={onClose} aria-label="Close">✕</button></header>
        <div id="method-body">
          <p>GridLock reads each utility's public plan, finds every project's real-world location, and measures how close each Dominion Energy SC project comes to each Georgia project.</p>
          <h3>1 · Data (public filings only)</h3>
          <table><tbody>
            <tr><th>Utility</th><th>Source</th><th>Projects</th></tr>
            <tr><td>Dominion Energy SC</td><td>SCRTP "Planned Transmission Projects $2M and above", 2024–2028</td><td>{count(p => p.utility_code === "DESC")}</td></tr>
            <tr><td>Georgia Power (+ SAV)</td><td>2025 IRP Vol. 3 public disclosure, GA ITS Ten-Year Plan, Table 2 plus per-project detail pages</td><td>{count(p => p.utility_code === "GPC")}</td></tr>
            <tr><td>GTC · MEAG · Dalton</td><td>Same GA ITS table (optional layer)</td><td>{count(p => !["DESC", "GPC"].includes(p.utility_code))}</td></tr>
          </tbody></table>
          <p>Costs and supporting statements redacted in the public filing stay redacted. No CEII data is used.</p>
          <h3>2 · Locating projects</h3>
          <p>Each project name is split into its named substations (e.g. <code>Okatie-Bluffton 115kV</code> → Okatie, Bluffton). Each substation is matched, in priority order, to:
            (1) hand-verified coordinates with a cited source, (2) OpenStreetMap substations and plants (Overpass API), preferring the utility's own tagged assets inside the correct state polygon, (3) Nominatim geocoding.
            A location is rejected if it falls outside the project's state, lies more than 100 km from its Georgia planning zone, or makes a line implausibly long for its stated mileage.
            Lines are drawn as straight segments between substations, the same approximation the challenge brief uses.</p>
          <p>{located} of {n} projects located · {conf("high")} high, {conf("medium")} medium, {conf("low")} low confidence. Low-confidence projects are drawn dashed and down-weighted in the score.</p>
          <h3>3 · Overlap</h3>
          <p><b>Geographic (primary):</b> the shortest distance between the two geometries' closest points, not their centres. Pairs 40 km or more apart are ignored. Tiers: touching/crossing (&lt; 0.1 km) · &lt; 1.6 km · &lt; 8 km · &lt; 40 km.</p>
          <p><b>Timeline (secondary):</b> each project gets a planning window (Georgia start date, or DESC's first budget year with spend) and a construction window (the final {D.params.construction_months} months before in-service). We record the days between in-service dates and the days of construction overlap.</p>
          <p><b>Score:</b> <code>geo × ((1 − w) + w × timing) × confidence</code>. <code>geo</code> is 100 → 0 across the tiers by distance. <code>timing</code> is 1 if construction windows overlap, otherwise it fades to 0 over a 4-year gap. <code>w</code> is the timeline-weight slider (default 40%). <code>confidence</code> is 1 / 0.9 / 0.75 for high / medium / low location confidence.</p>
          <h3>4 · Cost / impact</h3>
          <p>For each pair the estimate adds up whichever mechanisms its tier allows: shared mobilization of crews and equipment, one laydown yard instead of two, a shared right-of-way corridor and joint permitting, and a single coordinated outage or crossing. Savings count "as scheduled" only when construction windows overlap. Otherwise they are shown as potential. Figures are shown as a 0.6×–1.5× range, and every assumption is editable in the detail view.</p>
          <h3>Known limitations</h3>
          <p>Straight lines are not real routes. "Hooks" (DESC) is not in public map data, so it is estimated near Clarks Hill, SC from the PDF's 2.3-mile description. New substations (Dawson, Scout, Big Ogeechee) are placed from their descriptions. Georgia Power cost figures are redacted, so they are estimated per mile.</p>
          <p className="note">Data generated {D.generated}. Base map © Esri, © OpenStreetMap contributors.</p>
        </div>
      </article>
    </dialog>
  );
}
