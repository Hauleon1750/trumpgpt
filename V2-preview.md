# V2 开发预览

`feat/v2-ai-backend` 从 V1.1 的 `4fb8808` 分出。GitHub Pages 仍从 `main /docs` 发布 V1.1。V2 使用独立 Worker 的 HTTPS 地址承载网页与 API，两者同源。当前随分支交付的是本地可运行的 Mock 预览，真实模型质量、实际账户权限和真机体验仍待验证。

## 本地启动

使用 Node.js 24、npm 和项目根目录。Wrangler 的本地模式运行 workerd 和 SQLite Durable Object，无需 Cloudflare 登录。

```sh
npm ci
node -e "const fs=require('node:fs'); const token=require('node:crypto').randomBytes(32).toString('hex'); fs.writeFileSync('.dev.vars','TEST_ACCESS_TOKEN='+token+'\n',{flag:'wx',mode:0o600})"
npm run dev
```

在电脑打开 `http://127.0.0.1:8787/`。选择「AI 测试」，在密码框输入本机 `.dev.vars` 中生成的测试口令。该文件已被 Git 忽略；只在本机使用。服务商密钥无需配置。回复会明确标为「模拟回复」，第二轮会引用上一轮的问题，以便验证上下文传递。选择「离线」可继续使用原有 36 条回复。

```sh
npm test
# 浏览器联调另需 Python 3、playwright 和 Chromium；可使用系统 chromium。
npm run test:e2e
```

浏览器测试自动创建隔离的临时配置、随机测试口令和 SQLite 存储，启动本地 Worker，然后清理。它覆盖三个模式、多轮、双语复制、加载期间切换模式、失败重试、离线重载和并发限额。服务商协议测试使用内存中的模拟 HTTP 响应，整个测试流程不调用模型服务。

## 对话与数据

- 三种情境与两种回复来源各有独立的记录、草稿和请求状态。显示语言可在请求期间切换。刷新页面清除对话和测试口令，保留语言偏好。
- AI 路径为同源 `POST /api/chat`。输入只有 `mode`、`question`、`history`，上下文为最近最多三组完成的提问和英文回答。浏览器发出的用户消息保留原文。失败重试复用同一份上下文，历史里只显示一次该问题。点击重试可能产生一次新的上游调用。
- 服务端选择模型和角色指令，要求以虚构角色回应，避开真实人物引语、真实新闻、官方声明和选举动员。两款适配器均在一次调用中请求简短英文原文和忠实简中译文。通过结构与长度验证后才展示，按来源标记并复制。译文质量和角色遵循仍需在获准试用真实模型后作人工评估。
- 测试口令只用于认证本服务，通过 Authorization 标头发送。模型凭据仅由 Worker 读取，浏览器不能提交服务商、模型、上游网址、系统指令或调用参数。
- 计数对象持久化时间窗口与计数，不存对话、IP、口令或密钥。应用不打印请求、回复或上游错误内容；Worker 可观测性默认关闭。真实模式下，提问与有限上下文会传给选定服务商，其自身的数据条款仍适用。
- 离线聊天留在设备上，Service Worker 仅预缓存应用文件。API 使用 POST、同源访问与 no-store。刷新后不重放失败请求。

## 服务端边界

| 项目 | 强制限制 |
|---|---|
| 接口认证 | 每次请求，包括 Mock，均验证服务端配置的 32–256 字符测试口令；使用随机高熵口令。缺少配置即拒绝。 |
| 请求 | 仅 JSON，按字节读取，上限 24 KiB；当前问题最多 1,000 个 UTF-16 代码单元。 |
| 上下文 | 最多 3 个完成轮次，总 JSON 编码不超过 10,000 UTF-8 字节；服务端再次验证字段、类型和长度。 |
| 输出 | 每次最多 512 个输出 token，英中各不超过 900 个 UTF-16 代码单元；超长、截断、缺译文或格式错误会返回错误。 |
| 超时 | 上游 18 秒，客户端 24 秒；没有自动重试。 |
| 访问频率 | 已认证的有效请求全服务共享每个 UTC 自然分钟 10 次、每天 100 次。Mock 也消耗这两项配额。 |
| 真实调用 | 默认禁止。必须有服务端密钥、已支持的提供商、显式开关及正整数累计次数和金额上限；额度服务故障时拒绝调用。 |

所有模型请求先经过同一命名的 SQLite Durable Object。在事务中成功预留次数和预算后，Worker 才能发一次上游请求。超时、上游拒绝和无效输出保留已用额度。真实调用的累计次数和预算跨用户、模型、日期及普通重启保留，无自动清零。运维时需保留该绑定、对象名称和存储；删除存储或新建一套部署会形成独立的预算。

## 模型选项与预算

以下为 2026-11-18 核对的标准文本 API 美元单价，每百万 token 计价，未使用工具、搜索、媒体或批处理。不含税、汇率和 Cloudflare 自身用量。

| 服务端选项 | 模型 | 输入 / 输出 | 免费条件 |
|---|---|---|---|
| mock | 本地模拟器 | $0 / $0 模型费用 | 无需模型账号或凭据。 |
| openai | gpt-4.1-mini-2025-04-14 | $0.40 / $1.60 | 官方模型页列出 Free 层不支持。优惠或账户余额须单独核实。[模型与价格](https://developers.openai.com/api/docs/models/gpt-4.1-mini) |
| gemini | gemini-2.5-flash-lite | $0.10 / $0.40 | 支持地区、账号和项目的 Free Tier 有限额；项目实际 RPM、TPM、每日请求数在 AI Studio 查看。免费层内容的数据使用条件与付费层不同。[价格和数据条件](https://ai.google.dev/gemini-api/docs/pricing) · [额度](https://ai.google.dev/gemini-api/docs/rate-limits) |

预留金额故意高估：按服务商允许的整个输入窗口和 512 输出 token 以标准单价向上取整到美分。OpenAI 按 1,047,576 个输入 token 预留 43 美分；Gemini 按 1,048,576 个输入 token 预留 11 美分。实际传入的问题和上下文小得多。预留用于拒绝超预算请求，不等于账单。免费层亦执行预留。启用真实模式前应重新核对模型、费率、上下文窗口及账户计费档位；如发生变化，先关闭真实模式并调整预留。[OpenAI 模型规格](https://developers.openai.com/api/docs/models/gpt-4.1-mini) · [Gemini 模型规格](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite)

| 服务端设置 | 用途 |
|---|---|
| TEST_ACCESS_TOKEN | Cloudflare Secret，独立的随机测试口令。 |
| AI_PROVIDER | 默认 mock。可选 openai 或 gemini。 |
| PROVIDER_API_KEY | 真实模式的 Worker Secret，仅配置所选提供商的专用 API 凭据。 |
| ENABLE_LIVE | 默认 false，只有值为 true 才允许真实调用。 |
| LIVE_CALL_LIMIT | 默认 0，累计次数上限，合法正值 1–1,000。 |
| LIVE_BUDGET_CENTS | 默认 0，累计模型预留预算（美分），合法正值 1–10,000。 |

额度保护限定本部署发出的模型调用。平台流量、其他应用对同一密钥的使用及第三方调价需独立管理。测试阶段可选 Cloudflare Workers Free 和 SQLite Durable Objects，受账号和平台限额约束。[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/) · [Durable Objects 定价](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## 后续授权与 iPhone 验收

1. 获得用户授权后，在指定 Cloudflare 账户创建独立的 **Mock** Worker，使用本分支的配置、静态 assets 和 SQLite Durable Object，通过 Worker Secrets 设置测试口令。保留仓库默认 Mock 和零真实预算。用其 HTTPS 地址作为预览入口。
2. 在 iPhone Safari 打开预览，选择「AI 测试」，输入单独提供的测试口令，挑一种情境连续追问两次，再切换语言、复制到备忘录。核对模拟来源、虚构声明、中文输入法回车选词和小屏滚动。
3. 缓存完成后添加到主屏幕，断网冷启动，在「离线」中提问；恢复联网后检查 AI 失败请求可以手动重试。
4. 待用户单独确认提供商、数据条款、调用次数与预算后，才配置模型 Secret 和真实模式开关。再验证实际模型的中英文一致性、讽刺边界、响应时间和实际计费。当前没有部署 Worker 或更改 GitHub Pages。
