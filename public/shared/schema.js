/* ============================================================
   明路 · Web 共享逻辑
   - 数据加载（fetch，file:// 受限时给出明确提示）
   - 字段校验引擎（规则与 form.schema.json 的 validation 一致）
   - 朗读（speechSynthesis）与字号切换
   ============================================================ */
(function (global) {
  "use strict";

  var Minglu = {};

  /* ---------- 数据加载 ---------- */
  Minglu.fetchJSON = function (url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) { throw new Error("HTTP " + r.status); }
      return r.json();
    });
  };

  Minglu.fetchText = function (url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) { throw new Error("HTTP " + r.status); }
      return r.text();
    });
  };

  /* file:// 下 fetch 会被浏览器拦截，给出明确说明而非静默失败 */
  Minglu.explainLoadError = function (url) {
    if (location.protocol === "file:") {
      return "浏览器在 file:// 直接打开时禁止读取 " + url +
        "。请在 minglu 工程根目录运行 python -m http.server 8780，" +
        "然后访问 http://127.0.0.1:8780/web/ 。";
    }
    return "读取 " + url + " 失败，请确认本地服务已启动、文件存在。";
  };

  /* ---------- 校验引擎 ----------
     支持的规则与 form.schema.json 一致：
     non_empty / pattern / range / group_selected
     value 取值：文本类为字符串；radio 为已选 value 或 ""；
     number 为字符串原值（在此解析）；checkbox 组为数组。 */
  Minglu.validateField = function (field, value) {
    var rules = field.validation || [];
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var msg = null;
      if (rule.rule === "non_empty") {
        if (!String(value == null ? "" : value).trim()) { msg = rule.message; }
      } else if (rule.rule === "pattern") {
        var re = new RegExp(rule.source, rule.flags || "");
        var v = String(value == null ? "" : value).trim();
        if (v && !re.test(v)) { msg = rule.message.replace("{value}", v); }
      } else if (rule.rule === "range") {
        var n = parseInt(value, 10);
        if (isNaN(n) || n < field.min || n > field.max) { msg = rule.message; }
      } else if (rule.rule === "group_selected") {
        if (!value) { msg = rule.message; }
      }
      if (msg) { return msg; }
    }
    return null;
  };

  /* 未填必填项检查（整表查错用）：返回 { key, label, message } 数组
     getValue 按字段 key 取值：getValue(key) */
  Minglu.checkAll = function (fields, getValue) {
    var problems = [];
    fields.forEach(function (f) {
      var v = getValue(f.key);
      var msg = Minglu.validateField(f, v);
      if (msg) { problems.push({ key: f.key, label: f.label, message: msg }); }
    });
    return problems;
  };

  /* ---------- 朗读 ---------- */
  var ttsOn = false;
  Minglu.setTTS = function (on) {
    ttsOn = !!on;
    if (!ttsOn && global.speechSynthesis) { speechSynthesis.cancel(); }
  };
  Minglu.isTTS = function () { return ttsOn; };
  Minglu.speak = function (text) {
    if (!ttsOn || !global.speechSynthesis || !text) { return; }
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 1.0;
    speechSynthesis.speak(u);
  };

  /* ---------- 字号切换：标准 → 大 → 特大 循环 ---------- */
  Minglu.cycleFontSize = function () {
    var h = document.documentElement;
    if (h.classList.contains("fs-3")) {
      h.classList.remove("fs-3");
      return "标准";
    } else if (h.classList.contains("fs-2")) {
      h.classList.remove("fs-2"); h.classList.add("fs-3");
      return "特大";
    } else {
      h.classList.add("fs-2");
      return "大";
    }
  };
  Minglu.fontSizeLabel = function () {
    var h = document.documentElement;
    if (h.classList.contains("fs-3")) { return "特大"; }
    if (h.classList.contains("fs-2")) { return "大"; }
    return "标准";
  };

  /* ---------- 小工具 ---------- */
  Minglu.escapeHtml = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  Minglu.download = function (filename, content, mime) {
    var blob = new Blob([content], { type: mime || "application/octet-stream" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  };

  global.Minglu = Minglu;
})(window);
