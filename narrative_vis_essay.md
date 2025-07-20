CS416 2025 Summer Narrative Visualization

Author: [Fung Shing Tak]
Net ID: [stfung2]
Date: [21 Jul 2025]

This essay explains the design rationale and technical structure behind our interactive narrative visualization of COVID-19 vaccination effects across U.S. states. We guide readers through the message, scene layout, annotation logic, and interactivity features developed using D3.js. This document addresses each evaluation criterion in turn, demonstrating how the project aims to communicate health insights through visual storytelling.

## Messaging

Our narrative visualization explores the relationship between COVID-19 vaccination coverage and health outcomes across U.S. states. The message we aim to convey is that higher vaccination rates are associated with lower COVID-19 death rates, while the relationship with infection rates is more nuanced and time-dependent. We want the viewer to understand the value of vaccination in mitigating mortality, and to explore for themselves whether vaccination correlates with fewer infections across different timeframes.

---

## Narrative Structure

We designed our visualization using an interactive slideshow structure. Each scene presents a discrete visual panel accompanied by focused messages and limited user interaction. The user progresses forward and backward using clear navigation buttons, and within each scene, can interact with filters, legends, or hoverable elements, as well as a dropdown menu for year selection in the final scene. While the story begins with a clear narrative foundation (Scene 1), exploration is woven throughout Scenes 2 and 3 rather than postponed until the end.
---

## Visual Structure

Each scene uses carefully selected visual encodings and consistent design elements:

* **Scene 1**: A bar chart shows the average death rates for three vaccination groups, using color and order to establish a visual hierarchy. The chart uses a delay animation to emphasize ordering and difference.
* **Scene 2**: A scatterplot compares deaths and cases per 100k by state. Colored and shaped points reflect vaccination groups. Reference lines for median deaths and median cases aid interpretation.
* **Scene 3**: Another scatterplot maps vaccination rate vs. case rate, highlighting temporal patterns via a year dropdown. Annotations and axis labels guide users toward interpreting correlation.

All scenes share a consistent legend design and visual encoding for vaccination groups (color + shape), easing cognitive load as users transition across scenes.

To help with navigation and focus, each scene includes annotations, subtle hint texts, and axis labels. Transition buttons provide clearly labeled forward and backward movement, with inactive states at boundaries.

---

## Scenes

Our narrative includes three scenes:

**Scene 1: Average Death Rate by Vaccination Group**

* Purpose: Show high-level mortality differences between states with low, medium, and high vaccination coverage.
* Why first: Establishes core message—vaccination reduces death.

**Scene 2: State-level Deaths vs. Cases**

* Purpose: Extend the first scene by mapping the vaccination-death relationship to individual states while introducing a second axis of comparison.
* Why second: Deepens the core message by letting users examine how consistent the mortality effect appears across the spread of case numbers.

**Scene 3: Vaccination vs. Infection by Year**

* Purpose: Shift focus to a second narrative thread—whether higher vaccination coverage helps reduce infection rates.
* Why last: Complements the earlier death-focused scenes with a more exploratory and time-aware view, allowing users to reflect on a related but distinct outcome.

This scene ordering supports a structured, panel-based progression typical of interactive slideshows, where each step builds context while enabling limited but meaningful interaction.

---

## Annotations

We used two kinds of annotations:

* **Manual textual hints**: These are implemented using simple `text` SVG elements that fade in after the chart loads. We chose this method for quick narrative cues that do not require precise positioning. Manual text offers full control over timing and font, and is stylistically consistent with the rest of the scene’s layout.

* **d3.annotation plugin**: This was used in Scene 3 to mark more formal insights—like the observed correlation between vaccination and infection in 2021. We selected `d3.annotation` for its ability to render callout lines and curved elbow connectors, which visually associate the insight with specific chart regions. 

Annotations are scene-specific and are introduced with timed transitions to direct viewer attention. We followed a consistent two-part message format: (1) title insight, and (2) supportive or exploratory prompt.

---

## Parameters

Our narrative visualization relies on two main parameters: **year** and **vaccination group**.

* The **year** parameter is available via a dropdown menu in all three scenes. Selecting a different year filters the data shown in the scene and adjusts the axis scales and point placements accordingly. This allows viewers to explore trends over different timeframes during the pandemic and observe how relationships between vaccination and outcomes change over time.

* The **vaccination group** parameter categorizes each state into low, medium, or high vaccination groups, based on a classification rule derived from the national average and standard deviation. In Scenes 2 and 3, these groups are represented using a combination of color and shape encoding. Viewers can click legend items to toggle visibility for any group, refining their focus to specific subsets of states.

Each **scene** in the visualization is a distinct state. The **year** parameter dynamically changes data within a scene. The vaccination group toggles act as interactive filters, which temporarily change visual emphasis without switching scenes.

---

## Triggers

The following triggers and user interactions control state transitions or data filtering:

* **Next/Previous buttons**: Move the viewer between scenes. Buttons are disabled at the boundaries (Scene 1 has no Previous, Scene 3 has no Next).
* **Vaccination group legend toggles**: In Scenes 2 and 3, users can click legend labels to filter which groups are shown.
* **Year dropdown**: load and present the data for that year.
* **Hover events**: Hovering on dots in Scene 2 and 3 shows a tooltip with details including state name, cases/deaths, age-based vaccine coverage, and brand composition.

Affordances such as fading hint text, consistent button layout, and underlined legend labels make it clear which elements are interactive.

