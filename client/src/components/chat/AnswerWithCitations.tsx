/**
 * Answer with citations — renders full content as a single Markdown block and turns [1], [2]
 * into tappable citation pills via a custom "text" rule so markdown (bold, lists, links) renders correctly.
 */

import React, { useMemo } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import Markdown, { renderRules } from 'react-native-markdown-display';
import type { SourceItem } from '@/services/api';
import type { ThemeColors } from '@/contexts';
import { CitationPill } from './CitationPill';

const CITATION_REGEX = /\[(\d+)\]/g;

export type MarkdownStyles = ReturnType<typeof StyleSheet.create>;
export type MarkdownRules = Record<string, (node: { key?: string }, children: React.ReactNode, parent: unknown, styles: Record<string, object>) => React.ReactNode>;

interface AnswerWithCitationsProps {
  content: string;
  sources: SourceItem[];
  colors: ThemeColors;
  onLinkPress?: (url: string) => void;
  mdStyles?: MarkdownStyles;
  markdownRules?: MarkdownRules;
}

function defaultMdStyles(colors: ThemeColors): MarkdownStyles {
  return StyleSheet.create({
    body: { color: colors.text, fontSize: 15, lineHeight: 24 },
    paragraph: { marginTop: 0, marginBottom: 8 },
    strong: { fontWeight: '600', color: colors.text },
    em: { fontStyle: 'italic' },
    link: { color: colors.primary, textDecorationLine: 'underline' },
    code_inline: { backgroundColor: colors.surfaceSecondary, color: colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
    code_block: { backgroundColor: colors.surfaceSecondary, color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, padding: 14, borderRadius: 8, marginVertical: 8 },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    list_item: { marginVertical: 2 },
    blockquote: { backgroundColor: colors.surfaceSecondary, borderLeftColor: colors.border, borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 4, marginVertical: 8 },
  });
}

export function AnswerWithCitations({ content, sources, colors, onLinkPress, mdStyles, markdownRules }: AnswerWithCitationsProps) {
  const hasCitations = sources.length > 0 && /\[\d+\]/.test(content);
  const resolvedStyles = useMemo(() => mdStyles ?? defaultMdStyles(colors), [mdStyles, colors]);

  const citationRules = useMemo(() => {
    const defaultTextRule = renderRules.text as (node: { key?: string; content: string }, children: React.ReactNode, parent: unknown, styles: Record<string, object>, inheritedStyles?: object) => React.ReactNode;
    return {
      text: (node: { key?: string; content: string }, children: React.ReactNode, parent: unknown, styles: Record<string, object>, inheritedStyles: object = {}) => {
        const raw = node.content;
        const citationMatch = raw.match(/^\[(\d+)\]$/);
        if (citationMatch) {
          const num = parseInt(citationMatch[1], 10);
          return (
            <CitationPill
              key={node.key}
              sourceIndex={num}
              sources={sources}
              colors={colors}
              onLinkPress={onLinkPress}
            />
          );
        }
        const parts = raw.split(/(\[\d+\])/);
        if (parts.length <= 1) {
          return defaultTextRule(node, children, parent, styles, inheritedStyles);
        }
        return (
          <View
            key={node.key}
            style={[
              inheritedStyles,
              { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
            ]}
          >
            {parts.map((part, i) => {
              const m = part.match(/^\[(\d+)\]$/);
              if (m) {
                const num = parseInt(m[1], 10);
                return (
                  <CitationPill
                    key={i}
                    sourceIndex={num}
                    sources={sources}
                    colors={colors}
                    onLinkPress={onLinkPress}
                  />
                );
              }
              return part ? <Text key={i} style={[inheritedStyles, styles.text]}>{part}</Text> : null;
            })}
          </View>
        );
      },
      paragraph: (node: { key?: string }, children: React.ReactNode, parent: unknown, styles: Record<string, object>) => (
        <View
          key={node.key}
          style={[styles._VIEW_SAFE_paragraph, { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }]}
        >
          {children}
        </View>
      ),
    };
  }, [sources, colors, onLinkPress]);

  const mergedRules = useMemo(() => ({ ...citationRules, ...markdownRules }), [citationRules, markdownRules]);

  if (!hasCitations || sources.length === 0) {
    return null;
  }

  const handleLinkPress = (url: string) => {
    if (url && /^https?:\/\//i.test(url) && onLinkPress) {
      onLinkPress(url);
      return true;
    }
    Linking.openURL(url).catch(() => {});
    return true;
  };

  return (
    <View style={styles.wrapper}>
      <Markdown
        style={resolvedStyles}
        rules={mergedRules}
        onLinkPress={handleLinkPress}
      >
        {content}
      </Markdown>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 4 },
  text: {
    fontSize: 15,
    lineHeight: 24,
  },
});
