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
  features_2f_completion["<b>features/completion</b><br/><i>How many todos are left; marking all done or none; clearing</i>"]:::feature
  features_2f_filter["<b>features/filter</b><br/><i>Showing all todos, those not done, or those done</i>"]:::feature
  features_2f_generate["<b>features/generate</b><br/><i>Adding many todos at once, to try the app at scale</i>"]:::feature
  features_2f_page["<b>features/page</b><br/><i>What every feature's view uses of the page: events and elements</i>"]:::feature
  features_2f_todos["<b>features/todos</b><br/><i>Adding, toggling, editing, deleting and moving todos</i>"]:::feature
  features_2f_completion --> features_2f_todos
  features_2f_filter --> features_2f_todos
  features_2f_generate --> features_2f_todos
  features_2f_todos --> features_2f_page
  app_3a_app --> features_2f_completion
  app_3a_app --> features_2f_filter
  app_3a_app --> features_2f_generate
  ground[" "]:::ground
  features_2f_page ~~~ ground
  click features_2f_completion "features/completion/ARCHITECTURE.md"
  click features_2f_filter "features/filter/ARCHITECTURE.md"
  click features_2f_generate "features/generate/ARCHITECTURE.md"
  click features_2f_page "features/page/view/README.md"
  click features_2f_todos "features/todos/ARCHITECTURE.md"
  click app_3a_app "app"
```

| | What |
|---|---|
| [features/completion](features/completion/ARCHITECTURE.md) | How many todos are left; marking all done or none; clearing |
| [features/filter](features/filter/ARCHITECTURE.md) | Showing all todos, those not done, or those done |
| [features/generate](features/generate/ARCHITECTURE.md) | Adding many todos at once, to try the app at scale |
| [features/page](features/page/view/README.md) | What every feature's view uses of the page: events and elements |
| [features/todos](features/todos/ARCHITECTURE.md) | Adding, toggling, editing, deleting and moving todos |
<!-- architecture:end -->
