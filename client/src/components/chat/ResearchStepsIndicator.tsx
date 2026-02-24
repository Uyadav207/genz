import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ThemeColors } from '@/contexts';

export interface ResearchProgressStep {
    step: string;
    query?: string;
    current?: number;
    total?: number;
}

/** Perplexity-style list of live research steps (planning, searching, ranking, writing). */
export function ResearchStepsIndicator({ steps, colors }: { steps: ResearchProgressStep[]; colors: ThemeColors }) {
    const labels: Record<string, string> = {
        planning: 'Planning questions...',
        searching: 'Searching the web',
        ranking: 'Ranking sources...',
        synthesizing: 'Writing answer...',
    };
    return (
        <View style={styles.researchStepsContainer}>
            {steps.map((s, i) => {
                const label = s.step === 'searching' && s.query
                    ? `Searching: ${s.query}`
                    : labels[s.step] ?? s.step;
                const sub = s.step === 'searching' && s.total != null && s.current != null
                    ? ` (${s.current}/${s.total})`
                    : '';
                return (
                    <View key={i} style={[styles.researchStepRow, { borderColor: colors.border }]}>
                        <View style={[styles.researchStepDot, { backgroundColor: colors.primary }]} />
                        <Text style={[styles.researchStepText, { color: colors.text }]} numberOfLines={2}>
                            {label}{sub}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    researchStepsContainer: { gap: 6, marginTop: 4 },
    researchStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
    researchStepDot: { width: 6, height: 6, borderRadius: 3 },
    researchStepText: { fontSize: 13, flex: 1 },
});
