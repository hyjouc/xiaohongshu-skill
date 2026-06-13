# Xiaohongshu Skill

一个给 Codex 用的小红书图文笔记 skill。它的目标不是批量发帖，而是把一篇笔记安全地准备到草稿阶段：写正文、生成一张封面、上传到小红书创作平台，并停在人工确认前。

## 能做什么

- 生成小红书标题、正文、标签和发布建议
- 默认只生成 1 张 APIMart 封面图
- 用户明确要求多图/图文卡片时，才生成多张图
- 检查文案里的“AI 味”，避免太像模板稿
- 辅助填写小红书创作平台草稿
- 上传/填写后默认清理本地生成图片

## 不做什么

- 不保存任何 API key、cookie、token 或账号数据
- 不自动点击最终发布按钮
- 不绕过验证码、登录、风控或平台限制
- 不默认生成多张图
- 不把生成图片、草稿、日志提交到仓库

## 安装到 Codex

把这个仓库 clone 到你的 Codex skills 目录：

```powershell
git clone https://github.com/hyjouc/xiaohongshu-skill.git "$env:USERPROFILE\.codex\skills\xiaohongshu-post-assistant"
```

如果你已经有同名本地 skill，请先备份或换一个目录名。

## 环境变量

真实 key 不要写进仓库。可以放在系统环境变量，或本地 `.env` 文件里。

参考 `.env.example`：

```text
IMAGE_PROVIDER=apimart
APIMART_API_KEY=replace_me
APIMART_IMAGE_MODEL=gpt-image-2
APIMART_IMAGE_RESOLUTION=1k
```

## 典型用法

在 Codex 里直接说：

```text
用小红书技能，帮我做一篇关于 AI 工具提效的图文笔记，并生成封面，上传到草稿箱
```

默认行为：

1. 写一篇更像真人笔记的正文
2. 用 APIMart 生成 1 张封面
3. 上传到小红书草稿箱
4. 停在草稿/预览，不点发布
5. 上传后清理本地生成图片

## 文案去 AI 味

这个 skill 内置了文案检查规则：

- 避免“随着技术发展”“总的来说”“综上所述”等模板句
- 避免机械的 `01/02/03/04/05` 完美结构
- 要有具体场景、取舍、边界和真实提醒
- 上传前可运行 `scripts/lint_xhs_copy.py` 检查草稿

示例：

```powershell
python .\scripts\lint_xhs_copy.py --draft .\draft.json
```

## 项目结构

```text
SKILL.md                         skill 主说明
agents/openai.yaml               Codex UI 元数据
references/anti-ai-writing.md    去 AI 味写作检查表
references/post-template.md      小红书正文模板参考
scripts/generate_apimart_images.py  APIMart 生图脚本
scripts/fill_xhs_draft_cdp.js       小红书草稿填写脚本
scripts/lint_xhs_copy.py            文案 AI 味检查脚本
```

## 安全说明

`.gitignore` 已排除：

- `.env`
- 生成图片
- 草稿目录
- 输出日志
- 浏览器/运行缓存
- Python 缓存

提交前仍建议再扫一遍：

```powershell
rg -n -i "api[_-]?key|secret|token|cookie|password|authorization|bearer" .
```
