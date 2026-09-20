# Hoopoe examples

A gallery of small, idiomatic Hoopoe projects. Some run against today's standard
library. Others intentionally use planned APIs as if they already existed, so the
examples also define the language and library we are building toward.

Examples marked as runnable parse, follow the canonical format, compile, and run
under exact-output tests. Design targets may use language or standard-library work
that has not landed in this checkout yet; they become checked examples as those
pieces are migrated.

## Project layout

Every example is a self-contained project: a `hoopoe.toml` manifest at the root and
sources under `src/`, with `src/main.hoo` as the entry module. Its `main()` function
takes no arguments and is the program's entry point; the compiler infers its `void`
return type.

```
todo-cli/
  hoopoe.toml        # name, version, dependencies
  src/
    main.hoo        # func main() = { … }
```

Run one from its project directory with:

```sh
hoo check           # selects build.entry from hoopoe.toml
hoo build
hoo run
```

You can also run an example from outside its directory by selecting its
manifest exactly (the option may appear before or after the subcommand):

```sh
hoo --manifest examples/hello-world/hoopoe.toml check
hoo build --manifest examples/hello-world/hoopoe.toml
hoo run --manifest examples/hello-world/hoopoe.toml
```

## The examples

| Example                              | What it shows                                                               | Status                 |
| ------------------------------------ | --------------------------------------------------------------------------- | ---------------------- |
| [`hello-world`](./hello-world)       | The smallest program — `println` from `std/io`.                             | ✅ runs                |
| [`fizzbuzz`](./fizzbuzz)             | Ranges, `match`, guards, string interpolation — no imports beyond `std/io`. | ✅ runs                |
| [`shapes`](./shapes)                 | Enums, interfaces + `impl`, generics, exhaustive `match`. Pure language.    | ✅ runs                |
| [`word-frequency`](./word-frequency) | Task-based file input, persistent maps, and a lazy iterator pipeline.       | 🚧 planned `std/fs`    |
| [`todo-cli`](./todo-cli)             | Arguments, typed commands, JSON persistence, and immutable updates.         | 🚧 planned host APIs   |
| [`http-server`](./http-server)       | Immutable routing, typed requests and responses, and one-shot bodies.       | 🚧 HTTP migration      |

## Language features on display

- **No `null`, no exceptions** — absence is `Option<T>`, failure is `Result<T, E>`,
  handled with `match` or combinators (`map`, `and_then`, `??`).
- **Sum types + exhaustive matching** — `enum`s with per-variant fields, checked so
  every case is handled.
- **Interfaces & operator overloading** — behavior attached with `impl … for …`,
  including the ambient operator prelude (`Plus`, `Comparable`, …).
- **Persistent updates** — collection updates and struct spreads return new values;
  existing values remain unchanged.
- **Return inference** — implemented functions omit return annotations when their
  bodies determine the type; bodyless interface methods state their contracts.
- **Lazy iteration** — `map`/`filter`/`take`/`fold` defined once on `Iterator`,
  composing without intermediate allocation.
- **Compiles to clean JavaScript** — the whole thing runs on any JS runtime.
