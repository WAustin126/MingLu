/* ============================================================
   明路 · 表格导入层
   两条来源都归一成同一份运行时 schema（与 form.schema.json 同构）：
   A. 本地解析 HTML（不用 AI，确定性规则抽字段）
   B. AI 解析（文字/截图 → 结构），结果再归一化
   ============================================================ */
(function (global) {
  "use strict";

  var Import = {};

  /* ---------- 校验规则生成（按类型，确定性） ---------- */
  function rulesFor(type, required, field) {
    var rules = [];
    if (required) {
      rules.push({ rule: "non_empty", message: field.label + "不能为空，请填写后再继续。" });
    }
    if (type === "email") {
      rules.push({
        rule: "pattern", source: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", flags: "",
        message: "邮箱格式不完整：需要包含 @ 和一个域名，例如 name@example.com。你填的是“{value}”。"
      });
    }
    if (type === "number") {
      rules.push({
        rule: "range",
        message: field.label + "需要在 " + (field.min != null ? field.min : 0) +
          " 到 " + (field.max != null ? field.max : 999999) + " 之间。"
      });
    }
    if ((type === "radio" || type === "checkbox") && required) {
      rules.push({ rule: "group_selected", message: "「" + field.label + "」还没有选择，请选一项。" });
    }
    return rules;
  }

  function hintFor(f) {
    var parts = [];
    parts.push(f.required ? "必填。" : "选填。");
    parts.push("这一项是「" + f.label + "」。");
    if (f.help) { parts.push(f.help); }
    if (f.options && f.options.length) {
      parts.push("可选 " + f.options.length + " 项：" + f.options.map(function (o) { return o.label; }).join("、") + "。");
    }
    return parts.join("");
  }

  function finalize(fields) {
    return fields.map(function (f, i) {
      f.key = f.key || ("f" + (i + 1));
      f.required = !!f.required;
      f.type = f.type || "text";
      f.label = (f.label || ("第 " + (i + 1) + " 项")).trim();
      f.help = f.help || "";
      f.screen_reader_hint = f.screen_reader_hint || hintFor(f);
      f.validation = f.validation || rulesFor(f.type, f.required, f);
      if ((f.type === "radio" || f.type === "checkbox") && (!f.options || !f.options.length)) {
        f.type = f.type === "checkbox" ? "checkbox" : "text";
      }
      return f;
    });
  }

  function textOf(el) {
    return (el && el.textContent ? el.textContent : "").replace(/\s+/g, " ").trim();
  }

  /* ---------- A. 本地解析 HTML ---------- */
  Import.fromHtml = function (html, fallbackName) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var formEl = doc.querySelector("form") || doc.body;
    var title = textOf(doc.querySelector("h1")) || textOf(doc.querySelector("title")) || fallbackName || "导入的表单";
    var desc = "";
    var firstP = doc.querySelector("h1 + p, h1 ~ p, .sub, .description, .desc");
    if (firstP) { desc = textOf(firstP); }

    var fields = [];
    var seenGroups = {};
    var controls = formEl.querySelectorAll("input, textarea, select");

    controls.forEach(function (el) {
      var kind = (el.getAttribute("type") || el.tagName).toLowerCase();
      if (/^(hidden|submit|button|reset|image|file|search)$/.test(kind)) { return; }

      var name = el.getAttribute("name") || el.getAttribute("id") || "";
      var type = "text";
      if (kind === "email") { type = "email"; }
      else if (kind === "number") { type = "number"; }
      else if (kind === "radio") { type = "radio"; }
      else if (kind === "checkbox") { type = "checkbox"; }
      else if (el.tagName === "TEXTAREA") { type = "textarea"; }
      else if (el.tagName === "SELECT") { type = el.multiple ? "checkbox" : "radio"; }

      // 同组选项合并
      var groupKey = (type === "radio" || type === "checkbox") ? (name || "group" + fields.length) : null;
      if (groupKey && seenGroups[groupKey] != null) {
        var g = fields[seenGroups[groupKey]];
        var val = el.getAttribute("value");
        var optLabel = textOf(el.closest("label")) || textOf(el.nextSibling && el.nextSibling.nodeType === 3 ? el.parentNode : null) || val || "";
        if (val != null) { g.options.push({ value: val, label: optLabel.replace(val, "").trim() || val }); }
        return;
      }

      // 找标签
      var label = "";
      var wrap = el.closest("label");
      if (wrap) {
        label = textOf(wrap).replace(textOf(el), "").trim();
      }
      if (!label) {
        var id = el.getAttribute("id");
        if (id) {
          var lb = formEl.querySelector('label[for="' + id + '"]');
          if (lb) { label = textOf(lb); }
        }
      }
      if (!label && el.getAttribute("aria-label")) { label = el.getAttribute("aria-label"); }
      if (!label && el.getAttribute("aria-labelledby")) {
        var ref = el.getAttribute("aria-labelledby").split(/\s+/)[0];
        var refEl = formEl.querySelector("#" + ref) || doc.getElementById(ref);
        if (refEl) { label = textOf(refEl); }
      }
      if (!label) {
        // 字段组用 legend
        var fs = el.closest("fieldset");
        if (fs && fs.querySelector("legend")) { label = textOf(fs.querySelector("legend")); }
      }
      // 表格布局兜底：标题常是控制前一个单元格里的纯文字（政务表最常见），
      // 它在原表里没有和控件绑定，但文字本身就是这一项的标题，先收下来，
      // 后续由机构端检查确认绑定（labelFromContext 标记来源）。
      var fromContext = false;
      if (!label) {
        var cell = el.closest("td, th");
        if (cell && cell.previousElementSibling && /^(TD|TH)$/.test(cell.previousElementSibling.tagName)) {
          label = textOf(cell.previousElementSibling);
          if (label) { fromContext = true; }
        }
        if (!label) {
          var psib = el.previousElementSibling;
          if (psib && /^(SPAN|DIV|P|B|STRONG|FONT)$/.test(psib.tagName)) {
            label = textOf(psib);
            if (label) { fromContext = true; }
          }
        }
      }
      var rawLabelMarked = /[*＊]|必填/.test(label || "");

      // 找说明
      var help = "";
      var described = el.getAttribute("aria-describedby");
      if (described) {
        described.split(/\s+/).forEach(function (rid) {
          var d = formEl.querySelector("#" + rid) || doc.getElementById(rid);
          var t = textOf(d);
          if (t && !/^提交|错误/.test(t)) { help += (help ? " " : "") + t; }
        });
      }
      if (!help) {
        var next = el.nextElementSibling;
        if (next && /^(P|SMALL|SPAN|DIV)$/.test(next.tagName) && /hint|help|desc|note/i.test(next.className || "")) {
          help = textOf(next);
        }
      }

      var required = el.hasAttribute("required") || el.getAttribute("aria-required") === "true";
      var f = {
        key: name || ("f" + (fields.length + 1)),
        type: type,
        label: label.replace(/[*＊]/g, "").replace(/（必填）|\(必填\)/g, "").trim(),
        required: required,
        help: help,
        placeholder: el.getAttribute("placeholder") || "",
        options: []
      };
      if (fromContext) { f.labelFromContext = true; }
      if (rawLabelMarked && !required) { f.requiredMarkSeen = true; }

      if (el.getAttribute("autocomplete")) { f.autocomplete = el.getAttribute("autocomplete"); }
      if (kind === "number") {
        f.min = el.getAttribute("min") != null ? Number(el.getAttribute("min")) : 0;
        f.max = el.getAttribute("max") != null ? Number(el.getAttribute("max")) : 999999;
        f.step = Number(el.getAttribute("step") || 1);
        var dv = el.getAttribute("value");
        f["default"] = dv != null && dv !== "" ? Number(dv) : f.min;
      }
      if (el.tagName === "TEXTAREA") { f.rows = Number(el.getAttribute("rows") || 3); }

      if (type === "radio" || type === "checkbox") {
        var v0 = el.getAttribute("value");
        f.options.push({ value: v0 != null ? v0 : "选项1", label: textOf(el.parentNode).replace(v0 || "", "").trim() || (v0 || "选项1") });
        if (groupKey) { seenGroups[groupKey] = fields.length; }
        if (!label) { f.label = name || "第 " + (fields.length + 1) + " 项"; }
      }

      fields.push(f);
    });

    // select：补选项
    formEl.querySelectorAll("select").forEach(function (sel) {
      var nm = sel.getAttribute("name") || "";
      var f = fields.filter(function (x) { return x.key === nm; })[0];
      if (f && sel.options.length) {
        f.options = Array.prototype.map.call(sel.options, function (o) {
          return { value: o.value, label: textOf(o) || o.value };
        });
      }
    });

    var schema = {
      schema_version: "1.0-imported",
      generated_by: "明路 · 本地解析（HTML → 字段结构，未调用 AI）",
      generated_at: new Date().toISOString(),
      source_file: fallbackName || "导入的 HTML",
      form: {
        id: "imported-form",
        title: title,
        description: desc || "这份表格由用户自己导入，明路只负责逐项讲清楚、帮你填完。",
        safety_notice: "演示环境，请勿填写真实个人信息",
        privacy: "所有内容只保存在当前浏览器，不向任何服务器发送。",
        submit: {
          mode: "local-simulation",
          server_endpoint: null,
          button_label: "完成填写",
          result_wording: "填写任务完成",
          forbidden_wording: ["报名成功", "提交成功"],
          wording_reason: "无服务端时本地模拟不得表述为真实提交成功"
        }
      },
      fields: finalize(fields)
    };
    return schema;
  };

  /* ---------- B. AI 解析结果归一化 ---------- */
  Import.fromAiResult = function (result, sourceName) {
    var fields = (result.fields || []).map(function (f, i) {
      var type = f.type || "text";
      if (type === "select") { type = "radio"; }
      return {
        key: f.id || ("f" + (i + 1)),
        type: type,
        label: f.label || ("第 " + (i + 1) + " 项"),
        required: !!f.required,
        help: f.help || f.hint || "",
        placeholder: f.placeholder || "",
        options: (f.options || []).map(function (o) {
          return { value: o.value != null ? o.value : o.label, label: o.label || String(o.value || "") };
        }),
        min: f.min != null ? f.min : 0,
        max: f.max != null ? f.max : 999999,
        "default": f["default"],
        uncertain: f.uncertain || ""
      };
    });

    return {
      schema_version: "1.0-ai",
      generated_by: "明路 · AI 解析（表格文字/截图 → 字段结构）",
      generated_at: new Date().toISOString(),
      source_file: sourceName || "AI 解析的表单",
      form: {
        id: "ai-form",
        title: result.title || "导入的表单",
        description: result.description || "这份表格由 AI 解析成可逐项填写的结构。",
        safety_notice: "演示环境，请勿填写真实个人信息",
        privacy: "所有内容只保存在当前浏览器，不向任何服务器发送。",
        submit: {
          mode: "local-simulation",
          server_endpoint: null,
          button_label: "完成填写",
          result_wording: "填写任务完成",
          forbidden_wording: ["报名成功", "提交成功"],
          wording_reason: "无服务端时本地模拟不得表述为真实提交成功"
        }
      },
      fields: finalize(fields)
    };
  };

  /* ---------- 存储：机构发布 / 个人导入 ---------- */
  var PUBLISHED_KEY = "minglu.published.schema";
  var IMPORTED_KEY = "minglu.personal.schema";

  Import.publish = function (schema) {
    var payload = {
      schema: schema,
      at: new Date().toISOString(),
      from: "机构侧工作台"
    };
    localStorage.setItem(PUBLISHED_KEY, JSON.stringify(payload));
    return payload;
  };
  /* 服务器发布：存入服务器表单库并发布，发布过的表都留着、可再调用（2026-11-28） */
  Import.publishToServer = function (schema) {
    return fetch("../api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema: schema })
    }).then(function (r) {
      if (!r.ok) { throw new Error("HTTP " + r.status); }
      return r.json();
    });
  };
  Import.getServerPublished = function () {
    return fetch("../data/published.schema.json", { cache: "no-store" }).then(function (r) {
      if (!r.ok) { return null; }
      return r.json();
    }).then(function (p) {
      return (p && p.schema && Array.isArray(p.schema.fields)) ? p : null;
    }).catch(function () { return null; });
  };

  /* 表单库（服务器）：发布过的全部表单 */
  Import.getLibrary = function () {
    return fetch("../data/library.json", { cache: "no-store" }).then(function (r) {
      if (!r.ok) { return null; }
      return r.json();
    }).then(function (p) {
      return (p && Array.isArray(p.forms)) ? p : null;
    }).catch(function () { return null; });
  };
  Import.libraryToggle = function (id, published) {
    return fetch("../api/library/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, published: !!published })
    }).then(function (r) { if (!r.ok) { throw new Error("HTTP " + r.status); } return r.json(); });
  };
  Import.libraryRemove = function (id) {
    return fetch("../api/library/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id })
    }).then(function (r) { if (!r.ok) { throw new Error("HTTP " + r.status); } return r.json(); });
  };

  Import.getPublished = function () {
    try {
      var raw = localStorage.getItem(PUBLISHED_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };
  Import.clearPublished = function () { localStorage.removeItem(PUBLISHED_KEY); };

  Import.saveImported = function (schema) {
    localStorage.setItem(IMPORTED_KEY, JSON.stringify({ schema: schema, at: new Date().toISOString() }));
  };
  Import.getImported = function () {
    try {
      var raw = localStorage.getItem(IMPORTED_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };
  Import.clearImported = function () { localStorage.removeItem(IMPORTED_KEY); };

  global.MingluImport = Import;
})(window);
