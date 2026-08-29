// A narrow structural interface, not expo-router's Router type: this module takes the router as
// an argument and never imports expo-router itself, which is what makes goBackOrReplace testable
// with a plain object of jest.fn()s and no renderer. Mirrors handleAddCustomExercisePress in
// app/exercises/index.tsx:41-48, written for the identical reason.
export interface BackRouter {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: string) => void;
}

// The direct-URL-load / refresh case is exactly what makes this a function rather than "just show
// the header": react-navigation's own canGoBack is false on a single-entry stack, so the fallback
// branch below is not a defensive extra, it is the branch the reported bug actually hits.
export function goBackOrReplace(router: BackRouter, fallbackHref: string): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallbackHref);
}
