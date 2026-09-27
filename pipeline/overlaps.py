"""Stage 3: find cross-utility overlaps and rank coordination opportunities.

Geographic overlap (primary): closest-point distance between two project geometries
(straight line between endpoint substations, or a point) under 40 km.
  cross  - touching / crossing (< 0.1 km)   -> must coordinate outages & crossings
  row    - under 1.6 km                      -> can share right-of-way, access roads, permits
  site   - under 8 km                        -> can share laydown yards, deliveries
  crew   - under 40 km                       -> can share crews and equipment
Timeline overlap (secondary): overlap of the two construction windows, plus the gap
between in-service dates in days.

Outputs data/processed/overlaps.json, overlaps.csv and web/src/data/grid.json (for the React UI).
"""
import csv
import json
import math
import re
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROC = ROOT / "data" / "processed"
WEB_DATA = ROOT / "web" / "src" / "data"

MAX_KM = 40.0
TIERS = [(0.1, "cross"), (1.6, "row"), (8.0, "site"), (40.0, "crew")]
TIER_BASE = {"cross": 100, "row": 85, "site": 65, "crew": 40}
CONF_FACTOR = {"high": 1.0, "medium": 0.9, "low": 0.75, "none": 0.0}
CONSTRUCTION_MONTHS = 18  # typical field-construction window before energization


# ---------------------------------------------------------------- geometry
def to_xy(lon, lat, lat0):
    """Local equirectangular projection in km (accurate to <0.5% at these scales)."""
    return (math.radians(lon) * 6371.0088 * math.cos(math.radians(lat0)), math.radians(lat) * 6371.0088)


def from_xy(x, y, lat0):
    return (math.degrees(x / (6371.0088 * math.cos(math.radians(lat0)))), math.degrees(y / 6371.0088))


def segs(geom):
    c = geom["coordinates"]
    if geom["type"] == "Point":
        return [(c, c)]
    return list(zip(c[:-1], c[1:]))


def closest_on_seg(p, a, b):
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L))
    return (ax + t * dx, ay + t * dy)


def seg_intersect(a, b, c, d):
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    o1, o2, o3, o4 = orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)
    if o1 * o2 < 0 and o3 * o4 < 0:
        t = o3 / (o3 - o4)  # fraction along a→b
        return (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
    return None


def closest_points(g1, g2):
    """Return (distance_km, point_on_g1, point_on_g2) as lon/lat."""
    lats = [c[1] for g in (g1, g2) for s in segs(g) for c in s]
    lat0 = sum(lats) / len(lats)
    best = (float("inf"), None, None)
    for a, b in segs(g1):
        A, B = to_xy(*a, lat0), to_xy(*b, lat0)
        for c, d in segs(g2):
            C, D = to_xy(*c, lat0), to_xy(*d, lat0)
            x = seg_intersect(A, B, C, D) if A != B and C != D else None
            if x:
                return (0.0, from_xy(*x, lat0), from_xy(*x, lat0))
            # Non-crossing segments: the minimum is at an endpoint of one against the other.
            for on1, on2 in ((A, closest_on_seg(A, C, D)), (B, closest_on_seg(B, C, D)),
                             (closest_on_seg(C, A, B), C), (closest_on_seg(D, A, B), D)):
                dist = math.dist(on1, on2)
                if dist < best[0]:
                    best = (dist, from_xy(*on1, lat0), from_xy(*on2, lat0))
    return best


def parallel_km(g1, g2, within_km=1.6, samples=60):
    """Length of g1 that runs within `within_km` of g2: the stretch where a corridor could be shared."""
    if g1["type"] != "LineString" or g2["type"] != "LineString":
        return 0.0
    total, near = 0.0, 0.0
    for a, b in segs(g1):
        lat0 = (a[1] + b[1]) / 2
        A, B = to_xy(*a, lat0), to_xy(*b, lat0)
        L = math.dist(A, B)
        total += L
        for i in range(samples):
            t = (i + 0.5) / samples
            lon, lat = from_xy(A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1]), lat0)
            if closest_points({"type": "Point", "coordinates": [lon, lat]}, g2)[0] <= within_km:
                near += L / samples
    return near


# ---------------------------------------------------------------- timeline
def d(s):
    return date.fromisoformat(s) if s else None


def build_window(p):
    """(planning_start, construction_start, in_service)."""
    isd = d(p["in_service"])
    if not isd:
        return None
    if p.get("start"):
        start = d(p["start"])
    else:
        # DESC gives no start date; use the first budget year with spend.
        spend = p.get("spend_by_year", {})
        yrs = [k for k, v in spend.items() if v]
        if yrs and yrs[0] == "prev":
            start = date(2023, 1, 1)
        elif yrs:
            start = date(int(yrs[0]), 1, 1)
        else:
            start = isd - timedelta(days=730)
    start = min(start, isd)
    cstart = max(start, isd - timedelta(days=CONSTRUCTION_MONTHS * 30))
    return start, cstart, isd


def window_overlap_days(w1, w2):
    return max(0, (min(w1[2], w2[2]) - max(w1[1], w2[1])).days)


# ---------------------------------------------------------------- project facts
def line_miles(p):
    text = f"{p['name']} {p['description']}"
    miles = [float(m) for m in re.findall(r"(\d+(?:\.\d+)?)\s*(?:-\s*)?mi(?:les?)?\b", text, re.I)]
    return max(miles) if miles else None


def voltage_kv(p):
    kv = [int(v) for v in re.findall(r"(\d{2,3})\s*-?\s*kV", p["name"] + " " + p["description"], re.I) if 34 <= int(v) <= 500]
    return max(kv) if kv else None


def kind(p):
    g = p.get("geometry")
    txt = (p["name"] + " " + p["description"]).upper()
    if g and g["type"] == "LineString":
        return "line"
    if re.search(r"\bLINE\b|REBUILD|RECONDUCTOR|CONDUCTOR", txt) and not re.search(r"SUBSTATION|AUTOBANK|TRANSFORMER|BANK\b", p["name"].upper()):
        return "line"
    return "substation"


def tier_for(km):
    for lim, name in TIERS:
        if km < lim:
            return name
    return None


def score(pair):
    km, tier = pair["distance_km"], pair["tier"]
    lo = {"cross": 0, "row": 0.1, "site": 1.6, "crew": 8}[tier]
    hi = {"cross": 0.1, "row": 1.6, "site": 8, "crew": 40}[tier]
    # Tier sets the band; distance within the tier slides the score down to the next band.
    nxt = {"cross": 85, "row": 65, "site": 40, "crew": 0}[tier]
    geo = TIER_BASE[tier] - (TIER_BASE[tier] - nxt) * (km - lo) / (hi - lo)
    if pair["construction_overlap_days"] > 0:
        timing = 1.0
    else:
        timing = max(0.0, 1 - pair["isd_gap_days"] / (365 * 4))  # fades out over 4 years
    conf = min(CONF_FACTOR[pair["a_conf"]], CONF_FACTOR[pair["b_conf"]])
    return round(geo * (0.6 + 0.4 * timing) * conf, 1)


def main():
    projects = json.loads((PROC / "projects_geo.json").read_text())
    for p in projects:
        p["line_miles"] = line_miles(p)
        p["voltage_kv"] = voltage_kv(p)
        p["kind"] = kind(p)
        w = build_window(p)
        p["window"] = {"start": w[0].isoformat(), "construction_start": w[1].isoformat(), "in_service": w[2].isoformat()} if w else None

    desc = [p for p in projects if p["utility_code"] == "DESC" and p["geometry"]]
    ga = [p for p in projects if p["state"] == "GA" and p["geometry"]]
    pairs = []
    for a in desc:
        for b in ga:
            km, pa, pb = closest_points(a["geometry"], b["geometry"])
            if km >= MAX_KM:
                continue
            wa, wb = build_window(a), build_window(b)
            pair = {
                "a": a["id"], "b": b["id"], "b_utility_code": b["utility_code"],
                "distance_km": round(km, 2), "distance_mi": round(km / 1.609344, 2),
                "tier": tier_for(km),
                "closest_a": [round(pa[0], 5), round(pa[1], 5)], "closest_b": [round(pb[0], 5), round(pb[1], 5)],
                "isd_gap_days": abs((wa[2] - wb[2]).days),
                "construction_overlap_days": window_overlap_days(wa, wb),
                "a_conf": a["location_confidence"], "b_conf": b["location_confidence"],
                "parallel_km": round(min(parallel_km(a["geometry"], b["geometry"]), parallel_km(b["geometry"], a["geometry"])), 2)
                if km < 1.6 else 0.0,
            }
            pair["score"] = score(pair)
            pairs.append(pair)
    pairs.sort(key=lambda x: -x["score"])
    for i, p in enumerate(pairs, 1):
        p["rank"] = i
        p["id"] = f"OVL-{i:03d}"

    (PROC / "overlaps.json").write_text(json.dumps(pairs, indent=1))
    by_id = {p["id"]: p for p in projects}
    with open(PROC / "overlaps.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rank", "overlap_id", "score", "tier", "distance_km", "distance_mi", "isd_gap_days",
                    "construction_overlap_days", "desc_id", "desc_project", "desc_in_service",
                    "ga_id", "ga_sponsor", "ga_project", "ga_in_service", "location_confidence"])
        for p in pairs:
            a, b = by_id[p["a"]], by_id[p["b"]]
            w.writerow([p["rank"], p["id"], p["score"], p["tier"], p["distance_km"], p["distance_mi"], p["isd_gap_days"],
                        p["construction_overlap_days"], a["source_id"], a["name"], a["in_service"],
                        b["source_id"], b["sponsor"], b["name"], b["in_service"],
                        min(p["a_conf"], p["b_conf"], key=lambda c: CONF_FACTOR[c])])

    WEB_DATA.mkdir(parents=True, exist_ok=True)
    slim = [{k: p.get(k) for k in ("id", "source_id", "name", "description", "utility", "utility_code", "sponsor",
                                    "state", "zone", "status", "in_service", "cost_usd", "source_page", "endpoints",
                                    "geometry", "location_confidence", "line_miles", "voltage_kv", "kind", "window")}
            for p in projects]
    states = {}
    for code, fname in (("GA", "state_georgia.json"), ("SC", "state_south_carolina.json")):
        g = json.loads((ROOT / "data" / "cache" / fname).read_text())[0]["geojson"]
        rings = [poly[0] for poly in (g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]])]
        states[code] = [[[round(x, 4), round(y, 4)] for x, y in r] for r in rings]
    payload = {
        "projects": slim, "overlaps": pairs, "states": states,
        "params": {"max_km": MAX_KM, "tiers": TIERS, "construction_months": CONSTRUCTION_MONTHS},
        "generated": date.today().isoformat(),
    }
    (WEB_DATA / "grid.json").write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    gpc_pairs = [p for p in pairs if p["b_utility_code"] == "GPC"]
    print(f"{len(pairs)} overlapping pairs (<{MAX_KM:.0f} km) out of {len(desc) * len(ga)} DESC x Georgia pairs; "
          f"{len(gpc_pairs)} with Georgia Power itself")
    for t in ("cross", "row", "site", "crew"):
        print(f"  {t}: {sum(1 for p in pairs if p['tier'] == t)}")
    for p in pairs[:25]:
        a, b = by_id[p["a"]], by_id[p["b"]]
        print(f"#{p['rank']:>2} {p['score']:5.1f} {p['tier']:5} {p['distance_km']:6.2f}km gap {p['isd_gap_days']:>5}d "
              f"ovl {p['construction_overlap_days']:>3}d | {a['name'][:38]:38} | {b['sponsor']:4} {b['name'][:45]}")


if __name__ == "__main__":
    main()
