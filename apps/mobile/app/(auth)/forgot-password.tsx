import { useState } from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import { AuthScreenLayout } from '@/components/AuthScreenLayout';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { authClient } from '@/lib/auth-client';
import { classifyAuthOutcome, type AuthOutcome } from '@/lib/session-guard';
import { isValidEmail } from '@/lib/validation';
import { PASSWORD_RESET_REDIRECT_URL } from '@/lib/web-app-origin';

const INVALID_EMAIL = 'Enter a valid email address.';
const SERVER_UNREACHABLE = "Can't reach the server. Check your connection and try again.";
const UNEXPECTED_FAILURE = 'Something went wrong. Try again.';
// Rendered whether or not the address has an account — the client half of the guarantee the server
// already makes by answering both cases identically (T-01-02).
const RESET_REQUESTED = "If an account exists for that email, we've sent a reset link.";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);

  function validateEmail(): boolean {
    const valid = isValidEmail(email);
    setEmailError(valid ? null : INVALID_EMAIL);
    return valid;
  }

  async function onSubmit() {
    setSubmitError(null);
    if (!validateEmail()) return;

    setSubmitting(true);

    let outcome: AuthOutcome = 'offline';
    const { error } = await authClient.requestPasswordReset(
      { email, redirectTo: PASSWORD_RESET_REDIRECT_URL },
      {
        onResponse: async ({ response }) => {
          outcome = await classifyAuthOutcome(response);
        },
      },
    );

    // An address with no account answers 200 here, so it lands on the success path with the rest.
    // Only a transport failure or a genuine server fault reaches an error branch, and neither
    // correlates with whether the address is registered.
    if (!error) {
      setRequested(true);
    } else {
      setSubmitError(outcome === 'offline' ? SERVER_UNREACHABLE : UNEXPECTED_FAILURE);
    }

    setSubmitting(false);
  }

  if (requested) {
    return (
      <AuthScreenLayout>
        <View className="gap-md">
          <Text className="text-heading font-semibold text-foreground">Forgot password</Text>
          <Text className="text-body font-normal text-foreground">{RESET_REQUESTED}</Text>
          <Link href="/(auth)/sign-in" className="text-body font-normal text-accent">
            Back to sign in
          </Link>
        </View>
      </AuthScreenLayout>
    );
  }

  return (
    <AuthScreenLayout>
      <View className="gap-md">
        <Text className="text-heading font-semibold text-foreground">Forgot password</Text>

        <TextField
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setEmailError(null);
          }}
          onBlur={() => {
            if (email) validateEmail();
          }}
          error={emailError}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />

        <ErrorBanner message={submitError} />

        <PrimaryButton label="Send Reset Link" onPress={onSubmit} submitting={submitting} />

        <Link href="/(auth)/sign-in" className="text-body font-normal text-accent">
          Back to sign in
        </Link>
      </View>
    </AuthScreenLayout>
  );
}
