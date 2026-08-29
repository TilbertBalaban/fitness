// Metro requires a non-platform-suffixed sibling for any platform-extension route file under
// app/ ("Platform-specific extensions ... are supported in the app directory only if a
// corresponding non-platform version also exists" — Expo Router docs). This file exists only to
// satisfy that requirement; the real page lives in reset-password.web.tsx, which Metro resolves
// in its place on every actual web request (native platforms never load this route at all).
export default function ResetPasswordFallback() {
  return null;
}
