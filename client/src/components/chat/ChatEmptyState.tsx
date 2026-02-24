import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AgentIconOrEmoji } from './AgentIcon';
import { useTheme } from '@/contexts';
import { Spacing } from '@/constants';

export const SUGGESTIONS = [
    { label: 'Make me a 7-day diet plan', icon: '🥗', color: '#06B6D4' },
    { label: 'Tell me a mind-blowing fact', icon: '🤯', color: '#B57EDC' },
    { label: 'Write me a funny short story', icon: '✍️', color: '#F59E0B' },
    { label: 'Tell me your best joke', icon: '😂', color: '#CDA4F0' },
];

/** Empty state with 4 action cards (GenZ / General only). */
export function EmptyStateWithCards({ iconName, onSuggestionPress }: { iconName: string; onSuggestionPress: (t: string) => void }) {
    const { colors } = useTheme();
    return (
        <View style={emptyStyles.container}>
            <View style={[emptyStyles.iconCircle, { backgroundColor: colors.surfaceSecondary }]}>
                <AgentIconOrEmoji iconName={iconName} size={32} />
            </View>
            <Text style={[emptyStyles.title, { color: colors.text }]}>How can I help you?</Text>
            <Text style={[emptyStyles.subtitle, { color: colors.textSecondary }]}>
                Pick a suggestion below or type your message.
            </Text>
            <View style={emptyStyles.suggestions}>
                {SUGGESTIONS.map((s) => (
                    <TouchableOpacity
                        key={s.label}
                        style={[emptyStyles.chip, { borderColor: colors.border, backgroundColor: colors.card, borderLeftWidth: 3, borderLeftColor: s.color }]}
                        activeOpacity={0.7}
                        onPress={() => onSuggestionPress(s.label)}
                    >
                        <View style={[emptyStyles.chipIconBox, { backgroundColor: s.color + '15' }]}>
                            <Text style={emptyStyles.chipIcon}>{s.icon}</Text>
                        </View>
                        <Text style={[emptyStyles.chipText, { color: colors.text }]}>{s.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

/** Empty state with agent name + personalized greeting only (no action cards). */
export function EmptyStatePersonalized({ agentName, greeting, iconName }: { agentName: string; greeting: string; iconName: string }) {
    const { colors } = useTheme();
    return (
        <View style={emptyStyles.container}>
            <View style={[emptyStyles.iconCircle, { backgroundColor: colors.surfaceSecondary }]}>
                <AgentIconOrEmoji iconName={iconName} size={32} />
            </View>
            <Text style={[emptyStyles.title, { color: colors.text }]}>{agentName}</Text>
            <Text style={[emptyStyles.subtitle, { color: colors.textSecondary }]}>{greeting}</Text>
        </View>
    );
}

export const emptyStyles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: 8 },
    iconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
    subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    suggestions: { width: '100%', gap: 10, paddingHorizontal: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
    chipIconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    chipIcon: { fontSize: 20 },
    chipText: { fontSize: 15, fontWeight: '500', flex: 1 },
});
