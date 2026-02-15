/**
 * Agents screen — create agent option + list of available agents.
 */

import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, Plus, Bot, Code, PenLine, ImageIcon, BrainCircuit, Globe } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenWrapper } from '@/components/common';
import { Spacing, DEFAULT_AGENTS, AGENT_ICON_COLORS } from '@/constants';
import type { AgentDef } from '@/constants';
import { useTheme } from '@/contexts';
import type { AgentsStackParamList } from '@/types';

type StackNav = NativeStackNavigationProp<AgentsStackParamList, 'AgentsList'>;

function AgentIcon({ name, size = 22 }: { name: string; size?: number }) {
  const color = AGENT_ICON_COLORS[name] || '#6C63FF';
  switch (name) {
    case 'genz': return <Bot size={size} color={color} />;
    case 'code': return <Code size={size} color={color} />;
    case 'pen': return <PenLine size={size} color={color} />;
    case 'image': return <ImageIcon size={size} color={color} />;
    case 'brain': return <BrainCircuit size={size} color={color} />;
    case 'globe': return <Globe size={size} color={color} />;
    default: return <Bot size={size} color={color} />;
  }
}

function AgentRow({
  item,
  colors,
  onPress,
}: {
  item: AgentDef;
  colors: Record<string, string>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.agentRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.agentIconWrap, { backgroundColor: colors.background }]}>
        <AgentIcon name={item.iconName} size={24} />
      </View>
      <View style={styles.agentText}>
        <Text style={[styles.agentName, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.agentDesc, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.description}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export function AgentsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNav>();

  const openDrawer = () => (navigation.getParent() as { openDrawer?: () => void })?.openDrawer?.();

  const renderAgent = ({ item }: ListRenderItemInfo<AgentDef>) => (
    <AgentRow item={item} colors={colors} onPress={() => {}} />
  );

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
          style={[styles.createCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          onPress={() => navigation.navigate('CreateAgent')}
          activeOpacity={0.7}
        >
          <View style={[styles.createIconWrap, { backgroundColor: colors.primary }]}>
            <Plus size={22} color="#FFF" strokeWidth={2.5} />
          </View>
          <View style={styles.createTextWrap}>
            <Text style={[styles.createLabel, { color: colors.text }]}>Create agent</Text>
            <Text style={[styles.createHint, { color: colors.textSecondary }]}>
              Customise name, behaviour, and tools
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Available agents</Text>
        <FlatList
          data={DEFAULT_AGENTS}
          keyExtractor={(a) => a.id}
          renderItem={renderAgent}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.lg }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No agents yet.</Text>
          }
        />
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
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.sm },
  listContent: { gap: 8, paddingBottom: Spacing.lg },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  agentIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentText: { flex: 1 },
  agentName: { fontSize: 15, fontWeight: '600' },
  agentDesc: { fontSize: 13, marginTop: 2 },
  empty: { fontSize: 14, fontStyle: 'italic' },
});
