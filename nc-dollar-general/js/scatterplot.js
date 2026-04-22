/* scatterplot.js — poverty rate vs store density with linked highlighting */
function initScatterplot(placeData) {

  /* ------------------------------------------------------------------ */
  /* Dimensions                                                          */
  /* ------------------------------------------------------------------ */
  const frame   = document.querySelector(".scatter-frame");
  const outerW  = frame.clientWidth  || 420;
  const outerH  = Math.round(outerW * 0.9);
  const margin  = { top: 16, right: 20, bottom: 52, left: 56 };
  const W       = outerW - margin.left - margin.right;
  const H       = outerH - margin.top  - margin.bottom;

  /* ------------------------------------------------------------------ */
  /* Scales                                                              */
  /* ------------------------------------------------------------------ */
  const xScale = d3.scaleLinear()
    .domain([0, d3.max(placeData, d => d.placePoverty) * 1.05])
    .range([0, W])
    .nice();

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(placeData, d => d.storesPerTenK) * 1.05])
    .range([H, 0])
    .nice();

  /* ------------------------------------------------------------------ */
  /* Encodings: shape + color (redundant) by classification             */
  /* Rural (< 5,000)  → coral circle  #f87171                          */
  /* Urban (5,000+)   → blue square   #60a5fa                          */
  /* ------------------------------------------------------------------ */
  const isRural = d => d.classification === "Rural (< 5,000)";

  function pointColor(d) { return isRural(d) ? "#f87171" : "#60a5fa"; }
  function pointStroke(d) { return isRural(d) ? "#ef4444" : "#3b82f6"; }

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
    .attr("class", "grid-x")
    .attr("transform", `translate(0,${H})`)
    .call(
      d3.axisBottom(xScale).tickSize(-H).tickFormat("")
    )
    .call(sel => sel.select(".domain").remove())
    .call(sel => sel.selectAll("line").attr("stroke", "#334155").attr("stroke-dasharray", "3,3"));

  g.append("g")
    .attr("class", "grid-y")
    .call(
      d3.axisLeft(yScale).tickSize(-W).tickFormat("")
    )
    .call(sel => sel.select(".domain").remove())
    .call(sel => sel.selectAll("line").attr("stroke", "#334155").attr("stroke-dasharray", "3,3"));

  /* Axes */
  g.append("g")
    .attr("class", "axis axis-x")
    .attr("transform", `translate(0,${H})`)
    .call(d3.axisBottom(xScale).tickFormat(d => `${(d * 100).toFixed(0)}%`).ticks(6));

  g.append("g")
    .attr("class", "axis axis-y")
    .call(d3.axisLeft(yScale).ticks(6));

  /* Axis labels */
  g.append("text")
    .attr("class", "axis-label")
    .attr("x", W / 2)
    .attr("y", H + 44)
    .attr("text-anchor", "middle")
    .text("Place Poverty Rate");

  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -H / 2)
    .attr("y", -44)
    .attr("text-anchor", "middle")
    .text("Stores per 10,000");

  /* ------------------------------------------------------------------ */
  /* Draw point marks                                                    */
  /* ------------------------------------------------------------------ */
  const symbolSize = 36;
  const circleR    = Math.sqrt(symbolSize / Math.PI);
  const squareHalf = Math.sqrt(symbolSize) / 2;

  const points = g.selectAll("g.scatter-point")
    .data(placeData, d => d.city)
    .join("g")
    .attr("class", "scatter-point")
    .attr("transform", d => `translate(${xScale(d.placePoverty)},${yScale(d.storesPerTenK)})`)
    .attr("tabindex", "0")
    .attr("role", "listitem")
    .attr("aria-label", d =>
      `${d.city}, ${d.county} County. ` +
      `Poverty rate: ${(d.placePoverty * 100).toFixed(1)}%. ` +
      `Store density: ${d.storesPerTenK.toFixed(2)} per 10,000. ` +
      `Classification: ${d.classification}.`
    );

  /* Rural → circle; Urban → square */
  points.each(function(d) {
    const sel = d3.select(this);
    if (isRural(d)) {
      sel.append("circle")
        .attr("r", circleR)
        .attr("fill", pointColor(d))
        .attr("fill-opacity", 0.65)
        .attr("stroke", pointStroke(d))
        .attr("stroke-width", 0.8);
    } else {
      sel.append("rect")
        .attr("x", -squareHalf)
        .attr("y", -squareHalf)
        .attr("width",  squareHalf * 2)
        .attr("height", squareHalf * 2)
        .attr("fill", pointColor(d))
        .attr("fill-opacity", 0.65)
        .attr("stroke", pointStroke(d))
        .attr("stroke-width", 0.8);
    }
  });

  /* Interaction */
  points
    .on("mouseover", (event, d) => {
      showScatterTooltip(event, d);
      highlightPoint(d.city);
      if (window.AppState.onMapHighlight) window.AppState.onMapHighlight(d.city);
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
      clearHighlight();
      if (window.AppState.onMapHighlight) window.AppState.onMapHighlight(null);
    })
    .on("keydown", (event, d) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showScatterTooltip(event, d);
        highlightPoint(d.city);
        if (window.AppState.onMapHighlight) window.AppState.onMapHighlight(d.city);
      }
    });

  /* ------------------------------------------------------------------ */
  /* Highlight / dim logic                                               */
  /* ------------------------------------------------------------------ */
  function highlightPoint(city) {
    points.classed("dimmed",      true)
          .classed("highlighted", false);
    points.filter(d => d.city === city)
          .classed("dimmed",      false)
          .classed("highlighted", true)
          .raise();
  }

  function clearHighlight() {
    points.classed("dimmed",      false)
          .classed("highlighted", false);
  }

  /* Register callback so map.js can trigger scatter highlights */
  window.AppState.onScatterHighlight = (city) => {
    if (city) highlightPoint(city);
    else      clearHighlight();
  };

  /* ------------------------------------------------------------------ */
  /* Tooltip                                                             */
  /* ------------------------------------------------------------------ */
  function showScatterTooltip(event, d) {
    const el = document.getElementById("scatter-tooltip");
    el.style.display = "block";
    el.innerHTML = `
      <div class="tt-title">${d.city} <span style="font-weight:400;color:#94a3b8">(${d.county} Co.)</span></div>
      <div class="tt-row"><span class="tt-label">Poverty rate</span><span class="tt-value">${(d.placePoverty * 100).toFixed(1)}%</span></div>
      <div class="tt-row"><span class="tt-label">Store density</span><span class="tt-value">${d.storesPerTenK.toFixed(2)}/10k</span></div>
      <div class="tt-row"><span class="tt-label">Classification</span><span class="tt-value">${d.classification}</span></div>
      <div class="tt-row"><span class="tt-label">Over-saturated</span><span class="tt-value" style="color:${d.overSaturated ? '#f87171' : '#86efac'}">${d.overSaturated ? "Yes" : "No"}</span></div>
    `;
    let left = event.clientX + 14;
    let top  = event.clientY + 14;
    el.style.left = left + "px";
    el.style.top  = top  + "px";
  }
}
