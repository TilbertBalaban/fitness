import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { authClient } from '@/lib/auth-client';

// This route exists only as reset-password.web.tsx — Expo Router resolves platform extensions at
// build time, so it ships in the web bundle and in neither native bundle. D-07's reset link always
// opens a browser, on every platform, so a native equivalent is never needed.
export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // A missing token has nothing to submit — that is a dead token exactly like an expired or
  // already-used one, so it renders the same replace-the-form state rather than a form that would
  // only fail on submit.
  const [tokenInvalid, setTokenInvalid] = useState(!token);

  async function onSubmit() {
    if (newPassword !== confirmPassword) {
      setConfirmError("Passwords don't match.");
      return;
    }
    setConfirmError(null);
    setSubmitError(null);
    setSubmitting(true);

    const { error } = await authClient.resetPassword({ newPassword, token: token! });

    if (error) {
      if (error.code === 'INVALID_TOKEN') {
        // The token-invalid state and the field-error state are mutually exclusive — this replaces
        // the form entirely rather than appearing beside the field errors above.
        setTokenInvalid(true);
      } else if (error.status === undefined) {
        setSubmitError("Can't reach the server. Check your connection and try again.");
      } else {
        setSubmitError('Something went wrong. Try again.');
      }
    } else {
      setSuccess(true);
    }

    setSubmitting(false);
  }

  return (
    <View className="min-h-screen items-center bg-background px-lg py-3xl">
      <View className="w-full max-w-[400px]">
        {tokenInvalid ? (
          <View className="gap-md">
            <Text className="text-display font-semibold text-foreground">Reset Password</Text>
            <Text className="text-body font-normal text-foreground">
              This reset link has expired or already been used. Request a new one.
            </Text>
            <Link href="/(auth)/forgot-password" className="text-body font-normal text-accent">
              Back to sign in
            </Link>
          </View>
        ) : success ? (
          <View className="gap-md">
            <Text className="text-display font-semibold text-foreground">Reset Password</Text>
            <Text className="text-body font-normal text-foreground">
              Your password has been reset. You can now sign in with your new password.
            </Text>
            <Link href="/(auth)/sign-in" className="text-body font-normal text-accent">
              Back to sign in
            </Link>
          </View>
        ) : (
          <View className="gap-md">
            <Text className="text-display font-semibold text-foreground">Reset Password</Text>

            <View className="gap-xs">
              <View className="flex-row items-center rounded-md border border-foreground-muted">
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password"
                  autoCapitalize="none"
                  secureTextEntry={!showNewPassword}
                  className="flex-1 px-md py-sm text-body text-foreground"
                  style={{ minHeight: 48 }}
                />
                <Pressable
                  onPress={() => setShowNewPassword((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showNewPassword ? 'Hide password' : 'Show password'}
                  style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text className="text-label font-normal text-foreground-muted">
                    {showNewPassword ? 'Hide' : 'Show'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View className="gap-xs">
              <View className="flex-row items-center rounded-md border border-foreground-muted">
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm password"
                  autoCapitalize="none"
                  secureTextEntry={!showConfirmPassword}
                  className="flex-1 px-md py-sm text-body text-foreground"
                  style={{ minHeight: 48 }}
                />
                <Pressable
                  onPress={() => setShowConfirmPassword((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
                  style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text className="text-label font-normal text-foreground-muted">
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </Text>
                </Pressable>
              </View>
              {confirmError ? (
                <Text className="text-label font-normal text-destructive">{confirmError}</Text>
              ) : null}
            </View>

            {submitError ? (
              <Text className="text-body font-normal text-destructive">{submitError}</Text>
            ) : null}

            <Pressable
              onPress={onSubmit}
              disabled={submitting}
              accessibilityRole="button"
              className="flex-row items-center justify-center gap-sm rounded-md bg-accent px-md py-sm"
              style={{ minHeight: 48 }}
            >
              {submitting ? <ActivityIndicator color="white" /> : null}
              <Text className="text-body font-semibold text-white">Reset Password</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
