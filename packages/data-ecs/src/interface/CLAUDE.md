# The interface

This folder is the public contract, and only the minimal one: what a consumer must name or call to use the ECS
correctly. Everything that can be hidden is an implementation detail and stays in `src/implementation`. Each hidden
part is one the implementation can change freely later.

## Humans own the interface

Humans own and review this folder; agents own the implementation. An agent doesn't add to or widen the contract on its
own. That includes:

- exported types, values and functions;
- fields, options, parameters and return types;
- union members, failure kinds and report fields;
- built-in components and resources;
- the documented behaviour of an existing call.

When work seems to need a change here, first find a way to keep it out:

- Infer the type the implementation needs (`Parameters<…>`, `ReturnType<…>`, indexed access) instead of exporting a
  name for it.
- Keep protocol state, progress and bookkeeping in the implementation's own storage, not in components or resources
  consumers can see.
- Give a value a narrower public type than its runtime shape.

If it truly can't be hidden, don't make the change. Propose it in your report, with the smallest form that would work
and why nothing smaller does, and leave it for human review.
