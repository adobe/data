# Identity and ids

A key, system, index, rule or finalizer is the value its constructor returns. Two written alike are two, and code
written apart can't collide.

The build gives each one bound at a module's top level an *id*: its package's name and version, its module's path,
and its binding. Other threads, and a module evaluated again by hot reload, name the same one by it.

What fails is named by its binding, with its id beside it to tell two of one name apart, as
[`explode`](18-identity.ts#L4-L6)'s error shows.
