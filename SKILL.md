---
name: xiaohongshu-post-assistant
description: Create Xiaohongshu / 小红书 image-text post drafts, including title variants, 正文, hashtags, cover text, one APIMart-generated cover by default, optional multi-card image plans, publishing checklist, and browser-assisted draft filling. Use when the user asks to write, package, prepare, schedule, publish, generate a cover, or upload a draft for Xiaohongshu posts, 小红书笔记, 小红书草稿箱, 种草文案, 小红书配图/封面, 小红书爆款标题/封面/话题, or when a WeChat-facing request mentions 小红书/XHS/草稿箱.
---

# Xiaohongshu Post Assistant

Use this skill to turn a topic, product, article, PPT, screenshot, or rough idea into a ready-to-post Xiaohongshu image-text note.

Default behavior: prepare a draft, generate exactly one APIMart cover image, upload/fill the draft when requested, and stop before final publish. Do not create multiple image cards unless the user explicitly asks for multi-image cards, 图文卡片, 多图, carousel cards, or a specific image count greater than one. Do not click final publish unless the user explicitly asks and confirms in the browser, because Xiaohongshu accounts can trigger login, CAPTCHA, review, or risk controls.

## Inputs

Collect only missing essentials:

- Topic or product
- Target audience
- Desired tone: practical, personal experience, expert, soft selling, tutorial, review, checklist
- Source materials or facts
- Number of images/cards
- Whether to create assets, use provided images, or only write copy
- Whether to open browser and fill the creator draft

If the image count is missing, assume a practical, non-exaggerated tone and exactly 1 cover image. Treat "做一篇小红书笔记/发草稿箱/生成文章" as one-cover mode. Only switch to multi-card mode when the user explicitly says 图文卡片、多图、几张图、轮播、卡片, or provides an image count greater than one.

## APIMart Image Assets

When the user asks to create Xiaohongshu images, covers, or image cards, prefer APIMart over the default image-generation path if local configuration is available.

Expected environment:

```text
IMAGE_PROVIDER=apimart
APIMART_API_KEY
APIMART_IMAGE_MODEL=gpt-image-2
APIMART_IMAGE_RESOLUTION=1k
```

Never print or hard-code the full API key. Check configuration with environment variables or a project `.env` only.

Use `scripts/generate_apimart_images.py` for repeatable image generation. It accepts a JSON plan and writes images to an output directory:

```powershell
python C:\Users\Administrator\.codex\skills\xiaohongshu-post-assistant\scripts\generate_apimart_images.py `
  --plan .\xhs_image_plan.json `
  --out-dir .\output\xhs-images `
  --model gpt-image-2 `
  --resolution 1k
```

Plan JSON shape:

```json
[
  {
    "filename": "cover.png",
    "role": "cover",
    "title": "封面图",
    "prompt": "要生成的画面",
    "required": true
  }
]
```

Supported `role` values:

- `cover`: 3:4 vertical cover, strong first-screen subject
- `card`: 3:4 vertical note card or scene image
- `body`: 1:1 supplemental image

Before calling APIMart, improve each prompt with the Xiaohongshu visual standards below. If the prompt is vague, make it visually specific but do not invent product claims, fake people, fake screenshots, or fake personal proof.

### Xiaohongshu Visual Standards

- Make covers look like a deliberate Xiaohongshu cover, not a generic lifestyle stock photo.
- Use 3:4 vertical composition with a bold central subject and a clearly empty title zone in the top 30-40% or left 35% of the image.
- Prefer crisp editorial/productivity visuals: clean desk plus one standout object, oversized checklist board, workflow map, or app-like abstract panels. The subject must be readable at phone-feed size.
- Use stronger contrast and clearer depth than a normal background photo: foreground subject sharp, background simple, no tiny scattered objects.
- Leave generous negative space for later Chinese overlay text; avoid placing important details where the title should go.
- Avoid cheap neon, plastic 3D, over-saturated gradients, stock-photo smiles, fake UI screenshots, illegible tiny text, watermarks, QR codes, platform logos, and exaggerated before/after claims.
- Do not ask the image model to render long Chinese text. Generate text-free images, then add text with deterministic card rendering when needed.
- For AI/tool/productivity topics, prefer polished desk/workflow scenes, abstract interface layers, clean editorial illustrations, or high-end app mockup atmospheres. Avoid sci-fi robots, glowing brains, and generic blue-purple AI clichés unless the user explicitly wants them.

## Output Contract

Return:

1. `标题候选`: 5-10 Xiaohongshu-style titles, not clickbait that overpromises.
2. `封面文案`: 1 main line plus 1 optional subtitle.
3. `正文`: structured post body with short paragraphs.
4. `图片规划`: default to a single cover plan; include card-by-card plans only in explicit multi-card mode.
5. `话题标签`: 8-15 hashtags.
6. `发布设置建议`: category, visibility, timing, interaction prompt.
7. `风险检查`: unsupported claims, sensitive words, overpromising, medical/financial/legal risk.

For commercial or affiliate content, include a disclosure-friendly wording suggestion.

## Writing Rules

- Use concrete user pain points and specific takeaways.
- Keep the first 2 lines strong enough to survive feed preview.
- Format the body for Xiaohongshu mobile reading: short lines, frequent blank lines, clear numbered sections, and hashtags separated at the end.
- Keep most paragraphs under 35 Chinese characters. Do not paste long essay blocks.
- Use simple section markers such as `✅`, `⚠️`, `👉` when useful, but keep them restrained and readable. Do not overuse perfect `01/02/03/04/05/06` structures unless the user asks for a checklist.
- Put each step title on its own line, followed by 1-3 short explanation lines.
- Avoid fake personal experience unless the user provided it.
- Avoid absolute claims: "最强", "稳赚", "治愈", "100%".
- Prefer scannable structure: problem -> method -> steps -> result -> reminder.
- Hashtags should mix broad, niche, and intent tags.

### Anti-AI Voice Rules

Write like a real Xiaohongshu creator, not like an AI summary. For the full review checklist, read `references/anti-ai-writing.md` before generating or revising body copy.

- Avoid generic AI phrases: "在当今时代", "随着技术发展", "总的来说", "综上所述", "值得注意的是", "核心在于", "赋能", "降本增效", "闭环", "抓手".
- Avoid perfect essay symmetry. Mix short and medium sentences; allow one or two casual transitions such as "我一开始也搞反了", "后来发现", "这个点挺容易忽略".
- Prefer concrete scenes over abstract conclusions: what the user typed, what went wrong, what changed after using the method.
- Use a human stance: say what is useful, what is not worth doing, and where to be careful. Do not praise everything.
- Keep claims modest. Replace "一定能提升效率" with "会省一点返工时间" or "更容易跑顺".
- Do not write like a product brochure, training manual, or official release note.
- Do not include "AI生成", "我是AI", "作为AI", or any self-referential AI wording.
- Before finalizing, do an AI-smell pass: delete empty slogans, repeated sentence patterns, excessive parallelism, and broad motivational endings.

### Human Draft Workflow

For every Xiaohongshu body, use this sequence:

1. Pick a plausible writer stance before writing: user role, recent situation, what they tried, what they disliked, and one honest limitation.
2. Write a messy first pass with scenes and decisions, not an outline. Mention one concrete action, one small mistake or tradeoff, and one boundary.
3. Edit for mobile reading: split long blocks, remove repeated openings, and keep only useful bullets.
4. Run or mentally reproduce `scripts/lint_xhs_copy.py --draft <draft.json>`. Revise until there are no high-severity findings and no avoidable medium-severity AI-smell findings.
5. Only then upload/fill the draft.

## Body Format

Use this structure for draft bodies unless the user requests another style:

```text
第一行：一句像真人会说的痛点或观察
第二行：补一句具体场景，不要写大道理

小标题
短解释，1-2 行。
可执行动作，1-2 行。

小标题
短解释，1-2 行。
可执行动作，1-2 行。

✅ 适合谁
- 人群 1
- 人群 2

⚠️ 提醒
一句风险或边界。

互动结尾：一句轻提问。
```

Do not include hashtags inside `body` if the upload script appends `tags`; otherwise put hashtags in a separate final paragraph, not inline with正文.

## Image Plan

Default single-cover mode:

- Generate only `cover.png`.
- Use `role: "cover"` in `xhs_image_plan.json`.
- Set `draft.images_dir` to a directory containing only that cover unless the user provided other images.
- Do not mention or create 4/5/7 images in WeChat-facing summaries.

Explicit multi-card mode:

Only enter this mode when the user asks for 图文卡片, 多图, carousel cards, or a specific count greater than one. For each card include:

- Card number
- Visual type: cover, checklist, comparison, step-by-step, quote, case, summary
- Main text
- Supporting text
- Visual direction

Do not put long paragraphs on image cards. Keep card text short.

If the user wants actual generated background images rather than deterministic text cards, also create an `xhs_image_plan.json` with `filename`, `role`, `title`, `prompt`, and `required`, then use the APIMart workflow above. Keep generated images text-free unless the user explicitly requests baked-in text.

## Browser-Assisted Draft Filling

If the user asks to publish or fill a draft:

1. Confirm the user is logged into Xiaohongshu creator/publishing page.
2. Use browser automation only to prepare the draft:
   - upload images
   - fill title
   - fill body
   - fill hashtags
   - set category if visible
3. Stop at preview. Ask the user to review and manually click publish unless they explicitly confirm final publishing.

If CAPTCHA, SMS verification, QR login, or risk warning appears, stop and ask the user to handle it.

### Chrome Upload Rules

For browser-assisted filling, prefer the Chrome plugin / user's existing logged-in Chrome tab over launching a new remote-debugging Chrome. Use `browser.user.openTabs()` to find an existing `creator.xiaohongshu.com` tab, then claim it. If the user has only opened normal `xiaohongshu.com`, ask them to open the creator publishing URL first:

```text
https://creator.xiaohongshu.com/publish/publish?source=official
```

Do not open a separate temporary Chrome profile unless the user explicitly agrees; it will not share the user's login and often causes confusion.

Before uploading local files through the Chrome plugin:

1. Ensure the Codex Chrome Extension has `Allow access to file URLs` / `允许访问文件网址` enabled in Chrome extension details.
2. Use the upload paths produced for the current draft only. Keep generated images in a short-lived project output directory; the fill script deletes uploaded generated image files after the draft is filled.
3. Use the page's visible `上传图文` tab first; if the page opens on video upload, click the real tab candidate that changes the page text to `上传图片`.
4. Upload through the file chooser using only the current draft's selected upload files.
5. If upload returns `Not allowed`, stop and ask the user to enable `允许访问文件网址`; do not repeatedly retry against the same page.

## Reusable Web Draft Workflow

Use the bundled scripts when the user wants the full repeated workflow: create a single-cover image-text draft by default, fill the logged-in Xiaohongshu web creator, and save to drafts.

Expected local draft JSON shape:

- `title`: note title. Keep final title within the platform limit, usually 20 Chinese characters.
- `body`: note body.
- `tags`: array of hashtags without `#`.
- `images_dir`: directory containing generated or provided images.

Recommended sequence:

1. Generate or update a draft JSON in the working project.
2. Default: create exactly one APIMart cover image (`cover.png`) with `scripts/generate_apimart_images.py`, then ensure `images_dir` contains only the intended upload image(s).
3. Explicit multi-card mode only: create the requested number of vertical image cards with `scripts/generate_apimart_images.py`.
4. Run or reproduce `scripts/lint_xhs_copy.py --draft <draft.json>` and revise copy that triggers high-severity or avoidable medium-severity AI-smell findings.
5. Prefer using the Chrome plugin to claim the user's existing logged-in Xiaohongshu Creator tab and fill it directly.
6. If using bundled CDP scripts instead, copy them into the current working project first. Do not run them in place from the skill folder, because screenshots/log output may need write access. Set output under the project directory.
7. If the title exceeds the limit, shorten it before saving.
8. Xiaohongshu often auto-saves and displays `编辑于 刚刚`. Treat that as a draft-saved signal when no visible `暂存` or `保存草稿` button exists. If a save/temporary-save button is visible, click it; never click `发布` without explicit confirmation.
9. Delete generated upload images after a successful fill attempt. Keep only the draft JSON and screenshots/logs unless the user explicitly asks to keep assets.

Operational rules:

- Do not click final `发布` unless the user explicitly confirms final publishing.
- If the creator page is logged out, stop and ask the user to finish SMS/QR/CAPTCHA verification in Chrome, then retry.
- If the page layout changes, use a screenshot first, then prefer coordinate click only for the final save button after visually confirming the position.
- If file upload fails through Chrome with `Not allowed`, instruct the user to enable `Allow access to file URLs` for the Codex Chrome Extension and retry.
- Delete generated image files after the upload/fill attempt by default. Only keep images when the user explicitly asks to keep assets; then set `XHS_KEEP_IMAGES=1` or `draft.keep_images=true`.
- For WeChat-facing replies, report only concise status and result; do not paste shell commands or debug logs.

## Delivery

For draft-only tasks, provide the final copy and card plan.

For asset tasks, provide file paths or download links.

For browser filling, report whether the draft is ready and what remains for manual confirmation.
