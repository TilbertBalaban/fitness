import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { authClient } from '@/lib/auth-client';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);

    const { error: signUpError } = await authClient.signUp.email({
      email,
      password,
      name: email,
    });

    if (signUpError) {
      // A transport failure has no HTTP status — that is the distinction D-03 makes structural.
      setError(
        signUpError.status === undefined
          ? "Can't reach the server. Check your connection and try again."
          : signUpError.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
            ? 'An account with this email already exists. Sign in instead.'
            : 'Something went wrong. Try again.',
      );
    }

    setSubmitting(false);
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: '600' }}>Create your account</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={{ borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 48, fontSize: 16 }}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        autoCapitalize="none"
        secureTextEntry
        style={{ borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 48, fontSize: 16 }}
      />

      {error ? <Text>{error}</Text> : null}

      <Pressable
        onPress={onSubmit}
        disabled={submitting}
        style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 8 }}
      >
        <Text style={{ fontSize: 16, fontWeight: '600' }}>Create Account</Text>
      </Pressable>

      <Link href="/(auth)/sign-in">Already have an account? Sign in</Link>
    </View>
  );
}
