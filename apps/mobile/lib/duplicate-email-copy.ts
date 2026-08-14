// Three independent constants, not a runtime split. Sign-up disclosing that an address is already
// registered is a deliberate, documented UI-SPEC trade-off (unlike sign-in and forgot-password,
// which are deliberately enumeration-safe) — see 01-UI-SPEC.md's error-copy table. Concatenating
// lead + link label + tail must equal that row verbatim, asserted in auth-forms.test.ts. This
// module holds no other dependency so that assertion can import it directly, rather than through
// the sign-up screen, which pulls in expo-router and better-auth's ESM-only client at module load.
export const DUPLICATE_EMAIL_LEAD = 'An account with this email already exists. ';
export const DUPLICATE_EMAIL_LINK_LABEL = 'Sign in instead';
export const DUPLICATE_EMAIL_TAIL = '.';
