# Kernel subset

What a kernel body (`kernel: true` or `"gpu"`) may contain. The build rejects anything else with a message at the
offending code. It is plain TypeScript; types are stripped before compiling.

```
body        = "(" [row ["," context ["," commands]]] ")" "=>" (block | expression) | "function" "(" ... ")" block
row         = identifier | pattern            // parameters may be destructured
statement   = declaration | (assignment | update | call) {"," (assignment | update | call)} | if | loop | break | continue
            | return | block | ";"
declaration = ("const" | "let") pattern "=" expression { "," pattern "=" expression }
pattern     = identifier | "[" pattern { "," pattern } "]" | "{" field [":" pattern] { "," ... } "}"
assignment  = target ("=" | "+=" | "-=" | "*=" | "/=" | "%=" | "**=" | "&=" | "|=" | "^=" | "<<=" | ">>=" | ">>>=") expression
target      = let-local | pattern of let-locals | "row[" component "]"
update      = ("++" | "--") target | target ("++" | "--")
if          = "if (" expression ")" statement ["else" statement]
loop        = "for (" [declaration | assignment] ";" [expression] ";" [assignment | update] ")" statement
            | "while (" expression ")" statement | "do" statement "while (" expression ")"
return      = "return"                        // ends the current row
expression  = literal | identifier | tuple | struct | unary | binary | logical | conditional | member | call
literal     = number | boolean | "null" | "undefined" | "NaN" | "Infinity"
tuple       = "[" expression { "," expression } "]"
struct      = "{" name ":" expression { "," name ":" expression } "}"
unary       = ("-" | "+" | "!" | "~") expression
binary      = expression ("+" | "-" | "*" | "/" | "%" | "**" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "===" | "!=="
              | "&" | "|" | "^" | "<<" | ">>" | ">>>") expression
logical     = expression ("&&" | "||" | "??") expression
conditional = expression "?" expression ":" expression
member      = expression "[" index "]" | expression "." name | expression "?." name
call        = Math-function | helper | lookup | command | reducer
```

## Values

- **Numbers and booleans** are scalars. **Tuples and structs** of them are values with a fixed shape: they are
  immutable, compiled to one local per leaf, and never allocate. A `let` takes a whole new value; its elements can't be
  assigned.
- **The body is `(row, context)`,** and either may be destructured, as in `(row, { resources, lookup, reduce })`.
- **`row[component]`** reads a component in `components.read` or `components.write`, and writes one in
  `components.write`, always whole. `row.entity` is the row's entity.
- **`context.resources[resource]`** reads a resource in `resources.read`, and `context.input` the system's input.
  Kernels don't write resources; they reduce into them.
- **Declarations list exactly what the body uses.** Every component in `components.read`, `components.write` and a
  lookup's `read` must be read or written as listed, every resource in `resources.read` read, and every one in
  `reduce` contributed to; a component only required belongs in `has`.
- **Indexes** are literals, field names, or constants and locals whose value is a number or string literal. Tuples and
  structs are indexed only statically; resources and the input may be indexed at runtime.
- **Shapes are known at build time.** A local holding a component value takes its shape from the leaves the body uses
  or assigns. A tuple or struct component value written or contributed whole with none of its leaves used, as in `row[a] = row[b]`,
  fails at registration: destructure it or index its fields.

## Calls

- **`Math`:** `abs sign floor ceil round trunc min max sqrt cbrt hypot exp expm1 log log1p log2 log10 pow sin cos tan
  asin acos atan atan2 sinh cosh tanh asinh acosh atanh fround imul clz32`, and its constants.
- **Helpers:** functions and constants of any module the build resolves to a file, the kernel's own included, the
  package's math types among them. Each call is inlined in its own module's scope. A helper's body is in the same
  subset; it may `return` early inside `if`, and must end with `return <value>`. No recursion, no closures, no default
  or rest parameters, no spread.
- **Lookups:** `context.lookup.name(entity)` returns the other entity's values in that lookup's `read`, or `null`.
- **Reductions:** `context.reduce[resource](value)` contributes a value to a resource in `reduce`; see `design.md`.
- **Commands:** `context.commands.spawn(components)({ [component]: value, ... })`, `despawn(entity)`,
  `add(entity, component, value)` or `add(entity, components, { ... })`, and `remove(entity, component)` or
  `remove(entity, components)`, with component keys bound at module scope. A list of components is an array literal of
  them, or a constant holding one or `Archetype.create` of one, in the kernel's module or imported, also through
  re-exports and namespaces, its keys read in the scope of the module that declares it; a component it lists that a
  command gives no value starts at its start. A list the build can't read, such as one computed when its module runs,
  fails the build at the command. `add` and `remove` take a name as one key when its definition is `Symbol(...)`, as a
  list when it's a list, and otherwise fail the build with the reason; a name from a package external to the build,
  which the build can't read, is one key, and registration rejects a list there. The spawner is called where it's made.

## GPU kernels

Also no lookups, change filters, commands, reductions or loops, and only 4-byte scalar values: f32,
i32, u32, and booleans in a `"storage"` layout. Results follow WGSL where it leaves JS results indeterminate (NaN and
infinities).

## Not in the subset

`var`, classes, closures and function expressions, `this`, `new`, `delete`, `typeof`, `in`, `instanceof`, strings
other than as keys, template literals, regular expressions, `try`, `throw`, `switch`, labels, generators, `async`,
spread, holes, optional calls, and module state other than constants.
