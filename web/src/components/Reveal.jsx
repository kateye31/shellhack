import { useCallback, useEffect, useRef, useState } from "react";
import { D, P, TIER, estimate, fmtDate, moneyRange, css, utilColor, shortName } from "../lib/model";
import { gsap, useGSAP, reducedMotion } from "../lib/anim";

const STEP_AT = [0, 3.8, 7.8, 11.8, 15.8];   // seconds into the reveal
const END = 24;

/**
 * The "Coordination Opportunity Reveal": a GSAP timeline whose labelled call() steps drive
 * the map camera, the app state and the side panel scroll. Space pauses, → skips, Esc stops.
 */
export function useReveal({ mapRef, select, setTab, setSelected, getPanel, A }) {
  const tl = useRef(null);
  const [cap, setCap] = useState(null);       // { step, title, body }
  const [paused, setPaused] = useState(false);
  const bar = useRef(null);

  const stop = useCallback(() => {
    tl.current?.kill(); tl.current = null;
    setCap(null); setPaused(false);
    mapRef.current?.highlight(null);
  }, [mapRef]);

  const play = useCallback(id => {
    stop();
    const o = D.overlaps.find(x => x.id === id);
    if (!o) return;
    const a = P[o.a], b = P[o.b], t = TIER[o.tier], E = estimate(o, A);
    const nDesc = D.projects.filter(p => p.utility_code === "DESC").length, nGpc = D.projects.filter(p => p.utility_code === "GPC").length;
    const scroll = sel => { const panel = getPanel(); if (panel) gsap.to(panel, { scrollTo: { y: sel, offsetY: 8 }, duration: reducedMotion() ? 0 : 1.1, ease: "power2.inOut" }); };
    const sq = color => <span style={{ color }}>■</span>;

    const steps = [
      () => {
        setSelected(null); setTab("list");
        mapRef.current.flyHome(1.2);
        setCap({ step: 1, title: "The problem", body: <>Dominion Energy SC ({nDesc} projects) and Georgia Power ({nGpc} projects) plan their work separately, right across the Savannah River from each other.</> });
      },
      () => {
        mapRef.current.fitPair(o, { fly: true, pad: 0.5, duration: 1.6 });
        mapRef.current.highlight(new Set([o.a, o.b]));
        setCap({ step: 2, title: "Two projects", body: <>{sq(css("--desc"))} {shortName(a.name).split(":")[0]} (DESC, in service {fmtDate(a.in_service)}) and {sq(utilColor(b.utility_code))} {shortName(b.name)} (Georgia Power, in service {fmtDate(b.in_service)}).</> });
      },
      () => {
        select(o.id, false);
        setCap({ step: 3, title: "Closest points", body: <>The two projects come within <b>{o.distance_km < 0.1 ? "0 km (they touch)" : `${o.distance_km.toFixed(2)} km`}</b>, measured between their closest points, not their centres. {t.why}.</> });
      },
      () => {
        scroll("#detail .tl");
        setCap({ step: 4, title: "Timing", body: o.construction_overlap_days > 0
          ? <>Their construction windows overlap for about <b>{Math.round(o.construction_overlap_days / 30)} months</b>, so crews and equipment could move between the two jobs.</>
          : <>They are scheduled <b>{(o.isd_gap_days / 365).toFixed(1)} years</b> apart. Coordinating would mean shifting one schedule.</> });
      },
      () => {
        scroll("#detail .cost");
        setCap({ step: 5, title: "The value", body: <>Illustrative savings of <b>{E.aligned ? moneyRange(E.lo, E.hi) : moneyRange(E.plo, E.phi)}</b>{E.aligned ? " as scheduled" : " if the schedules were aligned"}, from {E.items.filter(i => !i.na).map(i => i.k.toLowerCase()).join(", ")}. Every assumption is editable.</> });
      },
    ];

    const line = gsap.timeline({ onComplete: stop });
    steps.forEach((fn, i) => { line.addLabel(`s${i}`, STEP_AT[i]); line.call(fn, [], STEP_AT[i]); });
    line.fromTo(bar.current, { scaleX: 0 }, { scaleX: 1, duration: END, ease: "none", transformOrigin: "0% 50%" }, 0);
    tl.current = line;
  }, [A, getPanel, mapRef, select, setSelected, setTab, stop]);

  const toggle = useCallback(() => {
    const line = tl.current; if (!line) return;
    line.paused(!line.paused()); setPaused(line.paused());
  }, []);
  const next = useCallback(() => {
    const line = tl.current; if (!line) return;
    const nextAt = STEP_AT.find(s => s > line.time() + 0.05);
    nextAt == null ? stop() : line.seek(nextAt + 0.001, false);   // false = fire the step's call()
  }, [stop]);

  useEffect(() => {
    const onKey = e => {
      if (!tl.current) return;
      if (e.key === "Escape") stop();
      else if (e.key === " ") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, stop, toggle]);

  useEffect(() => stop, [stop]);   // kill on unmount

  return { play, stop, toggle, next, cap, paused, bar };
}

export function Caption({ cap, paused, bar, onToggle, onNext, onStop }) {
  const text = useRef(null);
  useGSAP(() => {
    if (cap && !reducedMotion()) gsap.fromTo(text.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45 });
  }, { dependencies: [cap?.step] });
  return (
    <div className="caption" hidden={!cap}>
      <div ref={text}>
        {cap && <><b>{cap.step} / 5 · {cap.title}</b>{cap.body}</>}
      </div>
      <div className="cap-ctl">
        <button onClick={onToggle}>{paused ? "▶ Resume" : "❚❚ Pause"}</button>
        <button onClick={onNext}>Next ▸</button>
        <span className="cap-keys">Space · → · Esc</span>
      </div>
      <div className="cap-progress"><span ref={bar} /></div>
      <button className="cap-x" aria-label="Stop" onClick={onStop}>✕</button>
    </div>
  );
}
