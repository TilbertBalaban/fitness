import { useState } from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import { AuthScreenLayout } from '@/components/AuthScreenLayout';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { authClient } from '@/lib/auth-client';
import {
  DUPLICATE_EMAIL_LEAD,
  DUPLICATE_EMAIL_LINK_LABEL,
  DUPLICATE_EMAIL_TAIL,
} from '@/lib/duplicate-email-copy';
import { classifyAuthOutcome, type AuthOutcome } from '@/lib/session-guard';
import { isValidEmail, isValidPassword } from '@/lib/validation';

const INVALID_EMAIL = 'Enter a valid email address.';
const PASSWORD_TOO_SHORT = 'Password must be at least 8 characters.';
const PASSWORDS_DO_NOT_MATCH = "Passwords don't match.";
const SERVER_UNREACHABLE = "Can't reach the server. Check your connection and try again.";
const UNEXPECTED_FAILURE = 'Something went wrong. Try again.';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function validateEmail(): boolean {
    const valid = isValidEmail(email);
    setEmailError(valid ? null : INVALID_EMAIL);
    return valid;
  }

  function validatePassword(): boolean {
    const valid = isValidPassword(password);
    setPasswordError(valid ? null : PASSWORD_TOO_SHORT);
    return valid;
  }

  function validateConfirmPassword(): boolean {
    const valid = confirmPassword === password;
    setConfirmError(valid ? null : PASSWORDS_DO_NOT_MATCH);
    return valid;
  }

  async function onSubmit() {
    setSubmitError(null);
    setDuplicateEmail(false);

    // Every field is evaluated, so a form with three problems reports all three at once instead of
    // surfacing them one submit at a time.
    const emailOk = validateEmail();
    const passwordOk = validatePassword();
    const confirmOk = validateConfirmPassword();
    if (!emailOk || !passwordOk || !confirmOk) return;

    setSubmitting(true);

    let outcome: AuthOutcome = 'offline';
    const { error } = await authClient.signUp.email(
      { email, password, name: email },
      {
        onResponse: async ({ response }) => {
          outcome = await classifyAuthOutcome(response);
        },
      },
    );

    if (error) {
      if (outcome === 'offline') {
        setSubmitError(SERVER_UNREACHABLE);
      } else if (error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
        setDuplicateEmail(true);
      } else {
        setSubmitError(UNEXPECTED_FAILURE);
      }
    }

    setSubmitting(false);
  }

  return (
    <AuthScreenLayout>
      <View className="gap-md">
        <Text className="text-display font-semibold text-foreground">Create your account</Text>

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
          onChangeText={(value) => {
            setPassword(value);
            setPasswordError(null);
          }}
          onBlur={() => {
            if (password) validatePassword();
          }}
          error={passwordError}
          autoComplete="new-password"
          textContentType="newPassword"
        />

        <TextField
          label="Confirm password"
          secure
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            setConfirmError(null);
          }}
          onBlur={() => {
            if (confirmPassword) validateConfirmPassword();
          }}
          error={confirmError}
          autoComplete="new-password"
          textContentType="newPassword"
        />

        {duplicateEmail ? (
          <ErrorBanner>
            <Text className="text-body font-normal text-destructive">
              {DUPLICATE_EMAIL_LEAD}
              <Link href="/(auth)/sign-in" className="font-normal text-accent">
                {DUPLICATE_EMAIL_LINK_LABEL}
              </Link>
              {DUPLICATE_EMAIL_TAIL}
            </Text>
          </ErrorBanner>
        ) : (
          <ErrorBanner message={submitError} />
        )}

        <PrimaryButton label="Create Account" onPress={onSubmit} submitting={submitting} />

        <Link href="/(auth)/sign-in" className="text-body font-normal text-accent">
          Already have an account? Sign in
        </Link>
      </View>
    </AuthScreenLayout>
  );
}
