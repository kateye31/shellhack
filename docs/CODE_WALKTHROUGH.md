# GridLock code walkthrough (study guide)

## The big picture in one sentence
**Python turns two PDFs into one JSON file of projects and overlaps; React reads that JSON and draws it.** Nothing is computed on a server. The website is a static file, and all the heavy lifting happens once, offline, in the pipeline.

```
PDFs ──► parse_projects.py ──► geocode.py ──► overlaps.py ──► grid.json ──► React app ──► GitHub Pages
         (read the text)      (find where)    (compare)       (one file)    (show it)     (host it)
```
Run everything with: `python pipeline/run_all.py`, which runs the 3 scripts in order ([run_all.py](../pipeline/run_all.py)).

---

## STAGE 1 · Reading the PDFs: [pipeline/parse_projects.py](../pipeline/parse_projects.py)
**Library:** `pdfplumber` pulls the text off each PDF page.

### DESC (Dominion Energy SC): [`parse_desc()`](../pipeline/parse_projects.py#L47)
- The DESC PDF has **one project per page**, always in the same layout: name → "Project ID" → "Project Description" → … → "Planned In-Service Date" → a cost table.
- A **regex** grabs the text between those fixed labels ([`section()`](../pipeline/parse_projects.py#L42) returns the text between two headings).
- The cost row (`Previous 2024 2025 … Total`) becomes year-by-year spending. We later use it to guess when construction starts.
- **Output:** 44 projects.

### Georgia Power: [`parse_gpc()`](../pipeline/parse_projects.py#L81)
- A 668-page IRP. The projects are in **"Table 2"** (pages ~177–190). Each row looks like:
  `219 2026 20277 SAV: MCINTOSH - PURRYSBURG 6/1/2026 SAV REDACTED …`
- The regex [`ROW`](../pipeline/parse_projects.py#L78) captures: **zone, year, TEAMS number, name, need date, sponsor**. Long names wrap onto the next line, so extra all-caps lines are glued back onto the name.
- Each project also has a **detail page** ("Teams # 20277 · Need Date · Start Date · Description"). We parse those too and **join them on the TEAMS number**, which gives us the **start date** and a **description**.
- Sponsors GPC and SAV count as Georgia Power (SAV = the old Savannah Electric, now part of Georgia Power). GTC, MEAG and DU are other Georgia utilities, shown only as an optional layer.
- **Output:** 208 Georgia projects, 138 of them Georgia Power's.

**Gotcha we hit:** detail-page titles picked up the red "CRITICAL ENERGY INFRASTRUCTURE INFORMATION" banner text. Fixed by splitting on the banner's last word ("employees.") and keeping what follows.

---

## STAGE 2 · Finding where each project is: [pipeline/geocode.py](../pipeline/geocode.py)
**The problem:** the PDFs list *names*, not coordinates.

### Step 1: split the name into substations: [`endpoints()`](../pipeline/geocode.py#L60)
`"SAV: GOSHEN (SAV) - MCINTOSH 115KV LINE REBUILD"` → `["GOSHEN", "MCINTOSH"]`
- Strip the prefix (`SAV:`), parentheticals and voltages (`230/115KV`), then split on the dash.
- The [`NOISE`](../pipeline/geocode.py#L30) regex removes work words (REBUILD, RECONDUCTOR, LINE, ACSR, SPDC…).
- A project with 2 endpoints becomes a **line**; with 1 endpoint, a **point**.

### Step 2: look each substation up, in priority order: [`locate()`](../pipeline/geocode.py#L120)
1. **Hand-verified coordinates** in [data/manual_locations.json](../data/manual_locations.json), each with a written source (e.g. the sponsor's starter spreadsheet).
2. **OpenStreetMap:** one Overpass query downloaded every named substation and power plant in GA + SC (**~2,600**) into `data/cache/osm_substations.json`. [`build_index()`](../pipeline/geocode.py#L90) indexes them by normalised name. When several match, candidates are ranked: is it a substation? Is it operated by this utility? Is it inside the right state?
3. **Nominatim** (OpenStreetMap's search engine): [`nominatim()`](../pipeline/geocode.py#L170). First it searches "NAME substation, Georgia" (medium confidence), then "NAME, Georgia" as a town fallback (low confidence). Results are **cached**, so reruns work offline and respect Nominatim's 1-request-per-second limit.

### Step 3: reject bad matches (the "trust layer"): [`geocode()`](../pipeline/geocode.py#L209)
| Guard | Code | What it catches |
|---|---|---|
| **Right state** | [`in_state()`](../pipeline/geocode.py#L80): ray-casting point-in-polygon against real state boundary polygons | A Georgia project matching a substation in Florida |
| **Right region** | zone centroid check in `geocode()` | A weak match over 100 km from its GA planning zone's confirmed substations |
| **Right length** | [`plausible_length()`](../pipeline/geocode.py#L196) using [`haversine_km()`](../pipeline/geocode.py#L189) | Two endpoints 700 km apart on a "2-mile rebuild" |

Rejected endpoints are marked, not silently dropped (22 in total). Every endpoint carries **confidence (high/medium/low)** plus a **note** saying where it came from, and the app shows both.

**Point-in-polygon, explained simply:** draw a ray from the point going right, and count how many times it crosses the state border. Odd = inside, even = outside.

---

## STAGE 3 · Comparing every pair: [pipeline/overlaps.py](../pipeline/overlaps.py)

### Closest-point distance: [`closest_points()`](../pipeline/overlaps.py#L67)
- For each DESC project × each Georgia project, find the **shortest distance between the two shapes**, not between their centres.
- Coordinates are converted to kilometres with a **local flat projection** ([`to_xy()`](../pipeline/overlaps.py#L33)): longitude is scaled by cos(latitude). Over ~100 km that's accurate to under 0.5%.
- For two line segments: if they **cross** ([`seg_intersect()`](../pipeline/overlaps.py#L57), an orientation test), the distance is 0. Otherwise the minimum is always at an **endpoint of one segment against the other segment** ([`closest_on_seg()`](../pipeline/overlaps.py#L49) projects a point onto a segment and clamps it).
- Pairs **40 km or more apart are dropped** ([`MAX_KM`](../pipeline/overlaps.py#L25)).

### Tiers: [`tier_for()`](../pipeline/overlaps.py#L159)
`< 0.1 km` touching · `< 1.6 km` share land · `< 8 km` share a yard · `< 40 km` share crews. These come from the challenge brief.

### Timing: [`build_window()`](../pipeline/overlaps.py#L111)
- Georgia Power: the **start date** from its detail page → **need date**.
- DESC has no start date, so we use **the first budget year with spending**.
- **Construction window** = the last **18 months** before in-service ([`CONSTRUCTION_MONTHS`](../pipeline/overlaps.py#L29)).
- For each pair we store the **days between in-service dates** and the **days the construction windows overlap** ([`window_overlap_days()`](../pipeline/overlaps.py#L133)).

### Score: [`score()`](../pipeline/overlaps.py#L166)
```
score = geo × ((1 − w) + w × timing) × confidence
```
- `geo`: 100 → 0, sliding down through the tiers as distance grows.
- `timing`: 1 if construction windows overlap, otherwise it fades to 0 over a 4-year gap.
- `w` = 0.4 → **60% geography, 40% timing** (the brief says geography is primary).
- `confidence`: 1 / 0.9 / 0.75 for high / medium / low location confidence.

### Shared corridor: [`parallel_km()`](../pipeline/overlaps.py#L88)
For pairs under 1.6 km, it samples 60 points along each line and measures how much of it runs within 1.6 km of the other. Right-of-way savings count **only that stretch**, not the whole line.

### Output: [`main()`](../pipeline/overlaps.py#L181)
Writes `data/processed/overlaps.csv` and **`web/src/data/grid.json`**: every project, every overlap, and the state outlines, in one file the website imports.

---

## STAGE 4 · The website: [web/](../web)
**Stack:** React 19 · Vite · Leaflet (map) · GSAP (animation). There's no backend, and all data comes from `grid.json`.

### [web/src/lib/model.js](../web/src/lib/model.js): the brain of the UI
- [`explain()`](../web/src/lib/model.js#L39) / [`score()`](../web/src/lib/model.js#L48): **the same formula as Python**, recomputed in the browser so the **Timeline weight slider** can re-rank live. `explain()` also returns the parts (proximity, timing, confidence deduction) for "Why was this flagged?".
- [`filterOverlaps()`](../web/src/lib/model.js#L52): applies the filters (distance, gap, overlap-only, confidence), sorts by score and adds a rank.
- [`estimate()`](../web/src/lib/model.js#L102): the **cost model**. Each tier unlocks mechanisms:
  - `< 40 km`: shared mobilization = smaller project cost × 4% × 50%
  - `< 8 km`: one laydown yard ($300k)
  - `< 1.6 km`: shared right-of-way acres × $15k/acre + $150k joint permit
  - touching: $250k coordinated outage/crossing
  - Savings count "as scheduled" only if construction windows overlap. The display range is **0.6×–1.5×**.
- [`projCost()`](../web/src/lib/model.js#L92): DESC costs come from its PDF. **Georgia Power's are redacted**, so they're estimated as miles × $/mile by voltage, plus substation work.

### [web/src/App.jsx](../web/src/App.jsx): the controller
- Holds the **state**: filters, selected pair, tab, cost assumptions, theme.
- `useMemo` recomputes the ranked list whenever filters change.
- Saves filters and assumptions to **localStorage** so a refresh keeps them.
- Reads **deep links** from the URL (`#sel=OVL-001`, `#reveal=1`).

### [web/src/components/MapView.jsx](../web/src/components/MapView.jsx): the map
- Leaflet is **imperative** (not React-style), so it's wrapped in a component with `useEffect` hooks, each redrawing one layer: tiles, projects, overlap connectors, distance rings.
- [`useImperativeHandle`](../web/src/components/MapView.jsx#L131) gives the rest of the app a remote control: `fitPair()`, `flyHome()`, `highlight()`. The Reveal uses it to move the camera.
- **GSAP line draw** ([line 108](../web/src/components/MapView.jsx#L108)): sets `stroke-dasharray` to the line's full length, then animates `stroke-dashoffset` to 0, so the line appears to draw itself.
- Popup text is **HTML-escaped** (`esc()`) to prevent injection (XSS).

### [web/src/components/Reveal.jsx](../web/src/components/Reveal.jsx): the demo walkthrough
- [`useReveal()`](../web/src/components/Reveal.jsx#L12) builds a **GSAP timeline** ([line 60](../web/src/components/Reveal.jsx#L60)) with 5 `call()` steps at fixed seconds (0, 3.8, 7.8, 11.8, 15.8). Each step moves the map, changes the app state and sets the caption.
- **Space** = `timeline.paused(!paused)` · **→** = `timeline.seek(nextStep)` · **Esc** = `timeline.kill()`.
- It scrolls the side panel with GSAP's **ScrollToPlugin**.

### Other components
- [Detail.jsx](../web/src/components/Detail.jsx): one opportunity. [`Why`](../web/src/components/Detail.jsx#L39) is the explanation plus score bar, [`MiniGantt`](../web/src/components/Detail.jsx#L8) is the two-bar timeline, and the cost table has editable inputs. A GSAP timeline animates it in.
- [OpportunityList.jsx](../web/src/components/OpportunityList.jsx): the ranked cards, with a GSAP stagger when filters change.
- [Impact.jsx](../web/src/components/Impact.jsx): the funnel, plus portfolio savings using a **greedy no-double-counting** rule (each project is used in at most one pairing).
- [Timeline.jsx](../web/src/components/Timeline.jsx): the Gantt chart of every flagged project.
- [lib/anim.jsx](../web/src/lib/anim.jsx): registers GSAP plugins, plus the `CountUp` number animation and a **reduced-motion** check (accessibility).

---

## STAGE 5 · Build and deploy
- [vite.config.js](../web/vite.config.js):
  - **`vite-plugin-singlefile`** inlines all JS/CSS into **one HTML file**, so it even works when double-clicked (no CORS errors).
  - A small custom plugin, [`sourcePdfs()`](../web/vite.config.js#L15), copies the two PDFs into the build so the "source PDF p.N" links work.
- **GitHub Pages** serves the repo's `main` branch. A root `index.html` redirects to `web/dist/index.html`.
- **GitHub Actions** ([.github/workflows/pages.yml](../.github/workflows/pages.yml)) rebuilds the app on every push.

---

## 🔥 The questions they'll grill you on

**"Walk me through how it works."**
> "Three Python stages. First, parse both PDFs with pdfplumber and regex. Second, geocode each substation name against about 2,600 OpenStreetMap substations, with three checks to reject bad matches. Third, compute the closest-point distance between every pair of projects and score them. The output is one JSON file, and the React app just visualises it."

**"Why closest points instead of centres?"**
> "A long line can pass right next to a substation while their centres are far apart. The brief asks for closest points, so we compute true segment-to-segment distance."

**"How do you compute distance on a curved earth?"**
> "Over a hundred kilometres, a local flat projection is accurate to under half a percent: we scale longitude by cos(latitude). For sanity checks we use haversine, the great-circle formula."

**"How do you know a location is right?"**
> "Three guards: point-in-polygon for the right state, distance from the planning-zone centre for the right region, and the stated line length for the right length. They rejected 22 bad matches. Every location carries a confidence level and a source note, and low confidence lowers the score."

**"Give me an example of a bug you fixed."**
> "'Grady – West End', an Atlanta project, first matched a substation in Florida and a neighbourhood in Columbia, South Carolina. That's why we added the state-polygon and length checks. Another one: Georgia Power has two substations called Goshen, and the filings tell them apart only with a '(SAV)' suffix."

**"How is the score calculated?"**
> "Geography times timing times confidence: 60% distance, 40% timing, then scaled by location confidence. The same formula runs in Python and in the browser, so the slider re-ranks live, and 'Why was this flagged?' shows the breakdown."

**"Where do the dollar figures come from?"**
> "Planning-level assumptions per mechanism: 4% mobilization, $300k per yard, $15k per acre. Georgia Power's costs are redacted, so we estimate them per mile and label them as estimates. We show a range, never double-count, and every assumption is editable."

**"How does the timing work if DESC has no start dates?"**
> "We use the first budget year with spending from DESC's cost table, and take the last 18 months before in-service as the construction window."

**"Why is there no backend or database?"**
> "The data changes once per planning cycle, so we precompute everything. A static site is free to host, fast and works offline. The pipeline reruns with one command."

**"How does the animation work?"**
> "GSAP. The Reveal is a GSAP timeline with five callback steps, which is why we can pause, skip and stop it. The map line draws itself by animating the SVG stroke-dashoffset."

**"What would you improve?"**
> "Real line routes from HIFLD instead of straight lines, more utilities from SERTP, and automatic re-ingestion every planning cycle."

**"Did you write all of this?"**
> "I built it with an AI coding assistant. I directed the approach, made the decisions and verified the results, and I can walk you through any part of it."
