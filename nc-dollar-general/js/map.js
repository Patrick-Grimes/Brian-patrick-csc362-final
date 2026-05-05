/* map.js — interactive choropleth map with three-zone hover. Marker
   clicks delegate to compareChart.js (right-side comparison panel). */
function initMap(placeData, countyData, countiesGeo, placesGeo) {

  /* ------------------------------------------------------------------ */
  /* Place-vs-county gap formatting                                      */
  /*                                                                     */
  /* Each place carries `gap` (place stores/10k − adj. county stores/10k) */
  /* and `gapPercentile` (0..1, share of NC places ranking at-or-below). */
  /* Both are computed in main.js. Helpers below render them consistently */
  /* in the hover tooltip and aria-label; the right-side comparison panel */
  /* uses its own copies in compareChart.js.                              */
  /* ------------------------------------------------------------------ */
  const ordinal = n => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const formatGap = d => {
    const sign = d.gap >= 0 ? "+" : "−";
    return `${sign}${Math.abs(d.gap).toFixed(2)}/10k`;
  };
  const formatPercentile = d =>
    `${ordinal(Math.round(d.gapPercentile * 100))} statewide percentile`;
  const formatPovertyPct = v =>
    v == null || !Number.isFinite(v) ? "N/A" : `${(v * 100).toFixed(1)}%`;

  /* ------------------------------------------------------------------ */
  /* Dimensions                                                          */
  /* ------------------------------------------------------------------ */
  const frame   = document.getElementById("map-frame");
  const W       = frame.clientWidth  || 700;
  const H       = Math.round(W * 0.42);

  /* ------------------------------------------------------------------ */
  /* Color scale: yellow → dark red (county density)                     */
  /* ------------------------------------------------------------------ */
  const densityValues = Object.values(countyData).map(d => d.storesPerTenK);
  const maxDensity    = d3.max(densityValues);
  const colorScale    = d3.scaleSequential()
    .domain([0, maxDensity])
    .interpolator(d3.interpolateYlOrRd);

  /* ------------------------------------------------------------------ */
  /* Projection & path generator                                         */
  /* ------------------------------------------------------------------ */
  /* Mercator keeps NC visually level (no diagonal tilt). At state scale
     Mercator's distortion is negligible, and unlike geoAlbersUsa it does
     not rotate the bounding rectangle of NC. */
  const projection = d3.geoMercator().fitSize([W, H], countiesGeo);
  const pathGen    = d3.geoPath().projection(projection);

  /* ------------------------------------------------------------------ */
  /* SVG setup                                                           */
  /* ------------------------------------------------------------------ */
  const svg = d3.select("#map")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", "100%")
    .attr("height", H);

  /* Zoom-hint overlay */
  const mapFrame = d3.select(".map-frame");
  mapFrame.append("div")
    .attr("class", "zoom-hint")
    .attr("aria-hidden", "true")
    .text("Scroll to zoom — place markers appear at 3×");

  /* ------------------------------------------------------------------ */
  /* Lookup structures                                                   */
  /* ------------------------------------------------------------------ */
  const placeByCity   = new Map(placeData.map(d => [d.city, d]));
  const placeFeatByName = new Map(
    placesGeo.features.map(f => [f.properties.NAME, f])
  );

  /* ------------------------------------------------------------------ */
  /* SVG layer groups (bottom → top z-order)                            */
  /* ------------------------------------------------------------------ */
  const gCountyBase  = svg.append("g").attr("class", "g-county-base");
  const gCountyHL    = svg.append("g").attr("class", "g-county-highlight");
  const gPlaceHL     = svg.append("g").attr("class", "g-place-highlight");
  const gPins        = svg.append("g").attr("class", "g-pins");

  /* ------------------------------------------------------------------ */
  /* Draw county base choropleth                                         */
  /* ------------------------------------------------------------------ */
  gCountyBase.selectAll("path")
    .data(countiesGeo.features)
    .join("path")
    .attr("class", "county-path")
    .attr("d", pathGen)
    .attr("fill", d => {
      const cd = countyData[d.properties.name];
      return cd ? colorScale(cd.storesPerTenK) : "#4b5563";
    })
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.85)
    .attr("tabindex", "0")
    .attr("role", "listitem")
    .attr("aria-label", d => {
      const cd = countyData[d.properties.name];
      if (!cd) return `${d.properties.name} County`;
      return `${d.properties.name} County: ${cd.storesPerTenK.toFixed(2)} stores per 10,000, poverty rate ${formatPovertyPct(cd.povertyRate)}`;
    })
    .on("mouseover", (event, d) => showCountyTooltip(event, d))
    .on("mousemove", (event) => moveTooltip(event, "#map-tooltip"))
    .on("mouseout",  () => hideTooltip("#map-tooltip"))
    .on("focus",     (event, d) => showCountyTooltip(event, d))
    .on("blur",      () => hideTooltip("#map-tooltip"));

  /* ------------------------------------------------------------------ */
  /* Legend                                                              */
  /* ------------------------------------------------------------------ */
  buildLegend(colorScale, maxDensity);

  /* ------------------------------------------------------------------ */
  /* Zoom behaviour                                                      */
  /* ------------------------------------------------------------------ */
  let currentK = 1;

  const zoom = d3.zoom()
    .scaleExtent([1, 20])
    .translateExtent([[0, 0], [W, H]])
    .on("zoom", onZoom);

  svg.call(zoom);

  /* Bottom-left zoom buttons (+ / −) */
  const zoomFactor = 1.35;
  const zoomControls = d3.select("#map-frame")
    .append("div")
    .attr("class", "map-zoom-controls");

  zoomControls
    .append("button")
    .attr("type", "button")
    .attr("class", "map-zoom-btn")
    .attr("aria-label", "Zoom map in")
    .text("+")
    .on("click", (event) => {
      event.stopPropagation();
      svg.transition().duration(150).call(zoom.scaleBy, zoomFactor);
    });

  zoomControls
    .append("button")
    .attr("type", "button")
    .attr("class", "map-zoom-btn")
    .attr("aria-label", "Zoom map out")
    .text("−")
    .on("click", (event) => {
      event.stopPropagation();
      svg.transition().duration(150).call(zoom.scaleBy, 1 / zoomFactor);
    });

  /* County click → zoom (only if pointer barely moved — not a pan) */
  let pointerDownClient = null;
  frame.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      pointerDownClient = { x: e.clientX, y: e.clientY };
    },
    true
  );

  function zoomToCountyFeature(feat) {
    const b = pathGen.bounds(feat);
    const dx = b[1][0] - b[0][0];
    const dy = b[1][1] - b[0][1];
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx < 1e-6 || dy < 1e-6) {
      return;
    }
    const cx = (b[0][0] + b[1][0]) / 2;
    const cy = (b[0][1] + b[1][1]) / 2;
    const pad = 28;
    const innerW = Math.max(1, W - 2 * pad);
    const innerH = Math.max(1, H - 2 * pad);
    const scale = Math.min(
      20,
      Math.max(1, 0.92 / Math.max(dx / innerW, dy / innerH))
    );
    const translate = [W / 2 - scale * cx, H / 2 - scale * cy];
    svg.transition().duration(650).call(
      zoom.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );
  }

  svg.on("click.countyzoom", (event) => {
    const pathEl = event.target.closest?.(".county-path");
    const pd = pointerDownClient;
    pointerDownClient = null;
    if (!pathEl || !pd) return;
    const moved = Math.hypot(event.clientX - pd.x, event.clientY - pd.y);
    if (moved > 8) return;
    zoomToCountyFeature(d3.select(pathEl).datum());
  });

  function onZoom(event) {
    const t = event.transform;
    currentK = t.k;

    gCountyBase.attr("transform", t);
    gCountyHL  .attr("transform", t);
    gPlaceHL   .attr("transform", t);
    gPins      .attr("transform", t);

    /* Scale strokes to stay visually consistent */
    gCountyBase.selectAll(".county-path").attr("stroke-width", 0.85 / t.k);
    gCountyHL  .selectAll("path").attr("stroke-width", 1 / t.k);
    gPlaceHL   .selectAll("path").attr("stroke-width", 1.5 / t.k);

    /* Show/hide zoom hint */
    d3.select(".zoom-hint").classed("hidden", t.k >= 3);

    if (t.k >= 3) {
      updatePins(t);
    } else {
      gPins.selectAll("*").remove();
      clearHighlights();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Place marker pins (visible at zoom ≥ 3)                            */
  /* ------------------------------------------------------------------ */
  function updatePins(transform) {
    /* Determine which places are in the current viewport */
    const inverted = transform.invert([0, 0]);
    const invertedBR = transform.invert([W, H]);
    const x0 = inverted[0] - 20 / transform.k;
    const y0 = inverted[1] - 20 / transform.k;
    const x1 = invertedBR[0] + 20 / transform.k;
    const y1 = invertedBR[1] + 20 / transform.k;

    const visible = placeData.filter(d => {
      const [px, py] = projection([d.lng, d.lat]);
      return px >= x0 && px <= x1 && py >= y0 && py <= y1;
    });

    const pinR       = Math.max(4, 7 / transform.k);
    const fontSize   = Math.max(7, 8 / transform.k);

    const pins = gPins.selectAll("g.pin")
      .data(visible, d => d.city);

    const enter = pins.enter()
      .append("g")
      .attr("class", "pin")
      .attr("tabindex", "0")
      .attr("role", "listitem")
      .attr("aria-label", d =>
        `${d.city}, ${d.county} County. ${d.storeCount} stores. ` +
        `Density: ${d.storesPerTenK.toFixed(2)} per 10,000. ` +
        `Poverty rate: ${formatPovertyPct(d.placePoverty)}. ` +
        `Density gap versus adjusted county: ${formatGap(d)}, ` +
        `${formatPercentile(d)} of all North Carolina places.`
      )
      .on("mouseover", (event, d) => {
        highlightPlace(d);
        showPlaceTooltip(event, d);
      })
      .on("mousemove", (event) => moveTooltip(event, "#map-tooltip"))
      .on("mouseout",  () => {
        clearHighlights();
        hideTooltip("#map-tooltip");
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        if (window.AppState.renderCompareChart) {
          window.AppState.renderCompareChart(d);
        }
      })
      .on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (window.AppState.renderCompareChart) {
            window.AppState.renderCompareChart(d);
          }
        }
      });

    enter.append("circle")
      .attr("fill", "#0891b2")
      .attr("stroke", "#fff");

    enter.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#fff")
      .attr("font-weight", "700")
      .attr("pointer-events", "none");

    const merged = pins.merge(enter);
    merged.attr("transform", d => {
      const [x, y] = projection([d.lng, d.lat]);
      return `translate(${x},${y})`;
    });
    merged.attr("aria-label", d =>
      `${d.city}, ${d.county} County. ${d.storeCount} stores. ` +
      `Density: ${d.storesPerTenK.toFixed(2)} per 10,000. ` +
      `Poverty rate: ${formatPovertyPct(d.placePoverty)}. ` +
      `Density gap versus adjusted county: ${formatGap(d)}, ` +
      `${formatPercentile(d)} of all North Carolina places.`
    );
    merged.select("circle")
      .attr("r", pinR)
      .attr("stroke-width", 0.75 / transform.k);
    merged.select("text")
      .attr("font-size", fontSize)
      .text(d => String(d.storeCount));

    pins.exit().remove();
  }

  /* ------------------------------------------------------------------ */
  /* Spotlight highlight on hover                                        */
  /*                                                                     */
  /* The whole base choropleth dims via a CSS class on gCountyBase, and  */
  /* the hovered place's polygon is redrawn on top at the same density   */
  /* color it would have inherited from its county — so it visually      */
  /* "punches through" the dim layer. A white outline pins the silhouette */
  /* without obscuring the underlying gradient.                          */
  /* ------------------------------------------------------------------ */
  function highlightPlace(d) {
    clearHighlights();

    gCountyBase.classed("dimmed", true);

    const placeFeat = placeFeatByName.get(d.tigerName);
    if (!placeFeat) return;

    const cd = countyData[d.county];
    const fill = cd ? colorScale(cd.storesPerTenK) : "#4b5563";

    gPlaceHL.append("path")
      .attr("d", pathGen(placeFeat))
      .attr("fill", fill)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2 / currentK)
      .attr("stroke-linejoin", "round");
  }

  function clearHighlights() {
    gCountyBase.classed("dimmed", false);
    gCountyHL.selectAll("*").remove();
    gPlaceHL .selectAll("*").remove();
  }

  /* External hook left in place so other modules could trigger a place
     highlight by name; the rural/urban chart no longer uses it. */
  window.AppState.onMapHighlight = (cityName) => {
    if (!cityName) { clearHighlights(); return; }
    const d = placeByCity.get(cityName);
    if (d) highlightPlace(d);
  };

  /* ------------------------------------------------------------------ */
  /* Tooltips                                                            */
  /* ------------------------------------------------------------------ */
  function showCountyTooltip(event, d) {
    const cd = countyData[d.properties.name];
    if (!cd) return;
    const el = document.getElementById("map-tooltip");
    el.style.display = "block";
    el.innerHTML = `
      <div class="tt-title">${d.properties.name} County</div>
      <div class="tt-row"><span class="tt-label">Stores per 10,000 residents</span><span class="tt-value">${cd.storesPerTenK.toFixed(2)}</span></div>
      <div class="tt-row"><span class="tt-label">Poverty rate</span><span class="tt-value">${formatPovertyPct(cd.povertyRate)}</span></div>
    `;
    moveTooltip(event, "#map-tooltip");
  }

  function showPlaceTooltip(event, d) {
    const el = document.getElementById("map-tooltip");
    el.style.display = "block";
    const gapColor = d.gap >= 0 ? "#fca5a5" : "#86efac";
    el.innerHTML = `
      <div class="tt-title">${d.city} <span style="font-weight:400;color:#94a3b8">(${d.county} Co.)</span></div>
      <div class="tt-row"><span class="tt-label">Place density</span><span class="tt-value">${d.storesPerTenK.toFixed(2)} <span style="font-weight:500;color:#cbd5e1">stores per 10,000 residents</span></span></div>
      <div class="tt-row"><span class="tt-label">Adjusted county density</span><span class="tt-value">${d.adjCountyDensity.toFixed(2)} <span style="font-weight:500;color:#cbd5e1">stores per 10,000 residents</span></span></div>
      <div class="tt-row"><span class="tt-label">Place poverty</span><span class="tt-value">${formatPovertyPct(d.placePoverty)}</span></div>
      <div class="tt-row"><span class="tt-label">Gap vs. adjusted county</span><span class="tt-value" style="color:${gapColor}">${formatGap(d)} <span style="font-weight:500;color:#cbd5e1">(difference in stores per 10,000 residents)</span></span></div>
      <div class="tt-row"><span class="tt-label">Statewide gap percentile</span><span class="tt-value">${formatPercentile(d)}</span></div>
      <div class="tt-hint">Click to load this place in the comparison panel</div>
    `;
    moveTooltip(event, "#map-tooltip");
  }

  function moveTooltip(event, selector) {
    const el = document.querySelector(selector);
    if (!el || el.style.display === "none") return;
    const offset = 14;
    let left = event.clientX + offset;
    let top  = event.clientY + offset;
    const rect = el.getBoundingClientRect();
    if (left + rect.width  > window.innerWidth)  left = event.clientX - rect.width  - offset;
    if (top  + rect.height > window.innerHeight) top  = event.clientY - rect.height - offset;
    el.style.left = left + "px";
    el.style.top  = top  + "px";
  }

  function hideTooltip(selector) {
    const el = document.querySelector(selector);
    if (el) el.style.display = "none";
  }

  /* ------------------------------------------------------------------ */
  /* Legend                                                              */
  /* ------------------------------------------------------------------ */
  function buildLegend(cScale, maxD) {
    const legendDiv = document.getElementById("map-legend");
    const svgNS = "http://www.w3.org/2000/svg";

    const gradId = "legend-grad";
    const barPx  = 100;

    const svgEl = document.createElementNS(svgNS, "svg");
    svgEl.setAttribute("width",  barPx + "");
    svgEl.setAttribute("height", "10");
    svgEl.setAttribute("aria-hidden", "true");

    const defs = document.createElementNS(svgNS, "defs");
    const grad = document.createElementNS(svgNS, "linearGradient");
    grad.setAttribute("id", gradId);
    for (let i = 0; i <= 10; i++) {
      const stop = document.createElementNS(svgNS, "stop");
      stop.setAttribute("offset", (i * 10) + "%");
      stop.setAttribute("stop-color", cScale((i / 10) * maxD));
      grad.appendChild(stop);
    }
    defs.appendChild(grad);
    svgEl.appendChild(defs);

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("width", barPx + "");
    rect.setAttribute("height", "10");
    rect.setAttribute("rx", "2");
    rect.setAttribute("fill", `url(#${gradId})`);
    svgEl.appendChild(rect);

    legendDiv.innerHTML = `<div class="legend-title">Stores per 10,000</div>`;
    legendDiv.appendChild(svgEl);
    legendDiv.innerHTML += `
      <div class="legend-labels">
        <span>0</span><span>${maxD.toFixed(1)}</span>
      </div>
    `;
  }
}
