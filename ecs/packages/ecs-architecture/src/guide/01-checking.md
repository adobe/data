# Checking an app

`check(files)` reads every `.ts` and `.md` file of an app's source folder, by its path there, and gives each place it
breaks the standard as a `Violation`: the `file`, the `rule` it breaks, the `problem` and the `fix`. It's pure: the
files go in as text and nothing is read or written, so the CLI, a test and this program run it the same.

[The app here](01-checking.ts#L8-L19) is a `todos` feature with a `model` and a `view`, and an app in `app/`:

- Each layer is a component: a `README.md`, an `index.ts` that only re-exports, and one public declaration per root
  file, named `<kind>.<name>.ts`.
- Each lists its systems in `constant.systems.ts`; `world.run(addTodo)` runs the one the model exports.

[As written](01-checking.ts#L27) it breaks nothing. Each change after it breaks one rule:

- [A deep import](01-checking.ts#L28) reaches past the model's `index.ts`, so its `title` is also an export nothing
  imports through it.
- [The model reads `document`](01-checking.ts#L29): a model runs headless.
- [Nothing runs `addTodo`](01-checking.ts#L30) once the app only names it.
- [An export nobody uses](01-checking.ts#L31-L35) belongs in a private folder.

Each `violation.rule` is a stable id, and `violation.fix` says what to change, written for whoever, or whatever,
fixes it.
