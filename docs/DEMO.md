# GridLock: 3-minute demo script

**Setup (before judging):** double-click `web/dist/index.html` (or run `npm run dev` in `web/`). Everything runs from cached data, so no live internet calls are needed
except for map tiles. If the venue Wi-Fi is bad, the ranked list, detail and Impact tabs still work
without tiles. Have `…/#reveal=1` ready in a second tab as a fallback. During the reveal: **Space** pauses so you can talk, **→** jumps to the next step, **Esc** stops.

---

### 0:00–0:25 · The problem
> "Dominion Energy South Carolina and Georgia Power sit on opposite banks of the Savannah River.
> Each plans years of transmission work, and each does it without seeing the other's plans.
> In 2024 FERC issued Order 1920 because this kind of isolated planning wastes money."

*Screen: the full map. Blue is DESC and orange is Georgia Power.*

### 0:25–0:50 · What GridLock is
> "GridLock reads both utilities' public filings (44 DESC projects and 138 Georgia Power projects),
> locates every substation, and measures how close each DESC project comes to each Georgia project,
> closest point to closest point."

*Click **▶ Reveal top opportunity**. Steps 1 and 2 play.*

### 0:50–1:30 · The reveal
> "Our top match: DESC's new Riverport tap in Hardeeville and Georgia Power's McIntosh–Purrysburg
> reactor project. At their closest points they're **2.75 km** apart, which is close enough to share
> a laydown yard. Both are in construction at the same time for about **13 months**."

*Steps 3 and 4 play: closest-point connector, rings, timeline.*
Point at **Why was this flagged?**: "Every score is explained: proximity points, timing points,
and a deduction because one location is only medium-confidence."

### 1:30–2:10 · The impact
*Step 5: the cost panel.*
> "Sharing crews, equipment and one staging yard is worth roughly **$280k–$700k** on this pair alone.
> These are planning-level ranges, not promises. Every assumption is editable."

*Change "Laydown yard $" live to show the estimate updating.*
*Open the **Impact** tab:* "Across the portfolio, counting each project only once, that's about
**$1.7M–$4.4M** as scheduled today, and more if schedules were aligned."

### 2:10–2:40 · Technical depth and false positives
*Stay on the Impact tab and point at the funnel.*
> "Of about 4,400 project pairs, only 84 are within 40 km. The rest are filtered out, just as the brief
> predicted. We also reject bad geocodes: a Georgia project called 'Grady – West End' first matched a
> substation in Florida and a neighbourhood in Columbia, SC. State boundaries, planning-zone checks and
> line-length checks caught both."

*Open **Augusta** on the map and select opportunity #5.*
> "Here two rebuilds end at the **same** Thurmond Dam switchyard, but they're scheduled 8 years apart.
> That's a coordination opportunity the utilities could create by resequencing."

### 2:40–3:00 · Close
> "GridLock turns two disconnected public plans into a ranked, explainable list of places where
> the utilities should talk, and puts a rough dollar figure on each one."

---

**Likely judge questions**
- *How do you know the locations are right?* Every endpoint has a source and a confidence level (Detail view → "The two projects"). Manual coordinates cite where they came from, and each project links to its page in the source PDF.
- *Why straight lines?* Real routes aren't public (CEII). The brief describes the same approximation, and we measure closest points, not centres.
- *Georgia Power costs?* They're redacted in the public IRP, so we estimate them per mile by voltage and label them as estimates.
- *Hooks substation?* It isn't in any public map data. We estimated it from the PDF's 2.3-mile description, flagged it low-confidence, and it gets a score deduction.
