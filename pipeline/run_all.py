"""Run the whole pipeline: parse PDFs -> geocode -> overlaps -> web/data.js."""
import runpy
from pathlib import Path

HERE = Path(__file__).resolve().parent

for stage in ("parse_projects.py", "geocode.py", "overlaps.py"):
    print(f"\n=== {stage}")
    runpy.run_path(str(HERE / stage), run_name="__main__")
