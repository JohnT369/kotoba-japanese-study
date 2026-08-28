/* Edge Neural TTS proxy.
 * Audio is synthesized on the server because the Edge service requires
 * WebSocket headers that normal browsers cannot set. */

const { EdgeTTS } = require('node-edge-tts');
const { promises: fs } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const JAPANESE_VOICES = new Set([
  'ja-JP-NanamiNeural', 'ja-JP-KeitaNeural', 'ja-JP-AoiNeural', 'ja-JP-DaichiNeural',
  'ja-JP-MayuNeural', 'ja-JP-ShioriNeural', 'ja-JP-YunxiNeural', 'ja-JP-HarukaNeural'
]);
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 36;
const requestWindows = new Map();

function sendJson(res, status, payload) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(payload);
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket && req.socket.remoteAddress || 'unknown');
}

function isRateLimited(req) {
  const now = Date.now();
  const key = clientKey(req);
  const active = (requestWindows.get(key) || []).filter(function (time) { return now - time < WINDOW_MS; });
  if (active.length >= MAX_REQUESTS_PER_WINDOW) {
    requestWindows.set(key, active);
    return true;
  }
  active.push(now);
  requestWindows.set(key, active);
  return false;
}

function prosody(value, pattern) {
  const normalized = String(value || 'default');
  return pattern.test(normalized) ? normalized : 'default';
}

async function synthesize(text, voice, rate, pitch, volume) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kotoba-edge-'));
  const audioPath = path.join(directory, 'speech.mp3');
  try {
    const tts = new EdgeTTS({
      voice: voice,
      lang: 'ja-JP',
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
      rate: rate,
      pitch: pitch,
      volume: volume,
      timeout: 25000
    });
    await tts.ttsPromise(text, audioPath);
    const audio = await fs.readFile(audioPath);
    if (audio.length < 1024) throw new Error('Edge TTS returned empty audio');
    return audio;
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: '仅支持 GET 请求。' });
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('health') === '1') return sendJson(res, 200, { ok: true, engine: 'edge-neural' });

  const text = String(url.searchParams.get('text') || '').trim();
  if (!text) return sendJson(res, 400, { ok: false, error: '缺少朗读文本。' });
  if (text.length > 600) return sendJson(res, 413, { ok: false, error: '单次朗读最多 600 个字符。' });
  if (isRateLimited(req)) return sendJson(res, 429, { ok: false, error: '朗读请求过于频繁，请稍后再试。' });

  const requestedVoice = String(url.searchParams.get('voice') || 'ja-JP-NanamiNeural');
  const voice = JAPANESE_VOICES.has(requestedVoice) ? requestedVoice : 'ja-JP-NanamiNeural';
  const rate = prosody(url.searchParams.get('rate'), /^(?:default|[+-]\d{1,3}%)$/);
  const pitch = prosody(url.searchParams.get('pitch'), /^(?:default|[+-]\d{1,3}Hz)$/);
  const volume = prosody(url.searchParams.get('volume'), /^(?:default|[+-]\d{1,3}%)$/);

  try {
    const audio = await synthesize(text, voice, rate, pitch, volume);
    res.status(200);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(audio);
  } catch (error) {
    console.error('Edge TTS synthesis failed', { message: error && error.message });
    sendJson(res, 502, { ok: false, error: 'Edge 朗读服务暂时不可用，请稍后重试。' });
  }
};
