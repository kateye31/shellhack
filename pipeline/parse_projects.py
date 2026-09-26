"""Stage 1: parse the two utility PDFs into structured project tables.

Outputs data/processed/desc_projects.json and data/processed/gpc_projects.json.
"""
import json
import re
from datetime import datetime
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "Project Listings"
OUT = ROOT / "data" / "processed"
DESC_PDF = RAW / "Dominion Energy" / "2024-2028-2million-and-above-project-descriptions.pdf"
GPC_PDF = RAW / "Georgia Power" / "2025 IRP Volume 3 PUBLIC DISCLOSURE.pdf"

# GA ITS sponsors. SAV = the former Savannah Electric, now part of Georgia Power.
SPONSOR_UTILITY = {
    "GPC": "Georgia Power",
    "SAV": "Georgia Power",
    "GTC": "Georgia Transmission Corp",
    "MEAG": "MEAG Power",
    "DU": "Dalton Utilities",
}


def parse_date(s):
    s = s.strip()
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def money(s):
    return int(s.replace("$", "").replace(",", ""))


def section(text, start, end):
    m = re.search(re.escape(start) + r"\n(.*?)\n" + re.escape(end), text, re.S)
    return " ".join(m.group(1).split()) if m else ""


def parse_desc():
    projects = []
    with pdfplumber.open(DESC_PDF) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            head = re.search(r"5 Year Budget\n(.*?)\nProject ID\n(.*?)\n", t, re.S)
            if not head:
                continue
            costs = re.search(r"Previous 2024 2025 2026 2027 2028 Total\*\n(.*?)\n", t)
            yearly = [money(v) for v in costs.group(1).split()] if costs else []
            status = section(t, "Project Status", "Planned In-Service Date")
            isd = re.search(r"Planned In-Service Date\n(\S+)", t)
            projects.append({
                "source_id": head.group(2).strip(),
                "name": " ".join(head.group(1).split()),
                "description": section(t, "Project Description", "Project Need"),
                "need": section(t, "Project Need", "Project Status"),
                "status": status,
                "in_service": parse_date(isd.group(1)) if isd else None,
                "cost_usd": yearly[-1] if yearly else None,
                "spend_by_year": dict(zip(["prev", "2024", "2025", "2026", "2027", "2028"], yearly[:-1])),
                "source_page": page.page_number,
            })
    for i, p in enumerate(projects, 1):
        p["id"] = f"DESC-{i:02d}"
        p["utility"] = "Dominion Energy South Carolina"
        p["utility_code"] = "DESC"
        p["state"] = "SC"
    return projects


ROW = re.compile(r"^(2\d\d) (20\d\d) (\d{5}) (.*?) ?(\d{1,2}/\d{1,2}/\d{4}) (GPC|SAV|GTC|MEAG|DU) REDACTED")


def parse_gpc():
    with pdfplumber.open(GPC_PDF) as pdf:
        pages = [(pg.page_number, pg.extract_text() or "") for pg in pdf.pages]

    # Table 2: the master project list (zone, sponsor, need date).
    rows, current, in_table = [], None, False
    for num, text in pages:
        if "Table 2 Georgia ITS 10 Year Plan Project List" in text:
            in_table = True
        if in_table and "B. Cancelled Projects List" in text:
            break
        if not in_table:
            continue
        for line in text.splitlines():
            m = ROW.match(line)
            if m:
                current = {"zone": m.group(1), "teams": m.group(3), "name": m.group(4),
                           "need_date": parse_date(m.group(5)), "sponsor": m.group(6), "table_page": num}
                rows.append(current)
            elif current and line.isupper() and "REDACTED" not in line and not line.startswith(("PUBLIC", "CRITICAL")):
                current["name"] += " " + line.strip()
            else:
                current = None if not line.isupper() else current

    # Detail pages: start date + description, keyed by TEAMS number.
    details = {}
    for num, text in pages:
        m = re.search(r"\n(.+)\nTeams # (\d+)\nNeed Date (\S+) Start Date (\S+)\nDescription\n(.*?)\nSupporting Statement", text, re.S)
        if m:
            # Title sits between the CEII banner (ends "employees.") and "Teams #".
            title = re.split(r"employees\.\n|PUBLIC DISCLOSURE\n", m.group(1))[-1]
            details[m.group(2)] = {
                "title": " ".join(title.split()), "start": parse_date(m.group(4)),
                "description": " ".join(m.group(5).split()), "detail_page": num,
                "detail_need": parse_date(m.group(3)),
            }

    projects = []
    for r in rows:
        d = details.get(r["teams"], {})
        projects.append({
            "id": f"GA-{r['teams']}",
            "source_id": r["teams"],
            "name": d.get("title") or r["name"],
            "description": d.get("description", ""),
            "sponsor": r["sponsor"],
            "utility": SPONSOR_UTILITY[r["sponsor"]],
            "utility_code": "GPC" if r["sponsor"] in ("GPC", "SAV") else r["sponsor"],
            "state": "GA",
            "zone": r["zone"],
            "in_service": d.get("detail_need") or r["need_date"],
            "start": d.get("start"),
            "status": "Planned",
            "cost_usd": None,  # redacted in the public filing
            "source_page": d.get("detail_page") or r["table_page"],
        })
    return projects


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    desc = parse_desc()
    gpc = parse_gpc()
    (OUT / "desc_projects.json").write_text(json.dumps(desc, indent=1))
    (OUT / "gpc_projects.json").write_text(json.dumps(gpc, indent=1))
    print(f"DESC: {len(desc)} projects")
    print(f"GA ITS: {len(gpc)} projects, {sum(1 for p in gpc if p['description'])} with detail pages")
