"""Stage 2: turn project names into geometry.

Each project name is split into its named endpoints (substations / plants). Each
endpoint is located by, in priority order:
  1. data/manual_locations.json  - hand-verified coordinates (with a source note)
  2. OpenStreetMap substations/plants (data/cache/osm_substations.json), matched by
     normalized name, preferring the utility's own tagged assets and its home state.
A project with two located endpoints becomes a straight line between them (the same
straight-line approximation the challenge brief describes); one located endpoint
becomes a point.

Outputs data/processed/projects_geo.json.
"""
import json
import math
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROC = ROOT / "data" / "processed"
OSM = json.loads((ROOT / "data" / "cache" / "osm_substations.json").read_text(encoding="utf-8"))["elements"]
MANUAL = json.loads((ROOT / "data" / "manual_locations.json").read_text(encoding="utf-8"))
NOMINATIM_CACHE = ROOT / "data" / "cache" / "nominatim.json"
STATE_NAME = {"SC": "South Carolina", "GA": "Georgia"}

# Words that describe the work or equipment rather than the place.
NOISE = re.compile(
    r"\b(\d+(\.\d+)?\s*-?\s*K?V|\d+/\d+\s*KV|KV|REBUILD|RECONDUCTOR|CONSTRUCT(ION)?|LINE|LINES|TIE|TAP|SUB(STATION)?|"
    r"UPGRADE|REPLACE(MENT)?|REACTORS?|PROJECT|NEW|BUS|BANK|AUTO\s*BANKS?|AUTOBANKS?|TRANSFORMERS?|SECOND|"
    r"STRATEGIC|SOLUTION|AREA|SECTION|SECT|SWITCH(ING)?|STATION|INSTALLATION|INSTALL|BREAKER|CAPACITOR|"
    r"SPDC|SERIES|PARALLEL|PHASE|RELAY|MODERNIZATION|EQUIPMENT|LIMITING|ELEMENT|FOLD-?IN|EXPANSION|"
    r"CONVERSION|DUAL|STAGE|SINGLE|CIRCUIT|ADD|WITH|AND|THE|OF|TO|FROM|FOR|#\d+|BLACK|WHITE|\(USA\)|USA|"
    r"TERMINAL|IMPROVEMENTS?|NETWORK|RATING|INCREASE|OPERATING|GUIDE|PARTIAL|ACSR|B-?\d+|\d+ ?MVA|DEP|SW)\b",
    re.I,
)
PREFIX = re.compile(r"^(SAV|GTC|MEAG|DU|GRID)\s*[:-]\s*", re.I)

def _load_state(fname):
    g = json.loads((ROOT / "data" / "cache" / fname).read_text())[0]["geojson"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    return [poly[0] for poly in polys]  # outer rings only


STATE_POLY = {"GA": _load_state("state_georgia.json"), "SC": _load_state("state_south_carolina.json")}


def norm(s):
    s = s.upper().replace("’", "'").replace("–", "-").replace("—", "-")
    s = re.sub(r"\bST\.?\b", "ST", s)
    s = re.sub(r"\bFT\.?\b", "FORT", s)
    s = re.sub(r"\bJCT\b", "JUNCTION", s)
    s = re.sub(r"\bPRI\b", "PRIMARY", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return " ".join(s.split())


def endpoints(name):
    """'SAV: GOSHEN (SAV) - MCINTOSH 115KV LINE REBUILD' -> ['GOSHEN', 'MCINTOSH']"""
    s = PREFIX.sub("", name)
    s = s.split(":")[0]                      # DESC style "Okatie-Bluffton 115kV: Rebuild"
    s = re.sub(r"\d+(\.\d+)?\s*[-/]\s*\d+(\.\d+)?\s*K?V", " ", s, flags=re.I)  # "230-115kV", "230/115KV" are voltages
    s = re.sub(r"fold-in", " ", s, flags=re.I)
    s = re.sub(r"#\s*\d+", " ", s)             # circuit numbers
    s = re.split(r"[,/&]", s)[0]              # keep the first named facility / line
    s = re.sub(r"\([^)]*\)", " ", s)          # parentheticals: (SAV), (USA), (APC) ...
    parts = re.split(r"\s*[-–]\s*", s)
    out = []
    for p in parts:
        p = NOISE.sub(" ", p)
        p = re.sub(r"[^A-Za-z0-9 .'&]", " ", p)
        p = re.sub(r"(\s\d+)+$", "", " ".join(p.split())).strip(" .")
        if p and not p.isdigit() and len(p) > 1:
            out.append(p)
    return out[:2]


def in_state(lat, lon, state):
    """Ray-casting point-in-polygon against the OSM state boundary."""
    inside = False
    for ring in STATE_POLY[state]:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
                inside = not inside
    return inside


def build_index():
    idx = {}
    for el in OSM:
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat is None:
            continue
        t = el["tags"]
        rec = {"lat": lat, "lon": lon, "osm": f"{el['type']}/{el['id']}", "osm_name": t["name"],
               "operator": t.get("operator", ""), "kind": t.get("power"),
               "states": {st for st in STATE_POLY if in_state(lat, lon, st)}}
        keys = {norm(t["name"])}
        base = norm(NOISE.sub(" ", t["name"]))
        keys.add(base)
        keys.add(re.sub(r" (PRIMARY|DISTRIBUTION|TRANSMISSION|DIST|TRANS|PLANT|STEAM|HYDRO|DAM|ENERGY|GENERATING|SOLAR)$", "", base))
        for k in keys:
            if k:
                idx.setdefault(k, []).append(rec)
    return idx


OPERATOR_HINT = {
    "DESC": ("DOMINION", "SCE&G", "SOUTH CAROLINA ELECTRIC", "SOUTH CAROLINA GAS"),
    "GPC": ("GEORGIA POWER", "SOUTHERN", "SAVANNAH"),
    "GTC": ("GEORGIA TRANSMISSION", "OGLETHORPE", "EMC"),
    "MEAG": ("MEAG", "MUNICIPAL"),
    "DU": ("DALTON",),
}


def locate(name, project, idx):
    key = norm(name)
    code, state = project["utility_code"], project["state"]
    for k in (f"{code}:{key}", f"{state}:{key}", key):
        if k in MANUAL:
            m = MANUAL[k]
            return {"lat": m["lat"], "lon": m["lon"], "method": "manual", "confidence": m.get("confidence", "high"),
                    "note": m.get("source", "")}
    cands = []
    for k in (key, re.sub(r" (PRIMARY|DISTRIBUTION|TRANSMISSION)$", "", key)):
        cands += idx.get(k, [])
    cands = [c for c in cands if state in c["states"]]  # a Georgia project's substation is in Georgia
    prefix = False
    if not cands and len(key) >= 4:
        # "HATCH" -> "Hatch Nuclear Plant Substation": same-state names that start with the key.
        cands = [c for k, cs in idx.items() if k.startswith(key + " ") for c in cs if state in c["states"]]
        prefix = True
    if not cands:
        return nominatim(name, state)
    hint = OPERATOR_HINT.get(code, ())

    def score(c):
        op = c["operator"].upper()
        return (c["kind"] == "substation" and "SOLAR" not in c["osm_name"].upper(),
                any(h in op for h in hint), state in c["states"])

    cands.sort(key=score, reverse=True)
    best = cands[0]
    b = score(best)
    # Several equally-good same-named candidates far apart = ambiguous.
    ties = [c for c in cands if score(c) == b and haversine_km(c["lat"], c["lon"], best["lat"], best["lon"]) > 15]
    conf = "high" if b[1] and not ties else "medium" if b[2] and not ties else "low"
    if prefix and conf == "high":
        conf = "medium"
    return {"lat": best["lat"], "lon": best["lon"], "method": "osm", "confidence": conf,
            "note": f"OSM {best['osm']} '{best['osm_name']}' ({best['operator'] or 'no operator tag'})"}


def _nominatim_query(q, cache):
    if q not in cache:
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": q, "format": "jsonv2", "limit": 3, "countrycodes": "us"})
        req = urllib.request.Request(url, headers={"User-Agent": "gridlock-hackathon/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            cache[q] = json.loads(r.read())
        time.sleep(1.1)  # Nominatim usage policy: max 1 request/second
        NOMINATIM_CACHE.write_text(json.dumps(cache, indent=0))
    return cache[q]


def nominatim(name, state):
    """Fallback geocode. A named substation is medium confidence; a town/road of the
    same name is low confidence (substations are often named after their town)."""
    if len(name) <= 3:  # "CC", "LG": too ambiguous to geocode as a place
        return None
    cache = json.loads(NOMINATIM_CACHE.read_text()) if NOMINATIM_CACHE.exists() else {}
    for q, conf in ((f"{name} substation, {STATE_NAME[state]}", "medium"), (f"{name}, {STATE_NAME[state]}", "low")):
        for hit in _nominatim_query(q, cache):
            lat, lon = float(hit["lat"]), float(hit["lon"])
            if not in_state(lat, lon, state):
                continue
            is_power = hit.get("category") == "power"
            if conf == "medium" and not is_power:
                continue
            return {"lat": lat, "lon": lon, "method": "nominatim", "confidence": conf,
                    "note": f"Nominatim: {hit.get('display_name', '')[:90]}"}
    return None


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def plausible_length(p, pts):
    """Straight-line endpoint separation must fit the line's stated or typical length."""
    km = haversine_km(pts[0]["lat"], pts[0]["lon"], pts[1]["lat"], pts[1]["lon"])
    miles = [float(m) for m in re.findall(r"(\d+(?:\.\d+)?)\s*mi(?:les?)?", p["name"] + " " + p["description"], re.I)]
    if miles:
        return km <= max(miles) * 1.609 * 1.5 + 15
    return km <= (250 if re.search(r"500\s*KV", p["name"], re.I) else 100)


def reject(e, why):
    e.update(lat=None, lon=None, method="rejected", confidence="none", note=f"Rejected: {e['note'][:60]} ({why})")


def geocode(projects, idx):
    rank = {"high": 3, "medium": 2, "low": 1}
    for p in projects:
        names = MANUAL.get("endpoints", {}).get(p["id"]) or endpoints(p["name"])
        p["endpoints"] = [{"name": n, **(locate(n, p, idx) or {"lat": None, "lon": None, "method": "unmatched",
                                                               "confidence": "none", "note": ""})} for n in names]

    # GA ITS planning zones are regional (219 = Savannah, 215 = Augusta, 20x = Atlanta ...). A weak
    # match far from the zone's confidently-located substations is a namesake in the wrong city.
    zone_pts = {}
    for p in projects:
        for e in p["endpoints"]:
            if p.get("zone") and e["confidence"] == "high":
                zone_pts.setdefault(p["zone"], []).append((e["lat"], e["lon"]))
    centre = {z: (sorted(x[0] for x in v)[len(v) // 2], sorted(x[1] for x in v)[len(v) // 2]) for z, v in zone_pts.items()}

    for p in projects:
        pts = p["endpoints"]
        for e in pts:
            z = centre.get(p.get("zone"))
            if z and e["lat"] is not None and e["method"] != "manual" and e["confidence"] != "high"                     and haversine_km(e["lat"], e["lon"], *z) > 100:
                reject(e, f"over 100 km from planning zone {p['zone']}")
        located = [e for e in pts if e["lat"] is not None]
        if len(located) == 2 and not plausible_length(p, located):
            reject(min(reversed(located), key=lambda e: (e["method"] == "manual", rank[e["confidence"]])),
                   "implausibly far from the other endpoint")
            located = [e for e in pts if e["lat"] is not None]
        if len(located) >= 2:
            p["geometry"] = {"type": "LineString", "coordinates": [[e["lon"], e["lat"]] for e in located]}
        elif located:
            p["geometry"] = {"type": "Point", "coordinates": [located[0]["lon"], located[0]["lat"]]}
        else:
            p["geometry"] = None
        # A project is only as trustworthy as its weakest endpoint; a missing endpoint caps it at "medium".
        worst = min((e["confidence"] for e in located), key=rank.get, default="none")
        if located and len(located) < len(pts) and worst == "high":
            worst = "medium"
        p["location_confidence"] = worst
    return projects


if __name__ == "__main__":
    idx = build_index()
    desc = json.loads((PROC / "desc_projects.json").read_text())
    gpc = json.loads((PROC / "gpc_projects.json").read_text())
    allp = geocode(desc, idx) + geocode(gpc, idx)
    (PROC / "projects_geo.json").write_text(json.dumps(allp, indent=1))
    for code in ("DESC", "GPC", "GTC", "MEAG", "DU"):
        ps = [p for p in allp if p["utility_code"] == code]
        print(f"{code}: {len(ps)} projects, {sum(1 for p in ps if p['geometry'])} located, "
              f"{sum(1 for p in ps if p['location_confidence'] in ('high', 'medium'))} medium+ confidence")
