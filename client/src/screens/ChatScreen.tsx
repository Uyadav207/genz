/**
 * Chat screen — ChatGPT-style AI messaging interface with dark mode support.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type SourceItem, type PlaceItem, type ImageItem, type ResearchMeta } from '@/services/api';
import { PlaceCards, ImageGallery, MessageBanner, SourcesSheet } from '@/components/chat';
import {
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowUp,
  Menu,
  MessageCircle,
  Plus,
  X,
  Bot,
  Code,
  PenLine,
  ImageIcon,
  BrainCircuit,
  Globe,
  User,
  SquarePen,
  Paperclip,
  FileText,
  Copy,
  BookOpen,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { MainTabsParamList } from '@/types';
import { DEFAULT_AGENT_ID, DEFAULT_AGENTS, FontSize, Spacing, AGENT_ICON_COLORS } from '@/constants';
import type { AgentDef } from '@/constants';
import { useTheme, useAuth, useChats } from '@/contexts';
import type { ThemeColors } from '@/contexts';
import Markdown from 'react-native-markdown-display';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type MessageRole = 'user' | 'assistant';

/** Attachment shown in a message (e.g. PDF) */
interface MessageAttachment {
  file_name: string;
}

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  fullContent?: string;
  timestamp: Date;
  /** PDF/file attachments sent with this message */
  attachments?: MessageAttachment[];
  /** Web search / research sources */
  sources?: SourceItem[];
  /** Places (restaurants, businesses) */
  places?: PlaceItem[];
  /** Images from web search */
  images?: ImageItem[];
  /** Research-only metadata (partial, confidence, sub_queries) */
  researchMeta?: ResearchMeta;
}

/** Pending PDF attachment before send */
interface PendingPDFAttachment {
  id: string; // attachment_id from upload
  file_name: string;
  extracted_text: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

let _msgId = 0;
function nextId(): string {
  _msgId += 1;
  return `msg-${_msgId}-${Date.now()}`;
}

/** Truncate file name to maxChars, always showing extension (e.g. "long-name....pdf") */
function truncateFileName(name: string, maxChars: number = 22): string {
  if (!name || name.length <= maxChars) return name;
  const lastDot = name.lastIndexOf('.');
  const ext = lastDot >= 0 ? name.slice(lastDot) : ''; // e.g. ".pdf"
  const base = lastDot >= 0 ? name.slice(0, lastDot) : name;
  const baseMax = maxChars - ext.length - 3; // leave room for "..."
  if (baseMax <= 0) return name.slice(0, maxChars - 3) + '...';
  return base.slice(0, baseMax) + '...' + ext;
}

/* ------------------------------------------------------------------ */
/*  Suggestion Chips                                                    */
/* ------------------------------------------------------------------ */

const SUGGESTIONS = [
  { label: 'Make me a 7-day diet plan', icon: '🥗', color: '#22C55E' },
  { label: 'Tell me a mind-blowing fact', icon: '🤯', color: '#3B82F6' },
  { label: 'Write me a funny short story', icon: '✍️', color: '#F59E0B' },
  { label: 'Tell me your best joke', icon: '😂', color: '#EC4899' },
];

/** Slangy "thinking" phrases for GenZ mode typing indicator */
const GENZ_THINKING_PHRASES = [
  'hold up...',
  'let me cook...',
  'one sec bestie...',
  'lowkey thinking...',
  'getting the tea...',
  'loading the vibes...',
  'ok ok processing...',
  'give me a sec...',
  'brb manifesting...',
  'this is giving loading...',
];

/* ------------------------------------------------------------------ */
/*  Agent icon (uses shared DEFAULT_AGENTS / AGENT_ICON_COLORS)        */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Agent Popup                                                        */
/* ------------------------------------------------------------------ */

function AgentPopup({
  visible, onClose, onSelect,
}: { visible: boolean; onClose: () => void; onSelect: (a: AgentDef) => void }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={popupStyles.overlay} onPress={onClose}>
        <Pressable style={[popupStyles.sheet, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
          <View style={popupStyles.header}>
            <Text style={[popupStyles.title, { color: colors.text }]}>Add Agent</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={[popupStyles.subtitle, { color: colors.textSecondary }]}>
            Choose an agent to assist in this conversation
          </Text>
          <View style={popupStyles.list}>
            {DEFAULT_AGENTS.map((agent) => (
              <TouchableOpacity
                key={agent.id} style={popupStyles.agentRow} activeOpacity={0.65}
                onPress={() => { onSelect(agent); onClose(); }}
              >
                <View style={[popupStyles.agentIconBox, { backgroundColor: colors.surfaceSecondary }]}>
                  <AgentIcon name={agent.iconName} />
                </View>
                <View style={popupStyles.agentInfo}>
                  <Text style={[popupStyles.agentName, { color: colors.text }]}>{agent.name}</Text>
                  <Text style={[popupStyles.agentDesc, { color: colors.textSecondary }]}>{agent.description}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function EmptyState({ onSuggestionPress }: { onSuggestionPress: (t: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={emptyStyles.container}>
      <View style={[emptyStyles.iconCircle, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={{ fontSize: 32 }}>{'👋'}</Text>
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

function BlinkingCursor() {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [opacity]);
  return <Animated.Text style={[{ fontSize: 15, color: colors.textSecondary, lineHeight: 24 }, { opacity }]}>{'▋'}</Animated.Text>;
}

/* ------------------------------------------------------------------ */
/*  GenZ thinking indicator — types slangy phrases while waiting        */
/* ------------------------------------------------------------------ */

function GenZThinkingIndicator({ colors }: { colors: ThemeColors }) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayedLength, setDisplayedLength] = useState(0);
  const phrase = GENZ_THINKING_PHRASES[phraseIndex % GENZ_THINKING_PHRASES.length];
  const displayed = phrase.slice(0, displayedLength);

  useEffect(() => {
    if (displayedLength < phrase.length) {
      const t = setTimeout(() => setDisplayedLength((n) => n + 1), 80);
      return () => clearTimeout(t);
    }
    const pauseThenNext = setTimeout(() => {
      setPhraseIndex((i) => i + 1);
      setDisplayedLength(0);
    }, 1200);
    return () => clearTimeout(pauseThenNext);
  }, [phrase, displayedLength, phrase.length]);

  return (
    <View style={styles.genzThinkingRow}>
      <Text style={[styles.genzThinkingText, { color: colors.textSecondary }]}>{displayed}</Text>
      <BlinkingCursor />
    </View>
  );
}

/** One step in the research progress (e.g. "Searching: best laptops 2024") */
export interface ResearchProgressStep {
  step: string;
  query?: string;
  current?: number;
  total?: number;
}

/** Perplexity-style list of live research steps (planning, searching, ranking, writing). */
function ResearchStepsIndicator({ steps, colors }: { steps: ResearchProgressStep[]; colors: ThemeColors }) {
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

/* ------------------------------------------------------------------ */
/*  Markdown styles builder                                            */
/* ------------------------------------------------------------------ */

function useMdStyles(colors: ThemeColors) {
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
function useMarkdownRules(colors: ThemeColors) {
  return useMemo(() => ({
    table: (node: { key?: string }, children: React.ReactNode, _parent: unknown, styles: Record<string, object>) => (
      <ScrollView
        key={node.key}
        horizontal
        showsHorizontalScrollIndicator={true}
        style={{ maxWidth: '100%', marginVertical: 8 }}
      >
        <View style={[styles.table, { flexDirection: 'column' }]}>
          {children}
        </View>
      </ScrollView>
    ),
  }), [colors]);
}

/* ------------------------------------------------------------------ */
/*  ChatMessage Row                                                    */
/* ------------------------------------------------------------------ */

function ChatMessageRow({ item, isStreaming, colors, isDark, mdStyles, markdownRules, onLinkPress, onOpenSources, agentId, researchSteps }: {
  item: ChatMessage; isStreaming?: boolean; colors: ThemeColors; isDark: boolean; mdStyles: ReturnType<typeof useMdStyles>; markdownRules?: Record<string, (node: { key?: string }, children: React.ReactNode, parent: unknown, styles: Record<string, object>) => React.ReactNode>; onLinkPress?: (url: string) => void; onOpenSources?: (sources: SourceItem[]) => void; agentId?: string; researchSteps?: ResearchProgressStep[];
}) {
  const isUser = item.role === 'user';
  const isGenZMode = agentId === DEFAULT_AGENT_ID;
  const showResearchSteps = !isUser && isStreaming && !item.content && researchSteps && researchSteps.length > 0;
  // AI avatar: dark-mode friendly — use a background that contrasts with the icon in both themes
  const assistantAvatarBg = isDark ? colors.surfaceSecondary : colors.text;
  const assistantIconColor = colors.white;

  return (
    <View style={msgStyles.row}>
      <View style={msgStyles.avatarWrapper}>
        <View style={[msgStyles.avatar, isUser ? { backgroundColor: colors.primary } : { backgroundColor: assistantAvatarBg }]}>
          {isUser ? <User size={16} color={colors.white} /> : <Bot size={16} color={assistantIconColor} />}
        </View>
        {!isUser && <View style={[msgStyles.onlineDot, { borderColor: colors.background }]} />}
      </View>
      <View style={msgStyles.content}>
        {isUser && <Text style={[msgStyles.roleLabel, { color: colors.text }]}>You</Text>}
        {!isUser && !item.content && isStreaming ? (
          showResearchSteps ? (
            <ResearchStepsIndicator steps={researchSteps!} colors={colors} />
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
                Linking.openURL(url).catch(() => {});
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
                      lines.push(`${i + 1}. ${s.title || s.link}`, `   ${s.link}`);
                    });
                    Clipboard.setStringAsync(lines.join('\n')).catch(() => {});
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
          </>
        )}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Screen                                                        */
/* ------------------------------------------------------------------ */

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { accessToken } = useAuth();
  const { chats, refetch: refetchChats } = useChats();
  const navigation = useNavigation<DrawerNavigationProp<MainTabsParamList, 'Chat'>>();
  const openInAppBrowser = useCallback((url: string) => {
    if (url && /^https?:\/\//i.test(url)) {
      (navigation.getParent() as { navigate: (name: string, params: { url: string }) => void })?.navigate('InAppBrowser', { url });
    }
  }, [navigation]);
  const route = useRoute();
  const routeChatId = (route.params as { chatId?: string } | undefined)?.chatId;
  const [chatId, setChatId] = useState<string | null>(null);
  const activeChatId = routeChatId ?? chatId;
  const currentChatTitle = activeChatId ? (chats.find((c) => c.id === activeChatId)?.title ?? 'New chat') : 'New chat';
  const mdStyles = useMdStyles(colors);
  const markdownRules = useMarkdownRules(colors);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const defaultAgent = DEFAULT_AGENTS.find((a) => a.id === DEFAULT_AGENT_ID) ?? DEFAULT_AGENTS[0];
  const [selectedAgent, setSelectedAgent] = useState<AgentDef>(defaultAgent);
  const [loadingChat, setLoadingChat] = useState(false);
  const [pendingPDFs, setPendingPDFs] = useState<PendingPDFAttachment[]>([]);
  const [uploadingPDF, setUploadingPDF] = useState(false);
  const [sourcesSheetSources, setSourcesSheetSources] = useState<SourceItem[] | null>(null);
  /** Live research steps for the current streaming message (Perplexity-style). Key = assistant message id. */
  const [researchSteps, setResearchSteps] = useState<Record<string, ResearchProgressStep[]>>({});

  // Load messages when opening a chat from sidebar
  useFocusEffect(
    useCallback(() => {
      if (!routeChatId || !accessToken) return;
      if (routeChatId === chatId) return;
      setLoadingChat(true);
      api.getChatMessages(routeChatId, accessToken)
        .then(({ messages: list }) => {
          setChatId(routeChatId);
          setMessages(list.map((m) => ({
            id: m.id,
            role: m.role as MessageRole,
            content: m.content,
            timestamp: new Date(m.created_at),
            sources: m.extra?.sources,
            places: m.extra?.places,
            images: m.extra?.images,
            researchMeta: m.extra?.research_meta,
          })));
        })
        .catch(() => {})
        .finally(() => setLoadingChat(false));
    }, [routeChatId, accessToken])
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
      const agentId = selectedAgent?.id ?? DEFAULT_AGENT_ID;
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
              refetchChats(accessToken);
              if (wasNewChat && accessToken) setTimeout(() => refetchChats(accessToken), 2500);
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
            setMessages((prev) => prev.map((msg) => msg.id === assistantMsgId ? { ...msg, content: `Sorry, I couldn't complete your request: ${err.message}` } : msg));
            setResearchSteps((prev) => {
              const next = { ...prev };
              delete next[assistantMsgId];
              return next;
            });
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
          refetchChats(accessToken!);
          if (wasNewChat && accessToken) {
            setTimeout(() => refetchChats(accessToken), 2500);
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
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: `Sorry, I couldn't complete your request: ${err.message}` } : msg
            )
          );
          if (hasPDF) setPendingPDFs([]);
          scrollToEnd();
        },
        agentId,
        pdfContext,
        attachmentIds
      );
      return;
    } catch (err: unknown) {
      setIsTyping(false);
      const errMsg = err instanceof Error ? err.message : 'Something went wrong';
      setMessages((prev) => prev.map((msg) => msg.id === assistantMsgId ? { ...msg, content: `Sorry, I couldn't complete your request: ${errMsg}` } : msg));
      setResearchSteps((prev) => {
        const next = { ...prev };
        delete next[assistantMsgId];
        return next;
      });
      scrollToEnd();
    }
  }, [inputText, isTyping, messages, scrollToEnd, chatId, accessToken, refetchChats, selectedAgent, pendingPDFs]);

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
      agentId={selectedAgent?.id}
      researchSteps={researchSteps[item.id]}
    />
  ), [isTyping, colors, isDark, mdStyles, markdownRules, openInAppBrowser, selectedAgent?.id, researchSteps]);

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
        {hasMessages && (
          <TouchableOpacity style={styles.newChatBtn} activeOpacity={0.7} onPress={startNewChat}>
            <SquarePen size={20} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {hasMessages ? (
          <FlatList ref={flatListRef} data={messages} renderItem={renderItem} keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled" onContentSizeChange={() => scrollToEnd()} />
        ) : (
          <EmptyState onSuggestionPress={handleSuggestion} />
        )}

        {/* Input Bar — ChatGPT-style. Attachment pills above input with file name + remove. */}
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
          {selectedAgent.id !== DEFAULT_AGENT_ID && (
            <View style={styles.agentBadgeRow}>
              <View style={[styles.agentBadge, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <AgentIcon name={selectedAgent.iconName} size={16} />
                <Text style={[styles.agentBadgeText, { color: colors.text }]}>
                  {selectedAgent.id === 'web' ? 'Web' : selectedAgent.id === 'brain' ? 'Research' : selectedAgent.name}
                </Text>
                <TouchableOpacity onPress={() => setSelectedAgent(defaultAgent)} activeOpacity={0.7}>
                  <X size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          <View style={[
            styles.inputBar,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.border,
              shadowColor: '#000',
              shadowOpacity: isDark ? 0.2 : 0.04,
              shadowOffset: { width: 0, height: 1 },
              shadowRadius: isDark ? 6 : 12,
              elevation: 2,
            },
          ]}>
            <TouchableOpacity
              style={[styles.inputBarIconBtn, { backgroundColor: colors.surfaceSecondary }]}
              onPress={() => setShowAgents(true)}
              activeOpacity={0.6}
            >
              <Plus size={18} color={colors.text} strokeWidth={2} />
            </TouchableOpacity>
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
                selectedAgent.id === 'web'
                  ? 'Search the web...'
                  : selectedAgent.id === 'brain'
                    ? 'Ask for deep research...'
                    : 'Message GenZ AI...'
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
                    ? isDark
                      ? colors.white
                      : '#000000'
                    : colors.surfaceSecondary,
                },
              ]}
              onPress={() => sendMessage()}
              disabled={!canSend}
              activeOpacity={0.8}
            >
              <ArrowUp
                size={18}
                color={canSend ? (isDark ? '#000000' : colors.white) : colors.textSecondary}
                strokeWidth={2.5}
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <AgentPopup visible={showAgents} onClose={() => setShowAgents(false)} onSelect={(agent) => setSelectedAgent(agent)} />
    </View>
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
  newChatBtn: { position: 'absolute', right: Spacing.md, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  listContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  inputBarOuter: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  agentBadgeRow: { marginBottom: 8, gap: 4 },
  agentBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  agentBadgeText: { fontSize: 13, fontWeight: '600' },
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
});

const msgStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24, gap: 12 },
  avatarWrapper: { position: 'relative', marginTop: 2 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E', borderWidth: 2 },
  content: { flex: 1 },
  roleLabel: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  userBubble: { gap: 10 },
  attachmentList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 2 },
  attachmentChipInMsg: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1 },
  attachmentNameInMsg: { fontSize: 13 },
  thinkingRow: { flexDirection: 'row', gap: 4, paddingVertical: 8 },
  thinkingDot: { width: 8, height: 8, borderRadius: 4 },
  sourceActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
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

const emptyStyles = StyleSheet.create({
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

const popupStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 20 },
  list: { gap: 4 },
  agentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 },
  agentIconBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  agentInfo: { flex: 1, gap: 2 },
  agentName: { fontSize: 15, fontWeight: '600' },
  agentDesc: { fontSize: 13 },
});
