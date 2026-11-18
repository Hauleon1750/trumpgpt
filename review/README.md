# 总统言论档案馆的来源与审核

本分支的静态发布目录为 `docs/`。首批 12 条短引文来自 7 份白宫原始文献，包括特朗普讲话实录 8 条、署名预备讲稿 2 条、彭斯讲话实录 1 条、白宫机构文件 1 条。核验的是文字、日期、归属和语境；文献中的政策主张仍属于其发表者。

## 来源与账号

- 白宫官网页脚直接链接 X 的 @WhiteHouse。动态可能包括转载、视频中的其他发言人及机构评论。页面上的官方时间线由读者选择加载。[白宫官网](https://www.whitehouse.gov/) · [机构账号](https://x.com/WhiteHouse)
- @POTUS 是随政府交接的总统职务账号。国家档案馆说明了交接以及旧账号改名归档的惯例。核对特定帖子时还需核对当时的任期及署名。[账号](https://x.com/POTUS) · [特朗普总统图书馆说明](https://www.trumplibrary.gov/research/archived-social-media)
- X 的 @realDonaldTrump 是特朗普个人账号。联邦法院案卷记载了该账号历史及工作人员的参与。账号发布本身不足以证明本人逐字口述。[账号](https://x.com/realDonaldTrump) · [GovInfo 案卷](https://www.govinfo.gov/content/pkg/USCOURTS-ca2-18-01691/pdf/USCOURTS-ca2-18-01691-0.pdf)
- 白宫的一篇署名声明页面直接链接 Truth Social 的 @realDonaldTrump 原帖，与个人主页名称相符。本版提供主页链接；没有依据稳定的免费官方接入承诺建立自动导入。[白宫出处](https://www.whitehouse.gov/releases/2026/08/icymi-statement-from-president-donald-j-trump/) · [个人主页](https://truthsocial.com/@realDonaldTrump)
- 本地引文限于查明出处的政府制作文字。逐页排查第三方来稿、媒体和转引材料；政府网站上的所有第三方材料不能一概按政府作品处理。本版仅保存短节选、自译和出处，不复制社交帖子库、照片、音视频或徽章。[现行白宫版权说明](https://www.whitehouse.gov/copyright/) · [存档网站版权说明](https://trumpwhitehouse.archives.gov/copyright/)

## 嵌入与隐私

白宫公开动态采用 X Publish 产生的 `twitter-timeline` 标记与官方 `platform.x.com/widgets.js`。公开账号时间线、公开列表和符合条件的单帖可通过网站组件嵌入，无需本项目申请付费 X API 密钥。访客需联网。保护状态、删除、登录要求、平台限流和浏览器阻止第三方内容都可能影响结果。[时间线说明](https://help.x.com/en/using-x/embed-x-feed) · [单帖说明](https://help.x.com/en/using-x/how-to-embed-a-post) · [Publish](https://publish.x.com/)

加载前仅显示本地提示与官方链接。点击加载才创建独立页框，其中的 X 脚本可向 X 提供 IP、浏览器等信息。设置了 `data-dnt` 和无 referrer 策略，用户可关闭组件；这些设置不保证匿名。切到真实引言问答会卸载时间线。PWA 的预缓存清单仅包含本站文件，资料库和喜剧问答都不依赖 X。官网链接在加载前后始终可用。2026-11-18 的未登录实测中，官方脚本加载成功，时间线服务返回 HTTP 429；本版不重试该限制或替代抓取。[X 的 Cookie 说明](https://help.x.com/en/rules-and-policies/x-cookies)

公开嵌入是展示工具。X 的程序化读取另有开发者授权、额度和计费规则。本分支没有定时任务、社交数据抓取、隐藏接口或账号凭据。[X API 计费文档](https://docs.x.com/x-api/getting-started/pricing)

## 候选到发布

1. 编辑将候选资料留在发布目录之外，例如本地 `review/candidates/`。记录永久链接、发言当日身份、原文所在段落或视频时间码、发布账号及平台、日期和权利依据。候选、待核实与撤回内容均不进入发布库。
2. 人工打开原件，核对讲话者与引用层级。转发应找到首发与原作者；引述他人需回到他人的一手材料。分别识别讲话实录、预备讲稿和机构文件。初版只接受这三类已审核白宫文献。未能确认的记录继续待核实。
3. 选一段连续短引文，保留原词、标点、时态和指代。逐条对照中文译文，补足理解所需的场合、所指和笑点背景。复核是否会将预测当成结果，或将机构意见归给总统。
4. 把审核过的文献登记在 `review/sources.json`，记录署名依据、日期、类型与使用规则。将审核后的单条记录加入 `docs/data/quotes.json`；保留既有 ID。每条含 `english`、`translation`、`speaker`、`publisher`、`platform`、`kind`、`date`、`source`、双语 `document/context/topics` 和 `verification.status/checked`。政府网站记录用发布机构名作为账号字段。
5. 运行下列检查并审阅 Git 差异。联网复核只读取清单中已收录的官方文献，每个 URL 读取一次，检查文字、日期和文献身份标记。脚本只报告结果，不能自动授予已核实状态。数据或界面更新时递增 `docs/sw.js` 的缓存版本。
6. 发现来源更正或失效时复核对应记录；无法复核则从发布 JSON 移出并在审核记录中注明原因，更新缓存版本。未来如获准接入稳定官方接口，收集器只能向候选区写入，沿用相同人工流程。

```sh
node --test tests/*.test.mjs
python3 scripts/verify-sources.py
# 可选浏览器回归，需 Python Playwright 和 Chromium
python3 tests/archive_browser.py
```
