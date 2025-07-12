// Globals
let currentScene = 0;
let allData = [];
let yearList = [];
const width = 900, height = 600;
const svg = d3.select("#chart");
const margin = { top: 40, right: 30, bottom: 50, left: 60 };

// Load all CSVs and process
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

  //console.log("popMap:", popMap);

  // Preprocess abbrev
  const abbrevMap = {};
  abbrev.forEach(d => {
    abbrevMap[d.state] = d.state_code;
  });

  //console.log("abbrevMap:", abbrevMap);

  //0710 align date range
  //const vaxStart = new Date("2021-01-01");
  //covid = covid.filter(d => d.date >= vaxStart);

  // Merge COVID and population
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
    if (currentScene < 3) currentScene++;
    updateScene();
  });
  d3.select("#prev-btn").on("click", () => {
    if (currentScene > 0) currentScene--;
    updateScene();
  });
}

function updateScene() {
  const year = +d3.select("#year-select").property("value") || d3.max(yearList);
  const sceneText = [
    "Scene 1: Average Deaths per Vaccination Group",
    "Scene 2: Overview - Deaths vs Cases (colored by Vaccination)",
    "Scene 3: Highlight outlier states",
    "Scene 4: User exploration"
  ];
  d3.select("#scene-description").text(sceneText[currentScene]);

  // Clear SVG
  svg.selectAll("*").remove();

  const filtered = allData.filter(d => d.date.getFullYear() === year);
  const latest = d3.rollups(filtered, v => v.at(-1), d => d.state)
    .map(d => d[1])
    .filter(d => d.vaccination_rate != null);

  console.log("✅ Filtered data for year:", year);
  console.log("✅ Plotting this many points:", latest.length);
  console.log("Sample row:", latest[0]);

  drawScene(currentScene, latest);
}

function classifyVax(rate) {
  if (rate >= 78) return "Above 1 S.D. (78%+)";
  else if (rate >= 68) return "Above Mean (68%-78%)";
  else return "Below Mean (<68%)";
}

function drawScene(scene, data) {
  // Prepare vax group
  data.forEach(d => d.vax_group = classifyVax(d.vaccination_rate));

  if (scene === 0) {
    drawBar(data);
  } else if (scene === 1) {
    drawScatter(data);
  } else if (scene === 2) {
    drawScatter(data, true); // with annotation
  } else if (scene === 3) {
    drawScatter(data); // user can explore freely
  }
}

function drawScatter(data, withAnnotation = false) {
  const groupColors = {
    "Above 1 S.D. (78%+)": "gold",
    "Above Mean (68%-78%)": "green",
    "Below Mean (<68%)": "red"
  };

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.cases_per_100k)]).nice()
    .range([margin.left, width - margin.right]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.deaths_per_100k)]).nice()
    .range([height - margin.bottom, margin.top]);

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  svg.selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => x(d.cases_per_100k))
    .attr("cy", d => y(d.deaths_per_100k))
    .attr("r", 6)
    .attr("fill", d => groupColors[d.vax_group] || "gray")
    .attr("opacity", 0.8)
    .append("title")
    .text(d => `${d.state}: ${d.vax_group}\nCases/100k: ${d.cases_per_100k.toFixed(0)}\nDeaths/100k: ${d.deaths_per_100k.toFixed(1)}`);

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

function drawBar(data) {
  const groupColors = {
    "Above 1 S.D. (78%+)": "gold",
    "Above Mean (68%-78%)": "green",
    "Below Mean (<68%)": "red"
  };

  const grouped = d3.rollups(data, v => d3.mean(v, d => d.deaths_per_100k), d => d.vax_group);
  const barData = grouped.map(([group, avg]) => ({ group, avg }));

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

  svg.selectAll("rect")
    .data(barData)
    .enter()
    .append("rect")
    .attr("x", d => x(d.group))
    .attr("y", d => y(d.avg))
    .attr("width", x.bandwidth())
    .attr("height", d => y(0) - y(d.avg))
    .attr("fill", d => groupColors[d.group]);

  svg.append("text")
    .attr("x", width / 2).attr("y", height - 10)
    .attr("text-anchor", "middle")
    .text("Vaccination Group");

  svg.append("text")
    .attr("x", -height / 2).attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .text("Avg Deaths per 100k");
}
