/**
 * Agents screen — hub with create agent option + buttons to Custom / Default agents.
 */

import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bot, BrainCircuit, Code, Globe, Image as ImageIcon, Menu, MoreVertical, PenLine, Plus, Sparkles, User } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenWrapper } from '@/components/common';
import { DEFAULT_AGENTS, AGENT_ICON_COLORS, type AgentDef } from '@/constants/agents';
import { Spacing } from '@/constants';
import { useAuth, useTheme } from '@/contexts';
import { api } from '@/services/api';
import type { AgentsStackParamList, MainTabsParamList } from '@/types';

type StackNav = NativeStackNavigationProp<AgentsStackParamList, 'AgentsList'>;

const EMOJI_PREFIX = 'emoji:';

function AgentIcon({ name, size = 22 }: { name: string; size?: number }) {
  const color = AGENT_ICON_COLORS[name] || '#B57EDC';
  switch (name) {
    case 'genz': return <Sparkles size={size} color={color} />;
    case 'code': return <Code size={size} color={color} />;
    case 'pen': return <PenLine size={size} color={color} />;
    case 'image': return <ImageIcon size={size} color={color} />;
    case 'brain': return <BrainCircuit size={size} color={color} />;
    case 'globe': return <Globe size={size} color={color} />;
    default: return <Bot size={size} color={color} />;
  }
}

function AgentIconOrEmoji({ iconName, size = 24 }: { iconName: string; size?: number }) {
  if (iconName.startsWith(EMOJI_PREFIX)) {
    return <Text style={{ fontSize: size }}>{iconName.slice(EMOJI_PREFIX.length)}</Text>;
  }
  return <AgentIcon name={iconName} size={size} />;
}

type AgentItem = AgentDef | { id: string; name: string; description: string; iconName: string; skillIds?: string[] };

function AgentRow({
  item,
  colors,
  onPress,
  isCustom,
  onEdit,
  onPublish,
  onDelete,
}: {
  item: AgentItem;
  colors: Record<string, string>;
  onPress: () => void;
  isCustom?: boolean;
  onEdit?: () => void;
  onPublish?: () => void;
  onDelete?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.agentRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.agentRowContent}>
        <View style={[styles.agentIconWrap, { backgroundColor: colors.surface }]}>
          <AgentIconOrEmoji iconName={item.iconName} size={24} />
        </View>
        <View style={styles.agentText}>
          <Text style={[styles.agentName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.agentDesc, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.description}
          </Text>
        </View>
      </View>
      {isCustom && (
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() =>
            Alert.alert('Agent options', item.name, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Edit', onPress: onEdit },
              { text: 'Publish', onPress: onPublish },
              { text: 'Delete', style: 'destructive', onPress: onDelete },
            ])
          }
          style={styles.moreBtn}
          activeOpacity={0.7}
        >
          <MoreVertical size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export function AgentsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNav>();

  const openDrawer = () => (navigation.getParent() as { openDrawer?: () => void })?.openDrawer?.();

  return (
    <ScreenWrapper style={styles.wrapper} padded={false}>
      <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.menuBtn} onPress={openDrawer} activeOpacity={0.7}>
          <Menu size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Agents</Text>
      </View>

      <View style={styles.content}>
        <TouchableOpacity
          style={[styles.createCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => navigation.navigate('CreateAgent')}
          activeOpacity={0.7}
        >
          <View style={[styles.createIconWrap, { backgroundColor: colors.primary }]}>
            <Plus size={22} color={colors.white} strokeWidth={2.5} />
          </View>
          <View style={styles.createTextWrap}>
            <Text style={[styles.createLabel, { color: colors.text }]}>Create agent</Text>
            <Text style={[styles.createHint, { color: colors.textSecondary }]}>
              Customise name, behaviour, and skills
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => navigation.navigate('CustomAgents')}
          activeOpacity={0.7}
        >
          <View style={[styles.optionIconWrap, { backgroundColor: colors.surface }]}>
            <User size={24} color={colors.primary} />
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={[styles.optionLabel, { color: colors.text }]}>Custom agents</Text>
            <Text style={[styles.optionHint, { color: colors.textSecondary }]}>
              Your created agents — edit, publish, or delete
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => navigation.navigate('DefaultAgents')}
          activeOpacity={0.7}
        >
          <View style={[styles.optionIconWrap, { backgroundColor: colors.surface }]}>
            <Sparkles size={24} color={colors.primary} />
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={[styles.optionLabel, { color: colors.text }]}>Default agents</Text>
            <Text style={[styles.optionHint, { color: colors.textSecondary }]}>
              Built-in agents — GenZ, Coder, Writer, and more
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  content: { flex: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  createCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: Spacing.lg,
  },
  createIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createTextWrap: { flex: 1 },
  createLabel: { fontSize: 16, fontWeight: '600' },
  createHint: { fontSize: 12, marginTop: 2 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  optionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextWrap: { flex: 1 },
  optionLabel: { fontSize: 16, fontWeight: '600' },
  optionHint: { fontSize: 12, marginTop: 2 },
});
