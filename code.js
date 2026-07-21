const rows = window.DASHBOARD_DATA.rows.map((d) => ({
  year: d[0],
  drug: d[1],
  generic: d[2],
  type: d[3],
  category: d[4],
  spend: d[5],
  beneficiaries: d[6],
  price: d[7]
}));

const colors = ['#245f8f', '#16827a', '#d09a2b', '#c64f3c', '#7357a5', '#2f7d5a', '#8b6234', '#55758d', '#b54874', '#4f8a42', '#a36d1f', '#336b9f'];
const byId = (id) => document.getElementById(id);
const fmtMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const fmtNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const fmtPct = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

const state = {
  category: 'All',
  startYear: 2019,
  endYear: 2022,
  type: 'All',
  threshold: 25,
  lineDrugCount: 8,
  page: 0
};

function init() {
  const categories = ['All', ...Array.from(new Set(rows.map((d) => d.category))).sort()];
  byId('categoryFilter').innerHTML = categories.map((c) => `<option>${c}</option>`).join('');
  bindControls();
  setPage(0);
  render();
}

function bindControls() {
  byId('categoryFilter').addEventListener('change', (e) => {
    state.category = e.target.value;
    render();
  });
  byId('yearStart').addEventListener('input', updateYears);
  byId('yearEnd').addEventListener('input', updateYears);
  document.querySelectorAll('input[name="drugType"]').forEach((el) => {
    el.addEventListener('change', (e) => {
      state.type = e.target.value;
      render();
    });
  });
  byId('spikeThreshold').addEventListener('input', (e) => {
    state.threshold = Number(e.target.value || 0);
    render();
  });
  byId('lineDrugCount').addEventListener('change', (e) => {
    state.lineDrugCount = Number(e.target.value);
    render();
  });
  document.querySelectorAll('.page-tab').forEach((tab) => {
    tab.addEventListener('click', () => setPage(Number(tab.dataset.page)));
  });
  window.addEventListener('resize', render);
}

function setPage(page) {
  state.page = page;
  byId('pageTrack').classList.toggle('page-1', page === 1);
  document.querySelectorAll('.page-tab').forEach((tab) => {
    tab.classList.toggle('active', Number(tab.dataset.page) === page);
  });
  requestAnimationFrame(render);
}

function updateYears() {
  let start = Number(byId('yearStart').value);
  let end = Number(byId('yearEnd').value);
  if (start > end) [start, end] = [end, start];
  state.startYear = start;
  state.endYear = end;
  byId('yearLabel').textContent = `${start}-${end}`;
  render();
}

function filteredRows() {
  return rows.filter((d) =>
    d.year >= state.startYear &&
    d.year <= state.endYear &&
    (state.category === 'All' || d.category === state.category) &&
    (state.type === 'All' || d.type === state.type)
  );
}

function render() {
  const data = filteredRows();
  renderKpis(data);
  renderLineChart(data);
  renderBarChart(data);
  renderCategoryChart(data);
  renderMixChart(data);
  renderScatter(data);
  renderHeatmap(data);
  renderSpikeChart(data);
  renderRiskChart(data);
}

function renderKpis(data) {
  const totalSpend = sum(data, (d) => d.spend);
  const genericSpend = sum(data.filter((d) => d.type === 'Generic'), (d) => d.spend);
  const yearly = group(data, (d) => d.year, (items) => sum(items, (d) => d.spend));
  const years = Object.keys(yearly).map(Number).sort();
  const growth = [];
  for (let i = 1; i < years.length; i++) {
    const prev = yearly[years[i - 1]];
    const curr = yearly[years[i]];
    if (prev > 0) growth.push(((curr - prev) / prev) * 100);
  }
  const spikes = countSpikeDrugs(data);
  byId('kpiSpend').textContent = fmtMoney.format(totalSpend);
  byId('kpiGrowth').textContent = growth.length ? `${fmtPct.format(avg(growth))}%` : 'n/a';
  byId('kpiGenericShare').textContent = totalSpend ? `${fmtPct.format((genericSpend / totalSpend) * 100)}%` : '0%';
  byId('kpiSpikes').textContent = fmtNumber.format(spikes);
}

function renderLineChart(data) {
  const el = byId('lineChart');
  const drugSpend = group(data, (d) => d.drug, (items) => sum(items, (d) => d.spend));
  const drugs = Object.entries(drugSpend).sort((a, b) => b[1] - a[1]).slice(0, state.lineDrugCount).map(([drug]) => drug);
  const series = drugs.map((drug, i) => {
    const items = data.filter((d) => d.drug === drug);
    const byYear = group(items, (d) => d.year, (ys) => weightedAvg(ys, (d) => d.price, (d) => d.spend));
    return { drug, color: colors[i % colors.length], values: Object.entries(byYear).map(([year, price]) => ({ year: Number(year), price })).sort((a, b) => a.year - b.year) };
  });
  if (!series.length) return empty(el);

  const svg = baseSvg(el);
  const { w, h } = size(el);
  const m = { t: 22, r: 230, b: 52, l: 86 };
  const plot = { x: m.l, y: m.t, w: w - m.l - m.r, h: h - m.t - m.b };
  const x = scaleLinear(state.startYear, state.endYear, plot.x, plot.x + plot.w);
  const maxY = Math.max(...series.flatMap((s) => s.values.map((v) => v.price)), 1);
  const y = scaleLinear(0, maxY * 1.08, plot.y + plot.h, plot.y);
  axes(svg, plot, x, y, [state.startYear, state.endYear], maxY, '$', yearTicks(state.startYear, state.endYear), (v) => Math.round(v));

  series.forEach((s) => {
    const path = s.values.map((v, idx) => `${idx ? 'L' : 'M'} ${x(v.year)} ${y(v.price)}`).join(' ');
    svgEl(svg, 'path', { d: path, fill: 'none', stroke: s.color, 'stroke-width': 2.6, 'stroke-linejoin': 'round' });
    s.values.forEach((v) => {
      const dot = svgEl(svg, 'circle', { cx: x(v.year), cy: y(v.price), r: 4, fill: s.color, stroke: '#fff', 'stroke-width': 1.5 });
      tip(dot, `<b>${s.drug}</b><br>${v.year}<br>Cost/unit: ${moneyFull(v.price)}`);
    });
  });

  const legend = svgEl(svg, 'g', { class: 'legend', transform: `translate(${plot.x + plot.w + 18}, ${plot.y + 2})` });
  series.forEach((s, i) => {
    svgEl(legend, 'rect', { x: 0, y: i * 30 + 3, width: 12, height: 12, fill: s.color, rx: 2 });
    wrappedText(legend, s.drug, 18, i * 30 + 13, 28, { fill: '#42505f', 'font-size': 11 });
  });
}

function renderBarChart(data) {
  const el = byId('barChart');
  const totals = ['Brand', 'Generic'].map((type) => ({ type, spend: sum(data.filter((d) => d.type === type), (d) => d.spend) }));
  if (!sum(totals, (d) => d.spend)) return empty(el);
  const svg = baseSvg(el);
  const { w, h } = size(el);
  const m = { t: 34, r: 36, b: 56, l: 90 };
  const plot = { x: m.l, y: m.t, w: w - m.l - m.r, h: h - m.t - m.b };
  const max = Math.max(...totals.map((d) => d.spend), 1);
  const x = (i) => plot.x + i * (plot.w / 2) + plot.w / 8;
  const barW = plot.w / 4;
  const y = scaleLinear(0, max * 1.12, plot.y + plot.h, plot.y);
  gridY(svg, plot, y, max, '$');
  totals.forEach((d, i) => {
    const bh = plot.y + plot.h - y(d.spend);
    const color = d.type === 'Brand' ? '#276fbf' : '#36875e';
    const rect = svgEl(svg, 'rect', { x: x(i), y: y(d.spend), width: barW, height: bh, fill: color, rx: 4 });
    tip(rect, `<b>${d.type}</b><br>Total spend: ${moneyFull(d.spend)}`);
    svgText(svg, fmtMoney.format(d.spend), x(i) + barW / 2, y(d.spend) - 8, { 'text-anchor': 'middle', fill: '#1c2630', 'font-weight': 700, 'font-size': 12 });
    svgText(svg, d.type, x(i) + barW / 2, plot.y + plot.h + 28, { 'text-anchor': 'middle', fill: '#617080', 'font-size': 12 });
  });
}

function renderCategoryChart(data) {
  const el = byId('categoryChart');
  const categories = Object.entries(group(data, (d) => d.category, (items) => sum(items, (d) => d.spend)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, spend]) => ({ category, spend }));
  if (!sum(categories, (d) => d.spend)) return empty(el);

  const svg = baseSvg(el);
  const { w, h } = size(el);
  const m = { t: 8, r: 58, b: 14, l: 128 };
  const plot = { x: m.l, y: m.t, w: w - m.l - m.r, h: h - m.t - m.b };
  const max = Math.max(...categories.map((d) => d.spend), 1);
  const rowH = plot.h / categories.length;
  const x = scaleLinear(0, max * 1.08, plot.x, plot.x + plot.w);

  categories.forEach((d, i) => {
    const y = plot.y + i * rowH + 5;
    const barH = Math.max(10, rowH - 10);
    const color = colors[i % colors.length];
    wrappedText(svg, d.category, 8, y + barH * 0.62, 17, { fill: '#42505f', 'font-size': 11, 'font-weight': 700 });
    const rect = svgEl(svg, 'rect', { x: plot.x, y, width: x(d.spend) - plot.x, height: barH, fill: color, opacity: 0.9, rx: 3 });
    tip(rect, `<b>${d.category}</b><br>Spend: ${moneyFull(d.spend)}`);
    svgText(svg, fmtMoney.format(d.spend), x(d.spend) + 7, y + barH * 0.66, { fill: '#1c2630', 'font-size': 11, 'font-weight': 760 });
  });
}

function renderMixChart(data) {
  const el = byId('mixChart');
  const years = yearTicks(state.startYear, state.endYear);
  const totals = years.map((year) => {
    const items = data.filter((d) => d.year === year);
    return {
      year,
      Brand: sum(items.filter((d) => d.type === 'Brand'), (d) => d.spend),
      Generic: sum(items.filter((d) => d.type === 'Generic'), (d) => d.spend)
    };
  });
  if (!sum(totals, (d) => d.Brand + d.Generic)) return empty(el);

  const svg = baseSvg(el);
  const { w, h } = size(el);
  const m = { t: 16, r: 24, b: 36, l: 66 };
  const plot = { x: m.l, y: m.t, w: w - m.l - m.r, h: h - m.t - m.b };
  const max = Math.max(...totals.map((d) => d.Brand + d.Generic), 1);
  const y = scaleLinear(0, max * 1.12, plot.y + plot.h, plot.y);
  const gap = 18;
  const barW = (plot.w - gap * Math.max(totals.length - 1, 0)) / Math.max(totals.length, 1);
  gridY(svg, plot, y, max, '$');

  totals.forEach((d, i) => {
    const x = plot.x + i * (barW + gap);
    const brandH = plot.y + plot.h - y(d.Brand);
    const genericH = plot.y + plot.h - y(d.Generic);
    const genericY = y(d.Generic);
    const brandY = genericY - brandH;
    const genericRect = svgEl(svg, 'rect', { x, y: genericY, width: barW, height: genericH, fill: '#2f7d5a', rx: 3 });
    const brandRect = svgEl(svg, 'rect', { x, y: brandY, width: barW, height: brandH, fill: '#245f8f', rx: 3 });
    tip(genericRect, `<b>${d.year} Generic</b><br>Spend: ${moneyFull(d.Generic)}`);
    tip(brandRect, `<b>${d.year} Brand</b><br>Spend: ${moneyFull(d.Brand)}`);
    svgText(svg, d.year, x + barW / 2, plot.y + plot.h + 23, { 'text-anchor': 'middle', fill: '#617080', 'font-size': 11 });
  });
  svgEl(svg, 'rect', { x: plot.x + plot.w - 112, y: 4, width: 10, height: 10, fill: '#245f8f', rx: 2 });
  svgText(svg, 'Brand', plot.x + plot.w - 96, 13, { fill: '#42505f', 'font-size': 11 });
  svgEl(svg, 'rect', { x: plot.x + plot.w - 54, y: 4, width: 10, height: 10, fill: '#2f7d5a', rx: 2 });
  svgText(svg, 'Generic', plot.x + plot.w - 38, 13, { fill: '#42505f', 'font-size': 11 });
}

function renderScatter(data) {
  const el = byId('scatterPlot');
  const byDrug = Object.values(group(data, (d) => d.drug, (items) => ({
    drug: items[0].drug,
    type: items[0].type,
    spend: sum(items, (d) => d.spend),
    beneficiaries: sum(items, (d) => d.beneficiaries),
    price: weightedAvg(items, (d) => d.price, (d) => d.spend)
  }))).sort((a, b) => b.spend - a.spend).slice(0, 450);
  if (!byDrug.length) return empty(el);
  const svg = baseSvg(el);
  const { w, h } = size(el);
  const m = { t: 24, r: 38, b: 62, l: 92 };
  const plot = { x: m.l, y: m.t, w: w - m.l - m.r, h: h - m.t - m.b };
  const maxX = percentile(byDrug.map((d) => d.beneficiaries), 0.98) || 1;
  const maxY = percentile(byDrug.map((d) => d.price), 0.98) || 1;
  const x = scaleLinear(0, maxX, plot.x, plot.x + plot.w);
  const y = scaleLinear(0, maxY, plot.y + plot.h, plot.y);
  axes(svg, plot, x, y, [0, maxX], maxY, '$', numericTicks(0, maxX, 5), (v) => fmtNumber.format(v));
  byDrug.forEach((d) => {
    const outlier = d.beneficiaries > maxX || d.price > maxY;
    const cx = clamp(x(Math.min(d.beneficiaries, maxX)), plot.x, plot.x + plot.w);
    const cy = clamp(y(Math.min(d.price, maxY)), plot.y, plot.y + plot.h);
    const r = clamp(Math.sqrt(d.spend) / 5200, 3, 13);
    const color = outlier ? '#c64f3c' : d.type === 'Generic' ? '#2f7d5a' : '#245f8f';
    const circle = svgEl(svg, 'circle', { cx, cy, r, fill: color, opacity: outlier ? 0.88 : 0.62, stroke: outlier ? '#7d2419' : '#fff', 'stroke-width': 1.2 });
    tip(circle, `<b>${d.drug}</b><br>${d.type}<br>Beneficiaries: ${fmtNumber.format(d.beneficiaries)}<br>Cost/unit: ${moneyFull(d.price)}<br>Spend: ${moneyFull(d.spend)}${outlier ? '<br><b>Outlier range</b>' : ''}`);
  });
  svgText(svg, 'Beneficiary count', plot.x + plot.w / 2, h - 14, { 'text-anchor': 'middle', fill: '#617080', 'font-size': 11 });
  svgText(svg, 'Cost per unit', 20, plot.y + plot.h / 2, { transform: `rotate(-90 20 ${plot.y + plot.h / 2})`, 'text-anchor': 'middle', fill: '#617080', 'font-size': 11 });
}

function renderHeatmap(data) {
  const el = byId('heatmap');
  const spendByDrug = group(data, (d) => d.drug, (items) => sum(items, (d) => d.spend));
  const drugs = Object.entries(spendByDrug).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([drug]) => drug);
  if (!drugs.length) return empty(el);
  const years = [2019, 2020, 2021, 2022].filter((y) => y >= state.startYear && y <= state.endYear);
  const table = drugs.map((drug) => {
    const items = data.filter((d) => d.drug === drug);
    const priceByYear = group(items, (d) => d.year, (ys) => weightedAvg(ys, (d) => d.price, (d) => d.spend));
    return { drug, values: years.map((year) => {
      const prev = priceByYear[year - 1];
      const curr = priceByYear[year];
      const change = prev && curr ? ((curr - prev) / prev) * 100 : null;
      return { year, change };
    }) };
  });

  const svg = baseSvg(el);
  const width = Math.max(el.clientWidth - 24, 620);
  const height = Math.max(el.clientHeight - 18, 390);
  const headerH = 34;
  const rowH = Math.max(29, Math.floor((height - headerH - 8) / Math.max(table.length, 1)));
  const labelW = Math.min(250, Math.max(188, width * 0.34));
  const cellW = (width - labelW - 8) / Math.max(years.length, 1);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.width = '100%';
  svg.style.height = '100%';
  years.forEach((year, i) => svgText(svg, year, labelW + i * cellW + cellW / 2, 24, { 'text-anchor': 'middle', fill: '#617080', 'font-size': 12, 'font-weight': 700 }));
  table.forEach((row, r) => {
    const y = headerH + r * rowH;
    wrappedText(svg, row.drug, 4, y + 13, Math.floor(labelW / 7.4), { fill: '#42505f', 'font-size': 11 });
    row.values.forEach((v, c) => {
      const x = labelW + c * cellW;
      const fill = heatColor(v.change);
      const attrs = { x, y, width: cellW - 6, height: rowH - 4, fill, rx: 3, stroke: Math.abs(v.change || 0) >= state.threshold ? '#17354d' : '#fff', 'stroke-width': Math.abs(v.change || 0) >= state.threshold ? 2 : 1 };
      const rect = svgEl(svg, 'rect', attrs);
      const label = v.change === null ? 'n/a' : `${fmtPct.format(v.change)}%`;
      tip(rect, `<b>${row.drug}</b><br>${v.year}<br>Price change: ${label}${Math.abs(v.change || 0) >= state.threshold ? '<br><b>Spike threshold met</b>' : ''}`);
      svgText(svg, label, x + (cellW - 6) / 2, y + Math.max(18, rowH * 0.62), { 'text-anchor': 'middle', fill: textForHeat(v.change), 'font-size': 11, 'font-weight': 760 });
    });
  });
}

function renderSpikeChart(data) {
  const el = byId('spikeChart');
  const spikes = spikeDetails(data)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 6);
  if (!spikes.length) return empty(el);

  const svg = baseSvg(el);
  const { w, h } = size(el);
  const m = { t: 8, r: 58, b: 16, l: 136 };
  const plot = { x: m.l, y: m.t, w: w - m.l - m.r, h: h - m.t - m.b };
  const max = Math.max(...spikes.map((d) => Math.abs(d.change)), 1);
  const rowH = plot.h / spikes.length;
  const x = scaleLinear(0, max * 1.08, plot.x, plot.x + plot.w);

  spikes.forEach((d, i) => {
    const y = plot.y + i * rowH + 5;
    const barH = Math.max(10, rowH - 10);
    const color = d.change >= 0 ? '#c64f3c' : '#2f7d5a';
    wrappedText(svg, d.drug, 8, y + barH * 0.62, 18, { fill: '#42505f', 'font-size': 11, 'font-weight': 700 });
    const rect = svgEl(svg, 'rect', { x: plot.x, y, width: x(Math.abs(d.change)) - plot.x, height: barH, fill: color, opacity: 0.9, rx: 3 });
    const label = `${d.change >= 0 ? '+' : ''}${fmtPct.format(d.change)}%`;
    tip(rect, `<b>${d.drug}</b><br>${d.prevYear}-${d.year}<br>Price change: ${label}<br>${moneyFull(d.prevPrice)} to ${moneyFull(d.price)}`);
    svgText(svg, label, x(Math.abs(d.change)) + 7, y + barH * 0.66, { fill: '#1c2630', 'font-size': 11, 'font-weight': 760 });
  });
}

function renderRiskChart(data) {
  const el = byId('riskChart');
  const spikes = spikeDetails(data).filter((d) => Math.abs(d.change) >= state.threshold);
  const ranked = Object.entries(group(spikes, (d) => d.category, (items) => items.length))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));
  if (!ranked.length) return empty(el);

  const svg = baseSvg(el);
  const { w, h } = size(el);
  const total = sum(ranked, (d) => d.count);
  const cx = Math.min(w * 0.34, 132);
  const cy = h / 2;
  const r = Math.min(66, h * 0.36, w * 0.18);
  let start = -Math.PI / 2;

  ranked.forEach((d, i) => {
    const angle = (d.count / total) * Math.PI * 2;
    const end = start + angle;
    const path = donutPath(cx, cy, r, r * 0.58, start, end);
    const slice = svgEl(svg, 'path', { d: path, fill: colors[i % colors.length], stroke: '#fff', 'stroke-width': 2 });
    tip(slice, `<b>${d.category}</b><br>Flagged drugs: ${fmtNumber.format(d.count)}<br>Share: ${fmtPct.format((d.count / total) * 100)}%`);
    start = end;
  });

  svgText(svg, fmtNumber.format(total), cx, cy - 2, { 'text-anchor': 'middle', fill: '#172532', 'font-size': 24, 'font-weight': 800 });
  svgText(svg, 'flagged', cx, cy + 17, { 'text-anchor': 'middle', fill: '#617080', 'font-size': 11, 'font-weight': 700 });
  ranked.forEach((d, i) => {
    const y = 22 + i * 28;
    svgEl(svg, 'rect', { x: w * 0.55, y: y - 10, width: 11, height: 11, fill: colors[i % colors.length], rx: 2 });
    wrappedText(svg, d.category, w * 0.55 + 18, y, 22, { fill: '#42505f', 'font-size': 11, 'font-weight': 700 });
    svgText(svg, fmtNumber.format(d.count), w - 14, y, { 'text-anchor': 'end', fill: '#172532', 'font-size': 11, 'font-weight': 800 });
  });
}

function axes(svg, plot, x, y, xDomain, maxY, prefix, xTicks, xFormat) {
  gridY(svg, plot, y, maxY, prefix);
  const ticks = unique(xTicks || [xDomain[0], xDomain[1]]);
  ticks.forEach((t) => {
    svgEl(svg, 'line', { x1: x(t), x2: x(t), y1: plot.y, y2: plot.y + plot.h, class: 'gridline' });
    svgText(svg, xFormat ? xFormat(t) : t, x(t), plot.y + plot.h + 24, { 'text-anchor': 'middle', fill: '#617080', 'font-size': 11 });
  });
}

function gridY(svg, plot, y, maxY, prefix) {
  [0, 0.25, 0.5, 0.75, 1].forEach((p) => {
    const val = maxY * p;
    const yy = y(val);
    svgEl(svg, 'line', { x1: plot.x, x2: plot.x + plot.w, y1: yy, y2: yy, class: 'gridline' });
    svgText(svg, prefix === '$' ? fmtMoney.format(val) : fmtNumber.format(val), plot.x - 8, yy + 4, { 'text-anchor': 'end', fill: '#617080', 'font-size': 11 });
  });
}

function baseSvg(el) {
  el.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.appendChild(svg);
  return svg;
}

function empty(el) {
  el.innerHTML = '<div class="empty">No data for the selected filters</div>';
}

function size(el) {
  return { w: el.clientWidth, h: el.clientHeight };
}

function svgEl(parent, name, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
  parent.appendChild(node);
  return node;
}

function svgText(parent, text, x, y, attrs = {}) {
  const node = svgEl(parent, 'text', { x, y, ...attrs });
  node.textContent = text;
  return node;
}

function wrappedText(parent, text, x, y, maxChars, attrs = {}) {
  const node = svgEl(parent, 'text', { x, y, ...attrs });
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  lines.slice(0, 2).forEach((part, i) => {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    tspan.setAttribute('x', x);
    tspan.setAttribute('dy', i === 0 ? 0 : 13);
    tspan.textContent = i === 1 && lines.length > 2 ? `${part.slice(0, Math.max(0, maxChars - 3))}...` : part;
    node.appendChild(tspan);
  });
  return node;
}

function tip(node, html) {
  const tooltip = byId('tooltip');
  node.addEventListener('mousemove', (e) => {
    tooltip.style.display = 'block';
    tooltip.style.left = `${e.clientX + 12}px`;
    tooltip.style.top = `${e.clientY + 12}px`;
    tooltip.innerHTML = html;
  });
  node.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });
}

function group(data, keyFn, valFn) {
  const map = {};
  data.forEach((d) => {
    const key = keyFn(d);
    (map[key] ||= []).push(d);
  });
  if (!valFn) return map;
  Object.keys(map).forEach((key) => { map[key] = valFn(map[key]); });
  return map;
}

function sum(data, fn) { return data.reduce((acc, d) => acc + (Number(fn(d)) || 0), 0); }
function avg(data) { return data.reduce((a, b) => a + b, 0) / data.length; }
function weightedAvg(data, valFn, weightFn) {
  const weight = sum(data, weightFn);
  return weight ? sum(data, (d) => valFn(d) * weightFn(d)) / weight : avg(data.map(valFn).filter(Number.isFinite));
}
function scaleLinear(d0, d1, r0, r1) {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}
function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.floor((sorted.length - 1) * p)];
}
function heatColor(v) {
  if (v === null || !Number.isFinite(v)) return '#eef2f6';
  const a = clamp(Math.abs(v) / 80, 0, 1);
  if (v >= 0) return blend('#fff4dd', '#c64f3c', a);
  return blend('#e5f2ec', '#2f7d5a', a);
}
function textForHeat(v) {
  if (v === null || Math.abs(v) < 45) return '#1c2630';
  return '#fff';
}
function blend(a, b, t) {
  const ah = hex(a), bh = hex(b);
  const c = ah.map((v, i) => Math.round(v + (bh[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
function hex(v) {
  return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function unique(arr) { return Array.from(new Set(arr)); }
function truncate(s, n) { return s.length > n ? `${s.slice(0, n - 1)}...` : s; }
function yearTicks(start, end) {
  return [2019, 2020, 2021, 2022].filter((v) => v >= start && v <= end);
}
function numericTicks(start, end, count) {
  const ticks = [];
  const step = (end - start) / Math.max(count - 1, 1);
  for (let i = 0; i < count; i++) ticks.push(start + step * i);
  return ticks;
}
function moneyFull(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v < 10 ? 2 : 0 }).format(v || 0);
}
function spikeDetails(data) {
  const byDrug = group(data, (d) => d.drug);
  const details = [];
  Object.values(byDrug).forEach((items) => {
    const byYear = group(items, (d) => d.year, (ys) => weightedAvg(ys, (d) => d.price, (d) => d.spend));
    const years = Object.keys(byYear).map(Number).sort();
    for (let i = 1; i < years.length; i++) {
      const prevYear = years[i - 1];
      const year = years[i];
      const prevPrice = byYear[prevYear];
      const price = byYear[year];
      if (prevPrice > 0 && Number.isFinite(price)) {
        details.push({
          drug: items[0].drug,
          category: items[0].category,
          prevYear,
          year,
          prevPrice,
          price,
          change: ((price - prevPrice) / prevPrice) * 100
        });
      }
    }
  });
  return details;
}
function countSpikeDrugs(data) {
  const byDrug = group(data, (d) => d.drug);
  let count = 0;
  Object.values(byDrug).forEach((items) => {
    const byYear = group(items, (d) => d.year, (ys) => weightedAvg(ys, (d) => d.price, (d) => d.spend));
    const years = Object.keys(byYear).map(Number).sort();
    if (years.some((year) => byYear[year - 1] && Math.abs(((byYear[year] - byYear[year - 1]) / byYear[year - 1]) * 100) >= state.threshold)) count++;
  });
  return count;
}
function donutPath(cx, cy, outerR, innerR, start, end) {
  if (end - start >= Math.PI * 2) end = start + Math.PI * 2 - 0.0001;
  const large = end - start > Math.PI ? 1 : 0;
  const p1 = polar(cx, cy, outerR, end);
  const p2 = polar(cx, cy, outerR, start);
  const p3 = polar(cx, cy, innerR, start);
  const p4 = polar(cx, cy, innerR, end);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${outerR} ${outerR} 0 ${large} 0 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${innerR} ${innerR} 0 ${large} 1 ${p4.x} ${p4.y}`,
    'Z'
  ].join(' ');
}
function polar(cx, cy, r, angle) {
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

init();
