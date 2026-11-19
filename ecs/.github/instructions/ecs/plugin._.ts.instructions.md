---
applyTo: "**/plugin.*.ts"
---
<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->

- `plugin.<feature>-<layer>.ts` exports `<feature><Layer>`, typed `Plugin` (`Plugin<"name">` for the `PluginConfig` names its `connect` reads): the one plugin of its layer.
- Its `systems` lists its own layer's systems, never another layer's (whoever starts a ports plugin starts its model's beside it): those only it reaches are its parts, in `plugin.<feature>-<layer>/`; those others run or order against are public at the root. `Plugin.start` composes them. `connect` defines its elements and turns outside events into `world.run(system, input)`, returning what disconnects them.
- Its name is the app's own: no other plugin shares it, so features of one name in different places are renamed.
- It holds no data logic: what reads or writes the world is a system.
