# 明路 · 表单陪填助手（服务端版）部署说明

> 这个包解决一件事：**让公网访客零配置用上 AI**。
> 浏览器不能持有密钥、也够不到你电脑上的 127.0.0.1，所以必须有服务端持有密钥并转发。
> 本包 = 静态页面（机构端 + 个人端）+ 同源 AI 代理（`/api/explain`），一个进程、一个端口。

---

## 0. 你需要准备什么

| 项 | 说明 |
|---|---|
| 一台能跑**常驻 Node.js 进程**的服务器 | Node 22+；云主机（阿里云 ECS、腾讯云轻量等）、Docker 容器、支持 Node 的 PaaS 都行 |
| 百炼 API Key | `sk-` 开头，**只填进服务器环境变量**，不要写进任何代码或仓库 |
| 域名（可选） | 没有域名也能用 `http://IP:8081` 访问；有域名建议配 HTTPS |

> **不能用**：纯静态托管（GitHub Pages、对象存储静态网站、OSS/COS 静态页）。它们只能放文件、不能跑进程，AI 代理起不来。
> **不能用**：千问办公「我的网页」的动态发布——本环境实测返回 `MCP_CONNECTOR_OPERATION_UNAVAILABLE`，不支持动态运行时。

---

## 1. 方式 A：云主机直接跑（最通用）

```bash
# 1) 上传本目录到服务器，例如 /opt/minglu
cd /opt/minglu
node -v                      # 必须 >= 22

# 2) 设置密钥（只在这一步出现密钥，且不进代码）
export DASHSCOPE_API_KEY="sk-你的Key"
export PORT=8081
export HOST=0.0.0.0

# 3) 启动
node server.js
```

浏览器打开 `http://服务器IP:8081/` 即可。

**后台常驻（systemd，推荐）**

```ini
# /etc/systemd/system/minglu.service
[Unit]
Description=Minglu form assistant
After=network.target

[Service]
WorkingDirectory=/opt/minglu
Environment=DASHSCOPE_API_KEY=sk-你的Key
Environment=PORT=8081
Environment=HOST=0.0.0.0
ExecStart=/usr/bin/node server.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now minglu
sudo systemctl status minglu
```

> 用 systemd 时密钥写在 `minglu.service` 里，注意该文件权限：`chmod 600`。

**前面挂 Nginx（可选，配 HTTPS）**

```nginx
server {
  listen 80;
  server_name your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:8081;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

---

## 2. 方式 B：Docker

```bash
docker build -t minglu .
docker run -d --name minglu \
  -p 8081:8081 \
  -e DASHSCOPE_API_KEY="sk-你的Key" \
  minglu
```

访问 `http://服务器IP:8081/`。

---

## 3. 方式 C：PaaS（Render / Railway / Zeabur 等）

只要该平台**支持常驻 Node 进程**（不是纯静态）：

1. 新建 Web Service，上传/连接本目录
2. Build: `npm install`（本包无依赖，可留空）
3. Start: `node server.js`
4. 环境变量里加 `DASHSCOPE_API_KEY`
5. 平台通常会自动注入 `PORT`，本程序已读取 `process.env.PORT`

---

## 4. 部署后自检（4 条，逐条都要过）

```bash
# ① 首页
curl -I http://你的地址/
# 期望 200

# ② 两端页面
curl -o /dev/null -w "%{http_code}\n" http://你的地址/org/
curl -o /dev/null -w "%{http_code}\n" http://你的地址/user/
# 期望都是 200

# ③ 服务端是否读到密钥（不显示密钥）
curl http://你的地址/health
# 期望 {"configured":true,...}
# 若 configured:false → 环境变量没生效

# ④ 真打一次模型
curl -X POST http://你的地址/api/explain \
  -H "Content-Type: application/json" \
  -d '{"question":"这一项填谁的手机号","formTitle":"演示","field":{"label":"本人手机号","required":true,"help":"","options":[]}}'
# 期望返回 {"answer":"...","model":"qwen-plus"}
```

四条都过，公网访客就能在页面上看到「AI 已就绪」，并点「让 AI 讲清这一项」。

---

## 5. 安全红线（务必看）

1. **Key 只进环境变量**。不要写进 `server.js`、不要写进 `public/config.js`、不要提交到任何仓库。
2. **`.env` 不要对外**。本包不读 `.env` 文件，若你用 Docker Compose 的 env_file，注意文件权限。
3. **开 HTTPS**。否则页面里的按键内容与问题会明文走网线（虽然没有个人证件号，但仍不该）。
4. **本服务不收集、不落盘任何表单内容**。`/api/explain` 只转发「字段说明 + 你的问题」，不发你填的值。这条写在代码里，别改。
5. 如果 Key 曾经外泄（贴过群、进过公开仓库），去百炼控制台**吊销重建**，不要指望改名补救。

---

## 6. 已知边界（对外表述请照此，不美化）

- **AI 只做解释，不做判对错**。判对错由 `tools/a11y_scan.py` 的确定性规则完成，前端不参与判定。
- **机构端「发布到个人端」只写浏览器 localStorage**：同一浏览器内立刻生效；换设备、换浏览器即失效。跨设备同步需要账号与数据库，本包没有。
- **13 类 / 16 处**只适用于示例表 `original.html`，不是对任意表单的承诺。
- 真实读屏软件、真实视障用户、真机测试：均未做，材料里应写「未验证」。

---

## 7. 目录结构

```
minglu-dyn-v2/
├─ server.js            同源 AI 代理 + 静态托管（Node 内置模块，零依赖）
├─ package.json         node >= 22
├─ Dockerfile
├─ .env.example         只作示例，程序不自动读取
└─ public/              网站本体（首页 / org/ / user/ / shared / data / assets）
```
