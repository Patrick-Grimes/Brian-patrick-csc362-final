/* compareChart.js — dynamic place vs. adjusted-county comparison
   rendered into the right-side panel. Replaces the old click popup. */
function initCompareChart(placeData) {

  /* ------------------------------------------------------------------ */
  /* Shared formatting helpers                                           */
  /* ------------------------------------------------------------------ */
  const formatGap = d => {
    const sign = d.gap >= 0 ? "+" : "−";
    return `${sign}${Math.abs(d.gap).toFixed(2)}/10k`;
  };

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
    const povAdj = d.adjCountyPoverty;
    const plOk = povertyFinite(povPl);
    const adjOk = povertyFinite(povAdj);
    const epsD = 0.005;
    const epsP = 0.0005;

    const moreOrFewer = sPl >= sCo ? "more" : "fewer";
    const densityPhrase =
      `${moreOrFewer} Dollar General stores per 10,000 residents than the adjusted benchmark for <strong>${c}</strong> ` +
      `(${sPl.toFixed(2)} vs ${sCo.toFixed(2)})`;

    if (!plOk && !adjOk) {
      return `<strong>${p}</strong> has ${densityPhrase}. ` +
        `Poverty rates for the place and adjusted county are not available in the dataset.`;
    }
    if (!plOk && adjOk) {
      return `<strong>${p}</strong> has ${densityPhrase}. ` +
        `Place poverty rate is not available; adjusted county poverty (excluding this place) is ${(povAdj * 100).toFixed(1)}%.`;
    }
    if (plOk && !adjOk) {
      return `<strong>${p}</strong> has ${densityPhrase}. ` +
        `Adjusted county poverty (excluding this place) is not available; place poverty is ${(povPl * 100).toFixed(1)}%.`;
    }

    const sameStores = Math.abs(sPl - sCo) < epsD;
    const samePov = Math.abs(povPl - povAdj) < epsP;
    const higherOrLower = povPl >= povAdj ? "higher" : "lower";
    const aligned = (sPl >= sCo) === (povPl >= povAdj);
    const conjunction = aligned ? "and also has a" : "but has a";

    if (sameStores && samePov) {
      return `<strong>${p}</strong> matches <strong>${c}</strong> on store density ` +
        `(${sPl.toFixed(2)} per 10k) and adjusted county poverty (${(povPl * 100).toFixed(1)}%).`;
    }
    if (sameStores) {
      const link = povPl >= povAdj ? "but" : "and";
      return `<strong>${p}</strong> has the same store density as the adjusted benchmark for <strong>${c}</strong> ` +
        `(${sPl.toFixed(2)} per 10k) ${link} a ${higherOrLower} poverty rate ` +
        `(${(povPl * 100).toFixed(1)}% vs ${(povAdj * 100).toFixed(1)}%).`;
    }
    if (samePov) {
      return `<strong>${p}</strong> has ${moreOrFewer} Dollar General stores per 10,000 residents ` +
        `than the adjusted benchmark for <strong>${c}</strong> (${sPl.toFixed(2)} vs ${sCo.toFixed(2)}), ` +
        `with the same poverty rate (${(povPl * 100).toFixed(1)}%).`;
    }

    return `<strong>${p}</strong> has ${moreOrFewer} Dollar General stores per 10,000 residents ` +
      `than the adjusted benchmark for <strong>${c}</strong> (${sPl.toFixed(2)} vs ${sCo.toFixed(2)}) ${conjunction} ` +
      `${higherOrLower} poverty rate (${(povPl * 100).toFixed(1)}% vs ${(povAdj * 100).toFixed(1)}%).`;
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
  const CHART_VIEW_W = 640;
  const CHART_VIEW_H_COMPACT = 390;
  const CHART_VIEW_H_EXPANDED = 470;
  const CHART_VIEW_W_NARROW = 360;
  const CHART_VIEW_H_COMPACT_NARROW = 305;
  const CHART_VIEW_H_EXPANDED_NARROW = 335;

  function isCompareExpanded() {
    return !!(comparePanelEl && comparePanelEl.classList.contains("compare-panel--expanded"));
  }

  function getViewHeight() {
    return isCompareExpanded() ? CHART_VIEW_H_EXPANDED : CHART_VIEW_H_COMPACT;
  }

  function getViewSize(pixelWidth) {
    const narrow = pixelWidth > 0 && pixelWidth < 430;
    if (narrow) {
      return {
        w: CHART_VIEW_W_NARROW,
        h: isCompareExpanded()
          ? CHART_VIEW_H_EXPANDED_NARROW
          : CHART_VIEW_H_COMPACT_NARROW,
        narrow,
      };
    }
    return {
      w: CHART_VIEW_W,
      h: getViewHeight(),
      narrow,
    };
  }

  function chartType(expanded) {
    return {
      value: expanded ? 17 : 16,
      entity: expanded ? 14 : 13,
      entitySub: expanded ? 12 : 11.5,
      tick: expanded ? 13 : 12,
      axisTitle: expanded ? 13.5 : 12.5,
      na: expanded ? 13 : 12,
    };
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
    const view = getViewSize(w);
    const h = Math.round((w * view.h) / view.w);
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
      requestAnimationFrame(() => {
        if (window.AppState.lastCompareSelection) {
          renderCompareChart(window.AppState.lastCompareSelection);
        }
      });
    }).observe(compareFrameEl);
  }

  function setExpanded(open) {
    if (!comparePanelEl) return;
    comparePanelEl.classList.toggle("compare-panel--expanded", open);
    if (compareFrameEl) {
      compareFrameEl.scrollLeft = 0;
    }
    if (expandBackdrop) {
      expandBackdrop.classList.toggle("compare-expand-backdrop--open", open);
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
      requestAnimationFrame(() => {
        syncCompareChartPixelSize();
        if (window.AppState.lastCompareSelection) {
          renderCompareChart(window.AppState.lastCompareSelection);
        }
      });
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
    if (compareFrameEl) {
      compareFrameEl.scrollLeft = 0;
    }

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

    const expanded = isCompareExpanded();
    const type = chartType(expanded);
    const parent = chartEl.parentElement;
    const parentWidth = parent ? parent.clientWidth : 0;
    const view = getViewSize(parentWidth);

    const barW = view.w;
    const barH = view.h;
    const povNums = [d.placePoverty, d.adjCountyPoverty].filter(povertyFinite);
    const showPovAxis = povNums.length > 0;

    const valueFont = type.value;
    const labelFont = type.entity;
    const axisFont = type.tick;
    const axisTitleFont = type.axisTitle;
    const naFont = type.na;

    const marginLeft = view.narrow ? 112 : (expanded ? 168 : 156);
    const marginRight = view.narrow ? 14 : (expanded ? 28 : 22);
    const margin = {
      top: view.narrow ? (showPovAxis ? 50 : 30) : (showPovAxis ? 58 : 34),
      right: marginRight,
      bottom: view.narrow ? 54 : 58,
      left: marginLeft,
    };
    const innerW = barW - margin.left - margin.right;
    const innerH = barH - margin.top - margin.bottom;

    const plotTop = view.narrow ? (showPovAxis ? 32 : 22) : (showPovAxis ? 38 : 24);
    const plotBottom = innerH - (view.narrow ? 20 : 24);

    const maxStores = Math.max(d.storesPerTenK, d.adjCountyDensity, 0) * 1.25 || 1;
    const maxPov = showPovAxis
      ? Math.max(...povNums, 0) * 1.25 || 0.01
      : 0.01;

    const xStores = d3.scaleLinear().domain([0, maxStores]).range([0, innerW]);
    const xPoverty = d3.scaleLinear().domain([0, maxPov]).range([0, innerW]);

    const yBand = d3.scaleBand()
      .domain(["This Place", "Adj. county (excl. place)"])
      .range([plotTop, plotBottom])
      .padding(0.36);

    const subGap = expanded ? 8 : 7;
    const subH = (yBand.bandwidth() - subGap) / 2;

    const rows = [
      { entity: "This Place", labelLines: ["This Place"], stores: d.storesPerTenK, poverty: d.placePoverty },
      { entity: "Adj. county (excl. place)", labelLines: ["Adjusted county", "(excl. place)"], stores: d.adjCountyDensity, poverty: d.adjCountyPoverty },
    ];

    const aria =
      `Comparison for ${d.city}. Store density per 10,000: this place ${d.storesPerTenK.toFixed(2)}, ` +
      `adjusted county excluding this place ${d.adjCountyDensity.toFixed(2)}. Poverty rate: place ` +
      `${formatPovertyPct(d.placePoverty)}, adjusted county remainder ` +
      `${formatPovertyPct(d.adjCountyPoverty)}.`;

    const fontFamily =
      getComputedStyle(chartEl).fontFamily || "'Segoe UI', system-ui, sans-serif";

    const svg = d3.select(chartEl)
      .attr("viewBox", `0 0 ${barW} ${barH}`)
      .attr("focusable", "false")
      .attr("aria-label", aria);

    svg.selectAll("*").remove();

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const labelPadIn = 10;
    const labelGapOut = 7;

    if (showPovAxis) {
      const gTop = g.append("g").attr("transform", `translate(0,${plotTop - 6})`);
      const povAxis = d3.axisTop(xPoverty)
        .ticks(3)
        .tickSize(4)
        .tickFormat(t => `${(t * 100).toFixed(0)}%`);
      gTop.call(povAxis);
      gTop.selectAll("text")
        .attr("fill", "#fb923c")
        .attr("font-size", axisFont)
        .attr("opacity", 0.86)
        .attr("font-family", fontFamily);
      gTop.selectAll("line").attr("stroke", "#f97316").attr("opacity", 0.62);
      gTop.select("path.domain").attr("stroke", "#f97316").attr("opacity", 0.62);

      gTop.append("text")
        .attr("x", innerW / 2)
        .attr("y", -26)
        .attr("text-anchor", "middle")
        .attr("font-size", axisTitleFont)
        .attr("fill", "#fdba74")
        .attr("opacity", 0.95)
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

    const entityLabels = g.selectAll("text.entity-label")
      .data(rows)
      .join("text")
      .attr("class", "entity-label")
      .attr("y", r => yBand(r.entity) + yBand.bandwidth() / 2)
      .attr("x", -12)
      .attr("text-anchor", "end")
      .attr("font-size", labelFont)
      .attr("fill", "#b6c3d6")
      .attr("font-family", fontFamily)
      .attr("font-weight", "650")
      .attr("opacity", 0.98);

    entityLabels.each(function (r) {
      const text = d3.select(this);
      text.selectAll("*").remove();
      if (r.labelLines.length === 1) {
        text.append("tspan")
          .attr("x", -12)
          .attr("dy", "0.35em")
          .text(r.labelLines[0]);
        return;
      }
      text.append("tspan")
        .attr("x", -12)
        .attr("dy", "-0.15em")
        .text(r.labelLines[0]);
      text.append("tspan")
        .attr("x", -12)
        .attr("dy", "1.2em")
        .attr("font-size", type.entitySub)
        .attr("fill", "#94a3b8")
        .attr("font-weight", "600")
        .text(r.labelLines[1]);
    });

    const gBot = g.append("g").attr("transform", `translate(0,${plotBottom + 4})`);
    const xAxisStores = d3.axisBottom(xStores)
      .tickValues([0, maxStores])
      .tickFormat(v => v.toFixed(1))
      .tickSize(5);
    gBot.call(xAxisStores);
    gBot.selectAll("text")
      .attr("fill", "#64748b")
      .attr("font-size", axisFont)
      .attr("opacity", 0.88)
      .attr("font-family", fontFamily);
    gBot.selectAll("line")
      .attr("stroke", "#3b82f6")
      .attr("opacity", 0.42);
    gBot.select("path.domain")
      .attr("stroke", "#3b82f6")
      .attr("opacity", 0.68);

    gBot.append("text")
      .attr("x", innerW / 2)
      .attr("y", 38)
      .attr("text-anchor", "middle")
      .attr("font-size", axisTitleFont)
      .attr("fill", "#9fb0c8")
      .attr("opacity", 0.95)
      .attr("font-family", fontFamily)
      .attr("font-weight", "500")
      .text("Stores per 10,000 residents");

    /* ---------------- Stats ------------------------------------------ */
    const gapColor = d.gap >= 0 ? "#fca5a5" : "#86efac";

    statsEl.innerHTML = `
      <p class="compare-narrative">${buildCompareNarrativeHtml(d)}</p>
      <div class="compare-stat-row">
        <span>Place store density</span>
        <span>${d.storesPerTenK.toFixed(2)} per 10k</span>
      </div>
      <div class="compare-stat-row">
        <span>Adjusted county store density</span>
        <span>${d.adjCountyDensity.toFixed(2)} per 10k</span>
      </div>
      <div class="compare-stat-row">
        <span>Place poverty</span>
        <span>${formatPovertyPct(d.placePoverty)}</span>
      </div>
      <div class="compare-stat-row">
        <span>Adjusted county poverty</span>
        <span>${formatPovertyPct(d.adjCountyPoverty)}</span>
      </div>
      <div class="compare-stat-row">
        <span>Place classification</span>
        <span>${d.classification} (${(d.urbanShare * 100).toFixed(0)}% urban)</span>
      </div>
      <div class="compare-stat-row">
        <span>Store density gap vs. adjusted county</span>
        <span style="color:${gapColor}">${formatGap(d)}</span>
      </div>
      <p class="compare-gap-legend"><span style="color:#fca5a5;font-weight:600">Coral</span> = more Dollar General stores per 10k here than the rest of the county; <span style="color:#86efac;font-weight:600">Green</span> = fewer.</p>
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
