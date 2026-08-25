// This constant has no dependency on ./powersync (native, @powersync/react-native) or
// ./powersync.web on purpose: e2e spec files import it directly under Playwright's Node process,
// which has no platform-extension resolution and would otherwise resolve a transitive
// './log-set' -> './powersync' import to @powersync/react-native's dist, whose extensionless
// re-exports are invalid under strict Node ESM. Keep this module free of any import so that
// chain can never reappear here.

// The ternary, not a bare string literal, is load-bearing: an unconditional
// `export const DURABILITY_HARNESS_GLOBAL = '__fitnessDurability'` would survive in a production
// bundle regardless of the flag, because __durability.web.tsx imports this module unconditionally
// for its other (always-real) exports — the string constant itself is not behind any branch.
// Terser folds this literal-boolean ternary at build time, so the '__fitnessDurability' branch is
// eliminated from the compiled output whenever the flag is unset, exactly as the window-attach
// branch in __durability.web.tsx is.
export const DURABILITY_HARNESS_GLOBAL =
  process.env.EXPO_PUBLIC_DURABILITY_HARNESS === '1' ? '__fitnessDurability' : '';
