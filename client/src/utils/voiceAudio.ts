/**
 * Voice audio utilities: build WAV from raw PCM (e.g. 24kHz from Gemini) for playback.
 *
 * Uses a self-contained pure-JS base64 codec (no atob/btoa globals) so this works
 * reliably on Hermes / React Native regardless of polyfill load order.
 */

const WAV_HEADER_LEN = 44;

// Pure-JS base64 alphabet — no reliance on atob/btoa globals
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const B64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < 65; i++) B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;

function base64ToBytes(b64: string): Uint8Array {
  // Strip any whitespace / newlines that may appear in the base64 string
  const s = b64.replace(/[\s=]+$/, '');
  const len = s.length;
  const outputLen = Math.floor((len * 3) / 4);
  const out = new Uint8Array(outputLen);
  let outIdx = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_LOOKUP[s.charCodeAt(i)] ?? 0;
    const b = B64_LOOKUP[s.charCodeAt(i + 1)] ?? 0;
    const c = B64_LOOKUP[s.charCodeAt(i + 2)] ?? 0;
    const d = B64_LOOKUP[s.charCodeAt(i + 3)] ?? 0;
    out[outIdx++] = (a << 2) | (b >> 4);
    if (s[i + 2] !== '=') out[outIdx++] = ((b & 0x0f) << 4) | (c >> 2);
    if (s[i + 3] !== '=') out[outIdx++] = ((c & 0x03) << 6) | d;
  }
  return out.subarray(0, outIdx);
}

function bytesToBase64(bytes: Uint8Array): string {
  const len = bytes.length;
  let result = '';
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;
    result += B64_CHARS[a >> 2];
    result += B64_CHARS[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < len ? B64_CHARS[((b & 0xf) << 2) | (c >> 6)] : '=';
    result += i + 2 < len ? B64_CHARS[c & 0x3f] : '=';
  }
  return result;
}

export function buildWavBuffer(
  pcmBytes: Uint8Array,
  sampleRate: number = 24000,
  numChannels: number = 1
): ArrayBuffer {
  const bytesPerSample = 2;
  const dataLen = pcmBytes.length;
  const byteRate = sampleRate * numChannels * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;

  const buf = new ArrayBuffer(WAV_HEADER_LEN + dataLen);
  const view = new DataView(buf);
  let offset = 0;

  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    offset += s.length;
  };
  const writeU32 = (v: number) => { view.setUint32(offset, v, true); offset += 4; };
  const writeU16 = (v: number) => { view.setUint16(offset, v, true); offset += 2; };

  writeStr('RIFF');
  writeU32(36 + dataLen);
  writeStr('WAVE');
  writeStr('fmt ');
  writeU32(16);
  writeU16(1); // PCM
  writeU16(numChannels);
  writeU32(sampleRate);
  writeU32(byteRate);
  writeU16(blockAlign);
  writeU16(16); // 16-bit
  writeStr('data');
  writeU32(dataLen);
  new Uint8Array(buf).set(pcmBytes, WAV_HEADER_LEN);

  return buf;
}

export function pcmChunksToWavBase64(chunks: string[], sampleRate = 24000): string {
  if (chunks.length === 0) return '';

  const parts = chunks.map((chunk, i) => {
    const decoded = base64ToBytes(chunk);
    console.log(`[voiceAudio] chunk[${i}] b64_len=${chunk.length} pcm_bytes=${decoded.length}`);
    return decoded;
  });

  const totalLen = parts.reduce((s, p) => s + p.length, 0);
  console.log(`[voiceAudio] total PCM bytes=${totalLen} sampleRate=${sampleRate}`);

  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) { combined.set(p, offset); offset += p.length; }

  const wavBase64 = bytesToBase64(new Uint8Array(buildWavBuffer(combined, sampleRate, 1)));
  console.log(`[voiceAudio] WAV base64 length=${wavBase64.length}`);
  return wavBase64;
}

export function pcmBase64ToWavBase64(pcmBase64: string, sampleRate = 24000): string {
  return bytesToBase64(new Uint8Array(buildWavBuffer(base64ToBytes(pcmBase64), sampleRate, 1)));
}