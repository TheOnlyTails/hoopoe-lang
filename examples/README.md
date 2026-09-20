# Hoopoe examples

A gallery of small, idiomatic Hoopoe projects — the kind of thing you'd reach for
the language to build. They double as a north star for the language and standard
library: they show the _surface we're aiming at_, written the way we want Hoopoe to
read.

Every checked-in example is a compiler-checked project. Programs use immutable
values and explicit executable roots; runnable examples are deterministic, and the
service-shaped example is deliberately bounded so smoke checks always terminate.

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

| Example                              | What it shows                                                               | Ambient today?         |
| ------------------------------------ | --------------------------------------------------------------------------- | ---------------------- |
| [`hello-world`](./hello-world)       | The smallest program — `println` from `std/io`.                             | ✅ runs                |
| [`fizzbuzz`](./fizzbuzz)             | Ranges, `match`, guards, string interpolation — no imports beyond `std/io`. | ✅ runs                |
| [`shapes`](./shapes)                 | Enums, interfaces + `impl`, generics, exhaustive `match`. Pure language.    | ✅ runs                |
| [`word-frequency`](./word-frequency) | Persistent maps and a lazy iterator pipeline with stable sorting.           | ✅ runs                |
| [`todo-cli`](./todo-cli)             | Typed command parsing and immutable state transitions.                      | ✅ runs                |
| [`http-server`](./http-server)       | A bounded routing/service smoke.                                            | ✅ runs and terminates |

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
