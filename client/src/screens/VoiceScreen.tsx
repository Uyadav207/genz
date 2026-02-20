/**
 * Voice screen — real-time voice conversation via WebSocket + Gemini.
 *
 * Audio approach:
 * - Recording: expo-audio (useAudioRecorder) → WAV chunks → backend
 * - Playback: expo-av (Audio.Sound) → WAV file from PCM chunks
 *
 * Key rules:
 * 1. setAudioModeAsync from expo-audio is called ONCE for recording setup
 * 2. Audio.setAudioModeAsync from expo-av is called ONCE for playback setup
 * 3. Neither is called again during the session
 *
 * UI: Beautiful animated orb with a simple stop button — inspired by
 * the warm yellow-green sphere voice interface design.
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

const CHUNK_INTERVAL_MS = 1500;
const SILENT_B64_LENGTH_THRESHOLD = 8000;
const SILENT_SEGMENTS_BEFORE_STOP = 2;

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

// Called once before any session starts — sets up both recording and playback audio session
async function setupAudioSession(): Promise<void> {
  // expo-audio: enables recording on iOS
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });
  // expo-av: enables playback in silent mode on iOS
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

/* ------------------------------------------------------------------ */
/*  Status messages                                                    */
/* ------------------------------------------------------------------ */

function getStatusText(
  connectionState: VoiceConnectionState,
  isListening: boolean,
  isSpeaking: boolean,
  showListening: boolean,
  isSearching: boolean,
): string {
  switch (connectionState) {
    case 'DISCONNECTED':
      return 'What can I help you with?';
    case 'CONNECTING':
      return 'Connecting…';
    case 'SAVING':
      return 'Saving…';
    case 'CONNECTED':
      if (isSearching) return 'Searching the web…';
      if (isSpeaking) return 'Speaking…';
      if (isListening || showListening) return 'Listening…';
      return 'What can I help you with?';
    default:
      return '';
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
  if (isSearching) return 'connecting'; // pulsing state while searching
  if (isSpeaking) return 'speaking';
  if (isListening || showListening) return 'listening';
  return 'idle';
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
  /** When true, the assistant is searching the web for information */
  const [isSearching, setIsSearching] = useState(false);
  /** When true, show "Listening…" even if recorder hasn't restarted yet */
  const [showListening, setShowListening] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const recordingLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endedRef = useRef(false);
  const pendingUserTextRef = useRef('');
  const pendingAssistantTextRef = useRef('');
  const silentSegmentCountRef = useRef(0);
  const isWaitingForResponseRef = useRef(false);
  const audioRecorderRef = useRef<ReturnType<typeof useAudioRecorder> | null>(null);
  const audioChunksRef = useRef<string[]>([]);
  const playbackSoundRef = useRef<Audio.Sound | null>(null);
  const audioSessionReadyRef = useRef(false);
  const turnIdRef = useRef(0);
  const resumeRecordingRef = useRef<(() => void) | null>(null);
  /** Timer to revert from "Listening…" to idle after ~4s of silence */
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether the intro text has been sent this session */
  const introSentRef = useRef(false);

  const recordingPreset = Platform.OS === 'ios' ? VOICE_WAV_PRESET : RecordingPresets.HIGH_QUALITY;
  const audioRecorder = useAudioRecorder(recordingPreset);
  audioRecorderRef.current = audioRecorder;
  const recorderState = useAudioRecorderState(audioRecorder);

  // Unload any playing sound safely
  const stopPlayback = useCallback(async () => {
    const sound = playbackSoundRef.current;
    if (sound) {
      playbackSoundRef.current = null;
      try { await sound.unloadAsync(); } catch (_) { }
    }
    setIsSpeaking(false);
  }, []);

  // Playback config
  const recordingMode = useCallback(() => ({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  }), []);

  // Play a WAV file from a file URI
  const playWavFile = useCallback(async (uri: string) => {
    await stopPlayback();
    try {
      console.log('[AUDIO] Setting playback mode (no recording) for speaker output');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      console.log('[AUDIO] Loading sound:', uri);
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 1.0 }
      );
      playbackSoundRef.current = sound;
      setIsSpeaking(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          console.log('[AUDIO] Playback finished');
          setIsSpeaking(false);
          playbackSoundRef.current = null;
          sound.unloadAsync().catch(() => { });
          FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => { });

          // Restore recording mode
          console.log('[AUDIO] Restoring recording mode');
          Audio.setAudioModeAsync(recordingMode()).then(() => {
            resumeRecordingRef.current?.();
            resumeRecordingRef.current = null;
          }).catch((e) => {
            console.warn('[AUDIO] Failed to restore recording mode:', e);
            resumeRecordingRef.current?.();
            resumeRecordingRef.current = null;
          });
        }
      });
    } catch (e) {
      console.warn('[AUDIO] playWavFile error:', e);
      setIsSpeaking(false);
      Audio.setAudioModeAsync(recordingMode()).then(() => {
        resumeRecordingRef.current?.();
        resumeRecordingRef.current = null;
      }).catch(() => {
        resumeRecordingRef.current?.();
        resumeRecordingRef.current = null;
      });
    }
  }, [stopPlayback, recordingMode]);

  const connect = useCallback(async () => {
    if (!accessToken) {
      setError('Please sign in to use voice.');
      return;
    }
    setError(null);
    setTurns([]);
    setStreamingTurn({ user: '', assistant: '' });
    setConnectionState('CONNECTING');
    endedRef.current = false;

    // Setup audio session once per session
    if (!audioSessionReadyRef.current) {
      try {
        await setupAudioSession();
        audioSessionReadyRef.current = true;
      } catch (e) {
        console.warn('[AUDIO] setupAudioSession error:', e);
      }
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
            silentSegmentCountRef.current = isSilent
              ? silentSegmentCountRef.current + 1
              : 0;

            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
            }

            if (silentSegmentCountRef.current >= SILENT_SEGMENTS_BEFORE_STOP) {
              if (recordingLoopRef.current) {
                clearInterval(recordingLoopRef.current);
                recordingLoopRef.current = null;
              }
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

    ws.onopen = async () => {
      setConnectionState('CONNECTED');
      pendingUserTextRef.current = '';
      pendingAssistantTextRef.current = '';
      setStreamingTurn({ user: '', assistant: '' });
      audioChunksRef.current = [];
      silentSegmentCountRef.current = 0;
      isWaitingForResponseRef.current = true; // Wait for intro to finish before recording

      // Send intro text prompt — Gemini will respond with a voice intro
      if (!introSentRef.current) {
        introSentRef.current = true;
        ws.send(JSON.stringify({
          type: 'text',
          data: 'Introduce yourself briefly. Tell the user what you are, what you can help with, and invite them to ask a question. Keep it very short and friendly (2-3 sentences max).',
        }));
      }
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          role?: string;
          text?: string;
          data?: string;
          chat_id?: string;
          status?: string;
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
          // Voice assistant is calling a tool (e.g. web_search)
          if (msg.status === 'searching') {
            setIsSearching(true);
            console.log('[VOICE] Tool call: searching the web...');
          } else if (msg.status === 'done') {
            setIsSearching(false);
            console.log('[VOICE] Tool call: search done, waiting for audio response');
          }

        } else if (msg.type === 'turnComplete') {
          setIsSearching(false); // Ensure searching state is cleared
          const userText = pendingUserTextRef.current.trim();
          const assistantText = pendingAssistantTextRef.current.trim();
          pendingUserTextRef.current = '';
          pendingAssistantTextRef.current = '';

          const chunks = [...audioChunksRef.current];
          audioChunksRef.current = [];

          console.log('[TURN] chunks:', chunks.length, '| user:', userText.length, '| assistant:', assistantText.length);

          // Play audio
          if (chunks.length > 0) {
            try {
              const wavBase64 = pcmChunksToWavBase64(chunks, 24000);
              console.log('[AUDIO] wavBase64 length:', wavBase64.length);

              if (wavBase64 && wavBase64.length > 100) {
                const cacheDir = FileSystem.cacheDirectory ?? '';
                const filePath = `${cacheDir}voice-${Date.now()}.wav`;
                await FileSystem.writeAsStringAsync(filePath, wavBase64, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
                console.log('[AUDIO] playing:', uri);
                await playWavFile(uri);
              } else {
                console.warn('[AUDIO] wavBase64 too short, skipping playback:', wavBase64.length);
              }
            } catch (e) {
              console.warn('[AUDIO] turnComplete playback error:', e);
              setIsSpeaking(false);
            }
          } else {
            console.warn('[AUDIO] no chunks at turnComplete');
          }

          setStreamingTurn({ user: '', assistant: '' });
          turnIdRef.current += 1;

          if (userText || assistantText) {
            setTurns((prev) => [...prev, {
              id: `turn-${turnIdRef.current}-${Date.now()}`,
              userText,
              assistantText,
            }]);
          }

          // Stop recording during playback
          if (recordingLoopRef.current) {
            clearInterval(recordingLoopRef.current);
            recordingLoopRef.current = null;
          }
          const rec = audioRecorderRef.current;
          try { await rec?.stop(); } catch (_) { }

          isWaitingForResponseRef.current = true;
          silentSegmentCountRef.current = 0;

          const hasAudio = chunks.length > 0;
          const doResumeRecording = async () => {
            isWaitingForResponseRef.current = false;
            silentSegmentCountRef.current = 0;

            // Show "Listening…" right after audio finishes
            setShowListening(true);
            // Start a 4-second idle timer — if no new audio is detected, revert to idle
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            idleTimerRef.current = setTimeout(() => {
              setShowListening(false);
            }, 4000);

            if (endedRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;

            // Start recording if not already started (e.g. after intro)
            const rec = audioRecorderRef.current;
            if (!rec) return;
            try {
              const { granted } = await AudioModule.requestRecordingPermissionsAsync();
              if (!granted) {
                setError('Microphone permission denied');
                return;
              }
              await rec.prepareToRecordAsync();
              if (!endedRef.current) rec.record();
              startRecordingLoop(false);
            } catch (e) {
              console.warn('[VOICE] restart record error:', e);
            }
          };
          if (!hasAudio) {
            doResumeRecording();
          } else {
            resumeRecordingRef.current = doResumeRecording;
          }

        } else if (msg.type === 'interrupted') {
          if (recordingLoopRef.current) {
            clearInterval(recordingLoopRef.current);
            recordingLoopRef.current = null;
          }
          audioChunksRef.current = [];
          setStreamingTurn({ user: '', assistant: '' });
          await stopPlayback();
          isWaitingForResponseRef.current = false;
          silentSegmentCountRef.current = 0;
          const recOnInterrupt = audioRecorderRef.current;
          if (recOnInterrupt && !endedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            recOnInterrupt.prepareToRecordAsync()
              .then(() => {
                if (!endedRef.current) recOnInterrupt.record();
                startRecordingLoop(false);
              })
              .catch(() => { });
          }

        } else if (msg.type === 'saved' && msg.chat_id) {
          setConnectionState('DISCONNECTED');
          if (recordingLoopRef.current) {
            clearInterval(recordingLoopRef.current);
            recordingLoopRef.current = null;
          }
          wsRef.current = null;
          navigation.navigate('Chat', { chatId: msg.chat_id, agentId });
        }
      } catch (e) {
        console.warn('[VOICE] message parse error:', e);
      }
    };

    ws.onerror = () => setError('Connection error. Check network and try again.');
    ws.onclose = () => {
      setConnectionState((s) => (s === 'SAVING' ? s : 'DISCONNECTED'));
      if (recordingLoopRef.current) {
        clearInterval(recordingLoopRef.current);
        recordingLoopRef.current = null;
      }
      wsRef.current = null;
    };
  }, [accessToken, agentId, chatIdParam, audioRecorder, navigation, stopPlayback, playWavFile]);

  const endConversation = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      endedRef.current = true;
      setConnectionState('SAVING');
      if (recordingLoopRef.current) {
        clearInterval(recordingLoopRef.current);
        recordingLoopRef.current = null;
      }
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

  // Auto-connect when the screen mounts
  const connectCalledRef = useRef(false);
  useEffect(() => {
    if (accessToken && !connectCalledRef.current) {
      connectCalledRef.current = true;
      connect();
    }
  }, [accessToken, connect]);

  /* ---- derived state ---- */
  const isListening = connectionState === 'CONNECTED' && recorderState.isRecording;
  const isConnected = connectionState === 'CONNECTED';
  const isSaving = connectionState === 'SAVING';
  const orbState = getOrbState(connectionState, isListening, isSpeaking, showListening, isSearching);

  // Status text — simple labels only, no transcript
  const statusText = getStatusText(connectionState, isListening, isSpeaking, showListening, isSearching);

  // Use theme background
  const bgColor = colors.background;

  return (
    <View style={[styles.root, { backgroundColor: bgColor, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => navigation.openDrawer()} activeOpacity={0.7}>
          <Menu size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Center: Orb + Status */}
      <View style={styles.centerSection}>
        <View style={styles.orbTouchable}>
          <VoiceOrb state={orbState} size={160} isDark={isDark} />
        </View>

        {/* Status label */}
        <View style={styles.statusContainer}>
          {connectionState === 'CONNECTING' ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginBottom: 8 }} />
          ) : null}
          <Text
            style={[
              styles.statusText,
              { color: colors.textSecondary },
            ]}
            numberOfLines={1}
          >
            {statusText}
          </Text>
        </View>

        {error ? (
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        ) : null}
      </View>

      {/* Footer: stop button (only shown when connected) */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 32) }]}>
        {(isConnected || isSaving) ? (
          <TouchableOpacity
            style={[styles.stopBtn, { backgroundColor: isDark ? '#1E1A2E' : colors.surfaceSecondary }]}
            onPress={endConversation}
            disabled={isSaving}
            activeOpacity={0.7}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Square size={18} color={colors.text} fill={colors.text} />
            )}
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
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  orbTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusContainer: {
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
    minHeight: 50,
  },
  statusText: {
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingTop: Spacing.md,
  },
  stopBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    fontSize: 14,
    fontWeight: '400',
  },
});