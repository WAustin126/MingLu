/* ============================================================
   明路 · AI 能力层（百炼）
   - 两种接入方式：① 本地代理（推荐，Key 不落浏览器）② 浏览器直连百炼（填 Key 即用）
   - 未接入时返回明确降级原因，页面据此显示「本地规则模式」，绝不假装有 AI
   ============================================================ */
(function (global) {
  "use strict";

  var STORE_KEY = "minglu.ai.settings";

  var DEFAULTS = {
    mode: "proxy",                 // proxy | direct | off
    proxyUrl: "http://127.0.0.1:8790",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    key: ""
  };

  var AI = {};

  /* ---------- 设置读写 ----------
     优先级：部署配置 config.js > 浏览器本地设置 > 内置默认值
     部署方在 config.js 里配好，用户端不需要任何设置。 */
  function deployConfig() {
    return (global.MINGLU_CONFIG && global.MINGLU_CONFIG.ai) ? global.MINGLU_CONFIG.ai : null;
  }

  AI.hasDeployConfig = function () { return !!deployConfig(); };
  AI.showAdminEntry = function () {
    return !!(global.MINGLU_CONFIG && global.MINGLU_CONFIG.showAdminEntry);
  };

  AI.getSettings = function () {
    var base = Object.assign({}, DEFAULTS);
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) { base = Object.assign(base, JSON.parse(raw)); }
    } catch (e) { /* 本地损坏则忽略 */ }
    var cfg = deployConfig();
    if (cfg) { base = Object.assign(base, cfg); }
    return base;
  };

  AI.saveSettings = function (s) {
    var cur = AI.getSettings();
    var next = Object.assign({}, cur, s);
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    return next;
  };

  AI.clearKey = function () {
    var cur = AI.getSettings();
    cur.key = "";
    cur.mode = "proxy";   // 清 Key 后回落到代理模式（未配置时即本地规则）
    localStorage.setItem(STORE_KEY, JSON.stringify(cur));
    return cur;
  };

  AI.maskKey = function (k) {
    if (!k) { return ""; }
    if (k.length <= 10) { return k.slice(0, 3) + "****"; }
    return k.slice(0, 6) + "…" + k.slice(-4);
  };

  /* ---------- 代理健康检查 ---------- */
  AI.checkProxy = function () {
    var url = AI.getSettings().proxyUrl.replace(/\/+$/, "") + "/health";
    return fetch(url, { method: "GET", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); })
      .then(function (d) { return { ok: true, configured: !!d.configured, model: d.textModel || "" }; })
      .catch(function () { return { ok: false }; });
  };

  /* ---------- 直连百炼：连通性测试 ---------- */
  AI.testDirect = function () {
    var s = AI.getSettings();
    if (!s.key) { return Promise.resolve({ ok: false, error: "还没有填写 API Key。" }); }
    return fetch(s.endpoint.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.key },
      body: JSON.stringify({
        model: s.model,
        messages: [{ role: "user", content: "只回复两个字：可用" }],
        max_tokens: 8
      })
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = "HTTP " + r.status;
          try { msg += "：" + (JSON.parse(t).message || ""); } catch (e) {}
          return { ok: false, error: msg };
        });
      }
      return r.json().then(function () { return { ok: true }; });
    }).catch(function (e) {
      return {
        ok: false,
        error: "浏览器直连被拦截（" + (e && e.message ? e.message : "网络错误") +
          "）。百炼接口通常不允许网页跨域直连，请改用「本地代理」方式。"
      };
    });
  };

  /* ---------- 统一调用：优选代理，其次直连 ---------- */
  function callModel(payload, timeoutMs) {
    var s = AI.getSettings();
    if (s.mode === "off") {
      return Promise.reject({ code: "OFF", message: "AI 已关闭，当前为本地规则模式。" });
    }
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 45000) : null;

    var req;
    if (s.mode === "direct") {
      if (!s.key) {
        return Promise.reject({ code: "NO_KEY", message: "还没有填写百炼 API Key。" });
      }
      req = fetch(s.endpoint.replace(/\/+$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.key },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      });
    } else {
      // 代理模式：把选用的模型带过去（代理有默认值）
      var body = Object.assign({}, payload);
      req = fetch(s.proxyUrl.replace(/\/+$/, "") + (payload.__path || "/api/explain"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined
      });
    }
    return req.then(function (r) {
      if (timer) { clearTimeout(timer); }
      return r.text().then(function (t) {
        var data = null;
        try { data = JSON.parse(t); } catch (e) {}
        if (!r.ok) {
          throw {
            code: "HTTP_" + r.status,
            message: (data && data.error) || ("请求失败：HTTP " + r.status)
          };
        }
        return data;
      });
    }).catch(function (err) {
      if (timer) { clearTimeout(timer); }
      if (err && err.code) { throw err; }
      throw {
        code: "NETWORK",
        message: "连不上 AI 服务（" + ((err && err.message) || "网络错误") +
          "）。请确认本地代理已启动，或改用本地规则模式。"
      };
    });
  }

  /* ---------- 解释一个字段（陪填台用） ---------- */
  AI.explainField = function (field, formTitle) {
    var s = AI.getSettings();
    if (s.mode === "proxy") {
      return callModel({
        __path: "/api/explain",
        question: "请用一两句大白话说明这一项该填什么、格式要求，再提醒最容易填错的地方。",
        formTitle: formTitle || "",
        field: {
          label: field.label,
          required: !!field.required,
          hint: field.help || "",
          help: field.screen_reader_hint || "",
          options: field.options || []
        }
      }).then(function (d) { return { ok: true, answer: d.answer, model: d.model, note: d.note }; });
    }
    // 直连：自己拼 prompt
    var opts = (field.options || []).map(function (o) { return o.label; }).join("、");
    return callModel({
      model: s.model,
      messages: [
        { role: "system", content: "你是无障碍填表助手。用短句、大白话解释表单字段，一句一个信息点，不用视觉描述（如「红色那一项」）。最多三句话，不编造原表没有的信息。" },
        { role: "user", content: "表单：" + (formTitle || "") + "\n字段：" + field.label +
            "\n是否必填：" + (field.required ? "必填" : "可跳过") +
            "\n原表说明：" + (field.help || "无") +
            (opts ? "\n可选项：" + opts : "") +
            "\n请解释这一项怎么填，并提醒最容易错的地方。" }
      ],
      temperature: 0.2,
      max_tokens: 220
    }).then(function (d) {
      var text = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      if (!text) { throw { code: "EMPTY", message: "AI 没有返回内容。" }; }
      return { ok: true, answer: text.trim(), model: s.model, note: "AI 解释建议，不是原表内容。" };
    });
  };

  /* ---------- 语音规整（个人端语音填表用） ---------- */
  AI.voiceFill = function (field, transcript) {
    var s = AI.getSettings();
    if (s.mode !== "proxy") {
      return Promise.reject({ code: "NO_PROXY", message: "语音规整需要服务端代理模式。" });
    }
    return callModel({
      __path: "/api/voice-fill",
      transcript: transcript || "",
      today: new Date().toISOString().slice(0, 10),
      field: {
        label: field.label,
        type: field.type || "text",
        required: !!field.required,
        hint: field.help || "",
        help: field.screen_reader_hint || "",
        options: (field.options || []).map(function (o) { return { value: o.value, label: o.label }; })
      }
    }).then(function (d) {
      return { ok: true, value: d.value, readback: d.readback, certain: d.certain !== false, notFound: d.notFound === true, model: d.model };
    });
  };

  /* ---------- 解析一张表（个人端自己导入用） ---------- */
  AI.parseFormText = function (text, imageDataUrl) {
    var s = AI.getSettings();
    if (s.mode === "proxy") {
      return callModel({ __path: "/api/parse-form", text: text || "", image: imageDataUrl || "" }, 60000)
        .then(function (d) { return { ok: true, result: d.result, model: d.model }; });
    }
    if (!s.key) { return Promise.reject({ code: "NO_KEY", message: "还没有填写百炼 API Key。" }); }
    var content = [];
    if (imageDataUrl) { content.push({ type: "image_url", image_url: { url: imageDataUrl } }); }
    if (text) { content.push({ type: "text", text: "表单文字内容如下：\n" + text }); }
    content.push({ type: "text", text: '请输出 JSON：{"title":"","description":"","fields":[{"label":"","type":"text|email|radio|number|checkbox|textarea","required":true,"hint":"","help":"","options":[{"value":"","label":""}]}]}' });
    return callModel({
      model: s.key ? s.model : s.model,
      messages: [
        { role: "system", content: "你是表单结构解析器。只输出 JSON，不编造字段；不确定的字段在 help 里写「待确认」。" },
        { role: "user", content: content }
      ],
      temperature: 0.1,
      max_tokens: 1200
    }).then(function (d) {
      var raw = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      var m = raw && raw.match(/\{[\s\S]*\}/);
      if (!m) { throw { code: "NO_JSON", message: "AI 没有返回可用的表结构。" }; }
      return { ok: true, result: JSON.parse(m[0]), model: s.model };
    });
  };

  /* ---------- 文件解析（PDF / Word，服务端预处理后走同一解析口径） ---------- */
  AI.parseFormFile = function (kind, dataBase64) {
    var s = AI.getSettings();
    if (s.mode === "proxy") {
      return callModel({ __path: "/api/parse-form", file: { kind: kind, dataBase64: dataBase64 } }, 120000)
        .then(function (d) { return { ok: true, result: d.result, model: d.model }; });
    }
    return Promise.reject({ code: "FILE_NEEDS_PROXY", message: "PDF / Word 文件解析需要通过部署版服务进行，当前模式不支持。" });
  };

  /* ---------- 当前状态文案 ---------- */
  AI.status = function () {
    var s = AI.getSettings();
    if (s.mode === "off") { return { level: "off", text: "AI 已关闭 · 本地规则模式" }; }
    if (s.mode === "direct") {
      return s.key
        ? { level: "direct", text: "AI 直连百炼 · " + s.model + "（" + AI.maskKey(s.key) + "）" }
        : { level: "warn", text: "直连已选但未填 Key · 本地规则模式" };
    }
    return { level: "proxy", text: "AI 本地代理 · 127.0.0.1:8790" };
  };

  global.MingluAI = AI;
})(window);
