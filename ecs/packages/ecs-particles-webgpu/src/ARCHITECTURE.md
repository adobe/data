# Architecture

> The features of the app and what uses what; start here and follow the links down.

<!-- architecture:start -->
Arrows point from what uses to what is used, so the most core features are at the bottom. An arrow a longer path already implies is left out. Each feature links to its own document or, when it has one layer, to that layer's README. Yellow is an app, which puts features together.

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 30, "rankSpacing": 70}}}%%
flowchart TB
  classDef ground fill:none,stroke:none;
  classDef elements fill:#efe6ff,stroke:#7c5cbf,color:#222;
  classDef model fill:#dcebff,stroke:#3b7ddd,color:#222;
  classDef ports fill:#ffe9cc,stroke:#d9822b,color:#222;
  classDef view fill:#dff5e1,stroke:#3a9a4b,color:#222;
  classDef app fill:#fff3b0,stroke:#b59b00,color:#222;
  classDef feature fill:#f3f3f3,stroke:#777,color:#222;
  app_3a_app["<b>app</b>"]:::app
  features_2f_falling["<b>features/falling</b><br/><i>Falling particles, moved by kernels on the world's workers</i>"]:::feature
  features_2f_particles["<b>features/particles</b><br/><i>Particles moved on the GPU or on workers, drawn with WebGPU</i>"]:::feature
  app_3a_app --> features_2f_particles
  ground[" "]:::ground
  features_2f_falling ~~~ ground
  features_2f_particles ~~~ ground
  click features_2f_falling "features/falling/model/README.md"
  click features_2f_particles "features/particles/ARCHITECTURE.md"
  click app_3a_app "app"
```

| | What |
|---|---|
| [features/falling](features/falling/model/README.md) | Falling particles, moved by kernels on the world's workers |
| [features/particles](features/particles/ARCHITECTURE.md) | Particles moved on the GPU or on workers, drawn with WebGPU |
<!-- architecture:end -->
