# hello-world

The smallest Hoopoe program: print a line and exit.

```hoo
import std/io with (println)

func main(): void = {
  println("Hello, world!")
}
```

`main()` takes no arguments and returns nothing — it's the entry point the runner
calls. `println` comes from `std/io`; string arguments are printed as-is.

**Status:** ✅ Runs today.

```sh
hoopoe run
# Hello, world!
```
