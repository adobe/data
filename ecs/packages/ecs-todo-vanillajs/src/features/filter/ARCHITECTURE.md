# features/filter

> Showing all todos, those not done, or those done.

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
  subgraph self ["features/filter"]
    features_2f_filter_2f_elements["<b>elements</b><br/><i>The filter's element: buttons choosing which todos show</i>"]:::elements
    features_2f_filter_2f_model["<b>model</b><br/><i>Which todos the list shows: all, those not done, or those done</i>"]:::model
    features_2f_filter_2f_view["<b>view</b><br/><i>The filter on the page: its buttons, and the rows it hides</i>"]:::view
  end
  uses__features_2f_todos["<b>features/todos</b><br/><i>Adding, toggling, editing, deleting and moving todos</i>"]:::feature
  features_2f_filter_2f_view --> features_2f_filter_2f_elements
  features_2f_filter_2f_view --> features_2f_filter_2f_model
  features_2f_filter_2f_view --> uses__features_2f_todos
  click features_2f_filter_2f_elements "elements/README.md"
  click features_2f_filter_2f_model "model/README.md"
  click features_2f_filter_2f_view "view/README.md"
  click uses__features_2f_todos "../todos/ARCHITECTURE.md"
```

| | What |
|---|---|
| [elements](elements/README.md) | The filter's element: buttons choosing which todos show |
| [model](model/README.md) | Which todos the list shows: all, those not done, or those done |
| [view](view/README.md) | The filter on the page: its buttons, and the rows it hides |
<!-- architecture:end -->
