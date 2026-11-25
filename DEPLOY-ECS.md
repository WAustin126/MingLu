# 阿里云 ECS 部署（最短路径）

> 目标：把「明路」连同 AI 代理部署到你的 ECS 上，得到一个**别人打开就能用、AI 也真能用**的网址。
> 全程只需要 4 步：传文件 → 装 Node → 设 Key 启动 → 开安全组。

---

## 第 1 步：上传这个目录到 ECS

把整个 `minglu-dyn-v2` 目录传到服务器，例如 `/opt/minglu`。

方式任选：

- **宝塔面板**：文件 → 进入 `/opt` → 上传压缩包 → 解压 → 把目录改名为 `minglu`
- **scp**（在你电脑上执行）：
  ```bash
  scp -r minglu-dyn-v2 root@你的ECS公网IP:/opt/minglu
  ```
- **Workbench / VNC**：用阿里云控制台的远程连接，在服务器上下载你上传到 OSS 的包

---

## 第 2 步：确认 Node 版本（要 22+）

```bash
node -v
```

- 显示 `v22.x` 或更高 → 跳到第 3 步
- 提示 `command not found` 或版本低于 22 → 装一个：

**Alibaba Cloud Linux / CentOS / Rocky**
```bash
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs        # CentOS 7 用 yum
```

**Ubuntu / Debian**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

装完再 `node -v` 确认一次。

---

## 第 3 步：设 Key 并启动

```bash
cd /opt/minglu
export DASHSCOPE_API_KEY="sk-你的百炼Key"
export PORT=8081
export HOST=0.0.0.0
node server.js
```

看到 `明路动态版启动：http://0.0.0.0:8081` 就成功了。

**先别关窗口**，另开一个终端验证：

```bash
curl http://127.0.0.1:8081/health
# 期望 {"configured":true,...}
```

### 让它在后台常驻（推荐）

```bash
sudo tee /etc/systemd/system/minglu.service >/dev/null <<'EOF'
[Unit]
Description=Minglu form assistant
After=network.target

[Service]
WorkingDirectory=/opt/minglu
Environment=DASHSCOPE_API_KEY=sk-你的百炼Key
Environment=PORT=8081
Environment=HOST=0.0.0.0
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo chmod 600 /etc/systemd/system/minglu.service
sudo systemctl daemon-reload
sudo systemctl enable --now minglu
sudo systemctl status minglu
```

> 注意：`/usr/bin/node` 这个路径要与 `which node` 的输出一致，装在不同位置时要改。

查看日志：
```bash
sudo journalctl -u minglu -f
```

---

## 第 4 步：开安全组（最容易漏的一步）

阿里云控制台 → **云服务器 ECS → 安全组 → 配置规则 → 入方向 → 添加规则**：

| 项 | 填什么 |
|---|---|
| 协议类型 | 自定义 TCP |
| 端口范围 | `8081/8081`（若用 80 就填 `80/80`） |
| 授权对象 | `0.0.0.0/0`（或只填你与评委的 IP 段，更安全） |

**只开了系统防火墙、没开安全组 = 外网还是打不开**，这是最常见的原因。

如果服务器上还开了 firewalld/ufw，也要放行：
```bash
# firewalld
sudo firewall-cmd --add-port=8081/tcp --permanent && sudo firewall-cmd --reload
# ufw
sudo ufw allow 8081/tcp
```

---

## 第 5 步：验证（4 条都要过）

在**你自己的电脑**上执行：

```bash
curl -I http://你的ECS公网IP:8081/
curl -o /dev/null -w "%{http_code}\n" http://你的ECS公网IP:8081/org/
curl -o /dev/null -w "%{http_code}\n" http://你的ECS公网IP:8081/user/
curl http://你的ECS公网IP:8081/health
```

期望：200 / 200 / 200 / `{"configured":true,...}`

最后在浏览器打开 `http://你的ECS公网IP:8081/`，进个人端陪填页，页眉应显示 **「AI 已就绪」**，并出现「让 AI 讲清这一项」按钮。

---

## 可选：配域名 + HTTPS（更正式）

1. 域名解析：加一条 A 记录指向 ECS 公网 IP
2. 装 Nginx 并反代到 8081：

```nginx
server {
  listen 80;
  server_name your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:8081;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

3. 申请免费证书（阿里云 SSL 或 certbot），把 80 改成 443 并加证书配置

> 上了 HTTPS 后，页面里的「AI 提问」内容与字段说明都走加密通道。虽然不涉及个人证件号，仍建议这么做。

---

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 浏览器打不开，但服务器上 `curl 127.0.0.1:8081` 正常 | 安全组没放行 | 回第 4 步 |
| 页面能开，页眉显示「AI 未接通」 | 环境变量没生效 | `curl /health` 看 `configured`；systemd 改完要 `daemon-reload` 并 `restart` |
| `configured:true` 但点 AI 报错 | Key 无效/欠费/限流 | 看 `journalctl -u minglu -f`，或本地跑 `tools/check_key.py` |
| 8081 被占用 | 别的程序在用 | 换 `PORT=8090`，并同步改安全组 |
| 想换模型 | 默认 qwen-plus | 加环境变量 `MINGLU_TEXT_MODEL=qwen-max` |

---

## 安全提醒

- Key 只写在 systemd 的 `Environment=` 或启动命令里，**不要写进 `server.js` / `public/config.js`**，也不要提交到 Git。
- 如果 Key 曾外泄，去百炼控制台吊销重建。
- 本服务不收集、不落盘任何表单内容；`/api/explain` 只转发「字段说明 + 你的问题」。
