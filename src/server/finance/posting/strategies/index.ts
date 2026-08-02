import {
  postingRegistry,
  registerStrategy,
} from "@/server/finance/posting/registry";
import { accountingVoucherEgresoStrategy } from "@/server/finance/posting/strategies/accounting-voucher";

/**
 * Patch FF1.3-B — the registration point.
 *
 * Importing this module inscribes every known strategy in the default registry.
 * `posting/service.ts` imports it for its side effect, so the engine's public
 * entry point always sees the strategies without any component of the pipeline
 * knowing they exist.
 *
 * Adding an accounting event in FF1.4 means writing a strategy file and adding
 * one line here. The dispatcher, validator, builder and writer stay untouched —
 * which is the property FF1.3-A was built for and this patch verifies.
 *
 * The `has` guard exists because `register` throws on a duplicate event, and Next
 * can re-evaluate a module during development hot reloads. Without it, the
 * second evaluation would crash the process at import time.
 */
const strategies = [accountingVoucherEgresoStrategy];

for (const strategy of strategies) {
  if (!postingRegistry.has(strategy.event)) registerStrategy(strategy);
}

export { accountingVoucherEgresoStrategy };
