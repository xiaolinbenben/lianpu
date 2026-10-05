# 链铺

把亚马逊商品链接粘贴进来，采集完成后导出可以拿去 TikTok 上架的表格。

## 技术栈

- 公共前端：React + Vite + TypeScript + Tailwind CSS
- 管理端：React + Vite + Ant Design + `@ant-design/pro-components`
- 后端：Go + Gin + GORM
- 采集：Rainforest Product API，每次提交的链接请求一次
- 部署：单个 Go 应用镜像，由 1Panel 负责域名、HTTPS 证书和反向代理
- CI/CD：GitHub Actions 构建并推送 GHCR 镜像，再以默认用户 root 登录服务器，更新 `/opt/<仓库名>/deploy`

开发时前后端分开运行，部署时用 `go:embed` 合成一个二进制和一个应用镜像。数据库使用 PostgreSQL，和 Go 应用写在同一个 `deploy/docker-compose.yml` 里。缓存和对象存储不预设。

## 项目结构

```text
web/                         # 公共前端，访问 /
admin/                       # 管理端，访问 /admin/
server/cmd/server/           # Go 程序入口，并启动采集 worker
server/internal/httpapi/     # Gin 路由
server/internal/store/       # 查询
server/internal/model/       # GORM 模型
server/internal/database/    # 连接、迁移和初始数据
server/internal/collect/     # 进程内采集 worker
server/internal/rainforest/  # Rainforest 客户端
server/internal/export/      # xlsx 导出
server/internal/settings/    # 管理端配置的读取和校验
server/internal/mail/        # 验证信和重置信
server/web/dist/             # 两套前端的构建产物
deploy/                      # Compose 和基础设施环境变量模板
TODO.md                      # 还没做的事，包括支付
```

## 本地开发

安装依赖（需要 pnpm 11.9.0）：

```bash
corepack enable
make install
```

先启动 PostgreSQL，再启动 Go 服务：

```bash
cp deploy/.env.example deploy/.env
# 把 POSTGRES_PASSWORD 和 ENCRYPTION_KEY 换成字母、数字和连字符
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d postgres
make server-dev
```

`make server-dev` 把 `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB` 和 `ENCRYPTION_KEY` 传给 Go 进程。连接主机名在本机改成 `127.0.0.1`。

在另外两个终端启动前端：

```bash
make web-dev
make admin-dev
```

开发地址：

- 公共前端：`http://localhost:3000/`
- 管理端：`http://localhost:5173/admin/`
- Go 服务：`http://localhost:8000/`
- 健康检查：`http://localhost:8000/healthz`

两个 Vite 开发服务器都会将 `/api` 和 `/healthz` 通过同源代理转发到 `http://127.0.0.1:8000`。本地开发不需要给 Gin 添加 CORS 白名单。

## 第一次使用

1. 打开管理端。第一次会要求填写管理员邮箱和密码，密码要填两次。保存后即登录。之后不能再初始化，也没有修改密码的接口。
2. 在「系统配置」里填写 Rainforest API Key、站点地址和 SMTP。这些配置存在数据库里，不写进环境变量。密钥用 `ENCRYPTION_KEY` 加密后保存。
3. 用户在公共站注册。邮箱验证通过后赠送额度，默认 10。未验证的账号可以登录，但不能采集。
4. 在工作台粘贴亚马逊商品页链接。每条链接消耗额度，默认 1。采集失败会退回这一次消耗。
5. 勾选采集成功的记录，选择类目模板，下载 xlsx。表头以导出当时的类目列为准，所以改模板会影响以前采集成功的商品。

初始类目是「通用」。官方 TikTok 类目工作簿还没接，见 `TODO.md`。

## API

只使用 `GET` 和 `POST`。除下载以外，响应都是：

```json
{
  "success": true,
  "message": "",
  "data": {}
}
```

用户：

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
POST /api/auth/verify
POST /api/auth/resend-verification
POST /api/auth/forgot-password
POST /api/auth/reset-password
GET  /api/credits
POST /api/feedback
```

采集和导出：

```text
POST /api/collections
GET  /api/collections
GET  /api/categories
POST /api/exports
GET  /api/exports/download?id=
```

`GET /api/exports/download` 返回 xlsx 文件，不套 JSON 信封。

管理端：

```text
GET  /api/admin/setup
POST /api/admin/setup
POST /api/admin/login
GET  /api/admin/session
POST /api/admin/logout
GET  /api/admin/overview
GET  /api/admin/settings
POST /api/admin/settings
POST /api/admin/settings/test-rainforest
POST /api/admin/settings/test-smtp
GET  /api/admin/users
POST /api/admin/users/credits
POST /api/admin/users/verify
GET  /api/admin/collections
GET  /api/admin/categories
POST /api/admin/categories/save
GET  /api/admin/feedback
```

采集只接受 Rainforest 文档里的亚马逊商品页。短链 `amzn.to` 先拒绝。请求只带完整商品 URL，不另传 ASIN。

## 环境变量

唯一的环境变量模板是 `deploy/.env.example`。复制为 `deploy/.env` 后填写：

```dotenv
POSTGRES_USER=app
POSTGRES_PASSWORD=replace-with-a-long-random-password
POSTGRES_DB=app
ENCRYPTION_KEY=replace-with-a-long-random-key
# APP_HOST_PORT=3000
# POSTGRES_HOST_PORT=5432
```

用户名和数据库名固定为 `app`。这三个值和 `ENCRYPTION_KEY` 只使用字母、数字和连字符。应用用它们连接主机名 `postgres`、容器端口 `5432`、`sslmode=disable`。数据库时区由 Compose 固定为 `Asia/Shanghai`。本地 Go 监听 `8000`，镜像监听容器端口 `3000`。`APP_HOST_PORT` 和 `POSTGRES_HOST_PORT` 只改变宿主机回环端口。

Rainforest API Key、SMTP、站点地址、注册赠送额度、每条链接消耗、单次提交上限、采集并发和类目列都在管理端配置，不新增环境变量。

## Docker Compose

```bash
cp deploy/.env.example deploy/.env
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d
```

本地构建镜像：

```bash
docker build -t ghcr.io/xiaolinbenben/lianpu:latest .
```

端口只绑定 `127.0.0.1`。应用默认 `3000`，PostgreSQL 默认 `5432`。应用容器始终连接 `postgres:5432`。

## 1Panel 部署

服务器目录是 `/opt/lianpu/deploy/`。运维只提前放置 `.env`。CI 每次部署写入 `docker-compose.yml`，不覆盖 `.env`。

1. 在服务器安装 Docker 和 1Panel。
2. 创建 `/opt/lianpu/deploy/`，把填好的 `.env` 放进去。
3. 在 GitHub Environment `production` 配好 `SERVER_HOST`、`SERVER_PASSWORD`、`GHCR_PAT` 后推送 `main`。
4. 在 1Panel 创建网站、配置 HTTPS，反向代理到 `127.0.0.1:3000`。改过 `APP_HOST_PORT` 时用改后的端口。
5. 打开 `/admin/`，初始化管理员，再填写 Rainforest 和邮件。

登录用户默认为 `root`。要换成其他用户时，在同一个 Environment 设置 Variable `SERVER_USER`。

## 构建检查

```bash
make test
make build
docker build -t ghcr.io/xiaolinbenben/lianpu:latest .
```

GitHub Actions 在 Pull Request 和推送时构建两套前端、Go 服务和 Docker 镜像，不运行测试。
