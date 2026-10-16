(() => {
  if (window.top !== window) {
    try {
      if (window.parent.location.host === location.host) return;
    } catch (error) {
      // The seller page is inside a cross-origin frame, so this frame can mount the panel.
    }
  }
  if (window.__lianpuFillPanel) return;
  const startURL = "https://seller.us.tiktokshopglobalselling.com/product/manage?shop_region=US&tab=draft";
  const loopKey = "lianpu-fill-loop";
  const tabToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const rounds = 5;
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (pageKind()) {
      clearInterval(timer);
      mount();
    } else if (tries > 40) {
      clearInterval(timer);
    }
  }, 500);

  function pageKind() {
    const path = location.pathname || "";
    if (path.includes("/product/create")) return "create";
    if (path.includes("/product/manage")) return "manage";
    const text = document.body ? document.body.innerText || "" : "";
    if (text.includes("商品名称") || text.includes("上传主图")) return "create";
    if (text.includes("商品管理") && text.includes("添加商品")) return "manage";
    return "";
  }

  function mount() {
    if (window.__lianpuFillPanel) return;
    window.__lianpuFillPanel = true;
    const host = document.createElement("div");
    host.dataset.lianpuPanel = "1";
    host.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483646;width:360px;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .panel { box-sizing:border-box; max-height:80vh; overflow:auto; padding:12px; border:1px solid #cbd5e1; border-radius:12px; background:#fff; color:#0f172a; font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; box-shadow:0 8px 24px rgba(15,23,42,.12); }
        h2 { margin:0 0 8px; font-size:14px; cursor:grab; user-select:none; touch-action:none; }
        p { margin:0 0 8px; color:#475569; }
        button { margin:0 8px 8px 0; padding:6px 10px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; font:inherit; }
        button.primary { border-color:#0f172a; background:#0f172a; color:#fff; }
        button:disabled { opacity:.55; }
        #account { min-height:1.4em; }
        #notice { min-height:1.4em; white-space:pre-wrap; }
        [hidden] { display:none !important; }
        #status { margin:0 0 8px; padding:8px; border-radius:8px; background:#f8fafc; font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; }
        #status div { margin:0; }
        #console { max-height:240px; overflow:auto; margin:0 0 8px; padding:8px; border-radius:8px; background:#0f172a; color:#e2e8f0; font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; white-space:pre-wrap; user-select:text; cursor:text; }
      </style>
      <section class="panel">
        <h2 title="拖动，松手后吸附右上角或右下角">链铺上架</h2>
        <p id="account">正在读取登录状态…</p>
        <p>从草稿列表开始。每轮打开添加商品，填完另存为草稿。某一步连续失败就跳过这一轮，最后把链接交给人工。</p>
        <button id="run" class="primary" type="button">开始 5 轮</button>
        <button id="stop" class="primary" type="button" hidden>停止</button>
        <button id="go" class="primary" type="button" hidden>继续</button>
        <button id="leave" type="button" hidden>退出</button>
        <button id="copy" type="button">复制日志</button>
        <button id="logout" type="button">退出登录</button>
        <div id="status" hidden>
          <div id="cur">当前：</div>
          <div id="result">结果：</div>
          <div id="next">下一步：</div>
          <div id="after">下下步：</div>
        </div>
        <pre id="console" hidden></pre>
        <p id="notice" role="status"></p>
      </section>
    `;
    document.documentElement.appendChild(host);
    const handle = root.querySelector("h2");
    let drag = null;
    function placePanel(corner) {
      host.style.left = "auto";
      host.style.right = "12px";
      if (corner === "bottom") {
        host.style.top = "auto";
        host.style.bottom = "12px";
      } else {
        host.style.bottom = "auto";
        host.style.top = "12px";
      }
    }
    try {
      placePanel(sessionStorage.getItem("lianpu-panel-corner") === "bottom" ? "bottom" : "top");
    } catch {
      placePanel("top");
    }
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const rect = host.getBoundingClientRect();
      drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, x: event.clientX, y: event.clientY };
      handle.setPointerCapture(event.pointerId);
      handle.style.cursor = "grabbing";
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const rect = host.getBoundingClientRect();
      const left = Math.max(8, Math.min(event.clientX - drag.dx, window.innerWidth - rect.width - 8));
      const top = Math.max(8, Math.min(event.clientY - drag.dy, window.innerHeight - Math.min(rect.height, window.innerHeight - 16) - 8));
      host.style.right = "auto";
      host.style.bottom = "auto";
      host.style.left = left + "px";
      host.style.top = top + "px";
    });
    handle.addEventListener("pointerup", (event) => {
      if (!drag) return;
      const moved = Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 6;
      drag = null;
      handle.style.cursor = "grab";
      if (!moved) return;
      const rect = host.getBoundingClientRect();
      const corner = rect.top + rect.height / 2 < window.innerHeight / 2 ? "top" : "bottom";
      placePanel(corner);
      try {
        sessionStorage.setItem("lianpu-panel-corner", corner);
      } catch {
        // the corner still applies for this page
      }
    });
    handle.addEventListener("pointercancel", () => {
      drag = null;
      handle.style.cursor = "grab";
    });
    const notice = root.querySelector("#notice");
    const account = root.querySelector("#account");
    const button = root.querySelector("#run");
    const stopButton = root.querySelector("#stop");
    const goButton = root.querySelector("#go");
    const leaveButton = root.querySelector("#leave");
    const copyButton = root.querySelector("#copy");
    const logoutButton = root.querySelector("#logout");
    const statusBox = root.querySelector("#status");
    const consoleBox = root.querySelector("#console");
    const curEl = root.querySelector("#cur");
    const resultEl = root.querySelector("#result");
    const nextEl = root.querySelector("#next");
    const afterEl = root.querySelector("#after");
    const steps = [
      ["上传图片", { type: "upload-image" }],
      ["填写商品名称", { type: "fill-title", title: "Lianpu title test Unisex Kids Soccer Jersey" }],
      ["选择类目", { type: "select-category", path: ["女装和内衣", "女士上装", "女士卫衣", "女士连帽衫"] }],
      ["选择无品牌", { type: "select-brand" }],
      ["填写商品详情", { type: "fill-detail", detail: "Lianpu 测试商品详情：Unisex Kids Soccer Jersey。" }],
      ["填写变体", { type: "select-sales" }],
      ["尺码表上传测试图", { type: "select-size-chart" }],
      ["合规选择否", { type: "select-compliance" }],
      ["填写物流", { type: "fill-logistics", weight: "300", size: ["3", "15", "20"] }],
      ["另存为草稿", { type: "save-draft" }],
    ];

    copyButton.addEventListener("click", () => {
      const stored = readLoop();
      const text = (consoleBox.textContent || "").trim() || ((stored && stored.lines) || []).join("\n");
      if (!text) {
        notice.textContent = "还没有日志。";
        return;
      }
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      document.body.appendChild(area);
      area.focus();
      area.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      area.remove();
      if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          notice.textContent = "日志已复制，可以直接粘贴。";
        }).catch(() => {
          notice.textContent = "没有复制成功。黑色记录里的字可以选择后复制。";
        });
        return;
      }
      notice.textContent = copied ? "日志已复制，可以直接粘贴。" : "没有复制成功。黑色记录里的字可以选择后复制。";
    });

    logoutButton.addEventListener("click", () => {
      logoutButton.disabled = true;
      ask({ type: "logout" })
        .then(async () => {
          const state = readLoop() || { lines: [] };
          state.running = false;
          state.navigating = false;
          state.lines = (state.lines || []).concat("已退出登录");
          state.hold = "";
          await writeLoop(state);
          notice.textContent = "已退出登录。请点插件图标，重新填写链铺地址和密码。";
          setMode("idle");
          await refreshAccount();
        })
        .catch((error) => {
          notice.textContent = error instanceof Error ? error.message : "退出失败";
        })
        .finally(() => {
          logoutButton.disabled = false;
        });
    });

    refreshAccount();

    button.addEventListener("click", () => {
      userStop = false;
      leaveAsked = false;
      parked = false;
      const state = { running: true, hold: "", total: rounds, round: 1, stage: "create", restarts: 0, retries: 0, stepIndex: -1, stepStatus: "进行中", lines: ["开始运行。"], skipped: [] };
      writeLoop(state);
      setMode("running");
      showStep(state, pageKind() === "manage" ? -1 : 0, "进行中");
      run(async () => {
        if (pageKind() === "manage") await openAndFill(state);
        else await fillCurrent(state);
      });
    });

    stopButton.addEventListener("click", () => {
      const state = readLoop() || { lines: [] };
      leaveAsked = false;
      requestStop();
      park(state);
    });

    goButton.addEventListener("click", () => {
      const state = readLoop();
      if (!state) return;
      userStop = false;
      leaveAsked = false;
      parked = false;
      state.hold = "";
      state.running = true;
      state.stepStatus = "继续";
      writeLoop(state);
      setMode("running");
      showStep(state, Number.isInteger(state.stepIndex) ? state.stepIndex : -1, "继续");
      run(async () => {
        if (pageKind() === "create") {
          const index = Number.isInteger(state.stepIndex) && state.stepIndex >= 0 ? state.stepIndex : 0;
          await fillCurrent(state, index);
          return;
        }
        await openAndFill(state);
      });
    });

    leaveButton.addEventListener("click", () => {
      leaveAsked = true;
      userStop = true;
      requestStop();
      const state = readLoop() || { lines: [] };
      state.running = false;
      state.hold = "";
      state.navigating = false;
      state.owner = "";
      state.stepStatus = "已退出";
      state.lines = (state.lines || []).concat("已退出这次运行。");
      writeLoop(state);
      showStep(state, Number.isInteger(state.stepIndex) ? state.stepIndex : -1, "已退出");
      notice.textContent = "已退出。页面留在这里。要重新上架，再点开始 5 轮。";
      setMode("idle");
    });

    const existing = readLoop();
    if (existing && existing.running) resume(existing);
    else {
      readSharedLoop().then((shared) => {
        if (window.__lianpuFillResume) return;
        if (shared && shared.running) resume(shared);
      });
    }

    function setMode(mode) {
      button.hidden = mode !== "idle";
      stopButton.hidden = mode !== "running";
      goButton.hidden = mode !== "paused";
      leaveButton.hidden = mode !== "paused";
      button.disabled = mode !== "idle";
    }

    async function park(state) {
      if (leaveAsked || parked) return;
      parked = true;
      userStop = true;
      state.running = true;
      state.hold = "paused";
      state.navigating = false;
      state.stepStatus = "已停止";
      state.lines = (state.lines || []).concat("已停止。可以继续，或退出这次运行。");
      await writeLoop(state);
      showStep(state, Number.isInteger(state.stepIndex) ? state.stepIndex : -1, "已停止");
      notice.textContent = "已停止。可以继续，或退出这次运行。";
      setMode("paused");
    }

    function resume(state) {
      window.__lianpuFillResume = true;
      if (state.hold === "paused") {
        setMode("paused");
        showStep(state, Number.isInteger(state.stepIndex) ? state.stepIndex : -1, "已停止");
        notice.textContent = "已停止。可以继续，或退出这次运行。";
        return;
      }
      setMode("running");
      showStep(state, Number.isInteger(state.stepIndex) ? state.stepIndex : -1, state.stepStatus || "继续");
      const kind = pageKind();
      if (kind === "create") {
        if (state.stage === "skipped") {
          location.assign(startURL);
          return;
        }
        if (state.stage === "saved") {
          setMode("idle");
          return;
        }
        run(() => fillCurrent(state));
        return;
      }
      if (kind !== "manage") return;
      if (state.stage === "saved" || state.stage === "skipped") {
        if (state.round >= state.total) {
          finishRun(state);
          return;
        }
        state.round += 1;
        state.stage = "create";
        state.restarts = 0;
        state.retries = 0;
        state.stepIndex = -1;
        state.stepStatus = "进行中";
        writeLoop(state);
      }
      run(() => openAndFill(state));
    }

    function lookahead(index) {
      const next = steps[index + 1];
      const after = steps[index + 2];
      return { next: next ? next[0] : "无", after: after ? after[0] : "无" };
    }

    function showStep(state, index, status) {
      statusBox.hidden = false;
      consoleBox.hidden = false;
      if (index >= steps.length) {
        curEl.textContent = "当前：已结束";
        nextEl.textContent = "下一步：无";
        afterEl.textContent = "下下步：无";
      } else {
        const label = index >= 0 ? index + 1 + ". " + steps[index][0] : "打开添加商品";
        const look = lookahead(index);
        curEl.textContent = "当前：" + label;
        nextEl.textContent = "下一步：" + look.next;
        afterEl.textContent = "下下步：" + look.after;
      }
      resultEl.textContent = "结果：" + status;
      consoleBox.textContent = (state.lines || []).join("\n");
      consoleBox.scrollTop = consoleBox.scrollHeight;
    }

    function logStep(state, index, status, extra) {
      const label = index >= 0 && index < steps.length ? index + 1 + ". " + steps[index][0] : "打开添加商品";
      const look = lookahead(index);
      let text = "第 " + state.round + " 轮 当前 " + label + " " + status + "；下一步 " + look.next + "；下下步 " + look.after;
      if (extra) text += "。" + extra;
      state.stepIndex = index;
      state.stepStatus = status;
      state.lines = (state.lines || []).concat(text);
      writeLoop(state);
      showStep(state, index, status);
    }

    function finishRun(state) {
      state.running = false;
      state.navigating = false;
      state.stage = "done";
      const skipped = state.skipped || [];
      let report = "5 轮都已做完。没有要人工处理的。";
      if (skipped.length) {
        report = "5 轮结束。下面 " + skipped.length + " 条留给人工：\n" + skipped.map((item, index) => {
          return (index + 1) + ". 第 " + item.round + " 轮停在「" + item.step + "」\n   " + item.reason + "\n   " + item.url;
        }).join("\n");
      }
      state.lines = (state.lines || []).concat(report);
      state.stepIndex = steps.length;
      state.stepStatus = skipped.length ? "有跳过" : "全部完成";
      writeLoop(state);
      notice.textContent = report;
      showStep(state, steps.length, state.stepStatus);
      setMode("idle");
    }

    async function openAndFill(state) {
      if (userStop) {
        await park(state);
        return;
      }
      logStep(state, -1, "进行中");
      notice.textContent = "第 " + state.round + " 轮，打开添加商品…";
      state.navigating = true;
      await writeLoop(state);
      await ask({ type: "inject" });
      try {
        await pageMessage({ type: "open-create" }, 20000);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "已停止" || userStop) {
          await park(state);
          return;
        }
        if (pageKind() !== "manage" || message.includes("context invalidated")) return;
        logStep(state, -1, "失败", message);
        if (await recoverRound(state, error)) return;
        if (await skipRound(state, error, "打开添加商品")) return;
        state.navigating = false;
        await writeLoop(state);
        throw error;
      }
      if (pageKind() === "create" || formReady()) {
        await fillCurrent(state);
        return;
      }
      await delay(1000);
      if (pageKind() === "create" || formReady()) {
        await fillCurrent(state);
        return;
      }
      if (pageKind() === "manage") {
        state.lines = (state.lines || []).concat("第 " + state.round + " 轮改在新标签填写");
        writeLoop(state);
        showStep(state, -1, "进行中");
        notice.textContent = "第 " + state.round + " 轮改在新标签填写…";
        await watchOtherTab(state.round);
        return;
      }
      await fillCurrent(state);
    }

    async function watchOtherTab(round) {
      const started = Date.now();
      while (Date.now() - started < 300000) {
        const state = await readSharedLoop();
        const lines = (state && state.lines) || [];
        if (!state || !state.running || state.hold === "paused" || userStop) {
          if (state) showStep(state, Number.isInteger(state.stepIndex) ? state.stepIndex : steps.length, state.stepStatus || "已结束");
          notice.textContent = state && state.hold === "paused" ? "已停止。可以继续，或退出这次运行。" : lines.join("\n");
          setMode(state && state.hold === "paused" ? "paused" : "idle");
          return;
        }
        showStep(state, Number.isInteger(state.stepIndex) ? state.stepIndex : -1, state.stepStatus || "进行中");
        notice.textContent = "第 " + round + " 轮正在填写…";
        const moved = state.round > round || ((state.stage === "saved" || state.stage === "skipped" || state.stage === "done") && state.round >= round);
        if (moved) return;
        await delay(500);
      }
    }

    async function fillCurrent(state, startAt) {
      const latest = (await readSharedLoop()) || state;
      if (latest.owner && latest.owner !== tabToken && Date.now() - (latest.claimedAt || 0) < 180000) {
        await watchOtherTab(latest.round || state.round);
        return;
      }
      state.owner = tabToken;
      state.claimedAt = Date.now();
      state.stage = "filling";
      state.navigating = false;
      await writeLoop(state);
      const claimed = await readSharedLoop();
      if (claimed && claimed.owner && claimed.owner !== tabToken) {
        await watchOtherTab(claimed.round || state.round);
        return;
      }
      await ask({ type: "inject" });
      await waitForCreateForm();
      const start = Number.isInteger(startAt) && startAt > 0 ? startAt : 0;
      if (start === 0) {
        scrollPageTop();
        await delay(400);
        scrollPageTop();
      }
      for (let index = start; index < steps.length; index += 1) {
        if (userStop) {
          await park(state);
          return;
        }
        const [label, payload] = steps[index];
        logStep(state, index, "进行中");
        notice.textContent = "第 " + state.round + "/" + state.total + " 轮，第 " + (index + 1) + " 步，" + label + "…";
        try {
          let message = payload;
          let timeout = payload.type === "save-draft" ? 60000 : payload.type === "select-size-chart" || payload.type === "select-category" ? 45000 : 25000;
          if (payload.type === "select-sales") {
            const loaded = await ask({ type: "variant-plan" });
            message = { type: "select-sales", plan: loaded.plan, images: loaded.images };
            timeout = 240000;
          }
          const result = await pageMessage(message, timeout);
          if (userStop) {
            await park(state);
            return;
          }
          state.retries = 0;
          logStep(state, index, "成功", result.message);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "这一步卡住了";
          if (reason === "已停止" || userStop) {
            await park(state);
            return;
          }
          logStep(state, index, "失败", reason);
          const stalled = reason.includes("页面没有响应");
          if (stalled && (await recoverRound(state, error))) return;
          if (!stalled && !reason.includes("未登录") && !reason.includes("context invalidated") && (Number(state.retries) || 0) < 1) {
            state.retries = 1;
            state.lines = (state.lines || []).concat("同页再试：" + reason);
            writeLoop(state);
            showStep(state, index, "同页再试");
            index -= 1;
            continue;
          }
          if (await skipRound(state, error, label)) return;
          throw error;
        }
      }
      state.lines = (state.lines || []).concat("第 " + state.round + " 轮已保存");
      state.stage = "saved";
      state.owner = "";
      state.stepStatus = "成功";
      await writeLoop(state);
      showStep(state, steps.length - 1, "成功");
      notice.textContent = "第 " + state.round + " 轮已保存，回到草稿列表…";
      await delay(600);
      location.assign(startURL);
    }

    async function recoverRound(state, error) {
      const line = error instanceof Error ? error.message : "这一步卡住了";
      if (line.includes("未登录") || line.includes("context invalidated")) return false;
      const count = Number(state.restarts) || 0;
      if (count >= 2) return false;
      state.restarts = count + 1;
      state.running = true;
      state.stage = "filling";
      state.navigating = true;
      state.owner = "";
      state.claimedAt = 0;
      state.lines = (state.lines || []).concat("卡住后刷新 " + state.restarts + "/2：" + line + "。回到顶部后重新填写。");
      await writeLoop(state);
      showStep(state, Number.isInteger(state.stepIndex) ? state.stepIndex : -1, "失败，准备刷新");
      notice.textContent = "正在刷新页面，回到顶部后重新填写…";
      location.reload();
      return true;
    }

    async function skipRound(state, error, stepLabel) {
      const reason = error instanceof Error ? error.message : "这一步卡住了";
      if (reason.includes("未登录") || reason.includes("context invalidated")) return false;
      state.skipped = (state.skipped || []).concat({ round: state.round, step: stepLabel, reason, url: location.href });
      state.restarts = 0;
      state.running = true;
      state.stage = "skipped";
      state.navigating = true;
      state.owner = "";
      state.claimedAt = 0;
      state.stepStatus = "已跳过";
      state.lines = (state.lines || []).concat(
        "跳过第 " + state.round + " 轮，留给人工。停在「" + stepLabel + "」：" + reason,
        "链接：" + location.href
      );
      await writeLoop(state);
      showStep(state, Number.isInteger(state.stepIndex) ? state.stepIndex : -1, "已跳过");
      notice.textContent = "第 " + state.round + " 轮已跳过，继续下一条。";
      await leaveFailedPage();
      return true;
    }

    async function leaveFailedPage() {
      try {
        await pageMessage({ type: "discard-changes" }, 8000);
      } catch {
        // The dialog is not open yet.
      }
      location.assign(startURL);
      await delay(800);
      if (location.pathname.includes("/product/manage")) return;
      try {
        await pageMessage({ type: "discard-changes" }, 8000);
      } catch {
        // Still no dialog the page script can click.
      }
      await delay(500);
      if (!location.pathname.includes("/product/manage")) location.assign(startURL);
    }

    function refreshAccount() {
      return ask({ type: "status" })
        .then((status) => {
          if (status && status.loggedIn) {
            account.textContent = "当前账号 " + (status.email || "");
            return;
          }
          if (status && status.remembered) {
            account.textContent = "登录已失效。点退出登录后，再点插件图标重新登录。";
            return;
          }
          account.textContent = "未登录。点浏览器工具栏里的链铺上架图标登录。";
        })
        .catch(() => {
          account.textContent = "还读不到登录状态。";
        });
    }

    function run(work) {
      button.disabled = true;
      Promise.resolve()
        .then(work)
        .catch(async (error) => {
          const state = (await readSharedLoop()) || { lines: [] };
          const line = error instanceof Error ? error.message : "操作失败";
          if (line === "已停止" || userStop) {
            await park(state);
            return;
          }
          if (state.navigating && (pageKind() !== "manage" || line.includes("页面没有响应") || line.includes("context invalidated"))) return;
          state.running = false;
          state.navigating = false;
          state.lines = (state.lines || []).concat(line);
          state.stepStatus = "失败";
          await writeLoop(state);
          showStep(state, Number.isInteger(state.stepIndex) ? state.stepIndex : -1, "失败");
          notice.textContent = line;
          setMode("idle");
        });
    }
  }

  function scrollPageTop() {
    window.scrollTo(0, 0);
    const roots = [document.scrollingElement, document.documentElement, document.body];
    for (const el of roots) {
      if (el) el.scrollTop = 0;
    }
    for (const el of document.querySelectorAll("div, main, section")) {
      if (el.clientHeight < 240 || el.scrollHeight < el.clientHeight + 80) continue;
      if (el.scrollTop > 0) el.scrollTop = 0;
    }
  }

  function formReady() {
    const text = document.body ? document.body.innerText || "" : "";
    return text.includes("商品名称") || text.includes("上传主图");
  }

  function waitForCreateForm() {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (userStop) {
          clearInterval(timer);
          reject(new Error("已停止"));
          return;
        }
        if (formReady()) {
          clearInterval(timer);
          resolve();
          return;
        }
        if (Date.now() - started > 20000) {
          clearInterval(timer);
          reject(new Error("添加商品页还没有出来"));
        }
      }, 300);
    });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function readLoop() {
    try {
      return JSON.parse(sessionStorage.getItem(loopKey) || "null");
    } catch (error) {
      return null;
    }
  }

  function writeLoop(state) {
    sessionStorage.setItem(loopKey, JSON.stringify(state));
    return new Promise((resolve) => {
      try {
        chrome.storage.session.set({ [loopKey]: state }, () => resolve());
      } catch (error) {
        resolve();
      }
    });
  }

  function readSharedLoop() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value || null);
      };
      const timer = setTimeout(() => finish(readLoop()), 1500);
      try {
        chrome.storage.session.get(loopKey, (stored) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            finish(readLoop());
            return;
          }
          const shared = stored && stored[loopKey];
          const local = readLoop();
          if (shared && shared.running) finish(shared);
          else if (local && local.running) finish(local);
          else finish(shared || local);
        });
      } catch (error) {
        clearTimeout(timer);
        finish(readLoop());
      }
    });
  }

  let messageID = 0;
  let userStop = false;
  let leaveAsked = false;
  let parked = false;
  let stopCancel = null;

  function requestStop() {
    userStop = true;
    try {
      window.postMessage({ source: "lianpu-fill", type: "stop-fill" }, "*");
    } catch {
      // The page can reject the message while it is unloading.
    }
    if (stopCancel) {
      const cancel = stopCancel;
      stopCancel = null;
      cancel();
    }
  }

  function pageMessage(payload, timeout = 20000) {
    const id = ++messageID;
    return new Promise((resolve, reject) => {
      if (userStop) {
        reject(new Error("已停止"));
        return;
      }
      let settled = false;
      let timer = 0;
      function finish(fn) {
        if (settled) return;
        settled = true;
        if (stopCancel === cancel) stopCancel = null;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        fn();
      }
      function cancel() {
        finish(() => reject(new Error("已停止")));
      }
      timer = setTimeout(() => {
        finish(() => reject(new Error("页面没有响应")));
      }, timeout);
      stopCancel = cancel;
      function onMessage(event) {
        if (event.source !== window || !event.data || event.data.source !== "lianpu-fill" || event.data.type !== "result" || event.data.id !== id) return;
        const result = event.data.result || { ok: false, message: "页面没有返回结果" };
        if (!result.ok) {
          finish(() => reject(new Error(result.message || "页面操作失败")));
          return;
        }
        finish(() => resolve(result));
      }
      window.addEventListener("message", onMessage);
      window.postMessage({ source: "lianpu-fill", id, ...payload }, "*");
    });
  }

  function ask(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error((response && response.message) || "请求失败"));
          return;
        }
        resolve(response.data);
      });
    });
  }
})();
