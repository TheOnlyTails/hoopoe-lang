# http-server

A small HTTP/1.1 service built against the designed immutable `std/http` and
`std/net` APIs.

Routes are ordinary persistent values. Constructing the router and calling
`bind_default` create cold recipes; network work starts when `main` awaits them.

```hoo
func routes() = Router.from_routes(#[
  Route(method = Method.Get, path = "/", handler = Home),
  Route(method = Method.Get, path = "/health", handler = Health),
  Route(method = Method.Post, path = "/echo", handler = Echo),
])
```

The echo handler reads the one-shot request body with the standard 8 MiB limit
and accepts only valid UTF-8. `App` implements `Handler<!Network>`, so `serve`
can run it for each accepted exchange. `main` propagates bind and serving failures
with postfix `?` so the executable root reports them consistently.

```sh
hoo run
# listening on http://127.0.0.1:8080

curl --data 'Hello!' http://127.0.0.1:8080/echo
# Hello!
```

**Status:** 🚧 Design target. These APIs were designed and implemented before
the language rework, but their modules have not yet been migrated to the current
standard-library tree. The source is format-checked but not compiler-checked.
