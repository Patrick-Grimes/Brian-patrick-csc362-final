/* compareChart.js — dynamic place vs. adjusted-county comparison
   rendered into the right-side panel. Replaces the old click popup. */
function initCompareChart(placeData) {

  /* ------------------------------------------------------------------ */
  /* Shared formatting helpers                                           */
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

  /* ------------------------------------------------------------------ */
  /* DOM hooks                                                           */
  /* ------------------------------------------------------------------ */
  const empty   = document.getElementById("compare-empty");
  const chartEl = document.getElementById("compare-chart");
  const statsEl = document.getElementById("compare-stats");
  const headerEl = document.getElementById("compare-place-header");

  /* ------------------------------------------------------------------ */
  /* Render — called by map.js on marker click                          */
  /* ------------------------------------------------------------------ */
  function renderCompareChart(d) {
    if (!d) {
      if (empty)   empty.removeAttribute("hidden");
      if (chartEl) chartEl.setAttribute("hidden", "");
      if (statsEl) statsEl.setAttribute("hidden", "");
      if (headerEl) headerEl.setAttribute("hidden", "");
      return;
    }

    if (empty)    empty.setAttribute("hidden", "");
    if (chartEl)  chartEl.removeAttribute("hidden");
    if (statsEl)  statsEl.removeAttribute("hidden");
    if (headerEl) headerEl.removeAttribute("hidden");

    /* Header (place name + county/store count) */
    if (headerEl) {
      headerEl.innerHTML = `
        <div class="compare-place-title">${d.city}</div>
        <div class="compare-place-sub">${d.county} County &nbsp;·&nbsp; ${d.storeCount} store${d.storeCount !== 1 ? "s" : ""}</div>
      `;
    }

    /* ---------------- Bar chart -------------------------------------- */
    const barW = 280;
    const barH = 140;
    const margin = { top: 18, right: 22, bottom: 36, left: 90 };
    const innerW = barW - margin.left - margin.right;
    const innerH = barH - margin.top  - margin.bottom;

    const maxVal = Math.max(d.storesPerTenK, d.adjCountyDensity) * 1.25 || 1;
    const xScale = d3.scaleLinear().domain([0, maxVal]).range([0, innerW]);

    const bars = [
      { label: "This Place",  value: d.storesPerTenK,    fill: "#3b82f6", textFill: "#93c5fd" },
      { label: "Adj. County", value: d.adjCountyDensity, fill: "#f97316", textFill: "#fdba74" },
    ];

    const yBand = d3.scaleBand()
      .domain(bars.map(b => b.label))
      .range([0, innerH])
      .padding(0.35);

    const svg = d3.select(chartEl)
      .attr("viewBox", `0 0 ${barW} ${barH}`)
      .attr("aria-label",
        `Bar chart comparing ${d.city} store density of ${d.storesPerTenK.toFixed(2)} ` +
        `to adjusted county density of ${d.adjCountyDensity.toFixed(2)} stores per 10,000 residents`);

    svg.selectAll("*").remove();

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    g.selectAll("rect.bar")
      .data(bars)
      .join("rect")
      .attr("class", "bar")
      .attr("y", b => yBand(b.label))
      .attr("x", 0)
      .attr("height", yBand.bandwidth())
      .attr("width", b => xScale(b.value))
      .attr("fill", b => b.fill)
      .attr("rx", 3);

    g.selectAll("text.bar-val")
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

    g.selectAll("text.bar-label")
      .data(bars)
      .join("text")
      .attr("class", "bar-label")
      .attr("y", b => yBand(b.label) + yBand.bandwidth() / 2)
      .attr("x", -6)
      .attr("text-anchor", "end")
      .attr("dy", "0.35em")
      .attr("font-size", 10)
      .attr("fill", "#94a3b8")
      .attr("font-family", "var(--font, sans-serif)")
      .text(b => b.label);

    const xAxis = d3.axisBottom(xScale).ticks(4).tickSize(3);
    g.append("g")
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

    /* ---------------- Stats + percentile ----------------------------- */
    const gapColor = d.gap >= 0 ? "#fca5a5" : "#86efac";

    statsEl.innerHTML = `
      <div class="compare-stat-row">
        <span>Place poverty rate</span>
        <span>${(d.placePoverty * 100).toFixed(1)}%</span>
      </div>
      <div class="compare-stat-row">
        <span>County poverty rate</span>
        <span>${(d.countyPoverty * 100).toFixed(1)}%</span>
      </div>
      <div class="compare-stat-row">
        <span>Place classification</span>
        <span>${d.classification} (${(d.urbanShare * 100).toFixed(0)}% urban)</span>
      </div>
      <div class="compare-stat-row">
        <span>Density gap vs. adj. county</span>
        <span style="color:${gapColor}">${formatGap(d)}</span>
      </div>

      <div class="compare-percentile">
        <div class="compare-percentile-label">Statewide gap percentile</div>
        <div class="compare-percentile-bar" aria-hidden="true">
          <div class="compare-percentile-fill" style="width:${(d.gapPercentile * 100).toFixed(1)}%"></div>
        </div>
        <div class="compare-percentile-value">
          ${formatPercentile(d)} of ${placeData.length} NC places
        </div>
      </div>
    `;
  }

  /* Expose for map.js to call on marker click */
  window.AppState.renderCompareChart = renderCompareChart;
}
