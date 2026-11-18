# model

The app's foundation: the ecs_benchmark suite's data, ported to the ECS with the same types, widths and generator as its C++: the components,
the constants its systems and factories share (default values, player types, status effects, sprites, the frame's size,
the time step), its xoshiro128** generator, the frame buffer, and the helpers that make its heroes, monsters and mixed
entities. The `cpu` and `gpu` scenarios build on it.
