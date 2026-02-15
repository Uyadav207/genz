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

function isValidEmail(email: string) { return /^\S+@\S+\.\S+$/.test(email.trim()); }

export function SignUpScreen() {
  const navigation = useNavigation<Nav>();
  const { signUp } = useAuth();
  const { colors } = useTheme();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    if (isSubmitting) return false;
    if (!name.trim()) return false;
    if (!isValidEmail(email)) return false;
    if (username.trim().length < 3) return false;
    if (password.length < 6) return false;
    return true;
  }, [name, email, username, password, isSubmitting]);

  async function onSubmit() {
    setError(null); setSuccess(null);
    const tn = name.trim(), te = email.trim(), tu = username.trim();
    if (!tn) { setError('Please enter your name.'); return; }
    if (!isValidEmail(te)) { setError('Please enter a valid email address.'); return; }
    if (tu.length < 3) { setError('Username must be at least 3 characters.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setIsSubmitting(true);
    try { await signUp({ name: tn, email: te, username: tu, password }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign up failed.'); }
    finally { setIsSubmitting(false); }
  }

  return (
    <ScreenWrapper padded={false} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.container}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>Create account</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Join GenZ in a minute</Text>
            </View>
            <View style={styles.form}>
              {[
                { label: 'Name', value: name, set: setName, ph: 'Your name', cap: 'words' as const },
                { label: 'Email', value: email, set: setEmail, ph: 'you@example.com', kb: 'email-address' as const, cap: 'none' as const },
                { label: 'Username', value: username, set: setUsername, ph: 'your_username', cap: 'none' as const },
              ].map((f) => (
                <View key={f.label} style={styles.field}>
                  <Text style={[styles.label, { color: colors.text }]}>{f.label}</Text>
                  <TextInput value={f.value} onChangeText={f.set} placeholder={f.ph} placeholderTextColor={colors.textSecondary} autoCapitalize={f.cap} autoCorrect={false} keyboardType={f.kb} style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} />
                </View>
              ))}
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.text }]}>Password</Text>
                <TextInput value={password} onChangeText={setPassword} placeholder="At least 6 characters" placeholderTextColor={colors.textSecondary} secureTextEntry autoCapitalize="none" autoCorrect={false} style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} />
              </View>
              {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
              {success ? <Text style={[styles.success, { color: colors.success }]}>{success}</Text> : null}
              <Button title={isSubmitting ? 'Creating…' : 'Create Account'} onPress={onSubmit} disabled={!canSubmit} />
              <TouchableOpacity onPress={() => navigation.navigate('SignIn')} style={styles.footerLink} disabled={isSubmitting}>
                <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                  Already have an account? <Text style={[styles.footerTextStrong, { color: colors.primary }]}>Sign In</Text>
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
  error: { fontSize: FontSize.sm },
  success: { fontSize: FontSize.sm },
  footerLink: { alignSelf: 'center', paddingVertical: Spacing.sm },
  footerText: { fontSize: FontSize.sm },
  footerTextStrong: { fontWeight: '700' },
});
