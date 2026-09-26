import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { D, P, TIER, css, utilColor, utilName, fmtDate, money } from "../lib/model";
import { gsap, reducedMotion } from "../lib/anim";

const VIEWS = { augusta: [[33.15, -82.45], [33.85, -81.55]], savannah: [[31.95, -81.5], [32.5, -80.75]] };
const HOME = [[31.9, -82.6], [34.4, -79.6]];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function popupHtml(p) {
  const w = p.window;
  return `<h4>${esc(p.name)}</h4>
    <div class="sub">${esc(utilName(p))} · ${esc(p.sponsor || "DESC")} ${esc(p.source_id)}${p.zone ? " · zone " + p.zone : ""}</div>
    <div style="margin-top:6px">In service <b>${fmtDate(p.in_service)}</b>${w ? ` · build window from ${fmtDate(w.start)}` : ""}</div>
    ${p.cost_usd ? `<div>Budget <b>${money(p.cost_usd)}</b></div>` : ""}
    <div>Location <span class="conf ${p.location_confidence}">${p.location_confidence}</span></div>
    <div style="margin-top:6px"><a href="#" data-proj="${p.id}">Show overlaps for this project →</a></div>`;
}

/** Leaflet map, driven imperatively. The parent (and the GSAP reveal) steer the camera through the ref. */
const MapView = forwardRef(function MapView({ list, selectedId, showBuffer, partners, theme, onSelect, onProject }, ref) {
  const host = useRef(null);
  const m = useRef({});           // map + layer groups
  const shapes = useRef({});      // project id -> leaflet layers
  const cb = useRef({});          // latest callbacks, so leaflet handlers never go stale
  cb.current = { onSelect, onProject };

  /* ---------- init once */
  useEffect(() => {
    const map = L.map(host.current, { zoomControl: true }).setView([33.0, -81.6], 7);
    map.fitBounds(HOME);
    m.current = {
      map,
      states: L.layerGroup().addTo(map), proj: L.layerGroup().addTo(map),
      ovl: L.layerGroup().addTo(map), buffer: L.layerGroup().addTo(map),
    };
    map.on("popupopen", e => {
      const a = e.popup.getElement().querySelector("[data-proj]");
      if (a) a.onclick = ev => { ev.preventDefault(); map.closePopup(); cb.current.onProject(a.dataset.proj); };
    });
    return () => map.remove();
  }, []);

  /* ---------- base map + state outlines follow the theme */
  useEffect(() => {
    const { map, states } = m.current;
    const dark = getComputedStyle(document.documentElement).colorScheme === "dark";
    const base = `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${dark ? "Dark" : "Light"}_Gray_`;
    const tiles = L.layerGroup([
      L.tileLayer(`${base}Base/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors" }),
      L.tileLayer(`${base}Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 }),
    ]).addTo(map);
    tiles.eachLayer(l => l.bringToBack());
    states.clearLayers();
    for (const rings of Object.values(D.states))
      for (const r of rings) L.polyline(r.map(([x, y]) => [y, x]), { color: css("--ink-3"), weight: 1, opacity: .45, dashArray: "2 4", interactive: false }).addTo(states);
    return () => map.removeLayer(tiles);
  }, [theme]);

  /* ---------- projects */
  useEffect(() => {
    const { proj } = m.current;
    proj.clearLayers();
    shapes.current = {};
    const active = new Set(list.flatMap(o => [o.a, o.b]));
    const show = D.projects.filter(p => p.geometry && (partners || ["DESC", "GPC"].includes(p.utility_code)));
    show.sort((a, b) => active.has(a.id) - active.has(b.id));   // highlighted projects on top
    for (const p of show) {
      const on = active.has(p.id), color = utilColor(p.utility_code), g = p.geometry, layers = [];
      const dash = p.location_confidence === "low" ? "6 5" : null;
      if (g.type === "LineString") {
        layers.push(L.polyline(g.coordinates.map(([x, y]) => [y, x]), { color, weight: on ? 4 : 2, opacity: on ? .95 : .35, dashArray: dash }));
        g.coordinates.forEach(([x, y]) => layers.push(L.circleMarker([y, x], { radius: on ? 4 : 2.5, color, weight: 1, fillColor: color, fillOpacity: on ? 1 : .4, opacity: on ? 1 : .4 })));
      } else {
        const [x, y] = g.coordinates;
        layers.push(L.circleMarker([y, x], { radius: on ? 7 : 4, color, weight: 2, fillColor: color, fillOpacity: on ? .55 : .2, opacity: on ? 1 : .45, dashArray: dash }));
      }
      layers.forEach(l => {
        l._baseWeight = l.options.weight;
        l.bindPopup(popupHtml(p)).bindTooltip(esc(p.name), { sticky: true, direction: "top", opacity: .95 }).addTo(proj);
      });
      shapes.current[p.id] = layers;
    }
  }, [list, partners, theme]);

  /* ---------- overlap connectors (closest points) */
  useEffect(() => {
    const { ovl } = m.current;
    ovl.clearLayers();
    let selLine = null;
    for (const o of [...list].reverse()) {
      const color = css(TIER[o.tier].color);
      const a = [o.closest_a[1], o.closest_a[0]], b = [o.closest_b[1], o.closest_b[0]];
      const sel = selectedId === o.id, faint = o.tier === "crew" && !sel;
      const line = L.polyline([a, b], { color, weight: sel ? 5 : faint ? 1.5 : 2.5, opacity: sel ? 1 : faint ? .45 : .85, dashArray: faint ? "2 5" : "5 5" })
        .bindTooltip(`#${o.r} · ${o.distance_km.toFixed(1)} km · ${TIER[o.tier].short}`, { sticky: true })
        .on("click", () => cb.current.onSelect(o.id, true))
        .addTo(ovl);
      if (sel) selLine = line;
      if (o.distance_km < 0.2 || sel)
        L.circleMarker(a, { radius: sel ? 9 : 6, color, weight: 2, fillOpacity: 0 }).on("click", () => cb.current.onSelect(o.id, true)).addTo(ovl);
    }
    // GSAP: draw the selected connector from one project to the other.
    const el = selLine?.getElement();
    if (el && !reducedMotion()) {
      const len = el.getTotalLength?.() || 0;
      if (len > 4) gsap.fromTo(el, { attr: { "stroke-dasharray": `${len} ${len}`, "stroke-dashoffset": len } },
        { attr: { "stroke-dashoffset": 0 }, duration: 0.9, ease: "power2.inOut", onComplete: () => el.setAttribute("stroke-dasharray", "5 5") });
    }
  }, [list, selectedId, theme]);

  /* ---------- 1.6 / 8 / 40 km rings around the selected pair */
  useEffect(() => {
    const { buffer } = m.current;
    buffer.clearLayers();
    const o = showBuffer && D.overlaps.find(x => x.id === selectedId);
    if (!o) return;
    const mid = [(o.closest_a[1] + o.closest_b[1]) / 2, (o.closest_a[0] + o.closest_b[0]) / 2];
    const rings = [
      L.circle(mid, { radius: 40000, color: css("--accent"), weight: 1, opacity: .5, fillOpacity: .04, dashArray: "3 6", interactive: false }),
      ...["site", "row"].map(t => L.circle(mid, { radius: TIER[t].max * 1000, color: css(TIER[t].color), weight: 1, opacity: .6, fillOpacity: .05, interactive: false })),
    ];
    rings.forEach(r => r.addTo(buffer));
    const els = rings.map(r => r.getElement()).filter(Boolean);
    if (els.length && !reducedMotion())
      gsap.from(els, { opacity: 0, scale: 0.15, transformOrigin: "50% 50%", duration: 0.9, stagger: 0.12, ease: "expo.out", clearProps: "transform,opacity" });
  }, [selectedId, showBuffer, theme]);

  /* ---------- camera + highlight API (used by App and the GSAP reveal) */
  useImperativeHandle(ref, () => ({
    pairBounds(o) {
      const layers = [...(shapes.current[o.a] || []), ...(shapes.current[o.b] || [])];
      return layers.length ? L.featureGroup(layers).getBounds() : null;
    },
    fitPair(o, { pad = 0.35, fly = false, duration = 1.6 } = {}) {
      const b = this.pairBounds(o);
      if (!b) return;
      fly ? m.current.map.flyToBounds(b.pad(pad), { duration, maxZoom: 12 }) : m.current.map.fitBounds(b.pad(pad), { maxZoom: 12 });
    },
    flyHome(duration = 1.2) { m.current.map.flyToBounds(HOME, { duration }); },
    fitView(name) {
      if (name === "all") m.current.map.fitBounds(L.featureGroup(Object.values(shapes.current).flat()).getBounds(), { padding: [20, 20] });
      else if (VIEWS[name]) m.current.map.fitBounds(VIEWS[name]);
    },
    highlight(ids) {
      for (const [id, layers] of Object.entries(shapes.current))
        for (const l of layers) {
          if (!l.setStyle) continue;
          const on = ids?.has(id);
          l.setStyle({ weight: on ? (l instanceof L.CircleMarker ? 2 : 6) : l._baseWeight });
          if (on && !(l instanceof L.CircleMarker)) l.bringToFront();
        }
    },
  }), []);

  return <div id="map" ref={host} />;
});

export default MapView;
