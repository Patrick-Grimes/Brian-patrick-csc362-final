# Draft revisions to paste into the CSC 362 final draft

These paragraphs replace the corresponding sections of `CSC 362 Final Brian +
Patrick Draft 1-2.pdf`. Drop them into the source authoring tool (Google Doc,
Word, etc.) and re-export the PDF.

Two methodology sections changed: rural/urban classification and the
saturation-comparison metric. Everything else in the draft stays as-is.

---

## Replacement for Section 1, "Classification Logic" (the bullet around
## "Rural: population < 5,000 / Urban: population >= 5,000")

**3. Classification Logic.** Place locations are classified using a strict
Rural/Urban dichotomy anchored to each place's **urban-population share**
from the U.S. Census Bureau 2020 Decennial Demographic and Housing
Characteristics File (DHC), Table P2 ("Urban and Rural"). For every named
place, the Census Bureau publishes both the total population and the share
of that population living inside a Census-defined Urban Area. We use that
share directly:

- **Urban:** `urban_share >= 51%` (a simple majority of the place's residents
  live in a Census Urban Area).
- **Rural:** otherwise.

Why a *share*, not a raw population threshold? A place such as Richmond, NC
might span 24 census tracts; if 90% of those tracts happen to be classified
as rural but they only contain 2% of the place's population, calling
Richmond "90% rural" is misleading. A population-weighted share avoids that
artefact and matches the geographic logic Dollar General actually uses when
siting stores: the company opens stores where people are, not where empty
tracts are. The 51% cutoff is documented inline on the visualisation and
exposed as the constant `URBAN_SHARE_THRESHOLD` in `nc-dollar-general/js/main.js`,
so changing the rule is a one-line edit. Future iterations could replace the
simple share with an area-weighted variant (e.g. Census 2020 urban-area land
share) without disturbing the rest of the pipeline.

The DHC place-share methodology aligns with the rest of our data pipeline:
poverty data (ACS Table S1701) and TIGER place boundaries are also at the
**place** level, so the classifier, the poverty rate, and the geographic
boundary all measure the same unit. By contrast, the older USDA
Rural-Urban Commuting Area (RUCA) codes operate at the census tract level
and do not align with any of the three.

---

## Replacement for Section 1, attribute description of
## "Place Density > Adjusted County Density"

**Place Density Gap (vs. Adjusted County Density) and Statewide Percentile.**
For every place we compute:

```
gap = (Place Stores per 10,000) − (Adjusted County Density excl. Place)
```

When this number is positive, the place is more saturated with Dollar General
stores than the surrounding non-place portion of its county. The *previous*
version of the dataset published this comparison as a Yes/No flag, but in
practice 453 of 474 unique NC places (≈ 96%) had `Yes` — the binary conveyed
almost no information once placed on the map. We replaced it with a
**within-North-Carolina percentile** of the gap. A place at the 87th
statewide percentile, for example, has a place-vs-county density gap larger
than 87% of all NC places with at least one Dollar General. The popup also
shows the signed gap (e.g. `+0.42/10k`) so the reader sees both the
magnitude and the rank, not just the direction.

The percentile is computed in `nc-dollar-general/js/main.js` once at load
time using a sort + binary-search rank, and is rendered in the map tooltip,
the click popup (with a horizontal gradient bar), and in the per-pin
`aria-label` so screen-reader users hear a meaningful magnitude rather than
"Yes" 96% of the time.

---

## Optional update for Section "Methodology" / formulas

Add a fourth bullet under the existing Density formulas:

- **Place Density Gap:** `Place Stores per 10,000 − Adjusted County Density (excl. Place)`
- **Statewide Gap Percentile:** rank of `Place Density Gap` among all NC
  Dollar General places, expressed 0..100. Higher percentile = more
  over-saturated relative to the rest of NC.

---

## Optional update to the data-source bullet list

Add to the list of data sources:

- **U.S. Census Bureau, Decennial 2020 DHC, Table P2 ("Urban and Rural"):**
  per-place urban and rural population, used to compute each place's urban
  share. Pulled via the Census API endpoint
  `https://api.census.gov/data/2020/dec/dhc?get=NAME,P2_001N,P2_002N,P2_003N&for=place:*&in=state:37`
  and merged into the canonical CSV by the script
  `nc-dollar-general/data/build/fetch_urban_share.py`.
