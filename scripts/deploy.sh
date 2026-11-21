#!/usr/bin/env bash
# 评评理 · 一键部署（在 Linux 服务器上运行，Ubuntu / Debian / CentOS / Alibaba Cloud Linux 都行）
# 用法： curl -fsSL https://raw.githubusercontent.com/lmz-zzz/pingpingli/main/scripts/deploy.sh | bash -s -- <端口>
# 例如： ... | bash -s -- 8080
# 脚本会问你要大模型的 API Key（输入时屏幕不显示，是正常的，粘贴后回车即可）。

set -e
PORT="${1:-3000}"
APP_DIR="$HOME/pingpingli"
REPO="https://github.com/lmz-zzz/pingpingli.git"

echo "== 1/5 检查 Node.js =="
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 18 ]; then
  echo "没有 Node.js 18+，开始安装…"
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs git
  else
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs git
  fi
fi
node -v

echo "== 2/5 下载代码 =="
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR"
fi

echo "== 3/5 配置大模型 =="
if [ -f "$APP_DIR/.env" ] && grep -q LLM_API_KEY "$APP_DIR/.env"; then
  echo "已有 .env，跳过（要换 Key 就删掉 $APP_DIR/.env 再运行本脚本）"
else
  read -r -s -p "请粘贴 API Key（不显示，粘贴后回车）: " KEY < /dev/tty
  echo
  read -r -p "用哪个模型？1=GPT（海外服务器） 2=智谱 GLM（国内服务器）[1]: " CHOICE < /dev/tty
  if [ "$CHOICE" = "2" ]; then
    BASE="https://open.bigmodel.cn/api/paas/v4"; MODEL="glm-4-flash"
  else
    BASE="https://api.openai.com/v1"; MODEL="gpt-4o-mini"
  fi
  umask 077
  cat > "$APP_DIR/.env" <<EOF
LLM_API_KEY=$KEY
LLM_BASE_URL=$BASE
LLM_MODEL=$MODEL
PORT=$PORT
EOF
fi

echo "== 4/5 设置开机自启的服务 =="
sudo tee /etc/systemd/system/pingpingli.service >/dev/null <<EOF
[Unit]
Description=pingpingli
After=network.target

[Service]
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$(command -v node) server.js
Restart=always
User=$(whoami)

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable pingpingli >/dev/null 2>&1
sudo systemctl restart pingpingli
sleep 2

echo "== 5/5 自检 =="
curl -s "http://127.0.0.1:$PORT/api/health" && echo
IP=$(curl -s --max-time 5 https://ifconfig.me || echo "你的服务器IP")
echo
echo "部署完成！浏览器打开： http://$IP:$PORT"
echo "（如果打不开，是服务器的安全组没放行 $PORT 端口，请联系主办方放行）"
