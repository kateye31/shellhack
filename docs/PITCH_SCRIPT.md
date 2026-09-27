# GridLock: 3-minute pitch script

About 420 spoken words, roughly 2:50 at a calm pace. **[CLICK]** = next slide. *Italics* = what to do.

---

## 1 · Cover (0:00–0:08)
*Stand still. Smile. Wait for the title to finish appearing.*

> "Hi, I'm **[your name]**, and this is **GridLock**."

**[CLICK]**

## 2 · We all share the same earth (0:08–0:25)
*Slow down. This is the emotional hook. Eye contact.*

> "When you and your neighbour both need a ladder… you don't buy two. You share one.
>
> We all share the same earth: the same roads, the same rivers. So why do neighbours still **build apart**?
>
> **Communication is key.** When neighbours talk, everyone saves."

**[CLICK]**

## 3 · Two neighbours. One river. Planning alone. (0:25–0:45)
> "Meet two neighbours: **Dominion Energy South Carolina** and **Georgia Power**. Between them, 182 planned projects, and one river: the Savannah.
>
> Each one plans **alone**. Two crews. Two equipment yards. Two sets of permits. Sometimes just kilometres apart.
>
> Federal regulators noticed too. In 2024, **FERC Order 1920** told utilities to stop planning alone."

**[CLICK]**

## 4 · The closer they build, the more they can share (0:45–1:00)
*Point at the cards as they appear, left to right.*

> "Working together pays off in steps. Within **40 kilometres**, they can share crews. Within **8**, one equipment yard. Within **1.6**, the land itself. And if they touch? They plan as one.
>
> But only if they build at the same time, and that only happens **if they talk.**"

**[CLICK]**

## 5 · From two separate PDFs to one shared map (1:00–1:10)
*Quick. The demo does the explaining.*

> "So we built **GridLock**. It reads both plans, finds every substation, measures the closest distance between every pair of projects, and puts a dollar value on working together.
>
> Let me show you."

**[CLICK]** → yellow **"Let's see it live"** slide → *Alt+Tab to the browser*

## 6 · LIVE DEMO (1:10–2:30)
*Browser already open on kateye31.github.io/shellhack, full screen (F11), map zoomed out.*

*Click **▶ Reveal**.*

> "Out of **4,429** project pairs, here's the best one. Dominion's new **Riverport** line… and Georgia Power's **McIntosh** line, right across the river."

*The connector draws itself. Press **Space** to pause.*

> "At their closest points, just **2.75 kilometres** apart. Close enough to share one equipment yard."

*Press **Space** to resume. It scrolls to the timeline.*

> "And they're under construction at the **same time**, for about **13 months**."

*It scrolls to the savings.*

> "Working together here is worth an estimated **$280,000 to $700,000**, from one pair."

*Press **Esc**. Scroll up to **"Why was this flagged?"***

> "And it's not a black box. Every match explains itself, point by point, and links back to the original public filing."

*Only if the clock shows under 2:15: click **Augusta**, then the **#5** card (pink "Touching").*

> "Here's one they could *create*: two projects plugging into the **exact same switchyard**, scheduled **8 years apart**. One phone call could change that."

*Alt+Tab back to the slides.* **[CLICK]**

## 7 · When they work together, everyone saves (2:30–2:45)
> "Across both plans, **84** places within a crew's drive, and **26** being built at the same time.
>
> Counting each project only once, working together could save an estimated **1.7 to 4.4 million dollars**."

**[CLICK]**

## 8 · Communication is key. (2:45–3:00)
*Slowest part of the whole pitch. Warm. Look at the judges, not the screen.*

> "**Communication is key.** We all share the same earth.
>
> So let's stop building apart… and start **building together**.
>
> GridLock: **coordinate before you construct.** Thank you."

*Stop talking. Smile. Leave this slide up.*

---

## ⏱️ If you're running long
- **Skip the Augusta part** of the demo. It's the first thing to cut.
- On slide 4, just say: *"The closer they build, the more they share, but only if they talk."*
- **Never cut slide 2 or slide 8.** They're the emotion judges remember.

## 🆘 If the demo breaks
Don't panic, don't apologise at length. Say *"Let me show you what it found"*, go to the backup slides, and use:
- **"Riverport Tap ⟷ McIntosh–Purrysburg"** (the yellow slide): 2.75 km · 13 months · $280k–$700k
- **"Same switchyard. Scheduled 8.4 years apart."**

Then continue to the results slide as normal.

## 💬 Judge Q&A: quick answers
| They ask | You say |
|---|---|
| "How do you know the locations are right?" | "Three checks (right state, right region, right line length) rejected 22 bad matches, and every location shows its confidence and source." |
| "Where do the savings numbers come from?" | "Planning-level assumptions, like a 4% mobilization cost or $300k per yard. They're shown as ranges, and every one is editable live in the app." |
| "What's the tech?" | "A Python pipeline reads the PDFs and uses OpenStreetMap to find each substation. The front end is React with GSAP on a Leaflet map, deployed with GitHub Actions." |
| "Why closest points, not centres?" | "A long power line can pass right beside a substation even when their centres are far apart. Centres would miss it." |
| "Did you use AI?" | "Not in the product. I built it with an AI coding assistant, and I directed and checked every step." |
| "What's next?" | "Real line routes from federal data, more utilities from the same regional forum, and re-running it every planning cycle." |

## ✅ Before you walk up
- [ ] Browser open on the app, **F11**, map zoomed out, Opportunities tab
- [ ] Slides open in **Present mode** on slide 1
- [ ] Practised **Alt+Tab** between the two
- [ ] Did the Reveal twice and know when to press **Space**
- [ ] Timed one full run: under 3:00
- [ ] Water nearby, breathe, **slow down on slides 2 and 8**
