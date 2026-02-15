import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenWrapper } from '@/components/common';
import { Button } from '@/components/ui';
import { FontSize, Spacing } from '@/constants';
import { useAuth, useTheme } from '@/contexts';
import type { NavigationParamList } from '@/types';

type Nav = NativeStackNavigationProp<NavigationParamList>;

export function SignInScreen() {
  const navigation = useNavigation<Nav>();
  const { signIn } = useAuth();
  const { colors } = useTheme();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => username.trim().length > 0 && password.length > 0 && !isSubmitting,
    [username, password, isSubmitting],
  );

  const [showSignUpHint, setShowSignUpHint] = useState(false);

  async function onSubmit() {
    setError(null);
    setShowSignUpHint(false);
    if (!username.trim() || !password) { setError('Please enter your username and password.'); return; }
    setIsSubmitting(true);
    try {
      await signIn({ username: username.trim(), password });
    } catch (e: any) {
      const status = e?.status as number | undefined;
      if (status === 401) { setError('No account found with that username.'); setShowSignUpHint(true); }
      else { setError(e instanceof Error ? e.message : 'Sign in failed.'); }
    } finally { setIsSubmitting(false); }
  }

  return (
    <ScreenWrapper padded={false} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.container}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>Welcome back</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Sign in to continue</Text>
            </View>
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.text }]}>Username</Text>
                <TextInput value={username} onChangeText={setUsername} placeholder="your_username" placeholderTextColor={colors.textSecondary} autoCapitalize="none" autoCorrect={false} style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} />
              </View>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.text }]}>Password</Text>
                <TextInput value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={colors.textSecondary} secureTextEntry autoCapitalize="none" autoCorrect={false} style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} />
              </View>
              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
                  {showSignUpHint ? (
                    <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                      <Text style={[styles.errorLink, { color: colors.primary }]}>Sign up for a new account</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              <Button title={isSubmitting ? 'Signing in…' : 'Sign In'} onPress={onSubmit} disabled={!canSubmit} />
              <TouchableOpacity onPress={() => navigation.navigate('SignUp')} style={styles.footerLink} disabled={isSubmitting}>
                <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                  Don&apos;t have an account? <Text style={[styles.footerTextStrong, { color: colors.primary }]}>Sign Up</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xl },
  container: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: Spacing.xl },
  header: { gap: Spacing.xs, alignItems: 'center' },
  title: { fontSize: FontSize['3xl'], fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: FontSize.base, textAlign: 'center' },
  form: { gap: Spacing.md, width: '100%' },
  field: { gap: Spacing.xs, width: '100%' },
  label: { fontSize: FontSize.sm, fontWeight: '600', alignSelf: 'flex-start' },
  input: { borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: 12, fontSize: FontSize.base, width: '100%' },
  errorContainer: { gap: 4 },
  error: { fontSize: FontSize.sm },
  errorLink: { fontSize: FontSize.sm, fontWeight: '600' },
  footerLink: { alignSelf: 'center', paddingVertical: Spacing.sm },
  footerText: { fontSize: FontSize.sm },
  footerTextStrong: { fontWeight: '700' },
});
