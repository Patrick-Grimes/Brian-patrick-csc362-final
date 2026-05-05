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

  const escapeHtml = s =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function formatPovertyPct(v) {
    if (v == null || !Number.isFinite(v)) return "N/A";
    return `${(v * 100).toFixed(1)}%`;
  }

  function povertyFinite(v) {
    return v != null && Number.isFinite(v);
  }

  function buildCompareNarrativeHtml(d) {
    const p = escapeHtml(d.city);
    const c = escapeHtml(`${d.county} County`);
    const sPl = d.storesPerTenK;
    const sCo = d.adjCountyDensity;
    const povPl = d.placePoverty;
    const povCo = d.countyPoverty;
    const plOk = povertyFinite(povPl);
    const coOk = povertyFinite(povCo);
    const epsD = 0.005;
    const epsP = 0.0005;

    const moreOrFewer = sPl >= sCo ? "more" : "fewer";
    const densityPhrase =
      `${moreOrFewer} Dollar General stores per 10,000 residents than <strong>${c}</strong> ` +
      `(${sPl.toFixed(2)} vs ${sCo.toFixed(2)})`;

    if (!plOk && !coOk) {
      return `<strong>${p}</strong> has ${densityPhrase}. ` +
        `Poverty rates for the place and adjusted county are not available in the dataset.`;
    }
    if (!plOk && coOk) {
      return `<strong>${p}</strong> has ${densityPhrase}. ` +
        `Place poverty rate is not available; adjusted county poverty is ${(povCo * 100).toFixed(1)}%.`;
    }
    if (plOk && !coOk) {
      return `<strong>${p}</strong> has ${densityPhrase}. ` +
        `County poverty rate is not available; place poverty is ${(povPl * 100).toFixed(1)}%.`;
    }

    const sameStores = Math.abs(sPl - sCo) < epsD;
    const samePov = Math.abs(povPl - povCo) < epsP;
    const higherOrLower = povPl >= povCo ? "higher" : "lower";
    const aligned = (sPl >= sCo) === (povPl >= povCo);
    const conjunction = aligned ? "and also has a" : "but has a";

    if (sameStores && samePov) {
      return `<strong>${p}</strong> matches <strong>${c}</strong> on store density ` +
        `(${sPl.toFixed(2)} per 10k) and poverty rate (${(povPl * 100).toFixed(1)}%).`;
    }
    if (sameStores) {
      const link = povPl >= povCo ? "but" : "and";
      return `<strong>${p}</strong> has the same store density as <strong>${c}</strong> ` +
        `(${sPl.toFixed(2)} per 10k) ${link} a ${higherOrLower} poverty rate ` +
        `(${(povPl * 100).toFixed(1)}% vs ${(povCo * 100).toFixed(1)}%).`;
    }
    if (samePov) {
      return `<strong>${p}</strong> has ${moreOrFewer} Dollar General stores per 10,000 residents ` +
        `than <strong>${c}</strong> (${sPl.toFixed(2)} vs ${sCo.toFixed(2)}), ` +
        `with the same poverty rate (${(povPl * 100).toFixed(1)}%).`;
    }

    return `<strong>${p}</strong> has ${moreOrFewer} Dollar General stores per 10,000 residents ` +
      `than <strong>${c}</strong> (${sPl.toFixed(2)} vs ${sCo.toFixed(2)}) ${conjunction} ` +
      `${higherOrLower} poverty rate (${(povPl * 100).toFixed(1)}% vs ${(povCo * 100).toFixed(1)}%).`;
  }

  /* ------------------------------------------------------------------ */
  /* DOM hooks                                                           */
  /* ------------------------------------------------------------------ */
  const empty   = document.getElementById("compare-empty");
  const chartEl = document.getElementById("compare-chart");
  const statsEl = document.getElementById("compare-stats");
  const headerEl = document.getElementById("compare-place-header");

  let legendEl = document.getElementById("compare-metric-legend");

  /* ------------------------------------------------------------------ */
  /* Render — called by map.js on marker click                          */
  /* ------------------------------------------------------------------ */
  function renderCompareChart(d) {
    if (!d) {
      if (empty)   empty.removeAttribute("hidden");
      if (chartEl) chartEl.setAttribute("hidden", "");
      if (statsEl) statsEl.setAttribute("hidden", "");
      if (headerEl) headerEl.setAttribute("hidden", "");
      if (legendEl) legendEl.setAttribute("hidden", "");
      return;
    }

    if (!legendEl && chartEl && chartEl.parentNode) {
      legendEl = document.createElement("div");
      legendEl.id = "compare-metric-legend";
      legendEl.className = "compare-metric-legend";
      legendEl.setAttribute("aria-label", "Chart colors: blue for stores per 10k, orange for poverty rate");
      chartEl.insertAdjacentElement("afterend", legendEl);
    }

    if (empty)    empty.setAttribute("hidden", "");
    if (chartEl)  chartEl.removeAttribute("hidden");
    if (statsEl)  statsEl.removeAttribute("hidden");
    if (headerEl) headerEl.removeAttribute("hidden");
    if (legendEl) legendEl.removeAttribute("hidden");

    const storeLabel =
      `${d.storeCount} Dollar General store${d.storeCount !== 1 ? "s" : ""}` +
      ` &nbsp;·&nbsp; ${escapeHtml(d.county)} County`;

    if (headerEl) {
      headerEl.innerHTML = `
        <div class="compare-place-title">${escapeHtml(d.city)}</div>
        <div class="compare-place-sub">${storeLabel}</div>
      `;
    }

    if (legendEl) {
      legendEl.innerHTML = `
        <span class="compare-metric-legend-item">
          <svg width="14" height="14" aria-hidden="true"><rect x="2" y="3" width="10" height="8" rx="2" fill="#3b82f6"/></svg>
          Stores per 10k
        </span>
        <span class="compare-metric-legend-item">
          <svg width="14" height="14" aria-hidden="true"><rect x="2" y="3" width="10" height="8" rx="2" fill="#f97316"/></svg>
          Poverty rate
        </span>
      `;
    }

    /* ---------------- Bar chart (stores + poverty × 2 entities) ----- */
    const barW = 280;
    const barH = 220;
    const povNums = [d.placePoverty, d.countyPoverty].filter(povertyFinite);
    const showPovAxis = povNums.length > 0;
    const margin = {
      top: showPovAxis ? 36 : 22,
      right: 28,
      bottom: 44,
      left: 112,
    };
    const innerW = barW - margin.left - margin.right;
    const innerH = barH - margin.top - margin.bottom;

    const plotTop = showPovAxis ? 18 : 10;
    const plotBottom = innerH - 20;

    const maxStores = Math.max(d.storesPerTenK, d.adjCountyDensity, 0) * 1.25 || 1;
    const maxPov = showPovAxis
      ? Math.max(...povNums, 0) * 1.25 || 0.01
      : 0.01;

    const xStores = d3.scaleLinear().domain([0, maxStores]).range([0, innerW]);
    const xPoverty = d3.scaleLinear().domain([0, maxPov]).range([0, innerW]);

    const yBand = d3.scaleBand()
      .domain(["This Place", "Adjusted county"])
      .range([plotTop, plotBottom])
      .padding(0.24);

    const subGap = 3;
    const subH = (yBand.bandwidth() - subGap) / 2;

    const rows = [
      { entity: "This Place", stores: d.storesPerTenK, poverty: d.placePoverty },
      { entity: "Adjusted county", stores: d.adjCountyDensity, poverty: d.countyPoverty },
    ];

    const aria =
      `Comparison for ${d.city}. Store density per 10,000: this place ${d.storesPerTenK.toFixed(2)}, ` +
      `adjusted county ${d.adjCountyDensity.toFixed(2)}. Poverty rate: place ` +
      `${formatPovertyPct(d.placePoverty)}, county ${formatPovertyPct(d.countyPoverty)}.`;

    const svg = d3.select(chartEl)
      .attr("viewBox", `0 0 ${barW} ${barH}`)
      .attr("aria-label", aria);

    svg.selectAll("*").remove();

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    if (showPovAxis) {
      const gTop = g.append("g").attr("transform", `translate(0,${plotTop - 2})`);
      gTop.call(d3.axisTop(xPoverty).ticks(4).tickSize(3).tickFormat(t => `${(t * 100).toFixed(0)}%`));
      gTop.selectAll("text").attr("fill", "#fdba74").attr("font-size", 10);
      gTop.selectAll("line, path").attr("stroke", "#f97316");

      gTop.append("text")
        .attr("x", innerW / 2)
        .attr("y", -20)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("fill", "#fdba74")
        .attr("font-family", "var(--font, sans-serif)")
        .text("Poverty rate");
    }

    const storeBarData = rows.map(r => ({
      entity: r.entity,
      y: yBand(r.entity),
      h: subH,
      value: r.stores,
    }));

    g.selectAll("rect.bar-stores")
      .data(storeBarData)
      .join("rect")
      .attr("class", "bar-stores")
      .attr("y", b => b.y)
      .attr("x", 0)
      .attr("height", b => b.h)
      .attr("width", b => xStores(b.value))
      .attr("fill", "#3b82f6")
      .attr("rx", 3);

    g.selectAll("text.bar-stores-val")
      .data(storeBarData)
      .join("text")
      .attr("class", "bar-stores-val")
      .attr("y", b => b.y + b.h / 2)
      .attr("x", b => xStores(b.value) + 4)
      .attr("dy", "0.35em")
      .attr("font-size", 10)
      .attr("fill", "#93c5fd")
      .attr("font-family", "var(--font, sans-serif)")
      .attr("font-weight", "600")
      .text(b => b.value.toFixed(2));

    const povertyRows = rows.map(r => ({
      entity: r.entity,
      y: yBand(r.entity) + subH + subGap,
      h: subH,
      poverty: r.poverty,
    }));

    g.selectAll("rect.bar-poverty")
      .data(povertyRows.filter(b => povertyFinite(b.poverty)))
      .join("rect")
      .attr("class", "bar-poverty")
      .attr("y", b => b.y)
      .attr("x", 0)
      .attr("height", b => b.h)
      .attr("width", b => xPoverty(b.poverty))
      .attr("fill", "#f97316")
      .attr("rx", 3);

    g.selectAll("text.bar-poverty-val")
      .data(povertyRows.filter(b => povertyFinite(b.poverty)))
      .join("text")
      .attr("class", "bar-poverty-val")
      .attr("y", b => b.y + b.h / 2)
      .attr("x", b => xPoverty(b.poverty) + 4)
      .attr("dy", "0.35em")
      .attr("font-size", 10)
      .attr("fill", "#fdba74")
      .attr("font-family", "var(--font, sans-serif)")
      .attr("font-weight", "600")
      .text(b => `${(b.poverty * 100).toFixed(1)}%`);

    g.selectAll("text.bar-poverty-na")
      .data(povertyRows.filter(b => !povertyFinite(b.poverty)))
      .join("text")
      .attr("class", "bar-poverty-na")
      .attr("y", b => b.y + b.h / 2)
      .attr("x", 4)
      .attr("dy", "0.35em")
      .attr("font-size", 10)
      .attr("fill", "#94a3b8")
      .attr("font-family", "var(--font, sans-serif)")
      .attr("font-weight", "600")
      .text("N/A");

    g.selectAll("text.entity-label")
      .data(rows)
      .join("text")
      .attr("class", "entity-label")
      .attr("y", r => yBand(r.entity) + yBand.bandwidth() / 2)
      .attr("x", -6)
      .attr("text-anchor", "end")
      .attr("dy", "0.35em")
      .attr("font-size", 10)
      .attr("fill", "#94a3b8")
      .attr("font-family", "var(--font, sans-serif)")
      .text(r => r.entity);

    const gBot = g.append("g").attr("transform", `translate(0,${plotBottom + 2})`);
    gBot.call(d3.axisBottom(xStores).ticks(4).tickSize(3));
    gBot.selectAll("text").attr("fill", "#93c5fd").attr("font-size", 10);
    gBot.selectAll("line, path").attr("stroke", "#3b82f6");

    gBot.append("text")
      .attr("x", innerW / 2)
      .attr("y", 36)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("fill", "#93c5fd")
      .attr("font-family", "var(--font, sans-serif)")
      .text("Stores per 10,000 residents");

    /* ---------------- Stats + percentile ----------------------------- */
    const gapColor = d.gap >= 0 ? "#fca5a5" : "#86efac";

    statsEl.innerHTML = `
      <p class="compare-narrative">${buildCompareNarrativeHtml(d)}</p>
      <div class="compare-stat-row">
        <span>Place classification</span>
        <span>${d.classification} (${(d.urbanShare * 100).toFixed(0)}% urban)</span>
      </div>
      <div class="compare-stat-row">
        <span>Density gap vs. adjusted county</span>
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
