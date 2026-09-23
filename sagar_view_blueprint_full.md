# SAGAR-VIEW — SIH26067 Winner Research, Product Blueprint & Global Benchmark



## SAGAR-VIEW — SIH26067


### Interactive 3D Ocean Intelligence & Visualization Platform

> SIH 2026 • Problem Statement 26067 • Ministry of Earth Sciences (MoES) • Disaster Management • Deadline: 30 September 2026

> 🏆 ****

  Winner positioning: Do not build only a 3D ocean map. Build a browser-native scientific workspace that lets an operational user visualize, interrogate, compare and validate ocean model predictions against real observations in one environment.


---



## 1. Executive Summary

India's EEZ and coastline require continuous monitoring of ocean state variables. The problem statement asks for a web-based platform that can bring together multidimensional ocean model fields and in-situ observations such as Argo and Glider data, while supporting depth, time, variable and color-scale exploration.

The strongest product interpretation is:

SAGAR-VIEW = 3D Ocean Visualization + Observation Overlay + Model Validation + Scientific Analysis + Operational Decision Support + Public Science Communication.

The platform should treat the ocean as a four-dimensional field — longitude × latitude × depth × time — while keeping the UI understandable for both operational experts and non-specialists.


---



## 2. What the PS Really Requires


### Mandatory problem capabilities

* 3D volumetric rendering of temperature, salinity and current vectors.

* Depth-slice navigation and isosurface extraction.

* Time-step animation.

* Argo, Glider, CTD and BGC overlays.

* Clickable instrument profiles with depth-vs-variable charts and timestamps.

* NetCDF and delimited text ingestion.

* Modular support for additional variables and sensors.

* Dynamic color palettes, min/max ranges and linear/log scaling.

* Layer opacity controls and vertical exaggeration.

* Browser-native, scalable architecture.

* REST/OPeNDAP style data access.

* Open standards: OGC WMS/WCS and CF conventions for NetCDF.

* Outreach and educational use.


### The product gap to attack

The real gap is not merely visualization. It is the absence of a single workflow where an oceanographer can move from:

model field → observation → profile → comparison → difference → time evolution → insight → export.


---



## 3. Global Benchmark Research


### 3.1 Copernicus Marine — MyOcean Pro

Copernicus Marine's MyOcean Pro is the closest benchmark for advanced ocean data exploration. It supports 4D ocean exploration across longitude, latitude, depth and time; multiple variables and datasets; point values; time-series and depth-profile graphs; line/polygon analysis; custom palettes; linear/log scales; measurements; exports; animations; and shareable deep links.

What SAGAR-VIEW should learn:

* Multi-dimensional exploration should feel natural.

* Every layer needs metadata and units.

* Point/line/area selection should produce useful scientific plots.

* Color scales and ranges need serious scientific controls.

* Export/share is part of the analysis workflow, not an afterthought.

* Guided learning can broaden adoption.

Source: https://help.marine.copernicus.eu/en/articles/4794675-main-features-of-myocean-pro-viewer


### 3.2 Copernicus Marine — MyOcean Light / Learn / Dashboards

Copernicus also provides simpler and thematic experiences. MyOcean Light targets quick exploration of selected variables, while MyOcean Learn introduces ocean concepts to beginners. Copernicus Marine Dashboards combine multiple variables and thematic views such as ocean state, fisheries, eutrophication and climate anomalies.

SAGAR-VIEW lesson: create distinct experience modes instead of forcing every user into an expert GIS interface.

Source: https://help.marine.copernicus.eu/en/articles/5046713-what-are-the-services-and-content-provided-by-the-copernicus-marine-service


### 3.3 NOAA OceansMap

NOAA's OceansMap integrates operational forecast-model outputs with oceanographic observations and supports custom dashboards/curated views. This is highly relevant to the disaster-management and operational decision-support angle.

SAGAR-VIEW lesson: model + observation comparison should be a first-class workflow, not merely a map overlay.

Source: https://www.tidesandcurrents.noaa.gov/oceanmap_info.html


### 3.4 NOAA IOOS Model Viewer

The U.S. Integrated Ocean Observing System Model Viewer normalizes model output into CF-compliant NetCDF and exposes model visualization alongside real-time observations. This validates the architectural direction of a normalization/data-service layer between heterogeneous sources and the browser.

SAGAR-VIEW lesson: normalization and standards are product features, not backend plumbing.

Source: https://ioos.noaa.gov/data/access-ioos-data/


### 3.5 Argo Visualization Ecosystem / Argovis

The Argo program documents multiple visualization applications, including Argovis, which supports temperature, salinity and BGC data, float trajectories and gridded-field comparisons.

SAGAR-VIEW lesson: observation UX should include spatial filtering, trajectory inspection, profile exploration and co-location with gridded/model fields.

Source: https://argo.ucsd.edu/data/data-visualizations/


### 3.6 INCOIS / Indian Ocean Observation Context

INCOIS already operates extensive ocean data holdings and an Ocean Observation Network covering systems such as Argo, moored buoys, drifting buoys, HF Radar, RAMA buoys and tide gauges. INCOIS data holdings include formats such as ASCII and NetCDF and support visualization/access workflows.

SAGAR-VIEW lesson: design around the Indian Ocean and INCOIS operational ecosystem instead of copying a generic global ocean viewer.

Source: https://incois.gov.in/site/dataholdings.jsp

Source: https://incois.gov.in/OON/index.jsp


---



## 4. Competitive / Benchmark Feature Matrix

| SAGAR-VIEW Target | Capability | Global benchmark lesson |

| Core | 3D / 4D exploration | Copernicus proves 4D interaction is valuable |

| Core differentiator | Model + observation | NOAA/IOOS validate integrated comparison |

| Core | Argo profiles | Argovis ecosystem demonstrates demand |

| Core | Glider trajectory | Extend observation workflow |

| Core | Depth slices | Required by PS |

| Core | Isosurfaces | Strong 3D scientific interaction |

| High-impact | Current particles | Improves intuitive understanding |

| High-impact | Cross-section / transect | Inspired by advanced scientific viewers |

| Core architecture | QC / metadata | Critical for scientific trust |

| Core | Export / share | Copernicus benchmark |

| Outreach | Education mode | Inspired by MyOcean Learn |

| Advanced | Natural-language query | Use as a controlled query interface, not a generic chatbot |


---



## 5. Product Vision


### Product statement

> A browser-native 3D ocean intelligence workspace for the Indian Ocean that unifies numerical model fields and real observations, enabling rapid scientific exploration, validation and decision support.


### Primary users

1. Operational forecaster — needs rapid state assessment and model/observation comparison.

1. Ocean researcher — needs deep scientific exploration, profiles, transects and exports.

1. Data manager — needs ingestion, metadata, quality control and source traceability.

1. Policy / disaster-management user — needs understandable indicators and regional summaries.

1. Student / public user — needs guided, educational ocean exploration.


---



## 6. Information Architecture

`Mermaid
flowchart TD
A[Data Sources] --> B[Ingestion Layer]
B --> C[Quality Control + Validation]
C --> D[CF Normalization]
D --> E[Ocean Data Engine]
E --> F[Cache + Chunked Storage]
E --> G[Scientific Analysis Engine]
F --> H[REST / OGC / OPeNDAP APIs]
G --> H
H --> I[WebGL 3D Client]
I --> J[3D Ocean]
I --> K[Observation Explorer]
I --> L[Analysis Workspace]
I --> M[Reports + Sharing]
`


---



## 7. Product Modules


### Module A — 3D Ocean Engine


#### Must work

* Interactive Indian Ocean globe/scene.

* Rotate, pan, zoom and camera reset.

* Coastline, bathymetry and geographic context.

* Vertical exaggeration.

* Depth-aware rendering.


#### Advanced

* 3D volume rendering.

* Depth slice plane.

* Isosurface extraction.

* Level-of-detail rendering.

* Progressive loading.


### Module B — Variable Explorer

Variables should be registry-driven rather than hard-coded:

* Temperature

* Salinity

* Current U/V/W

* Chlorophyll

* SSH

* Oxygen

* Density

* Future variables

Every variable should carry metadata: name, standard name, unit, valid range, palette recommendation, scaling mode and source.


### Module C — Current Visualization

Provide both:

* vector arrows;

* animated particles / streamlines.

Controls:

* speed;

* density;

* animation rate;

* depth;

* opacity;

* vector scaling.


### Module D — Observation Explorer

Support:

* Argo;

* Glider;

* CTD;

* BGC;

* future sensors.

Clicking an observation should reveal:

* ID;

* timestamp;

* latitude/longitude;

* pressure/depth;

* available variables;

* profile;

* trajectory;

* data-quality flags.


### Module E — Model vs Observation Validation

This should be the product's scientific signature feature.

Workflow:

Select location / float → match model field → align time → align depth → plot both → compute difference → summarize statistics.

Metrics:

* Bias

* MAE

* RMSE

* correlation

* sample count

* temporal coverage

Example insight card:

> Model: 27.8 °C  • Observation: 29.1 °C  • Difference: +1.3 °C  • RMSE: 1.1 °C

Never present a derived metric without showing the data/time/depth basis behind it.


### Module F — Anomaly / Difference Layer

Allow:

* Observation − Model;

* Model A − Model B;

* current-speed anomaly;

* temperature anomaly;

* salinity anomaly.

Use diverging color scales centered around zero.


### Module G — Scientific Analysis Tools


#### Point query

Click the ocean and return values across depth.


#### Vertical profile

Temperature, salinity, oxygen, chlorophyll versus depth.


#### Time series

Variable versus time at a selected coordinate or observation.


#### Transect / cross-section

Draw line A→B and generate a depth-resolved section.


#### Area statistics

Polygon selection → mean, min, max, standard deviation and histogram.


#### Measurement

Distance, depth and coordinate inspection.


### Module H — Time Machine

Timeline should support:

* play/pause;

* step forward/backward;

* date/time label;

* speed 1×/2×/5×/10×;

* synchronized update of all active layers.

The platform should treat time as a first-class dimension, not an animation add-on.


### Module I — Layer Manager

`Plain Text
☑ Temperature
☑ Salinity
☑ Currents
☑ Bathymetry
☑ Argo
☑ Glider
☐ Chlorophyll
☐ SSH
`

Each layer should support visibility, opacity, z-order and metadata.


### Module J — Colorbar / Scientific Styling

Support:

* sequential palettes;

* diverging palettes;

* ocean-specific palettes;

* color-blind-friendly palettes;

* manual min/max;

* automatic range;

* linear/log scale;

* clamping;

* units;

* multiple independent colorbars.


### Module K — Data Ingestion


#### Input

* NetCDF

* ASCII / CSV / delimited text

* future sensor feeds


#### Pipeline

`Plain Text
Raw source
  ↓
Format detection
  ↓
Metadata extraction
  ↓
CF / coordinate validation
  ↓
Unit normalization
  ↓
Missing-value handling
  ↓
Quality-control flags
  ↓
Chunking / indexing
  ↓
API-ready representation
`


### Module L — Dataset Management

Dataset detail page should expose:

* source;

* provider;

* variable list;

* units;

* dimensions;

* spatial coverage;

* temporal coverage;

* vertical coverage;

* resolution;

* update frequency;

* quality level;

* license / citation;

* processing history.


### Module M — Export and Collaboration

Export:

* PNG;

* CSV;

* NetCDF subset;

* JSON;

* PDF report;

* analysis snapshot.

Shareable analysis state should preserve:

* camera;

* region;

* layers;

* variable;

* depth;

* time;

* color range;

* selected observations;

* charts.


---



## 8. Advanced Winner Features


### 8.1 Ocean Cross-Section Studio

User draws a line across the ocean and gets a vertical section showing temperature/salinity/current intensity across distance and depth.


### 8.2 Co-location Engine

Automatically find observations near a selected model grid cell or user-defined radius and time window.

Example:

Argo observation within 25 km and ±6 hours of model point.

This turns visual comparison into reproducible validation.


### 8.3 Observation Quality Gate

Before comparing data:

Raw → QC → valid → comparable.

Show why a point was excluded instead of silently removing it.


### 8.4 Scientific Provenance

Every chart should be traceable to:

* dataset ID;

* variable;

* timestamp;

* depth range;

* source version;

* processing/QC state;

* calculation method.


### 8.5 Natural-Language Ocean Query

Example:

> “Show temperature anomalies between 50 and 200 m in the Bay of Bengal during the selected period and overlay nearby Argo profiles.”

The assistant should convert this into a constrained query object, then let the user review the interpreted filters before execution.


### 8.6 Explainable Anomaly Cards

Instead of “AI detected anomaly”, show:

* observed value;

* reference/model value;

* difference;

* threshold/method;

* sample count;

* time/depth window.


### 8.7 Operational Situation Room

A dedicated mode can show:

* current ocean state;

* major deviations;

* active observations;

* data freshness;

* selected regions;

* warning indicators.

Keep it decision-support oriented and clearly label model-derived information versus validated observations.


### 8.8 Education / Public Mode

Simplified experience with:

* guided ocean journey;

* “What is an Argo float?”;

* “Why does salinity matter?”;

* “How do currents move?”;

* interactive depth dive;

* story-based scientific explanations.


---



## 9. UX Blueprint


### Desktop layout

`Plain Text
┌─────────────────────────────────────────────────────────┐
│ SAGAR-VIEW | Dataset | Variable | Time | Search         │
├───────────────┬─────────────────────────┬───────────────┤
│ DATA / LAYERS │                         │ ANALYSIS      │
│               │      3D OCEAN           │               │
│ Variables     │                         │ Profile       │
│ Depth         │  Volume / Currents      │ Time series   │
│ Sensors       │  Argo / Glider          │ Compare      │
│ Colorbar      │                         │ QC / Metrics │
├───────────────┴─────────────────────────┴───────────────┤
│ Timeline / Animation / Depth                             │
└─────────────────────────────────────────────────────────┘
`


### UX principles

* Expert power without expert-only complexity.

* One primary action per panel.

* Scientific units always visible.

* No hidden assumptions about time/depth.

* Every derived insight has provenance.

* Avoid overloading the 3D scene.


---



## 10. Technical Architecture


### Recommended logical stack


#### Frontend

* React / Next.js or equivalent modern web framework.

* TypeScript.

* WebGL renderer: Three.js or Cesium.js.

* Plotting library for scientific profiles/time-series.

* Web Workers for CPU-heavy client operations.


#### Data / analysis backend

* Python service.

* xarray for multidimensional NetCDF processing.

* CF-aware normalization.

* FastAPI or equivalent REST layer.

* OPeNDAP / OGC-compatible service integration where applicable.


#### Storage / performance

* Object storage for raw datasets.

* Metadata database.

* Cache for frequently requested slices.

* Chunked arrays / optimized subsets.

* Server-side resampling/downsampling.


#### Scientific processing

`Mermaid
flowchart LR
A[NetCDF / ASCII] --> B[xarray]
B --> C[CF metadata + coordinate validation]
C --> D[QC + normalization]
D --> E[Chunk / index]
E --> F[Analysis Engine]
E --> G[Cache]
F --> H[API]
G --> H
H --> I[WebGL Client]
`


---



## 11. Performance Engineering

Large multidimensional ocean datasets should not be pushed wholesale into the browser.

Required strategies:

* lazy loading;

* spatial/temporal subsetting;

* depth slicing on demand;

* chunked storage;

* compression;

* server-side aggregation;

* progressive rendering;

* level of detail;

* request caching;

* Web Workers;

* GPU rendering;

* graceful low-bandwidth fallback.


#### Performance acceptance targets for the prototype

Define measurable budgets before demo day:

* initial scene should become interactive quickly;

* layer changes should not freeze the UI;

* timeline scrubbing should remain responsive on the demo machine;

* large datasets should be subset server-side;

* no unnecessary full-file downloads.

Use actual benchmark measurements in the final presentation instead of inventing FPS or latency numbers.


---



## 12. Scientific Correctness Checklist

This is a high-priority winner factor.

[to_do] Latitude/longitude conventions validated.

[to_do] Depth/pressure convention clearly documented.

[to_do] Time zones / timestamps normalized.

[to_do] Units preserved and displayed.

[to_do] Missing values handled explicitly.

[to_do] Fill values never rendered as valid observations.

[to_do] Model and observation temporal alignment is explicit.

[to_do] Model and observation vertical interpolation method is documented.

[to_do] Spatial co-location method is documented.

[to_do] Quality flags are visible.

[to_do] Derived statistics show sample count and time window.

[to_do] Colorbar range does not silently change during comparison.

[to_do] Dataset version/provenance is preserved.


---



## 13. Security / Reliability / Deployment


### Deployment

* Containerized services.

* Environment-based configuration.

* Health checks.

* Structured logs.

* Dataset ingestion logs.

* API request tracing.

* Error boundaries on frontend.

* Retry/fallback for data services.


### Reliability

If a dataset or sensor feed fails:

Do not break the 3D viewer.

Instead show:

> Observation service unavailable — model layers remain available.

This is especially important for an operational-style system.


---



## 14. Data Standards Strategy


#### CF Conventions

Use CF metadata to make dimensions, coordinates, units and scientific meaning machine-readable.


#### OGC

Design for interoperability with OGC services such as WMS/WCS where appropriate.


#### OPeNDAP

Support remote multidimensional data access where the deployment environment provides it.


#### Why standards matter

The goal is not to lock SAGAR-VIEW to one dataset format or one institution. A new variable/sensor should be registered through metadata/configuration rather than requiring a major frontend rewrite.


---



## 15. Plugin / Extensibility Model

Use a registry concept:

`Plain Text
Sensor Registry
 ├── Argo
 ├── Glider
 ├── CTD
 ├── BGC
 ├── Mooring
 ├── HF Radar
 └── ADCP

Variable Registry
 ├── Temperature
 ├── Salinity
 ├── Current
 ├── Chlorophyll
 ├── SSH
 ├── Oxygen
 └── Future variables
`

Each plugin should declare:

* metadata parser;

* geometry type;

* supported variables;

* profile/trajectory behavior;

* visualization style;

* QC rules;

* data endpoint.


---



## 16. Product Modes


### 🧑‍🔬 Research Mode

Full controls, profiles, transects, statistics, comparison and export.


### 🚨 Operational Mode

Fast situation awareness, freshness, anomalies, region dashboards and selected decision indicators.


### 🎓 Learn Mode

Guided explanations and simplified controls.


### 🗂️ Data Manager Mode

Ingestion, metadata, QC, source health and processing status.

This multi-mode approach is stronger than one overloaded interface.


---



## 17. Suggested Demo Dataset Strategy

Use a small but scientifically coherent demonstration package:


#### Model

* Indian Ocean regional grid.

* Temperature.

* Salinity.

* U/V currents.

* Multiple depths.

* Multiple timestamps.


#### Observations

* Argo profiles with temperature/salinity.

* At least one Glider trajectory if a suitable public/sample dataset is available.


#### Derived demonstration

* Model profile at observation location.

* Observation profile.

* Difference curve.

* RMSE/bias.

* One cross-section.

* One current-particle animation.

The demo should be reproducible from a documented dataset snapshot.


---



## 18. SIH Demo Storyboard


### Scene 1 — Problem

Show fragmented tools/data sources.

Message: model and observations are difficult to correlate rapidly.


### Scene 2 — SAGAR-VIEW

Open Indian Ocean 3D environment.


### Scene 3 — Select Temperature

Choose variable and dataset.


### Scene 4 — Dive to 100 m

Move depth control and show field change.


### Scene 5 — Add Argo

Observation markers appear.


### Scene 6 — Click Float

Open profile with timestamp and QC information.


### Scene 7 — Compare

Overlay model and observed temperature/salinity.


### Scene 8 — Difference

Show difference and statistics.


### Scene 9 — Currents

Switch to animated current particles.


### Scene 10 — Cross-section

Draw A→B transect and show depth-resolved field.


### Scene 11 — Time Machine

Animate the selected period.


### Scene 12 — Export

Generate an analysis report/shareable snapshot.


### Final line

> “From ocean model to real observation to actionable insight — in one browser.”


---



## 19. Feature Prioritization


### P0 — Must be genuinely working

* 3D Indian Ocean.

* Temperature.

* Salinity.

* Currents.

* Depth slice.

* Volume rendering.

* Isosurface.

* Time animation.

* Argo markers.

* Glider trajectory.

* Profile chart.

* Model-vs-observation comparison.

* Difference/anomaly layer.

* Colorbar controls.

* Layer manager.

* NetCDF ingestion.

* Modular metadata/variable model.


### P1 — Strong differentiators

* Current particles.

* Cross-section.

* Point query.

* Time-series analysis.

* Dataset comparison.

* QC visualization.

* Co-location engine.

* Measurement tools.

* Report generation.

* Shareable analysis state.


### P2 — Advanced / stretch

* Natural-language query.

* Explainable anomaly detection.

* Operational situation room.

* Real-time streaming.

* Satellite layers.

* Forecast layers.

* Education story mode.

* Alerts.

Rule: P0 must be polished before adding P2.


---



## 20. What NOT to Do

* Do not build a pretty globe with fake data and call it scientific visualization.

* Do not make AI the central story.

* Do not claim disaster prediction without a validated methodology.

* Do not hard-code every variable.

* Do not download giant NetCDF files into the browser.

* Do not hide units, timestamps or depth conventions.

* Do not compare model and observation without documenting spatial/temporal alignment.

* Do not add 50 half-working features.

* Do not copy another product's UI without understanding its workflow.


---



## 21. Winner-Level Differentiation

The strongest differentiation is not “we have 3D.” Global systems already demonstrate sophisticated 4D ocean visualization.

The differentiation should be:


#### 1. Indian Ocean / INCOIS-first

Optimized for India's oceanographic and disaster-management context.


#### 2. Model + observation co-location

Bring model and sensor evidence together in the same scientific workflow.


#### 3. Explainable validation

Show why the model differs from observation and how the metric was computed.


#### 4. Operational + research + outreach modes

One platform, different user experiences.


#### 5. Standards-first extensibility

New sensor and variable support without re-engineering the entire product.


#### 6. Performance-first browser architecture

Large scientific data stays server-side; the browser receives only what is needed.


---



## 22. Evidence-Based Benchmark Takeaways


#### Copernicus proves

Advanced web ocean viewers can combine multi-dataset layers, depth/time exploration, profiles, custom palettes, measurements, exports and shareable states.


#### NOAA/IOOS prove

Operational model output and real-time observations can coexist in decision-oriented web workflows.


#### Argo ecosystem proves

Float trajectories, profiles, BGC variables and gridded-field comparison are valuable web use cases.


#### INCOIS context proves

India already has rich observation holdings, multiple sensor types and NetCDF/ASCII data workflows — the opportunity is to unify and operationalize the visualization/analysis experience around the Indian Ocean.


---



## 23. Research Sources

1. SIH 2026 PS 26067 — Ministry of Earth Sciences (user-provided problem statement).

1. Copernicus Marine MyOcean Pro features — https://help.marine.copernicus.eu/en/articles/4794675-main-features-of-myocean-pro-viewer

1. Copernicus Marine service and visualization tools — https://help.marine.copernicus.eu/en/articles/5046713-what-are-the-services-and-content-provided-by-the-copernicus-marine-service

1. NOAA OceansMap — https://www.tidesandcurrents.noaa.gov/oceanmap_info.html

1. NOAA IOOS data access / Model Viewer — https://ioos.noaa.gov/data/access-ioos-data/

1. Argo visualization ecosystem — https://argo.ucsd.edu/data/data-visualizations/

1. Argo data products — https://argo.ucsd.edu/data/argo-data-products/

1. INCOIS Data Holdings — https://incois.gov.in/site/dataholdings.jsp

1. INCOIS Ocean Observation Network — https://incois.gov.in/OON/index.jsp

1. INCOIS oceanographic visualization training context — https://incois.gov.in/site/itcoocean/itcoo174.jsp


---



## 24. Build Acceptance Checklist


### Product

[to_do] A user can understand the product in 30 seconds.

[to_do] The 3D scene is interactive and scientifically meaningful.

[to_do] Model and observation can be selected together.

[to_do] A float can be clicked and profiled.

[to_do] Model and observation can be compared at matched location/time/depth.

[to_do] Difference statistics are reproducible.


### Data

[to_do] NetCDF parser works.

[to_do] Metadata is extracted automatically.

[to_do] Missing values are handled.

[to_do] Units are preserved.

[to_do] QC state is visible.

[to_do] Dataset provenance is preserved.


### Performance

[to_do] No full raw dataset download to browser.

[to_do] Slices are requested on demand.

[to_do] Large fields are chunked/cached.

[to_do] UI remains responsive during animation.


### Scientific UX

[to_do] Colorbars show units.

[to_do] Depth/pressure is unambiguous.

[to_do] Timestamp is always visible in analysis.

[to_do] Comparison method is documented.

[to_do] Derived metrics show sample count.


### SIH presentation

[to_do] One coherent demo story.

[to_do] Realistic Indian Ocean data.

[to_do] Architecture diagram.

[to_do] Benchmark comparison.

[to_do] Clear differentiation.

[to_do] Honest limitations and future roadmap.


---



## 25. Final Product North Star

> 🌊 ****

  SAGAR-VIEW should make a complex question easy to answer:

  “What does the model say, what is the ocean actually observing, where do they disagree, how is that changing with depth and time, and what should the user investigate next?”

That is the product story to optimize for.


---



## 26. Canva Visual Companion

A Canva visual companion was generated for this research package with a premium scientific/government-tech direction. Use the candidate that best fits the team's final visual identity:

* Canva Concept A — architecture/research-document direction.

* Canva Concept B — alternate layout.

* Canva Concept C — alternate layout.

* Canva Concept D — alternate layout.

Recommended visual language: deep-ocean navy, cyan/teal scientific accents, high-contrast data overlays, minimal decoration, strong hierarchy, and no unnecessary “AI” branding.

> Higgsfield image generation was attempted for custom hero/architecture/model-vs-observation artwork, but the connected workspace currently has no available generation credits. The Notion document therefore uses publicly accessible benchmark visuals from NOAA, Copernicus-related material and Argovis until custom assets can be generated.