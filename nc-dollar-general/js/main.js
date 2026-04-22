/* main.js — loads data, aggregates, initialises both visualisations */
(function () {
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
    "Place Poverty Rate %",
    "County Stores per 10,000",
    "Adjusted County Density (excl. Place)",
    "County Poverty Rate %",
    "Place Population",
    "Place Store Count",
    "Latitude",
    "Longitude",
  ];

  /* ------------------------------------------------------------------ */
  /* Load all assets in parallel                                         */
  /* ------------------------------------------------------------------ */
  Promise.all([
    d3.csv("data/nc_dg_data.csv"),
    d3.json("data/nc_counties.json"),
    d3.json("data/nc_places.json"),
  ])
    .then(([rawRows, countiesGeo, placesGeo]) => {

      /* Parse numerics */
      rawRows.forEach(r => {
        NUM_COLS.forEach(col => { r[col] = +r[col]; });
      });

      /* --- Per-place deduplication ----------------------------------- */
      const placeMap = new Map();
      rawRows.forEach(r => {
        const key = r.City.trim();
        if (placeMap.has(key)) return;
        placeMap.set(key, {
          city:             key,
          tigerName:        NAME_FIXES[key] || key,
          county:           r.County.trim(),
          lat:              r.Latitude,
          lng:              r.Longitude,
          classification:   r["Place Classification"],
          storesPerTenK:    r["Place Stores per 10,000"],
          adjCountyDensity: r["Adjusted County Density (excl. Place)"],
          placePoverty:     r["Place Poverty Rate %"],
          countyPoverty:    r["County Poverty Rate %"],
          countyStoresPer10k: r["County Stores per 10,000"],
          overSaturated:    r["Place Density > Adjusted County Density"] === "Yes",
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

      /* Expose globally for debugging */
      window.AppData = { placeData, countyData, countiesGeo, placesGeo };

      /* Boot both visualisations */
      initMap(placeData, countyData, countiesGeo, placesGeo);
      initScatterplot(placeData);
    })
    .catch(err => {
      console.error("Data load error:", err);
      const p = document.createElement("p");
      p.className = "load-error";
      p.textContent = "Could not load visualisation data. Please refresh the page.";
      document.querySelector("main").prepend(p);
    });
})();
