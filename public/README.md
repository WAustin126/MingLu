# 明路 Web 站 · 运行、部署与交接说明

> **如果你是从「源码包」拿到这个目录**：请先看根目录的《执行说明-给千问办公.md》，用 `python start.py` 启动。
> 本文档里的 `.bat` 脚本是原 Windows 部署方式，已移到 `tools/legacy-windows/`，非必需。

「明路无障碍填表助手」新版网站。核心设计：**AI 由部署方一次接好，用户端零配置，打开即用。**

---

## 一、启动

### 方式 A：只要网页（AI 走本地规则）
双击 `web\start-web.bat`，或手动：

```bash
cd D:\千问办公提交版\minglu
python -m http.server 8780
```

打开 <http://127.0.0.1:8780/web/>

### 方式 B：网页 + AI（推荐，用户零配置）
双击 `web\start-web-ai.bat` → 按提示粘贴一次百炼 Key → 脚本自动起静态服务、起 AI 代理、打开网页。

之后**所有用户**直接访问 `http://<部署机IP>:8780/web/` 就能用 AI，不需要填任何东西。

### 方式 C：局域网 / 手机演示
双击 `web\start-web-lan.bat` → 粘贴 Key → 静态服务绑定 0.0.0.0，代理允许任意来源。
手机用 `http://<本机IPv4>:8780/web/` 访问（`ipconfig` 查 IP）。**只在可信内网使用。**

> 不要双击 index.html 用 file:// 打开：浏览器会拦截本地 JSON，页面会给出提示。

### Key 粘贴注意
百炼的 Key 有两种形态：`sk-` 加 32 位，以及 `sk-ws-` 开头、含点号与 base64 片段的长 Key（约 110 位）。
脚本只会去掉换行、空格、全角符号这类不可见字符，**保留 `. _ - + / =` 等合法字符**。

- 报 `401 Incorrect API key`：Key 无效、复制不全，或站点/权限不匹配
- 报 `404`：接口地址不对（业务空间专属域名要设 `MINGLU_BASE_URL`）
- 不确定时先跑体检：`python tools\check_key.py`（不打印 Key，只给结论）

---

## 二、AI 的接入方式（部署方视角）

| 方式 | Key 在哪 | 用户端 | 适用 |
|---|---|---|---|
| **本地代理（默认）** | 代理进程环境变量 | 零配置 | 演示、录屏、正式部署推荐 |
| 浏览器直连 | `web/config.js` 里的 `key` | 零配置 | 内部快速试；Key 会随源码发出，不宜公开 |
| 关闭 | 无 | 零配置 | 只用本地规则 |

### 配置在哪改
只有一个地方：**`web/config.js`**

```js
window.MINGLU_CONFIG = {
  ai: {
    mode: "proxy",                 // proxy | direct | off
    proxyUrl: "http://127.0.0.1:8790",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    key: ""                        // 仅 direct 模式填
  },
  showAdminEntry: false            // 是否显示「管理配置」入口，用户端保持 false
};
```

改完刷新页面即生效，用户端没有任何设置界面。

### 只用命令行起代理
PowerShell：

```powershell
cd D:\千问办公提交版\minglu
$env:DASHSCOPE_API_KEY = "你的百炼Key"
python tools\minglu_proxy.py
```

健康检查：<http://127.0.0.1:8790/health>（返回 `configured: true` 表示可以真实调用）

### 部署调试页（可选）
`web/settings.html` 是给部署人员自测用的：填 Key 试连通、检测代理、生成 `config.js` 片段。
页面上的修改只对当前浏览器生效，**不改线上**。用户端没有入口（除非在 `config.js` 把 `showAdminEntry` 设为 `true`）。

---

## 三、两条业务路径

### 路径 A：机构 → 个人（机构发布）
1. 机构侧：导入表单 → **要点提取**（先说清这张表要申请人交什么）→ 诊断（13 类问题）→ 一键修复 → 复检（0 处未通过）
2. 第 4 步「发布到个人端」→ 写入同源本地存储
3. 用户打开个人端：来源显示「机构发布」，直接开始填写

### 路径 B：个人自己导入
个人端「导入我自己的表格」三种方式：
- 上传 .html 文件 → 本地解析（不联网、不需要 AI）
- 粘贴网页源码 → 本地解析
- 粘贴表格文字 → AI 解析成字段结构（需要 AI 已接通）

---

## 三之二、要点提取（两端共用）

`shared/extract.js`，纯本地规则，不联网、不调用模型，结果稳定可复现。

给出一句话答案：**这张表要你交什么**

- 一共几项、几项必填、大约几分钟
- 最要紧的 2–3 项（按「错不起」的程度排：证件号 → 残疾证 → 姓名 → 联系方式 → 地址 → 收款账户）
- 开始前要准备的材料（身份证 / 残疾人证 / 户口本 / 银行卡 / 证件照 / 诊断证明 / 收入证明）
- 「听一遍这段摘要」按钮，把上面这些读成一段自然口语

**机构和个人的说法完全一致**，因为用的是同一套判断。对任意导入的 HTML 都能提取；机构端第二步同时会说明下方问题清单的来源是示例表还是自导入表，不混淆。

> 提取是「这张表要交什么」，诊断是「哪里不严谨」。两件事，不要混为一谈。

---

## 四、文件结构

```
web/
├─ index.html            首页（模式选择，用户零配置）
├─ config.js             ★ 部署配置（唯一需要改的文件）
├─ settings.html         部署调试页（自测 Key / 代理 / 生成配置片段）
├─ org/index.html        机构侧 4 步工作台（含发布到个人端）
├─ user/index.html       个人侧 5 步陪填台（含自导入表格、AI 讲解）
├─ assets/minglu.css     设计系统（米白绿调）
├─ shared/schema.js      数据加载 / 校验引擎 / 朗读 / 字号
├─ shared/ai.js          百炼接入（配置优先级 + 代理/直连 + 降级）
├─ shared/import.js      表格导入（HTML 解析 + AI 结果归一化 + 发布存储）
├─ shared/extract.js     要点提取（几项必填 / 最要紧的项 / 要备的材料 / 口播稿）
├─ data/                 示例数据（issues.json / form.schema.json / original.html / fixed.html）
├─ smoke.cjs             全流程自动化测试（Playwright，28 项）
├─ start-web.bat         一键启动（无 AI）
├─ start-web-ai.bat      一键启动（带 AI，提示粘贴 Key）
├─ start-web-lan.bat     一键启动（局域网/手机演示，绑定 0.0.0.0）
└─ README.md             本文件
```

示例数据文件（已内置在 `web/data/`，自包含，可直接整目录部署）：

- `data/issues.json`：机构侧诊断报告（真实扫描结果，13 类 / 16 处）
- `data/form.schema.json`：修复版表单字段结构（示例表单）
- `data/original.html` / `data/fixed.html`：修复前后对照

---

## 五、自测

```bash
cd D:\千问办公提交版\minglu\web
node smoke.cjs
```

需先启动 8780 静态服务。覆盖：首页、部署配置页、机构 4 步、发布流转、个人 5 步、自导入表格、AI 未接通时的降级。

---

## 六、如实边界（写进讲稿也别忘）

- 真人读屏 A/B 对照尚未真实跑完，不报告对照数字
- AI 讲解依赖百炼；未接通时页面明确降级为本地规则，不假装有 AI
- 校验只判格式与逻辑，不断言证件真假
- 系统不代填、不代提交，最终提交由用户本人完成
- `direct` 模式把 Key 放在前端配置文件里，任何人拿到网页就能看到；对外部署请用 `proxy`
