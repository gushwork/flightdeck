# SP-06: Nav wiring

## Type
Integration

## Blocked by
- SP-05 (routes `/route53`, `/route53/fly-domains` exist)

## Goal
Wire Route 53 into AWS nav surfaces, topbar workspace selectors, shell context, and codebase map; run final validation.

## Owns
- `lib/modules/registry.ts`
- `lib/modules/overview-directory.ts`
- `lib/nav/aws-workspace-topbar.ts`
- `components/layout/shell.tsx`
- `components/layout/sidebar.tsx` — `NavIconId` + icon map only
- `CODEBASE.md`

## Provides
- `ModuleId: "route53"` in registry
- Sidebar: collapsible AWS group includes `route53`; parent **Route 53** → `/route53`; child **Fly domains** → `/route53/fly-domains`
- AWS overview subsection for Route 53
- Topbar region/profile on `/route53/*`
- Shell page context for route53 pages

## Consumes
| From | Contract | Until merged, use |
|------|----------|-------------------|
| SP-05 | Routes `/route53`, `/route53/fly-domains` | must exist before merge |

## Out of scope
- Feature logic, API routes, UI components in `components/route53/`

## Implementation notes
- Follow `.cursor/rules/nav-and-overviews.mdc` checklist.
- Add `route53` to AWS `SIDEBAR_SERVICE_GROUPS.moduleIds` (after iam or amplify — pick consistent order).
- New icon id e.g. `globe` or `dns` in `NavIconId` + sidebar icons map.
- `showAwsWorkspaceSelectors`: add `/route53` prefix match.
- `derivePageContext`: `route53Hub`, `route53FlyDomains`.
- Update `CODEBASE.md` with module, routes, cross-service bridge note.
- Run `npx tsc --noEmit`, `npm run lint`, `graphify auto-update .`

## Done when
- [ ] Sidebar shows Route 53 under AWS with Fly domains child
- [ ] `/aws` overview lists Route 53 subsection
- [ ] Topbar selectors visible on route53 pages
- [ ] tsc + lint pass; graphify updated
- [ ] No edits outside **Owns**

## Agent spawn brief
Wire navigation per nav-and-overviews rule and `docs/plans/fly-route53-domains/contracts.md`. Add route53 module to registry and overview-directory. Parent nav Route 53 → /route53, child Fly domains → /route53/fly-domains. Update shell, sidebar icon, aws-workspace-topbar, CODEBASE.md. Run tsc, lint, graphify auto-update. Do not change feature API or UI components.
