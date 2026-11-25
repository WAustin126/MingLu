/* ============================================================
   明路 · 表格要点提取（extract.js）
   - 目标：先回答「这张表到底要你交什么」，再回答「哪里不严谨」
   - 纯本地规则，不需要网络与模型，结果稳定可复现
   - 机构端与个人端共用同一套判断，保证两端说法一致
   ============================================================ */
(function (global) {
  "use strict";

  var E = {};

  /* 关键项识别：按优先级匹配字段名，命中即停。
     顺序本身就是「错不起」的程度：证件与姓名排前面。 */
  var KEY_RULES = [
    { re: /身份证|证件号|证件号码/, name: "证件号码", why: "要对着证件一字一字抄，最容易抄错" },
    { re: /残疾证|残疾人证/, name: "残疾证号", why: "决定符不符合申请条件" },
    { re: /姓名|名字|申请人|称呼/, name: "姓名", why: "身份核对的第一项" },
    { re: /手机|电话|联系方式|邮箱|电子邮件/, name: "联系方式", why: "办下来要靠它通知你" },
    { re: /住址|地址|户籍|居住地/, name: "地址", why: "决定归哪个街道受理" },
    { re: /银行卡|账号|卡号|开户/, name: "收款账户", why: "补贴要打进这个账户" },
    { re: /出生|生日|年龄/, name: "出生日期", why: "有些补贴按年龄划线" },
    { re: /监护|联系人|关系/, name: "监护人", why: "要留一个能联系上的人" }
  ];

  /* 需要提前准备的材料：从字段名与说明里反推 */
  var PREP_RULES = [
    { re: /身份证/, name: "身份证" },
    { re: /残疾证|残疾人证/, name: "残疾人证" },
    { re: /户口|户籍/, name: "户口本" },
    { re: /低保证|低收/, name: "低保证明" },
    { re: /银行卡|卡号|账号|开户/, name: "银行卡" },
    { re: /照片|证件照|一寸|二寸/, name: "证件照片" },
    { re: /诊断|病历|医学|鉴定/, name: "诊断证明" },
    { re: /收入|工资|经济|财产/, name: "收入证明" }
  ];

  function labelOf(f) { return String((f && f.label) || ""); }

  /* ---------- 主分析 ---------- */
  E.analyze = function (schema) {
    var fields = (schema && schema.fields) || [];
    var required = fields.filter(function (f) { return f.required; });

    var hits = [];
    fields.forEach(function (f) {
      var label = labelOf(f);
      for (var i = 0; i < KEY_RULES.length; i++) {
        if (KEY_RULES[i].re.test(label)) {
          hits.push({
            label: label,
            name: KEY_RULES[i].name,
            why: KEY_RULES[i].why,
            rank: i,
            required: !!f.required
          });
          return;
        }
      }
    });

    // 必填的排前面，其次按风险等级
    hits.sort(function (a, b) {
      if (a.required !== b.required) { return a.required ? -1 : 1; }
      return a.rank - b.rank;
    });
    var keyItems = hits.slice(0, 3);

    // 一个关键项都没识别出来时，退化成「前三个必填」
    if (!keyItems.length && required.length) {
      keyItems = required.slice(0, 3).map(function (f) {
        return { label: labelOf(f), name: labelOf(f), why: "必填项", rank: 99, required: true };
      });
    }

    // 材料清单：只看字段名与业务说明，不看读屏提示（提示是引导语，容易误触发）
    var blob = fields.map(function (f) {
      return labelOf(f) + " " + (f.help || "");
    }).join(" ");
    var prepare = [];
    PREP_RULES.forEach(function (r) {
      if (r.re.test(blob) && prepare.indexOf(r.name) === -1) { prepare.push(r.name); }
    });

    // 时间估算：一项约 24 秒
    var minutes = Math.max(1, Math.round(fields.length * 0.4));

    return {
      title: (schema && schema.form && schema.form.title) || "这张表",
      total: fields.length,
      required: required.length,
      optional: fields.length - required.length,
      keyItems: keyItems,
      prepare: prepare,
      minutes: minutes
    };
  };

  /* ---------- 口播稿：一段话讲完整张表 ---------- */
  E.speech = function (x) {
    if (!x) { return ""; }
    var s = "这张表叫《" + x.title + "》，一共 " + x.total + " 项";
    s += x.required >= x.total
      ? "，全部都要填。"
      : "，其中 " + x.required + " 项必须填，另外 " + x.optional + " 项可以不填。";
    if (x.keyItems.length) {
      s += "最要紧的是" + x.keyItems.map(function (k) { return k.label || k.name; }).join("、") +
        "，这几项填错会被退回来。";
    }
    if (x.prepare.length) {
      s += "开始之前，请先准备好" + x.prepare.join("、") + "。";
    }
    s += "准备好了，我们就一项一项来，我会一项一项念给你听。";
    return s;
  };

  /* ---------- 渲染成卡片（两端共用） ---------- */
  E.render = function (x, opts) {
    if (!x) { return ""; }
    var o = opts || {};
    var esc = (global.Minglu && Minglu.escapeHtml) ? Minglu.escapeHtml : function (t) { return String(t); };

    var keys = "";
    if (x.keyItems.length) {
      keys = "<ul class='ex-list'>" + x.keyItems.map(function (k) {
        return "<li><strong>" + esc(k.label || k.name) + "</strong><span>" + esc(k.why) +
          (k.required ? "" : "（选填）") + "</span></li>";
      }).join("") + "</ul>";
    } else {
      keys = "<p class='ex-none'>这张表没有特别容易出错的项。</p>";
    }

    var prep = x.prepare.length
      ? "<ul class='ex-list ex-prep'>" + x.prepare.map(function (n) {
          return "<li><strong>" + esc(n) + "</strong></li>";
        }).join("") + "</ul>"
      : "<p class='ex-none'>不用特别准备材料，想到什么填什么就行。</p>";

    return "<div class='extract'>" +
      "<h2 class='ex-h'>" + esc(o.heading || "这张表要你交什么") + "</h2>" +
      "<p class='ex-lead'>一共 <b>" + x.total + "</b> 项，" +
        (x.optional > 0 ? "<b>" + x.required + "</b> 项必填、" + x.optional + " 项可跳过，" : "全部必填，") +
        "大约 <b>" + x.minutes + "</b> 分钟。</p>" +
      "<div class='ex-grid'>" +
        "<div><h3 class='ex-sub'>最要紧的 " + x.keyItems.length + " 项</h3>" + keys + "</div>" +
        "<div><h3 class='ex-sub'>开始前准备好</h3>" + prep + "</div>" +
      "</div>" +
      "<div class='ex-foot'>" +
        "<button type='button' class='btn secondary' data-extract-read " +
          "style='min-height:44px;padding:9px 16px;font-size:.85rem'>听一遍这段摘要</button>" +
        "<span class='ex-note'>这段摘要由本地规则生成，不联网、不改原表。</span>" +
      "</div>" +
    "</div>";
  };

  /* 绑定朗读按钮（渲染后调用一次即可） */
  E.bindRead = function (host, x) {
    if (!host || !host.querySelector) { return; }
    var btn = host.querySelector("[data-extract-read]");
    if (!btn) { return; }
    btn.addEventListener("click", function () {
      if (global.Minglu && Minglu.speak) { Minglu.speak(E.speech(x)); }
    });
  };

  global.MingluExtract = E;
})(window);
