const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DRAFT_PATH = path.resolve(process.argv[2] || process.env.XHS_DRAFT_PATH || path.join(process.cwd(), "draft.json"));
const OUT_DIR = path.resolve(process.env.XHS_OUT_DIR || path.join(process.cwd(), "xhs-run-output"));
fs.mkdirSync(OUT_DIR, { recursive: true });

const draft = JSON.parse(fs.readFileSync(DRAFT_PATH, "utf8"));
const imageDir = path.isAbsolute(draft.images_dir)
  ? draft.images_dir
  : path.resolve(path.dirname(DRAFT_PATH), draft.images_dir);
const allImageFiles = fs
  .readdirSync(imageDir)
  .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
  .sort()
  .map((name) => path.join(imageDir, name));
const requestedImageCount = Number(process.env.XHS_IMAGE_COUNT || draft.image_count || draft.max_images || 0);
const imageLimit = Number.isFinite(requestedImageCount) && requestedImageCount > 0
  ? requestedImageCount
  : draft.multi_card === true
    ? allImageFiles.length
    : 1;
const imageFiles = allImageFiles.slice(0, imageLimit);
const cleanupImages = process.env.XHS_KEEP_IMAGES === "1" || draft.keep_images === true ? false : true;

function formatBody(body, tags) {
  const normalized = String(body || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  const tagText = (tags || []).map((t) => `#${String(t).replace(/^#/, "").trim()}`).filter((t) => t.length > 1).join(" ");
  return tagText ? `${normalized}\n\n${tagText}` : normalized;
}

function htmlEscapeForBrowser(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bodyHtmlForBrowser(value) {
  return String(value)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .map((line) => line ? `<p>${htmlEscapeForBrowser(line)}</p>` : "<p><br></p>")
    .join("");
}

let seq = 1;
function httpJson(url, options = {}) {
  return fetch(url, options).then(async (r) => {
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json();
  });
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  return {
    send(method, params = {}) {
      const id = seq++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      ws.close();
    },
  };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esc(value) {
  return JSON.stringify(value);
}

async function evalExpr(client, expression, awaitPromise = true) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails, null, 2));
  }
  return result.result.value;
}

async function waitFor(client, expression, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await evalExpr(client, expression).catch(() => null);
    if (value) return value;
    await sleep(800);
  }
  return null;
}

async function clickCenterByText(client, text) {
  const box = await evalExpr(
    client,
    `(() => {
      const targetText = ${esc(text)};
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 5 && r.height > 5 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const nodes = [...document.querySelectorAll('button,a,div,span,p')].filter(visible);
      const exact = nodes.find(el => (el.innerText || el.textContent || '').trim() === targetText);
      const contains = nodes.find(el => (el.innerText || el.textContent || '').includes(targetText));
      const el = exact || contains;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: (el.innerText || el.textContent || '').trim() };
    })()`
  );
  if (!box) return null;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y, button: "none" });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  return box;
}

async function clickFirstVisibleByTexts(client, texts) {
  for (const text of texts) {
    const clicked = await clickCenterByText(client, text).catch(() => null);
    if (clicked) return clicked;
  }
  return null;
}

async function screenshot(client, name) {
  const metrics = await client.send("Page.getLayoutMetrics").catch(() => null);
  const width = Math.ceil(metrics?.cssLayoutViewport?.clientWidth || metrics?.cssContentSize?.width || 1280);
  const height = Math.ceil(metrics?.cssLayoutViewport?.clientHeight || metrics?.cssContentSize?.height || 900);
  if (width < 10 || height < 10) return "";
  const result = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  return file;
}

function cleanupUploadedImages(files) {
  if (!cleanupImages) return [];
  const removed = [];
  for (const file of files) {
    try {
      fs.unlinkSync(file);
      removed.push(file);
    } catch (_) {}
  }
  try {
    if (fs.existsSync(imageDir) && fs.readdirSync(imageDir).length === 0) {
      fs.rmdirSync(imageDir);
    }
  } catch (_) {}
  return removed;
}

async function main() {
  const tabs = await httpJson("http://127.0.0.1:9222/json");
  let page = tabs.find((t) => t.type === "page" && /creator\.xiaohongshu\.com/.test(t.url) && t.url !== "chrome://intro/");
  if (!page) {
    page = await httpJson("http://127.0.0.1:9222/json/new?https://creator.xiaohongshu.com/", { method: "PUT" });
  }

  const client = await connect(page.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("DOM.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1365,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send("Input.setIgnoreInputEvents", { ignore: false }).catch(() => {});

  await client.send("Page.navigate", { url: "https://creator.xiaohongshu.com/" });
  await sleep(5000);

  const before = await screenshot(client, "xhs-before.png");
  const pageInfo = await evalExpr(
    client,
    `(() => ({url: location.href, title: document.title, text: document.body.innerText.slice(0, 3000)}))()`
  );

  if (/登录|扫码|验证码|手机/.test(pageInfo.text) && !/发布|上传|创作|图文/.test(pageInfo.text)) {
    console.log(JSON.stringify({ status: "need_login", before, pageInfo }, null, 2));
    client.close();
    return;
  }

  await evalExpr(
    client,
    `(() => {
      const texts = ['发布笔记', '发布图文', '图文发布', '上传图文', '创作'];
      const nodes = [...document.querySelectorAll('button,a,div,span')];
      const node = nodes.find(el => texts.some(t => (el.innerText || el.textContent || '').trim().includes(t)));
      if (node) { node.click(); return (node.innerText || node.textContent || '').trim(); }
      return '';
    })()`
  );
  await sleep(4000);

  if (/new\/home/.test(await evalExpr(client, "location.href"))) {
    await clickCenterByText(client, "发布图文笔记");
    await sleep(5000);
  }

  await evalExpr(
    client,
    `(() => {
      const texts = ['图文', '上传图片', '上传图文'];
      const nodes = [...document.querySelectorAll('button,a,div,span')];
      const node = nodes.find(el => texts.some(t => (el.innerText || el.textContent || '').trim() === t || (el.innerText || '').includes(t)));
      if (node) { node.click(); return (node.innerText || node.textContent || '').trim(); }
      return '';
    })()`
  ).catch(() => "");
  await sleep(1500);

  const hasFileInput = await waitFor(client, `document.querySelectorAll('input[type=file]').length`, 10000);
  if (hasFileInput) {
    const { root } = await client.send("DOM.getDocument", {});
    const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
    if (nodeId) {
      await client.send("DOM.setFileInputFiles", { nodeId, files: imageFiles });
      await sleep(8000);
    }
  }

  const bodyWithTags = formatBody(draft.body, draft.tags);
  const bodyWithTagsHtml = bodyHtmlForBrowser(bodyWithTags);
  const fillResult = await evalExpr(
    client,
    `(() => {
      const bodyHtml = ${esc(bodyWithTagsHtml)};
      const setValue = (el, value) => {
        el.focus();
        if ('value' in el) {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        el.innerHTML = bodyHtml;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      };
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 5 && r.height > 5 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const fields = [...document.querySelectorAll('input,textarea,[contenteditable=true]')].filter(visible);
      const placeholders = fields.map((el, i) => ({
        i,
        tag: el.tagName,
        placeholder: el.getAttribute('placeholder') || '',
        aria: el.getAttribute('aria-label') || '',
        text: (el.innerText || el.value || '').slice(0, 80)
      }));
      let titleEl = fields.find(el => /标题|填写标题|请输入标题/.test(el.getAttribute('placeholder') || el.getAttribute('aria-label') || ''));
      let bodyEl = fields.find(el => /正文|内容|描述|分享/.test(el.getAttribute('placeholder') || el.getAttribute('aria-label') || ''));
      if (!titleEl) titleEl = fields.find(el => el.tagName === 'INPUT') || fields[0];
      if (!bodyEl) bodyEl = fields.find(el => el !== titleEl && (el.tagName === 'TEXTAREA' || el.isContentEditable)) || fields.find(el => el !== titleEl);
      const titleOk = titleEl ? setValue(titleEl, ${esc(draft.title)}) : false;
      const bodyOk = bodyEl ? setValue(bodyEl, ${esc(bodyWithTags)}) : false;
      return {
        titleOk,
        bodyOk,
        bodyPreview: bodyEl ? (bodyEl.innerText || bodyEl.value || '').slice(0, 800) : '',
        bodyHtmlPreview: bodyEl ? (bodyEl.innerHTML || '').slice(0, 800) : '',
        fields: placeholders,
        url: location.href,
        text: document.body.innerText.slice(0, 2000)
      };
    })()`
  );

  await sleep(2000);
  const after = await screenshot(client, "xhs-after-fill.png");
  const finalInfo = await evalExpr(
    client,
    `(() => ({url: location.href, title: document.title, text: document.body.innerText.slice(0, 4000)}))()`
  );
  const saveClick = await clickFirstVisibleByTexts(client, ["暂存离开", "保存草稿", "暂存", "存草稿"]);
  if (saveClick) {
    await sleep(4000);
  }
  const cleanedImages = cleanupUploadedImages(imageFiles);
  console.log(JSON.stringify({
    status: "filled_attempted",
    imageCount: imageFiles.length,
    availableImageCount: allImageFiles.length,
    ignoredImageCount: Math.max(0, allImageFiles.length - imageFiles.length),
    cleanedImageCount: cleanedImages.length,
    saveClick,
    before,
    after,
    fillResult,
    finalInfo,
  }, null, 2));
  client.close();
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "error", message: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
