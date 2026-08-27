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

## Supabase 登录、学习进度与课程资料

数据库结构保存在以下迁移中：

- `profiles`：与 Supabase Auth 用户一一对应的个人资料；
- `lesson_progress`：按用户隔离的课程状态和时间戳；
- `user_course_state`：按用户隔离的自建课程和课程编辑留存；
- 自动创建档案的触发器，以及仅允许用户访问自身数据的 RLS 策略。

先后执行 [`20260827094500_create_learning_accounts.sql`](supabase/migrations/20260827094500_create_learning_accounts.sql) 与 [`20260827113000_add_user_course_content_state.sql`](supabase/migrations/20260827113000_add_user_course_content_state.sql)。所有这三类表均启用 RLS：登录用户只能读写自己的行。

浏览器加载的 `js/supabase-config.js` 只包含项目 URL 和 **publishable key**；这是设计上可以公开的键，数据访问由 RLS 限制。不要在 Vercel 或前端文件中使用 Supabase 的 secret key 或 service role key。

### 启用邮箱登录

在 Supabase Dashboard → Authentication → URL Configuration 中设置：

- Site URL：`https://kotoba-japanese-study-gamma.vercel.app`
- Redirect URLs：加入 `https://kotoba-japanese-study-gamma.vercel.app/**`

随后，用户可通过页面右上角“登录 / 注册”创建邮箱密码账户。默认开启邮箱确认时，注册用户需先点击邮件中的确认链接；确认后，课程进度、自建课程和课程编辑会跨设备同步。

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
