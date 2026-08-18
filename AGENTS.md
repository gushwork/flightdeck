# Agent instructions

Instructions for any agent working in this repository.

## Code search: graphify first

Before using `Grep`, `Glob`, or blind filename guessing, search the structural code index with **graphify**.

The index lives at `graphify-out/graph.json`. Full command reference: [`.agents/skills/graphify/SKILL.md`](.agents/skills/graphify/SKILL.md).

### Setup (if the index is missing)

```bash
npm i -g graphify-ts   # one-time per machine
graphify build .
```

### Search workflow

1. **Query the graph** for the symbol, type, or concept you need:

   ```bash
   graphify query graphify-out/graph.json <name>
   ```

2. **Open the returned files** at the listed locations. Use `imports`, `calls`, and `contains` edges in the graph output to follow relationships.

3. **Fall back to Grep/Glob** only when graphify returns no matches, the index does not exist yet, or you need literal string matches (comments, config keys, error messages) that AST extraction would miss.

### When to use graphify

| Situation | Action |
|-----------|--------|
| Find where a function, class, or type is defined | `graphify query` first |
| Explore an unfamiliar area of the codebase | `graphify query` for entry-point symbols |
| Trace imports or callers | Query symbol, then follow graph edges |
| Exact string in a comment or JSON key | Grep is fine after graphify misses |

## Mandatory: update the graph after edits

**Every task that changes source code must end with a graph refresh.** Do not skip this step.

After any edit to tracked source files, run one of:

```bash
# Preferred — picks up all changed/untracked code files from git
graphify auto-update .

# Or, when you know the exact files you touched
graphify update graphify-out/graph.json <file1> [file2...]
```

If you edited many files across the session, `graphify auto-update .` is usually enough.

If `graphify-out/graph.json` does not exist yet, run `graphify build .` instead.

Confirm the update succeeded (no CLI error). The next agent session depends on an accurate index.

## Task checklist

1. Read [`CODEBASE.md`](CODEBASE.md) for project orientation.
2. **Search with graphify** before Grep/Glob.
3. Make the requested changes.
4. Run project validation (`npx tsc --noEmit`, `npm run lint`) when changes are substantive.
5. **Update the graph** (`graphify auto-update .` or `graphify update …`) — mandatory.

## Other project rules

- Navigation and new routes: update [`lib/modules/registry.ts`](lib/modules/registry.ts) and [`lib/modules/overview-directory.ts`](lib/modules/overview-directory.ts) — see [`.cursor/rules/nav-and-overviews.mdc`](.cursor/rules/nav-and-overviews.mdc).
- UI in `app/` and `components/`: follow [`.cursor/rules/design-anti-patterns.mdc`](.cursor/rules/design-anti-patterns.mdc).
- Keep [`CODEBASE.md`](CODEBASE.md) current after substantive architectural or structural changes.
