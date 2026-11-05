# features/sprites

> Sprites with textures moved between threads, drawn on a canvas.

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
  subgraph self ["features/sprites"]
    features_2f_sprites_2f_model["<b>model</b><br/><i>Sprites, each a texture moving around the canvas</i>"]:::model
    features_2f_sprites_2f_ports["<b>ports</b><br/><i>Loads the sprites' textures, as it would fetch and decode images</i>"]:::ports
    features_2f_sprites_2f_view["<b>view</b><br/><i>Draws the sprites on the canvas the world's thread holds</i>"]:::view
  end
  features_2f_sprites_2f_ports --> features_2f_sprites_2f_model
  features_2f_sprites_2f_view --> features_2f_sprites_2f_model
  click features_2f_sprites_2f_model "model/README.md"
  click features_2f_sprites_2f_ports "ports/README.md"
  click features_2f_sprites_2f_view "view/README.md"
```

| | What |
|---|---|
| [model](model/README.md) | Sprites, each a texture moving around the canvas |
| [ports](ports/README.md) | Loads the sprites' textures, as it would fetch and decode images |
| [view](view/README.md) | Draws the sprites on the canvas the world's thread holds |
<!-- architecture:end -->
