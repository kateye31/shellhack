import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { D, DEFAULT_FILTERS, DEFAULT_ASSUMPTIONS, filterOverlaps, score, toCsv, loadSaved, save } from "./lib/model";
import { gsap, useGSAP, reducedMotion } from "./lib/anim";
import Header from "./components/Header";
import MapView from "./components/MapView";
import Legend from "./components/Legend";
import Filters from "./components/Filters";
import OpportunityList from "./components/OpportunityList";
import Detail from "./components/Detail";
import Impact from "./components/Impact";
import Timeline from "./components/Timeline";
import MethodDialog from "./components/MethodDialog";
import { useReveal, Caption } from "./components/Reveal";

const saved = loadSaved();
const hash = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
const TABS = [["list", "Opportunities"], ["impact", "Impact"], ["timeline", "Timeline"], ["detail", "Detail"]];

export default function App() {
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, ...saved.filters });
  const [A, setA] = useState({ ...DEFAULT_ASSUMPTIONS, ...saved.assumptions });
  const [selectedId, setSelected] = useState(null);
  const [tab, setTab] = useState("list");
  const [theme, setTheme] = useState(saved.theme || null);
  const [methodOpen, setMethodOpen] = useState(false);
  const mapRef = useRef(null);
  const panelRef = useRef(null);

  const list = useMemo(() => filterOverlaps(filters), [filters]);
  const setF = useCallback(patch => setFilters(f => ({ ...f, ...patch })), []);

  // The selected pair may be filtered out of the list; still show it (unranked).
  const selected = useMemo(() => {
    if (!selectedId) return null;
    const hit = list.find(o => o.id === selectedId);
    if (hit) return hit;
    const raw = D.overlaps.find(o => o.id === selectedId);
    return raw && { ...raw, s: score(raw, filters.tw), r: "–" };
  }, [list, selectedId, filters.tw]);

  /* ---------- persistence + theme */
  useEffect(() => save({ filters }), [filters]);
  useEffect(() => save({ assumptions: A }), [A]);
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    save({ theme });
  }, [theme]);
  const toggleTheme = () => setTheme(getComputedStyle(document.documentElement).colorScheme === "dark" ? "light" : "dark");

  /* ---------- selection */
  const select = useCallback((id, zoom) => {
    setSelected(id);
    setTab("detail");
    const o = D.overlaps.find(x => x.id === id);
    if (zoom && o) mapRef.current?.fitPair(o, { fly: !reducedMotion(), duration: 0.9 });
  }, []);
  const focusProject = useCallback(pid => {
    const hit = list.find(o => o.a === pid || o.b === pid);
    if (hit) select(hit.id, true);
    else alert("No overlaps pass the current filters for this project.");
  }, [list, select]);

  /* ---------- reveal */
  const getPanel = useCallback(() => panelRef.current, []);
  const reveal = useReveal({ mapRef, select, setTab, setSelected, getPanel, A });

  /* ---------- first load: deep links (#sel=, #tab=, #zoom=, #reveal=) or the top opportunity */
  useEffect(() => {
    const first = hash.sel || (!saved.filters && list[0]?.id);
    if (first && D.overlaps.some(o => o.id === first)) select(first, !!hash.sel);
    if (hash.tab) setTab(hash.tab);
    if (hash.zoom) mapRef.current?.fitView(hash.zoom);
    if (hash.reveal) setTimeout(() => reveal.play(hash.reveal === "1" ? list[0]?.id : hash.reveal), 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- tab panel transition */
  useGSAP(() => {
    panelRef.current.scrollTop = 0;
    if (!reducedMotion()) gsap.from(panelRef.current, { opacity: 0, y: 8, duration: 0.3, clearProps: "opacity,transform" });
  }, { dependencies: [tab] });

  const exportCsv = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv(list, A)], { type: "text/csv" }));
    a.download = "gridlock_opportunities.csv";
    a.click();
  };

  return (
    <>
      <Header list={list} onReveal={() => reveal.play(list[0]?.id)} onMethod={() => setMethodOpen(true)} onExport={exportCsv} onTheme={toggleTheme} />
      <main className="layout">
        <section className="map-wrap">
          <MapView ref={mapRef} list={list} selectedId={selectedId} showBuffer={tab === "detail"} partners={filters.partners}
                   theme={theme} onSelect={select} onProject={focusProject} />
          <Legend partners={filters.partners} />
          <Caption cap={reveal.cap} paused={reveal.paused} bar={reveal.bar} onToggle={reveal.toggle} onNext={reveal.next} onStop={reveal.stop} />
          <div className="map-tools">
            {[["all", "All projects"], ["augusta", "Augusta"], ["savannah", "Savannah"]].map(([k, l]) =>
              <button key={k} onClick={() => mapRef.current.fitView(k)}>{l}</button>)}
          </div>
        </section>

        <aside className="side">
          <nav className="tabs" role="tablist">
            {TABS.map(([k, l]) => (
              <button key={k} role="tab" className={tab === k ? "active" : ""} disabled={k === "detail" && !selected}
                      onClick={() => setTab(k)}>
                {l}{k === "list" && <span className="count">{list.length}</span>}
              </button>
            ))}
          </nav>
          {tab !== "detail" && <Filters f={filters} set={setF} />}
          <div className="panel active" ref={panelRef}>
            {tab === "list" && <OpportunityList list={list} selectedId={selectedId} onSelect={select}
                                                onHover={(o, on) => mapRef.current?.highlight(on ? new Set([o.a, o.b]) : null)} />}
            {tab === "impact" && <Impact list={list} partners={filters.partners} A={A} onSelect={select} />}
            {tab === "timeline" && <Timeline list={list} onHoverProject={ids => mapRef.current?.highlight(ids)} onPickProject={focusProject} />}
            {tab === "detail" && <Detail o={selected} tw={filters.tw} A={A} setA={setA} onBack={() => setTab("list")} onReplay={() => reveal.play(selected.id)} />}
          </div>
        </aside>
      </main>
      <MethodDialog open={methodOpen} onClose={() => setMethodOpen(false)} />
    </>
  );
}
