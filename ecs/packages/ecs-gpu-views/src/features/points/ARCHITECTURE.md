# features/points

> Turning points, drawn into views on two canvases.

<!-- architecture:start -->
Arrows point from a layer to what it uses. The boxes below are other features this one uses; one that another of its uses already brings in is left out.

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
  subgraph self ["features/points"]
    features_2f_points_2f_model["<b>model</b><br/><i>Points turning around the vertical axis, at speeds of their own</i>"]:::model
    features_2f_points_2f_view["<b>view</b><br/><i>Draws the points into every view, each with a camera of its own</i>"]:::view
  end
  features_2f_points_2f_view --> features_2f_points_2f_model
  click features_2f_points_2f_model "model/README.md"
  click features_2f_points_2f_view "view/README.md"
```

| | What |
|---|---|
| [model](model/README.md) | Points turning around the vertical axis, at speeds of their own |
| [view](view/README.md) | Draws the points into every view, each with a camera of its own |
<!-- architecture:end -->
