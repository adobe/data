# features/generate

> Adding many todos at once, to try the app at scale.

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
  subgraph self ["features/generate"]
    features_2f_generate_2f_elements["<b>elements</b><br/><i>Generating's element: buttons adding many todos at once</i>"]:::elements
    features_2f_generate_2f_model["<b>model</b><br/><i>Adding many todos at once, with made-up labels</i>"]:::model
    features_2f_generate_2f_view["<b>view</b><br/><i>Generating on the page: the buttons adding 10 or 1,000 todos</i>"]:::view
  end
  uses__features_2f_page["<b>features/page</b><br/><i>What every feature's view uses of the page: events and elements</i>"]:::feature
  uses__features_2f_todos["<b>features/todos</b><br/><i>Adding, toggling, editing, deleting and moving todos</i>"]:::feature
  features_2f_generate_2f_view --> features_2f_generate_2f_elements
  features_2f_generate_2f_view --> features_2f_generate_2f_model
  features_2f_generate_2f_model --> uses__features_2f_todos
  features_2f_generate_2f_view --> uses__features_2f_page
  click features_2f_generate_2f_elements "elements/README.md"
  click features_2f_generate_2f_model "model/README.md"
  click features_2f_generate_2f_view "view/README.md"
  click uses__features_2f_page "../page/view/README.md"
  click uses__features_2f_todos "../todos/ARCHITECTURE.md"
```

| | What |
|---|---|
| [elements](elements/README.md) | Generating's element: buttons adding many todos at once |
| [model](model/README.md) | Adding many todos at once, with made-up labels |
| [view](view/README.md) | Generating on the page: the buttons adding 10 or 1,000 todos |
<!-- architecture:end -->
