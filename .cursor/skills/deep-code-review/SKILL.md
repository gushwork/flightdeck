---
name: deep-code-review
description: Performs deep code review with a mandatory AskQuestion step when scope is unclear (full codebase or named area vs diff or change set only); emphasizes security vulnerabilities, unsafe data handling, authz gaps, and unintended changes. Use when the user requests code review, security review, PR review, diff audit, pre-merge check, vulnerability pass, or asks what a change broke.
---

# Deep code review

## When to use

Apply this skill when the user asks to review code, audit a PR or branch, check security, find unintended changes, or validate work before merge.

## Scope: AskQuestion first

**Do not assume** the review is diff-only.

1. If the user **already stated scope** clearly (e.g. “only `lib/postgres`”, “just this PR”, “staged files”), skip to [Review workflow](#review-workflow).
2. Otherwise, call **`AskQuestion`** once with prompt **“What should this review cover?”** and at least these options:
   - **Diff / change set only** — staged changes, a PR, branch vs default branch, or `@`-mentioned files.
   - **Whole module or codebase** — broader pass; after the answer, confirm concrete paths (directory or “entire repo”).
3. If **`AskQuestion`** is unavailable, ask the same choice in a single short message and wait for the reply before reviewing.

## Review workflow

After scope is known:

1. **Intent** — What the change or area is supposed to do vs what the code actually does.
2. **Diff-only path** — Read the **full** diff (not isolated hunks). Trace **call sites** and **data flow** for modified symbols.
3. **Broader path** — Prioritize high-risk surfaces: API routes, authentication/authorization, database access, secrets, and client/server boundaries. Expand through the user-named scope. If something outside the diff interacts with changed code, still flag it.
4. **Severity** — Label each finding: Critical, High, Medium, Low, or Note. Do not use emoji in severity labels.
5. **Per finding** — Give **location** (file and symbol or line range when known), **why it matters**, and a **concrete fix or verification step**.

## Security lens

Actively search for:

| Area | What to check |
|------|----------------|
| **Injection** | SQL/command construction, unsafe concatenation into queries or shells, risky `eval` or deserialization |
| **Authn / Authz** | Missing checks on API routes, IDOR (resource access by ID without ownership/role), trusting client-only validation |
| **Secrets** | Tokens or keys in logs, committed env files, secrets or internal URLs exposed to the client bundle |
| **XSS / HTML** | Unsanitized user content in React or HTML output |
| **SSRF / redirects** | User-controlled URLs fetched server-side or used in redirects |
| **Path / filesystem** | Unsafe path joining, arbitrary read/write |
| **Dependencies / config** | Risky new packages, overly permissive CORS, debug flags left enabled |

### This repo: client/server boundary

Cross-check [`.cursor/rules/validate-after-changes.mdc`](.cursor/rules/validate-after-changes.mdc): **`"use client"`** code and the client bundle must not import Node-only modules (`child_process`, `fs`, `path`, etc.) transitively. Treat violations as reliability and security-boundary issues.

## Unintended changes lens

- **Scope creep** — Files or behavior changed beyond the stated goal; drive-by refactors.
- **Semantics** — Renamed or removed exports still used elsewhere; changed defaults, errors, or return shapes.
- **Contracts** — API shapes, env vars, schema/migrations, feature flags.
- **Tests / docs** — Removed or weakened coverage; documentation that no longer matches behavior.
- **Noise** — Formatting-only churn that hides meaningful edits (mention if it hurts reviewability).

## Output format

Use this structure for the final review:

```markdown
## Executive summary
[Short overview of risk and quality]

## Security findings
[By severity; each with location, impact, fix/verification]

## Unintended or behavioral risks
[Scope, semantics, contracts, tests/docs]

## Suggestions
[Non-blocking improvements]

## Residual questions
[Only if something cannot be verified from the repo]
```

## Progressive disclosure

Keep deep dives in this file unless it grows past ~300 lines; then add a sibling `reference.md` (one level only) for expanded patterns.
