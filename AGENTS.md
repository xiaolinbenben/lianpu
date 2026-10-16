# 项目开发规范

## 架构边界

- `web/` 是公共前端，构建后访问 `/`。
- `admin/` 是管理端，构建后访问 `/admin/`。
- `server/cmd/server/` 是 Go 入口。
- Gin 路由放在 `server/internal/httpapi/`。
- 中间件放在 `server/internal/middleware/`。
- 统一响应放在 `server/internal/response/`。
- GORM 连接和迁移放在 `server/internal/database/`。
- GORM 模型放在 `server/internal/model/`。
- 查询放在 `server/internal/store/`。
- 前端包管理统一使用 pnpm 11.9.0，不使用 npm、yarn 或其他包管理器。

## API 规范

- 业务 API 使用 `/api/*` 或 `/api/admin/*`。
- 只允许 `GET` 和 `POST`。
- 不得未经明确设计加入 `PATCH`、`PUT`、`DELETE`。
- 所有 API 返回 `success`、`message`、`data` 三个字段。
- Handler 不直接拼接 JSON，统一使用 response 包。
- 采集接口按模型、store、路由这三层添加，不在 Handler 里写查询。
- 管理端账号在首次打开时初始化，填写邮箱和密码。没有修改密码的接口。
- `GET /api/exports/download` 是文件下载例外，返回 xlsx 字节，不套 JSON 信封。其它接口仍返回 `success`、`message`、`data`。

## 数据访问

- 持久化只使用 GORM，数据库固定为 PostgreSQL。驱动固定为 `gorm.io/driver/postgres`。不引入 SQLite 或其他 ORM。
- 应用从 `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB` 拼出 `postgres://<user>:<password>@postgres:5432/<db>?sslmode=disable`。这三个值只允许字母、数字和连字符。容器内主机名固定为 Compose 服务名 `postgres`，端口固定为 `5432`，`sslmode=disable`。数据库时区只在 Compose 里用 `timezone=Asia/Shanghai` 固定，不写入连接串或 `.env`。本机 `make server-dev` 和 `make test` 只把主机名改成 `127.0.0.1`。应用不读取 `POSTGRES_HOST_PORT`。连接池为最多 10 个连接。
- `postgres:5432` 只在本 Compose 项目的网络里解析。其他应用即使也使用同名服务和容器端口 `5432`，也在各自的网络里，不与本项目冲突。
- 构建继续使用 `CGO_ENABLED=0`。
- 模型使用 GORM 默认表名。主键用自增 `uint`。包含 `CreatedAt` 和 `UpdatedAt`。只有业务需要软删除时才加 `gorm.DeletedAt`。
- 新增模型后，只在 `database.Migrate` 里注册并执行 `AutoMigrate`。不在请求路径里迁移。
- `AutoMigrate` 只建表和加列。删列、改列类型、改约束要单独写迁移。
- 查询使用 `WithContext`。列表在 store 里写明排序和上限，上限不交给客户端随意放大。
- 请求体使用独立结构体，再显式赋给模型。不要把 JSON 直接绑定到 GORM 模型。
- 字符串长度按字符数在 Handler 校验，并与模型 `size` 保持一致。
- 不要把 `0` 值主键传给 `First`。GORM 会忽略零值条件。
- 未找到记录用 `errors.Is(err, gorm.ErrRecordNotFound)` 转成统一响应。数据库错误只写日志，不返回给客户端。
- 日志里不打印数据库连接串和密码。
- 同一次请求里的多条写入放在 `Transaction` 里。更新用 `Updates` 并指定字段，不用 `Save` 回写整行。
- 需要把用户输入放进 SQL 时使用占位参数，不拼接 SQL。

## 配置与部署

- 开发时前后端分开运行。部署时前端构建产物由 `go:embed` 打进同一个 Go 二进制，再封装成一个应用镜像。
- 唯一环境变量模板是 `deploy/.env.example`。
- `deploy/.env` 只用于本地或生产环境，禁止提交。
- `.env.example` 必须填写 `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB` 和 `ENCRYPTION_KEY`。用户名和数据库名固定为 `app`。密码只使用字母、数字和连字符。不提供 `DATABASE_URL`。
- `APP_HOST_PORT` 和 `POSTGRES_HOST_PORT` 在 `.env.example` 里默认注释。它们只改变宿主机回环地址上的端口映射，不改变容器内部端口。未设置时 Compose 使用应用 `3000`、PostgreSQL `5432`。服务器上端口被占用时，去掉对应行的注释并改成空闲端口。本机开发保持 `POSTGRES_HOST_PORT` 为注释，因为 `make server-dev` 连接的是 `127.0.0.1:5432`。
- PostgreSQL 和应用容器都通过 `env_file` 读取 `deploy/.env`。不要在 Compose 的 `environment` 里插值数据库账号。
- 本地 `make server-dev` 和 `make test` 读取 `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB`。这三个变量已经在环境里时直接使用，否则读 `deploy/.env`。传给 Go 进程时主机名用 `127.0.0.1`，端口仍是 `5432`。`make server-dev` 另外只传入 `ENCRYPTION_KEY`。
- 本地 Go 服务固定监听 `8000`，打包镜像固定监听容器端口 `3000`。这两个监听端口不通过环境变量覆盖。
- Vite 本地开发必须通过 `server.proxy` 将 `/api` 和 `/healthz` 转发到 `http://127.0.0.1:8000`；不要用 CORS 配置替代开发代理。
- HTTPS 证书由 1Panel 管理，不放入仓库或应用镜像。
- 只使用 `deploy/docker-compose.yml`。它同时编排应用和 PostgreSQL。宿主机端口只绑定 `127.0.0.1`。应用容器通过本项目网络连接服务名 `postgres` 的容器端口 `5432`。
- 服务器目录是 `/opt/lianpu/deploy/`。服务器上只提前放置 `.env`。`make deploy` 用本机默认私钥 `~/.ssh/id_ed25519` 以 root 连接 `103.236.57.34`。脚本在这台 Mac 上构建 `linux/amd64` 镜像并传入服务器，再写入 `docker-compose.yml`，不覆盖 `.env`，然后启动服务。服务器上没有 `postgres:18-alpine` 时，本机拉取 `linux/amd64` 后传过去。
- 不使用 GitHub Actions，也不推送镜像仓库。应用镜像标签是 `lianpu:latest`。
- 应用镜像里不包含数据库。缓存和对象存储不预设。
- 1Panel 只负责域名、HTTPS 和反向代理。反向代理目标是 `127.0.0.1` 加上应用的宿主机端口，默认 `3000`。

## 插件

- 插件在 `extension/`，名称是链铺上架，Manifest V3。没有构建步骤，不用 pnpm、npm 或打包器。文件是 `manifest.json`、`background.js`、`content.js`、`page.js`、`popup.html`、`popup.js`、`popup.css`。
- 用户已叫停链铺桥接。不要改 `tools/`，不要跑 `node tools/server.js`，也不要用 `POST /cmd` 看页面或代操作。桥接不放进链铺上架。
- 只在站斧里的 TikTok Shop 卖家窗口加载和重新加载。另一个 Chrome 配置不会同步。卖家中心主机以 `manifest.json` 的 `host_permissions` 为准，美国站首页是 `https://seller.us.tiktokshopglobalselling.com`。
- 插件不读取、不上传店铺 Cookie，也不把店铺登录态交给链铺。链铺服务端不调用 TikTok，不组装卖家签名请求。页面脚本的最后一步是「另存为草稿」，然后回到草稿列表。不点「提交审核」，不点「返回」。
- 登录只在站斧窗口里点插件图标完成。弹窗把链铺地址、邮箱和密码发给 `POST /api/auth/login`，Cookie 留在这个浏览器。网站登录不能代替插件登录。链铺地址的主机必须和上传表格的主机一致，`localhost` 和 `127.0.0.1` 是不同主机。弹窗和卖家页面板都有「退出登录」。退出调用 `POST /api/auth/logout`，并清掉保存的链铺地址和邮箱。不要改会话 Cookie 的 SameSite。
- 上架表格在公共前端 `/app` 的「上架表格」卡片上传，接口是 `POST /api/source-products/import`。插件不解析 xlsx。变体用已登录账号的 `POST /api/source-products/variant-plan`，由 `background.js` 带 `credentials: "include"` 拉取，并下载变体图片。不要调用 `POST /api/listings/fill`。
- `content.js` 跑在隔离世界，只注入一次，守卫是 `window.__lianpuFillPanel`。它画右侧面板，用 `chrome.runtime.sendMessage` 找后台，用 `window.postMessage` 找页面脚本，消息 `source` 固定为 `lianpu-fill`。
- `page.js` 由后台按 `inject` 消息注入到卖家帧的 MAIN 世界，不缓存已注入帧。守卫是 `window.__lianpuFill`，值等于文件顶部的 `pageVersion`。改 `page.js` 必须把 `pageVersion` 加一。已打开的页面仍留着旧监听，直到卖家页刷新。
- 页面脚本里的步骤用 `Promise.resolve(run())` 跑完再 `reply`。不要把函数放进 `postMessage`。输入框用原生 value setter 加 `input` 和 `change`。文件用 `DataTransfer` 赋给 `input.files`。
- 改 `manifest.json`、`content.js`、`page.js` 或 `background.js` 后，把 manifest 的 `version` 加一。使用者在站斧里重新加载链铺上架，再刷新卖家页或草稿列表。不要为了调试重启站斧。
- 面板标题可拖动，松手后吸附右上角或右下角，位置记在 `sessionStorage` 的 `lianpu-panel-corner`。运行一开始就显示控制台：当前步骤、这一步是成功还是失败、下一步、下下步。下面的记录逐行追加。
- 「开始 5 轮」从草稿列表 `https://seller.us.tiktokshopglobalselling.com/product/manage?shop_region=US&tab=draft` 起。每轮在当前标签打开添加商品，填完后另存为草稿，再回到草稿列表。点「添加商品」时拦住新标签，仍在当前标签打开 `/product/create`。进度在 `sessionStorage` 键 `lianpu-fill-loop`，并复制到 `chrome.storage.session`。用 `tabToken` 避免两个标签同时填同一轮。
- 只有步骤超时（页面没有响应）才整页刷新、滚到顶部、从第 1 步重填，同一轮最多 2 次。步骤返回失败时先在当前页再试一次，不要刷新，避免把已经选好的类目清掉。仍失败就把这一轮跳过，记下轮次、停住的步骤、原因和页面链接，回到草稿列表继续下一轮。五轮结束后在控制台打印留给人工的清单。面板有「复制日志」。未登录不刷新、不跳过。写到一半的添加商品页不要接着填，回到草稿列表再开始。
- 商品数据以导入的表格为准，不在插件里写死商品内容。表格列至少包括产品 id、产品标题、分类 id、店铺名、重量(kg)、长、宽、高、变种属性和属性值、价格(站点币种)、本地展示价、库存、变种主题1图片。零售价优先用本地展示价，站点价格为 0 时不用。
- 插件已经从表格写入的只有变体：属性名和选项、每个颜色的变种主题1图片、每个 SKU 自己的库存和零售价。`POST /api/source-products/variant-plan` 目前只返回这些。产品标题、分类 id、店铺名、重量和长宽高已经入库，但这个接口没有交给插件，页面上也还没有使用。
- 页面上仍是硬编码、必须改成读表格或明确缺列的有：主图是生成的 600×600 蓝色 `lianpu-test.png`；商品名称是 `Lianpu title test Unisex Kids Soccer Jersey`；类目路径是「女装和内衣 → 女士上装 → 女士卫衣 → 女士连帽衫」，没有用表格里的分类 id；品牌固定选无品牌；商品详情是 `Lianpu 测试商品详情：Unisex Kids Soccer Jersey。`；尺码表是生成的 `lianpu-size-chart.png`；合规两题都选否；物流是 300 克和 3×15×20 厘米，没有用表格里的 0.8kg 和 20×15×5。销售方式固定点一口价。五轮重复的是该账号最新一条商品，不是表格里的每一条。
- 商家 SKU、GTIN、标价、折扣不填。没有变体计划时停止，不用库存 999 和零售价 99 顶上。表格里没有的列不要编造。
- 变体名称用英文：颜色写 `Color`，尺码或尺寸写 `Size`。先点下拉里的「新增」，再点新输入框，输入名称，再点右侧「添加」。页面会把 `Color` 显示成「颜色」、把 `Size` 显示成「尺码」，这算名称已经写上，接着把选项打进「输入选项」。不要直接点下拉里的「颜色」「尺码」或 Number of items。「添加变体」点文字右边的开关。选项打进占位符「输入选项」的输入框，下一项用「+ 添加选项」。第二个变体用「+ 添加变体」。确认用的「添加」不要算进「添加选项」「添加变体」「添加商品」里面的文字。
- 变体图片在颜色名左侧的虚线框。先悬停这个方框，等上方出现「本地文件」「媒体中心」「选择主图」，再只点「本地文件」。一个颜色的图片传上后，按尺码一行一行写：先写库存，按这一行尺码文字的位置确认数字还在，再写零售价，确认还在，再写下一行。写的时候不要聚焦输入框，避免这一行被滚走。范围是这一颜色名到下一个颜色名之间，图片方框下面的 L、XL、XXL 也要写。写完再把下一个颜色滚到视口中间。不要先把全部图片传完，也不要把变体列表拉回顶部再填价格。方框里的上传箭头不算已上传，照片要铺满这个方框。库存和零售价按表格里每个 SKU 的库存、本地展示价写进「变体列表」对应行，不使用上面的数量、零售价和「应用」。不同 SKU 价格可以不同。价格不能写进尺码表模板搜索或其他销售信息以外的输入框。尺码表已有预览就不再上传。已选「上传图片」就不要再点。不点「创建尺码表」和「转换」。

## 质量检查

提交前至少运行：

```bash
make test
make build
docker build -t lianpu:local .
```

前端依赖变更必须提交对应的 `pnpm-lock.yaml`。不要提交 `node_modules`、`package-lock.json`、构建产物、本地 `.env` 或运行数据。改 `extension/` 时对改过的脚本运行 `node --check`。插件没有锁文件，也不打进应用镜像。
