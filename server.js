/* ============================================================
   Edge TTS 代理服务器
   代理 Microsoft Edge 云端神经语音服务
   端口: 3001
   依赖: edge-tts (pip3 install edge-tts)
   ============================================================ */

const http = require('http');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3001;

// 可用的日语音色列表
const JAPANESE_VOICES = [
  'ja-JP-NanamiNeural',
  'ja-JP-KeitaNeural',
  'ja-JP-AoiNeural',
  'ja-JP-DaichiNeural',
  'ja-JP-MayuNeural',
  'ja-JP-ShioriNeural',
  'ja-JP-YunxiNeural',
  'ja-JP-HarukaNeural'
];

function listVoices(res) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(JAPANESE_VOICES));
}

function synthesize(text, voice, rate, pitch, volume, res) {
  const tmpFile = path.join(os.tmpdir(), `edge-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);

  const args = [
    '-m', 'edge_tts',
    '--text', text,
    '--voice', voice,
    '--write-media', tmpFile
  ];

  if (rate && rate !== 'default') {
    args.push('--rate', rate);
  }
  if (pitch && pitch !== 'default') {
    args.push('--pitch', pitch);
  }
  if (volume && volume !== 'default') {
    args.push('--volume', volume);
  }

  execFile('python3', args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      console.error('Edge TTS Error:', error.message);
      console.error('stderr:', stderr);
      if (res.writableEnded) return;
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Edge TTS 错误: ${stderr || error.message}`);
      return;
    }

    // 检查文件是否存在
    if (!fs.existsSync(tmpFile)) {
      if (res.writableEnded) return;
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('音频文件生成失败');
      return;
    }

    // 读取生成的音频文件
    fs.readFile(tmpFile, (err, audioData) => {
      if (err) {
        if (res.writableEnded) return;
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('读取音频文件失败');
        return;
      }

      if (audioData.length === 0) {
        if (res.writableEnded) return;
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('音频文件为空');
        return;
      }

      // 返回音频
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioData.length,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      });
      res.end(audioData);

      // 异步清理临时文件
      fs.unlink(tmpFile, () => {});
    });
  });
}

const server = http.createServer((req, res) => {
  // CORS 支持
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // 获取可用音色列表
  if (url.pathname === '/api/voices') {
    listVoices(res);
    return;
  }

  // TTS 合成
  if (url.pathname === '/api/tts') {
    const text = url.searchParams.get('text');
    const voice = url.searchParams.get('voice') || 'ja-JP-NanamiNeural';
    const rate = url.searchParams.get('rate') || 'default';
    const pitch = url.searchParams.get('pitch') || 'default';
    const volume = url.searchParams.get('volume') || 'default';

    if (!text || text.trim() === '') {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('缺少文本参数');
      return;
    }

    // 限制文本长度
    if (text.length > 2000) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('文本过长（最大 2000 字符）');
      return;
    }

    synthesize(text.trim(), voice, rate, pitch, volume, res);
    return;
  }

  // 健康检查
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'edge-tts-proxy', port: PORT }));
    return;
  }

  // 首页信息
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <h1>Edge TTS 代理服务器</h1>
      <p>端口: ${PORT}</p>
      <ul>
        <li><a href="/health">健康检查</a></li>
        <li><a href="/api/voices">可用音色</a></li>
        <li><a href="/api/tts?text=こんにちは&voice=ja-JP-NanamiNeural">测试合成</a></li>
      </ul>
    `);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`\n🚀 Edge TTS 代理服务已启动: http://localhost:${PORT}`);
  console.log(`🎙️  可用音色列表: http://localhost:${PORT}/api/voices`);
  console.log(`🔊 TTS 合成示例: http://localhost:${PORT}/api/tts?text=こんにちは&voice=ja-JP-NanamiNeural\n`);
});
