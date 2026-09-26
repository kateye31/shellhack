export default function Filters({ f, set }) {
  const range = (key, min, max, step) => (
    <input type="range" min={min} max={max} step={step} value={f[key]} onChange={e => set({ [key]: +e.target.value })} />
  );
  return (
    <div className="filters">
      <label>Max distance <output>{f.km} km</output>{range("km", 1, 40, 1)}</label>
      <label>Max in-service gap <output>{f.gapYears >= 10 ? "any" : `${f.gapYears} yr`}</output>{range("gapYears", 0, 10, 0.5)}</label>
      <label>Timeline weight <output>{f.tw}%</output>{range("tw", 0, 100, 5)}</label>
      <div className="row">
        <label className="chk"><input type="checkbox" checked={f.overlapOnly} onChange={e => set({ overlapOnly: e.target.checked })} /> Build windows overlap</label>
        <label className="chk"><input type="checkbox" checked={f.partners} onChange={e => set({ partners: e.target.checked })} /> Include GTC / MEAG</label>
      </div>
      <div className="row">
        <label className="sel">Location confidence
          <select value={f.minConf} onChange={e => set({ minConf: +e.target.value })}>
            <option value="1">any</option><option value="2">medium+</option><option value="3">high only</option>
          </select></label>
        <label className="sel">Group
          <select value={f.group} onChange={e => set({ group: e.target.value })}>
            <option value="pair">every pair</option><option value="cluster">best per project</option>
          </select></label>
      </div>
    </div>
  );
}
