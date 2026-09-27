// 界面语言布局验收: 分别以中文与 English 打开个人工作区的主要页面,
// 在默认窗口与最小窗口 (860×620) 下测量布局。English 文案通常比中文长,
// 只要 English 比同一页面同一尺寸的中文多出以下问题就判定失败:
//   - 页面出现横向滚动
//   - 按钮/输入框超出窗口左右边界
//   - 两个按钮互相重叠
//   - 文字被裁切且没有省略号
//   - 主按钮 (data-variant=default) 被挤到窗口底部之外
// 带 --dump 参数时, 额外把截图以 base64 打印到标准输出 (供 CI 日志取回人工查看)。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const DUMP = process.argv.includes("--dump");
const SIZES = [
  { name: "default", width: 1180, height: 760 },
  { name: "minimum", width: 860, height: 620 },
];
const TEXT = {
  zh: {
    start: "开始设置",
    personal: /仅在本机使用/,
    enter: "进入个人工作区",
    skip: "跳过",
    today: "今天",
    newEvent: "新建",
    week: "周",
    day: "日",
    month: "月",
    quickAdd: /添加任务/,
    memoTab: "备忘录",
    todoTab: "待办",
    interface: "界面设置",
  },
  en: {
    start: "Get started",
    personal: /Use on this computer only/,
    enter: "Open personal workspace",
    skip: "Skip",
    today: "Today",
    newEvent: "New",
    week: "Week",
    day: "Day",
    month: "Month",
    quickAdd: /Add a task/,
    memoTab: "Memos",
    todoTab: "To-do",
    interface: "Interface",
  },
};

// 在页面内测量布局问题。打开对话框时只检查对话框内部 (背景被遮住)。
function measureLayout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dialog = document.querySelector('[role="dialog"]');
  const scope = dialog || document.body;
  const issues = [];
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity) > 0.05
    );
  };
  const label = (el) =>
    (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  // 位于可横向滚动容器内的元素 (如标签栏) 允许超出。
  const inHorizontalScroller = (el) => {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth) return true;
    }
    return false;
  };

  if (document.documentElement.scrollWidth > vw + 1) {
    issues.push({
      type: "page-horizontal-overflow",
      text: `scrollWidth ${document.documentElement.scrollWidth} > ${vw}`,
    });
  }

  const controls = [
    ...scope.querySelectorAll('button, a[href], input, select, textarea, [role="button"]'),
  ].filter(isVisible);
  for (const el of controls) {
    const rect = el.getBoundingClientRect();
    if ((rect.right > vw + 1 || rect.left < -1) && !inHorizontalScroller(el)) {
      issues.push({
        type: "control-outside-window",
        text: `${label(el)} [${Math.round(rect.left)}, ${Math.round(rect.right)}] / ${vw}`,
      });
    }
  }

  for (const el of scope.querySelectorAll('button[data-variant="default"]')) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > vh + 1) {
      issues.push({
        type: "primary-action-below-window",
        text: `${label(el)} bottom ${Math.round(rect.bottom)} / ${vh}`,
      });
    }
  }

  const buttons = controls.filter((el) => el.matches('button, [role="button"]'));
  for (let i = 0; i < buttons.length; i += 1) {
    for (let j = i + 1; j < buttons.length; j += 1) {
      const a = buttons[i];
      const b = buttons[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 2 && h > 2) {
        issues.push({ type: "controls-overlap", text: `${label(a)} × ${label(b)}` });
      }
    }
  }

  const textElements = [...scope.querySelectorAll("*")].filter((el) => {
    if (!isVisible(el)) return false;
    const display = getComputedStyle(el).display;
    if (display === "inline" || display === "contents") return false;
    return [...el.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0,
    );
  });
  for (const el of textElements) {
    const style = getComputedStyle(el);
    const overflowsX = el.scrollWidth > el.clientWidth + 1;
    if (!overflowsX) continue;
    if (style.textOverflow === "ellipsis") {
      issues.push({ type: "text-truncated", text: label(el) });
    } else if (style.overflowX !== "visible") {
      issues.push({ type: "text-clipped", text: label(el) });
    }
  }
  return issues;
}

// 引导浮层不是对话框, 会与背后的按钮重叠; 只截图供人工查看, 不参与判定。
const NON_GATING = new Set(["tour"]);

const FAILING = [
  "page-horizontal-overflow",
  "control-outside-window",
  "controls-overlap",
  "text-clipped",
  "primary-action-below-window",
];

async function setWindowSize(electronApp, page, size) {
  await electronApp.evaluate(
    ({ BrowserWindow }, { width, height }) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
      window.setSize(width, height);
    },
    { width: size.width, height: size.height },
  );
  await page.waitForTimeout(250);
}

async function capture(ctx, screen) {
  for (const size of SIZES) {
    await setWindowSize(ctx.electronApp, ctx.page, size);
    const issues = await ctx.page.evaluate(measureLayout);
    ctx.report.push({ lang: ctx.lang, screen, size: size.name, issues });
    const file = path.join(ctx.dir, `${ctx.lang}-${screen}-${size.name}.jpg`);
    await ctx.page.screenshot({ path: file, type: "jpeg", quality: 60 });
    if (DUMP) {
      const data = fs.readFileSync(file).toString("base64");
      const chunk = 3000;
      const total = Math.ceil(data.length / chunk);
      for (let i = 0; i < total; i += 1) {
        process.stdout.write(
          `SHOT ${ctx.lang}-${screen}-${size.name} ${i} ${total} ${data.slice(i * chunk, (i + 1) * chunk)}\n`,
        );
      }
    }
  }
}

async function runPass(lang, dir, report) {
  const t = TEXT[lang];
  const electronApp = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      SHAREGPT_USER_DATA: path.join(dir, `user-data-${lang}`),
      SHAREGPT_BACKGROUND_TEST: "1",
    },
  });
  try {
    const page = await electronApp.firstWindow();
    page.setDefaultTimeout(20000);
    const ctx = { electronApp, page, lang, dir, report };

    await page.getByText("欢迎来到 ShareGPT", { exact: true }).waitFor({ state: "visible" });
    if (lang === "en") {
      await page
        .getByRole("group", { name: "Language / 语言" })
        .getByRole("button", { name: "English" })
        .click();
      await page.getByText("Welcome to ShareGPT", { exact: true }).waitFor({ state: "visible" });
    }
    await capture(ctx, "welcome");
    await page.getByRole("button", { name: t.start, exact: true }).click();
    await page.getByRole("button", { name: t.personal }).waitFor({ state: "visible" });
    await capture(ctx, "workspace-choice");
    await page.getByRole("button", { name: t.personal }).click();
    await page.getByRole("button", { name: t.enter, exact: true }).waitFor({ state: "visible" });
    await capture(ctx, "personal-intro");
    await page.getByRole("button", { name: t.enter, exact: true }).click();

    const skip = page.getByRole("button", { name: t.skip, exact: true });
    await skip.waitFor({ state: "visible", timeout: 10000 }).catch(() => undefined);
    if (await skip.isVisible().catch(() => false)) {
      await capture(ctx, "tour");
      await skip.click();
    }
    const closeGuide = page.getByRole("button", { name: "关闭引导", exact: true });
    if (await closeGuide.isVisible().catch(() => false)) await closeGuide.click();

    await page.locator('[data-tour="nav-service"]').waitFor({ state: "visible" });
    await page.locator('[data-tour="nav-account"]').click();
    await page.getByText(t.interface, { exact: true }).waitFor({ state: "visible" });
    for (const key of ["calendar", "todo"]) {
      const toggle = page.locator(`#ui-show-${key}`);
      if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
      await page.locator(`[data-tour="nav-${key}"]`).waitFor({ state: "visible" });
    }
    await page.getByText(t.interface, { exact: true }).scrollIntoViewIfNeeded();
    await capture(ctx, "account");

    await page.locator('[data-tour="nav-service"]').click();
    await page.locator("#s_personal_proxy_host").waitFor({ state: "visible" });
    await capture(ctx, "network");

    await page.locator('[data-tour="nav-gpt"]').click();
    await page.waitForTimeout(1500);
    await capture(ctx, "chatgpt");

    await page.locator('[data-tour="nav-calendar"]').click();
    await page.getByRole("button", { name: t.today, exact: true }).waitFor({ state: "visible" });
    await capture(ctx, "calendar-month");
    await page.getByRole("button", { name: t.week, exact: true }).click();
    await capture(ctx, "calendar-week");
    await page.getByRole("button", { name: t.day, exact: true }).click();
    await capture(ctx, "calendar-day");
    await page.getByRole("button", { name: t.month, exact: true }).click();
    await page.getByRole("button", { name: t.newEvent, exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await capture(ctx, "event-editor");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });

    await page.locator('[data-tour="nav-todo"]').click();
    const quickAdd = page.getByPlaceholder(t.quickAdd);
    await quickAdd.waitFor({ state: "visible" });
    // 默认是「今天」视图: 用 today 让快速添加解析出今天的到期日, 任务才会出现在列表里。
    await quickAdd.fill("Weekly report today");
    await quickAdd.press("Enter");
    await page.getByText("Weekly report", { exact: true }).waitFor({ state: "visible" });
    await capture(ctx, "todo");
    await page.getByText("Weekly report", { exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await capture(ctx, "task-editor");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: t.memoTab, exact: true }).click();
    await page.waitForTimeout(300);
    await capture(ctx, "memos");
  } finally {
    await electronApp.close().catch(() => undefined);
  }
}

function countByType(entries) {
  const counts = {};
  for (const entry of entries) {
    for (const issue of entry.issues) counts[issue.type] = (counts[issue.type] || 0) + 1;
  }
  return counts;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sharegpt-language-layout-"));
  const report = [];
  await runPass("zh", dir, report);
  await runPass("en", dir, report);

  const regressions = [];
  for (const en of report.filter((entry) => entry.lang === "en" && !NON_GATING.has(entry.screen))) {
    const zh = report.find(
      (entry) => entry.lang === "zh" && entry.screen === en.screen && entry.size === en.size,
    );
    const zhCounts = countByType(zh ? [zh] : []);
    const enCounts = countByType([en]);
    for (const type of FAILING) {
      if ((enCounts[type] || 0) > (zhCounts[type] || 0)) {
        regressions.push({
          screen: en.screen,
          size: en.size,
          type,
          zh: zhCounts[type] || 0,
          en: enCounts[type] || 0,
          details: en.issues.filter((issue) => issue.type === type).map((issue) => issue.text),
        });
      }
    }
  }

  for (const entry of report) {
    const summary = entry.issues.map((issue) => `${issue.type}: ${issue.text}`);
    process.stdout.write(
      `LAYOUT ${entry.lang} ${entry.screen} ${entry.size} ${JSON.stringify(summary)}\n`,
    );
  }
  process.stdout.write(`LAYOUT_SCREENSHOTS ${dir}\n`);
  assert.deepEqual(regressions, [], "English layout must not add overflow, overlap or clipping");
  process.stdout.write(`${JSON.stringify({ ok: true, screens: report.length })}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
