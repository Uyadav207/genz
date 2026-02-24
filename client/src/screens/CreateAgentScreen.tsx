/**
 * Create Agent screen — customize name, behaviour, skills, and other options.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Sparkles } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FontSize, Spacing, BorderRadius, DEFAULT_SKILLS, AGENT_EMOJI_OPTIONS, EMOJI_ICON_PREFIX } from '@/constants';
import { api } from '@/services/api';
import { useTheme, useAuth } from '@/contexts';
import type { AgentsStackParamList } from '@/types';

type Nav = NativeStackNavigationProp<AgentsStackParamList, 'CreateAgent'>;

const SKILL_OPTIONS = DEFAULT_SKILLS;

export function CreateAgentScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { accessToken } = useAuth();
  const navigation = useNavigation<Nav>();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instruction, setInstruction] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set(['web_search', 'memory']));
  const [saving, setSaving] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateDescription, setGenerateDescription] = useState('');
  const [generating, setGenerating] = useState(false);

  const toggleSkill = (id: string) => {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGeneratePrompt = async () => {
    const desc = generateDescription.trim();
    if (!desc || !accessToken || generating) return;
    setGenerating(true);
    try {
      const { prompt } = await api.generateAgentPrompt(desc, accessToken);
      if (prompt) {
        setInstruction(prompt);
        setShowGenerateModal(false);
        setGenerateDescription('');
      }
    } catch {
      Alert.alert('Error', 'Could not generate prompt. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !accessToken || saving) return;
    setSaving(true);
    try {
      await api.createAgent(
        {
          name: name.trim(),
          description: description.trim(),
          instruction: instruction.trim(),
          icon_name: selectedEmoji ? `${EMOJI_ICON_PREFIX}${selectedEmoji}` : 'user',
          skill_ids: Array.from(selectedSkillIds),
        },
        accessToken
      );
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to create agent. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create agent</Text>
        <TouchableOpacity
          style={[styles.saveBtn, (!name.trim() || saving) && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={!name.trim() || saving}
          activeOpacity={0.7}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Check size={20} color={colors.primary} />
              <Text style={[styles.saveLabel, { color: colors.primary }]}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Icon</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Pick an emoji for your agent (shown in the agents list and chat).
          </Text>
          <View style={styles.emojiGrid}>
            {AGENT_EMOJI_OPTIONS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={[
                  styles.emojiOption,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                  selectedEmoji === emoji && { borderColor: colors.primary, borderWidth: 2 },
                ]}
                onPress={() => setSelectedEmoji((prev) => (prev === emoji ? null : emoji))}
                activeOpacity={0.7}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
          <TextInput
            style={[styles.input, styles.inputSingle, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
            placeholder="e.g. My Research Assistant"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Description</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            How would you describe this agent to others?
          </Text>
          <TextInput
            style={[styles.input, styles.inputMultiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
            placeholder="e.g. Helps with deep research and summarising papers"
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Behaviour & instructions</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Describe how the agent should behave (tone, style, constraints).
          </Text>
          <TextInput
            style={[styles.input, styles.inputMultiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
            placeholder="e.g. Always cite sources. Prefer concise answers. Never make up facts."
            placeholderTextColor={colors.textSecondary}
            value={instruction}
            onChangeText={setInstruction}
            multiline
            numberOfLines={4}
          />
          <TouchableOpacity
            style={[styles.generatePromptBtn, { borderColor: colors.primary, backgroundColor: colors.surfaceSecondary }]}
            onPress={() => setShowGenerateModal(true)}
            activeOpacity={0.7}
          >
            <Sparkles size={16} color={colors.primary} />
            <Text style={[styles.generatePromptLabel, { color: colors.primary }]}>Help me write this</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Skills</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Choose what this agent can use by default.
          </Text>
          <View style={styles.skillsList}>
            {SKILL_OPTIONS.map((skill) => {
              const enabled = selectedSkillIds.has(skill.id);
              return (
                <View
                  key={skill.id}
                  style={[
                    styles.skillRow,
                    { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.skillText}>
                    <Text style={[styles.skillLabel, { color: colors.text }]}>{skill.label}</Text>
                    <Text style={[styles.skillDesc, { color: colors.textSecondary }]}>{skill.description}</Text>
                  </View>
                  <Switch
                    value={enabled}
                    onValueChange={() => toggleSkill(skill.id)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#FFF"
                  />
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <Modal visible={showGenerateModal} transparent animationType="slide" onRequestClose={() => setShowGenerateModal(false)}>
        <Pressable style={modalStyles.overlay} onPress={() => setShowGenerateModal(false)}>
          <Pressable style={[modalStyles.sheet, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
            <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShowGenerateModal(false)} activeOpacity={0.7}>
                <Text style={[modalStyles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[modalStyles.title, { color: colors.text }]}>What should your agent do?</Text>
              <TouchableOpacity
                onPress={handleGeneratePrompt}
                activeOpacity={0.7}
                disabled={!generateDescription.trim() || generating}
                style={(!generateDescription.trim() || generating) && { opacity: 0.5 }}
              >
                {generating ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[modalStyles.primaryAction, { color: colors.primary }]}>Generate</Text>
                )}
              </TouchableOpacity>
            </View>
            <View style={modalStyles.fields}>
              <Text style={[modalStyles.fieldLabel, { color: colors.textSecondary }]}>
                Describe the tone, tasks, and limits you have in mind. We'll turn that into clear instructions for your agent.
              </Text>
              <TextInput
                style={[modalStyles.fieldInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
                placeholder="e.g. Friendly coding assistant that explains briefly, always suggests tests, never makes up API names"
                placeholderTextColor={colors.textSecondary}
                value={generateDescription}
                onChangeText={setGenerateDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!generating}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: Spacing.sm },
  saveLabel: { fontSize: 16, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.md, gap: Spacing.lg },
  section: { gap: Spacing.xs },
  label: { fontSize: FontSize.sm, fontWeight: '600' },
  hint: { fontSize: FontSize.xs },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emojiText: { fontSize: 24 },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.sm + 6,
    paddingVertical: Spacing.sm,
    fontSize: 15,
  },
  inputSingle: {},
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  skillsList: { gap: Spacing.sm },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  skillText: { flex: 1, gap: 2 },
  skillLabel: { fontSize: 15, fontWeight: '600' },
  skillDesc: { fontSize: 12 },
  generatePromptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
  },
  generatePromptLabel: { fontSize: 14, fontWeight: '600' },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancelText: { fontSize: 16 },
  title: { fontSize: 17, fontWeight: '600' },
  primaryAction: { fontSize: 16, fontWeight: '600' },
  fields: { padding: Spacing.md, gap: 8 },
  fieldLabel: { fontSize: 13 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 100,
  },
});
