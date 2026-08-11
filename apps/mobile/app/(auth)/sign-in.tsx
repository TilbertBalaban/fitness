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

const INVALID_EMAIL = 'Enter a valid email address.';
// Generic on purpose: a message that distinguished "no such account" from "wrong password" would
// make this screen a registration oracle (T-01-02).
const CREDENTIALS_REJECTED = 'Incorrect email or password. Try again.';
const SERVER_UNREACHABLE = "Can't reach the server. Check your connection and try again.";

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validateEmail(): boolean {
    const valid = isValidEmail(email);
    setEmailError(valid ? null : INVALID_EMAIL);
    return valid;
  }

  async function onSubmit() {
    setSubmitError(null);
    if (!validateEmail()) return;

    setSubmitting(true);

    // Seeded with `offline` because onResponse is the one hook that does not fire when the request
    // never produced a response at all — the transport failure D-03 keeps structurally separate
    // from a server rejection.
    let outcome: AuthOutcome = 'offline';
    const { error } = await authClient.signIn.email(
      { email, password },
      {
        onResponse: async ({ response }) => {
          outcome = await classifyAuthOutcome(response);
        },
      },
    );

    if (error) {
      setSubmitError(outcome === 'offline' ? SERVER_UNREACHABLE : CREDENTIALS_REJECTED);
    }

    setSubmitting(false);
  }

  return (
    <AuthScreenLayout>
      <View className="gap-md">
        <Text className="text-display font-semibold text-foreground">Welcome back</Text>

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

        <TextField
          label="Password"
          secure
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
        />

        <ErrorBanner message={submitError} />

        <PrimaryButton label="Sign In" onPress={onSubmit} submitting={submitting} />

        <View className="gap-md">
          <Link href="/(auth)/forgot-password" className="text-body font-normal text-accent">
            Forgot password?
          </Link>
          <Link href="/(auth)/sign-up" className="text-body font-normal text-accent">
            Create account
          </Link>
        </View>
      </View>
    </AuthScreenLayout>
  );
}
