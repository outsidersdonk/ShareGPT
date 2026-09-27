// 全面体检 (fork 专用诊断脚本, 不进入上游 PR):
//  1. 逐个打开个人工作区的全部面板 (中文 + English), 收集渲染层报错、主进程报错并截图;
//  2. 在本机启动一个真实 SOCKS5 代理, 让 ShareGPT 的个人代理 → 内置 sing-box → 该代理出网,
//     验证: 代理启停、出口环境检测 (ipwho.is / Cloudflare)、ChatGPT 页面经代理加载、页面「代理检测」报告;
//  3. 截取内嵌 AI 网页本身 (WebContentsView) 的画面。
// 始终以 0 退出, 结果以 AUDIT 行打印; 带 --dump 时把截图 base64 打印到标准输出供取回查看。
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const DUMP = process.argv.includes("--dump");
const findings = [];
const note = (step, data) => {
  findings.push({ step, ...data });
  process.stdout.write(`AUDIT ${JSON.stringify({ step, ...data })}\n`);
};

function dumpImage(name, buffer) {
  if (!DUMP) return;
  const data = buffer.toString("base64");
  const chunk = 3000;
  const total = Math.ceil(data.length / chunk);
  for (let i = 0; i < total; i += 1) {
    process.stdout.write(`SHOT ${name} ${i} ${total} ${data.slice(i * chunk, (i + 1) * chunk)}\n`);
  }
}

// 最小 SOCKS5 (无认证, 仅 CONNECT), 记录经过它的目标主机。
function startSocksProxy() {
  const hosts = [];
  const server = net.createServer((client) => {
    client.on("error", () => undefined);
    client.once("data", (hello) => {
      if (hello[0] !== 5) return client.destroy();
      client.write(Buffer.from([5, 0]));
      client.once("data", (req) => {
        const type = req[3];
        let host;
        let offset;
        if (type === 1) {
          host = [...req.subarray(4, 8)].join(".");
          offset = 8;
        } else if (type === 3) {
          const length = req[4];
          host = req.subarray(5, 5 + length).toString();
          offset = 5 + length;
        } else if (type === 4) {
          const parts = [];
          for (let i = 0; i < 16; i += 2) parts.push(req.readUInt16BE(4 + i).toString(16));
          host = parts.join(":");
          offset = 20;
        } else {
          return client.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0]));
        }
        const port = req.readUInt16BE(offset);
        const rest = req.subarray(offset + 2);
        if (req[1] !== 1) return client.end(Buffer.from([5, 7, 0, 1, 0, 0, 0, 0, 0, 0]));
        hosts.push(`${host}:${port}`);
        const upstream = net.connect(port, host, () => {
          client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          if (rest.length) upstream.write(rest);
          upstream.pipe(client);
          client.pipe(upstream);
        });
        upstream.on("error", () => {
          try {
            client.end(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0]));
          } catch {
            /* ignore */
          }
        });
        client.on("close", () => upstream.destroy());
      });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, hosts }));
  });
}

async function step(name, fn) {
  try {
    const result = await fn();
    note(name, { ok: true, ...(result && typeof result === "object" ? result : {}) });
    return result;
  } catch (error) {
    note(name, { ok: false, error: String(error?.message || error).slice(0, 400) });
    return undefined;
  }
}

async function shot(page, name) {
  try {
    dumpImage(name, await page.screenshot({ type: "jpeg", quality: 60 }));
  } catch (error) {
    note(`screenshot ${name}`, { ok: false, error: String(error?.message || error) });
  }
}

// 截取内嵌 AI 网页本身 (WebContentsView 不在渲染层截图里)。
async function shotAiView(electronApp, name) {
  const base64 = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    const views = (window?.contentView?.children || []).filter(
      (view) =>
        view.webContents && !view.webContents.isDestroyed() && view.getVisible?.() !== false,
    );
    const view = views[views.length - 1];
    if (!view) return "";
    const image = await view.webContents.capturePage();
    return image.toJPEG(60).toString("base64");
  });
  if (base64) dumpImage(name, Buffer.from(base64, "base64"));
  return Boolean(base64);
}

const PANELS = [
  "service",
  "gpt",
  "claude",
  "calendar",
  "todo",
  "notes",
  "focus",
  "account",
  "logs",
];

async function visitPanels(page, lang, errors) {
  for (const key of PANELS) {
    const nav = page.locator(`[data-tour="nav-${key}"]`);
    if (!(await nav.count())) {
      note(`${lang} panel ${key}`, { ok: false, error: "navigation entry missing" });
      continue;
    }
    const before = errors.length;
    await nav.click();
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const main = document.querySelector("main") || document.body;
      const text = main.innerText || "";
      return {
        textLength: text.length,
        errorWords: (
          text.match(/出错|错误|失败|Error|Failed|Cannot|undefined|NaN|null/g) || []
        ).slice(0, 8),
      };
    });
    note(`${lang} panel ${key}`, {
      ok: errors.length === before && info.textLength > 20,
      newErrors: errors.slice(before),
      ...info,
    });
    await shot(page, `${lang}-panel-${key}`);
  }
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sharegpt-audit-"));
  const socks = await startSocksProxy();
  note("local socks proxy", { ok: true, port: socks.port });

  const electronApp = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      SHAREGPT_USER_DATA: path.join(dir, "user-data"),
      SHAREGPT_BACKGROUND_TEST: "1",
    },
  });
  const mainErrors = [];
  electronApp.process().stderr?.on("data", (chunk) => {
    for (const line of String(chunk).split("\n")) {
      if (/error|exception|unhandled|failed/i.test(line)) mainErrors.push(line.slice(0, 300));
    }
  });
  const rendererErrors = [];
  try {
    const page = await electronApp.firstWindow();
    page.setDefaultTimeout(20000);
    page.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(message.text().slice(0, 300));
    });
    page.on("pageerror", (error) =>
      rendererErrors.push(`pageerror: ${error.message}`.slice(0, 300)),
    );

    await step("enter personal workspace", async () => {
      await page.getByText("欢迎来到 ShareGPT", { exact: true }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "开始设置", exact: true }).click();
      await page.getByRole("button", { name: /仅在本机使用/ }).click();
      await page.getByRole("button", { name: "进入个人工作区", exact: true }).click();
      const skip = page.getByRole("button", { name: "跳过", exact: true });
      await skip.waitFor({ state: "visible", timeout: 10000 }).catch(() => undefined);
      if (await skip.isVisible().catch(() => false)) await skip.click();
      const closeGuide = page.getByRole("button", { name: "关闭引导", exact: true });
      if (await closeGuide.isVisible().catch(() => false)) await closeGuide.click();
      await page.locator('[data-tour="nav-service"]').waitFor({ state: "visible" });
    });

    await step("enable optional panels", async () => {
      await page.locator('[data-tour="nav-account"]').click();
      await page.getByText("界面设置", { exact: true }).waitFor({ state: "visible" });
      for (const key of ["calendar", "todo", "notes", "focus"]) {
        const toggle = page.locator(`#ui-show-${key}`);
        if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
      }
    });

    await visitPanels(page, "zh", rendererErrors);

    // —— 网络: 个人代理 → sing-box → 本机 SOCKS5 → 真实互联网 ——
    await step("start personal proxy", async () => {
      await page.locator('[data-tour="nav-service"]').click();
      await page.locator("#s_personal_proxy_host").fill("127.0.0.1");
      await page.locator("#s_personal_proxy_port").fill(String(socks.port));
      await page.getByRole("button", { name: "开启代理" }).click();
      await page
        .getByRole("button", { name: "停止代理" })
        .waitFor({ state: "visible", timeout: 30000 });
      const status = await page.evaluate(() => window.api.getStatus());
      return { senderRunning: status.senderRunning, socksPort: status.senderSocksPort };
    });
    await shot(page, "zh-network-running");

    await step("exit environment detection", async () => {
      const before = socks.hosts.length;
      const environment = await page.evaluate(() => window.api.detectProxyEnvironment());
      const via = socks.hosts.slice(before);
      return {
        environment,
        viaLocalProxy: via,
        throughProxy:
          via.some((h) => h.startsWith("ipwho.is")) && via.some((h) => /cloudflare/.test(h)),
      };
    });

    await step("raw exit IPs through the app proxy (ipwho.is vs Cloudflare)", async () => {
      const { SocksProxyAgent } = require("socks-proxy-agent");
      const https = require("node:https");
      const status = await page.evaluate(() => window.api.getStatus());
      const agent = new SocksProxyAgent(`socks5h://127.0.0.1:${status.senderSocksPort}`);
      const get = (url) =>
        new Promise((resolve) => {
          https
            .get(url, { agent, timeout: 15000 }, (res) => {
              let body = "";
              res.on("data", (c) => (body += c));
              res.on("end", () => resolve(body));
            })
            .on("error", (e) => resolve(`error: ${e.message}`));
        });
      const samples = [];
      for (let i = 0; i < 6; i += 1) {
        const geo = await get("https://ipwho.is/");
        const trace = await get("https://www.cloudflare.com/cdn-cgi/trace");
        let geoIp = "";
        try {
          geoIp = JSON.parse(geo).ip;
        } catch {
          geoIp = geo.slice(0, 60);
        }
        const traceIp = (trace.match(/^ip=(.*)$/m) || [])[1] || trace.slice(0, 60);
        const loc = (trace.match(/^loc=(.*)$/m) || [])[1] || "";
        const sameSubnet = (x, y) =>
          x.includes(":") || y.includes(":")
            ? x.split(":").slice(0, 3).join(":") === y.split(":").slice(0, 3).join(":")
            : x.split(".").slice(0, 3).join(".") === y.split(".").slice(0, 3).join(".");
        samples.push({
          sameIp: geoIp === traceIp,
          sameSubnet: sameSubnet(geoIp, traceIp),
          geoIp: geoIp.replace(/[0-9a-f]+$/i, "x"),
          traceIp: traceIp.replace(/[0-9a-f]+$/i, "x"),
          geoFamily: geoIp.includes(":") ? "IPv6" : "IPv4",
          traceFamily: traceIp.includes(":") ? "IPv6" : "IPv4",
          loc,
        });
      }
      return { samples };
    });

    const aiTab = await step("open ChatGPT through the proxy", async () => {
      const before = socks.hosts.length;
      const status = await page.evaluate(() => window.api.getStatus());
      await page.locator('[data-tour="nav-gpt"]').click();
      await page.waitForTimeout(3000);
      const existing = await page.evaluate(() => window.api.listAiViews("gpt"));
      if (!existing?.tabs?.length) {
        await page.getByRole("button", { name: "新建标签页" }).first().click();
      }
      await page.waitForTimeout(12000);
      const tabs = await page.evaluate(() => window.api.listAiViews?.("gpt"));
      const via = [...new Set(socks.hosts.slice(before).map((h) => h.split(":")[0]))];
      return {
        socksPort: status.senderSocksPort,
        tabs,
        hostsViaLocalProxy: via.slice(0, 30),
        chatgptThroughProxy: via.some((h) => /chatgpt\.com|openai\.com|oaistatic/.test(h)),
      };
    });
    await shot(page, "zh-chatgpt-running");
    await step("capture embedded ChatGPT page", async () => ({
      captured: await shotAiView(electronApp, "zh-chatgpt-webview"),
    }));

    await step("page proxy check (代理检测)", async () => {
      const activeTabId = aiTab?.tabs?.activeTabId || aiTab?.tabs?.tabs?.[0]?.id || "";
      const report = await page.evaluate(
        (tabId) => window.api.checkAiProxy("gpt", tabId),
        activeTabId,
      );
      await page
        .getByRole("button", { name: /代理检测|个域名没走代理/ })
        .first()
        .click();
      await page.waitForTimeout(1500);
      return { report };
    });
    await shot(page, "zh-proxy-check");
    await page.keyboard.press("Escape").catch(() => undefined);

    await step("logs show sing-box output", async () => {
      await page.locator('[data-tour="nav-logs"]').click();
      await page.waitForTimeout(1000);
      const text = await page.evaluate(
        () => (document.querySelector("main") || document.body).innerText,
      );
      return { mentionsSingBox: /sing-box|singbox|sender/i.test(text), sample: text.slice(0, 300) };
    });

    await step("stop proxy", async () => {
      await page.locator('[data-tour="nav-service"]').click();
      await page.getByRole("button", { name: "停止代理" }).click();
      await page
        .getByRole("button", { name: "开启代理" })
        .waitFor({ state: "visible", timeout: 20000 });
      const status = await page.evaluate(() => window.api.getStatus());
      return { senderRunning: status.senderRunning };
    });

    await step("switch to English", async () => {
      await page.locator('[data-tour="nav-account"]').click();
      await page.getByRole("button", { name: "English", exact: true }).click();
      await page.getByText("Interface", { exact: true }).waitFor({ state: "visible" });
    });
    await visitPanels(page, "en", rendererErrors);

    await step("english: error text coming from the main process", async () => {
      const message = await page.evaluate(async () => {
        try {
          await window.api.detectProxyEnvironment();
          return "";
        } catch (error) {
          return String(error?.message || error);
        }
      });
      return { message, chinese: /[\u4e00-\u9fff]/.test(message) };
    });
  } catch (error) {
    note("audit aborted", { ok: false, error: String(error?.message || error) });
  } finally {
    note("renderer errors", {
      ok: rendererErrors.length === 0,
      errors: rendererErrors.slice(0, 40),
    });
    note("main process errors", { ok: mainErrors.length === 0, errors: mainErrors.slice(0, 40) });
    await electronApp.close().catch(() => undefined);
    socks.server.close();
  }
  process.stdout.write(`AUDIT_DONE ${findings.filter((f) => f.ok === false).length} problems\n`);
}

main().catch((error) => {
  process.stdout.write(
    `AUDIT ${JSON.stringify({ step: "fatal", ok: false, error: String(error) })}\n`,
  );
});
