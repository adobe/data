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
