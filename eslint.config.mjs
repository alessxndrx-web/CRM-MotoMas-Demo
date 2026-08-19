import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not application code: an empty nested repository and Playwright output.
    "ERP-motomas/**",
    "test-results/**",
  ]),

  // =========================================================================
  // Patch V1.0 — `react-hooks/set-state-in-effect` baseline.
  //
  // BASELINE, NOT AN AMNESTY. Same contract as the knip ignore list: these
  // eleven paths are the files that already violated the rule when the rule
  // started being enforced. A twelfth file is not covered and fails the build.
  //
  // Why these are not simply fixed here:
  //
  //   Every one belongs to the LEGACY localStorage layer — not one is a `*-db`
  //   module. The seven top-level panels render `null` whenever PostgreSQL is
  //   configured (`shouldShowLegacyOperationalPanel`, src/shared/feature-flags.ts);
  //   the three `customer-file-*` components are their children and never mount
  //   either; `demo-session-login.tsx` is unreachable outright and is already
  //   listed DELETE-PENDING in knip.json. The whole layer is due for deletion.
  //
  //   The violations are of three kinds, and none has a local fix:
  //     - mount hydration from localStorage, which cannot be done during
  //       render at all and needs `useSyncExternalStore`;
  //     - resynchronising state when a prop changes, which needs either a
  //       `key` remount driven by the parent or previous-value tracking;
  //     - keeping a selection valid, which needs the effective selection
  //       derived during render and threaded through the component.
  //
  //   All three are state-management rewrites of ~7,000 lines that carry no
  //   unit tests and are due to be deleted. Doing them inside the patch that
  //   introduces the harness would also make that patch unreviewable.
  //
  // A further 7 violations in these same files were FIXED rather than baselined:
  // their effect bodies were provably unreachable, because the derived value
  // already fell back to `filtered[0]` during render. See CHANGES.md (Patch V1.0).
  //
  // `warn`, not `off`: the count stays visible in `npm run lint` output. This
  // block is deleted wholesale when the legacy layer is removed; if you are
  // deleting the last path here, delete the block too.
  // =========================================================================
  {
    files: [
      "src/features/operations/components/customer-file-credit-panel.tsx",
      "src/features/operations/components/customer-file-documents-panel.tsx",
      "src/features/operations/components/customer-file-quote-panel.tsx",
      "src/features/operations/components/demo-session-login.tsx",
      "src/features/operations/modules/customer-files/customer-files-list.tsx",
      "src/features/operations/modules/customers/customers-list.tsx",
      "src/features/operations/modules/inventory/inventory-panel.tsx",
      "src/features/operations/modules/leads/leads-inbox.tsx",
      "src/features/operations/modules/reservations/reservations-panel.tsx",
      "src/features/operations/modules/sales/sales-panel.tsx",
      "src/features/operations/modules/transfers/transfers-panel.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
