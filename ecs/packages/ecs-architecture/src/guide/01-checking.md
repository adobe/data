# Checking an app

`check(files)` reads every `.ts` and `.md` file of an app's source folder, by its path there, and resolves to each
place it breaks the standard as a `Violation`: the `file`, the `rule` it breaks, the `problem` and the `fix`. It's
pure: the files go in as text and nothing is read or written, so the CLI, a test and this program run it the same.

[The app here](01-checking.ts#L7-L18) is a `todos` feature with a `model` and a `view`, and `main`, the feature that
starts the app, both in `features/`, the folder of the source root's features:

- Each layer is a component: a `README.md`, an `index.ts` that only re-exports, and one public declaration per root
  file, named `<kind>.<name>.ts`.
- `features/main/view/entry.page.ts` is an entry, which the page loads: it runs as it loads, exports nothing, so its
  layer's `index.ts` is `export {}`, and its `world.run(addTodo)` runs the system the model exports.

[As written](01-checking.ts#L26) it breaks nothing. Each change after it breaks one rule:

- [A deep import](01-checking.ts#L27) reaches past the model's `index.ts`, so its `title` is also an export nothing
  imports through it.
- [The model reads `document`](01-checking.ts#L28): a model runs headless.
- [Nothing runs `addTodo`](01-checking.ts#L29) once `entry.page.ts` only names it.
- [An export nobody uses](01-checking.ts#L30-L34) belongs in a private folder.

Each `violation.rule` is a stable id, and `violation.fix` says what to change, written for whoever, or whatever,
fixes it.
