// E2E smoke harness for the workout app (CommonJS; run with NODE_PATH=$(npm root -g)).
// Usage: node e2e.cjs <repoDir> <outDir>
// Serves repoDir over HTTP, drives the main user flows in Chromium at several
// viewports, and writes screenshots + summary.json to outDir.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const repo = path.resolve(process.argv[2] || ".");
const out = path.resolve(process.argv[3] || "./e2e-out");
fs.mkdirSync(out, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png",
};

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = path.join(repo, p);
      if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404); return res.end("nf");
      }
      res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

const VIEWPORTS = [
  { name: "mobile390", width: 390, height: 844, mobile: true },
  { name: "mobile320", width: 320, height: 640, mobile: true },
  { name: "desktop", width: 1280, height: 900, mobile: false },
];

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [];
    if (doc.scrollWidth > window.innerWidth + 1) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
          offenders.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").join(".") : ""} right=${Math.round(r.right)}`);
          if (offenders.length >= 8) break;
        }
      }
    }
    return { scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth, overflowing: doc.scrollWidth > window.innerWidth + 1, offenders };
  });
}

async function step(results, name, fn) {
  try {
    const v = await fn();
    results.steps.push({ name, ok: true, ...(v && typeof v === "object" ? { info: v } : {}) });
  } catch (e) {
    results.steps.push({ name, ok: false, error: String(e && e.message || e).slice(0, 400) });
  }
}

async function runViewport(browser, base, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: vp.mobile, hasTouch: vp.mobile,
    serviceWorkers: "block", acceptDownloads: true, timezoneId: "Asia/Tokyo", locale: "ja-JP",
  });
  const page = await ctx.newPage();
  const results = { viewport: vp.name, consoleErrors: [], pageErrors: [], steps: [], overflow: {} };
  page.on("console", (m) => { if (m.type() === "error") results.consoleErrors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => results.pageErrors.push(String(e.message).slice(0, 300)));
  // fonts.googleapis may be blocked in sandbox; don't let it hang
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

  const shot = (n) => page.screenshot({ path: path.join(out, `${vp.name}-${n}.png`), fullPage: false });
  const full = (n) => page.screenshot({ path: path.join(out, `${vp.name}-${n}-full.png`), fullPage: true });

  await step(results, "load", async () => {
    await page.goto(base + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(300);
    await shot("01-top"); await full("01-top");
    results.overflow.initial = await overflow(page);
  });

  await step(results, "preset-gym+focus", async () => {
    const gym = page.locator(".preset-btn", { hasText: "ジム" }).first();
    await gym.click();
    const chip = page.locator(".focus-chip").first();
    if (await chip.count()) await chip.click();
  });

  await step(results, "generate", async () => {
    await page.locator("#generate-btn, button[type=submit].primary-btn").first().click();
    await page.waitForSelector("#result-section:not([hidden])", { timeout: 5000 });
    await page.waitForTimeout(400);
    await shot("02-result"); await full("02-result");
    results.overflow.afterGenerate = await overflow(page);
    return { days: await page.locator(".day-block h3").count(), rows: await page.locator(".result-content tbody tr").count() };
  });

  await step(results, "swap-exercise", async () => {
    const btn = page.locator(".swap-btn").first();
    const cell = btn.locator("xpath=ancestor::td");
    const before = (await cell.innerText()).split("\n")[0];
    await btn.click(); await page.waitForTimeout(150);
    const after = (await page.locator(".swap-btn").first().locator("xpath=ancestor::td").innerText()).split("\n")[0];
    return { before, after, changed: before !== after };
  });

  await step(results, "consult-harder", async () => {
    const b = page.locator(".consult-btn", { hasText: "きつく" });
    if (await b.count()) await b.first().click();
  });

  await step(results, "info-toggle", async () => {
    const b = page.locator(".info-btn").first();
    if (await b.count()) { await b.click(); await page.waitForTimeout(100); }
  });

  await step(results, "rest-timer", async () => {
    const b = page.locator(".rest-btn").first();
    if (!(await b.count())) return { skipped: true };
    await b.click(); await page.waitForTimeout(1300);
    const t = page.locator("#rest-timer");
    const box = await t.boundingBox();
    const vpH = page.viewportSize().height;
    await shot("03-timer");
    const time = await page.locator("#rest-timer-time").innerText();
    const within = box && box.y >= 0 && box.y + box.height <= vpH && box.x >= 0 && box.x + box.width <= page.viewportSize().width;
    const reset = page.locator("#rest-reset"); if (await reset.count()) await reset.click();
    const close = page.locator("#rest-close"); if (await close.count()) await close.click();
    return { time, withinViewport: !!within, box };
  });

  await step(results, "record-day", async () => {
    await page.locator(".day-record-btn").first().click();
    await page.waitForTimeout(300);
    const rows = await page.locator("#log-entries .log-row").count();
    await shot("04-logform");
    await page.locator("#log-form button[type=submit]").click();
    await page.waitForTimeout(300);
    const items = await page.locator(".log-item").count();
    results.overflow.afterRecord = await overflow(page);
    return { prefilledRows: rows, logItems: items };
  });

  await step(results, "progress-visible", async () => {
    const vis = await page.locator("#progress-section").isVisible();
    if (vis) { await page.locator("#progress-section").scrollIntoViewIfNeeded(); await shot("05-progress"); }
    return { visible: vis };
  });

  await step(results, "bodyweight", async () => {
    const f = page.locator("#bodyweight-form");
    if (!(await f.count())) return { skipped: true };
    await f.locator("button[type=submit]").click(); await page.waitForTimeout(200);
    return { chart: await page.locator("#bodyweight-chart svg").count() };
  });

  await step(results, "reload-restores-profile", async () => {
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(300);
    const checked = await page.locator('input[name="equipment"]:checked').count();
    const logs = await page.locator(".log-item").count();
    return { equipmentChecked: checked, logItemsAfterReload: logs };
  });

  await step(results, "export", async () => {
    const b = page.locator("#export-btn");
    if (!(await b.count())) return { skipped: true };
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 3000 }), b.click()]);
    const p = path.join(out, `${vp.name}-backup.json`); await dl.saveAs(p);
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return { logs: j.logs?.length, hasProfile: !!j.profile };
  });

  await full("06-final");
  results.overflow.final = await overflow(page);
  await ctx.close();
  return results;
}

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  const all = [];
  for (const vp of VIEWPORTS) all.push(await runViewport(browser, base, vp));
  await browser.close(); srv.close();
  const summary = {
    ok: all.every((r) => r.pageErrors.length === 0 && r.steps.every((s) => s.ok) && !Object.values(r.overflow).some((o) => o && o.overflowing)),
    results: all,
  };
  fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ok: summary.ok, perViewport: all.map((r) => ({
    vp: r.viewport, pageErrors: r.pageErrors.length, consoleErrors: r.consoleErrors.length,
    failed: r.steps.filter((s) => !s.ok).map((s) => s.name + ": " + s.error),
    overflow: Object.fromEntries(Object.entries(r.overflow).map(([k, o]) => [k, o && o.overflowing])),
  })) }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
