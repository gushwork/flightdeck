# Claude instructions

Follow [`AGENTS.md`](AGENTS.md) for all work in this repository.

That file is the source of truth for agent behavior here. In particular:

- **Search code with graphify first** — query `graphify-out/graph.json` before `Grep` or `Glob`.
- **Update the graph after every edit** — run `graphify auto-update .` (or `graphify update …`) as the last step of any task that changes source files.

Also read [`CODEBASE.md`](CODEBASE.md) at the start of each task for project structure and conventions.
