# 刹车练习模拟器（Next.js + SQLite）

从 100 km/h 踩到停稳的刹车练习小游戏。踏板极限 1600 N，超过即断裂；成绩越短越好。
排行榜数据存在 SQLite 里，报名、成绩、排名都由服务端读写。

> 本模拟器为娱乐向简化物理模型，与任何车企、任何真实车型及任何真实事件均无关联，请勿对号入座或无端联想。
> 所有数值均为虚构设定，不代表真实车辆的性能、质量或安全性。

## 本地开发

需要 **Node 24+**。数据库用的是 Node 内置的 `node:sqlite`，22 版本要额外开 flag，
所以 `package.json` 里已经声明 `engines.node >= 24`。

```bash
npm install
npm run dev          # http://localhost:3000
```

其他命令：`npm run build`（生产构建，含类型检查）、`npm start`（跑生产构建）、`npm run lint`。

## 数据存储

- 引擎：`node:sqlite`（Node 内置，零依赖、免编译）
- 默认路径：`<项目根>/data/brake.db`
- 覆盖方式：环境变量 `BRAKE_DB_PATH`
- 表结构：`scores(id, name, time, reaction, entry, peak, distance, created_at)`
- 首次启动：表为空时自动灌入 18 条种子成绩

排行榜按人名取最好成绩（`GROUP BY name` + `MIN(time)`）；失败局（踏板断裂 / 未制动）不写入。

`data/` 已加进 `.gitignore`。想清空榜单就删掉这个目录，下次请求会自动重建并重新灌种子。

## 部署

**关键前提**：SQLite 是本地文件，需要一块**持久化磁盘**。Vercel / Netlify 这类平台的
文件系统是只读或临时的，直接用会导致成绩写不进去或重启即丢，所以别用它们
（除非把库换成 Turso / Postgres，见文末）。需要一个「能常驻 + 能挂卷」的运行环境。

### 方式一：Actions 构建 → GHCR → VPS 拉取（推荐，自建服务器首选）

分工是：**CI 只负责构建镜像，服务器只负责拉镜像**。服务器上没有源码，也不需要装 Node。

**第 1 步：推到 GitHub**

`brake-next/` 要作为仓库根目录（`.github/workflows/` 必须位于仓库根），推到 `main`。

**第 2 步：让 Actions 构建**

`.github/workflows/docker-publish.yml` 会在 push 到 `main`、打 `v*` tag、或手动触发时，
构建并推送 `ghcr.io/<owner>/<repo>:latest`（同时打一个 sha tag）。
用的是仓库内置的 `GITHUB_TOKEN`，不需要额外配 secret。镜像名会自动转小写——GHCR 不接受大写。

默认只构建 `linux/amd64`。VPS 是 ARM（Hetzner ARM、Oracle ARM 之类）就把 workflow 里的
`platforms` 改成 `linux/arm64`。

**第 3 步：处理包可见性**

GHCR 的包默认是**私有**的，服务器直接 pull 会 403。二选一：

- 到 GitHub → 你的 Packages → 该包 → Package settings 改成 public；或者
- 在服务器上登录一次（PAT 需要 `read:packages` 权限）：

```bash
echo "$CR_PAT" | docker login ghcr.io -u <github用户名> --password-stdin
```

**第 4 步：服务器上只跑应用容器**

反向代理与 HTTPS 由服务器上**已有的** Caddy 负责，compose 里不带 Caddy。
装好 Docker 与 compose 插件，把仓库里的 `docker-compose.yml` 拷到一个目录
（比如 `/opt/brake-next`），然后：

```bash
cd /opt/brake-next

docker compose pull
docker compose up -d
```

`docker-compose.yml` 是自包含的：镜像 tag、数据目录、对外端口都写在文件里，
要改直接改文件并注释说明清楚，不需要额外的 `.env`。

容器默认只发布到 `127.0.0.1:3000`，公网访问不到这个端口，必须经由你的 Caddy 进来。
数据库落在与本文件同级的 `./data/brake.db`，直接 `ls`、`sqlite3` 就能看，不经具名卷。

**在你已有的 Caddy 里加一段 site block 就行**

```caddyfile
brake.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

改完 `systemctl reload caddy`。域名 A 记录指向本机、80/443 放通，证书会自动签发和续期。

如果 Caddy 本身也跑在 Docker 里，它访问不到宿主机的 `127.0.0.1`。两种做法：
把 compose 里的 `"127.0.0.1:3000:3000"` 改成 `"0.0.0.0:3000:3000"`
（同时用防火墙挡掉 3000，别让它绕过 HTTPS 裸奔）；
或者把 Caddy 接进同一个 compose 网络，写 `reverse_proxy app:3000`。

**数据目录与备份**

数据落在 `./data/brake.db`（改 compose 里那行挂载路径即可换位置），
重建、升级容器都不会丢，备份就是打包这个目录：

```bash
tar czf brake-backup-$(date +%F).tgz -C data .
# 恢复：先 docker compose down，再解包覆盖 ./data，然后 up -d
```

绑定挂载踩坑说明：宿主机目录默认属于你自己的用户，而容器里应用跑在 uid 1000。
镜像的 entrypoint 会在启动时（以 root）把 `/data` 的所有权改成 `node`，然后再降权运行，
所以正常情况下你不需要手动 `chown`。但如果你在 compose 里额外写了 `user:` 覆盖，
entrypoint 就没有 root 权限了，那种情况下请自己 `chown -R 1000:1000 ./data`。

**升级与回滚**

```bash
# 升级到最新
docker compose pull && docker compose up -d

# 回滚：把 docker-compose.yml 里的 image tag 换成带旧 sha 的，再 up -d
```

**不想用 CI 也可以本地构建**（同样的 Dockerfile）：

```bash
docker build -t brake-next .
docker run -d --name brake-next -p 127.0.0.1:3000:3000 \
  -v "$PWD/data:/data" brake-next
```

挂载是必须的：镜像里 `BRAKE_DB_PATH` 已指向 `/data/brake.db`。绑定目录的所有权由
entrypoint 自动修正，不用手动 `chown`。用具名卷（`-v brake-data:/data`）也可以。

### 方式二：Fly.io（最省事，原生支持卷）

```bash
fly launch --no-deploy          # 生成 fly.toml，选择用现有 Dockerfile 部署
fly volumes create brake_data --size 1
```

在 `fly.toml` 里挂卷并注入环境变量：

```toml
[mounts]
  source = "brake_data"
  destination = "/data"

[env]
  BRAKE_DB_PATH = "/data/brake.db"
```

```bash
fly deploy
```

Fly 的卷默认属于 root，而镜像的 entrypoint 会在启动时自动把 `/data` 修正给 `node` 用户，
所以一般不用额外操作。

### 方式三：Railway / Render

两家都支持 Dockerfile 部署加持久卷，面板里三步：

1. 新建服务并指向这个仓库；
2. 挂一块持久磁盘到 `/data`；
3. 添加环境变量 `BRAKE_DB_PATH=/data/brake.db`。

### 方式四：只把本机临时暴露到公网

不部署、不租服务器，用隧道临时公开本地 3000 端口。关掉电脑就失效，适合先发给别人试玩。

```bash
cloudflared tunnel --url http://localhost:3000
# 或
ngrok http 3000
```

### 如果一定要上 Vercel 这类无状态平台

得先换存储，只有两处需要改：

1. `src/lib/db.ts` 换成托管数据库客户端。最小改动是 Turso/libSQL，SQL 语句基本不用动；
   用 Postgres（Neon / Supabase）也可以；
2. `src/app/api/scores/route.ts` 里的查询改成对应的异步调用。

玩法逻辑 `src/lib/physics.ts` 和全部 UI 组件不受影响，无需改动。

## 环境变量

这两个由 `docker-compose.yml` 直接注入，一般不用动：

- `BRAKE_DB_PATH`：SQLite 文件位置。镜像里默认指向 `/data/brake.db`，也就是挂载进来的 `./data`；
- `PORT`：容器内监听端口，默认 `3000`。对外端口改的是 compose 里 `ports` 的左边。

不经过容器直接跑（`npm run dev` / `npm start`）时，`BRAKE_DB_PATH` 不设就是项目下的 `./data/brake.db`。
