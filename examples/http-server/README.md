# http-server

A bounded model of an HTTP router. It exercises service routing without opening a
socket or leaving an unbounded process behind.

The whole router is one `match`, keyed on the **method and path together**:

```hoo
func route(method: Method, path: string) = match (#(method, path)) {
  #(Method.Get, requested) if requested == "/health" -> "200 ok",
  #(Method.Get, requested) if requested == "/" -> "200 welcome",
  _ -> "404 not found",
}
```

What it shows:

- **`Method` as an enum** — matching `Method.Get`/`Method.Post` is exhaustive and
  typo-proof, unlike matching on strings.
- **Handlers are plain functions** — the router is independently testable.

```sh
hoo run
# 200 ok
# 404 not found
```

**Status:** ✅ Runs today and terminates after two requests. A future host-backed
server can reuse the pure router while keeping smoke tests bounded.
