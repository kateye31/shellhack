## Inspiration

Georgia Power and Dominion Energy South Carolina sit on opposite banks of the Savannah River. Each one plans years of transmission work (new lines, rebuilt substations), and each does it largely without seeing what the other has planned a few miles away. In 2024 federal regulators issued **FERC Order No. 1920** because this kind of isolated planning leads to duplicated work, wasted money and slower grid construction.

We wanted to answer a simple question with real public data: **where are these two utilities about to build near each other at the same time, and what could they save by coordinating?**

## What it does

GridLock turns two utilities' public planning documents into a single interactive coordination map:

- **Reads the plans:** it extracts all 44 Dominion Energy SC projects and 208 Georgia ITS projects (138 of them Georgia Power's) straight from the public PDFs.
- **Puts every project on the map:** it locates each named substation and draws every line.
- **Finds real overlaps:** it measures the *closest points* between every DESC and Georgia Power project, not their centres. It flags pairs within **40 km**, the distance a crew can drive from one staging yard.
- **Ranks them** by distance tier (touching, < 1.6 km, < 8 km, < 40 km) with build-window overlap as a secondary signal.
- **Explains every match:** "Why was this flagged?" gives a plain-English reason and a score breakdown, and each project links back to its page in the source PDF.
- **Estimates the value** of sharing crews, laydown yards, right-of-way and outage windows, as a range with editable assumptions.
- **Guided "Reveal":** a five-step animated walkthrough of the top opportunity, for presenting it to decision-makers.

**What we found:** of 4,429 DESC × Georgia Power project pairs, only **84** come within 40 km, and **26** share a construction window. The top match is DESC's new **Riverport tap** in Hardeeville, SC, **2.75 km** from Georgia Power's **McIntosh–Purrysburg** tie across the river. Both are under construction at the same time for about **13 months**, worth an estimated **$280k–$700k** in shared crews and staging. Near Augusta, two rebuilds end at the **same Thurmond Dam switchyard** but are scheduled **8.4 years apart**, an opportunity coordination could create.

## How we built it

**1. Data pipeline (Python).** We parsed the DESC project sheets and Georgia Power's 668-page IRP with `pdfplumber`. For Georgia Power we joined the ten-year project table to each project's detail page, which gives start dates, need dates and descriptions.

**2. Geocoding.** Each project name is split into its endpoint substations (e.g. `Okatie–Bluffton 115kV` → Okatie, Bluffton). Each endpoint is matched against about 2,600 OpenStreetMap substations and power plants (Overpass API), then Nominatim, then hand-verified coordinates with cited sources. Every location gets a **high / medium / low confidence** label.

**3. Overlap engine.** For two project geometries \\(A\\) and \\(B\\) (lines or points), we compute the true closest-point distance

$$d(A,B) = \min_{a \in A,\; b \in B} \lVert a - b \rVert$$

using segment-to-segment geometry in a local projected plane. That's how a long line passing close to another utility's substation still gets flagged.

**4. Transparent scoring.** Geography is the primary signal and timing the secondary one:

$$\text{score} = \text{geo} \times \big((1-w) + w \cdot \text{timing}\big) \times \text{confidence}$$

where \\(\text{geo}\\) falls from 100 to 0 across the distance tiers, \\(\text{timing}=1\\) if construction windows overlap (otherwise it fades to 0 over 4 years), and \\(w\\) is a user-adjustable weight (default 40%).

**5. Cost model.** Savings add up only the mechanisms each distance tier allows. Mobilization savings are \\(\text{share} \times \text{mob\%} \times \text{cost}_{\min}\\). Right-of-way savings count only the stretch where the two lines actually run side by side. Results are shown as a 0.6×–1.5× range and counted without double-counting across the portfolio.

**6. Front end.** **React + Vite** with **Leaflet** for the map and **GSAP** for motion: connectors draw themselves between projects, distance rings expand, numbers count up, and the Reveal is a GSAP timeline with pause, skip and progress controls. It builds to a single self-contained HTML file that opens offline with a double-click.

## Challenges we ran into

- **The plans have no coordinates.** The public filings list project *names*, not locations. Turning "HOOKS – THURMOND 115KV TIE" into a point on a map was the hardest part of the project.
- **False matches everywhere.** "Grady – West End," an Atlanta project, first matched a substation in Florida and a neighbourhood in Columbia, SC. We added three guards: state-boundary polygons, planning-zone distance checks, and a line-length sanity check against each project's stated mileage. Together they rejected 22 bad endpoints.
- **Two places with the same name.** Georgia Power has two "Goshen" substations, one near Savannah and one near Augusta. The filings tell them apart only by a "(SAV)" suffix, which we had to handle explicitly.
- **Missing and redacted data.** Some substations (like DESC's Hooks) don't appear in any public map data, and Georgia Power's costs are redacted. We estimated these from the PDF descriptions and **labelled every estimate** rather than hiding it.
- **Being honest about savings.** Real savings depend on engineering, land rights and approvals, so we show ranges and the assumptions behind them, not a single precise dollar figure.

## Accomplishments that we're proud of

- A working pipeline from **raw regulatory PDFs to a ranked, explainable list of opportunities**, reproducible with one command.
- Results that agree with the sponsor's own reference matches, plus a **higher-ranked opportunity (Riverport ↔ McIntosh) that wasn't in their starter set**.
- Every number on screen can be traced back to its source: a PDF page, a map feature, or an editable assumption.

## What we learned

- Most real-world data work is **validation**, not calculation. The distance math was the easy part. Making sure every location was right took most of our time.
- Measuring the **closest points** between projects, rather than their centres, changes which projects get flagged.
- How transmission planning actually works: IRPs, SERTP, right-of-way, and why coordination across a state line is hard.

## What's next for GridLock

- Swap straight-line approximations for actual line routes where public GIS data exists (e.g. the HIFLD transmission layer).
- Add more utilities in the same regional planning forum (SERTP): Santee Cooper, Duke Energy and Georgia Transmission Corporation.
- Automatically pull new filings each planning cycle so the map stays current.
