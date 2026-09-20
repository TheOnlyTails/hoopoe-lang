# todo-cli

A persistent command-line task manager: `todo add "buy milk"`, `todo done 1`, and
`todo list`.

The example treats the planned host APIs as complete while following the design
work already established around them:

- `std/os.args()` supplies command-line arguments.
- Task-based `std/fs.read_text` and `write_text` operate on `Path` values and
  return typed failures.
- `std/codec/json` derives typed codecs rather than adding filesystem-specific
  `read_json` and `write_json` shortcuts.
- Iterator `map(...).to_list()` rebuilds the immutable todo list.
- Filesystem and codec failures become `StoreError` values and propagate with
  postfix `?`; only a missing store file is handled as an empty store.

The persistence model stays ordinary Hoopoe data:

```hoo
@extend(derive_json())
struct Todo(id: int, title: string, done: boolean)

@extend(derive_json())
struct Store(todos: #[Todo], next_id: int)
```

Arguments become a typed `Command` through list patterns and `Result`, and
implemented functions rely on return inference.

**Status:** 🚧 Design target. The filesystem and codec threads established these
directions but did not settle their final public contracts; `std/os`, `std/fs`,
and `std/codec/json` have not been migrated. It also uses the new `@extend(...)`
attachment syntax, which has not landed in this checkout, so this source is not
yet parser-, formatter-, or compiler-checked here.
