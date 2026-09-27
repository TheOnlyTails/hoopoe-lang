# metaprogramming

A runnable example of the compile-time macro model:

- `@replace_with_counter()` is an attached macro that replaces its declaration.
- `@extend(computed())` retains a declaration and appends generated code.
- `@computed.value` is inert metadata declared with `@attributes`.
- `meta.Expression<int>` accepts a token quote directly.
- Contextual `this` refers to the enclosing struct or narrowed enum variant and
  keeps that identity when a macro interpolates the expression.
- The quoted field expression can call the module-level `offset()` function.

```sh
hoo check
hoo expand main
hoo run
```

Expected output:

```text
computed reading: 42
hit rank: 105
replacement counter: 7
```
