/**
 * Agents screen — create agent option + list of available agents (built-in + custom).
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type SectionListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, Plus, Bot, Code, PenLine, ImageIcon, BrainCircuit, Globe, Sparkles, MoreVertical } from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenWrapper } from '@/components/common';
import { api } from '@/services/api';
import { Spacing, DEFAULT_AGENTS, AGENT_ICON_COLORS } from '@/constants';
import type { AgentDef } from '@/constants';
import { useTheme, useAuth } from '@/contexts';
import type { AgentsStackParamList } from '@/types';
import type { MainTabsParamList } from '@/types';

type StackNav = NativeStackNavigationProp<AgentsStackParamList, 'AgentsList'>;

const EMOJI_PREFIX = 'emoji:';

function AgentIcon({ name, size = 22 }: { name: string; size?: number }) {
  const color = AGENT_ICON_COLORS[name] || '#6C63FF';
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
  onDelete,
}: {
  item: AgentItem;
  colors: Record<string, string>;
  onPress: () => void;
  isCustom?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <View style={[styles.agentRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <TouchableOpacity style={styles.agentRowContent} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.agentIconWrap, { backgroundColor: colors.background }]}>
          <AgentIconOrEmoji iconName={item.iconName} size={24} />
        </View>
        <View style={styles.agentText}>
          <Text style={[styles.agentName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.agentDesc, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.description}
          </Text>
        </View>
      </TouchableOpacity>
      {isCustom && (
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() =>
            Alert.alert('Agent options', item.name, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Edit', onPress: onEdit },
              { text: 'Delete', style: 'destructive', onPress: onDelete },
            ])
          }
          style={styles.moreBtn}
          activeOpacity={0.7}
        >
          <MoreVertical size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export function AgentsScreen() {
  const { colors } = useTheme();
  const { accessToken } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNav>();
  const [customAgents, setCustomAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAgents = useCallback(async () => {
    if (!accessToken) {
      setCustomAgents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { agents } = await api.listAgents(accessToken);
      setCustomAgents(
        (agents ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description || '',
          iconName: a.icon_name || 'bot',
          skillIds: a.skill_ids || [],
        }))
      );
    } catch {
      setCustomAgents([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  // Load agents on mount and when returning from CreateAgent
  useFocusEffect(
    useCallback(() => {
      loadAgents();
    }, [loadAgents])
  );

  const openDrawer = () => (navigation.getParent() as { openDrawer?: () => void })?.openDrawer?.();

  const handleAgentPress = (item: AgentItem) => {
    const tabNav = navigation.getParent() as { navigate: (name: keyof MainTabsParamList, params?: object) => void } | undefined;
    // Always open a new chat when selecting an agent (no chatId)
    const skillIds = 'skillIds' in item ? (item as { skillIds?: string[] }).skillIds : undefined;
    tabNav?.navigate('Chat', { chatId: undefined, agentId: item.id, agentName: item.name, agentIconName: item.iconName, agentSkillIds: skillIds });
  };

  const sections: { title: string; data: AgentItem[] }[] = [
    { title: 'Custom agents', data: customAgents },
    { title: 'Default agents', data: DEFAULT_AGENTS },
  ];

  const renderSectionHeader = ({ section }: any) => (
    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{section.title}</Text>
  );

  const handleEditAgent = (agentId: string) => {
    navigation.navigate('EditAgent', { agentId });
  };

  const handleDeleteAgent = (item: AgentItem) => {
    Alert.alert(
      'Delete agent',
      `Are you sure you want to delete "${item.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!accessToken) return;
            try {
              await api.deleteAgent(item.id, accessToken);
              loadAgents();
            } catch {
              Alert.alert('Error', 'Failed to delete agent. Please try again.');
            }
          },
        },
      ]
    );
  };

  const renderAgent = (info: any) => {
    const { item, section } = info;
    return (
      <AgentRow
        item={item}
        colors={colors}
        onPress={() => handleAgentPress(item)}
        isCustom={section.title === 'Custom agents'}
        onEdit={section.title === 'Custom agents' ? () => handleEditAgent(item.id) : undefined}
        onDelete={section.title === 'Custom agents' ? () => handleDeleteAgent(item) : undefined}
      />
    );
  };

  const renderListFooter = () => <View style={{ height: insets.bottom + Spacing.lg }} />;

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
              Customise name, behaviour, and skills
            </Text>
          </View>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator size="small" color={colors.textSecondary} style={{ padding: Spacing.lg }} />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(a) => a.id}
            renderItem={renderAgent}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={renderListFooter}
            showsVerticalScrollIndicator={false}
            renderSectionFooter={({ section }) =>
              section.data.length === 0 && section.title === 'Custom agents' ? (
                <Text style={[styles.emptySection, { color: colors.textSecondary }]}>
                  No custom agents yet. Create one above.
                </Text>
              ) : null
            }
          />
        )}
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
  sectionTitle: { fontSize: 13, fontWeight: '600', marginTop: Spacing.md, marginBottom: Spacing.sm },
  listContent: { gap: 8, paddingBottom: Spacing.md },
  emptySection: { fontSize: 13, fontStyle: 'italic', marginBottom: Spacing.sm },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  agentRowContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  moreBtn: { padding: 4 },
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
});
