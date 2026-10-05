#!/usr/bin/env bash
# 本机构建镜像，用默认私钥连到服务器，加载镜像，同步 compose，再启动。
# 不覆盖服务器上的 /opt/lianpu/deploy/.env。
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
host="103.236.57.34"
user="root"
dest="/opt/lianpu/deploy"
key="${HOME}/.ssh/id_ed25519"
image="lianpu:latest"

if [[ ! -f "$key" ]]; then
  echo "缺少默认私钥 ${key}" >&2
  exit 1
fi

ssh_opts=(
  -i "$key"
  -o IdentitiesOnly=yes
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=20
)
target="${user}@${host}"

echo "连接 ${target}"
if ! ssh "${ssh_opts[@]}" "$target" "mkdir -p '${dest}'"; then
  echo "无法登录 ${target}。请把 ${key}.pub 放进该用户的 authorized_keys" >&2
  exit 1
fi
if ! ssh "${ssh_opts[@]}" "$target" "test -f '${dest}/.env'"; then
  echo "服务器缺少 ${dest}/.env，请先放好环境文件" >&2
  exit 1
fi
if ! ssh "${ssh_opts[@]}" "$target" "command -v docker >/dev/null && docker compose version >/dev/null"; then
  echo "服务器需要已安装 Docker，以及 docker compose 插件" >&2
  exit 1
fi

remote_arch="$(ssh "${ssh_opts[@]}" "$target" "uname -m")"
case "$remote_arch" in
  x86_64) platform="linux/amd64" ;;
  aarch64 | arm64) platform="linux/arm64" ;;
  *)
    echo "服务器架构无法构建: ${remote_arch}" >&2
    exit 1
    ;;
esac

echo "构建镜像 ${image} (${platform})"
docker build --platform "$platform" -t "$image" "$root"

echo "传输镜像"
docker save "$image" | gzip | ssh "${ssh_opts[@]}" "$target" "bash -c 'set -o pipefail; gunzip | docker load'"

echo "传输 compose 文件"
scp "${ssh_opts[@]}" \
  "${root}/deploy/docker-compose.yml" \
  "${root}/deploy/.env.example" \
  "${target}:${dest}/"

echo "启动服务"
ssh "${ssh_opts[@]}" "$target" "cd '${dest}' && docker compose --env-file .env -f docker-compose.yml up -d --remove-orphans --pull never --force-recreate app && docker compose --env-file .env -f docker-compose.yml ps"
