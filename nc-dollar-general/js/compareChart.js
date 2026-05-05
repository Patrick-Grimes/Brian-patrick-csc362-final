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
  const comparePanelEl = document.getElementById("compare-panel");

  /* viewBox width; compact vs expanded height — sync aspect-ratio in css/style.css */
  const CHART_VIEW_W = 560;
  const CHART_VIEW_H_COMPACT = 510;
  const CHART_VIEW_H_EXPANDED = 650;

  const READABLE_BASE = 1.12;

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function isCompareExpanded() {
    return !!(comparePanelEl && comparePanelEl.classList.contains("compare-panel--expanded"));
  }

  function getViewHeight() {
    return isCompareExpanded() ? CHART_VIEW_H_EXPANDED : CHART_VIEW_H_COMPACT;
  }

  /** Single scale for all SVG text + spacing (merged former “readable” + width + expanded). */
  function computeTypeScale(innerPxWidth, expanded) {
    const byWidth = clamp(innerPxWidth / 395, 0.98, 1.28);
    const expandedBoost = expanded ? 1.06 : 1;
    return READABLE_BASE * byWidth * expandedBoost;
  }

  function measureSvgTextWidth(svgRoot, textStr, fontSize, fontWeight, fontFamily) {
    const t = svgRoot.append("text")
      .attr("visibility", "hidden")
      .attr("font-size", fontSize)
      .attr("font-weight", fontWeight)
      .attr("font-family", fontFamily)
      .text(textStr);
    const len = t.node().getComputedTextLength();
    t.remove();
    return len;
  }

  /** Inside bar when there is room; otherwise to the right of the bar (nudged to fit innerW). */
  function applyBarValueLabel(el, svgRoot, {
    textStr,
    barWidth,
    innerW,
    valueFont,
    fontFamily,
    padIn,
    gapOut,
    insideFill,
    outsideFill,
  }) {
    const tw = measureSvgTextWidth(svgRoot, textStr, valueFont, "700", fontFamily);
    const inside = barWidth >= tw + padIn;
    const sel = d3.select(el);
    let x;
    let anchor;
    let fill;
    if (inside) {
      x = barWidth - padIn;
      anchor = "end";
      fill = insideFill;
    } else {
      anchor = "start";
      fill = outsideFill;
      x = barWidth + gapOut;
      if (x + tw > innerW) {
        x = Math.max(0, innerW - tw);
      }
    }
    sel
      .attr("x", x)
      .attr("text-anchor", anchor)
      .attr("fill", fill)
      .attr("font-size", valueFont)
      .attr("font-family", fontFamily)
      .attr("font-weight", "700")
      .text(textStr);
  }

  function syncCompareChartPixelSize() {
    if (!chartEl || chartEl.hasAttribute("hidden")) return;
    const parent = chartEl.parentElement;
    if (!parent) return;
    const cs = getComputedStyle(parent);
    const padX =
      (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const w = Math.max(0, parent.clientWidth - padX);
    if (!(w > 0)) return;
    const viewH = getViewHeight();
    const h = Math.round((w * viewH) / CHART_VIEW_W);
    chartEl.setAttribute("width", String(w));
    chartEl.setAttribute("height", String(h));
  }

  const compareFrameEl = chartEl && chartEl.closest(".compare-frame");

  const expandBtn = document.getElementById("compare-expand-btn");
  const expandBackdrop = document.getElementById("compare-expand-backdrop");
  let expandFocusEl = null;

  if (compareFrameEl && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      syncCompareChartPixelSize();
      if (window.AppState.lastCompareSelection) {
        renderCompareChart(window.AppState.lastCompareSelection);
      }
    }).observe(compareFrameEl);
  }

  function setExpanded(open) {
    if (!comparePanelEl) return;
    comparePanelEl.classList.toggle("compare-panel--expanded", open);
    if (expandBackdrop) {
      if (open) {
        expandBackdrop.removeAttribute("hidden");
        expandBackdrop.setAttribute("aria-hidden", "false");
      } else {
        expandBackdrop.setAttribute("hidden", "");
        expandBackdrop.setAttribute("aria-hidden", "true");
      }
    }
    if (expandBtn) {
      expandBtn.setAttribute("aria-expanded", open ? "true" : "false");
      expandBtn.textContent = open ? "Exit expanded view" : "Expand chart";
    }
    requestAnimationFrame(() => {
      syncCompareChartPixelSize();
      if (window.AppState.lastCompareSelection) {
        renderCompareChart(window.AppState.lastCompareSelection);
      }
    });
  }

  if (expandBtn) {
    expandBtn.addEventListener("click", () => {
      const open = !comparePanelEl || !comparePanelEl.classList.contains("compare-panel--expanded");
      if (open) expandFocusEl = document.activeElement;
      setExpanded(open);
      if (open && compareFrameEl && typeof compareFrameEl.focus === "function") {
        requestAnimationFrame(() => compareFrameEl.focus({ preventScroll: true }));
      } else if (!open && expandFocusEl && typeof expandFocusEl.focus === "function") {
        expandFocusEl.focus({ preventScroll: true });
      }
    });
  }

  if (expandBackdrop) {
    expandBackdrop.addEventListener("click", () => {
      setExpanded(false);
      if (expandFocusEl && typeof expandFocusEl.focus === "function") {
        expandFocusEl.focus({ preventScroll: true });
      }
    });
  }

  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const helpDlg = document.getElementById("site-help");
    if (helpDlg && helpDlg.open) return;
    if (comparePanelEl && comparePanelEl.classList.contains("compare-panel--expanded")) {
      e.preventDefault();
      setExpanded(false);
      if (expandFocusEl && typeof expandFocusEl.focus === "function") {
        expandFocusEl.focus({ preventScroll: true });
      }
    }
  });

  /* ------------------------------------------------------------------ */
  /* Render — called by map.js on marker click                          */
  /* ------------------------------------------------------------------ */
  function renderCompareChart(d) {
    window.AppState.lastCompareSelection = d || null;

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
          Stores per 10,000 residents
        </span>
        <span class="compare-metric-legend-item">
          <svg width="14" height="14" aria-hidden="true"><rect x="2" y="3" width="10" height="8" rx="2" fill="#f97316"/></svg>
          Poverty rate
        </span>
      `;
    }

    syncCompareChartPixelSize();

    const parent = chartEl.parentElement;
    const cs = parent ? getComputedStyle(parent) : null;
    const padX = cs
      ? (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
      : 0;
    const innerPxW = Math.max(0, (parent && parent.clientWidth) ? parent.clientWidth - padX : CHART_VIEW_W);

    const expanded = isCompareExpanded();
    const typeScale = computeTypeScale(innerPxW, expanded);

    const barW = CHART_VIEW_W;
    const barH = getViewHeight();
    const povNums = [d.placePoverty, d.countyPoverty].filter(povertyFinite);
    const showPovAxis = povNums.length > 0;

    const valueFont = 18 * typeScale;
    const labelFont = 14.5 * typeScale;
    const axisFont = 10 * typeScale;
    const axisTitleFont = 10.75 * typeScale;
    const naFont = 13 * typeScale;

    const marginLeft = Math.round(154 * typeScale);
    const marginRight = Math.round(20 * typeScale);
    const margin = {
      top: showPovAxis ? Math.round(48 * typeScale / READABLE_BASE) : Math.round(32 * typeScale / READABLE_BASE),
      right: marginRight,
      bottom: Math.round(58 * typeScale / READABLE_BASE),
      left: marginLeft,
    };
    const innerW = barW - margin.left - margin.right;
    const innerH = barH - margin.top - margin.bottom;

    const plotTop = showPovAxis ? Math.round(28 * typeScale / READABLE_BASE) : Math.round(18 * typeScale / READABLE_BASE);
    const plotBottom = innerH - Math.round(28 * typeScale / READABLE_BASE);

    const maxStores = Math.max(d.storesPerTenK, d.adjCountyDensity, 0) * 1.25 || 1;
    const maxPov = showPovAxis
      ? Math.max(...povNums, 0) * 1.25 || 0.01
      : 0.01;

    const xStores = d3.scaleLinear().domain([0, maxStores]).range([0, innerW]);
    const xPoverty = d3.scaleLinear().domain([0, maxPov]).range([0, innerW]);

    const yBand = d3.scaleBand()
      .domain(["This Place", "Adjusted county"])
      .range([plotTop, plotBottom])
      .padding(0.40);

    const subGap = Math.max(6, Math.round(7 * typeScale / READABLE_BASE));
    const subH = (yBand.bandwidth() - subGap) / 2;

    const rows = [
      { entity: "This Place", stores: d.storesPerTenK, poverty: d.placePoverty },
      { entity: "Adjusted county", stores: d.adjCountyDensity, poverty: d.countyPoverty },
    ];

    const aria =
      `Comparison for ${d.city}. Store density per 10,000: this place ${d.storesPerTenK.toFixed(2)}, ` +
      `adjusted county ${d.adjCountyDensity.toFixed(2)}. Poverty rate: place ` +
      `${formatPovertyPct(d.placePoverty)}, county ${formatPovertyPct(d.countyPoverty)}.`;

    const fontFamily =
      getComputedStyle(chartEl).fontFamily || "'Segoe UI', system-ui, sans-serif";

    const svg = d3.select(chartEl)
      .attr("viewBox", `0 0 ${barW} ${barH}`)
      .attr("focusable", "false")
      .attr("aria-label", aria);

    svg.selectAll("*").remove();

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const labelPadIn = Math.max(8, Math.round(9 * typeScale / READABLE_BASE));
    const labelGapOut = Math.max(5, Math.round(6 * typeScale / READABLE_BASE));

    if (showPovAxis) {
      const gTop = g.append("g").attr("transform", `translate(0,${plotTop - 4})`);
      const povAxis = d3.axisTop(xPoverty)
        .ticks(3)
        .tickSize(4)
        .tickFormat(t => `${(t * 100).toFixed(0)}%`);
      gTop.call(povAxis);
      gTop.selectAll("text")
        .attr("fill", "#fb923c")
        .attr("font-size", axisFont)
        .attr("opacity", 0.58)
        .attr("font-family", fontFamily);
      gTop.selectAll("line").attr("stroke", "#f97316").attr("opacity", 0.38);
      gTop.select("path.domain").attr("stroke", "#f97316").attr("opacity", 0.38);

      gTop.append("text")
        .attr("x", innerW / 2)
        .attr("y", -Math.round(26 * typeScale / READABLE_BASE))
        .attr("text-anchor", "middle")
        .attr("font-size", axisTitleFont)
        .attr("fill", "#fdba74")
        .attr("opacity", 0.72)
        .attr("font-family", fontFamily)
        .attr("font-weight", "500")
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
      .attr("rx", 4);

    g.selectAll("text.bar-stores-val")
      .data(storeBarData)
      .join("text")
      .attr("class", "bar-stores-val")
      .attr("y", b => b.y + b.h / 2)
      .attr("dy", "0.35em")
      .each(function (b) {
        applyBarValueLabel(this, svg, {
          textStr: b.value.toFixed(2),
          barWidth: xStores(b.value),
          innerW,
          valueFont,
          fontFamily,
          padIn: labelPadIn,
          gapOut: labelGapOut,
          insideFill: "#f8fafc",
          outsideFill: "#f1f5f9",
        });
      });

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
      .attr("rx", 4);

    g.selectAll("text.bar-poverty-val")
      .data(povertyRows.filter(b => povertyFinite(b.poverty)))
      .join("text")
      .attr("class", "bar-poverty-val")
      .attr("y", b => b.y + b.h / 2)
      .attr("dy", "0.35em")
      .each(function (b) {
        applyBarValueLabel(this, svg, {
          textStr: `${(b.poverty * 100).toFixed(1)}%`,
          barWidth: xPoverty(b.poverty),
          innerW,
          valueFont,
          fontFamily,
          padIn: labelPadIn,
          gapOut: labelGapOut,
          insideFill: "#fffbeb",
          outsideFill: "#ffedd5",
        });
      });

    g.selectAll("text.bar-poverty-na")
      .data(povertyRows.filter(b => !povertyFinite(b.poverty)))
      .join("text")
      .attr("class", "bar-poverty-na")
      .attr("y", b => b.y + b.h / 2)
      .attr("x", 6)
      .attr("dy", "0.35em")
      .attr("font-size", naFont)
      .attr("fill", "#94a3b8")
      .attr("font-family", fontFamily)
      .attr("font-weight", "600")
      .attr("opacity", 0.9)
      .text("N/A");

    g.selectAll("text.entity-label")
      .data(rows)
      .join("text")
      .attr("class", "entity-label")
      .attr("y", r => yBand(r.entity) + yBand.bandwidth() / 2)
      .attr("x", -8)
      .attr("text-anchor", "end")
      .attr("dy", "0.35em")
      .attr("font-size", labelFont)
      .attr("fill", "#94a3b8")
      .attr("font-family", fontFamily)
      .attr("font-weight", "500")
      .attr("opacity", 0.92)
      .text(r => r.entity);

    const gBot = g.append("g").attr("transform", `translate(0,${plotBottom + 4})`);
    const xAxisStores = d3.axisBottom(xStores)
      .tickValues([0, maxStores])
      .tickFormat(v => v.toFixed(1))
      .tickSize(5);
    gBot.call(xAxisStores);
    gBot.selectAll("text")
      .attr("fill", "#64748b")
      .attr("font-size", axisFont)
      .attr("opacity", 0.62)
      .attr("font-family", fontFamily);
    gBot.selectAll("line")
      .attr("stroke", "#3b82f6")
      .attr("opacity", 0.2);
    gBot.select("path.domain")
      .attr("stroke", "#3b82f6")
      .attr("opacity", 0.38);

    gBot.append("text")
      .attr("x", innerW / 2)
      .attr("y", Math.round(34 * typeScale / READABLE_BASE))
      .attr("text-anchor", "middle")
      .attr("font-size", axisTitleFont)
      .attr("fill", "#64748b")
      .attr("opacity", 0.72)
      .attr("font-family", fontFamily)
      .attr("font-weight", "500")
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
      <p class="compare-gap-legend"><span style="color:#fca5a5;font-weight:600">Coral</span> = more Dollar General per 10k here than the adjusted county; <span style="color:#86efac;font-weight:600">Green</span> = fewer.</p>

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

    requestAnimationFrame(() => {
      syncCompareChartPixelSize();
      if (compareFrameEl && typeof compareFrameEl.focus === "function") {
        compareFrameEl.focus({ preventScroll: true });
      }
    });
  }

  /* Expose for map.js to call on marker click */
  window.AppState.renderCompareChart = renderCompareChart;
}
