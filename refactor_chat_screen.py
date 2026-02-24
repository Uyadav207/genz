import codecs

with codecs.open('/Users/utkarshyadav/Desktop/GenZ/client/src/screens/ChatScreen.tsx', 'r', 'utf-8') as f:
    lines = f.readlines()

new_header = """/**
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

"""

out = []
header_written = False
in_msg_styles = False

for line in lines:
    if line.startswith('export function ChatScreen() {'):
        out.append(new_header)
        out.append(line)
        header_written = True
        continue
    if not header_written:
        continue
    
    if line.startswith('const msgStyles = StyleSheet.create({'):
        in_msg_styles = True
        continue
    
    if in_msg_styles:
        pass
    else:
        out.append(line)

with codecs.open('/Users/utkarshyadav/Desktop/GenZ/client/src/screens/ChatScreen.tsx', 'w', 'utf-8') as f:
    f.writelines(out)
