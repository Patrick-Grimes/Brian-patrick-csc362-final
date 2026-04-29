/* scatterplot.js — average store density by community type */
function initScatterplot(placeData) {

  /* ------------------------------------------------------------------ */
  /* Dimensions                                                          */
  /* ------------------------------------------------------------------ */
  const frame   = document.querySelector(".scatter-frame");
  const outerW  = frame.clientWidth  || 420;
  const outerH  = Math.max(280, Math.round(outerW * 0.68));
  const margin  = { top: 20, right: 56, bottom: 52, left: 112 };
  const W       = outerW - margin.left - margin.right;
  const H       = outerH - margin.top  - margin.bottom;

  /* ------------------------------------------------------------------ */
  /* Aggregate by community classification                               */
  /* ------------------------------------------------------------------ */
  const GROUP_ORDER = ["Rural", "Urban"];
  const groupMeta = {
    "Rural": { label: "Rural", fill: "#f87171", stroke: "#ef4444" },
    "Urban": { label: "Urban", fill: "#60a5fa", stroke: "#3b82f6" },
  };

  const grouped = GROUP_ORDER.map(classification => {
    const rows = placeData.filter(d => d.classification === classification);
    return {
      classification,
      label: groupMeta[classification].label,
      fill: groupMeta[classification].fill,
      stroke: groupMeta[classification].stroke,
      avgDensity: d3.mean(rows, d => d.storesPerTenK) || 0,
      avgPoverty: d3.mean(rows, d => d.placePoverty) || 0,
      placeCount: rows.length,
      totalStores: d3.sum(rows, d => d.storeCount),
    };
  });

  /* ------------------------------------------------------------------ */
  /* Scales                                                              */
  /* ------------------------------------------------------------------ */
  const xScale = d3.scaleLinear()
    .domain([0, d3.max(grouped, d => d.avgDensity) * 1.2])
    .range([0, W])
    .nice();

  const yScale = d3.scaleBand()
    .domain(grouped.map(d => d.label))
    .range([0, H])
    .padding(0.32);

  /* ------------------------------------------------------------------ */
  /* SVG                                                                 */
  /* ------------------------------------------------------------------ */
  const svg = d3.select("#scatterplot")
    .attr("viewBox", `0 0 ${outerW} ${outerH}`)
    .attr("width", "100%")
    .attr("height", outerH);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  /* Grid lines */
  g.append("g")
    .attr("class", "grid-y")
    .attr("transform", `translate(0,${H})`)
    .call(
      d3.axisBottom(xScale).ticks(5).tickSize(-H).tickFormat("")
    )
    .call(sel => sel.select(".domain").remove())
    .call(sel => sel.selectAll("line").attr("stroke", "#334155").attr("stroke-dasharray", "3,3"));

  /* Axes */
  g.append("g")
    .attr("class", "axis axis-x")
    .attr("transform", `translate(0,${H})`)
    .call(d3.axisBottom(xScale).ticks(5));

  g.append("g")
    .attr("class", "axis axis-y")
    .call(d3.axisLeft(yScale));

  /* Axis labels */
  g.append("text")
    .attr("class", "axis-label")
    .attr("x", W / 2)
    .attr("y", H + 44)
    .attr("text-anchor", "middle")
    .text("Average stores per 10,000 residents");

  g.append("text")
    .attr("class", "bar-chart-note")
    .attr("x", 0)
    .attr("y", -6)
    .text("Grouped by Census 2020 urban-population share (≥ 51% urban = Urban)");

  /* ------------------------------------------------------------------ */
  /* Draw bars                                                           */
  /* ------------------------------------------------------------------ */
  const bars = g.selectAll("g.bar-group")
    .data(grouped, d => d.classification)
    .join("g")
    .attr("class", d => `bar-group ${d.label.toLowerCase()}`)
    .attr("transform", d => `translate(0,${yScale(d.label)})`)
    .attr("tabindex", "0")
    .attr("role", "listitem")
    .attr("aria-label", d =>
      `${d.label} communities average ${d.avgDensity.toFixed(2)} Dollar General stores per 10,000 residents across ${d.placeCount} communities.`
    );

  bars.append("rect")
    .attr("class", "density-bar")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", d => xScale(d.avgDensity))
    .attr("height", yScale.bandwidth())
    .attr("fill", d => d.fill)
    .attr("fill-opacity", 0.78)
    .attr("stroke", d => d.stroke)
    .attr("stroke-width", 1)
    .attr("rx", 4);

  bars.append("text")
    .attr("class", "bar-value")
    .attr("x", d => xScale(d.avgDensity) + 8)
    .attr("y", yScale.bandwidth() / 2)
    .attr("dy", "0.35em")
    .text(d => `${d.avgDensity.toFixed(2)}/10k`);

  const countsEl = d3.select("#scatter-counts");
  if (!countsEl.empty()) {
    countsEl.selectAll(".scatter-count")
      .data(grouped, d => d.classification)
      .join("div")
      .attr("class", d => `scatter-count ${d.label.toLowerCase()}`)
      .html(d => `
        <span class="scatter-count-label">${d.label}</span>
        <span class="scatter-count-value">${d.placeCount} places, ${d.totalStores} stores</span>
      `);
  }

  /* Interaction — tooltip only. The chart itself is intentionally static:
     no highlight/dim on hover and no cross-linkage with the map markers. */
  bars
    .on("mouseover", (event, d) => {
      showBarTooltip(event, d);
    })
    .on("mousemove", (event) => {
      const el = document.getElementById("scatter-tooltip");
      if (el) {
        let left = event.clientX + 14;
        let top  = event.clientY + 14;
        const rect = el.getBoundingClientRect();
        if (left + rect.width  > window.innerWidth)  left = event.clientX - rect.width  - 14;
        if (top  + rect.height > window.innerHeight) top  = event.clientY - rect.height - 14;
        el.style.left = left + "px";
        el.style.top  = top  + "px";
      }
    })
    .on("mouseout", () => {
      document.getElementById("scatter-tooltip").style.display = "none";
    })
    .on("keydown", (event, d) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showBarTooltip(event, d);
      }
    });

  /* ------------------------------------------------------------------ */
  /* Tooltip                                                             */
  /* ------------------------------------------------------------------ */
  function showBarTooltip(event, d) {
    const el = document.getElementById("scatter-tooltip");
    el.style.display = "block";
    el.innerHTML = `
      <div class="tt-title">${d.label} Communities</div>
      <div class="tt-row"><span class="tt-label">Avg. density</span><span class="tt-value">${d.avgDensity.toFixed(2)}/10k</span></div>
      <div class="tt-row"><span class="tt-label">Avg. poverty</span><span class="tt-value">${(d.avgPoverty * 100).toFixed(1)}%</span></div>
      <div class="tt-row"><span class="tt-label">Places</span><span class="tt-value">${d.placeCount}</span></div>
      <div class="tt-row"><span class="tt-label">Stores</span><span class="tt-value">${d.totalStores}</span></div>
    `;
    let left = event.clientX + 14;
    let top  = event.clientY + 14;
    el.style.left = left + "px";
    el.style.top  = top  + "px";
  }
}
