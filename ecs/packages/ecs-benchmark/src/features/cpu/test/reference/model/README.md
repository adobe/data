# model

The suite's components, entity factories and systems written plainly, in mutable objects, as its C++ is: the
reference `cpu`'s tests check the model's frames against, value for value. `updateEntities` and `mixedUpdateEntities`
make the benchmarks' entities, `update` runs a frame, and `generator` and `next` are the suite's xoshiro128**.

It keeps its own player types and statuses rather than importing the root model's, so it checks the model independently, as the suite's C++ does.
