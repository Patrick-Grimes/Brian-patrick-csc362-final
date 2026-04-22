/* map.js — interactive choropleth map with three-zone hover and popup */
function initMap(placeData, countyData, countiesGeo, placesGeo) {

  /* ------------------------------------------------------------------ */
  /* Dimensions                                                          */
  /* ------------------------------------------------------------------ */
  const frame   = document.getElementById("map-frame");
  const W       = frame.clientWidth  || 700;
  const H       = Math.round(W * 0.62);

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
    .attr("stroke", "#1e293b")
    .attr("stroke-width", 0.6)
    .attr("tabindex", "0")
    .attr("role", "listitem")
    .attr("aria-label", d => {
      const cd = countyData[d.properties.name];
      if (!cd) return `${d.properties.name} County`;
      return `${d.properties.name} County: ${cd.storesPerTenK.toFixed(2)} stores per 10,000, poverty rate ${(cd.povertyRate * 100).toFixed(1)}%`;
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

  function onZoom(event) {
    const t = event.transform;
    currentK = t.k;

    gCountyBase.attr("transform", t);
    gCountyHL  .attr("transform", t);
    gPlaceHL   .attr("transform", t);
    gPins      .attr("transform", t);

    /* Scale strokes to stay visually consistent */
    gCountyBase.selectAll(".county-path").attr("stroke-width", 0.6 / t.k);
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

    const pinR = Math.max(4, 9 / transform.k);
    const fontSize = Math.max(7, 9 / transform.k);

    const pins = gPins.selectAll("g.pin")
      .data(visible, d => d.city);

    const enter = pins.enter()
      .append("g")
      .attr("class", "pin")
      .attr("transform", d => {
        const [x, y] = projection([d.lng, d.lat]);
        return `translate(${x},${y})`;
      })
      .attr("tabindex", "0")
      .attr("role", "listitem")
      .attr("aria-label", d =>
        `${d.city}, ${d.county} County. ${d.storeCount} stores. ` +
        `Density: ${d.storesPerTenK.toFixed(2)} per 10,000. ` +
        `Poverty rate: ${(d.placePoverty * 100).toFixed(1)}%. ` +
        `Over-saturated vs county: ${d.overSaturated ? "Yes" : "No"}.`
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
      .on("click",   (event, d) => { event.stopPropagation(); showPopup(d, event); })
      .on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showPopup(d, event);
        }
      });

    enter.append("circle")
      .attr("r", pinR)
      .attr("fill", "#22c55e")
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.8 / transform.k);

    enter.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", fontSize)
      .attr("fill", "#fff")
      .attr("font-weight", "700")
      .attr("pointer-events", "none")
      .text(d => d.storeCount > 1 ? d.storeCount : "");

    pins.exit().remove();
  }

  /* ------------------------------------------------------------------ */
  /* Three-zone highlight on hover                                       */
  /* ------------------------------------------------------------------ */
  function highlightPlace(d) {
    clearHighlights(false);

    /* Zone 2: draw county in orange over its base colour */
    const countyFeat = countiesGeo.features.find(f => f.properties.name === d.county);
    if (countyFeat) {
      gCountyHL.append("path")
        .attr("d", pathGen(countyFeat))
        .attr("fill", "#f97316")
        .attr("stroke", "#1e293b")
        .attr("stroke-width", 1 / currentK);
    }

    /* Zone 1: draw place polygon in blue on top */
    const placeFeat = placeFeatByName.get(d.tigerName);
    if (placeFeat) {
      gPlaceHL.append("path")
        .attr("d", pathGen(placeFeat))
        .attr("fill", "#3b82f6")
        .attr("fill-opacity", 0.88)
        .attr("stroke", "#93c5fd")
        .attr("stroke-width", 1.5 / currentK);
    }

    /* Notify scatterplot */
    if (window.AppState.onScatterHighlight) {
      window.AppState.onScatterHighlight(d.city);
    }
  }

  function clearHighlights(notifyScatter = true) {
    gCountyHL.selectAll("*").remove();
    gPlaceHL .selectAll("*").remove();
    if (notifyScatter && window.AppState.onScatterHighlight) {
      window.AppState.onScatterHighlight(null);
    }
  }

  /* Called from scatterplot highlight */
  window.AppState.onMapHighlight = (cityName) => {
    if (!cityName) { clearHighlights(false); return; }
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
      <div class="tt-row"><span class="tt-label">Stores per 10k</span><span class="tt-value">${cd.storesPerTenK.toFixed(2)}</span></div>
      <div class="tt-row"><span class="tt-label">Poverty rate</span><span class="tt-value">${(cd.povertyRate * 100).toFixed(1)}%</span></div>
    `;
    moveTooltip(event, "#map-tooltip");
  }

  function showPlaceTooltip(event, d) {
    const el = document.getElementById("map-tooltip");
    el.style.display = "block";
    el.innerHTML = `
      <div class="tt-title">${d.city} <span style="font-weight:400;color:#94a3b8">(${d.county} Co.)</span></div>
      <div class="tt-row"><span class="tt-label">Place density</span><span class="tt-value">${d.storesPerTenK.toFixed(2)}/10k</span></div>
      <div class="tt-row"><span class="tt-label">Adj. county density</span><span class="tt-value">${d.adjCountyDensity.toFixed(2)}/10k</span></div>
      <div class="tt-row"><span class="tt-label">Place poverty</span><span class="tt-value">${(d.placePoverty * 100).toFixed(1)}%</span></div>
      <div class="tt-row"><span class="tt-label">Over-saturated</span><span class="tt-value" style="color:${d.overSaturated ? '#f87171' : '#86efac'}">${d.overSaturated ? "Yes" : "No"}</span></div>
      <div style="font-size:0.72rem;color:#64748b;margin-top:4px">Click for full comparison</div>
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
  /* Popup bar chart                                                     */
  /* ------------------------------------------------------------------ */
  function showPopup(d, event) {
    const popup = document.getElementById("place-popup");
    popup.removeAttribute("hidden");

    const barW  = 260;
    const barH  = 130;
    const margin = { top: 20, right: 20, bottom: 36, left: 16 };
    const innerW = barW - margin.left - margin.right;
    const innerH = barH - margin.top  - margin.bottom;

    const maxVal = Math.max(d.storesPerTenK, d.adjCountyDensity) * 1.25;
    const xScale = d3.scaleLinear().domain([0, maxVal]).range([0, innerW]);

    const bars = [
      { label: "This Place",    value: d.storesPerTenK,    fill: "#3b82f6", textFill: "#93c5fd" },
      { label: "Adj. County",   value: d.adjCountyDensity, fill: "#f97316", textFill: "#fdba74" },
    ];

    const yBand = d3.scaleBand()
      .domain(bars.map(b => b.label))
      .range([0, innerH])
      .padding(0.35);

    popup.innerHTML = `
      <div class="popup-header">
        <div>
          <div class="popup-title">${d.city}</div>
          <div class="popup-county">${d.county} County &nbsp;·&nbsp; ${d.storeCount} store${d.storeCount !== 1 ? "s" : ""}</div>
        </div>
        <button class="popup-close" aria-label="Close comparison popup" id="popup-close-btn">×</button>
      </div>

      <div class="popup-chart-area">
        <svg viewBox="0 0 ${barW} ${barH}" role="img"
          aria-label="Bar chart comparing ${d.city} store density of ${d.storesPerTenK.toFixed(2)} to adjusted county density of ${d.adjCountyDensity.toFixed(2)} stores per 10,000 residents">
          <g transform="translate(${margin.left},${margin.top})">
          </g>
        </svg>
      </div>

      <div class="popup-stats">
        <div class="popup-stat-row">
          <span>Place poverty rate</span>
          <span>${(d.placePoverty * 100).toFixed(1)}%</span>
        </div>
        <div class="popup-stat-row">
          <span>County poverty rate</span>
          <span>${(d.countyPoverty * 100).toFixed(1)}%</span>
        </div>
        <div class="popup-stat-row">
          <span>Place classification</span>
          <span>${d.classification}</span>
        </div>
      </div>

      <span class="popup-badge ${d.overSaturated ? "yes" : "no"}">
        Over-Saturated vs County: ${d.overSaturated ? "Yes" : "No"}
      </span>
    `;

    /* Draw bars with D3 into the SVG group */
    const svg2 = d3.select(popup).select("svg g");

    svg2.selectAll("rect.bar")
      .data(bars)
      .join("rect")
      .attr("class", "bar")
      .attr("y", b => yBand(b.label))
      .attr("x", 0)
      .attr("height", yBand.bandwidth())
      .attr("width", b => xScale(b.value))
      .attr("fill", b => b.fill)
      .attr("rx", 3);

    svg2.selectAll("text.bar-val")
      .data(bars)
      .join("text")
      .attr("class", "bar-val")
      .attr("y", b => yBand(b.label) + yBand.bandwidth() / 2)
      .attr("x", b => xScale(b.value) + 4)
      .attr("dy", "0.35em")
      .attr("font-size", 11)
      .attr("fill", b => b.textFill)
      .attr("font-family", "var(--font, sans-serif)")
      .attr("font-weight", "600")
      .text(b => b.value.toFixed(2));

    svg2.selectAll("text.bar-label")
      .data(bars)
      .join("text")
      .attr("class", "bar-label")
      .attr("y", b => yBand(b.label) + yBand.bandwidth() / 2)
      .attr("x", -2)
      .attr("text-anchor", "end")
      .attr("dy", "0.35em")
      .attr("font-size", 10)
      .attr("fill", "#94a3b8")
      .attr("font-family", "var(--font, sans-serif)")
      .text(b => b.label);

    /* X-axis */
    const xAxis = d3.axisBottom(xScale).ticks(4).tickSize(3);
    svg2.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${innerH})`)
      .call(xAxis)
      .append("text")
        .attr("x", innerW / 2)
        .attr("y", 28)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("fill", "#64748b")
        .attr("font-family", "var(--font, sans-serif)")
        .text("Stores per 10,000 residents");

    /* Position popup near click, clamped to viewport */
    positionPopup(popup, event.clientX, event.clientY);

    /* Close button */
    document.getElementById("popup-close-btn").addEventListener("click", () => {
      popup.setAttribute("hidden", "");
    });

    /* Trap focus */
    popup.focus();
  }

  function positionPopup(el, cx, cy) {
    el.style.position = "fixed";
    const pw = 340, ph = 360;
    let left = cx + 16;
    let top  = cy + 16;
    if (left + pw > window.innerWidth)  left = cx - pw - 16;
    if (top  + ph > window.innerHeight) top  = cy - ph - 16;
    el.style.left = Math.max(8, left) + "px";
    el.style.top  = Math.max(8, top)  + "px";
  }

  /* Click anywhere on SVG background → close popup & clear highlights */
  svg.on("click", () => {
    document.getElementById("place-popup").setAttribute("hidden", "");
  });

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
