/* ============================================================
   tts.js - 双引擎语音合成 (Edge TTS + Web Speech API)
   暴露全局对象：window.TTS
   引擎优先级：Edge TTS (神经高质量) > Web Speech API (降级)
   提供：
     - speak(text, opts)：朗读，自动取消上一次
     - stop()：停止
     - isSupported()：是否支持
     - getVoices()：可用音色列表
     - setEngine(engine)：切换引擎 ('edge' | 'web' | 'auto')
     - getEngine()：获取当前引擎
     - setVoice(voice)：设置 Edge TTS 音色
     - getEdgeVoices()：获取 Edge TTS 可用音色
   ============================================================ */

(function () {
  'use strict';

  // 本机开发可使用 Python Edge TTS 代理；线上部署时直接降级至浏览器语音，
  // 避免公开站点向访问者本机的 localhost 发送无效请求。
  const IS_LOCAL = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  const EDGE_TTS_PROXY = IS_LOCAL ? 'http://localhost:3001' : '';
  const EDGE_TIMEOUT = 5000;

  let currentEngine = 'auto';
  let currentEdgeVoice = 'ja-JP-NanamiNeural';
  let edgeAvailable = null;

  let lastAudio = null;
  let isSpeaking = false;
  let cancelRequested = false;
  let lastUtterance = null;

  function isSupported() {
    return true;
  }

  async function checkEdgeTTS() {
    if (edgeAvailable !== null) return edgeAvailable;
    if (!EDGE_TTS_PROXY) {
      edgeAvailable = false;
      return false;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), EDGE_TIMEOUT);
      const res = await fetch(EDGE_TTS_PROXY + '/health', { signal: controller.signal });
      clearTimeout(timeoutId);
      edgeAvailable = res.ok;
    } catch (e) {
      edgeAvailable = false;
    }
    return edgeAvailable;
  }

  async function speakWithEdge(text, opts) {
    const voice = opts.voice || currentEdgeVoice;
    const rate = opts.rate != null ? opts.rate : 'default';
    const pitch = opts.pitch != null ? opts.pitch : 'default';
    const volume = opts.volume != null ? opts.volume : 'default';

    const url = `${EDGE_TTS_PROXY}/api/tts?text=${encodeURIComponent(text)}&voice=${voice}&rate=${rate}&pitch=${pitch}&volume=${volume}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error('Edge TTS HTTP ' + response.status);

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (lastAudio) {
        lastAudio.pause();
        URL.revokeObjectURL(lastAudio.src);
      }

      const audio = new Audio(audioUrl);
      lastAudio = audio;

      audio.onplay = function () {
        isSpeaking = true;
        if (opts.onstart) opts.onstart();
      };

      audio.onended = function () {
        isSpeaking = false;
        URL.revokeObjectURL(audioUrl);
        if (lastAudio === audio) lastAudio = null;
        if (opts.onend) opts.onend();
      };

      audio.onerror = function () {
        isSpeaking = false;
        URL.revokeObjectURL(audioUrl);
        if (lastAudio === audio) lastAudio = null;
        if (opts.onerror) opts.onerror();
      };

      audio.play();
      return true;
    } catch (e) {
      clearTimeout(timeoutId);
      edgeAvailable = false;
      return false;
    }
  }

  function speakWithWebSpeech(text, opts) {
    if (!('speechSynthesis' in window)) return false;

    cancelRequested = true;
    try { window.speechSynthesis.cancel(); } catch (e) {}

    setTimeout(function () {
      cancelRequested = false;
      isSpeaking = true;

      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = opts.lang || 'ja-JP';
      u.rate = opts.rate != null ? opts.rate : 0.9;
      u.pitch = opts.pitch != null ? opts.pitch : 1;
      u.volume = opts.volume != null ? opts.volume : 1;

      const voices = window.speechSynthesis.getVoices() || [];
      const jaVoice = voices.find(function (v) {
        return /ja/i.test(v.lang) && v.localService;
      }) || voices.find(function (v) {
        return /ja/i.test(v.lang);
      });
      if (jaVoice) { try { u.voice = jaVoice; } catch (e) {} }

      if (opts.onstart) u.onstart = opts.onstart;
      u.onend = function () {
        isSpeaking = false;
        if (opts.onend) opts.onend();
      };
      u.onerror = function (e) {
        isSpeaking = false;
        if (e.error !== 'canceled' && e.error !== 'interrupted') {
          console.warn('Web Speech Error:', e.error);
        }
        if (opts.onerror) opts.onerror(e);
      };

      lastUtterance = u;
      window.speechSynthesis.speak(u);
    }, 50);

    return true;
  }

  async function speak(text, opts) {
    if (!text) return;
    opts = opts || {};

    stop();

    if (currentEngine === 'web') {
      speakWithWebSpeech(text, opts);
      return;
    }

    const useEdge = currentEngine === 'edge' || (currentEngine === 'auto' && await checkEdgeTTS());

    if (useEdge) {
      const success = await speakWithEdge(text, opts);
      if (!success && currentEngine === 'auto') {
        speakWithWebSpeech(text, opts);
      }
    } else {
      speakWithWebSpeech(text, opts);
    }
  }

  function stop() {
    cancelRequested = true;
    isSpeaking = false;

    if (lastAudio) {
      lastAudio.pause();
      lastAudio.currentTime = 0;
      try { URL.revokeObjectURL(lastAudio.src); } catch (e) {}
      lastAudio = null;
    }

    try { window.speechSynthesis.cancel(); } catch (e) {}
    lastUtterance = null;
  }

  function setEngine(engine) {
    currentEngine = engine;
    if (engine === 'edge') {
      checkEdgeTTS().then(function (ok) {
        if (!ok) console.warn('Edge TTS 代理未启动，请运行: node server.js');
      });
    }
  }

  function getEngine() {
    return currentEngine;
  }

  function setVoice(voice) {
    currentEdgeVoice = voice;
  }

  function getVoice() {
    return currentEdgeVoice;
  }

  function getJaVoices() {
    if (!('speechSynthesis' in window)) return [];
    const voices = window.speechSynthesis.getVoices() || [];
    return voices.filter(function (v) {
      return /ja/i.test(v.lang);
    });
  }

  async function getEdgeVoices() {
    if (!EDGE_TTS_PROXY) return [];
    try {
      const res = await fetch(EDGE_TTS_PROXY + '/api/voices');
      if (res.ok) return await res.json();
      return [];
    } catch (e) {
      return [];
    }
  }

  if ('speechSynthesis' in window && typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = function () {};
  }

  window.TTS = {
    isSupported: isSupported,
    speak: speak,
    stop: stop,
    getJaVoices: getJaVoices,
    getEdgeVoices: getEdgeVoices,
    setEngine: setEngine,
    getEngine: getEngine,
    setVoice: setVoice,
    getVoice: getVoice,
    isSpeaking: function () { return isSpeaking; },
    EDGE_VOICES: [
      { name: 'ja-JP-NanamiNeural', label: 'Nanami (温柔女声)', gender: 'female' },
      { name: 'ja-JP-KeitaNeural', label: 'Keita (沉稳男声)', gender: 'male' },
      { name: 'ja-JP-AoiNeural', label: 'Aoi (活力女声)', gender: 'female' },
      { name: 'ja-JP-DaichiNeural', label: 'Daichi (商务男声)', gender: 'male' },
      { name: 'ja-JP-MayuNeural', label: 'Mayu (童声女声)', gender: 'female' },
      { name: 'ja-JP-ShioriNeural', label: 'Shiori (新闻女声)', gender: 'female' },
      { name: 'ja-JP-YunxiNeural', label: 'Yunxi (戏剧男声)', gender: 'male' },
      { name: 'ja-JP-HarukaNeural', label: 'Haruka (亲切女声)', gender: 'female' }
    ]
  };

  checkEdgeTTS().then(function (ok) {
    if (ok) {
      console.log('%c[Edge TTS] 已连接神经语音服务', 'color:#10b981;font-weight:bold');
    } else {
      console.log('%c[Edge TTS] 代理未启动，降级到 Web Speech API', 'color:#f59e0b');
      console.log('  运行命令: node server.js');
    }
  });
})();
