//index.js
// Globals
let currentScene = 0;
let allData = [];
let vaccination = [];
let yearList = [];
const width = 900, height = 600;
const svg = d3.select("#chart");
const margin = { top: 40, right: 30, bottom: 50, left: 60 };
let pendingTimeouts = [];
let regressionModel; // store model to avoid recomputing if needed
let brandPctMap = {};  // vaccine brand % map

//legends and colors to be used consistently among scenes
const vaxGroups = [
  { label: "Below Mean (<68%)", color: "red", shape: d3.symbolCircle },
  { label: "Above Mean (68%-78%)", color: "gold", shape: d3.symbolTriangle },
  { label: "Above 1 S.D. (78%+)", color: "green", shape: d3.symbolStar }
];

const groupColors = Object.fromEntries(vaxGroups.map(g => [g.label, g.color]));

// Load all CSVs and and bring up all visuals
Promise.all([
  d3.csv("data/us-states.csv", d3.autoType),
  d3.csv("data/co-est2019-alldata.csv", d3.autoType),
  d3.csv("data/state_abbrev.csv"),
  d3.csv("data/COVID-19_Vaccinations_in_the_United_States_Jurisdiction_20250616.csv", d => {
    const parsedDate = new Date(d.Date);
    if (!(parsedDate instanceof Date) || isNaN(parsedDate)) return null;

    const result = {
      ...d,
      date: parsedDate,
      vaccination_rate: +d.Administered_Dose1_Pop_Pct || 0,
      state_code: d.Location
    };

    return result;
  })
]).then(([covid, population, abbrev, vaxData]) => {
  vaccination = vaxData.filter(d => d !== null && d.date.getFullYear() >= 2021);
  vaccination.sort((a, b) => a.date - b.date);

  /*
  console.log("📁 covid rows:", covid.length, "Sample:", covid[0]);
  console.log("📁 population rows:", population.length, "Sample:", population[0]);
  console.log("📁 abbrev rows:", abbrev.length, "Sample:", abbrev[0]);
  console.log("📁 vaccination rows:", vaccination.length, "Sample:", vaccination[0]);
  /**/

  /*
  console.log("📅 COVID first date:", covid[0].date);
  console.log("📅 COVID last date:", covid.at(-1).date);
  console.log("📅 Vax first date:", vaccination[0].date);
  console.log("📅 Vax last date:", vaccination.at(-1).date);
  /**/

  // Preprocess population
  const popMap = {};
  population.forEach(d => {
    if (d.SUMLEV === 40) popMap[d.STNAME] = d.POPESTIMATE2019;
  });

  //console.log("popMap:", popMap);

  // Preprocess abbrev
  const abbrevMap = {};
  abbrev.forEach(d => {
    abbrevMap[d.state] = d.state_code;
  });

  //console.log("abbrevMap:", abbrevMap);

  covid.forEach(d => {
    d.population = popMap[d.state];
    d.cases_per_100k = d.cases / d.population * 100000;
    d.deaths_per_100k = d.deaths / d.population * 100000;
    d.state_code = abbrevMap[d.state];
    d.date = new Date(d.date);
  });

  //console.log("🔍 covid sample with vax fields:", covid.find(d => d.state === "California"));

  // Map vax rate by date + state_code
  const vacMap = {};
  vaccination.forEach(d => {
    const key = `${d.date.toISOString().split("T")[0]}|${d.state_code}`;
    vacMap[key] = +d.vaccination_rate;
  });

  covid.forEach(d => {
    const key = `${d.date.toISOString().split("T")[0]}|${d.state_code}`;
    d.vaccination_rate = vacMap[key] || null;
  });

  allData = covid.filter(d => d.vaccination_rate != null);

  //console.log("allData:", allData);

  // Extract unique years
  yearList = Array.from(new Set(allData.map(d => d.date.getFullYear()))).sort();
  populateYearDropdown();

  updateScene(); // Show initial scene
  attachButtonEvents();
});

function populateYearDropdown() {
  const select = d3.select("#year-select");
  select.selectAll("option")
    .data(yearList)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => d);
  select.on("change", () => updateScene());
}

function attachButtonEvents() {
  d3.select("#next-btn").on("click", () => {
    if (currentScene < 2) currentScene++;
    updateScene();
  });
  d3.select("#prev-btn").on("click", () => {
    if (currentScene > 0) currentScene--;
    updateScene();
  });
}

function updateScene() {
  d3.select("#next-hint").text("").style("opacity", 0);
  
  const year = +d3.select("#year-select").property("value") || d3.max(yearList);

  const sceneText = [
    "Scene 1: Overview - Average Deaths per Vaccination Group",
    "Scene 2: Deaths vs Cases for each state grouped by Vaccination Level",
    "Scene 3: Explore Infection vs Vaccination",
  ];
  d3.select("#scene-description").text(sceneText[currentScene]);

  // Clear SVG (pending timeouts, hint and annotation)
  svg.selectAll("*").remove();
  pendingTimeouts.forEach(clearTimeout);
  pendingTimeouts = [];
  //d3.select("#next-hint").text("").style("opacity", 0);
  svg.selectAll(".scene-hint").remove();  // class to mark scene-specific annotations

  const filtered = allData.filter(d => d.date.getFullYear() === year);

  //20250715: debug latest week data issue
  //const latest = d3.rollups(filtered, v => v.at(-1), d => d.state)
  const latest = d3.rollups(filtered, v => {
    // Sort by date descending (latest first)
    v.sort((a, b) => b.date - a.date);
    // Prefer the most recent one with vax data
    return v.find(row => row.vax18 != null && row.vax65 != null) || v[0];
  }, d => d.state)
    .map(d => d[1])
    .filter(d => d.vaccination_rate != null);

  latest.forEach(d => {
    const yearVaxRows = vaccination
      .filter(v => v.state_code === d.state_code && v.date.getFullYear() === year)
      .sort((a, b) => b.date - a.date);  // latest first

    const bestRow = yearVaxRows.find(v =>
      +v.Series_Complete_18PlusPop_Pct > 0 && +v.Series_Complete_65PlusPop_Pct > 0
    );

    d.vax18 = bestRow ? +bestRow.Series_Complete_18PlusPop_Pct : null;
    d.vax65 = bestRow ? +bestRow.Series_Complete_65PlusPop_Pct : null;
  });

  //vaccine brands based on selected year
  brandPctMap = {};
  const yearVax = vaccination.filter(d => d.date.getFullYear() === year);
  const latestBrandRow = d3.rollups(
    yearVax,
    v => v.at(-1),
    d => d.state_code
  );

  latestBrandRow.forEach(([stateCode, row]) => {
    const total = +row.Series_Complete_Yes;
    if (!total || total === 0) return;

    brandPctMap[stateCode] = {
      Pfizer: 100 * (+row.Series_Complete_Pfizer || 0) / total,
      Moderna: 100 * (+row.Series_Complete_Moderna || 0) / total,
      Janssen: 100 * (+row.Series_Complete_Janssen || 0) / total,
      Novavax: 100 * (+row.Series_Complete_Novavax || 0) / total
    };
  });
  gotoScene(currentScene, latest);
}

function classifyVax(rate) {
  if (rate >= 78) return "Above 1 S.D. (78%+)";
  else if (rate >= 68) return "Above Mean (68%-78%)";
  else return "Below Mean (<68%)";
}

function gotoScene(scene, data) {
  // Prepare vax group
  data.forEach(d => d.vax_group = classifyVax(d.vaccination_rate));

  if (scene === 0) {
    drawScene1(data);
  } else if (scene === 1) {
    drawScene2(data);
  } else if (scene === 2) {
    drawScene3(data);
  }
}

//Overall Death vs vaccination level
function drawScene1(data) {
  const groupOrder = vaxGroups.map(g => g.label);

  // Compute mean deaths per group
  const groupedMap = d3.rollup(
    data,
    v => d3.mean(v, d => d.deaths_per_100k),
    d => d.vax_group
  );

  // Ensure fixed order for bars
  const barData = groupOrder.map(group => ({
    group,
    avg: groupedMap.get(group) || 0
  }));

  const x = d3.scaleBand()
    .domain(barData.map(d => d.group))
    .range([margin.left, width - margin.right])
    .padding(0.2);

  const y = d3.scaleLinear()
    .domain([0, d3.max(barData, d => d.avg)]).nice()
    .range([height - margin.bottom, margin.top]);

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  var trans_time = 800 //ms
  var draw_delay = 1000 //ms

  svg.selectAll("rect")
  .data(barData)
  .enter()
  .append("rect")
  .attr("x", d => x(d.group))
  .attr("width", x.bandwidth())
  .attr("y", y(0))
  .attr("height", 0)
  .attr("fill", d => groupColors[d.group])
  .transition()
  .delay((_, i) => i * draw_delay)
  .duration(trans_time)
  .attr("y", d => y(d.avg))
  .attr("height", d => y(0) - y(d.avg));

  svg.append("text")
    .attr("x", width / 2).attr("y", height - 10)
    .attr("text-anchor", "middle")
    .text("Vaccination Group");

  svg.append("text")
    .attr("x", -height / 2).attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .text("Avg Deaths per 100k");

  // annotation text
  pendingTimeouts.push(setTimeout(() => {
    svg.append("text")
      .attr("class", "scene-hint")
      .attr("x", width / 2)
      .attr("y", margin.top - 10)
      .attr("text-anchor", "middle")
      .attr("font-size", "16px")
      .attr("fill", "gray")
      .style("opacity", 0)
      .text("Higher vaccination levels are associated with lower average death rates.")
      .transition()
      .duration(trans_time)
      .style("opacity", 1);
  }, 3000));

  // hint text near next button
  pendingTimeouts.push(setTimeout(() => {
    pendingTimeouts.push(setTimeout(() => {
      d3.select("#next-hint")
        .text("◀ Click to explore: State-level deaths vs. cases")
        .transition()
        .duration(trans_time)
        .style("opacity", 1);
    }, 1000));
  }, 3000)); // outer delay: bar animation duration
}

function drawScene2(data, withAnnotation = false) {
  const xExtent = d3.extent(data, d => d.cases_per_100k);
  const yExtent = d3.extent(data, d => d.deaths_per_100k);

  const x = d3.scaleLinear()
    .domain([xExtent[0] * 0.95, xExtent[1] * 1.05])
    .range([margin.left, width - margin.right]);

  const y = d3.scaleLinear()
    .domain([yExtent[0] * 0.95, yExtent[1] * 1.05])
    .range([height - margin.bottom, margin.top]);

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  const xMedian = d3.median(data, d => d.cases_per_100k);
  const yMedian = d3.median(data, d => d.deaths_per_100k);

  // Vertical line for avg cases
  svg.append("line")
    .attr("x1", x(xMedian)).attr("x2", x(xMedian))
    .attr("y1", margin.top).attr("y2", height - margin.bottom)
    .attr("stroke", "gray").attr("stroke-dasharray", "4 4").lower();

  // Horizontal line for avg deaths
  svg.append("line")
    .attr("x1", margin.left).attr("x2", width - margin.right)
    .attr("y1", y(yMedian)).attr("y2", y(yMedian))
    .attr("stroke", "gray").attr("stroke-dasharray", "4 4").lower();

  //legend box and tooltip
  const shaped_dots = d3.symbol().type(getShape).size(100);

  const activeGroups = new Set(vaxGroups.map(g => g.label));
  drawLegendBox(svg, groupColors, activeGroups, () => {
    updateFilteredDots(svg, data, x, y, shaped_dots, groupColors, activeGroups, "scene2");
  });

  updateFilteredDots(svg, data, x, y, shaped_dots, groupColors, activeGroups, "scene2");

  svg.append("text")
    .attr("x", width / 2).attr("y", height - 10)
    .attr("text-anchor", "middle")
    .text("Cases per 100k");

  svg.append("text")
    .attr("x", -height / 2).attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .text("Deaths per 100k");

  if (withAnnotation) {
    const maxState = data.reduce((a, b) => a.deaths_per_100k > b.deaths_per_100k ? a : b);
    const annotations = [{
      note: { label: "Highest death rate", title: maxState.state },
      x: x(maxState.cases_per_100k),
      y: y(maxState.deaths_per_100k),
      dy: -30,
      dx: -30
    }];
    const makeAnnotations = d3.annotation().annotations(annotations);
    svg.append("g").call(makeAnnotations);
  }
}

function drawScene3(data) {
  const xExtent = d3.extent(data, d => d.vaccination_rate);
  const x = d3.scaleLinear()
    .domain([xExtent[0] * 0.98, xExtent[1] * 1.02])  // add slight margin
    .range([margin.left, width - margin.right]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.cases_per_100k)]).nice()
    .range([height - margin.bottom, margin.top]);

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d => d + "%"));

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  let activeGroups = new Set(["Above 1 S.D. (78%+)", "Above Mean (68%-78%)", "Below Mean (<68%)"]);

  const shaped_dots = d3.symbol().type(getShape).size(100);

  // Draw legend + hook up toggling
  drawLegendBox(svg, groupColors, activeGroups, () => {
    updateFilteredDots(svg, data, x, y, shaped_dots, groupColors, activeGroups, "scene3");
  });
  updateFilteredDots(svg, data, x, y, shaped_dots, groupColors, activeGroups, "scene3");

  svg.append("text")
    .attr("x", width / 2).attr("y", height - 10)
    .attr("text-anchor", "middle")
    .text("Vaccination Rate (%)");

  svg.append("text")
    .attr("x", -height / 2).attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .text("Cases per 100k");
}

//shared consistent looks for Scene 2 and Scene 3
function getShape(d) {
  const entry = vaxGroups.find(g => g.label === d.vax_group);
  return entry ? entry.shape : d3.symbolCircle;
}

//legend box
function drawLegendBox(svg, groupColors, activeGroups, updateFn) {
  const legendGroups = [
    { label: "Above 1 S.D. (78%+)", color: "green", shape: d3.symbolStar },
    { label: "Above Mean (68%-78%)", color: "gold", shape: d3.symbolTriangle },
    { label: "Below Mean (<68%)", color: "red", shape: d3.symbolCircle }
  ];

  const legend = svg.append("g")
    .attr("class", "legend-box")
    .attr("transform", `translate(${width - 200}, ${margin.top})`);

  legend.append("text")
    .attr("x", 0)
    .attr("y", -25)
    .attr("font-weight", "bold")
    .attr("font-size", "12px")
    .call(text => {
      text.append("tspan").attr("x", 0).attr("dy", "1em").text("Filter by Vaccination Level");
      text.append("tspan").attr("x", 0).attr("dy", "1em").text("(click labels below)");
    });

  const legendItems = legend.selectAll(".legend-item")
    .data(legendGroups)
    .enter()
    .append("g")
    .attr("class", "legend-item")
    .attr("transform", (_, i) => `translate(0, ${i * 30 + 20})`)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      if (activeGroups.has(d.label)) {
        activeGroups.delete(d.label);
      } else {
        activeGroups.add(d.label);
      }
      updateFn();
    });

  legendItems.append("path")
    .attr("transform", "translate(0, 0)")
    .attr("d", d => d3.symbol().type(d.shape).size(100)())
    .attr("fill", d => d.color)
    .attr("stroke", "black");

  legendItems.append("text")
    .attr("x", 20)
    .attr("y", 5)
    .attr("font-size", "12px")
    .attr("fill", "#0645AD")
    .style("text-decoration", "underline")
    .text(d => d.label);

  setTimeout(() => {
    const bbox = legend.node().getBBox();
    legend.insert("rect", ":first-child")
      .attr("x", bbox.x - 10)
      .attr("y", bbox.y - 10)
      .attr("width", bbox.width + 40)
      .attr("height", bbox.height + 20)
      .attr("fill", "#f9f9f9")
      .attr("stroke", "#ccc")
      .attr("rx", 6)
      .attr("ry", 6);
  }, 0);
}

//hover 
function updateFilteredDots(svg, data, x, y, shaped_dots, groupColors, activeGroups, mode = "scene2") {
  svg.selectAll(".data-dot").remove();

  const filtered = data.filter(d => activeGroups.has(d.vax_group));

  svg.selectAll(".data-dot")
    .data(filtered)
    .enter()
    .append("path")
    .attr("class", "data-dot")
    .attr("d", shaped_dots)
    .attr("transform", d => {
      const xVal = mode === "scene3" ? d.vaccination_rate : d.cases_per_100k;
      const yVal = mode === "scene3" ? d.cases_per_100k : d.deaths_per_100k;
      return `translate(${x(xVal)},${y(yVal)})`;
    })
    .attr("fill", d => groupColors[d.vax_group] || "gray")
    .attr("opacity", 0.8)
    .append("title")
    .text(d => {
      const lines = [];
      lines.push(`${d.state}`);
      lines.push(`Deaths/100k: ${d.deaths_per_100k.toFixed(1)}`);
      lines.push(`Cases/100k: ${d.cases_per_100k.toFixed(0)}`);
      //lines.push(`Vax Rate: ${d.vaccination_rate.toFixed(1)}%`);

      if (d.vax18 != null) lines.push(`18+ Complete: ${d.vax18.toFixed(1)}%`);
      if (d.vax65 != null) lines.push(`65+ Complete: ${d.vax65.toFixed(1)}%`);

      const brandPct = brandPctMap[d.state_code];
      if (brandPct) {
        const brandEntries = Object.entries(brandPct)
          .filter(([_, pct]) => pct > 25 || pct > 60)
          .sort((a, b) => b[1] - a[1])
          .map(([brand, pct]) => `${brand}: ${pct.toFixed(1)}%`);

        if (brandEntries.length > 0) {
          lines.push("Main Vaccine(s):");
          lines.push(...brandEntries.slice(0, 2));
        }
      }

      return lines.join("\n");
    });
}
