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
  ])
    .then(([rawRows, rawCountiesGeo, rawPlacesGeo]) => {
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
          placePoverty:     r["Place Poverty Rate %"],
          countyPoverty:    r["County Poverty Rate %"],
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

      /* --- Statewide percentile of the place-vs-adjusted-county gap --- */
      /* The old "Place Density > Adjusted County Density" Yes/No flag    */
      /* was Yes for 95% of places and conveyed almost no signal. We      */
      /* replace it with a within-NC percentile so the magnitude of the   */
      /* gap, not just its direction, is what users see.                  */
      placeData.forEach(d => {
        d.gap = d.storesPerTenK - d.adjCountyDensity;
      });
      const sortedGaps = placeData.map(d => d.gap).sort((a, b) => a - b);
      const lastIdx = Math.max(1, sortedGaps.length - 1);
      placeData.forEach(d => {
        let lo = 0, hi = sortedGaps.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (sortedGaps[mid] < d.gap) lo = mid + 1; else hi = mid;
        }
        d.gapPercentile = lo / lastIdx;
      });

      /* Expose globally for debugging */
      window.AppData = { placeData, countyData, countiesGeo, placesGeo };

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
