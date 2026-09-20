# hello-world

The smallest Hoopoe program: print a line and exit.

```hoo
import std/io with (println)

func main() = println("Hello, world!")
```

`main()` takes no arguments and infers its `void` return type from `println`. It's the
entry point the runner calls. String arguments are printed as-is.

**Status:** ✅ Runs today.

```sh
hoo run
# Hello, world!
```
