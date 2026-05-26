# 家庭菜单预约小程序

这是一个用于家庭每日菜单管理的小程序：先维护常吃菜品，再按日期和早/午/晚餐预约菜品，同时记录冰箱库存、评价和用户信息。当前项目由微信小程序前端和 Cloudflare Workers 后端组成，数据落在 Cloudflare D1，图片/文件适合存到 Cloudflare R2。

## 当前状态

- 前端：微信小程序原生框架 + TypeScript，入口在 `miniprogram/`。
- 后端：Cloudflare Workers，入口在 `cloudflareWorkes/worker.js`。
- API 地址：前端统一请求地址写在 `miniprogram/services/http.ts`，当前为 `https://wx.oulongxing.com`。
- 小程序 AppID：`project.config.json` 中配置为 `wxabc39c01a21a60a8`。
- GitNexus：已在本机安装并完成本仓库索引，详见“GitNexus 代码索引”。

## 主要功能

### 1. 菜品菜单

- 新增、编辑、删除、查看菜品。
- 菜品信息包含名称、类型、辣度、图片、所需原料、制作步骤、注意事项、备注和参考链接。
- 支持菜品搜索、按类型分页查询。
- 支持按食材推荐菜品。

### 2. 日历预约

- 按日期选择早餐、午餐或晚餐。
- 从已有菜品中多选，生成一条预约。
- 支持查看预约详情、修改预约、取消预约、确认预约、完成预约、恢复已取消预约。
- 管理员可以查看全部预约，也可以按日期查看预约。

### 3. 冰箱库存

- 新增、编辑、删除、查看库存食材。
- 食材包含名称、数量/重量、分类、状态、放入日期、过期日期、图片和备注。
- 支持搜索库存和查看临期食材。

### 4. 用户、管理员和评价

- 支持微信登录、自定义登录态 token、用户资料、手机号、头像更新。
- 支持管理员身份检查和用户列表管理。
- 支持按用户、菜品、预约查看评价，也支持新增、更新、删除评价。

### 5. 文件存储

- 后端提供上传、查询、下载、删除、批量删除和文件列表接口。
- 设计上适合通过 Cloudflare R2 保存菜品图片、评价图片和库存图片。

## 项目结构

```text
CookbyAppointment/
├── miniprogram/                 # 微信小程序前端
│   ├── app.json                 # 页面、tabBar、权限等全局配置
│   ├── app.ts                   # 启动逻辑、登录拦截、隐私检查
│   ├── pages/                   # 页面
│   ├── services/                # 前端 API 服务封装
│   ├── models/                  # TypeScript 数据模型和数据库说明
│   ├── utils/                   # 工具函数、登录、隐私、事件总线、本地存储
│   └── custom-tab-bar/          # 自定义底部导航
├── cloudflareWorkes/            # Cloudflare Workers 后端，目录名保持现状
│   ├── worker.js                # API 路由入口
│   ├── wxApi.js                 # 微信接口封装
│   └── handlers/                # 用户、菜品、预约、库存、文件、评价处理器
├── typings/                     # 小程序类型声明
├── prd.md                       # 原始产品需求
├── project.config.json          # 微信开发者工具项目配置
├── tsconfig.json                # TypeScript 配置
└── package.json                 # 小程序依赖
```

## 小程序页面

| 页面 | 路径 | 用途 |
| --- | --- | --- |
| 首页 | `pages/index/index` | 功能入口 |
| 菜单列表 | `pages/menu/menu` | 查看和搜索菜品 |
| 新增/编辑菜品 | `pages/menu/add/add` | 维护菜品资料 |
| 菜品详情 | `pages/menu/detail/detail` | 查看菜品图片、食材和步骤 |
| 预约日历 | `pages/appointment/appointment` | 按日期查看和创建预约 |
| 选择菜品 | `pages/appointment/select/select` | 为预约多选菜品 |
| 预约测试/列表 | `pages/appointment/listtest` | 预约列表相关页面 |
| 库存列表 | `pages/inventory/inventory` | 查看库存食材 |
| 新增/编辑库存 | `pages/inventory/add/add` | 维护库存食材 |
| 我的 | `pages/profile/profile` | 登录、用户信息、入口 |
| 设置 | `pages/profile/settings/settings` | 用户设置 |
| 管理员预约 | `pages/profile/admin/appointments/appointments` | 管理预约 |
| 管理员评价 | `pages/profile/admin/reviews/reviews` | 管理评价 |
| 管理员统计 | `pages/profile/admin/statistics/statistics` | 查看统计 |
| 管理员文件 | `pages/profile/admin/files/files` | 管理上传文件 |
| 评价页 | `pages/review/review` | 新增或查看评价 |

## 前端服务说明

前端统一通过 `miniprogram/services/http.ts` 发请求。登录后会从本地缓存读取 `token`，并放到请求头：

```text
Authorization: Bearer <token>
```

如果后端返回 401 或 403，前端会清理本地登录信息，并跳转到“我的”页面重新登录。

| 服务 | 主要方法 | 参数 | 返回值 |
| --- | --- | --- | --- |
| `UserService` | 登录、获取用户信息、更新资料、检查管理员、获取手机号、更新头像 | 微信登录 code、用户资料、手机号 code 等 | 用户资料、token、管理员状态 |
| `DishService` | `getDishList`、`getDishDetail`、`addDish`、`updateDish`、`deleteDish`、`searchDishes`、`recommendByIngredients` | 分页参数、菜品 ID、菜品对象、关键词、食材 ID 列表 | 菜品详情或 `{ total, list }` |
| `AppointmentService` | 创建、更新、取消、确认、完成、恢复预约，管理预约菜品和评价 | 预约 ID、日期、餐次、状态、菜品关联、评价内容 | 预约详情、评价列表或 `{ success }` |
| `InventoryService` | 库存列表、详情、新增、更新、删除、搜索、临期查询 | 分页参数、库存 ID、食材对象、关键词、天数 | 库存详情或 `{ total, list }` |
| `AdminAppointmentService` | 管理员预约列表、按日期查询预约 | 分页、状态、日期范围 | 管理员视角预约列表 |
| `FileService` | 上传、查询、下载、删除、批量删除、列表 | 文件路径、文件 ID、分页、文件类型 | 文件信息、下载地址或 `{ success }` |

## 后端 API

后端路由统一写在 `cloudflareWorkes/worker.js`。所有接口会自动附加 CORS 响应头。

### 用户接口

| 方法 | 路径 | 参数 | 返回 |
| --- | --- | --- | --- |
| `POST` | `/api/user/login` | 微信登录 code、用户信息 | token、用户信息 |
| `POST` | `/api/user/profile` | 微信资料相关参数 | 用户资料 |
| `POST` | `/api/user/phone` | 手机号授权参数 | 手机号 |
| `GET` | `/api/user/info` | token | 当前用户信息 |
| `PUT` | `/api/user/info` | 昵称、头像等资料 | 更新后的用户信息 |
| `GET` | `/api/user/admin` | token | 是否管理员 |
| `GET` | `/api/user/list` | 分页参数 | 用户列表 |
| `POST` | `/api/user/phone/wx` | 微信手机号 code | 微信手机号 |
| `POST` | `/api/user/avatar` | 头像信息 | 更新结果 |

### 菜品接口

| 方法 | 路径 | 参数 | 返回 |
| --- | --- | --- | --- |
| `GET` | `/api/dish/list` | `page`、`pageSize`、`type` | `{ total, list }` |
| `GET` | `/api/dish/detail` | `id` | 菜品详情 |
| `POST` | `/api/dish/add` | 菜品对象 | 新增后的菜品 |
| `PUT` | `/api/dish/update` | 菜品对象，包含 `id` | 更新后的菜品 |
| `DELETE` | `/api/dish/delete` | `id` | `{ success }` |
| `GET` | `/api/dish/search` | `keyword`、分页 | `{ total, list }` |
| `POST` | `/api/dish/recommend` | `ingredientIds`、分页 | `{ total, list }` |
| `GET` | `/api/dish/ingredients` | `dishId` 可选 | 食材列表 |
| `POST` | `/api/dish/ingredient/add` | 食材对象 | 新增后的食材 |
| `PUT` | `/api/dish/ingredient/update` | 食材对象，包含 `id` | 更新后的食材 |
| `DELETE` | `/api/dish/ingredient/delete` | `id` | `{ success }` |

### 预约接口

| 方法 | 路径 | 参数 | 返回 |
| --- | --- | --- | --- |
| `GET` | `/api/appointment/list` | 分页、状态、日期范围 | `{ total, list }` |
| `GET` | `/api/appointment/date` | `date`、`status` 可选 | `{ total, list }` |
| `GET` | `/api/appointment/detail` | `id` | 预约详情 |
| `POST` | `/api/appointment/create` | 日期、餐次、菜品、备注 | 新增后的预约 |
| `PUT` | `/api/appointment/update` | 预约对象，包含 `id` | 更新后的预约 |
| `PUT` | `/api/appointment/cancel` | `id`、`reason` 可选 | `{ success }` |
| `PUT` | `/api/appointment/confirm` | `id` | `{ success }` |
| `PUT` | `/api/appointment/complete` | `id` | `{ success }` |
| `GET` | `/api/appointment/dishes` | `appointmentId` | 预约菜品关联 |
| `POST` | `/api/appointment/dish/add` | `appointmentId`、`dishId` | 关联记录 |
| `DELETE` | `/api/appointment/dish/remove` | `id` | `{ success }` |
| `PUT` | `/api/appointment/reactivate` | `id` | `{ success }` |
| `GET` | `/api/admin/appointment/list` | 管理员 token、分页、筛选 | 全部预约 |
| `GET` | `/api/admin/appointment/date` | 管理员 token、日期 | 指定日期预约 |

### 库存、文件和评价接口

| 模块 | 方法和路径 | 参数 | 返回 |
| --- | --- | --- | --- |
| 库存 | `GET /api/inventory/list` | 分页、筛选 | `{ total, list }` |
| 库存 | `GET /api/inventory/detail` | `id` | 库存详情 |
| 库存 | `POST /api/inventory/add` | 库存对象 | 新增后的库存 |
| 库存 | `PUT /api/inventory/update` | 库存对象，包含 `id` | 更新后的库存 |
| 库存 | `DELETE /api/inventory/delete` | `id` | `{ success }` |
| 库存 | `GET /api/inventory/search` | `keyword`、分页 | `{ total, list }` |
| 库存 | `GET /api/inventory/expiring` | 临期天数 | 临期食材列表 |
| 文件 | `POST /api/file/upload` | 文件、业务类型 | 文件信息 |
| 文件 | `GET /api/file/info` | 文件 ID 或 key | 文件信息 |
| 文件 | `GET /api/file/download` | 文件 ID 或 key | 下载地址/文件响应 |
| 文件 | `DELETE /api/file/delete` | 文件 ID 或 key | `{ success }` |
| 文件 | `GET /api/file/list` | 分页、类型 | 文件列表 |
| 文件 | `POST /api/file/batch-delete` | 文件 ID/key 数组 | 删除结果 |
| 评价 | `GET /api/review/user` | `userId` 可选 | 用户评价 |
| 评价 | `GET /api/review/dish` | `dishId` | 菜品评价 |
| 评价 | `GET /api/review/appointment` | `appointmentId` | 预约评价 |
| 评价 | `POST /api/review/add` | 评分、内容、图片、关联 ID | 新增后的评价 |
| 评价 | `PUT /api/review/update` | 评价对象 | 更新后的评价 |
| 评价 | `DELETE /api/review/delete` | `id` | `{ success }` |

## 数据模型

详细字段见 `miniprogram/models/models.md`。核心表如下：

| 表名 | 用途 |
| --- | --- |
| `users` | 用户资料、openid、手机号、管理员标记 |
| `login_info` | 微信 session、自定义 token 和过期时间 |
| `user_phones` | 用户手机号授权信息 |
| `dishes` | 菜品主表 |
| `ingredients` | 菜品所需食材 |
| `appointments` | 预约主表 |
| `appointment_dishes` | 预约和菜品的多对多关联 |
| `reviews` | 评价和评分 |
| `inventory_items` | 冰箱库存食材 |

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 打开小程序

1. 打开微信开发者工具。
2. 导入本项目目录 `CookbyAppointment`。
3. 确认小程序目录为 `miniprogram/`。
4. 在微信开发者工具里执行“工具 -> 构建 npm”。
5. 编译运行小程序。

注意：`package.json` 中的 `npm run build` 目前只是占位命令，真正的小程序编译主要依赖微信开发者工具。

### 3. 修改后端地址

如需切换测试环境或正式环境，编辑：

```ts
// miniprogram/services/http.ts
const BASE_URL = 'https://wx.oulongxing.com';
```

建议后续改成按环境区分，避免把测试地址和正式地址写死在代码里。

## 后端部署说明

Worker 部署配置在 `cloudflareWorkes/wrangler.toml`，已经配置线上正在使用的 Worker、D1、R2 和自定义域名。首次从本地部署前，建议先确认本地 `cloudflareWorkes/worker.js` 与 Cloudflare 快速编辑器里的线上代码一致，避免覆盖线上版本。

已配置资源：

- Worker：`black-frost-08dc`。
- 自定义域名：`wx.oulongxing.com`。
- D1 数据库绑定：`env.DB` -> `cookby_appointment`。
- R2 存储桶绑定：`env.FILE_BUCKET` -> `cookby-appointment`。
- 环境变量：`R2_PUBLIC_URL=https://images.wx.oulongxing.com`。
- 密钥：`WX_APPID`、`WX_SECRET` 保留在 Cloudflare 后台，不写入仓库。

本机部署命令：

```bash
npx wrangler login
npx wrangler deploy --dry-run --config cloudflareWorkes/wrangler.toml
npx wrangler deploy --config cloudflareWorkes/wrangler.toml
```

也可以使用 npm 脚本：

```bash
npm run worker:login
npm run worker:whoami
npm run worker:dry-run
npm run worker:deploy
```

这些脚本会通过 `npx --yes wrangler` 调用 Wrangler，不要求项目提前安装全局 `wrangler` 命令。

如果终端当前目录是 `cloudflareWorkes/`，命令要改成：

```bash
npx wrangler deploy --dry-run --config wrangler.toml
npx wrangler deploy --config wrangler.toml
```

最近一次已验证部署信息：

- Wrangler：`4.94.0`。
- 部署命令：`npx wrangler deploy --config cloudflareWorkes/wrangler.toml`。
- Worker：`black-frost-08dc`。
- 触发器：`wx.oulongxing.com` custom domain。
- 当前版本 ID：`3d042123-b64c-45ee-a6cb-c478fd8579ec`。

当前还缺少 D1 初始化/迁移脚本，新环境部署时需要按 `miniprogram/models/models.md` 补齐建表 SQL。

## GitNexus 代码索引

本机已经完成 GitNexus 安装和本仓库索引：

- GitNexus 仓库路径：`/Users/trojan/github/GitNexus`。
- 全局 npm 包：`gitnexus@1.6.5`。
- Node.js：`v24.14.0`。
- 本仓库索引命令：`gitnexus analyze --index-only /Users/trojan/github/CookbyAppointment`。
- 当前索引状态：up-to-date，commit `e3a9337`。
- 索引统计：266 files、2792 symbols、5426 edges、144 clusters、230 processes。

常用命令：

```bash
gitnexus doctor
gitnexus status
gitnexus list
gitnexus analyze --index-only /Users/trojan/github/CookbyAppointment
gitnexus analyze --force --index-only /Users/trojan/github/CookbyAppointment
gitnexus query "预约创建流程"
gitnexus context DishService
```

如果当前 shell 找不到 `gitnexus`，可以改用：

```bash
npx gitnexus --version
npx gitnexus status
```

`.gitnexus/` 是本地索引目录，不建议提交到远程仓库。

## 登录拦截和隐私

`miniprogram/app.ts` 会重写 `wx.navigateTo`、`wx.redirectTo`、`wx.switchTab`、`wx.reLaunch`，用于判断页面是否需要登录。未登录用户访问受限页面时，会保存原目标地址并跳转到“我的”页面。

隐私相关逻辑在 `miniprogram/utils/privacy.ts` 和 `miniprogram/app.ts` 中，隐私文本目前位于 `miniprogram/privacy/privacy.md`。

## 已发现的待修复问题

这些问题是阅读代码时发现的风险点，建议后续优先处理：

1. `app.ts` 会跳转到 `/pages/privacy/privacy`，但 `app.json` 没有注册该页面，项目里目前只有 `miniprogram/privacy/privacy.md`。
2. 登录拦截列表里存在未注册或路径不一致的页面，例如 `pages/profile/appointments/appointments`。
3. `pages/appointment/select/select.ts` 使用了 `DishService.searchDish(...)`，但服务里实际方法名是 `searchDishes(...)`。
4. `DishService.getIngredientList()` 请求 `/api/dish/ingredient/list`，但 Worker 注册的是 `/api/dish/ingredients`。
5. `AppointmentService.getReviewList()` 请求 `/api/review/list`，但 Worker 当前没有注册这个路由。
6. 评价更新字段需要核对：前端通常传 `id`，后端更新逻辑可能读取 `reviewId`。
7. 文件上传接口要求管理员权限，但普通用户新增/编辑菜品图片也会走上传接口，可能导致普通用户上传失败。
8. 库存新增页仍有本地存储旧逻辑，而库存列表页使用后端 API，可能出现数据源不一致。
9. `tsconfig.json` 开启了严格检查和未使用代码检查，现有未使用 import 或参数可能导致 TypeScript 编译失败。
10. 后端缺少部署配置和数据库迁移脚本，新环境部署需要先补齐。

## 建议的下一步

1. 先修复“待修复问题”中的接口路径和方法名不一致问题，保证小程序可以正常编译运行。
2. 补齐 Cloudflare Worker 的 `wrangler.toml` 和 D1 建表脚本，让后端可以一键部署。
3. 把 `BASE_URL` 改造成开发/生产环境配置。
4. 在微信开发者工具中完整测试登录、菜品、预约、库存、评价和文件上传流程。