/* main.js — loads data, aggregates, initialises both visualisations */
(function () {
  /* ------------------------------------------------------------------ */
  /* Rural vs Urban classifier                                           */
  /*                                                                     */
  /* A place is classified URBAN if at least URBAN_SHARE_THRESHOLD of    */
  /* its 2020 Census population lives in a Census-defined Urban Area     */
  /* (Decennial DHC table P2). Otherwise the place is RURAL. To change   */
  /* the rule, edit this single number — the rest of the visualisation   */
  /* re-derives from `classifyPlace(urbanShare)`.                        */
  /* ------------------------------------------------------------------ */
  const URBAN_SHARE_THRESHOLD = 0.51;
  const classifyPlace = share =>
    share >= URBAN_SHARE_THRESHOLD ? "Urban" : "Rural";

  /* ------------------------------------------------------------------ */
  /* City-name fixes: CSV spelling → TIGER place-boundary spelling       */
  /* ------------------------------------------------------------------ */
  const NAME_FIXES = {
    "Fuquay Varina":  "Fuquay-Varina",
    "Winston Salem":  "Winston-Salem",
    "Saint Pauls":    "St. Pauls",
    "Mcleansville":   "McLeansville",
    "Willow Spring":  "Willow Springs",
  };

  /* ------------------------------------------------------------------ */
  /* Shared application state — used by map ↔ scatterplot linkage        */
  /* ------------------------------------------------------------------ */
  window.AppState = {
    onScatterHighlight: null,  // set by scatterplot.js; called by map
    onMapHighlight:     null,  // set by map.js; called by scatterplot
    lastCompareSelection: null, // current place in compare panel — set by compareChart.js
  };

  /* ------------------------------------------------------------------ */
  /* Numeric columns to coerce                                           */
  /* ------------------------------------------------------------------ */
  const NUM_COLS = [
    "Place Stores per 10,000",
    "County Stores per 10,000",
    "Adjusted County Density (excl. Place)",
    "Place Population",
    "Place Store Count",
    "Place Urban Population Share",
    "Latitude",
    "Longitude",
  ];

  /** Blank or non-numeric CSV cells become null; literal 0 stays 0. */
  function parseOptionalNumber(raw) {
    if (raw == null || raw === "") return null;
    const t = String(raw).trim();
    if (t === "") return null;
    const n = +t;
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Poverty rate for the county remainder after removing this place:
   * (county below poverty − place below poverty) / (county pop − place pop).
   * Null when inputs are missing or inconsistent.
   */
  function adjustedCountyPovertyFromRow(r) {
    const cPop = r["County Total Population (ACS 2023)"];
    const pPop = r["Place Population"];
    const cPov = r["County Poverty Count (ACS 2023)"];
    const pPov = r["Place Poverty Count"];
    if (
      cPop == null || pPop == null || cPov == null || pPov == null ||
      !Number.isFinite(cPop) || !Number.isFinite(pPop) ||
      !Number.isFinite(cPov) || !Number.isFinite(pPov)
    ) {
      return null;
    }
    const den = cPop - pPop;
    if (den <= 0) return null;
    const num = cPov - pPov;
    if (num < 0 || num > den) return null;
    const rate = num / den;
    return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : null;
  }

  function ringArea(ring) {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      area += (x1 * y2) - (x2 * y1);
    }
    return area / 2;
  }

  function rewindPolygon(polygon) {
    return polygon.map((ring, i) => {
      const shouldBeClockwise = i === 0;
      const isClockwise = ringArea(ring) < 0;
      return shouldBeClockwise === isClockwise ? ring : ring.slice().reverse();
    });
  }

  function rewindFeatureCollection(fc) {
    return {
      ...fc,
      features: fc.features.map(feature => {
        const geometry = feature.geometry;
        if (!geometry) return feature;

        let nextCoordinates = geometry.coordinates;
        if (geometry.type === "Polygon") {
          nextCoordinates = rewindPolygon(geometry.coordinates);
        } else if (geometry.type === "MultiPolygon") {
          nextCoordinates = geometry.coordinates.map(rewindPolygon);
        }

        return {
          ...feature,
          geometry: {
            ...geometry,
            coordinates: nextCoordinates,
          },
        };
      }),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Load all assets in parallel                                         */
  /* ------------------------------------------------------------------ */
  Promise.all([
    d3.csv("data/nc_dg_data.csv"),
    d3.json("data/nc_counties.json"),
    d3.json("data/nc_places.json"),
    d3.json("data/reference_rates.json").catch(() => ({
      vintage: "2023 ACS 5-year",
      table: "S1701_C03_001E — percent below poverty level",
      ncPercentBelowPoverty: 13.2,
      usPercentBelowPoverty: 12.4,
    })),
  ])
    .then(([rawRows, rawCountiesGeo, rawPlacesGeo, referenceRates]) => {
      const countiesGeo = rewindFeatureCollection(rawCountiesGeo);
      const placesGeo   = rewindFeatureCollection(rawPlacesGeo);

      /* Parse numerics — coerce empty strings to 0 so unmatched places
         (no Census P2 record) fall through to "Rural" as expected. */
      rawRows.forEach(r => {
        NUM_COLS.forEach(col => {
          const raw = r[col];
          r[col] = raw === "" || raw == null ? 0 : +raw;
        });
        r["Place Poverty Rate %"] = parseOptionalNumber(r["Place Poverty Rate %"]);
        r["County Poverty Rate %"] = parseOptionalNumber(r["County Poverty Rate %"]);
        r["County Total Population (ACS 2023)"] = parseOptionalNumber(
          r["County Total Population (ACS 2023)"]
        );
        r["Place Poverty Count"] = parseOptionalNumber(r["Place Poverty Count"]);
        r["County Poverty Count (ACS 2023)"] = parseOptionalNumber(
          r["County Poverty Count (ACS 2023)"]
        );
      });

      /* --- Per-place deduplication ----------------------------------- */
      const placeMap = new Map();
      rawRows.forEach(r => {
        const key = r.City.trim();
        if (placeMap.has(key)) return;
        const urbanShare = r["Place Urban Population Share"] || 0;
        placeMap.set(key, {
          city:             key,
          tigerName:        NAME_FIXES[key] || key,
          county:           r.County.trim(),
          lat:              r.Latitude,
          lng:              r.Longitude,
          urbanShare,
          classification:   classifyPlace(urbanShare),
          storesPerTenK:    r["Place Stores per 10,000"],
          adjCountyDensity: r["Adjusted County Density (excl. Place)"],
          placePoverty:       r["Place Poverty Rate %"],
          countyPoverty:      r["County Poverty Rate %"],
          adjCountyPoverty:   adjustedCountyPovertyFromRow(r),
          countyStoresPer10k: r["County Stores per 10,000"],
          storeCount:       r["Place Store Count"],
          population:       r["Place Population"],
        });
      });

      /* --- Per-county deduplication ---------------------------------- */
      const countyMap = new Map();
      rawRows.forEach(r => {
        const key = r.County.trim();
        if (countyMap.has(key)) return;
        countyMap.set(key, {
          county:       key,
          storesPerTenK: r["County Stores per 10,000"],
          povertyRate:  r["County Poverty Rate %"],
        });
      });

      const placeData  = Array.from(placeMap.values())
        .filter(d => isFinite(d.lat) && isFinite(d.lng));
      const countyData = Object.fromEntries(countyMap);

      /* --- Place-vs-adjusted-county store density gap ----------------- */
      placeData.forEach(d => {
        d.gap = d.storesPerTenK - d.adjCountyDensity;
      });

      /* Expose globally for debugging */
      window.AppData = { placeData, countyData, countiesGeo, placesGeo };

      const ncEl = document.getElementById("header-nc-poverty-pct");
      const usEl = document.getElementById("header-us-poverty-pct");
      if (referenceRates && ncEl && usEl) {
        const ncPct = referenceRates.ncPercentBelowPoverty;
        const usPct = referenceRates.usPercentBelowPoverty;
        ncEl.textContent =
          ncPct != null && Number.isFinite(+ncPct) ? `${+ncPct}%` : "—";
        usEl.textContent =
          usPct != null && Number.isFinite(+usPct) ? `${+usPct}%` : "—";
      }

      /* Boot all three visualisations. compareChart must be initialised
         BEFORE the map so window.AppState.renderCompareChart exists when
         the user clicks a marker. */
      initCompareChart(placeData);
      initMap(placeData, countyData, countiesGeo, placesGeo);
      initScatterplot(placeData);
      initRuralPovertySummary(placeData);
    })
    .catch(err => {
      console.error("Data load error:", err);
      const p = document.createElement("p");
      p.className = "load-error";
      p.textContent = "Could not load visualisation data. Please refresh the page.";
      document.querySelector("main").prepend(p);
    });
})();
