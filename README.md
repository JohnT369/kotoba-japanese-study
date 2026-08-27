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

## Supabase 登录与学习进度

数据库结构保存在 [`supabase/migrations/20260827094500_create_learning_accounts.sql`](supabase/migrations/20260827094500_create_learning_accounts.sql)。它创建：

- `profiles`：与 Supabase Auth 用户一一对应的个人资料；
- `lesson_progress`：按用户隔离的课程状态和时间戳；
- 自动创建档案的触发器，以及仅允许用户访问自身数据的 RLS 策略。

首次初始化时，在 Supabase Dashboard → SQL Editor → New query 中粘贴并执行该文件的全部内容。之后在 Vercel 的 Production、Preview 和 Development 环境中配置：

```text
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`SUPABASE_PUBLISHABLE_KEY` 只可配合 RLS 在浏览器中使用；不要将 Supabase 的 secret key 或 service role key 写入任何前端文件。

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
