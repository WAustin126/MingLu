/* ============================================================
   明路 · 部署配置（部署方填写，用户端无需任何设置）
   ------------------------------------------------------------
   怎么用：部署时改这个文件，改完用户打开网页即可直接使用 AI。
   优先级：本文件 > 浏览器本地设置 > 内置默认值。

   推荐：mode 用 "proxy"，Key 只放在代理进程里（用户和页面都碰不到）。
   备选：mode 用 "direct" 并填 key，网页自己调百炼（方便，但 Key 会随
        网页源码一起发出去，只适合内部演示，不适合公开部署）。
   ============================================================ */
window.MINGLU_CONFIG = {
  ai: {
    mode: "proxy",                                          // proxy | direct | off
    proxyUrl: "/minglu",                      // 代理地址（mode=proxy 时用）
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    key: ""                                                 // 仅 mode=direct 时填；proxy 模式留空
  },
  // 是否在页面上显示「部署与 AI 配置」入口。用户端一律 false，只有部署人员本机调试时才改 true。
  showAdminEntry: false
};
