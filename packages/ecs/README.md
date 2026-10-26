# ECS

A high-performance, multithreaded Entity Component System for web-based applications, simulations and games.

## Packages

- **[`@adobe/ecs`](packages/ecs)**: the ECS and its build plugin, `@adobe/ecs/compiler`.
- **[`ecs-todo-vanillajs`](packages/ecs-todo-vanillajs)**: a todo app whose world drives the DOM through systems,
  with vanilla custom elements.
- **[`ecs-particles-webgpu`](packages/ecs-particles-webgpu)**: particles simulated by kernels, on the CPU and with
  WebGPU.
- **[`ecs-transfers-canvas`](packages/ecs-transfers-canvas)**: sprites drawn on a worker into a canvas moved to it,
  with textures transferred from another worker.
- **[`ecs-guide`](packages/ecs-guide)**: the guide, each example edited in place, checked, compiled and run in the
  browser as it's typed.
- **[`ecs-sample-browser`](packages/ecs-sample-browser)**: the sample browser, a tab for each sample.

## Online

These links are to the published site, relative to its root page, which is this README.

- [API reference](ecs/)
- [Sample browser](ecs/samples/): [Guide](ecs/samples/#ecs-guide), [GPU Particles](ecs/samples/#ecs-particles-webgpu),
  [Todos](ecs/samples/#ecs-todo-vanillajs), [Transferred Sprites](ecs/samples/#ecs-transfers-canvas)
- The guide's chapters:
  - [Setup](ecs/samples/#ecs-guide/setup)
  - [Keys and declarations](ecs/samples/#ecs-guide/keys-and-declarations)
  - [1. Resources](ecs/samples/#ecs-guide/1-resources)
  - [2. Entities, components and archetypes](ecs/samples/#ecs-guide/2-entities-components-and-archetypes)
  - [3. Systems](ecs/samples/#ecs-guide/3-systems)
  - [4. Ticks and cadence](ecs/samples/#ecs-guide/4-ticks-and-cadence)
  - [5. Scheduling and composites](ecs/samples/#ecs-guide/5-scheduling-and-composites)
  - [6. Sync points](ecs/samples/#ecs-guide/6-sync-points)
  - [7. Change filters and conditions](ecs/samples/#ecs-guide/7-change-filters-and-conditions)
  - [8. Input](ecs/samples/#ecs-guide/8-input)
  - [9. Rules](ecs/samples/#ecs-guide/9-rules)
  - [10. Finalizers and change sets](ecs/samples/#ecs-guide/10-finalizers-and-change-sets)
  - [11. Traits, within and references](ecs/samples/#ecs-guide/11-traits-within-and-references)
  - [12. Lookups](ecs/samples/#ecs-guide/12-lookups)
  - [13. Indexes](ecs/samples/#ecs-guide/13-indexes)
  - [14. Kernels](ecs/samples/#ecs-guide/14-kernels)
  - [15. Reductions](ecs/samples/#ecs-guide/15-reductions)
  - [16. GPU kernels and render systems](ecs/samples/#ecs-guide/16-gpu-kernels-and-render-systems)
  - [17. Hierarchies](ecs/samples/#ecs-guide/17-hierarchies)
  - [18. Identity and ids](ecs/samples/#ecs-guide/18-identity-and-ids)
  - [19. Threads](ecs/samples/#ecs-guide/19-threads)
  - [20. Shared components and where](ecs/samples/#ecs-guide/20-shared-components-and-where)
  - [21. Animating elements](ecs/samples/#ecs-guide/21-animating-elements)
  - [22. Drawing on a canvas](ecs/samples/#ecs-guide/22-drawing-on-a-canvas)

## Development

Requires Node 24 and pnpm.

```sh
pnpm install
pnpm build
pnpm test
pnpm --filter ecs-sample-browser dev   # every sample, in the sample browser
```

## Contributing

See [CONTRIBUTING](.github/CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
