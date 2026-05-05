# NC Dollar General saturation — CSC 362 final

Interactive static visualizations exploring Dollar General store density and poverty in North Carolina, using ACS 2023 5-year census-style geography and a location dataset derived from SimpleMaps.

## View locally

From the repo root, serve the `nc-dollar-general/` folder with any static HTTP server (opening `index.html` as a `file://` URL may block loading CSV/JSON in some browsers):

```bash
cd nc-dollar-general
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html`.

## Data

- Place and county fields: `nc-dollar-general/data/nc_dg_data.csv`
- County and place GeoJSON: `nc-dollar-general/data/nc_counties.json`, `nc_places.json`
- Reference poverty rates (NC / US): `nc-dollar-general/data/reference_rates.json`

## Tutorial images (optional)

To show screenshots inside **Help → Visual walkthrough**, add PNGs under:

`nc-dollar-general/img/tutorial/`

| Filename | Suggested content |
|----------|-------------------|
| `01-map-zoom.png` | Map with zoom controls and county shading |
| `02-markers.png` | Zoomed map with numeric place markers |
| `03-compare-panel.png` | Right-hand comparison panel with bars |

If a file is missing, the dialog shows a short “add this file” note for that step.

## Authors

Patrick Grimes & Brian — CSC 362 Data Visualization.

## Tools

Some development and editing assistance used **Cursor** (AI-assisted editing).
