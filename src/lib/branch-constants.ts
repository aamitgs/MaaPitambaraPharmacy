// Plain constants shared between server-only branch-scope.ts and client
// components (branch-switcher.tsx) — kept in their own module so client
// bundles never pull in branch-scope.ts's "server-only"/next/headers deps.
export const SELECTED_BRANCH_COOKIE = "selectedBranchId";
export const ALL_BRANCHES = "all";
