/* ruralPovertySummary.js — store-weighted rural place poverty vs county */
function initRuralPovertySummary(placeData) {
  const svgEl = document.getElementById("rural-poverty-bar");
  const statsUl = document.getElementById("rural-poverty-stats");
  const noteEl = document.getElementById("rural-poverty-note");
  if (!svgEl || !statsUl) return;

  const epsP = 0.0005;
  const ruralWithStores = placeData.filter(
    d => d.classification === "Rural" && d.storeCount > 0
  );

  let higher = 0;
  let lower = 0;
  let same = 0;
  let excludedStores = 0;

  ruralWithStores.forEach(d => {
    const okPl = d.placePoverty != null && Number.isFinite(d.placePoverty);
    const okCo = d.countyPoverty != null && Number.isFinite(d.countyPoverty);
    if (!okPl || !okCo) {
      excludedStores += d.storeCount;
      return;
    }
    const w = d.storeCount;
    const diff = d.placePoverty - d.countyPoverty;
    if (Math.abs(diff) < epsP) same += w;
    else if (diff > 0) higher += w;
    else lower += w;
  });

  const total = higher + lower + same;
  const pct = v => (total > 0 ? (100 * v) / total : 0);
  const r0 = n => (Number.isFinite(n) ? n.toFixed(0) : "0");

  const pH = pct(higher);
  const pL = pct(lower);
  const pS = pct(same);

  statsUl.innerHTML = `
    <li><span>Place poverty <strong>higher</strong> than county poverty <span class="rural-pct-def">(store share)</span></span><strong>${r0(pH)}%</strong></li>
    <li><span>Place poverty <strong>lower</strong> than county poverty</span><strong>${r0(pL)}%</strong></li>
    <li><span>Place poverty <strong>about the same</strong> as county poverty</span><strong>${r0(pS)}%</strong></li>
  `;

  if (noteEl) {
    if (excludedStores > 0) {
      noteEl.textContent =
        `${excludedStores.toLocaleString()} Dollar General store locations in rural places ` +
        `were excluded where place or county poverty was missing. Percentages use only locations with both rates.`;
      noteEl.hidden = false;
    } else {
      noteEl.textContent = "";
      noteEl.hidden = true;
    }
  }

  const W = 640;
  const H = 72;
  const margin = { left: 24, right: 24, top: 8, bottom: 28 };
  const barW = W - margin.left - margin.right;
  const barY = margin.top + 8;
  const barH = 22;

  const d3s = d3.select(svgEl);
  d3s.attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", "100%")
    .attr("height", H);
  d3s.selectAll("*").remove();

  const aria =
    `Rural Dollar General store-weighted shares: ${r0(pH)} percent higher place poverty than county, ` +
    `${r0(pL)} percent lower, ${r0(pS)} percent about the same.`;
  d3s.attr("aria-label", aria);

  const g = d3s.append("g").attr("transform", `translate(${margin.left},${barY})`);

  const segments = [
    { w: pH, fill: "#f87171", label: "Higher" },
    { w: pS, fill: "#64748b", label: "Same" },
    { w: pL, fill: "#4ade80", label: "Lower" },
  ];

  let x = 0;
  const scale = barW / 100;
  segments.forEach(seg => {
    const segW = Math.max(0, seg.w * scale);
    if (segW < 0.5) return;
    g.append("rect")
      .attr("x", x)
      .attr("y", 0)
      .attr("width", segW)
      .attr("height", barH)
      .attr("fill", seg.fill)
      .attr("rx", 3);
    x += segW;
  });

  g.append("text")
    .attr("class", "rural-poverty-axis")
    .attr("x", 0)
    .attr("y", barH + 18)
    .attr("fill", "#a8b7d0")
    .attr("font-size", "11px")
    .text("0%");

  g.append("text")
    .attr("class", "rural-poverty-axis")
    .attr("x", barW)
    .attr("y", barH + 18)
    .attr("text-anchor", "end")
    .attr("fill", "#a8b7d0")
    .attr("font-size", "11px")
    .text("100%");

  g.append("text")
    .attr("class", "rural-poverty-axis")
    .attr("x", barW / 2)
    .attr("y", barH + 18)
    .attr("text-anchor", "middle")
    .attr("fill", "#a8b7d0")
    .attr("font-size", "11px")
    .text("Share of rural DG stores (by place poverty vs. county)");
}
