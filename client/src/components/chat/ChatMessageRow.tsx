import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import { User, Globe, BookOpen, Copy, FileText } from 'lucide-react-native';
import type { ThemeColors } from '@/contexts';
import type { ChatMessage, SourceItem } from './types';
import { truncateFileName } from './utils';
import { AgentIconOrEmoji } from './AgentIcon';
import { ResearchStepsIndicator, type ResearchProgressStep } from './ResearchStepsIndicator';
import { ImageGeneratingPlaceholder } from './ImageGeneratingPlaceholder';
import { GenZThinkingIndicator } from './GenZThinkingIndicator';
import { MessageBanner } from './MessageBanner';
import { PlaceCards } from './PlaceCards';
import { ImageGallery } from './ImageGallery';
import { GeneratedImageGallery } from './GeneratedImageGallery';
import { EMOJI_PREFIX } from './AgentIcon';
import { DEFAULT_AGENT_ID } from '@/constants/agents';

export function ChatMessageRow({
    item,
    isStreaming,
    colors,
    isDark,
    mdStyles,
    markdownRules,
    onLinkPress,
    onOpenSources,
    agentId,
    agentIconName,
    researchSteps,
    isImageGenAgent,
}: {
    item: ChatMessage;
    isStreaming?: boolean;
    colors: ThemeColors;
    isDark: boolean;
    mdStyles: any;
    markdownRules?: Record<string, any>;
    onLinkPress?: (url: string) => void;
    onOpenSources?: (sources: SourceItem[]) => void;
    agentId?: string;
    agentIconName?: string;
    researchSteps?: ResearchProgressStep[];
    isImageGenAgent?: boolean;
}) {
    const isUser = item.role === 'user';
    const isGenZMode = agentId === DEFAULT_AGENT_ID;
    const showResearchSteps = !isUser && isStreaming && !item.content && researchSteps && researchSteps.length > 0;
    const showImageGenLoading = !isUser && isStreaming && !item.content && isImageGenAgent && !showResearchSteps;
    // Determine if this agent uses an emoji icon
    const isEmojiAgent = !!agentIconName?.startsWith?.(EMOJI_PREFIX);
    const assistantAvatarBg = isDark ? colors.surfaceSecondary : colors.text;

    return (
        <View style={msgStyles.row}>
            <View style={msgStyles.avatarWrapper}>
                {isUser ? (
                    <View style={[msgStyles.avatar, { backgroundColor: colors.primary }]}>
                        <User size={16} color={colors.white} />
                    </View>
                ) : isEmojiAgent ? (
                    // Emoji icon: no background circle, just show emoji
                    <View style={msgStyles.emojiAvatar}>
                        <Text style={{ fontSize: 24, lineHeight: 30 }}>{agentIconName!.slice(EMOJI_PREFIX.length)}</Text>
                    </View>
                ) : (
                    <View style={[msgStyles.avatar, { backgroundColor: assistantAvatarBg }]}>
                        <AgentIconOrEmoji iconName={agentIconName ?? 'user'} size={15} color={colors.white} />
                    </View>
                )}
                {!isUser && <View style={[msgStyles.onlineDot, { borderColor: colors.background }]} />}
            </View>
            <View style={msgStyles.content}>
                {isUser && <Text style={[msgStyles.roleLabel, { color: colors.text }]}>You</Text>}
                {!isUser && !item.content && isStreaming ? (
                    showResearchSteps ? (
                        <ResearchStepsIndicator steps={researchSteps!} colors={colors} />
                    ) : showImageGenLoading ? (
                        <ImageGeneratingPlaceholder colors={colors} />
                    ) : isGenZMode ? (
                        <GenZThinkingIndicator colors={colors} />
                    ) : (
                        <View style={msgStyles.thinkingRow}>
                            <View style={[msgStyles.thinkingDot, { backgroundColor: colors.textSecondary }]} />
                            <View style={[msgStyles.thinkingDot, { backgroundColor: colors.textSecondary, opacity: 0.6 }]} />
                            <View style={[msgStyles.thinkingDot, { backgroundColor: colors.textSecondary, opacity: 0.3 }]} />
                        </View>
                    )
                ) : isUser ? (
                    <View style={msgStyles.userBubble}>
                        {item.attachments && item.attachments.length > 0 && (
                            <View style={msgStyles.attachmentList}>
                                {item.attachments.map((att, idx) => (
                                    <View key={idx} style={[msgStyles.attachmentChipInMsg, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                                        <FileText size={14} color={colors.primary} />
                                        <Text style={[msgStyles.attachmentNameInMsg, { color: colors.text }]} numberOfLines={1}>
                                            {truncateFileName(att.file_name, 24)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}
                        {item.content ? (
                            <Text style={{ fontSize: 15, lineHeight: 24, color: colors.text }}>{item.content}</Text>
                        ) : null}
                    </View>
                ) : (
                    <>
                        <Markdown
                            style={mdStyles}
                            rules={markdownRules ?? undefined}
                            onLinkPress={(url) => {
                                if (url && /^https?:\/\//i.test(url) && onLinkPress) {
                                    onLinkPress(url);
                                    return true;
                                }
                                Linking.openURL(url).catch(() => { });
                                return true;
                            }}
                        >
                            {item.content}
                        </Markdown>
                        {item.researchMeta?.confidence === 'low' && (
                            <MessageBanner variant="low_confidence" colors={colors} />
                        )}
                        {item.researchMeta?.partial && (
                            <MessageBanner variant="partial" colors={colors} />
                        )}
                        {(item.sources?.length || item.places?.length || item.images?.length) ? (
                            <View style={msgStyles.webResultsSection}>
                                <View style={[msgStyles.webResultsHeader, { borderBottomColor: colors.border }]}>
                                    <Globe size={14} color={colors.primary} />
                                    <Text style={[msgStyles.webResultsTitle, { color: colors.textSecondary }]}>
                                        Web search results
                                    </Text>
                                </View>
                                {item.sources && item.sources.length > 0 && (
                                    <View style={msgStyles.sourceActionsRow}>
                                        <TouchableOpacity
                                            style={[msgStyles.sourcesBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                                            onPress={() => onOpenSources?.(item.sources!)}
                                            activeOpacity={0.7}
                                        >
                                            <BookOpen size={16} color={colors.primary} />
                                            <Text style={[msgStyles.sourcesBtnText, { color: colors.primary }]}>
                                                Sources ({item.sources.length})
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[msgStyles.copyBtn, { borderColor: colors.border }]}
                                            onPress={() => {
                                                const lines = [item.content, '', 'Sources:'];
                                                (item.sources ?? []).forEach((s, i) => {
                                                    lines.push(`${i + 1}. ${s.title || s.url}`, `   ${s.url}`);
                                                });
                                                Clipboard.setStringAsync(lines.join('\n')).catch(() => { });
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <Copy size={14} color={colors.textSecondary} />
                                            <Text style={[msgStyles.copyBtnText, { color: colors.textSecondary }]}>Copy</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                                {item.places && item.places.length > 0 && <PlaceCards places={item.places} colors={colors} onLinkPress={onLinkPress} />}
                                {item.images && item.images.length > 0 && <ImageGallery images={item.images} colors={colors} onLinkPress={onLinkPress} />}
                            </View>
                        ) : null}
                        {item.generated_images && item.generated_images.length > 0 && (
                            <GeneratedImageGallery images={item.generated_images} colors={colors} />
                        )}
                    </>
                )}
            </View>
        </View>
    );
}

export const msgStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24, gap: 12 },
    avatarWrapper: { position: 'relative', marginTop: 2 },
    avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    emojiAvatar: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    onlineDot: { position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E', borderWidth: 2 },
    content: { flex: 1 },
    roleLabel: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
    userBubble: { gap: 10 },
    attachmentList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 2 },
    attachmentChipInMsg: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1 },
    attachmentNameInMsg: { fontSize: 13 },
    thinkingRow: { flexDirection: 'row', gap: 4, paddingVertical: 8 },
    thinkingDot: { width: 8, height: 8, borderRadius: 4 },
    webResultsSection: {
        marginTop: 14,
        paddingTop: 12,
        gap: 12,
    },
    webResultsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingBottom: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    webResultsTitle: {
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    sourceActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
    },
    sourcesBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
    },
    sourcesBtnText: { fontSize: 13, fontWeight: '600' },
    copyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: 1,
    },
    copyBtnText: { fontSize: 12, fontWeight: '500' },
});
