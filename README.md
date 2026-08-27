# KOTOBA 日语学习

## Vercel 上线准备

本项目把 AI 请求经由 `api/ai.js` 转发到模型服务。浏览器只请求 `/api/ai`，不会获得模型密钥、服务地址或服务端提示词。

### 必填环境变量

在 Vercel 项目 Settings → Environment Variables 中，为 Production、Preview 与 Development 分别配置：

```text
BAILIAN_API_KEY=你的百炼 API Key
BAILIAN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

`BAILIAN_API_KEY` 不得使用 `NEXT_PUBLIC_` 前缀，也不能写入 `data/`、`js/`、HTML 或 Git。

可选地设置 `AI_MODEL_LESSON_PRACTICE`、`AI_MODEL_VOICE_DIALOGUE` 等变量覆盖单项模型；未设置时使用应用内置分流。

### 本地开发

```bash
vercel link
vercel env pull .env.local
npm run dev
```

`.env.local` 仅供本机使用，已被 Git 忽略。普通静态预览仍可使用 `./start.sh`，但 AI 需要 `vercel dev` 才能运行服务端函数。

### 部署前检查

```bash
npm run build
vercel
```

先在 Preview 地址验证 AI 请求；确认后再执行 `vercel --prod`。当前函数包含输入长度限制和按 IP 的基础节流；正式开放多用户前，应接入登录系统及共享的 Redis 限流。
