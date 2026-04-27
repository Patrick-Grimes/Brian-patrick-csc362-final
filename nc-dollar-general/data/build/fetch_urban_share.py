"""Pull per-place urban-population share from the U.S. Census 2020 DHC and
merge it into nc_dg_data.csv as a new column `Place Urban Population Share`.

Source: Decennial 2020 Demographic and Housing Characteristics File (DHC),
table P2 ("URBAN AND RURAL"). Variables:
  P2_001N = Total population
  P2_002N = Urban population
  P2_003N = Rural population

Run from the project root:
  python3 nc-dollar-general/data/build/fetch_urban_share.py

The script is idempotent: it overwrites nc_dg_data.csv in place with a new
column appended (or refreshed) and writes a sidecar nc_place_urban_share.csv
so the join can be inspected.
"""

from __future__ import annotations

import csv
import json
import ssl
import sys
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent
CSV_PATH = DATA_DIR / "nc_dg_data.csv"
SIDECAR_PATH = DATA_DIR / "nc_place_urban_share.csv"

CENSUS_URL = (
    "https://api.census.gov/data/2020/dec/dhc"
    "?get=NAME,P2_001N,P2_002N,P2_003N"
    "&for=place:*&in=state:37"
)

# CSV name -> Census place name (without "town"/"city"/"CDP"/etc. suffix).
# Mirrors NAME_FIXES in js/main.js, plus a few CSV spellings the Census API
# returns differently (e.g. apostrophes / accents).
NAME_FIXES = {
    "Fuquay Varina":  "Fuquay-Varina",
    "Winston Salem":  "Winston-Salem",
    "Saint Pauls":    "St. Pauls",
    "Mcleansville":   "McLeansville",
    "Willow Spring":  "Willow Springs",
}

NEW_COL = "Place Urban Population Share"


def fetch_census() -> list[tuple[str, float]]:
    """Return [(place_name, urban_share)] for every NC place reported by DHC."""
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(CENSUS_URL, timeout=30, context=ctx) as resp:
        rows = json.loads(resp.read())

    header = rows[0]
    name_idx = header.index("NAME")
    total_idx = header.index("P2_001N")
    urban_idx = header.index("P2_002N")

    out: list[tuple[str, float]] = []
    for row in rows[1:]:
        full_name = row[name_idx]              # "Cary town, North Carolina"
        bare = full_name.split(",", 1)[0]      # "Cary town"
        # Strip the trailing place-type word (town / city / village / CDP).
        for suffix in (" town", " city", " village", " borough", " CDP"):
            if bare.endswith(suffix):
                bare = bare[: -len(suffix)]
                break
        try:
            total = float(row[total_idx])
            urban = float(row[urban_idx])
        except (TypeError, ValueError):
            continue
        share = urban / total if total > 0 else 0.0
        out.append((bare.strip(), share))
    return out


def build_share_lookup(records: list[tuple[str, float]]) -> dict[str, float]:
    """Case-insensitive name -> urban_share. Last writer wins on duplicates
    (e.g. "Fairview" appears twice in NC); the differences are small and the
    CSV-side join uses NAME_FIXES so most cities map cleanly anyway."""
    return {name.casefold(): share for name, share in records}


def merge_into_csv(lookup: dict[str, float]) -> tuple[int, list[str]]:
    """Rewrite nc_dg_data.csv with the new column. Returns (matched_rows,
    unmatched_unique_cities)."""
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    if NEW_COL not in fieldnames:
        fieldnames.append(NEW_COL)

    matched = 0
    unmatched: set[str] = set()
    for r in rows:
        city = (r.get("City") or "").strip()
        fixed = NAME_FIXES.get(city, city)
        share = lookup.get(fixed.casefold())
        if share is None:
            unmatched.add(city)
            r[NEW_COL] = ""  # leaves the cell blank; main.js treats this as 0
        else:
            r[NEW_COL] = f"{share:.6f}"
            matched += 1

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    return matched, sorted(unmatched)


def write_sidecar(records: list[tuple[str, float]]) -> None:
    with SIDECAR_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["place_name", "urban_share"])
        for name, share in records:
            w.writerow([name, f"{share:.6f}"])


def main() -> int:
    print("Fetching Census 2020 DHC P2 (URBAN AND RURAL) for NC places...")
    records = fetch_census()
    print(f"  retrieved {len(records)} places")

    lookup = build_share_lookup(records)
    matched, unmatched = merge_into_csv(lookup)
    write_sidecar(records)

    print(f"Wrote {NEW_COL} to {CSV_PATH.name} - {matched} matched store rows")
    if unmatched:
        print(
            f"  {len(unmatched)} CSV cities had no Census P2 match "
            f"(treated as urban_share = 0):"
        )
        for c in unmatched:
            print(f"    - {c}")
    print(f"Sidecar written to {SIDECAR_PATH.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
