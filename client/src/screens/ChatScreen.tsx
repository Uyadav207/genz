/**
 * Chat screen — ChatGPT-style AI messaging interface with dark mode support.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/services/api';
import type { SourceItem } from '@/services/api';
import {
  SourcesSheet,
  EmptyStateWithCards,
  EmptyStatePersonalized,
  ChatMessageRow,
  type ResearchProgressStep,
} from '@/components/chat';
import type { ChatMessage, PendingPDFAttachment, MessageRole } from '@/components/chat/types';
import { truncateFileName } from '@/components/chat/utils';
import { useMdStyles, useMarkdownRules } from '@/hooks/useChatMarkdown';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowUp,
  Menu,
  X,
  SquarePen,
  Paperclip,
  Mic,
  FileText,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { MainTabsParamList } from '@/types';
import { DEFAULT_AGENT_ID, DEFAULT_AGENTS, Spacing, AGENT_EMPTY_GREETING, AGENTS_WITH_ACTION_CARDS } from '@/constants';
import { useTheme, useAuth, useChats } from '@/contexts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

let _msgId = 0;
function nextId(): string {
  _msgId += 1;
  return `msg-${_msgId}-${Date.now()}`;
}

/* ------------------------------------------------------------------ */
/*  Main Screen                                                        */
/* ------------------------------------------------------------------ */

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { accessToken } = useAuth();
  const { chats, refetch: refetchChats, setAgentId } = useChats();
  const navigation = useNavigation<DrawerNavigationProp<MainTabsParamList, 'Chat'>>();
  const openInAppBrowser = useCallback((url: string) => {
    if (url && /^https?:\/\//i.test(url)) {
      (navigation.getParent() as { navigate: (name: string, params: { url: string }) => void })?.navigate('InAppBrowser', { url });
    }
  }, [navigation]);
  const route = useRoute();
  const routeParams = route.params as { chatId?: string; agentId?: string; agentName?: string; agentIconName?: string; agentSkillIds?: string[] } | undefined;
  const routeChatId = routeParams?.chatId;
  const routeAgentId = routeParams?.agentId;
  const [chatId, setChatId] = useState<string | null>(null);
  const activeChatId = routeChatId ?? chatId;
  const currentChatTitle = activeChatId ? (chats.find((c) => c.id === activeChatId)?.title ?? 'New chat') : 'New chat';
  const mdStyles = useMdStyles(colors);
  const markdownRules = useMarkdownRules(colors);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);

  const effectiveAgentId = routeAgentId ?? DEFAULT_AGENT_ID;
  const effectiveAgentDef = useMemo(() => {
    const fromDefaults = DEFAULT_AGENTS.find((a) => a.id === effectiveAgentId);
    if (fromDefaults) return fromDefaults;
    return {
      id: effectiveAgentId,
      name: routeParams?.agentName ?? 'Agent',
      description: '',
      iconName: (routeParams?.agentIconName as string) || 'user',
    };
  }, [effectiveAgentId, routeParams?.agentName, routeParams?.agentIconName]);
  const showActionCards = AGENTS_WITH_ACTION_CARDS.includes(effectiveAgentId);
  const emptyStateGreeting = useMemo(() => {
    if (AGENT_EMPTY_GREETING[effectiveAgentId]) return AGENT_EMPTY_GREETING[effectiveAgentId];
    return `${effectiveAgentDef.name} — how can I help you today?`;
  }, [effectiveAgentId, effectiveAgentDef.name]);
  const [pendingPDFs, setPendingPDFs] = useState<PendingPDFAttachment[]>([]);
  const [uploadingPDF, setUploadingPDF] = useState(false);
  const [sourcesSheetSources, setSourcesSheetSources] = useState<SourceItem[] | null>(null);
  /** Live research steps for the current streaming message (Perplexity-style). Key = assistant message id. */
  const [researchSteps, setResearchSteps] = useState<Record<string, ResearchProgressStep[]>>({});
  /** Knowledge base upload feedback */
  const [kbUploadMsg, setKbUploadMsg] = useState<string | null>(null);

  // Check if current agent has knowledge_base skill
  // If agentSkillIds not passed via navigation, fetch from API
  const routeSkillIds = routeParams?.agentSkillIds;
  const [fetchedSkillIds, setFetchedSkillIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (routeSkillIds || !effectiveAgentId || DEFAULT_AGENTS.some((a) => a.id === effectiveAgentId)) {
      setFetchedSkillIds(null);
      return;
    }
    // Custom agent without skill info — fetch it
    if (!accessToken) return;
    api.getAgent(effectiveAgentId, accessToken)
      .then(({ agent }) => {
        setFetchedSkillIds(agent?.skill_ids ?? []);
      })
      .catch(() => setFetchedSkillIds(null));
  }, [effectiveAgentId, routeSkillIds, accessToken]);

  const resolvedSkillIds = routeSkillIds ?? fetchedSkillIds;
  const isKnowledgeBaseAgent = useMemo(() => {
    return resolvedSkillIds?.includes('knowledge_base') ?? false;
  }, [resolvedSkillIds]);

  const isImageGenAgent = useMemo(() => {
    if (effectiveAgentId === 'image') return true;
    return resolvedSkillIds?.includes('image_generation') ?? false;
  }, [effectiveAgentId, resolvedSkillIds]);

  // Sync route agentId to ChatsContext for agent-scoped chat list
  useEffect(() => {
    setAgentId(routeAgentId ?? null);
    if (accessToken) refetchChats(accessToken, routeAgentId ?? null);
  }, [routeAgentId, accessToken, setAgentId, refetchChats]);

  // When user selects an agent (no existing chatId in route), always start a new chat
  useEffect(() => {
    if (routeChatId != null) return; // Opening an existing chat from sidebar — don't reset
    setChatId(null);
    setMessages([]);
    setResearchSteps({});
    navigation.setParams({ chatId: undefined } as { chatId?: string });
  }, [routeAgentId, routeChatId, navigation]);

  // Load messages when opening a chat from sidebar
  useFocusEffect(
    useCallback(() => {
      if (!routeChatId || !accessToken) return;
      if (routeChatId === chatId) return;
      setLoadingChat(true);
      api.getChatMessages(routeChatId, accessToken)
        .then(({ messages: list }) => {
          setChatId(routeChatId);
          refetchChats(accessToken, routeAgentId ?? undefined);
          setMessages(list.map((m) => ({
            id: m.id,
            role: m.role as MessageRole,
            content: m.content,
            timestamp: new Date(m.created_at),
            sources: m.extra?.sources,
            places: m.extra?.places,
            images: m.extra?.images,
            generated_images: m.extra?.generated_images,
            researchMeta: m.extra?.research_meta,
          })));
        })
        .catch(() => { })
        .finally(() => setLoadingChat(false));
    }, [routeChatId, routeAgentId, accessToken, refetchChats])
  );

  const scrollToEnd = useCallback(() => { setTimeout(() => { flatListRef.current?.scrollToEnd({ animated: true }); }, 100); }, []);

  const startNewChat = useCallback(() => {
    setChatId(null);
    setMessages([]);
    setInputText('');
    setIsTyping(false);
    setResearchSteps({});
    setPendingPDFs([]);
    navigation.setParams({ chatId: undefined } as { chatId?: string });
  }, [navigation]);

  const pickPDF = useCallback(async () => {
    if (!accessToken || uploadingPDF) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const { uri, name } = result.assets[0];
      setUploadingPDF(true);
      const res = await api.uploadPDF(uri, name, accessToken, activeChatId ?? undefined);
      setPendingPDFs((prev) => [
        ...prev,
        { id: res.id, file_name: res.file_name, extracted_text: res.extracted_text ?? '' },
      ]);
    } catch (err) {
      console.warn('[pickPDF]', err);
      // Could show toast/alert
    } finally {
      setUploadingPDF(false);
    }
  }, [accessToken, uploadingPDF, activeChatId]);

  /** Upload PDF to agent's knowledge base (not per-chat). */
  const pickKnowledgePDF = useCallback(async () => {
    if (!accessToken || uploadingPDF || !effectiveAgentId) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const { uri, name } = result.assets[0];
      setUploadingPDF(true);
      await api.uploadKnowledge(effectiveAgentId, uri, name, accessToken);
      setKbUploadMsg(`📖 "${name}" added to knowledge base`);
      setTimeout(() => setKbUploadMsg(null), 4000);
    } catch (err) {
      console.warn('[pickKnowledgePDF]', err);
      setKbUploadMsg('❌ Failed to upload to knowledge base');
      setTimeout(() => setKbUploadMsg(null), 4000);
    } finally {
      setUploadingPDF(false);
    }
  }, [accessToken, uploadingPDF, effectiveAgentId]);

  const removePDF = useCallback((id: string) => {
    setPendingPDFs((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? inputText).trim();
    const hasPDF = pendingPDFs.length > 0;
    if ((!content && !hasPDF) || isTyping || !accessToken) return;
    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content,
      timestamp: new Date(),
      attachments: hasPDF ? pendingPDFs.map((p) => ({ file_name: p.file_name })) : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText(''); setIsTyping(true); scrollToEnd();
    const assistantMsgId = nextId();
    setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '', fullContent: '', timestamp: new Date() }]);
    scrollToEnd();
    try {
      const effectiveContent = content || (hasPDF ? 'Please analyze the attached PDF document.' : '');
      const historyForApi = [...messages, { ...userMsg, content: effectiveContent }].map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      const agentId = effectiveAgentId;
      const tools =
        agentId === 'web'
          ? ['web_search']
          : agentId === 'brain' || agentId === 'research'
            ? ['research']
            : [];
      const pdfContext = hasPDF
        ? pendingPDFs.map((p) => p.extracted_text).filter(Boolean).join('\n\n---\n\n')
        : undefined;
      const attachmentIds = hasPDF ? pendingPDFs.map((p) => p.id) : undefined;
      const isResearch = tools?.includes('research');

      if (isResearch && (agentId === 'brain' || agentId === 'research')) {
        await api.chatCompleteResearchStream(
          historyForApi,
          chatId,
          accessToken,
          agentId,
          (event) => {
            setResearchSteps((prev) => {
              const list = prev[assistantMsgId] ?? [];
              const next = list.slice();
              const detail = event.detail as { current?: number; total?: number; query?: string } | undefined;
              next.push({
                step: event.step,
                query: detail?.query,
                current: detail?.current,
                total: detail?.total,
              });
              return { ...prev, [assistantMsgId]: next };
            });
          },
          (res) => {
            if (res.chat_id) {
              const wasNewChat = !chatId;
              setChatId(res.chat_id);
              refetchChats(accessToken, effectiveAgentId);
              if (wasNewChat && accessToken) setTimeout(() => refetchChats(accessToken, effectiveAgentId), 2500);
            }
            const aiContent = res.content?.trim() || "I couldn't generate a response. Please try again.";
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? {
                    ...msg,
                    content: aiContent,
                    fullContent: aiContent,
                    sources: res.sources,
                    places: res.places,
                    images: res.images,
                    generated_images: res.generated_images,
                    researchMeta: res.research_meta,
                  }
                  : msg
              )
            );
            setResearchSteps((prev) => {
              const next = { ...prev };
              delete next[assistantMsgId];
              return next;
            });
            setIsTyping(false);
            if (hasPDF) setPendingPDFs([]);
            scrollToEnd();
          },
          (err) => {
            setIsTyping(false);
            setMessages((prev) => prev.filter((msg) => msg.id !== assistantMsgId));
            setResearchSteps((prev) => {
              const next = { ...prev };
              delete next[assistantMsgId];
              return next;
            });
            Alert.alert('Something went wrong', 'Please try again with a new message.', [{ text: 'OK' }]);
            scrollToEnd();
          },
          pdfContext,
          attachmentIds
        );
        return;
      }

      api.chatCompleteStream(
        historyForApi,
        chatId,
        accessToken,
        (chunk) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: (msg.content || '') + chunk } : msg
            )
          );
          scrollToEnd();
        },
        (newChatId) => {
          const wasNewChat = !chatId;
          setChatId(newChatId);
          refetchChats(accessToken!, effectiveAgentId);
          if (wasNewChat && accessToken) {
            setTimeout(() => refetchChats(accessToken, effectiveAgentId), 2500);
          }
        },
        () => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, fullContent: msg.content } : msg
            )
          );
          setIsTyping(false);
          if (hasPDF) setPendingPDFs([]);
          scrollToEnd();
        },
        (err) => {
          setIsTyping(false);
          setMessages((prev) => prev.filter((msg) => msg.id !== assistantMsgId));
          if (hasPDF) setPendingPDFs([]);
          Alert.alert('Something went wrong', 'Please try again with a new message.', [{ text: 'OK' }]);
          scrollToEnd();
        },
        agentId,
        pdfContext,
        attachmentIds,
        (extra) => {
          if (extra.sources || extra.places || extra.images || extra.generated_images) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? {
                    ...msg,
                    sources: extra.sources ?? msg.sources,
                    places: extra.places ?? msg.places,
                    images: extra.images ?? msg.images,
                    generated_images: extra.generated_images ?? msg.generated_images,
                  }
                  : msg
              )
            );
            scrollToEnd();
          }
        }
      );
      return;
    } catch (err: unknown) {
      setIsTyping(false);
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantMsgId));
      setResearchSteps((prev) => {
        const next = { ...prev };
        delete next[assistantMsgId];
        return next;
      });
      Alert.alert('Something went wrong', 'Please try again with a new message.', [{ text: 'OK' }]);
      scrollToEnd();
    }
  }, [inputText, isTyping, messages, scrollToEnd, chatId, accessToken, refetchChats, effectiveAgentId, pendingPDFs]);

  const handleSuggestion = useCallback((text: string) => { sendMessage(text); }, [sendMessage]);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<ChatMessage>) => (
    <ChatMessageRow
      item={item}
      isStreaming={isTyping}
      colors={colors}
      isDark={isDark}
      mdStyles={mdStyles}
      markdownRules={markdownRules}
      onLinkPress={openInAppBrowser}
      onOpenSources={setSourcesSheetSources}
      agentId={effectiveAgentId}
      agentIconName={effectiveAgentDef.iconName}
      researchSteps={researchSteps[item.id]}
      isImageGenAgent={isImageGenAgent}
    />
  ), [isTyping, colors, isDark, mdStyles, markdownRules, openInAppBrowser, effectiveAgentId, effectiveAgentDef.iconName, researchSteps, isImageGenAgent]);

  const hasMessages = messages.length > 0;
  const canSend = (inputText.trim().length > 0 || pendingPDFs.length > 0) && !isTyping;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <SourcesSheet
        visible={sourcesSheetSources !== null}
        sources={sourcesSheetSources ?? []}
        colors={colors}
        onClose={() => setSourcesSheetSources(null)}
        onLinkPress={openInAppBrowser}
      />
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => navigation.openDrawer()}
          activeOpacity={0.7}
        >
          <Menu size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
          {currentChatTitle}
        </Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => navigation.navigate('Voice', { agentId: effectiveAgentId, chatId: activeChatId ?? undefined })}
            activeOpacity={0.7}
          >
            <Mic size={20} color={colors.text} />
          </TouchableOpacity>
          {hasMessages && (
            <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7} onPress={startNewChat}>
              <SquarePen size={20} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {hasMessages ? (
          <FlatList ref={flatListRef} data={messages} renderItem={renderItem} keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled" onContentSizeChange={() => scrollToEnd()} />
        ) : showActionCards ? (
          <EmptyStateWithCards iconName={effectiveAgentDef.iconName} onSuggestionPress={handleSuggestion} />
        ) : (
          <EmptyStatePersonalized agentName={effectiveAgentDef.name} greeting={emptyStateGreeting} iconName={effectiveAgentDef.iconName} />
        )}

        {/* Input Bar — ChatGPT-style. Attachment pills above input with file name + remove. */}
        {kbUploadMsg && (
          <View style={[styles.kbBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.kbBannerText, { color: colors.text }]}>{kbUploadMsg}</Text>
          </View>
        )}
        <View style={[styles.inputBarOuter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {pendingPDFs.length > 0 && (
            <View style={styles.attachmentPillsWrap}>
              {pendingPDFs.map((pdf) => (
                <View key={pdf.id} style={[styles.attachmentPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <FileText size={16} color={colors.primary} />
                  <Text style={[styles.attachmentPillName, { color: colors.text }]} numberOfLines={1}>
                    {truncateFileName(pdf.file_name, 24)}
                  </Text>
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => removePDF(pdf.id)}
                    style={[styles.attachmentPillRemove, { backgroundColor: colors.border }]}
                    activeOpacity={0.7}
                  >
                    <X size={14} color={colors.text} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={[
            styles.inputBar,
            {
              backgroundColor: isDark ? colors.inputBackground : '#FFFFFF',
              borderColor: isDark ? '#353240' : '#E0DCE8',
              borderWidth: 1,
              shadowColor: '#000',
              shadowOpacity: isDark ? 0.2 : 0.04,
              shadowOffset: { width: 0, height: 1 },
              shadowRadius: isDark ? 6 : 12,
              elevation: 2,
            },
          ]}>
            <TouchableOpacity
              style={styles.inputBarIconBtn}
              onPress={pickPDF}
              disabled={uploadingPDF}
              activeOpacity={0.6}
            >
              <Paperclip size={18} color={uploadingPDF ? colors.textSecondary : colors.text} strokeWidth={2} />
            </TouchableOpacity>
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              value={inputText}
              onChangeText={setInputText}
              placeholder={
                effectiveAgentDef.id === 'web'
                  ? 'Search the web...'
                  : effectiveAgentDef.id === 'brain'
                    ? 'Ask for deep research...'
                    : `Message ${effectiveAgentDef.name}...`
              }
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={2000}
              editable={!isTyping}
              onSubmitEditing={() => sendMessage()}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                {
                  backgroundColor: canSend
                    ? colors.primary
                    : colors.surfaceSecondary,
                },
              ]}
              onPress={() => sendMessage()}
              disabled={!canSend}
              activeOpacity={0.8}
            >
              <ArrowUp
                size={18}
                color={canSend ? colors.white : colors.textSecondary}
                strokeWidth={2.5}
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView >

    </View >
  );
}

/* ------------------------------------------------------------------ */
/*  Static styles (no color dependency)                                */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8, position: 'relative' },
  menuBtn: { position: 'absolute', left: Spacing.md, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerRight: { position: 'absolute', right: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center', maxWidth: '60%' },
  listContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  inputBarOuter: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 4,
    paddingRight: 4,
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: 44,
    gap: 2,
  },
  inputBarIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 120,
    paddingVertical: Platform.OS === 'ios' ? 6 : 6,
    paddingHorizontal: 10,
    marginBottom: 2,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    marginLeft: 2,
  },
  attachmentPillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  attachmentPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, paddingVertical: 6, paddingLeft: 10, paddingRight: 6, gap: 6 },
  attachmentPillName: { fontSize: 13, marginRight: 2 },
  attachmentPillRemove: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  genzThinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 8 },
  genzThinkingText: { fontSize: 15, lineHeight: 24, fontStyle: 'italic' },
  researchStepsContainer: { gap: 6, marginTop: 4 },
  researchStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  researchStepDot: { width: 6, height: 6, borderRadius: 3 },
  researchStepText: { fontSize: 13, flex: 1 },
  kbBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  kbBannerText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
});

