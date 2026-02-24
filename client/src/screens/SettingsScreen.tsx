/**
 * Settings screen — profile editing, account management, and app info.
 */

import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  ChevronRight,
  LogOut,
  Menu,
  Moon,
  Pencil,
  Sun,
  Smartphone,
  Trash2,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { MainTabsParamList } from '@/types';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants';
import { useAuth, useTheme } from '@/contexts';
import type { ThemeMode } from '@/contexts';
import { api } from '@/services/api';

const APP_VERSION = '1.0.0';

/* ------------------------------------------------------------------ */
/*  Default Avatar                                                     */
/* ------------------------------------------------------------------ */

function Avatar({
  uri,
  name,
  size = 90,
}: {
  uri?: string;
  name: string;
  size?: number;
}) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  // For now we always show the initial-based avatar.
  // If avatar_url is set we'd use an Image here.
  return (
    <View
      style={[
        avatarStyles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text style={[avatarStyles.initials, { fontSize: size * 0.36 }]}>
        {initials}
      </Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  circle: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: Colors.white,
    fontWeight: '700',
  },
});

/* ------------------------------------------------------------------ */
/*  Section Row                                                        */
/* ------------------------------------------------------------------ */

interface RowProps {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  showChevron?: boolean;
}

function SettingsRow({ icon, label, value, onPress, danger, showChevron = true, colors }: RowProps & { colors?: any }) {
  const { colors: themeColors } = useTheme();
  const c = colors || themeColors;
  return (
    <TouchableOpacity style={rowStyles.container} activeOpacity={0.6} onPress={onPress} disabled={!onPress}>
      <View style={[rowStyles.iconBox, { backgroundColor: c.surfaceSecondary }, danger && { backgroundColor: '#FEE2E220' }]}>
        {icon}
      </View>
      <View style={rowStyles.body}>
        <Text style={[rowStyles.label, { color: c.text }, danger && { color: c.error }]}>{label}</Text>
        {value ? <Text style={[rowStyles.value, { color: c.textSecondary }]} numberOfLines={1}>{value}</Text> : null}
      </View>
      {showChevron && onPress && <ChevronRight size={18} color={danger ? c.error : c.textSecondary} />}
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EAE5F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
  value: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
});

/* ------------------------------------------------------------------ */
/*  Section Wrapper                                                    */
/* ------------------------------------------------------------------ */

function Section({ title, children, colors: c }: { title: string; children: React.ReactNode; colors?: any }) {
  const { colors: themeColors } = useTheme();
  const colors = c || themeColors;
  return (
    <View style={sectionStyles.wrapper}>
      <Text style={[sectionStyles.title, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[sectionStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
});

/* ------------------------------------------------------------------ */
/*  Divider                                                            */
/* ------------------------------------------------------------------ */

function Divider({ colors: c }: { colors?: any }) {
  const { colors: themeColors } = useTheme();
  const colors = c || themeColors;
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 66 }} />;
}

/* ------------------------------------------------------------------ */
/*  Edit Profile Modal                                                 */
/* ------------------------------------------------------------------ */

function EditProfileModal({
  visible,
  onClose,
  currentName,
  currentUsername,
  currentBio,
  onSave,
  isSaving,
}: {
  visible: boolean;
  onClose: () => void;
  currentName: string;
  currentUsername: string;
  currentBio: string;
  onSave: (name: string, username: string, bio: string) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(currentName);
  const [username, setUsername] = useState(currentUsername);
  const [bio, setBio] = useState(currentBio);

  // Reset values when modal opens
  React.useEffect(() => {
    if (visible) {
      setName(currentName);
      setUsername(currentUsername);
      setBio(currentBio);
    }
  }, [visible, currentName, currentUsername, currentBio]);

  const hasChanges =
    name !== currentName || username !== currentUsername || bio !== currentBio;

  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={[modalStyles.sheet, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
          <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={[modalStyles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[modalStyles.title, { color: colors.text }]}>Edit Profile</Text>
            <TouchableOpacity onPress={() => onSave(name.trim(), username.trim(), bio.trim())} activeOpacity={0.7} disabled={!hasChanges || isSaving}>
              <Text style={[modalStyles.saveText, { color: colors.primary }, (!hasChanges || isSaving) && { opacity: 0.4 }]}>
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={modalStyles.fields}>
            <View style={modalStyles.field}>
              <Text style={[modalStyles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
              <TextInput style={[modalStyles.fieldInput, { backgroundColor: colors.inputBackground, color: colors.text }]} value={name} onChangeText={setName} placeholder="Your display name" placeholderTextColor={colors.textSecondary} autoCapitalize="words" maxLength={50} />
            </View>
            <View style={modalStyles.field}>
              <Text style={[modalStyles.fieldLabel, { color: colors.textSecondary }]}>Username</Text>
              <TextInput style={[modalStyles.fieldInput, { backgroundColor: colors.inputBackground, color: colors.text }]} value={username} onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="username" placeholderTextColor={colors.textSecondary} autoCapitalize="none" autoCorrect={false} maxLength={30} />
            </View>
            <View style={modalStyles.field}>
              <Text style={[modalStyles.fieldLabel, { color: colors.textSecondary }]}>Bio</Text>
              <TextInput style={[modalStyles.fieldInput, { backgroundColor: colors.inputBackground, color: colors.text, height: 80, textAlignVertical: 'top' }]} value={bio} onChangeText={setBio} placeholder="A short bio about yourself" placeholderTextColor={colors.textSecondary} multiline maxLength={160} />
              <Text style={[modalStyles.charCount, { color: colors.textSecondary }]}>{bio.length}/160</Text>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  cancelText: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  saveText: {
    fontSize: 15,
    color: Colors.primary,
    fontWeight: '600',
  },
  fields: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 20,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  fieldInput: {
    fontSize: 16,
    color: Colors.text,
    backgroundColor: '#EAE5F2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  charCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
});

/* ------------------------------------------------------------------ */
/*  Main Settings Screen                                               */
/* ------------------------------------------------------------------ */

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: (c: string) => React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: (c) => <Sun size={18} color={c} /> },
  { value: 'dark', label: 'Dark', icon: (c) => <Moon size={18} color={c} /> },
  { value: 'system', label: 'System', icon: (c) => <Smartphone size={18} color={c} /> },
];

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, accessToken, signOut, updateUser } = useAuth();
  const { colors, mode, setMode, isDark } = useTheme();

  const [showEditModal, setShowEditModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const displayName = user?.name || user?.username || 'User';
  const username = user?.username || '';
  const bio = user?.bio || '';
  const email = user?.email || '';

  /* ---- Save profile edits ---- */
  const handleSaveProfile = async (name: string, newUsername: string, newBio: string) => {
    if (!accessToken) return;
    setIsSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (name !== (user?.name || '')) payload.name = name;
      if (newUsername !== (user?.username || '')) payload.username = newUsername;
      if (newBio !== (user?.bio || '')) payload.bio = newBio;

      await api.updateProfile(payload, accessToken);
      await updateUser(payload);
      setShowEditModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile';
      Alert.alert('Error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  /* ---- Delete account ---- */
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!accessToken) return;
            try {
              await api.deleteProfile(accessToken);
              await signOut();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to delete account';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  };

  /* ---- Sign out ---- */
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const navigation = useNavigation<DrawerNavigationProp<MainTabsParamList, 'Settings'>>();

  return (
    <View style={[styles.root, { backgroundColor: isDark ? colors.background : '#FAFAFF', paddingTop: insets.top }]}>
      {/* Header — title centered, icons left/right */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.openDrawer()} activeOpacity={0.7}>
          <Menu size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>Settings</Text>
        <View style={styles.headerIconBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 30 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile Card ── */}
        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.7}
          onPress={() => setShowEditModal(true)}
        >
          <View style={styles.profileLeft}>
            <View style={styles.avatarWrapper}>
              <Avatar name={displayName} size={68} />
              <View style={[styles.cameraButton, { borderColor: colors.background }]}>
                <Camera size={12} color={Colors.white} />
              </View>
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.text }]}>{displayName}</Text>
              {username ? <Text style={[styles.profileHandle, { color: colors.textSecondary }]}>@{username}</Text> : null}
              {email ? <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>{email}</Text> : null}
            </View>
          </View>
          <Pencil size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* ── Danger Zone ── */}
        <Section title="Danger Zone" colors={colors}>
          <SettingsRow icon={<Trash2 size={18} color={colors.error} />} label="Delete Account" value="Permanently delete all your data" onPress={handleDeleteAccount} danger colors={colors} />
        </Section>

        {/* ── Appearance ── */}
        <Section title="Appearance" colors={colors}>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => {
              const active = mode === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.themeOption, { backgroundColor: active ? colors.primary + '15' : colors.surfaceSecondary, borderColor: active ? colors.primary : 'transparent' }]}
                  activeOpacity={0.7}
                  onPress={() => setMode(opt.value)}
                >
                  {opt.icon(active ? colors.primary : colors.textSecondary)}
                  <Text style={[styles.themeOptionText, { color: active ? colors.primary : colors.textSecondary }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* ── Sign Out ── */}
        <TouchableOpacity style={[styles.signOutButton, { backgroundColor: colors.card, borderColor: isDark ? '#5B2060' : '#DDA0DD' }]} activeOpacity={0.7} onPress={handleSignOut}>
          <LogOut size={18} color={colors.error} />
          <Text style={[styles.signOutText, { color: colors.error }]}>Sign Out</Text>
        </TouchableOpacity>

        {/* ── App Version ── */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>GenZ</Text>
          <Text style={[styles.footerVersion, { color: isDark ? '#4A4460' : '#9D93B0' }]}>Version {APP_VERSION}</Text>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        currentName={user?.name || ''}
        currentUsername={user?.username || ''}
        currentBio={user?.bio || ''}
        onSave={handleSaveProfile}
        isSaving={isSaving}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAFAFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 24,
  },

  /* Profile card */
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  avatarWrapper: {
    position: 'relative',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  profileHandle: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  profileEmail: {
    fontSize: 13,
    color: Colors.textSecondary,
  },

  /* Theme toggle */
  themeRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 14,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },

  /* Sign out button */
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDA0DD',
    paddingVertical: 14,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.error,
  },

  /* Footer */
  footer: {
    alignItems: 'center',
    gap: 4,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  footerVersion: {
    fontSize: 12,
    color: '#9D93B0',
  },
});
