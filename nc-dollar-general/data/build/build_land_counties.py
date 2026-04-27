"""Build land-only North Carolina county GeoJSON for the choropleth map.

The Census TIGER county boundary includes county water area, which causes
Pamlico Sound, Albemarle Sound, and coastal ocean areas to be filled as part
of the county choropleth. This script subtracts TIGER AREAWATER polygons from
each NC county, then writes the app's existing `nc_counties.json` contract:

  Feature.properties.name = county name without " County"
  Feature.properties.fips = five-digit county FIPS
  Feature.id              = five-digit county FIPS

Run from the project root:
  python3 nc-dollar-general/data/build/build_land_counties.py

Requires:
  python3 -m pip install shapely pyshp
"""

from __future__ import annotations

import json
import ssl
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

try:
    import shapefile
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
    from shapely.validation import make_valid
except ImportError as exc:  # pragma: no cover - user-facing dependency check
    raise SystemExit(
        "Missing dependency. Run: python3 -m pip install shapely pyshp"
    ) from exc


DATA_DIR = Path(__file__).resolve().parent.parent
OUT_PATH = DATA_DIR / "nc_counties.json"

TIGER_YEAR = "2023"
STATE_FIPS = "37"
COUNTY_URL = (
    f"https://www2.census.gov/geo/tiger/TIGER{TIGER_YEAR}/COUNTY/"
    f"tl_{TIGER_YEAR}_us_county.zip"
)
AREAWATER_URL = (
    f"https://www2.census.gov/geo/tiger/TIGER{TIGER_YEAR}/AREAWATER/"
    f"tl_{TIGER_YEAR}_{{geoid}}_areawater.zip"
)

# About 11 meters in latitude. This keeps coastal detail while avoiding a very
# large JSON payload for a static class-project site.
SIMPLIFY_TOLERANCE = 0.0001
COORD_PRECISION = 5
CACHE_DIR = Path(tempfile.gettempdir()) / "nc_land_counties_cache"

# Subtract major water bodies, not every pond or creek. Tiny holes explode the
# output size without changing what users can perceive at this map scale.
MIN_WATER_AREA = 0.0005


def download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return

    ctx = ssl.create_default_context()
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/zip,application/octet-stream,*/*",
    }
    for attempt in range(1, 6):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60, context=ctx) as response:
                dest.write_bytes(response.read())
            return
        except Exception:
            if attempt == 5:
                raise
            time.sleep(2 * attempt)


def unzip(zip_path: Path, dest: Path) -> Path:
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dest)
    shp_files = list(dest.glob("*.shp"))
    if not shp_files:
        raise RuntimeError(f"No shapefile found in {zip_path.name}")
    return shp_files[0]


def read_nc_counties(workdir: Path) -> list[dict[str, Any]]:
    zip_path = workdir / "counties.zip"
    extract_dir = workdir / "counties"
    download(COUNTY_URL, zip_path)
    shp_path = unzip(zip_path, extract_dir)

    out: list[dict[str, Any]] = []
    reader = shapefile.Reader(str(shp_path))
    for shape_record in reader.iterShapeRecords():
        record = shape_record.record.as_dict()
        if record["STATEFP"] != STATE_FIPS:
            continue
        geoid = record["GEOID"]
        name = record["NAME"]
        geom = make_valid(shape(shape_record.shape.__geo_interface__))
        out.append({"geoid": geoid, "name": name, "geometry": geom})

    out.sort(key=lambda item: item["name"])
    return out


def read_county_water(geoid: str, workdir: Path) -> Any:
    zip_path = workdir / f"{geoid}_areawater.zip"
    extract_dir = workdir / f"{geoid}_areawater"
    download(AREAWATER_URL.format(geoid=geoid), zip_path)
    shp_path = unzip(zip_path, extract_dir)

    reader = shapefile.Reader(str(shp_path))
    water_parts = []
    for shape_record in reader.iterShapeRecords():
        geom = make_valid(shape(shape_record.shape.__geo_interface__))
        if geom.area >= MIN_WATER_AREA:
            water_parts.append(geom)
    if not water_parts:
        return None
    return unary_union(water_parts)


def round_coordinates(value: Any) -> Any:
    if isinstance(value, float):
        return round(value, COORD_PRECISION)
    if isinstance(value, list):
        return [round_coordinates(item) for item in value]
    if isinstance(value, tuple):
        return [round_coordinates(item) for item in value]
    return value


def to_feature(county: dict[str, Any], land_geom: Any) -> dict[str, Any]:
    geom_json = mapping(land_geom)
    geom_json["coordinates"] = round_coordinates(geom_json["coordinates"])
    return {
        "type": "Feature",
        "geometry": geom_json,
        "properties": {
            "name": county["name"],
            "fips": county["geoid"],
        },
        "id": county["geoid"],
    }


def build_features() -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    counties = read_nc_counties(CACHE_DIR)
    print(f"Loaded {len(counties)} NC county polygons")

    for i, county in enumerate(counties, start=1):
        geoid = county["geoid"]
        water = read_county_water(geoid, CACHE_DIR)
        land = county["geometry"] if water is None else county["geometry"].difference(water)
        land = make_valid(land)
        land = land.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
        if land.is_empty:
            raise RuntimeError(f"{county['name']} produced empty land geometry")

        features.append(to_feature(county, land))
        print(f"  {i:3d}/{len(counties)} {county['name']}")
        time.sleep(0.25)

    return features


def main() -> int:
    features = build_features()
    output = {
        "type": "FeatureCollection",
        "features": features,
    }
    OUT_PATH.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(features)} land-only county features to {OUT_PATH}")
    print(f"File size: {OUT_PATH.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
