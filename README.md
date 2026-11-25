# 明路 · 无障碍表单陪填助手

益题有解公益 AI 挑战赛（千问办公 AI 生产力大赛 · 公益赛道）复赛作品。

- 机构侧：导入表单 → AI 诊断无障碍问题（13 类）→ 一键修复 → 复扫验证
- 个人侧：陪填修复后的表单，逐项白话讲解，支持粘贴文字 / 上传表单照片由 AI 解析成字段结构

## 线上演示

http://47.93.151.236/minglu/（机构端 /org/、个人端 /user/）

## 运行

需要 Node.js 与百炼 API Key（通过环境变量 DASHSCOPE_API_KEY 注入，代码中不含任何真实凭据）：

```bash
DASHSCOPE_API_KEY=<your-key> PORT=8081 node server.js
```

可选环境变量：MINGLU_TEXT_MODEL（默认 qwen-plus）、MINGLU_VL_MODEL（默认 qwen3-vl-plus，图片解析）、MINGLU_BASE_URL。

部署细节见 DEPLOY.md 与 DEPLOY-ECS.md。本仓库为 2026-11-25 服务器现行版本的源码快照。
