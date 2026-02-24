import React, { useMemo } from 'react';
import { StyleSheet, Platform, ScrollView, View } from 'react-native';
import type { ThemeColors } from '@/contexts';

export function useMdStyles(colors: ThemeColors) {
    return useMemo(() => StyleSheet.create({
        body: { color: colors.text, fontSize: 15, lineHeight: 24 },
        heading1: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 16, marginBottom: 8, lineHeight: 28 },
        heading2: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 14, marginBottom: 6, lineHeight: 24 },
        heading3: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 12, marginBottom: 4, lineHeight: 22 },
        code_inline: { backgroundColor: colors.surfaceSecondary, color: colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
        code_block: { backgroundColor: colors.codeBackground, color: colors.codeText, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, padding: 14, borderRadius: 8, marginVertical: 8 },
        fence: { backgroundColor: colors.codeBackground, color: colors.codeText, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, padding: 14, borderRadius: 8, marginVertical: 8 },
        blockquote: { backgroundColor: colors.surfaceSecondary, borderLeftColor: colors.border, borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 4, marginVertical: 8 },
        bullet_list: { marginVertical: 4 },
        ordered_list: { marginVertical: 4 },
        list_item: { marginVertical: 2 },
        link: { color: colors.primary, textDecorationLine: 'underline' },
        strong: { fontWeight: '600', color: colors.text },
        em: { fontStyle: 'italic' },
        paragraph: { marginTop: 0, marginBottom: 8 },
        hr: { backgroundColor: colors.border, height: 1, marginVertical: 16 },
        table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginVertical: 8, overflow: 'hidden', alignSelf: 'flex-start' },
        thead: {},
        tbody: {},
        tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border },
        th: { backgroundColor: colors.surfaceSecondary, padding: 10, fontWeight: '600', fontSize: 13, width: 120, borderRightWidth: 1, borderColor: colors.border },
        td: { padding: 10, fontSize: 13, width: 120, borderRightWidth: 1, borderColor: colors.border },
    }), [colors]);
}

/** Custom markdown rules: wrap tables in horizontal ScrollView so they don't clutter (ChatGPT-style) */
export function useMarkdownRules(colors: ThemeColors) {
    return useMemo(() => ({
        table: (node: { key?: string }, children: React.ReactNode, _parent: unknown, styles: Record<string, object>) => (
            <ScrollView
                key={node.key}
                horizontal
                showsHorizontalScrollIndicator={true}
                style={{ maxWidth: '100%', marginVertical: 8 }}
            >
                <View style={[styles.table as any, { flexDirection: 'column' }]}>
                    {children}
                </View>
            </ScrollView>
        ),
    }), [colors]);
}
