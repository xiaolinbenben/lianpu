(() => {
  const pageVersion = 56;
  if (window.__lianpuFill === pageVersion) return;
  window.__lianpuFill = pageVersion;

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "lianpu-fill") return;
    const message = event.data;
    if (message.type === "stop-fill") {
      stopped = true;
      return;
    }
    const runners = {
      "fill-title": () => fillTitle(message.title),
      "upload-image": () => uploadImage(),
      "select-category": () => selectCategory(message.path),
      "select-brand": () => selectNoBrand(),
      "fill-detail": () => fillDetail(message.detail),
      "select-sales": () => selectSales(message.plan, message.images),
      "select-size-chart": () => selectSizeChart(),
      "select-compliance": () => selectCompliance(),
      "fill-logistics": () => fillLogistics(message.weight, message.size),
      "open-create": () => openCreateProduct(),
      "save-draft": () => saveDraftAndBack(),
      "discard-changes": () => discardChanges(),
    };
    const run = runners[message.type];
    if (!run) return;
    stopped = false;
    Promise.resolve(run())
      .then((result) => reply(message.id, result))
      .catch((error) => reply(message.id, { ok: false, message: error instanceof Error ? error.message : "页面操作失败" }));
  });

  let stopped = false;

  function reply(id, result) {
    window.postMessage({ source: "lianpu-fill", type: "result", id, result }, "*");
  }

  // 分区（函数都在这个立即执行函数里，顺序不影响调用）：
  // 主图和标题 fillTitle / uploadImage
  // 类目 selectCategory；品牌 selectNoBrand；详情 fillDetail
  // 变体 selectSales、addSalesAttribute、uploadVariantImages、fillColorRows
  // 尺码表 selectSizeChart；合规 selectCompliance；物流 fillLogistics
  // 打开和草稿 openCreateProduct / saveDraftAndBack

  function fillTitle(title) {
    const value = String(title || "").trim();
    if (!value) return { ok: false, message: "这件商品没有标题" };
    const label = findLabel("商品名称");
    const input = label ? controlNear(label) : null;
    if (!input) return { ok: false, message: "页面上没有找到商品名称输入框" };
    setControlValue(input, value);
    input.focus();
    const written = "value" in input ? input.value : input.textContent;
    if (String(written || "").trim() !== value) return { ok: false, message: "商品名称没有写进去" };
    return { ok: true, message: "商品名称已写入，共 " + [...value].length + " 个字符" };
  }

  async function uploadImage() {
    await clickSection("基本信息");
    const image = await testImage();
    const inputs = productImageInputs();
    if (inputs.length === 0) return { ok: false, message: "页面上没有找到商品图片上传框" };
    for (const input of inputs) {
      const transfer = new DataTransfer();
      transfer.items.add(image);
      input.files = transfer.files;
      const count = input.files ? input.files.length : 0;
      if (count !== 1) continue;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, message: "测试图已交给商品图片上传框，600×600" };
    }
    return { ok: false, message: "主图没有放进上传框" };
  }

  function sizeChartImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 800;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 800, 800);
    context.fillStyle = "#111827";
    context.strokeStyle = "#111827";
    context.lineWidth = 2;
    context.font = "32px PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, sans-serif";
    context.fillText("尺码表", 48, 72);
    const rows = [
      ["尺码", "胸围(cm)", "衣长(cm)"],
      ["S", "88", "60"],
      ["M", "92", "62"],
      ["L", "96", "64"],
    ];
    const top = 110;
    const rowHeight = 140;
    const cols = [48, 300, 540, 752];
    context.font = "30px PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, sans-serif";
    rows.forEach((row, rowIndex) => {
      const y = top + rowIndex * rowHeight;
      context.strokeRect(cols[0], y, cols[3] - cols[0], rowHeight);
      for (let col = 1; col < cols.length - 1; col += 1) {
        context.beginPath();
        context.moveTo(cols[col], y);
        context.lineTo(cols[col], y + rowHeight);
        context.stroke();
      }
      row.forEach((cell, col) => context.fillText(cell, cols[col] + 28, y + 82));
    });
    return canvasFile(canvas, "lianpu-size-chart.png");
  }

  function testImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 600;
    const context = canvas.getContext("2d");
    context.fillStyle = "#1d4ed8";
    context.fillRect(0, 0, 600, 600);
    context.fillStyle = "#ffffff";
    context.font = "bold 48px sans-serif";
    context.fillText("Lianpu test", 150, 310);
    return canvasFile(canvas, "lianpu-test.png");
  }

  function canvasFile(canvas, name) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("测试图没有生成"));
          return;
        }
        resolve(new File([blob], name, { type: "image/png" }));
      }, "image/png");
    });
  }

  function findLabel(name) {
    let best = null;
    let bestArea = Infinity;
    for (const el of document.querySelectorAll("label, span, div, p")) {
      const text = ownText(el);
      if (text !== name && !(text.startsWith(name) && text.length <= name.length + 2)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  function ownText(el) {
    let text = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    }
    return text.replace(/\s+/g, " ").trim();
  }

  function controlNear(label) {
    const labelRect = label.getBoundingClientRect();
    const inputs = [...document.querySelectorAll("input, textarea")].filter((input) => {
      const type = (input.getAttribute("type") || "text").toLowerCase();
      if (type === "hidden" || type === "file" || type === "checkbox" || type === "radio") return false;
      const rect = input.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 16) return false;
      return rect.top >= labelRect.top - 8 && rect.top < labelRect.bottom + 160;
    });
    inputs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return inputs[0] || null;
  }

  function setControlValue(input, value) {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function productImageInputs() {
    return [...document.querySelectorAll("input[type='file']")]
      .filter((input) => !ancestorText(input).includes("尺码"))
      .sort((a, b) => imageScore(b) - imageScore(a));
  }

  function imageScore(input) {
    const around = ancestorText(input);
    let score = 0;
    if (around.includes("主图") || around.includes("商品图片") || around.includes("商品图")) score += 5;
    if ((input.accept || "").toLowerCase().includes("image")) score += 1;
    return score;
  }

  function ancestorText(el) {
    let text = "";
    let node = el;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      text += " " + (node.innerText || "");
      node = node.parentElement;
    }
    return text;
  }

  async function selectCategory(path) {
    const names = Array.isArray(path) ? path.map((item) => String(item || "").trim()).filter(Boolean) : [];
    if (names.length < 2) return { ok: false, message: "类目路径不完整" };
    const expected = names.join(" - ");
    if (categoryMatches(expected, names)) return { ok: true, message: "类目已选中：" + expected };
    const opened = await openCategory();
    if (!opened.ok) return opened;
    const searched = await pickBySearch(names, expected);
    let via = "搜索";
    if (!searched.ok) {
      via = "逐级点选";
      await clearSearch(names[0]);
      let walked = await walkCategories(names);
      if (!walked.ok) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
        await delay(200);
        const again = await openCategory();
        if (again.ok) {
          await clearSearch(names[0]);
          walked = await walkCategories(names);
        }
      }
      if (!walked.ok) return { ok: false, message: searched.message + "。" + walked.message };
    }
    const confirmed = await confirmCategory(expected, names);
    if (!confirmed) {
      const current = readCategory();
      return { ok: false, message: "类目没有停在目标上。当前是「" + (current || "空") + "」" };
    }
    return { ok: true, message: "类目已选中：" + expected + "（" + via + "）" };
  }

  async function openCategory() {
    if (categoryMenuOpen()) return { ok: true };
    const label = findFieldLabel("类目");
    if (!label) return { ok: false, message: "页面上没有找到类目" };
    label.scrollIntoView({ block: "center", inline: "nearest" });
    await delay(150);
    const points = categoryClickPoints();
    if (points.length === 0) return { ok: false, message: "页面上没有找到类目选择框" };
    const modes = ["click", "down", "native"];
    for (let index = 0; index < points.length; index += 1) {
      clickAt(points[index][0], points[index][1], modes[index] || "click");
      const opened = await waitFor(() => categoryMenuOpen(), 700);
      if (opened) return { ok: true };
    }
    return { ok: false, message: "类目下拉没有打开" };
  }

  async function pickBySearch(names, expected) {
    const input = categorySearchInput();
    if (!input) return { ok: false, message: "类目搜索框没有出现" };
    setNativeValue(input, names[names.length - 1]);
    const row = await waitFor(() => pathRow(expected, names), 5000);
    if (!row) return { ok: false, message: "搜索没有出现整条类目" };
    clickElement(row);
    return { ok: true };
  }

  async function clearSearch(rootName) {
    const input = categorySearchInput();
    if (input && input.value) setNativeValue(input, "");
    if (rootName) {
      await waitFor(() => nameRow(rootName), 2500);
      return;
    }
    await delay(200);
  }

  async function walkCategories(names) {
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      const row = await waitFor(() => nameRow(name), 2000);
      if (!row) return { ok: false, message: "逐级点选时没有找到「" + name + "」" };
      clickElement(row);
      await delay(300);
    }
    return { ok: true };
  }

  async function confirmCategory(expected, names) {
    return waitFor(() => categoryMatches(expected, names), 2000);
  }

  function categoryMenuOpen() {
    return Boolean(categorySearchInput() || visibleOwnText("所有类目"));
  }

  function categoryClickPoints() {
    const label = findFieldLabel("类目");
    if (!label) return [];
    const labelRect = label.getBoundingClientRect();
    const points = [];
    const value = categoryValueElement();
    const box = value ? categoryBox(value) : null;
    const combo = categoryCombo(labelRect);
    const target = combo || box;
    if (target) {
      const rect = target.getBoundingClientRect();
      points.push([rect.left + Math.min(48, rect.width / 2), rect.top + rect.height / 2]);
      points.push([rect.right - 22, rect.top + rect.height / 2]);
      points.push([rect.left + rect.width / 2, rect.top + rect.height / 2]);
    }
    points.push([labelRect.left + 80, labelRect.bottom + 28]);
    return points.filter((point) => point[0] > 0 && point[1] > 0 && point[1] < window.innerHeight);
  }

  function categoryCombo(labelRect) {
    return [...document.querySelectorAll("[role='combobox'], [aria-haspopup='listbox']")].find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 200 && rect.height >= 24 && rect.height <= 80 && rect.top >= labelRect.bottom - 8 && rect.top <= labelRect.bottom + 80;
    }) || null;
  }

  function categoryValueElement() {
    const label = findFieldLabel("类目");
    if (!label) return null;
    const labelRect = label.getBoundingClientRect();
    let best = null;
    let bestArea = Infinity;
    for (const el of document.querySelectorAll("div, span")) {
      const rect = el.getBoundingClientRect();
      if (rect.top < labelRect.bottom - 4 || rect.top > labelRect.bottom + 70) continue;
      if (rect.height < 12 || rect.height > 48 || rect.width < 40) continue;
      const text = canon(el.innerText || "");
      if (!text.includes(" - ") || text.startsWith("所有类目") || text.length > 80) continue;
      if ([...el.children].some((child) => canon(child.innerText || "") === text)) continue;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  function categoryBox(value) {
    let node = value;
    let best = value;
    for (let depth = 0; depth < 6 && node.parentElement; depth += 1) {
      const parent = node.parentElement;
      const rect = parent.getBoundingClientRect();
      if (rect.height > 80 || rect.width > window.innerWidth * 0.95) break;
      if (rect.width >= 280 && rect.height >= 28 && rect.height <= 72) best = parent;
      node = parent;
    }
    return best;
  }

  function categorySearchInput() {
    const label = findFieldLabel("类目");
    const labelRect = label ? label.getBoundingClientRect() : null;
    return [...document.querySelectorAll("input")].find((input) => {
      const placeholder = (input.getAttribute("placeholder") || "").replace(/\s+/g, "");
      if (placeholder !== "搜索" && placeholder !== "搜索类目") return false;
      const rect = input.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 12 || rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
      if (!labelRect) return true;
      return rect.top >= labelRect.bottom - 4 && rect.top <= labelRect.bottom + 360;
    }) || null;
  }

  function categoryMatches(expected, names) {
    const current = readCategory();
    if (!current) return false;
    if (current === canon(expected)) return true;
    return names.every((name) => current.split(" - ").includes(name));
  }

  function readCategory() {
    const label = findFieldLabel("类目");
    if (!label) return "";
    const labelRect = label.getBoundingClientRect();
    let best = "";
    for (const el of document.querySelectorAll("div, span, input, textarea")) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 8 || rect.height > 88) continue;
      if (rect.top < labelRect.bottom - 8 || rect.top > labelRect.bottom + 100) continue;
      const raw = el.value ? el.value : el.innerText || "";
      const text = canon(raw);
      if (!text || text.startsWith("所有类目") || text.length > 160 || text.length <= best.length) continue;
      const parts = text.split(" - ").filter(Boolean);
      if (parts.length < 2) continue;
      best = text;
    }
    return best;
  }

  function pathRow(expected, names) {
    const exact = textRow(expected, true);
    if (exact || !Array.isArray(names) || names.length === 0) return exact;
    const input = categorySearchInput();
    const top = input ? input.getBoundingClientRect().bottom : 0;
    const rows = [];
    for (const el of document.querySelectorAll("li, div, span, a, p")) {
      const text = canon(el.innerText || "");
      if (!text || text.length > 160 || !names.every((name) => text.includes(name))) continue;
      if ([...el.children].some((child) => names.every((name) => canon(child.innerText || "").includes(name)))) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 16 || rect.height > 80) continue;
      if (rect.top < top - 4 || rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
      rows.push(el);
    }
    rows.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.width * ra.height - rb.width * rb.height;
    });
    return rows[0] || null;
  }

  function nameRow(name) {
    return textRow(name, false);
  }

  function textRow(expected, fullPath) {
    const input = categorySearchInput();
    const top = input ? input.getBoundingClientRect().bottom : 0;
    const rows = [];
    for (const el of document.querySelectorAll("li, div, span, a, p")) {
      if (canon(el.innerText || "") !== expected) continue;
      if ([...el.children].some((child) => canon(child.innerText || "") === expected)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < (fullPath ? 80 : 40) || rect.height < 16 || rect.height > 80) continue;
      if (rect.top < top - 4 || rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
      rows.push(el);
    }
    rows.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (fullPath) return ra.width * ra.height - rb.width * rb.height;
      if (Math.abs(ra.width - rb.width) > 20) return rb.width - ra.width;
      return rb.top - ra.top;
    });
    return rows[0] || null;
  }

  function findFieldLabel(name) {
    const direct = findLabel(name);
    if (direct) return direct;
    let best = null;
    let bestArea = Infinity;
    for (const el of document.querySelectorAll("label, span, div, p")) {
      if (ownText(el).replace(/^\*\s*/, "") !== name) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  function setNativeValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    const tracker = input._valueTracker;
    if (tracker) tracker.setValue(input.value);
    if (descriptor && descriptor.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: value ? "insertText" : "deleteContentBackward" }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clickElement(el) {
    const target = el.closest("li") || el;
    const rect = target.getBoundingClientRect();
    clickAt(rect.left + rect.width / 2, rect.top + rect.height / 2, "click");
  }

  function clickAt(x, y, mode) {
    const target = document.elementFromPoint(x, y);
    if (!target || target.shadowRoot) return false;
    const down = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, buttons: 1 };
    const up = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, buttons: 0 };
    if (mode !== "native") {
      target.dispatchEvent(new PointerEvent("pointerdown", down));
      target.dispatchEvent(new MouseEvent("mousedown", down));
      target.dispatchEvent(new PointerEvent("pointerup", up));
      target.dispatchEvent(new MouseEvent("mouseup", up));
    }
    if (mode === "native") target.click();
    else if (mode !== "down") target.dispatchEvent(new MouseEvent("click", up));
    return true;
  }

  function canon(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[>＞›»/|｜]/g, "-")
      .replace(/[－—–‑−]/g, "-")
      .replace(/[·•]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/\s*-\s*/g, " - ")
      .trim();
  }

  function waitFor(read, timeout) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (stopped) {
          clearInterval(timer);
          reject(new Error("已停止"));
          return;
        }
        let value = null;
        try {
          value = read();
        } catch {
          value = null;
        }
        if (value) {
          clearInterval(timer);
          resolve(value);
          return;
        }
        if (Date.now() - start >= timeout) {
          clearInterval(timer);
          resolve(null);
        }
      }, 100);
    });
  }

  function delay(ms) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (stopped) {
          clearInterval(timer);
          reject(new Error("已停止"));
          return;
        }
        if (Date.now() - start >= ms) {
          clearInterval(timer);
          resolve();
        }
      }, Math.min(200, Math.max(ms, 1)));
    });
  }

  async function selectNoBrand() {
    if (!brandMenuOpen() && !noBrandChoice()) {
      const opened = await openBrandBox();
      if (!opened.ok) return opened;
    }
    let confirmed = false;
    for (let attempt = 0; attempt < 2 && !confirmed; attempt += 1) {
      revealBrandFooter();
      const choice = await waitFor(() => noBrandChoice(), attempt === 0 ? 2500 : 1200);
      if (!choice) continue;
      choice.scrollIntoView({ block: "center", inline: "nearest" });
      await delay(200);
      directClick(brandChoiceTarget(choice));
      confirmed = await waitFor(() => brandFieldChosen(), 2000);
    }
    if (!confirmed) return { ok: false, message: noBrandChoice() ? "点了无品牌，品牌框里还不是无品牌" : "没有找到选择无品牌" };
    return { ok: true, message: "已选择无品牌" };
  }

  function brandChoiceTarget(choice) {
    let node = choice;
    let best = choice;
    for (let depth = 0; depth < 5 && node; depth += 1) {
      if (plainBrand(node.innerText || "") !== "选择无品牌") break;
      best = node;
      node = node.parentElement;
    }
    return best;
  }

  function revealBrandFooter() {
    const input = brandSearchInput();
    let node = input ? input.parentElement : null;
    for (let depth = 0; depth < 6 && node; depth += 1) {
      if (node.scrollHeight > node.clientHeight + 20) node.scrollTop = node.scrollHeight;
      node = node.parentElement;
    }
  }

  function brandSearchInput() {
    return [...document.querySelectorAll("input")].find((input) => {
      const placeholder = (input.getAttribute("placeholder") || "").replace(/\s+/g, "");
      const rect = input.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 10) return false;
      return placeholder.includes("品牌中搜索") || placeholder.includes("万多个品牌");
    }) || null;
  }

  function brandFieldChosen() {
    if (fieldShows("品牌", "无品牌")) return true;
    const label = findFieldLabel("品牌");
    if (!label) return false;
    const labelRect = label.getBoundingClientRect();
    const inputs = [...document.querySelectorAll("input")].some((input) => {
      const rect = input.getBoundingClientRect();
      if (rect.top < labelRect.bottom - 8 || rect.top > labelRect.bottom + 70) return false;
      const value = plainBrand(input.value || "");
      return value === "无品牌";
    });
    if (inputs) return true;
    const chosen = exactLeaf("无品牌");
    if (!chosen) return false;
    const rect = chosen.getBoundingClientRect();
    if (rect.top < labelRect.bottom - 8 || rect.top > labelRect.bottom + 48) return false;
    return plainBrand(chosen.innerText || ownText(chosen)) === "无品牌";
  }

  async function openBrandBox() {
    await clickSection("基本信息");
    let anchor = brandAnchor();
    if (!anchor) anchor = await revealExact("品牌");
    if (!anchor) anchor = await revealExact("选择品牌");
    if (!anchor) return { ok: false, message: "页面上没有找到品牌" };
    anchor.scrollIntoView({ block: "center", inline: "nearest" });
    await delay(250);
    const box = boxBelow(findFieldLabel("品牌") || anchor);
    const rect = box.getBoundingClientRect();
    const points = [
      [rect.left + Math.min(160, Math.max(rect.width / 2, 24)), rect.top + rect.height / 2],
      [rect.right - 22, rect.top + rect.height / 2],
    ];
    for (const point of points) {
      if (point[1] <= 0 || point[1] >= window.innerHeight) continue;
      clickAt(point[0], point[1], "click");
      const opened = await waitFor(() => brandMenuOpen() || noBrandChoice(), 1000);
      if (opened) return { ok: true };
    }
    return { ok: false, message: "品牌下拉没有打开" };
  }

  function brandAnchor() {
    const label = findFieldLabel("品牌");
    if (label) return label;
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      const placeholder = el.getAttribute ? (el.getAttribute("placeholder") || "").replace(/\s+/g, "") : "";
      const text = plainBrand(ownText(el) || (el.childElementCount === 0 ? el.innerText || "" : ""));
      if (placeholder !== "选择品牌" && text !== "选择品牌" && text !== "品牌") return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function boxBelow(label) {
    const labelRect = label.getBoundingClientRect();
    const boxes = [];
    for (const el of document.querySelectorAll("div")) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 240 || rect.height < 30 || rect.height > 52) continue;
      if (rect.top < labelRect.bottom - 2 || rect.top > labelRect.bottom + 40) continue;
      boxes.push(el);
    }
    boxes.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top - rb.top || rb.width - ra.width;
    });
    return boxes[0] || label;
  }

  function brandMenuOpen() {
    return [...document.querySelectorAll("input")].some((input) => {
      const placeholder = (input.getAttribute("placeholder") || "").replace(/\s+/g, "");
      const rect = input.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 10 || rect.top <= 0 || rect.top >= window.innerHeight) return false;
      return placeholder.includes("品牌中搜索") || placeholder.includes("万多个品牌");
    });
  }

  function noBrandChoice() {
    const search = brandSearchInput();
    const origin = search ? search.getBoundingClientRect() : null;
    let best = null;
    let bestScore = Infinity;
    eachElement((el) => {
      if (plainBrand(el.innerText || "") !== "选择无品牌") return;
      if ([...el.children].some((child) => plainBrand(child.innerText || "") === "选择无品牌")) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 16 || rect.height < 8 || rect.width > 640) return;
      if (rect.bottom <= 0 || rect.top >= window.innerHeight + 240) return;
      const distance = origin ? Math.abs(rect.top - origin.bottom) : rect.top;
      const score = distance + rect.width * rect.height / 4000;
      if (score < bestScore) {
        best = el;
        bestScore = score;
      }
    });
    return best;
  }

  function plainBrand(text) {
    return String(text || "").replace(/\s+/g, "").replace(/["“”„‟「」『』]/g, "");
  }

  async function revealExact(name) {
    let found = exactLeaf(name);
    if (found) return found;
    const targets = [document.scrollingElement || document.documentElement, ...scrollContainers()];
    for (const scroller of targets) {
      const view = scroller.clientHeight || window.innerHeight;
      const max = Math.max(0, scroller.scrollHeight - view);
      const step = Math.max(180, view * 0.55);
      for (let top = 0; top <= max + 1; top += step) {
        if (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) window.scrollTo(0, top);
        else scroller.scrollTop = top;
        await delay(80);
        found = exactLeaf(name);
        if (found) return found;
      }
    }
    return exactLeaf(name);
  }

  function exactLeaf(name) {
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      const placeholder = el.getAttribute ? el.getAttribute("placeholder") || "" : "";
      const raw = ownText(el) || placeholder || (el.childElementCount === 0 ? el.innerText || el.value || "" : "");
      const text = raw.replace(/\s+/g, "").replace(/^[*＊✱]+/, "").replace(/[?？]+$/, "");
      if (text !== name) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function eachElement(visit) {
    const stack = [document];
    const seen = new Set();
    while (stack.length) {
      const root = stack.pop();
      if (!root || seen.has(root) || !root.querySelectorAll) continue;
      seen.add(root);
      for (const el of root.querySelectorAll("*")) {
        visit(el);
        if (el.shadowRoot) stack.push(el.shadowRoot);
      }
    }
  }

  function scrollContainers() {
    const list = [];
    for (const el of document.querySelectorAll("div, main, section")) {
      if (el.clientHeight > 240 && el.scrollHeight > el.clientHeight + 120) list.push(el);
    }
    list.sort((a, b) => b.clientHeight - a.clientHeight);
    return list.slice(0, 3);
  }

  function fieldShows(name, needle) {
    const label = findFieldLabel(name);
    if (!label) return false;
    const labelRect = label.getBoundingClientRect();
    for (const el of document.querySelectorAll("div, span")) {
      const rect = el.getBoundingClientRect();
      if (rect.top < labelRect.bottom - 4 || rect.top > labelRect.bottom + 56) continue;
      if (rect.height < 16 || rect.height > 48 || rect.width < 60) continue;
      const text = (el.innerText || "").replace(/\s+/g, "");
      if (text.includes(needle) && text.length < 40) return true;
    }
    return false;
  }

  async function fillDetail(detail) {
    const text = String(detail || "").trim();
    if (!text) return { ok: false, message: "没有商品详情" };
    await clickSection("商品详情");
    const label = findFieldLabel("描述") || findFieldLabel("商品详情");
    if (!label) return { ok: false, message: "页面上没有找到商品详情" };
    label.scrollIntoView({ block: "center", inline: "nearest" });
    await delay(200);
    const editor = editorNear(label);
    if (!editor) return { ok: false, message: "页面上没有找到商品详情输入框" };
    editor.focus();
    const inserted = document.execCommand("insertText", false, text);
    if (!inserted) {
      editor.textContent = text;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    }
    const written = (editor.innerText || editor.value || "").replace(/\s+/g, " ").trim();
    if (!written.includes(text.slice(0, 8))) return { ok: false, message: "商品详情没有写进去" };
    return { ok: true, message: "商品详情已写入" };
  }

  function editorNear(label) {
    const labelRect = label.getBoundingClientRect();
    const editors = [...document.querySelectorAll("textarea, [contenteditable='true'], [role='textbox']")].filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 80 && rect.height > 16 && rect.top >= labelRect.top - 8 && rect.top < labelRect.bottom + 220;
    });
    editors.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return editors[0] || null;
  }

  async function selectSales(plan, images) {
    const attributes = plan && Array.isArray(plan.attributes) ? plan.attributes : [];
    if (attributes.length === 0) return { ok: false, message: "没有变体方案" };
    if (!Array.isArray(plan.skus) || plan.skus.length === 0) return { ok: false, message: "表格里没有 SKU" };
    await clickSection("销售信息");
    const choice = exactText("一口价");
    if (!choice) return { ok: false, message: "没有找到一口价" };
    choice.scrollIntoView({ block: "center", inline: "nearest" });
    clickElement(choice);
    await delay(200);
    const opened = await ensureVariantSwitch();
    if (!opened.ok) return opened;
    for (let index = 0; index < attributes.length; index += 1) {
      const written = await addSalesAttribute(attributes[index], index);
      if (!written.ok) return written;
    }
    const rows = skuPlan(plan.skus);
    if (rows.size === 0) return { ok: false, message: "表格里没有可填写的 SKU" };
    const pending = new Set(rows.keys());
    const pictured = await uploadVariantImages(attributes[0], images || {}, rows, pending);
    if (!pictured.ok) return pictured;
    if (pending.size) {
      const left = rows.get(pending.values().next().value);
      return { ok: false, message: "还有 SKU 没写上零售价：" + (left ? left.values.join(" / ") : "") };
    }
    return {
      ok: true,
      message: "已按表格写入 " + attributes.length + " 个变体维度，" + plan.skus.length + " 个 SKU 的库存和零售价",
    };
  }

  async function ensureVariantSwitch() {
    const label = exactText("添加变体") || findFieldLabel("添加变体");
    if (!label) return { ok: false, message: "没有找到添加变体" };
    label.scrollIntoView({ block: "center", inline: "nearest" });
    await delay(200);
    if (salesAttributeReady()) return { ok: true };
    const control = variantSwitch(label);
    if (!control) return { ok: false, message: "没有找到添加变体右边的开关" };
    if (!switchIsOn(control)) clickVariantSwitch(label, control);
    const ready = await waitFor(() => salesAttributeReady(), 5000);
    if (ready) return { ok: true };
    if (switchIsOn(control)) return { ok: false, message: "添加变体已打开，属性区没有出现" };
    return { ok: false, message: "点了添加变体右边的开关，属性区没有出现" };
  }

  function variantSwitch(label) {
    const rect = label.getBoundingClientRect();
    const labelMid = rect.top + rect.height / 2;
    let best = null;
    let bestScore = Infinity;
    eachElement((el) => {
      if (el === label || el.contains(label)) return;
      const text = compactLabel(ownText(el) || "");
      if (text.includes("添加变体")) return;
      const box = el.getBoundingClientRect();
      if (box.width < 20 || box.height < 14 || box.width > 68 || box.height > 34) return;
      if (box.left < rect.right - 8 || box.left > rect.right + 40) return;
      if (Math.abs(box.top + box.height / 2 - labelMid) > 12) return;
      const role = (el.getAttribute && el.getAttribute("role")) || "";
      const type = ((el.getAttribute && el.getAttribute("type")) || "").toLowerCase();
      const cls = classText(el).toLowerCase();
      const semantic = role === "switch" || type === "checkbox" || cls.includes("switch");
      const ratio = box.width / box.height;
      if (!semantic && (ratio < 1.35 || ratio > 3.4)) return;
      const score = (semantic ? 0 : 100) + (box.left - rect.right) + box.width * box.height / 100;
      if (score < bestScore) {
        best = el;
        bestScore = score;
      }
    });
    return best;
  }

  function clickVariantSwitch(label, control) {
    const box = control.getBoundingClientRect();
    const input = control.matches && control.matches("input[type='checkbox']")
      ? control
      : control.querySelector && control.querySelector("input[type='checkbox']");
    if (input) {
      input.click();
      return;
    }
    let x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    for (let step = 0; step < 6; step += 1) {
      const hit = document.elementFromPoint(x, y);
      if (!hit || !variantLabelHit(hit, label)) break;
      x = Math.min(box.right - 2, x + 6);
    }
    clickAt(x, y, "click");
  }

  function variantLabelHit(hit, label) {
    if (hit === label || label.contains(hit) || hit.contains(label)) return true;
    const text = compactLabel(ownText(hit) || hit.innerText || "");
    return text === "添加变体";
  }

  function switchIsOn(control) {
    if (switchOn(control)) return true;
    const nodes = [control];
    if (control.querySelectorAll) {
      for (const child of control.querySelectorAll("*")) {
        nodes.push(child);
        if (nodes.length > 8) break;
      }
    }
    for (const node of nodes) {
      if (node.getAttribute && node.getAttribute("aria-checked") === "true") return true;
      if (node.matches && node.matches("input") && node.checked) return true;
      const style = window.getComputedStyle(node);
      const before = window.getComputedStyle(node, "::before");
      const after = window.getComputedStyle(node, "::after");
      if (tealBackground(style.backgroundColor) || tealBackground(before.backgroundColor) || tealBackground(after.backgroundColor)) return true;
    }
    return false;
  }

  function tealBackground(color) {
    const match = String(color || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return false;
    const alpha = match[4] == null ? 1 : Number(match[4]);
    if (alpha < 0.5) return false;
    const red = Number(match[1]);
    const green = Number(match[2]);
    const blue = Number(match[3]);
    return green > 120 && blue > 120 && red < 140 && green + blue > red * 2.2;
  }

  function switchOn(control) {
    let node = control;
    for (let depth = 0; depth < 3 && node; depth += 1) {
      if (node.getAttribute && node.getAttribute("aria-checked") === "true") return true;
      if (node.matches && node.matches("input") && node.checked) return true;
      const cls = classText(node);
      if (cls.includes("switch-checked") || cls.includes("arco-switch-checked")) return true;
      node = node.parentElement;
    }
    return false;
  }

  function classText(el) {
    if (!el) return "";
    if (typeof el.className === "string") return el.className;
    return (el.getAttribute && el.getAttribute("class")) || "";
  }

  function salesAttributeReady() {
    return Boolean(textEl("变体名称") || textEl("商品变量"));
  }

  function textEl(name) {
    const want = compactLabel(name);
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      if (compactLabel(ownText(el)) !== want && labelText(el) !== want) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function englishSaleName(attr) {
    const candidates = [attr && attr.name].concat(Array.isArray(attr && attr.labels) ? attr.labels : []);
    for (const item of candidates) {
      const raw = String(item || "").trim();
      const key = raw.toLowerCase();
      if (key === "color" || key === "colour" || raw === "颜色") return "Color";
      if (key === "size" || raw === "尺码" || raw === "尺寸") return "Size";
      if (key === "material" || raw === "材质") return "material";
    }
    const raw = String((attr && attr.name) || "").trim();
    if (!raw || /[\u4e00-\u9fff]/.test(raw)) return "";
    return raw;
  }

  async function addSalesAttribute(attr, index) {
    const sale = englishSaleName(attr);
    if (!sale) return { ok: false, message: "变体名称不能用中文" };
    const ready = await ensureVariantCard(index);
    if (!ready) return { ok: false, message: index === 0 ? "没有找到变体名称" : "点了添加变体，没有出现新的变体名称" };
    const values = Array.isArray(attr.values) ? attr.values : [];
    if (!saleAlreadyChosen(index, sale, values)) {
      const chosen = await chooseOrCreate(
        () => {
          const current = variantNameLabels()[index];
          return current ? nameField(current) : null;
        },
        [sale],
        (name) => saleAlreadyChosen(index, name, values),
      );
      if (!chosen) return { ok: false, message: chooseFault || "变体名称没有写成 " + sale };
    }
    for (const item of values) {
      const value = String((item && item.value) || "").trim();
      if (!value) return { ok: false, message: "变体属性值是空的" };
      if (optionShows(index, value)) continue;
      const anchor = variantNameLabels()[index];
      if (anchor) anchor.scrollIntoView({ block: "center", inline: "nearest" });
      let plain = plainOptionInput(index);
      if (!plain && !optionFields(index).some((field) => controlValue(field))) {
        plain = await waitFor(() => plainOptionInput(index), 1500);
      }
      if (!plain) {
        const added = await clickAddOption(index);
        if (!added.ok) return added;
        plain = await waitFor(() => plainOptionInput(index), 3000);
      }
      if (!plain) return { ok: false, message: "没有找到「" + sale + "」的选项输入框" };
      const typed = await typePlainOption(plain, value, index);
      if (!typed) return { ok: false, message: "选项没有写进去：" + value };
    }
    return { ok: true };
  }

  async function ensureVariantCard(index) {
    const existing = variantNameLabels();
    if (existing[index]) return existing[index];
    if (existing.length !== index) return null;
    const add = addVariantButton();
    if (!add) return null;
    add.scrollIntoView({ block: "center", inline: "nearest" });
    await delay(100);
    const handlers = nearestHandlers(add);
    if (handlers) callFirst(handlers, ["onClick", "onMouseDown", "onPointerDown"]);
    let next = await waitFor(() => {
      const found = variantNameLabels();
      return found.length > index ? found : null;
    }, 1000);
    if (!next) {
      nativeClick(add);
      next = await waitFor(() => {
        const found = variantNameLabels();
        return found.length > index ? found : null;
      }, 3000);
    }
    return next ? next[index] : null;
  }

  function variantNameLabels() {
    const list = textEl("变体列表");
    const listTop = list ? list.getBoundingClientRect().top : Infinity;
    const found = [];
    eachElement((el) => {
      if (compactLabel(ownText(el)) !== "变体名称" && labelText(el) !== "变体名称") return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8 || rect.width > 180 || rect.height > 40) return;
      if (rect.top >= listTop - 4) return;
      const dup = found.find((item) => Math.abs(item.getBoundingClientRect().top - rect.top) < 8);
      if (!dup) found.push(el);
      else if (rect.width * rect.height < dup.getBoundingClientRect().width * dup.getBoundingClientRect().height) found[found.indexOf(dup)] = el;
    });
    found.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return found;
  }

  function addVariantButton() {
    const names = variantNameLabels();
    const floor = names.length ? names[0].getBoundingClientRect().bottom : 0;
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      const text = compactLabel(ownText(el));
      if (text !== "添加变体" && text !== "+添加变体") return;
      const rect = el.getBoundingClientRect();
      if (rect.top < floor || rect.width < 8 || rect.height < 8 || rect.width > 200 || rect.height > 48) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function cardBottom(nameLabel) {
    const top = nameLabel.getBoundingClientRect().top;
    let bottom = top + 720;
    for (const other of variantNameLabels()) {
      const y = other.getBoundingClientRect().top;
      if (y > top + 8 && y < bottom) bottom = y;
    }
    const list = textEl("变体列表");
    if (list) {
      const y = list.getBoundingClientRect().top;
      if (y > top + 8 && y < bottom) bottom = y;
    }
    return bottom;
  }

  function optionLabel(nameLabel) {
    const floor = nameLabel.getBoundingClientRect().bottom - 4;
    const ceiling = cardBottom(nameLabel);
    let best = null;
    eachElement((el) => {
      if (compactLabel(ownText(el)) !== "选项" && labelText(el) !== "选项") return;
      const rect = el.getBoundingClientRect();
      if (rect.top < floor || rect.top > ceiling || rect.width > 140 || rect.height > 40 || rect.height < 8) return;
      if (!best || rect.top < best.getBoundingClientRect().top) best = el;
    });
    return best;
  }

  function addOptionButton(nameLabel) {
    const floor = nameLabel.getBoundingClientRect().bottom;
    const ceiling = cardBottom(nameLabel);
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      const text = compactLabel(ownText(el));
      if (text !== "添加选项" && text !== "+添加选项") return;
      const rect = el.getBoundingClientRect();
      if (rect.top < floor || rect.top > ceiling || rect.width < 8 || rect.height < 8 || rect.width > 200 || rect.height > 48) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function nameField(nameLabel) {
    const top = nameLabel.getBoundingClientRect().bottom;
    const option = optionLabel(nameLabel);
    const bottom = option ? option.getBoundingClientRect().top : top + 90;
    return fieldBox(top, bottom);
  }

  function optionFields(index) {
    const nameLabel = variantNameLabels()[index];
    if (!nameLabel) return [];
    const option = optionLabel(nameLabel);
    if (!option) return [];
    const top = option.getBoundingClientRect().bottom - 4;
    const add = addOptionButton(nameLabel);
    const bottom = add ? add.getBoundingClientRect().top : top + 180;
    return fieldBoxes(top, bottom);
  }

  function emptyOptionField(index) {
    return optionFields(index).find((field) => !controlValue(field)) || null;
  }

  function optionFieldShowing(index, value) {
    const want = compactLabel(value);
    return optionFields(index).find((field) => compactLabel(controlValue(field)) === want) || null;
  }

  function optionShows(index, value) {
    if (optionFieldShowing(index, value)) return true;
    const want = compactLabel(value);
    const nameLabel = variantNameLabels()[index];
    const option = nameLabel && optionLabel(nameLabel);
    if (!option) return false;
    const top = option.getBoundingClientRect().bottom - 4;
    const bottom = cardBottom(nameLabel);
    let found = false;
    eachElement((el) => {
      if (found) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < top || rect.top > bottom || rect.height < 8 || rect.height > 56 || rect.width < 8) return;
      const text = isTextBox(el) ? el.value || "" : ownText(el);
      if (compactLabel(text) === want) found = true;
    });
    return found;
  }

  function mustCreateSale(name) {
    const key = String(name || "").trim().toLowerCase();
    return key === "color" || key === "colour" || key === "size";
  }

  function saleAliases(name) {
    const key = String(name || "").trim().toLowerCase();
    if (key === "color" || key === "colour") return ["Color", "color", "颜色"];
    if (key === "size") return ["Size", "size", "尺码", "尺寸"];
    return [String(name || "").trim()];
  }

  function presetSaleOption(el) {
    const text = compactLabel(shortLabel(el) || ownText(el) || "");
    return text === "颜色" || text === "尺码" || text === "尺寸" || text.toLowerCase() === "numberofitems";
  }

  function nameSelected(index, value) {
    const nameLabel = variantNameLabels()[index];
    const field = nameLabel && nameField(nameLabel);
    if (!field) return false;
    const aliases = new Set(saleAliases(value).map((item) => compactLabel(item)));
    if (aliases.has(compactLabel(controlValue(field)))) return true;
    const nodes = field.querySelectorAll ? [field, ...field.querySelectorAll("*")] : [field];
    return nodes.some((el) => aliases.has(compactLabel(ownText(el))));
  }

  function saleAlreadyChosen(index, sale, values) {
    if (nameSelected(index, sale)) return true;
    return (values || []).some((item) => {
      const value = String((item && item.value) || "").trim();
      return value && optionShows(index, value);
    });
  }

  async function clickAddOption(index) {
    const before = optionFields(index).length;
    const nameLabel = variantNameLabels()[index];
    const button = nameLabel && addOptionButton(nameLabel);
    if (!button) return { ok: false, message: "没有找到添加选项" };
    button.scrollIntoView({ block: "center", inline: "nearest" });
    await delay(100);
    const found = nearestHandlers(button);
    if (found) callFirst(found, ["onClick", "onMouseDown", "onPointerDown"]);
    let appeared = await waitFor(() => optionFields(index).length > before, 800);
    if (!appeared) {
      nativeClick(button);
      appeared = await waitFor(() => optionFields(index).length > before, 2500);
    }
    if (!appeared) return { ok: false, message: "点了添加选项，没有出现新的选项框" };
    return { ok: true };
  }

  function fieldBox(top, bottom) {
    const boxes = fieldBoxes(top, bottom);
    return boxes[0] || null;
  }

  function fieldBoxes(top, bottom) {
    const found = [];
    eachElement((el) => {
      if (el.matches && el.matches("input[type='file'], input[type='checkbox'], input[type='radio'], input[type='hidden']")) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 180 || rect.height < 28 || rect.height > 56) return;
      const mid = rect.top + rect.height / 2;
      if (mid < top || mid > bottom) return;
      const dup = found.find((item) => Math.abs(item.getBoundingClientRect().top - rect.top) < 10);
      if (!dup) found.push(el);
      else if (rect.width > dup.getBoundingClientRect().width) found[found.indexOf(dup)] = el;
    });
    found.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return found;
  }

  function controlValue(el) {
    if (!el) return "";
    const input = el.matches && el.matches("input, textarea") ? el : el.querySelector && el.querySelector("input, textarea");
    if (input) {
      const value = String(input.value || "").trim();
      if (value) return value;
    }
    const text = String(el.innerText || "").replace(/\s+/g, " ").trim();
    const compact = compactLabel(text);
    if (!text || text.length > 80 || compact.includes("请选择") || compact === "输入选项") return "";
    return text;
  }

  let chooseFault = "";

  async function chooseOrCreate(readControl, names, seen) {
    chooseFault = "";
    const wanted = names.map((name) => String(name || "").trim()).filter(Boolean);
    if (wanted.length === 0) return "";
    const found = wanted.find((name) => seen(name) && !createRow());
    if (found) return found;
    const control = readControl();
    if (!control) return "";
    control.scrollIntoView({ block: "center", inline: "nearest" });
    await delay(100);
    const filter = control.matches && control.matches("input, textarea") ? control : control.querySelector && control.querySelector("input:not([type='hidden']):not([type='file']), textarea");
    if (filter && filter.value && !wanted.some((name) => compactLabel(filter.value) === compactLabel(name))) setNativeValue(filter, "");
    const opened = await openCreateMenu(control);
    if (!opened) {
      chooseFault = "下拉里没有新增";
      return "";
    }
    if (!wanted.some(mustCreateSale)) {
      for (const name of wanted) {
        const option = menuItem(name, control);
        if (!option || presetSaleOption(option)) continue;
        const handlers = nearestHandlers(option);
        if (handlers) callFirst(handlers, ["onClick", "onMouseDown"]);
        else nativeClick(option);
        const stuck = await waitFor(() => (seen(name) && !createRow() ? name : null), 2000);
        if (stuck) return stuck;
      }
    }
    const created = wanted[0];
    const trigger = addNewButton(control) || textElement("新增", selectFloor(control));
    if (!trigger) {
      chooseFault = "没有点到新增";
      closeMenu();
      return "";
    }
    const row = await activateNew(trigger);
    if (!row) {
      chooseFault = "点了新增，下面没有出现输入框";
      closeMenu();
      return "";
    }
    const typed = await fillAndConfirm(row, created);
    if (!typed) {
      chooseFault = "输入框里没有写上 " + created;
      return "";
    }
    let stuck = await waitFor(() => (seen(created) && !createRow() ? created : null), 2500);
    if (stuck) return stuck;
    const again = createRow();
    if (again) {
      await fillAndConfirm(again, created);
      stuck = await waitFor(() => (seen(created) && !createRow() ? created : null), 2500);
      if (stuck) return stuck;
    }
    if (seen(created)) return created;
    chooseFault = "点了添加，名称还不是 " + created;
    return "";
  }

  function createRow() {
    const button = addConfirmButton();
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    let input = null;
    let bestDist = Infinity;
    eachElement((el) => {
      if (!isTextBox(el)) return;
      const box = el.getBoundingClientRect();
      if (box.width < 80 || box.height < 16 || box.height > 64) return;
      if (Math.abs(box.top + box.height / 2 - mid) > 28) return;
      if (box.left > rect.left - 8) return;
      const dist = Math.abs(rect.left - box.right);
      if (dist > 80 || dist >= bestDist) return;
      input = el;
      bestDist = dist;
    });
    return input ? { input, button } : null;
  }

  function isTextBox(el) {
    if (!el || !el.matches) return false;
    if (el.matches("input, textarea")) {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      return type !== "hidden" && type !== "file" && type !== "checkbox" && type !== "radio" && type !== "button" && type !== "submit";
    }
    return el.getAttribute("contenteditable") === "true" || el.getAttribute("role") === "textbox";
  }

  function isDisabled(el) {
    if (!el) return true;
    if (el.disabled) return true;
    if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return true;
    return window.getComputedStyle(el).pointerEvents === "none";
  }

  function nestedInAddPhrase(el) {
    let node = el && el.parentElement;
    for (let depth = 0; depth < 4 && node; depth += 1) {
      const text = compactLabel(node.innerText || "");
      if (text === "添加选项" || text === "+添加选项" || text === "添加变体" || text === "+添加变体" || text === "添加商品") return true;
      node = node.parentElement;
    }
    return false;
  }

  function addConfirmButton() {
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      if (shortLabel(el) !== "添加") return;
      if (nestedInAddPhrase(el)) return;
      let target = el;
      let node = el.parentElement;
      for (let depth = 0; depth < 3 && node; depth += 1) {
        const parentRect = node.getBoundingClientRect();
        const text = compactLabel(node.innerText || "");
        if (text === "添加" && parentRect.width >= 24 && parentRect.width <= 160 && parentRect.height >= 16 && parentRect.height <= 64) target = node;
        node = node.parentElement;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width < 16 || rect.height < 12 || rect.width > 160 || rect.height > 64) return;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = target;
        bestArea = area;
      }
    });
    return best;
  }

  function menuItem(name, control) {
    const want = compactLabel(name);
    const anchor = control && control.getBoundingClientRect ? control.getBoundingClientRect() : null;
    const matches = [];
    eachElement((el) => {
      if (el.matches && el.matches("input, textarea")) return;
      if (control && (el === control || control.contains(el))) return;
      const text = shortLabel(el);
      const add = want === "新增" && isNewAction(text);
      if (text !== want && !add) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 12 || rect.height > 72 || rect.width > 720) return;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      if (anchor && rect.bottom < anchor.top + 4 && !floating(el)) return;
      matches.push({ el, floating: floating(el), exact: text === want, area: rect.width * rect.height, left: rect.left });
    });
    const floatingMatches = matches.filter((item) => item.floating);
    const pool = floatingMatches.length ? floatingMatches : matches;
    pool.sort((a, b) => {
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      if (anchor && Math.abs(a.left - anchor.left) !== Math.abs(b.left - anchor.left)) return Math.abs(a.left - anchor.left) - Math.abs(b.left - anchor.left);
      return a.area - b.area;
    });
    return pool.length ? pool[0].el : null;
  }

  function floating(el) {
    let node = el;
    for (let depth = 0; depth < 6 && node; depth += 1) {
      const position = window.getComputedStyle(node).position;
      if (position === "fixed" || position === "absolute") return true;
      node = node.parentElement;
    }
    return false;
  }

  function shortLabel(el) {
    const own = compactLabel(ownText(el));
    if (own) return own;
    if (!el || el.childElementCount > 4) return "";
    const nested = compactLabel(el.innerText || "");
    return nested.length > 24 ? "" : nested;
  }

  function isNewAction(text) {
    return Boolean(text) && text.length <= 8 && (text === "新增" || text.endsWith("新增"));
  }

  function addNewButton(control) {
    const floor = control.getBoundingClientRect().bottom - 8;
    let best = null;
    let bestTop = -Infinity;
    eachElement((el) => {
      if (!isNewAction(shortLabel(el))) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 10 || rect.height > 80 || rect.width > 800) return;
      if (rect.top < floor || rect.bottom < 0 || rect.top > window.innerHeight) return;
      const area = rect.width * rect.height;
      const better = rect.top > bestTop + 4 || (best && Math.abs(rect.top - bestTop) <= 4 && area < best.getBoundingClientRect().width * best.getBoundingClientRect().height);
      if (better) {
        best = el;
        bestTop = rect.top;
      }
    });
    return best;
  }

  function selectFloor(control) {
    return control.getBoundingClientRect().bottom - 4;
  }

  function textPoint(word, floor) {
    let best = null;
    const visit = (root) => {
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const compact = compactLabel(node.nodeValue || "");
        if (isNewAction(compact) || compact === word) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          if (rect.width >= 4 && rect.height >= 4 && rect.top >= floor && rect.bottom > 0 && rect.top < window.innerHeight) {
            if (!best || rect.top > best.top) best = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, top: rect.top, node };
          }
        }
        node = walker.nextNode();
      }
      const elements = root.querySelectorAll ? root.querySelectorAll("*") : [];
      for (const el of elements) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };
    visit(document.body);
    return best;
  }

  function textElement(word, floor) {
    const point = textPoint(word, floor);
    return point && point.node ? point.node.parentElement : null;
  }

  function reactPropsOf(el) {
    if (!el) return null;
    const keys = Object.keys(el);
    for (const key of keys) {
      if (key.startsWith("__reactProps$") || key.startsWith("__reactEventHandlers$")) return el[key];
    }
    for (const key of keys) {
      if (!key.startsWith("__reactFiber$") && !key.startsWith("__reactInternalInstance$")) continue;
      let fiber = el[key];
      for (let depth = 0; depth < 6 && fiber; depth += 1) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (props && handlerNames(props).length) return props;
        fiber = fiber.return;
      }
    }
    return null;
  }

  function selectTrigger(control) {
    if (!control) return control;
    if (control.matches && control.matches("input, textarea")) return control;
    const input = control.querySelector && control.querySelector("input, textarea");
    return input || control;
  }

  function newActionVisible(control) {
    if (addNewButton(control)) return true;
    return Boolean(textPoint("新增", selectFloor(control)) || textPoint("新增", -10000));
  }

  async function openCreateMenu(control) {
    const target = selectTrigger(control);
    const attempts = [
      () => callFirst(nearestHandlers(target), ["onMouseDown", "onPointerDown"]),
      () => callFirst(nearestHandlers(target), ["onClick", "onPress"]),
      () => clickBox(target, true),
      () => nativeClick(control),
    ];
    for (const attempt of attempts) {
      if (newActionVisible(control)) return true;
      try {
        attempt();
      } catch {
        // try the next way to open the name menu
      }
      const opened = await waitFor(() => (newActionVisible(control) ? true : null), 900);
      if (opened) return true;
    }
    return false;
  }

  function handlerNames(props) {
    if (!props) return [];
    return ["onMouseDown", "onPointerDown", "onClick", "onPress"].filter((name) => typeof props[name] === "function");
  }

  function vueHandlers(el) {
    const vm = el.__vueParentComponent || el.__vue__;
    if (!vm) return null;
    const props = vm.props || (vm.vnode && vm.vnode.props) || (vm.$ && vm.$.vnode && vm.$.vnode.props) || vm.$props;
    if (!props) return null;
    const normalized = {
      onMouseDown: props.onMouseDown || props.onMousedown,
      onPointerDown: props.onPointerDown || props.onPointerdown,
      onClick: props.onClick,
      onPress: props.onPress,
    };
    const names = handlerNames(normalized);
    return names.length ? { props: normalized, node: el, names } : null;
  }

  function nearestHandlers(el) {
    let node = el;
    const seed = compactLabel((el && (el.innerText || el.textContent)) || "");
    for (let depth = 0; depth < 6 && node; depth += 1) {
      const text = compactLabel(node.innerText || "");
      if (depth > 0 && seed && text.length > seed.length + 4 && !isNewAction(text) && text !== "添加") break;
      const props = reactPropsOf(node);
      const names = handlerNames(props);
      if (names.length) return { props, node, names };
      const vue = vueHandlers(node);
      if (vue) return vue;
      node = node.parentElement;
    }
    return null;
  }

  function callHandler(fn, el) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + Math.min(Math.max(rect.width / 2, 8), 36);
    const y = rect.top + rect.height / 2;
    const native = {
      isTrusted: true,
      target: el,
      currentTarget: el,
      button: 0,
      buttons: 0,
      detail: 1,
      clientX: x,
      clientY: y,
      preventDefault() {},
      stopPropagation() {},
    };
    const event = {
      isTrusted: true,
      type: "click",
      button: 0,
      buttons: 0,
      detail: 1,
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      target: el,
      currentTarget: el,
      nativeEvent: native,
      preventDefault() {},
      stopPropagation() {},
      persist() {},
    };
    fn.call(el, event);
  }

  function callFirst(found, names) {
    if (!found) return false;
    for (const name of names) {
      if (found.names.includes(name)) {
        callHandler(found.props[name], found.node);
        return true;
      }
    }
    return false;
  }

  function nativeClick(el) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + Math.min(Math.max(rect.width / 2, 8), 36);
    const y = rect.top + rect.height / 2;
    if (!clickAt(x, y, "click")) {
      if (typeof el.click === "function") el.click();
      else directClick(el);
    }
  }

  async function activateNew(el) {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    await delay(80);
    const found = nearestHandlers(el);
    const steps = [
      () => callFirst(found, ["onMouseDown", "onPointerDown"]),
      () => callFirst(found, ["onClick", "onPress"]),
      () => nativeClick(el),
    ];
    for (const step of steps) {
      try {
        step();
      } catch {
        // try the next way to open the create row
      }
      const row = await waitFor(() => createRow(), 1000);
      if (row) return row;
    }
    return null;
  }

  function writeInto(el, value) {
    const text = String(value || "");
    el.focus();
    if (el.matches && el.matches("input, textarea")) {
      if (document.activeElement === el) {
        try {
          if (typeof el.setSelectionRange === "function") el.setSelectionRange(0, String(el.value || "").length);
          if (document.execCommand("insertText", false, text) && String(el.value || "") === text) return true;
        } catch {
          // fall through to the value setter
        }
      }
      setNativeValue(el, text);
      return String(el.value || "") === text;
    }
    typeText(el, text);
    return compactLabel(el.textContent || "") === compactLabel(text);
  }

  async function fillAndConfirm(row, created) {
    const input = row.input;
    input.scrollIntoView({ block: "center", inline: "nearest" });
    nativeClick(input);
    input.focus();
    await delay(120);
    if (!writeInto(input, created)) return false;
    await delay(200);
    const button = (await waitFor(() => {
      const next = addConfirmButton();
      return next && !isDisabled(next) ? next : null;
    }, 1200)) || row.button;
    const found = nearestHandlers(button);
    const steps = [
      () => callFirst(found, ["onMouseDown", "onPointerDown"]),
      () => callFirst(found, ["onClick", "onPress"]),
      () => nativeClick(button),
    ];
    for (const step of steps) {
      try {
        step();
      } catch {
        // try the next way to press 添加
      }
      const gone = await waitFor(() => (createRow() ? null : true), 700);
      if (gone) return true;
    }
    return !createRow();
  }

  async function typePlainOption(input, value, index) {
    input.scrollIntoView({ block: "center", inline: "nearest" });
    nativeClick(input);
    input.focus();
    await delay(80);
    if (!writeInto(input, value)) return false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await delay(120);
    if (String(input.value || "").trim() === value || optionShows(index, value)) return true;
    input.focus();
    pressEnter(input);
    return Boolean(await waitFor(() => (optionShows(index, value) || String(input.value || "").trim() === value ? true : null), 1200));
  }

  function plainOptionInput(index) {
    const nameLabel = variantNameLabels()[index];
    const option = nameLabel && optionLabel(nameLabel);
    if (!option) return null;
    const top = option.getBoundingClientRect().bottom - 4;
    const add = addOptionButton(nameLabel);
    const bottom = add ? add.getBoundingClientRect().top - 2 : top + 220;
    let best = null;
    eachElement((el) => {
      if (!isTextBox(el)) return;
      if (String(el.value || "").trim()) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 14 || rect.height > 64) return;
      const mid = rect.top + rect.height / 2;
      if (mid < top || mid > bottom) return;
      if (!best || rect.top < best.getBoundingClientRect().top) best = el;
    });
    if (best) return best;
    return textBoxInside(emptyOptionField(index));
  }

  function textBoxInside(root) {
    if (!root) return null;
    if (isTextBox(root) && !String(root.value || "").trim()) return root;
    let found = null;
    const visit = (node) => {
      if (found || !node || !node.querySelectorAll) return;
      for (const el of node.querySelectorAll("*")) {
        if (isTextBox(el) && !String(el.value || "").trim()) {
          found = el;
          return;
        }
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };
    visit(root);
    return found;
  }

  function typeText(el, value) {
    el.focus();
    const text = String(value || "");
    setNativeValue(el, "");
    let built = "";
    for (const char of text) {
      built += char;
      el.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true, cancelable: true }));
      if (el.matches && el.matches("input, textarea")) setNativeValue(el, built);
      el.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true, cancelable: true }));
    }
    if (el.matches && el.matches("input, textarea") && String(el.value || "") !== text) setNativeValue(el, text);
  }

  function clickBox(el, atChevron) {
    const rect = el.getBoundingClientRect();
    const x = atChevron && rect.width > 160 ? rect.right - 20 : rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (!clickAt(x, y, "click")) directClick(el);
  }

  function pressEnter(el) {
    const enter = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent("keydown", enter));
    el.dispatchEvent(new KeyboardEvent("keyup", enter));
  }

  function closeMenu() {
    if (!menuItem("新增", null)) return;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
  }

  async function uploadVariantImages(attr, images, rows, pending) {
    const values = Array.isArray(attr && attr.values) ? attr.values : [];
    if (values.length === 0) return { ok: true };
    const heading = textEl("变体列表");
    if (!heading) return { ok: false, message: "没有找到变体列表" };
    const names = values.map((item) => String(item.value || "").trim()).filter(Boolean);
    for (const item of values) {
      const value = String(item.value || "").trim();
      if (!value) return { ok: false, message: "变体属性值是空的" };
      if (item && item.image_url) {
        const part = images[item.image_url];
        if (!part) return { ok: false, message: "没有下载到「" + value + "」的图片" };
        const uploaded = await uploadListImage(value, fileFromPart(part, value + ".jpg"), names);
        if (uploaded !== true) {
          const message = uploaded === "tile"
            ? "找到了变体列表里「" + value + "」的图片框，但没有传上"
            : "没有找到变体列表里「" + value + "」的图片入口";
          return { ok: false, message };
        }
      }
      if (rows && pending) {
        const priced = await fillColorRows(value, rows, pending);
        if (!priced.ok) return priced;
      }
    }
    return { ok: true };
  }

  async function uploadListImage(value, file, names) {
    let sawTile = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      let word = colorWordBox(value);
      if (!word && attempt === 0) {
        const heading = variantListHeading();
        if (heading) {
          heading.scrollIntoView({ block: "center", inline: "nearest" });
          await delay(220);
          continue;
        }
      }
      if (word && word.node && word.node.parentElement && (word.top < 120 || word.bottom > window.innerHeight - 80)) {
        word.node.parentElement.scrollIntoView({ block: "center", inline: "nearest" });
        await delay(180);
        word = colorWordBox(value);
      }
      if (colorSlotPhoto(word)) return true;
      const tile = squareLeftOf(word);
      if (!tile) {
        if (word && attempt >= 2) return false;
        if (!scrollVariantList(140)) break;
        await delay(120);
        continue;
      }
      sawTile = true;
      if (await placeColorImage(tile, value, file, names)) return true;
      return "tile";
    }
    return sawTile ? "tile" : false;
  }

  function variantListHeading() {
    let best = null;
    let bestScore = Infinity;
    eachElement((el) => {
      if (compactLabel(ownText(el)) !== "变体列表" && labelText(el) !== "变体列表") return;
      if (panelContains(el)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8 || rect.width > 240 || rect.height > 48) return;
      const off = rect.bottom < 40 || rect.top > window.innerHeight - 20 ? 200000 : 0;
      const score = off + rect.width * rect.height;
      if (score < bestScore) {
        best = el;
        bestScore = score;
      }
    });
    return best || textEl("变体列表");
  }

  function colorWordBox(value) {
    const heading = variantListHeading();
    if (!heading) return null;
    const head = heading.getBoundingClientRect();
    const floor = head.bottom - 8;
    const ceiling = nextSectionTop(floor);
    const want = compactLabel(value);
    const found = [];
    const visit = (root) => {
      if (!root) return;
      let walker = null;
      try {
        walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      } catch {
        return;
      }
      let node = walker.nextNode();
      while (node) {
        if (compactLabel(node.nodeValue || "") === want) {
          const parent = node.parentElement;
          if (parent && !panelContains(parent)) {
            const range = document.createRange();
            range.selectNodeContents(node);
            const pieces = range.getClientRects();
            const glyph = pieces.length ? pieces[0] : range.getBoundingClientRect();
            const rect = tightenWord(glyph, want);
            if (rect && rect.width >= 4 && rect.width <= 220 && rect.top >= floor - 16 && rect.top < ceiling - 8 && rect.left >= head.left - 30) {
              const visible = rect.bottom > 0 && rect.top < window.innerHeight;
              const score = (visible ? 0 : 8000) + Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);
              found.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height, node, score });
            }
          }
        }
        node = walker.nextNode();
      }
      const elements = root.querySelectorAll ? root.querySelectorAll("*") : [];
      for (const el of elements) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };
    visit(document.body || document.documentElement);
    found.sort((a, b) => a.score - b.score);
    for (const word of found.slice(0, 6)) {
      if (squareNear(word)) return word;
    }
    return found[0] || null;
  }

  function tightenWord(rect, want) {
    if (!rect || rect.width < 4 || rect.height < 4) return null;
    const mid = rect.top + rect.height / 2;
    const short = rect.height <= 40 ? rect : { top: mid - 11, bottom: mid + 11, left: rect.left, right: rect.right, width: rect.width, height: 22 };
    if (short.width <= 90 && short.height <= 40) return short;
    const y = Math.min(window.innerHeight - 3, Math.max(3, short.top + short.height / 2));
    if (y <= 3 || y >= window.innerHeight - 3) return short.height <= 40 ? short : null;
    let left = null;
    let right = null;
    const end = Math.min(short.right, short.left + 360);
    for (let x = Math.max(2, short.left); x <= end; x += 4) {
      if (compactLabel(caretText(x, y)) !== want) continue;
      if (left == null) left = x;
      right = x;
    }
    if (left == null) return short.height <= 40 && short.width <= 220 ? short : null;
    return { top: y - 11, bottom: y + 11, left, right: right + 4, width: Math.max(8, right - left + 4), height: 22 };
  }

  function caretText(x, y) {
    const range = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y);
    if (range && range.startContainer) return range.startContainer.textContent || "";
    const pos = document.caretPositionFromPoint && document.caretPositionFromPoint(x, y);
    if (pos && pos.offsetNode) return pos.offsetNode.textContent || "";
    return "";
  }

  function squareLeftOf(word) {
    return squareNear(word) || squareScan(word);
  }

  function squareNear(word) {
    if (!word) return null;
    const mid = word.top + word.height / 2;
    if (mid < 8 || mid > window.innerHeight - 8) return null;
    const y = Math.min(window.innerHeight - 3, Math.max(3, mid));
    const nodes = [];
    const seen = new Set();
    for (let x = word.left - 6; x >= word.left - 130 && x > 2; x -= 10) {
      const hit = document.elementFromPoint(x, y);
      if (!hit || seen.has(hit)) continue;
      seen.add(hit);
      nodes.push(hit);
      const hitBox = hit.getBoundingClientRect();
      if (hit.querySelectorAll && hitBox.width <= 280 && hitBox.height <= 420) {
        let count = 0;
        for (const child of hit.querySelectorAll("*")) {
          count += 1;
          if (count > 40) break;
          if (seen.has(child)) continue;
          const childBox = child.getBoundingClientRect();
          if (Math.abs(childBox.top + childBox.height / 2 - y) > 34) continue;
          if (childBox.right < word.left - 150 || childBox.left > word.left + 8) continue;
          seen.add(child);
          nodes.push(child);
        }
      }
      let node = hit.parentElement;
      for (let depth = 0; depth < 6 && node && node !== document.body; depth += 1) {
        if (seen.has(node)) break;
        const box = node.getBoundingClientRect();
        if (box.width > 320 || box.height > 420) break;
        seen.add(node);
        nodes.push(node);
        node = node.parentElement;
      }
      if (nodes.length > 70) break;
    }
    return pickSquare(nodes, word, mid);
  }

  function squareScan(word) {
    if (!word) return null;
    const mid = word.top + word.height / 2;
    if (mid < 8 || mid > window.innerHeight - 8) return null;
    const nodes = [];
    eachElement((el) => nodes.push(el));
    return pickSquare(nodes, word, mid);
  }

  function pickSquare(nodes, word, mid) {
    let best = null;
    let bestScore = Infinity;
    for (const el of nodes) {
      if (panelContains(el)) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 32 || box.height < 32 || box.width > 130 || box.height > 130) continue;
      if (Math.abs(box.width - box.height) > 22) continue;
      if (Math.abs(box.top + box.height / 2 - mid) > 26) continue;
      const gap = word.left - box.right;
      if (gap < -10 || gap > 56) continue;
      const style = window.getComputedStyle(el);
      const dashed = [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle, style.outlineStyle].includes("dashed");
      let iconic = false;
      if (!dashed && el.querySelector) iconic = Boolean(el.querySelector("svg")) && compactLabel(el.innerText || "") === "";
      if (!dashed && !iconic) continue;
      const score = Math.max(gap, 0) + (dashed ? 0 : 80) + Math.abs(box.top + box.height / 2 - mid);
      if (score < bestScore) {
        best = el;
        bestScore = score;
      }
    }
    return best;
  }

  function colorSlotPhoto(word) {
    if (!word) return false;
    const mid = word.top + word.height / 2;
    if (mid < 8 || mid > window.innerHeight - 8) return false;
    const y = Math.min(window.innerHeight - 3, Math.max(3, mid));
    for (const img of document.querySelectorAll("img")) {
      const box = img.getBoundingClientRect();
      if (box.width < 40 || box.height < 40 || box.width > 160 || box.height > 160) continue;
      if (Math.abs(box.width - box.height) > 36) continue;
      if (Math.abs(box.top + box.height / 2 - mid) > 40) continue;
      const gap = word.left - box.right;
      if (gap < -28 || gap > 100) continue;
      if (panelContains(img)) continue;
      const src = img.currentSrc || img.src || "";
      if (src && !src.includes("data:image/svg") && !src.toLowerCase().includes(".svg")) return true;
    }
    for (const dx of [22, 42, 64]) {
      const x = word.left - dx;
      if (x < 4) continue;
      if (slotBackground(document.elementFromPoint(x, y), word, mid)) return true;
    }
    return false;
  }

  function slotBackground(el, word, mid) {
    let node = el;
    for (let depth = 0; depth < 5 && node && node !== document.body; depth += 1) {
      const box = node.getBoundingClientRect();
      if (box.width > 180 || box.height > 180) break;
      const gap = word.left - box.right;
      const aligned = box.width >= 48 && box.height >= 48 && Math.abs(box.width - box.height) <= 28 && Math.abs(box.top + box.height / 2 - mid) <= 36 && gap >= -20 && gap <= 84;
      if (aligned) {
        if (node.matches && node.matches("img")) {
          const src = node.currentSrc || node.src || "";
          if (src && !src.includes("data:image/svg") && !src.toLowerCase().includes(".svg")) return true;
        }
        const bg = window.getComputedStyle(node).backgroundImage || "";
        if (bg.includes("url(") && !bg.includes("gradient") && !bg.toLowerCase().includes(".svg")) return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function panelContains(el) {
    let node = el;
    for (let depth = 0; depth < 10 && node; depth += 1) {
      if (node.dataset && node.dataset.lianpuPanel) return true;
      const root = node.getRootNode && node.getRootNode();
      node = node.parentElement || (root && root.host) || null;
    }
    return false;
  }

  function fileInputForColor(tile, value, names) {
    let node = tile;
    for (let depth = 0; depth < 6 && node; depth += 1) {
      const inputs = deepFileInputs(node).filter((input) => variantFileInput(input));
      if (inputs.length === 1) return inputs[0];
      node = parentNodeOf(node);
      if (!node) break;
      const text = node.innerText || "";
      if ((names || []).some((name) => name !== value && name && text.includes(name))) break;
    }
    return null;
  }

  async function placeColorImage(tile, value, file, names) {
    const fresh = tile && tile.isConnected ? tile : squareLeftOf(colorWordBox(value));
    if (!fresh) return false;
    fresh.scrollIntoView({ block: "center", inline: "nearest" });
    await delay(220);
    const current = squareLeftOf(colorWordBox(value)) || fresh;
    const word = colorWordBox(value);
    if (colorSlotPhoto(word)) return true;
    if (variantImageMenuButton(current)) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      await delay(160);
    }
    const placed = await assignColorFile(current, value, file, names);
    if (!placed) return false;
    const anchor = colorWordBox(value) || word;
    return Boolean(await waitFor(() => (colorSlotPhoto(anchor) ? true : null), 8000));
  }

  async function assignColorFile(tile, value, file, names) {
    const before = new Set(allFileInputs());
    hoverTile(tile);
    let button = await waitFor(() => variantImageMenuButton(tile), 1600);
    if (!button) {
      hoverTile(tile);
      button = await waitFor(() => variantImageMenuButton(tile), 1600);
    }
    if (!button) return false;
    const target = localFileClickTarget(button);
    let input = localFileInput(target, before) || fileInputForColor(tile, value, names);
    const captured = await clickLocalFile(button, target);
    input = (captured && variantFileInput(captured) && captured) || input;
    if (!input) input = localFileInput(target, before) || fileInputForColor(tile, value, names);
    return Boolean(input && putSizeChartFile(input, file));
  }

  async function clickLocalFile(label, target) {
    const nodes = [];
    if (label) nodes.push(label);
    if (target && target !== label) nodes.push(target);
    let captured = null;
    const proto = HTMLInputElement.prototype;
    const original = proto.click;
    proto.click = function () {
      captured = this;
    };
    try {
      for (const node of nodes) {
        const handlers = nearestHandlers(node);
        if (handlers) callFirst(handlers, ["onClick", "onMouseDown", "onPointerDown"]);
        directClick(node);
      }
      await delay(300);
    } finally {
      proto.click = original;
    }
    return captured;
  }

  function variantImageMenuButton(tile) {
    if (!tile || !tile.getBoundingClientRect) return null;
    const origin = tile.getBoundingClientRect();
    const ox = origin.left + origin.width / 2;
    const nodes = [];
    const seen = new Set();
    const xs = [origin.left + 8, ox, origin.right - 8, origin.left - 16];
    for (const x of xs) {
      if (x < 2 || x > window.innerWidth - 2) continue;
      for (let y = origin.top - 6; y >= origin.top - 190 && y > 2; y -= 14) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || seen.has(hit)) continue;
        let node = hit;
        for (let depth = 0; depth < 6 && node && node !== document.body; depth += 1) {
          if (!seen.has(node)) {
            seen.add(node);
            nodes.push(node);
          }
          const box = node.getBoundingClientRect();
          if (depth < 3 && box.width <= 260 && box.height <= 220 && node.querySelectorAll) {
            for (const child of node.querySelectorAll("*")) {
              if (seen.has(child)) continue;
              seen.add(child);
              nodes.push(child);
              if (nodes.length > 80) break;
            }
          }
          if (box.width > 480 || box.height > 360 || nodes.length > 80) break;
          node = node.parentElement;
        }
        if (nodes.length > 80) break;
      }
    }
    let best = null;
    let bestDist = Infinity;
    for (const el of nodes) {
      if (!isLocalFileLabel(el) || panelContains(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
      const dist = Math.hypot(rect.left + rect.width / 2 - ox, rect.top + rect.height / 2 - (origin.top + origin.height / 2));
      if (dist > 220 || dist >= bestDist) continue;
      const menu = hoverMenuText(el);
      if (!menu.includes("本地文件") || menu.includes("创建尺码表")) continue;
      if (!menu.includes("媒体中心") && !menu.includes("选择主图")) continue;
      best = el;
      bestDist = dist;
    }
    return best;
  }

  function hoverMenuText(el) {
    let node = el;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const text = compactLabel(node.innerText || "");
      const menu = text.includes("本地文件") && (text.includes("媒体中心") || text.includes("选择主图"));
      if (menu && text.length < 120 && !text.includes("创建尺码表")) return text;
      node = node.parentElement;
    }
    return "";
  }

  function hoverTile(el) {
    const rect = el.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 2, Math.max(2, rect.left + rect.width / 2));
    const y = Math.min(window.innerHeight - 2, Math.max(2, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    const nodes = [el];
    const parent = parentNodeOf(el);
    if (parent && parent !== document.body && parent !== document.documentElement) {
      const box = parent.getBoundingClientRect();
      if (box.width <= rect.width + 36 && box.height <= rect.height + 36) nodes.push(parent);
    }
    if (hit && insideNode(hit, el)) nodes.unshift(hit);
    if (el.querySelectorAll) {
      for (const child of el.querySelectorAll("*")) {
        nodes.push(child);
        if (nodes.length > 12) break;
      }
    }
    for (const target of nodes) {
      const props = reactPropsOf(target);
      if (!props) continue;
      for (const name of ["onMouseEnter", "onPointerEnter", "onMouseOver", "onPointerOver"]) {
        if (typeof props[name] === "function") callHandler(props[name], target);
      }
    }
    hoverElement(hit && insideNode(hit, el) ? hit : el);
  }

  function insideNode(node, ancestor) {
    let current = node;
    for (let depth = 0; depth < 12 && current; depth += 1) {
      if (current === ancestor) return true;
      current = parentNodeOf(current);
    }
    return false;
  }

  function variantListFloor() {
    const list = variantListHeading();
    return list ? list.getBoundingClientRect().bottom - 4 : null;
  }

  function nextSectionTop(floor) {
    const names = ["创建尺码表", "尺码表", "商品合规", "物流信息", "包裹重量"];
    const band = tabBand();
    let top = Infinity;
    for (const name of names) {
      const want = compactLabel(name);
      eachElement((el) => {
        if (compactLabel(ownText(el)) !== want && labelText(el) !== want) return;
        const rect = el.getBoundingClientRect();
        if (rect.top < floor + 16 || rect.height < 8 || rect.height > 48 || rect.width > 220) return;
        if (pinned(el) || inTabBar(el) || (band != null && Math.abs(rect.top + rect.height / 2 - band) < 22)) return;
        if (rect.top < top) top = rect.top;
      });
    }
    return top;
  }

  function inTabBar(el) {
    let node = el;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const text = compactLabel(node.innerText || "");
      if (text.includes("基本信息") && text.includes("销售信息") && text.length < 120) return true;
      node = node.parentElement;
    }
    return false;
  }

  function tabBand() {
    const basic = [];
    const sales = [];
    eachElement((el) => {
      const text = compactLabel(ownText(el));
      if (text !== "基本信息" && text !== "销售信息") return;
      const box = el.getBoundingClientRect();
      if (box.height < 8 || box.height > 40 || box.width < 8 || box.width > 160) return;
      const mid = box.top + box.height / 2;
      if (text === "基本信息") basic.push(mid);
      else sales.push(mid);
    });
    for (const left of basic) {
      for (const right of sales) {
        if (Math.abs(left - right) < 18) return (left + right) / 2;
      }
    }
    return null;
  }

  function tableBounds() {
    const floor = variantListFloor();
    if (floor == null) return null;
    return { floor, ceiling: nextSectionTop(floor) };
  }

  function inBounds(rect, bounds) {
    if (!bounds || !rect) return false;
    const mid = rect.top + Math.min(rect.height, 24) / 2;
    if (mid < bounds.floor) return false;
    return mid < bounds.ceiling - 8;
  }

  function scrollVariantList(step) {
    const floor = variantListFloor();
    if (floor != null && nextSectionTop(floor) < 160) return false;
    const amount = step || 220;
    const heading = textEl("变体列表");
    const scroller = heading ? listScroller(heading) : document.scrollingElement;
    if (scroller) {
      const before = scroller.scrollTop;
      scroller.scrollTop = before + amount;
      if (scroller.scrollTop !== before) return true;
    }
    const before = window.scrollY;
    window.scrollBy(0, amount);
    return window.scrollY !== before;
  }

  function variantFileInput(input) {
    if (!input || isMainImageInput(input)) return false;
    let node = input;
    for (let depth = 0; depth < 4 && node; depth += 1) {
      const text = node.innerText || "";
      if (text.includes("尺码表") || text.includes("创建尺码表")) return false;
      node = node.parentElement;
    }
    return true;
  }

  function listScroller(heading) {
    let node = heading.parentElement;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      if (node.scrollHeight > node.clientHeight + 40 && node.clientHeight > 80) return node;
      node = node.parentElement;
    }
    return document.scrollingElement;
  }

  function fileFromPart(part, fallbackName) {
    const binary = atob(part.base64 || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const type = part.type && String(part.type).startsWith("image/") ? part.type : "image/jpeg";
    return new File([bytes], part.name || fallbackName, { type });
  }

  function skuKey(values) {
    return values.map((value) => compactLabel(value)).join("\u001f");
  }

  function skuPlan(skus) {
    const map = new Map();
    for (const sku of skus || []) {
      const values = (Array.isArray(sku.values) ? sku.values : []).map((value) => String(value || "").trim()).filter(Boolean);
      if (!values.length || sku.price == null || sku.price === "" || sku.stock == null) continue;
      map.set(skuKey(values), { values, price: String(sku.price), stock: String(sku.stock) });
    }
    return map;
  }

  async function fillColorRows(color, rows, pending) {
    const key = compactLabel(color);
    const mine = [];
    for (const [id, row] of rows) {
      if (compactLabel(row.values[0]) !== key) continue;
      mine.push(id);
    }
    if (!mine.length) return { ok: true };
    await delay(200);
    for (const id of mine) {
      if (!pending.has(id)) continue;
      const sku = rows.get(id);
      const sizeKey = compactLabel((sku.values && sku.values[1]) || "");
      let held = false;
      for (let attempt = 0; attempt < 4 && !held; attempt += 1) {
        let target = skuRowTarget(key, sizeKey, rows);
        if (!target) {
          if (!scrollVariantList(80)) break;
          await delay(100);
          continue;
        }
        const box = target.el.getBoundingClientRect();
        if (box.top < 150 || box.bottom > window.innerHeight - 80) {
          target.el.scrollIntoView({ block: "center", inline: "nearest" });
          await delay(160);
          target = skuRowTarget(key, sizeKey, rows) || target;
        }
        held = await writeOneSku(sku, target.el);
        if (held) pending.delete(id);
      }
      if (!pending.has(id)) continue;
      return { ok: false, message: "还有 SKU 没写上零售价：" + (sku.values || [color]).join(" / ") };
    }
    return { ok: true };
  }

  function rowMid(el) {
    if (!el || !el.isConnected) return null;
    const rect = el.getBoundingClientRect();
    if (rect.height < 4) return null;
    return rect.top + rect.height / 2;
  }

  async function writeOneSku(sku, el) {
    const bounds = tableBounds();
    if (!bounds) return false;
    const stockHeader = headerOnPriceRow("库存");
    const priceHeader = headerOnPriceRow("零售价");
    const read = () => {
      const mid = rowMid(el);
      if (mid == null) return null;
      return inputsOnRow(mid, bounds, stockHeader, priceHeader);
    };
    const first = read();
    if (!first || !first.stock || !first.price) return false;
    if (String(first.stock.value).replace(/[, ]/g, "") !== sku.stock) setNativeValue(first.stock, sku.stock);
    await delay(160);
    const second = read();
    if (!second || !second.price) return false;
    if (!sameMoney(second.price.value, sku.price)) setNativeValue(second.price, sku.price);
    await delay(180);
    let check = read();
    if (check && check.stock && String(check.stock.value).replace(/[, ]/g, "") !== sku.stock) {
      setNativeValue(check.stock, sku.stock);
      await delay(140);
      check = read();
    }
    if (!check || !check.stock || !check.price) return false;
    return String(check.stock.value).replace(/[, ]/g, "") === sku.stock && sameMoney(check.price.value, sku.price);
  }

  function skuRowTarget(colorKey, sizeKey, rows) {
    const bounds = tableBounds();
    if (!bounds || !sizeKey) return null;
    const colors = new Set();
    const sizes = new Set();
    for (const row of rows.values()) {
      if (row.values[0]) colors.add(compactLabel(row.values[0]));
      if (row.values[1]) sizes.add(compactLabel(row.values[1]));
    }
    const labels = visibleOptionLabels([...colors, ...sizes], bounds);
    const colorItems = labels.filter((item) => colors.has(item.key)).map((item) => ({ key: item.key, rect: item.rect, span: spanBox(item.el, sizes) }));
    const stockHeader = headerOnPriceRow("库存");
    const priceHeader = headerOnPriceRow("零售价");
    let best = null;
    let bestScore = Infinity;
    for (const size of labels) {
      if (size.key !== sizeKey || !wholeSizeLabel(size.el, size.key, sizes)) continue;
      const mid = size.rect.top + size.rect.height / 2;
      const color = colorAbove(mid, colorItems);
      if (!color || color.key !== colorKey) continue;
      const inputs = inputsOnRow(mid, bounds, stockHeader, priceHeader);
      const score = (inputs.stock && inputs.price ? 0 : 500) + size.rect.height;
      if (score < bestScore) {
        best = { mid, el: size.el };
        bestScore = score;
      }
    }
    return best;
  }

  function visibleOptionLabels(names, bounds) {
    const want = new Set(names);
    const found = [];
    eachElement((el) => {
      const key = compactLabel(ownText(el));
      if (!want.has(key) || (el.matches && el.matches("input, textarea"))) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 8 || rect.width > 180 || rect.height > 48) return;
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      if (rect.bottom < bounds.floor || rect.top > bounds.ceiling) return;
      const dup = found.find((item) => item.key === key && Math.abs(item.rect.top - rect.top) < 8);
      if (!dup) found.push({ key, el, rect });
    });
    return found;
  }

  function colorAbove(mid, items) {
    const sorted = [...items].sort((a, b) => a.rect.top - b.rect.top);
    let owner = null;
    for (let index = 0; index < sorted.length; index += 1) {
      const item = sorted[index];
      const top = Math.min(item.rect.top, item.span.top) - 12;
      const next = sorted[index + 1];
      const nextTop = next ? Math.min(next.rect.top, next.span.top) : Infinity;
      if (mid >= top && mid < nextTop - 2) owner = item;
    }
    return owner;
  }

  function wholeSizeLabel(el, key, sizes) {
    const longer = [];
    for (const name of sizes) {
      if (name.length > key.length && name.endsWith(key)) longer.push(name);
    }
    if (!longer.length) return true;
    let node = el;
    for (let depth = 0; depth < 5 && node; depth += 1) {
      const text = compactLabel(node.innerText || "");
      if (longer.some((name) => text === name || text.startsWith(name))) return false;
      node = node.parentElement;
    }
    return true;
  }

  function spanBox(el, foreign) {
    let node = el;
    let best = el.getBoundingClientRect();
    const own = compactLabel(ownText(el));
    for (let depth = 0; depth < 5 && node.parentElement; depth += 1) {
      const parent = node.parentElement;
      const text = compactLabel(parent.innerText || "");
      if ([...foreign].some((name) => name !== own && text.includes(name))) break;
      const rect = parent.getBoundingClientRect();
      if (rect.height > 520 || rect.width > 280) break;
      if (rect.height >= best.height) best = rect;
      node = parent;
    }
    return best;
  }

  function inputsOnRow(mid, bounds, stockHeader, priceHeader) {
    let stock = null;
    let price = null;
    for (const input of document.querySelectorAll("input")) {
      const type = (input.getAttribute("type") || "text").toLowerCase();
      if (type === "hidden" || type === "file" || type === "checkbox" || type === "radio") continue;
      const rect = input.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 16) continue;
      if (Math.abs(rect.top + rect.height / 2 - mid) > 30) continue;
      if (!inBounds(rect, bounds)) continue;
      if (stockHeader && overlapsHeader(rect, stockHeader.getBoundingClientRect())) stock = input;
      if (priceHeader && overlapsHeader(rect, priceHeader.getBoundingClientRect())) price = input;
    }
    return { stock, price };
  }

  function overlapsHeader(rect, headerRect) {
    return Math.min(rect.right, headerRect.right + 36) - Math.max(rect.left, headerRect.left - 8) > 12;
  }

  function sameMoney(got, want) {
    const normalize = (value) => {
      const text = String(value || "").replace(/[^0-9.]/g, "");
      const number = Number(text);
      if (!text || Number.isNaN(number)) return "";
      return number.toFixed(2);
    };
    return normalize(got) === normalize(want);
  }

  function headerOnPriceRow(name) {
    const tag = smallestLabel("标价");
    const mid = tag ? tag.getBoundingClientRect().top + tag.getBoundingClientRect().height / 2 : null;
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      const text = labelText(el);
      if (text !== name && !text.startsWith(name)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8 || rect.width > 240) return;
      if (mid !== null && Math.abs(rect.top + rect.height / 2 - mid) > 18) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function smallestLabel(name) {
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      if (labelText(el) !== name) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  async function selectSizeChart() {
    if (sizeChartPreviewReady()) {
      const already = await waitForSizeChartReady(3000);
      if (already.ok) return { ok: true, message: "尺码表已上传完成" };
    }
    const opened = await ensureSizeChartUpload();
    if (!opened.ok) return opened;
    const image = await sizeChartImage();
    const handed = await handSizeChartFile(opened.anchor, opened.choice, image);
    if (!handed.ok) return handed;
    const ready = await waitForSizeChartReady(20000);
    if (!ready.ok) return ready;
    return { ok: true, message: "尺码表已上传完成" };
  }

  async function ensureSizeChartUpload() {
    let anchor = exactLeaf("创建尺码表");
    let choice = anchor ? sizeChartUploadChoice(anchor) : null;
    if (!choice) {
      await clickSection("尺码表");
      anchor = exactLeaf("创建尺码表");
      choice = anchor ? sizeChartUploadChoice(anchor) : null;
    }
    if (!choice) {
      anchor = await revealExact("创建尺码表");
      choice = anchor ? sizeChartUploadChoice(anchor) : null;
    }
    if (!choice) return { ok: false, message: "尺码表里没有找到上传图片" };
    if (uploadModeOn(anchor, choice)) return { ok: true, anchor, choice };
    choice.scrollIntoView({ block: "center", inline: "nearest" });
    await delay(150);
    directClick(choice);
    const on = await waitFor(() => uploadModeOn(anchor, choice), 5000);
    if (!on) return { ok: false, message: "点了上传图片，尺码表上传框没有出现" };
    return { ok: true, anchor, choice };
  }

  async function waitForSizeChartReady(timeout) {
    const start = Date.now();
    let stableSince = 0;
    let scrolled = false;
    while (Date.now() - start < timeout) {
      if (!scrolled && !sizeChartPreviewLabel()) {
        const section = findLabel("尺码表");
        if (section) section.scrollIntoView({ block: "center", inline: "nearest" });
        scrolled = true;
      }
      if (sizeChartPreviewReady()) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= 2000) return { ok: true };
      } else {
        stableSince = 0;
      }
      await delay(200);
    }
    return { ok: false, message: "尺码表还没有上传完成" };
  }

  function sizeChartPreviewReady() {
    const title = sizeChartPreviewLabel();
    if (!title) return false;
    const card = previewCard(title);
    if (sizeChartBusy(card)) return false;
    const image = previewImage(card);
    if (image && image.complete && image.naturalWidth > 0) return true;
    return Boolean(deleteNearPreview(title));
  }

  function sizeChartPreviewLabel() {
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      if (compactLabel(ownText(el)) !== "尺码表预览") return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function previewCard(title) {
    let node = title;
    let best = title;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const rect = node.getBoundingClientRect();
      const text = compactLabel(node.innerText || "");
      if (text.includes("商品合规") || text.includes("物流信息") || rect.width > 1100) break;
      if (text.includes("尺码表预览") && rect.width >= 180 && rect.height >= 60) best = node;
      node = parentNodeOf(node);
    }
    return best;
  }

  function sizeChartBusy(card) {
    if (!card) return false;
    const bounds = card.getBoundingClientRect();
    let busy = false;
    eachElement((el) => {
      if (busy) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      if (rect.left < bounds.left - 4 || rect.right > bounds.right + 4) return;
      if (rect.top < bounds.top - 4 || rect.bottom > bounds.bottom + 4) return;
      const busyAttr = el.getAttribute && el.getAttribute("aria-busy") === "true";
      const progress = el.getAttribute && el.getAttribute("role") === "progressbar";
      if (busyAttr || progress) {
        busy = true;
        return;
      }
      const text = compactLabel(ownText(el));
      if (text === "上传中" || text === "处理中" || text === "识别中") busy = true;
    });
    return busy;
  }

  function previewImage(card) {
    const bounds = card.getBoundingClientRect();
    let best = null;
    let bestArea = 0;
    eachElement((el) => {
      if (!el.matches || !el.matches("img")) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) return;
      if (rect.left < bounds.left - 8 || rect.right > bounds.right + 8) return;
      if (rect.top < bounds.top - 8 || rect.bottom > bounds.bottom + 8) return;
      const area = rect.width * rect.height;
      if (area > bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function deleteNearPreview(title) {
    const origin = title.getBoundingClientRect();
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      if (compactLabel(ownText(el)) !== "删除") return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const mid = rect.top + rect.height / 2;
      const originMid = origin.top + origin.height / 2;
      if (Math.abs(mid - originMid) > 28 || rect.left < origin.left) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function uploadModeOn(anchor, choice) {
    return Boolean(sizeChartMarker(anchor, choice));
  }

  async function handSizeChartFile(anchor, choice, image) {
    const marker = sizeChartMarker(anchor, choice);
    const tile = uploadTileBox(sizeChartTile(anchor, choice) || marker);
    if (!tile) return { ok: false, message: "点了上传图片，尺码表上传框没有出现" };
    tile.scrollIntoView({ block: "center", inline: "nearest" });
    await delay(200);
    const before = new Set(allFileInputs());
    hoverElement(tile);
    let button = await waitFor(() => localFileButton(tile), 1800);
    if (!button) {
      hoverElement(tile);
      button = await waitFor(() => localFileButton(tile), 2000);
    }
    if (!button) return { ok: false, message: "悬浮上传框后没有出现本地文件" };
    const target = localFileClickTarget(button);
    let input = localFileInput(target, before) || fileInputNearTile(tile);
    const captured = openLocalFile(button);
    input = captured || input;
    if (!input) input = await waitFor(() => localFileInput(target, before) || fileInputNearTile(tile), 800);
    if (!uploadModeOn(anchor, choice)) return { ok: false, message: "点本地文件时回到了创建尺码表" };
    if (!input || !putSizeChartFile(input, image)) return { ok: false, message: "本地文件里没有找到文件选择" };
    return { ok: true };
  }

  function uploadTileBox(textEl) {
    if (!textEl) return textEl;
    let node = textEl;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const dashed = style.borderTopStyle === "dashed" || (style.borderStyle || "").includes("dashed");
      if (dashed && rect.width >= 60 && rect.height >= 60 && rect.width <= 280) return node;
      if (depth > 0 && rect.width >= 80 && rect.width <= 240 && rect.height >= 80 && rect.height <= 240) return node;
      node = parentNodeOf(node);
    }
    return textEl;
  }

  function hoverElement(el) {
    const rect = el.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 2, Math.max(2, rect.left + rect.width / 2));
    const y = Math.min(window.innerHeight - 2, Math.max(2, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y) || el;
    const move = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      relatedTarget: document.documentElement,
    };
    hit.dispatchEvent(new PointerEvent("pointerenter", move));
    hit.dispatchEvent(new MouseEvent("mouseenter", move));
    hit.dispatchEvent(new PointerEvent("pointerover", move));
    hit.dispatchEvent(new MouseEvent("mouseover", move));
    hit.dispatchEvent(new PointerEvent("pointermove", move));
    hit.dispatchEvent(new MouseEvent("mousemove", move));
    if (hit !== el) {
      el.dispatchEvent(new PointerEvent("pointerenter", move));
      el.dispatchEvent(new MouseEvent("mouseenter", move));
      el.dispatchEvent(new PointerEvent("pointerover", move));
      el.dispatchEvent(new MouseEvent("mouseover", move));
    }
  }

  function localFileButton(tile) {
    const origin = tile.getBoundingClientRect();
    const ox = origin.left + origin.width / 2;
    const oy = origin.top + origin.height / 2;
    let best = null;
    let bestScore = Infinity;
    eachElement((el) => {
      if (!isLocalFileLabel(el) || panelContains(el)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(cx - ox, cy - oy);
      if (dist > 240) return;
      const score = dist + (rect.width * rect.height) / 2000;
      if (score < bestScore) {
        best = el;
        bestScore = score;
      }
    });
    return best;
  }

  function isLocalFileLabel(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8 || rect.width > 220 || rect.height > 120) return false;
    const own = compactLabel(ownText(el));
    if (own === "本地文件") return true;
    if (own || el.childElementCount > 6) return false;
    return compactLabel(el.innerText || "") === "本地文件";
  }

  function compactLabel(text) {
    return String(text || "").replace(/[\s\u200b\u200c\u200d\ufeff]+/g, "").replace(/^[*＊✱]+/, "").replace(/[?？]+$/, "");
  }

  function localFileInput(button, before) {
    let node = button;
    for (let depth = 0; depth < 8 && node && node !== document.body && node !== document.documentElement; depth += 1) {
      const inputs = deepFileInputs(node).filter((input) => !isMainImageInput(input));
      const named = inputs.filter((input) => ancestorText(input).includes("本地文件"));
      if (named.length === 1) return named[0];
      if (depth > 0 && inputs.length === 1) return inputs[0];
      node = parentNodeOf(node);
    }
    const fresh = allFileInputs().filter((input) => !before.has(input) && !isMainImageInput(input));
    const named = fresh.filter((input) => ancestorText(input).includes("本地文件"));
    if (named.length === 1) return named[0];
    return fresh.length === 1 ? fresh[0] : null;
  }

  function localFileClickTarget(button) {
    let node = button;
    let best = button;
    for (let depth = 0; depth < 5 && node; depth += 1) {
      const text = compactLabel(node.innerText || "");
      if (!text.includes("本地文件") || text.includes("媒体中心") || text.includes("创建尺码表")) break;
      best = node;
      node = parentNodeOf(node);
    }
    return best;
  }

  function fileInputNearTile(tile) {
    let node = tile;
    for (let depth = 0; depth < 6 && node && node !== document.body && node !== document.documentElement; depth += 1) {
      const inputs = deepFileInputs(node).filter((input) => !isMainImageInput(input));
      const sized = inputs.filter((input) => {
        const around = ancestorText(input);
        return around.includes("尺码") || around.includes("本地文件");
      });
      if (sized.length === 1) return sized[0];
      if (depth >= 2 && inputs.length === 1) return inputs[0];
      node = parentNodeOf(node);
    }
    return null;
  }

  function openLocalFile(button) {
    let captured = null;
    const proto = HTMLInputElement.prototype;
    const original = proto.click;
    proto.click = function () {
      captured = this;
    };
    try {
      directClick(button);
    } finally {
      proto.click = original;
    }
    return captured;
  }

  function directClick(el) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + Math.max(rect.width / 2, 1);
    const y = rect.top + Math.max(rect.height / 2, 1);
    const down = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, buttons: 1 };
    const up = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, buttons: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", down));
    el.dispatchEvent(new MouseEvent("mousedown", down));
    el.dispatchEvent(new PointerEvent("pointerup", up));
    el.dispatchEvent(new MouseEvent("mouseup", up));
    el.dispatchEvent(new MouseEvent("click", up));
  }

  function putSizeChartFile(input, image) {
    const transfer = new DataTransfer();
    transfer.items.add(image);
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files");
    if (descriptor && descriptor.set) descriptor.set.call(input, transfer.files);
    else input.files = transfer.files;
    if (!input.files || input.files.length !== 1) return false;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function sizeChartUploadChoice(anchor) {
    const anchorRect = anchor.getBoundingClientRect();
    const anchorMid = anchorRect.top + anchorRect.height / 2;
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      if (labelText(el) !== "上传图片") return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const mid = rect.top + rect.height / 2;
      if (Math.abs(mid - anchorMid) > 22) return;
      if (rect.left + rect.width < anchorRect.left) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function sizeChartMarker(anchor, choice) {
    return sizeChartHint() || sizeChartTile(anchor, choice);
  }

  function sizeChartHint() {
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      const text = (el.innerText || "").replace(/\s+/g, "");
      if (!text.includes("并将其转换为尺码表") || text.length > 48) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function sizeChartTile(anchor, choice) {
    if (!anchor || !choice) return null;
    const anchorRect = anchor.getBoundingClientRect();
    const choiceRect = choice.getBoundingClientRect();
    const leftEdge = Math.min(anchorRect.left, choiceRect.left);
    const topEdge = Math.max(anchorRect.bottom, choiceRect.bottom);
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      if (labelText(el) !== "图片") return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      if (rect.top < topEdge - 8 || rect.top > topEdge + 340) return;
      if (rect.left < leftEdge - 48) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function parentNodeOf(node) {
    if (node.parentElement) return node.parentElement;
    const root = node.getRootNode ? node.getRootNode() : null;
    return root && root.host ? root.host : null;
  }

  function deepFileInputs(root) {
    const list = [];
    const stack = [root];
    const seen = new Set();
    while (stack.length) {
      const node = stack.pop();
      if (!node || seen.has(node) || !node.querySelectorAll) continue;
      seen.add(node);
      for (const el of node.querySelectorAll("input[type='file']")) list.push(el);
      for (const el of node.querySelectorAll("*")) {
        if (el.shadowRoot) stack.push(el.shadowRoot);
      }
    }
    return list;
  }

  function isMainImageInput(input) {
    const around = ancestorText(input);
    if (around.includes("尺码")) return false;
    return around.includes("主图") || around.includes("商品图片") || around.includes("商品图");
  }

  function allFileInputs() {
    const list = [];
    eachElement((el) => {
      if (el.matches && el.matches("input[type='file']")) list.push(el);
    });
    return list;
  }

  function labelText(el) {
    const raw = ownText(el) || (el.childElementCount === 0 ? el.innerText || "" : "");
    return raw.replace(/\s+/g, "").replace(/^[*＊✱]+/, "").replace(/[?？]+$/, "");
  }

  async function selectCompliance() {
    await clickSection("商品合规");
    const questions = ["是否含有化学物质", "是否含有致癌物质"];
    for (const question of questions) {
      const result = await chooseNo(question);
      if (!result.ok) return result;
    }
    return { ok: true, message: "化学物质和致癌物质都已选否" };
  }

  async function chooseNo(question) {
    const label = findFieldLabel(question);
    if (!label) return { ok: false, message: "没有找到" + question };
    label.scrollIntoView({ block: "center", inline: "nearest" });
    await delay(150);
    const choice = textBelow(label, "否");
    if (!choice) return { ok: false, message: question + " 旁边没有「否」" };
    clickElement(choice);
    await delay(150);
    return { ok: true };
  }

  async function fillLogistics(weight, size) {
    const grams = String(weight || "300").trim();
    const values = Array.isArray(size) && size.length === 3 ? size.map((item) => String(item).trim()) : ["3", "15", "20"];
    await clickSection("物流信息");
    const weightLabel = findFieldLabel("包裹重量");
    const weightInput = numberInputNear(weightLabel);
    if (!weightInput) return { ok: false, message: "没有找到包裹重量" };
    setControlValue(weightInput, grams);
    const sizeLabel = findFieldLabel("包裹尺寸");
    const inputs = inputRow(sizeLabel, 3);
    if (inputs.length < 3) return { ok: false, message: "没有找到三个包裹尺寸" };
    inputs.forEach((input, index) => setControlValue(input, values[index]));
    if (String(weightInput.value).trim() !== grams) return { ok: false, message: "包裹重量没有写成 " + grams };
    return { ok: true, message: "物流已填写 " + grams + " 克，" + values.join("×") + " 厘米" };
  }

  function numberInputNear(label) {
    const row = inputRow(label, 1);
    return row[0] || null;
  }

  function inputRow(label, count) {
    const inputs = inputsNear(label, 8);
    if (inputs.length === 0) return [];
    inputs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const rowTop = inputs[0].getBoundingClientRect().top;
    return inputs.filter((input) => Math.abs(input.getBoundingClientRect().top - rowTop) < 24).slice(0, count);
  }

  function inputsNear(label, limit) {
    if (!label) return [];
    const labelRect = label.getBoundingClientRect();
    const inputs = [...document.querySelectorAll("input")].filter((input) => {
      const type = (input.getAttribute("type") || "text").toLowerCase();
      if (type === "hidden" || type === "file" || type === "checkbox" || type === "radio") return false;
      const rect = input.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 16) return false;
      return rect.top >= labelRect.bottom - 8 && rect.top < labelRect.bottom + 90;
    });
    inputs.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    return inputs.slice(0, limit);
  }

  function exactText(name) {
    let best = null;
    let bestArea = Infinity;
    for (const el of document.querySelectorAll("label, span, div, p, button, a")) {
      if (ownText(el) !== name) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  function textBelow(origin, name) {
    if (!origin) return exactText(name);
    const originRect = origin.getBoundingClientRect();
    let best = null;
    let bestTop = Infinity;
    for (const el of document.querySelectorAll("label, span, div, p, button, a")) {
      if (ownText(el) !== name) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (rect.top < originRect.bottom - 8 || rect.top > originRect.bottom + 180) continue;
      if (rect.top < bestTop) {
        best = el;
        bestTop = rect.top;
      }
    }
    return best;
  }

  async function openCreateProduct() {
    const button = await waitFor(() => addProductButton(), 15000);
    if (!button) return { ok: false, message: "没有找到添加商品" };
    button.scrollIntoView({ block: "center", inline: "nearest" });
    await delay(200);
    let opened = "";
    const remember = (value) => {
      const href = usableCreateURL(value);
      if (href) opened = href;
    };
    const anchor = button.closest ? button.closest("a") : null;
    if (anchor) remember(anchor.href);
    const previousTarget = anchor ? anchor.getAttribute("target") : null;
    if (anchor && anchor.target === "_blank") anchor.target = "_self";
    const originalOpen = window.open;
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    window.open = (url) => {
      remember(url);
      const stub = { closed: false, opener: window, focus() {}, close() {}, blur() {}, postMessage() {} };
      stub.location = {
        assign: remember,
        replace: remember,
        get href() { return opened; },
        set href(value) { remember(value); },
      };
      return stub;
    };
    HTMLAnchorElement.prototype.click = function () {
      if (this && this.href && String(this.href).includes("/product/create")) {
        remember(this.href);
        this.target = "_self";
      }
      return originalAnchorClick.apply(this, arguments);
    };
    const keepHere = (event) => {
      const path = event.composedPath ? event.composedPath() : [];
      path.forEach((node) => {
        if (!node || !node.href) return;
        remember(node.href);
        if (node.target === "_blank") event.preventDefault();
      });
    };
    document.addEventListener("click", keepHere, true);
    try {
      directClick(button);
      await delay(1200);
      if (location.pathname.includes("/product/create")) return { ok: true, message: "已在当前页打开添加商品" };
      const target = opened || "https://seller.us.tiktokshopglobalselling.com/product/create?channel=manage&shop_region=US";
      location.assign(target);
      return { ok: true, message: "已在当前页打开添加商品" };
    } finally {
      document.removeEventListener("click", keepHere, true);
      window.open = originalOpen;
      HTMLAnchorElement.prototype.click = originalAnchorClick;
      if (anchor && previousTarget !== null) anchor.setAttribute("target", previousTarget);
    }
  }

  function usableCreateURL(value) {
    try {
      const href = new URL(String(value || ""), location.href).href;
      return href.includes("/product/create") ? href : "";
    } catch (error) {
      return "";
    }
  }

  function addProductButton() {
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      if (compactLabel(ownText(el)) !== "添加商品") return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8 || rect.top > 260 || rect.left < 200 || rect.bottom <= 0) return;
      const clickable = el.closest ? el.closest("button, a, [role='button']") : null;
      const target = clickable || el;
      if (compactLabel(target.innerText || "") !== "添加商品") return;
      const targetRect = target.getBoundingClientRect();
      if (targetRect.width > 240 || targetRect.height > 72 || targetRect.left < 200) return;
      if (target.closest && target.closest("nav, aside")) return;
      const area = targetRect.width * targetRect.height;
      if (area < bestArea) {
        best = target;
        bestArea = area;
      }
    });
    return best;
  }

  function pinned(el) {
    let node = el;
    for (let depth = 0; depth < 6 && node; depth += 1) {
      const position = window.getComputedStyle(node).position;
      if (position === "fixed" || position === "sticky") return true;
      node = node.parentElement;
    }
    return false;
  }

  async function discardChanges() {
    const button = plainDiscardButton();
    if (!button) return { ok: true, message: "没有放弃更改的窗口" };
    directClick(button);
    const gone = await waitFor(() => (plainDiscardButton() ? null : true), 3000);
    if (!gone) return { ok: false, message: "点了放弃，窗口还在" };
    return { ok: true, message: "已放弃未保存的更改" };
  }

  function discardDialogText(el) {
    let node = el;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const text = node.innerText || "";
      if (text.includes("是否放弃更改") && text.length < 180) return text;
      node = node.parentElement;
    }
    return "";
  }

  function plainDiscardButton() {
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      const own = compactLabel(ownText(el));
      const nested = compactLabel(el.innerText || "");
      if (own !== "放弃" && nested !== "放弃") return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 16 || rect.top < 0 || rect.bottom > window.innerHeight) return;
      const dialog = discardDialogText(el);
      if (!dialog || dialog.includes("另存为草稿") || dialog.includes("提交审核")) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  async function saveDraftAndBack() {
    const chart = await waitForSizeChartReady(20000);
    if (!chart.ok) return chart;
    if (!leaveDialogOpen()) {
      const draft = footerDraftButton();
      if (!draft) return { ok: false, message: "没有找到另存为草稿" };
      draft.scrollIntoView({ block: "center", inline: "nearest" });
      await delay(200);
      directClick(draft);
      const saved = await waitForDraftResult(15000);
      if (!saved.ok) return saved;
    }
    if (leaveDialogOpen()) {
      const saved = await saveFromLeaveDialog();
      if (!saved.ok) return saved;
    }
    return { ok: true, message: "草稿保存成功" };
  }

  async function saveFromLeaveDialog() {
    const button = dialogDraftButton();
    if (!button) return { ok: false, message: "退出前要先点另存为草稿" };
    directClick(button);
    const done = await waitFor(() => {
      if (draftProblem()) return "problem";
      if (leaveDialogOpen()) return null;
      if (draftSavedToast() || !pageHeading()) return "saved";
      return null;
    }, 12000);
    if (done === "problem") return { ok: false, message: draftProblem() };
    if (done !== "saved") return { ok: false, message: "对话框里的另存为草稿还没有完成" };
    return { ok: true };
  }

  async function waitForDraftResult(timeout) {
    const result = await waitFor(() => {
      const problem = draftProblem();
      if (problem) return { ok: false, message: problem };
      if (draftSavedToast()) return { ok: true };
      return null;
    }, timeout);
    return result || { ok: false, message: "点了另存为草稿，还没有看到草稿保存成功" };
  }

  function footerDraftButton() {
    return draftChoice(false);
  }

  function dialogDraftButton() {
    return draftChoice(true);
  }

  function draftChoice(inDialog) {
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      if (compactLabel(ownText(el)) !== "另存为草稿") return;
      if (insideLeaveDialog(el) !== inDialog) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 16 || rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function insideLeaveDialog(el) {
    let node = el;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const text = compactLabel(node.innerText || "");
      if (text.includes("是否放弃更改") && text.includes("另存为草稿") && text.length < 80) return true;
      node = node.parentElement;
    }
    return false;
  }

  function leaveDialogOpen() {
    let open = false;
    eachElement((el) => {
      if (open || el.childElementCount > 3) return;
      const text = compactLabel(el.innerText || "");
      if (!text.includes("是否放弃更改") || text.length > 40) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 12) return;
      open = true;
    });
    return open;
  }

  function draftSavedToast() {
    return visibleToast((text) => text.includes("草稿保存成功") || text === "保存成功");
  }

  function draftProblem() {
    return visibleToast((text) => text.includes("不合法") || text.includes("保存失败") || text.includes("请完善"));
  }

  function visibleToast(match) {
    let found = "";
    eachElement((el) => {
      if (found || el.childElementCount > 4) return;
      const text = compactLabel(el.innerText || "");
      if (!text || text.length > 40 || !match(text)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      found = text;
    });
    return found;
  }

  function pageHeading() {
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      if (compactLabel(ownText(el)) !== "添加商品") return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 48 || rect.height < 16 || rect.top < 0 || rect.top > 180) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function visibleOwnText(name) {
    let best = null;
    let bestArea = Infinity;
    eachElement((el) => {
      if (compactLabel(ownText(el)) !== name) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8 || rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  async function clickSection(name) {
    const el = findLabel(name);
    if (!el) return;
    el.scrollIntoView({ block: "center", inline: "nearest" });
    await delay(150);
    const rect = el.getBoundingClientRect();
    clickAt(rect.left + Math.min(24, rect.width / 2), rect.top + rect.height / 2, "click");
    await delay(200);
  }
})();
