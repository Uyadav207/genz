/**
 * Create Agent screen — customize name, behaviour, tools, and other options.
 */

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FontSize, Spacing, DEFAULT_TOOLS } from '@/constants';
import { useTheme } from '@/contexts';
import type { AgentsStackParamList } from '@/types';

type Nav = NativeStackNavigationProp<AgentsStackParamList, 'CreateAgent'>;

const TOOL_OPTIONS = DEFAULT_TOOLS;

export function CreateAgentScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instruction, setInstruction] = useState('');
  const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(new Set(['web_search', 'memory']));

  const toggleTool = (id: string) => {
    setSelectedToolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    // TODO: persist agent (API or local)
    navigation.goBack();
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
          style={[styles.saveBtn, !name.trim() && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={!name.trim()}
          activeOpacity={0.7}
        >
          <Check size={20} color={colors.primary} />
          <Text style={[styles.saveLabel, { color: colors.primary }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Tools</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Choose what this agent can use by default.
          </Text>
          <View style={styles.toolsList}>
            {TOOL_OPTIONS.map((tool) => {
              const selected = selectedToolIds.has(tool.id);
              return (
                <TouchableOpacity
                  key={tool.id}
                  style={[
                    styles.toolRow,
                    { backgroundColor: selected ? colors.surfaceSecondary : 'transparent', borderColor: colors.border },
                  ]}
                  onPress={() => toggleTool(tool.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, { borderColor: colors.border }, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    {selected && <Check size={14} color="#FFF" strokeWidth={3} />}
                  </View>
                  <View style={styles.toolText}>
                    <Text style={[styles.toolLabel, { color: colors.text }]}>{tool.label}</Text>
                    <Text style={[styles.toolDesc, { color: colors.textSecondary }]}>{tool.description}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
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
  hint: { fontSize: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  inputSingle: { paddingVertical: 12 },
  inputMultiline: { paddingVertical: 12, minHeight: 88, textAlignVertical: 'top' },
  toolsList: { gap: 6, marginTop: 4 },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolText: { flex: 1, gap: 2 },
  toolLabel: { fontSize: 15, fontWeight: '600' },
  toolDesc: { fontSize: 12 },
});
