/**
 * Voice screen — real-time voice conversation via WebSocket + Gemini.
 *
 * Audio engine: TURN-COMPLETE BUFFERING
 * ─────────────────────────────────────
 * The user requested returning to a completely seamless playback without mid-sentence 
 * buffering pauses. Gemini's generation speed can vary, so streaming chunk-by-chunk 
 * causes stuttering if the network or model generation slows down mid-response.
 *
 * Solution:
 *  1. Collect all chunks until `turnComplete` fires.
 *  2. Assemble as one WAV and `.playAsync()` at a slightly slower rate (0.95x).
 *  3. After the full audio finishes, enforce a 700ms silence gap before turning
 *     the microphone back on (prevents AI hearing its own echo).
 *  4. Keep chunking tight (300ms intervals, 5 segments = 1.5s silence detection)
 *     so the AI knows quickly when the user stops talking.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { MainTabsParamList } from '@/types';
import { Menu, Square } from 'lucide-react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  setAudioModeAsync,
  RecordingPresets,
  IOSOutputFormat,
  AudioQuality,
} from 'expo-audio';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Config, DEFAULT_AGENT_ID } from '@/constants';
import { useAuth, useTheme } from '@/contexts';
import { pcmChunksToWavBase64 } from '@/utils/voiceAudio';
import { Spacing } from '@/constants';
import { VoiceOrb, type OrbState } from '@/components/voice/VoiceOrb';

type VoiceConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'SAVING';

interface Turn {
  id: string;
  userText: string;
  assistantText: string;
}

function getVoiceStreamUrl(token: string, agentId: string, chatId?: string): string {
  const base = Config.API_BASE_URL;
  const wsScheme = base.startsWith('https') ? 'wss' : 'ws';
  const host = base.replace(/^https?:\/\//, '');
  const params = new URLSearchParams({ token, agent_id: agentId, tools: 'web_search' });
  if (chatId) params.set('chat_id', chatId);
  return `${wsScheme}://${host}/voice/stream?${params.toString()}`;
}

// ── Recording constants ──────────────────────────────────────────────
const CHUNK_INTERVAL_MS = 300;           // Send voice chunks every 300ms
const SILENT_B64_LENGTH_THRESHOLD = 2400; // Adjusted for 300ms length
const SILENT_SEGMENTS_BEFORE_STOP = 5;   // 5 x 300ms = 1.5s silence detection

const VOICE_WAV_PRESET = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  android: RecordingPresets.HIGH_QUALITY.android,
  ios: {
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: RecordingPresets.HIGH_QUALITY.web,
} as const;

async function setupAudioSession(): Promise<void> {
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

/* ------------------------------------------------------------------ */
/*  Status / Orb helpers                                               */
/* ------------------------------------------------------------------ */

function getStatusText(
  connectionState: VoiceConnectionState,
  isListening: boolean,
  isSpeaking: boolean,
  showListening: boolean,
  isSearching: boolean,
): string {
  switch (connectionState) {
    case 'DISCONNECTED': return 'What can I help you with?';
    case 'CONNECTING': return 'Connecting…';
    case 'SAVING': return 'Saving…';
    case 'CONNECTED':
      if (isSearching) return 'Searching the web…';
      if (isSpeaking) return 'Speaking…';
      if (isListening || showListening) return 'Listening…';
      return 'Processing…';
    default: return '';
  }
}

function getOrbState(
  connectionState: VoiceConnectionState,
  isListening: boolean,
  isSpeaking: boolean,
  showListening: boolean,
  isSearching: boolean,
): OrbState {
  if (connectionState === 'CONNECTING') return 'connecting';
  if (connectionState !== 'CONNECTED') return 'idle';
  if (isSearching) return 'connecting';
  if (isSpeaking) return 'speaking';
  if (isListening || showListening) return 'listening';
  return 'connecting'; // pulse while waiting for Gemini to generate audio
}

/* ================================================================== */
/*  VoiceScreen                                                        */
/* ================================================================== */

export function VoiceScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { accessToken } = useAuth();
  const navigation = useNavigation<DrawerNavigationProp<MainTabsParamList, 'Voice'>>();
  const route = useRoute();
  const params = (route.params ?? {}) as { agentId?: string; chatId?: string };
  const agentId = params.agentId ?? DEFAULT_AGENT_ID;
  const chatIdParam = params.chatId;

  const [connectionState, setConnectionState] = useState<VoiceConnectionState>('DISCONNECTED');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streamingTurn, setStreamingTurn] = useState({ user: '', assistant: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showListening, setShowListening] = useState(false);

  /* ── Session refs ────────────────────────────────────────────────── */
  const wsRef = useRef<WebSocket | null>(null);
  const recordingLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endedRef = useRef(false);
  const pendingUserTextRef = useRef('');
  const pendingAssistantTextRef = useRef('');
  const silentSegmentCountRef = useRef(0);
  const isWaitingForResponseRef = useRef(false);
  const audioRecorderRef = useRef<ReturnType<typeof useAudioRecorder> | null>(null);
  const audioSessionReadyRef = useRef(false);
  const turnIdRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introSentRef = useRef(false);

  /* ── Audio buffering ─────────────────────────────────────────────── */
  const audioChunksRef = useRef<string[]>([]);
  const playbackSoundRef = useRef<Audio.Sound | null>(null);
  const engineSessionRef = useRef(0);

  const recordingPreset = Platform.OS === 'ios' ? VOICE_WAV_PRESET : RecordingPresets.HIGH_QUALITY;
  const audioRecorder = useAudioRecorder(recordingPreset);
  audioRecorderRef.current = audioRecorder;
  const recorderState = useAudioRecorderState(audioRecorder);

  const speakerMode = useCallback(() => ({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  }), []);

  const recordingMode = useCallback(() => ({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  }), []);

  const stopPlayback = useCallback(async () => {
    const sound = playbackSoundRef.current;
    if (sound) {
      playbackSoundRef.current = null;
      try { await sound.unloadAsync(); } catch (_) { }
    }
    setIsSpeaking(false);
  }, []);

  const resetAudioEngine = useCallback(() => {
    engineSessionRef.current++;
    audioChunksRef.current = [];
    stopPlayback();
  }, [stopPlayback]);

  /** Write a WAV to disk and return its file:// URI. */
  const writeWavFile = useCallback(async (chunks: string[]): Promise<string | null> => {
    if (chunks.length === 0) return null;
    try {
      const wav = pcmChunksToWavBase64(chunks, 24000);
      if (!wav || wav.length < 100) return null;
      const path = `${FileSystem.cacheDirectory ?? ''}voice-response-${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(path, wav, { encoding: FileSystem.EncodingType.Base64 });
      return path.startsWith('file://') ? path : `file://${path}`;
    } catch (e) {
      console.warn('[AUDIO] writeWavFile error:', e);
      return null;
    }
  }, []);

  /* ── connect ──────────────────────────────────────────────────────── */
  const connect = useCallback(async () => {
    if (!accessToken) { setError('Please sign in to use voice.'); return; }
    setError(null);
    setTurns([]);
    setStreamingTurn({ user: '', assistant: '' });
    setConnectionState('CONNECTING');
    endedRef.current = false;

    resetAudioEngine();

    if (!audioSessionReadyRef.current) {
      try { await setupAudioSession(); audioSessionReadyRef.current = true; }
      catch (e) { console.warn('[AUDIO] setupAudioSession error:', e); }
    }

    const url = getVoiceStreamUrl(accessToken, agentId, chatIdParam);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    const startRecordingLoop = (runFirstImmediate = true) => {
      if (recordingLoopRef.current) return;

      const runSegment = async () => {
        if (endedRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;
        if (isWaitingForResponseRef.current) return;
        const rec = audioRecorderRef.current;
        if (!rec) return;
        try {
          await rec.stop();
          const uri = rec.uri;
          if (uri) {
            const base64 = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const isSilent = base64.length < SILENT_B64_LENGTH_THRESHOLD;
            silentSegmentCountRef.current = isSilent ? silentSegmentCountRef.current + 1 : 0;

            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
            }

            if (silentSegmentCountRef.current >= SILENT_SEGMENTS_BEFORE_STOP) {
              if (recordingLoopRef.current) { clearInterval(recordingLoopRef.current); recordingLoopRef.current = null; }
              isWaitingForResponseRef.current = true;
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'endOfTurn' }));
              }
              return;
            }
          }
          if (endedRef.current || isWaitingForResponseRef.current) return;
          await rec.prepareToRecordAsync();
          if (!endedRef.current && !isWaitingForResponseRef.current) rec.record();
        } catch (e) {
          if (!endedRef.current) console.warn('[VOICE] record chunk error:', e);
        }
      };

      recordingLoopRef.current = setInterval(runSegment, CHUNK_INTERVAL_MS);
      if (runFirstImmediate) runSegment();
    };

    /** Resumes the mic recording loop. Enforces the 700ms silence constraint. */
    const doResumeRecording = async (withDelay = true) => {
      if (withDelay) {
        // 700ms silence delay to prevent mic from picking up speaker output
        await new Promise<void>((resolve) => setTimeout(resolve, 700));
      }

      if (endedRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;

      // Make sure we set the mic audio session
      try { await Audio.setAudioModeAsync(recordingMode()); } catch (_) { }

      isWaitingForResponseRef.current = false;
      silentSegmentCountRef.current = 0;
      setShowListening(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setShowListening(false), 4000);

      const rec = audioRecorderRef.current;
      if (!rec) return;
      try {
        const { granted } = await AudioModule.requestRecordingPermissionsAsync();
        if (!granted) { setError('Microphone permission denied'); return; }
        await rec.prepareToRecordAsync();
        if (!endedRef.current) rec.record();
        startRecordingLoop(false);
      } catch (e) { console.warn('[VOICE] restart record error:', e); }
    };

    ws.onopen = async () => {
      setConnectionState('CONNECTED');
      pendingUserTextRef.current = '';
      pendingAssistantTextRef.current = '';
      setStreamingTurn({ user: '', assistant: '' });
      silentSegmentCountRef.current = 0;
      isWaitingForResponseRef.current = true;

      if (!introSentRef.current) {
        introSentRef.current = true;
        ws.send(JSON.stringify({
          type: 'text',
          data: 'Introduce yourself briefly. Tell the user what you are, what you can help with, and invite them to ask a question. Keep it very short and friendly.',
        }));
      }
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string; role?: string; text?: string;
          data?: string; chat_id?: string; status?: string;
        };

        if (msg.type === 'transcript' && msg.role && msg.text !== undefined) {
          const text = msg.text ?? '';
          if (msg.role === 'user') {
            pendingUserTextRef.current += text;
            setStreamingTurn((prev) => ({ ...prev, user: prev.user + text }));
          }
          if (msg.role === 'assistant') {
            pendingAssistantTextRef.current += text;
            setStreamingTurn((prev) => ({ ...prev, assistant: prev.assistant + text }));
          }

        } else if (msg.type === 'audio' && msg.data) {
          audioChunksRef.current.push(msg.data);

        } else if (msg.type === 'tool_call') {
          setIsSearching(msg.status === 'searching');

        } else if (msg.type === 'turnComplete') {
          setIsSearching(false);
          const userText = pendingUserTextRef.current.trim();
          const assistantText = pendingAssistantTextRef.current.trim();
          pendingUserTextRef.current = '';
          pendingAssistantTextRef.current = '';

          console.log('[TURN] complete. Chunks:', audioChunksRef.current.length);

          setStreamingTurn({ user: '', assistant: '' });
          turnIdRef.current++;
          if (userText || assistantText) {
            setTurns((prev) => [...prev, {
              id: `turn-${turnIdRef.current}-${Date.now()}`,
              userText,
              assistantText,
            }]);
          }

          if (recordingLoopRef.current) { clearInterval(recordingLoopRef.current); recordingLoopRef.current = null; }
          try { await audioRecorderRef.current?.stop(); } catch (_) { }
          isWaitingForResponseRef.current = true;
          silentSegmentCountRef.current = 0;

          const session = engineSessionRef.current;
          const chunks = audioChunksRef.current.splice(0);

          if (chunks.length === 0) {
            // AI gave no voice — resume right away
            doResumeRecording(false);
            return;
          }

          try {
            // Setup speaker mode
            await Audio.setAudioModeAsync(speakerMode());
            const uri = await writeWavFile(chunks);
            if (!uri || session !== engineSessionRef.current) {
              doResumeRecording(false);
              return;
            }

            console.log(`[AUDIO] playing full turn response...`);
            setIsSpeaking(true);

            // Play the entire response slowly (0.95 rate) for seamless "thoughtful" voice pacing.
            const { sound } = await Audio.Sound.createAsync(
              { uri },
              { shouldPlay: true, volume: 1.0, rate: 0.95, shouldCorrectPitch: true },
            );
            playbackSoundRef.current = sound;

            sound.setOnPlaybackStatusUpdate((status) => {
              if (status.isLoaded && status.didJustFinish) {
                if (session === engineSessionRef.current) {
                  console.log('[AUDIO] response finished.');
                  setIsSpeaking(false);
                  playbackSoundRef.current = null;
                  sound.unloadAsync().catch(() => { });
                  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => { });

                  // Turn is fully done, play is over. Now resume the mic recording loop.
                  doResumeRecording(true);
                }
              }
            });

          } catch (e) {
            console.warn('[AUDIO] play full turn error:', e);
            doResumeRecording(false);
          }

        } else if (msg.type === 'interrupted') {
          resetAudioEngine();
          if (recordingLoopRef.current) { clearInterval(recordingLoopRef.current); recordingLoopRef.current = null; }
          setStreamingTurn({ user: '', assistant: '' });
          isWaitingForResponseRef.current = false;
          silentSegmentCountRef.current = 0;
          doResumeRecording(false);

        } else if (msg.type === 'saved' && msg.chat_id) {
          setConnectionState('DISCONNECTED');
          if (recordingLoopRef.current) { clearInterval(recordingLoopRef.current); recordingLoopRef.current = null; }
          wsRef.current = null;
          navigation.navigate('Chat', { chatId: msg.chat_id, agentId });
        }

      } catch (e) { console.warn('[VOICE] message parse error:', e); }
    };

    ws.onerror = () => setError('Connection error. Check network and try again.');
    ws.onclose = () => {
      setConnectionState((s) => (s === 'SAVING' ? s : 'DISCONNECTED'));
      if (recordingLoopRef.current) { clearInterval(recordingLoopRef.current); recordingLoopRef.current = null; }
      wsRef.current = null;
    };
  }, [accessToken, agentId, chatIdParam, audioRecorder, navigation, stopPlayback, resetAudioEngine, recordingMode, speakerMode, writeWavFile]);

  const endConversation = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      endedRef.current = true;
      setConnectionState('SAVING');
      if (recordingLoopRef.current) { clearInterval(recordingLoopRef.current); recordingLoopRef.current = null; }
      audioRecorder.stop().catch(() => { });
      wsRef.current.send(JSON.stringify({ type: 'end' }));
    }
  }, [audioRecorder]);

  useEffect(() => {
    return () => {
      if (recordingLoopRef.current) clearInterval(recordingLoopRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
      stopPlayback();
    };
  }, [stopPlayback]);

  const connectCalledRef = useRef(false);
  useEffect(() => {
    if (accessToken && !connectCalledRef.current) {
      connectCalledRef.current = true;
      connect();
    }
  }, [accessToken, connect]);

  /* ── Derived state ────── */
  const isListening = connectionState === 'CONNECTED' && recorderState.isRecording;
  const isConnected = connectionState === 'CONNECTED';
  const isSaving = connectionState === 'SAVING';
  const orbState = getOrbState(connectionState, isListening, isSpeaking, showListening, isSearching);
  const statusText = getStatusText(connectionState, isListening, isSpeaking, showListening, isSearching);
  const bgColor = colors.background;

  return (
    <View style={[styles.root, { backgroundColor: bgColor, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => navigation.openDrawer()} activeOpacity={0.7}>
          <Menu size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.centerSection}>
        <View style={styles.orbTouchable}>
          <VoiceOrb state={orbState} size={160} isDark={isDark} />
        </View>
        <View style={styles.statusContainer}>
          {connectionState === 'CONNECTING' ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginBottom: 8 }} />
          ) : null}
          <Text style={[styles.statusText, { color: colors.textSecondary }]} numberOfLines={1}>
            {statusText}
          </Text>
        </View>
        {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 32) }]}>
        {(isConnected || isSaving) ? (
          <TouchableOpacity
            style={[styles.stopBtn, { backgroundColor: isDark ? '#1E1A2E' : colors.surfaceSecondary }]}
            onPress={endConversation}
            disabled={isSaving}
            activeOpacity={0.7}
          >
            {isSaving
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Square size={18} color={colors.text} fill={colors.text} />}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 12 },
  menuBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  centerSection: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  orbTouchable: { alignItems: 'center', justifyContent: 'center' },
  statusContainer: { alignItems: 'center', marginTop: 24, paddingHorizontal: 24, minHeight: 50 },
  statusText: { fontSize: 17, lineHeight: 24, textAlign: 'center' },
  errorText: { marginTop: 12, fontSize: 14, textAlign: 'center' },
  footer: { alignItems: 'center', paddingTop: Spacing.md },
  stopBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  hintText: { fontSize: 14, fontWeight: '400' },
});