---
glob: "**/plugin.*.ts"
---
- `plugin.<feature>-<layer>.ts` exports `<feature><Layer>`, typed `Plugin` (`Plugin<"name">` for the `PluginConfig` names its `connect` reads): the one plugin of its layer.
- Its `systems` lists the layer's systems: those only it reaches are its parts, in `plugin.<feature>-<layer>/`; those others run or order against are public at the root. `Plugin.start` composes them. `connect` defines its elements and turns outside events into `world.run(system, input)`, returning what disconnects them.
- It holds no data logic: what reads or writes the world is a system.
