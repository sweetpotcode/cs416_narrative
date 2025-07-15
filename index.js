// Globals
let currentScene = 0;
let allData = [];
let yearList = [];
const width = 900, height = 600;
const svg = d3.select("#chart");
const margin = { top: 40, right: 30, bottom: 50, left: 60 };
let pendingTimeouts = [];
let regressionModel; // store model to avoid recomputing if needed


// Load all CSVs and and bring up all visuals
Promise.all([
  d3.csv("data/us-states.csv", d3.autoType),
  d3.csv("data/co-est2019-alldata.csv", d3.autoType),
  d3.csv("data/state_abbrev.csv"),
  d3.csv("data/COVID-19_Vaccinations_in_the_United_States_Jurisdiction_20250616.csv", d => {
    const parsedDate = new Date(d.Date);
    return parsedDate instanceof Date && !isNaN(parsedDate)
      ? {
          ...d,
          date: parsedDate,
          vaccination_rate: +d.Administered_Dose1_Pop_Pct || 0,
          state_code: d.Location
        }
      : null;
  })
]).then(([covid, population, abbrev, vaccination]) => {
  vaccination = vaccination.filter(d => d !== null);

  // 1. Preprocess brand % map: { "state_code" -> { Pfizer: 40, Moderna: 50, Janssen: 9 } }
  const brandPctMap = {};

  const latestByState = d3.rollups(
    vaccination,
    v => v.at(-1),
    d => d.state_code
  );

  latestByState.forEach(([stateCode, row]) => {
    const total = +row.Series_Complete_Yes;
    if (!total || total === 0) return;

    brandPctMap[stateCode] = {
      Pfizer: 100 * (+row.Series_Complete_Pfizer || 0) / total,
      Moderna: 100 * (+row.Series_Complete_Moderna || 0) / total,
      Janssen: 100 * (+row.Series_Complete_Janssen || 0) / total,
      Novavax: 100 * (+row.Series_Complete_Novavax || 0) / total
    };
  });

  //vaccination.sort((a, b) => a.date - b.date);
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

  console.log("popMap:", popMap);

  // Preprocess abbrev
  const abbrevMap = {};
  abbrev.forEach(d => {
    abbrevMap[d.state] = d.state_code;
  });

  //console.log("abbrevMap:", abbrevMap);

  //0710 align date range
  //const vaxStart = new Date("2021-01-01");
  //covid = covid.filter(d => d.date >= vaxStart);

  // 20250714 old Merge COVID and population
  /*
  covid.forEach(d => {
    d.population = popMap[d.state];
    d.cases_per_100k = d.cases / d.population * 100000;
    d.deaths_per_100k = d.deaths / d.population * 100000;
    d.state_code = abbrevMap[d.state];
    d.date = new Date(d.date);
    //Don 0710: debug blank load
    //const parsedDate = new Date(d.date);
    //date = parsedDate instanceof Date && !isNaN(parsedDate) ? parsedDate : null;
  });

  //to align data range to join
  //const vaxStart = new Date("2021-01-01");
  //covid = covid.filter(d => d.date >= vaxStart);

  // Merge vaccination by date + state_code
  const vacMap = {};
  vaccination.forEach(d => {
    const key = `${d.date.toISOString().split("T")[0]}|${d.state_code}`;
    vacMap[key] = d.vaccination_rate = +d.vaccination_rate;
  });

  //console.log("vacMap:", vacMap);

  covid.forEach(d => {
    const key = `${d.date.toISOString().split("T")[0]}|${d.state_code}`;
    d.vaccination_rate = vacMap[key] || null;
  });

  allData = covid.filter(d => d.vaccination_rate != null);
  /** */

  // 20250714 new Merge COVID, population, and vaccination metrics
  /** */
  covid.forEach(d => {
    d.population = popMap[d.state];
    d.cases_per_100k = d.cases / d.population * 100000;
    d.deaths_per_100k = d.deaths / d.population * 100000;
    d.state_code = abbrevMap[d.state];
    d.date = new Date(d.date);

    // Add age-group completion %
    const latest = latestByState.find(([code]) => code === d.state_code)?.[1];
    if (latest) {
      d.vax18 = +latest.Series_Complete_18PlusPop_Pct || null;
      d.vax65 = +latest.Series_Complete_65PlusPop_Pct || null;
    }
  });

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
  /** */

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

  // Clear SVG
  svg.selectAll("*").remove();

  // Cancel any pending timeouts
  pendingTimeouts.forEach(clearTimeout);
  pendingTimeouts = [];

  // Remove hint and annotation text immediately
  d3.select("#next-hint").text("").style("opacity", 0);
  svg.selectAll(".scene-hint").remove();  // class to mark scene-specific annotations

  const filtered = allData.filter(d => d.date.getFullYear() === year);
  const latest = d3.rollups(filtered, v => v.at(-1), d => d.state)
    .map(d => d[1])
    .filter(d => d.vaccination_rate != null);

  //console.log("✅ Filtered data for year:", year);
  //console.log("✅ Plotting this many points:", latest.length);
  //console.log("Sample row:", latest[0]);

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
  const groupColors = {
    "Above 1 S.D. (78%+)": "green",
    "Above Mean (68%-78%)": "gold",
    "Below Mean (<68%)": "red"
  };

  // Enforce group display order
  const groupOrder = [
    "Below Mean (<68%)",
    "Above Mean (68%-78%)",
    "Above 1 S.D. (78%+)"
  ];

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
  const groupColors = {
    "Above 1 S.D. (78%+)": "green",
    "Above Mean (68%-78%)": "gold",
    "Below Mean (<68%)": "red"
  };

  const xExtent = d3.extent(data, d => d.cases_per_100k);
  const yExtent = d3.extent(data, d => d.deaths_per_100k);

  const x = d3.scaleLinear()
    .domain([xExtent[0] * 0.95, xExtent[1] * 1.05])
    .range([margin.left, width - margin.right]);

  const y = d3.scaleLinear()
    .domain([yExtent[0] * 0.95, yExtent[1] * 1.05])
    .range([height - margin.bottom, margin.top]);

  const legendGroups = [
    { label: "Above 1 S.D. (78%+)", color: "green", shape: d3.symbolStar },
    { label: "Above Mean (68%-78%)", color: "gold", shape: d3.symbolTriangle },
    { label: "Below Mean (<68%)", color: "red", shape: d3.symbolCircle }
  ];

  let activeGroups = new Set(legendGroups.map(g => g.label));

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  const legend = svg.append("g")
    .attr("class", "legend-box")
    .attr("transform", `translate(${width - 200}, ${margin.top})`);  // shift left for more space

  // Title with better wording
  legend.append("text")
    .attr("x", 0)
    .attr("y", -25)
    .attr("font-weight", "bold")
    .attr("font-size", "12px")
    .text("")
    .call(text => {
      text.append("tspan").attr("x", 0).attr("dy", "1em").text("Filter by Vaccination Level");
      text.append("tspan").attr("x", 0).attr("dy", "1em").text("(click labels below)");
    });

  // Group container
  const legendItems = legend.selectAll(".legend-item")
    .data(legendGroups)
    .enter()
    .append("g")
    .attr("class", "legend-item")
    .attr("transform", (_, i) => `translate(0, ${i * 30 + 20})`)  // more vertical spacing
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      if (activeGroups.has(d.label)) {
        activeGroups.delete(d.label);
      } else {
        activeGroups.add(d.label);
      }
      updateFilteredDots();
    });

  //addshaped dots
  legendItems.append("path")
    .attr("transform", "translate(0, 0)")
    .attr("d", d => d3.symbol().type(d.shape).size(100)())
    .attr("fill", d => d.color)
    .attr("stroke", "black");

  // Labels with hyperlink style
  legendItems.append("text")
    .attr("x", 20)
    .attr("y", 5)
    .attr("font-size", "12px")
    .attr("fill", "#0645AD") // hyperlink blue
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

  const shaped_dots = d3.symbol().type(d => {
    if (d.vax_group === "Above 1 S.D. (78%+)") return d3.symbolStar;
    if (d.vax_group === "Above Mean (68%-78%)") return d3.symbolTriangle;
    return d3.symbolCircle;
  }).size(100);

  function updateFilteredDots() {
    svg.selectAll(".data-dot").remove();

    const filtered = data.filter(d => activeGroups.has(d.vax_group));

    svg.selectAll(".data-dot")
      .data(filtered)
      .enter()
      .append("path")
      .attr("class", "data-dot")
      .attr("d", shaped_dots)
      .attr("transform", d => `translate(${x(d.cases_per_100k)},${y(d.deaths_per_100k)})`)
      .attr("fill", d => groupColors[d.vax_group] || "gray")
      .attr("opacity", 0.8)
      .append("title")
      .text(d => `${d.state}: ${d.vax_group}\nCases/100k: ${d.cases_per_100k.toFixed(0)}\nDeaths/100k: ${d.deaths_per_100k.toFixed(1)}`);
  }

  updateFilteredDots();

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
  const groupColors = {
    "Above 1 S.D. (78%+)": "green",
    "Above Mean (68%-78%)": "gold",
    "Below Mean (<68%)": "red"
  };

  const x = d3.scaleLinear()
    .domain([60, 90])  // assuming vaccination rate range
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

  svg.selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => x(d.vaccination_rate))
    .attr("cy", d => y(d.cases_per_100k))
    .attr("r", 6)
    .attr("fill", d => groupColors[d.vax_group] || "gray")
    .attr("opacity", 0.8)
    .append("title")
    .text(d => `${d.state}: ${d.vax_group}\nVax Rate: ${d.vaccination_rate}%\nCases/100k: ${d.cases_per_100k.toFixed(0)}`);

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
