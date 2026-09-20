# word-frequency

Read a document, count normalized words in a persistent map, and print the five
most common entries.

```hoo
let counts = text
  .replace("\n", " ")
  .split(" ")
  .iter()
  .map((word) -> word.trim().to_lower())
  .filter((word) -> !word.is_empty())
  .fold(#{}, (counts: #{string: int}, word) ->
    counts.inserted(word, (counts.get(word) ?? 0) + 1))
```

The pipeline is lazy until `fold` consumes it. Each insertion returns a new map;
older maps remain unchanged. Ranking starts from `counts.entries().iter()` and
uses the implemented `sorted_by(...).take(5u)` iterator adapters. `main` uses
postfix `?` to preserve filesystem failures for the executable root.

**Status:** 🚧 Design target. The iterator pipeline uses today's API. The
task-based `std/fs.read_text(Path)` call follows the filesystem design direction,
but that module's final public contract has not been settled or migrated. The
source is format-checked but not compiler-checked.
