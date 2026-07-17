# SC26 宠物画廊

这是 SummerCamp 2026 学员宠物画廊的个人仓库原型。学员通过 GitHub Issue Form 投稿，GitHub Actions 汇总有效投稿并部署静态页面；页面始终展示三个示例宠物，示例不计入投稿数量。

前端使用 **Vite + Preact + TypeScript + Tailwind** 构建为静态站点，视觉为产品级图鉴风格。列表仍采用构建期生成的封面/低分辨率预览，详情才加载完整精灵图。支持搜索、分组筛选、分页、卡片密度切换、分享深链（`?pet=`）与多宠合影导出。

## 本地预览

需要 Node.js 20 或更高版本。

```powershell
npm install
npm test
npm run build:data:empty
npm run dev
```

然后访问 `http://localhost:4173/`。`build:data:empty` 会生成被 Git 忽略的 `web/public/pets.json`、运行时配置、示例预览索引和预览图片。

生产构建：

```powershell
npm run build:data:empty
npm run build
# 产物在 dist/，可用任意静态服务器预览
npm run preview
```

如需在本地读取真实 Issue：

```powershell
$env:GITHUB_TOKEN = "你的 Token"
$env:GITHUB_REPOSITORY = "RheinXenon/SC26-CodexPetsGallery"
npm run build:data
```

## 目录结构

```text
.github/
  ISSUE_TEMPLATE/       # 投稿表单
  workflows/            # Pages 构建与部署
lib/                    # 构建与前端共用的纯 JS 工具
scripts/                # Issue 解析和数据生成
web/
  public/
    examples/           # 固定示例宠物
    generated/previews/ # 构建生成的封面与预览条
    photo-booth/        # 合影背景（可选图片资源）
    pets.json           # 构建生成
    previews.json
    gallery.config.json
  src/                  # Preact 前端源码
dist/                   # vite build 产物（Pages 部署目录）
.gallery-cache/         # Actions 复用的预览缓存
tests/
gallery.config.json
```

新增固定示例时，复制 `web/public/examples/<pet-id>/` 并把 `<pet-id>` 加入 `manifest.json`。不要把学员投稿提交到 examples；真实投稿只存在于 Issue 与每次部署生成的 `pets.json`。

## 前端能力

- 产品级图鉴布局：sticky 顶栏与筛选条、信息完整卡片、动画优先详情
- 卡片密度三档（舒适 / 标准 / 紧凑），偏好写入 localStorage
- 分享深链：`?pet=example-bananacat` 或 `?pet=issue-12`，详情内可复制链接
- 合影：自由多选 + 按组加入（1–33），最多 12 只；预设渐变背景；使用**同源 poster** 合成并导出 PNG（避免跨域 canvas 污染）

## 精灵图兼容

| 版本 | 网格 | 图片尺寸 | 当前展示范围 |
| --- | --- | --- | --- |
| v1 | 8×9 | 1536×1872 | 九行基础状态 |
| v2 | 8×11 | 1536×2288 | 前九行基础状态 |

单帧 192×208。v2 末两行方位注视不进入状态选择器。

## GitHub 仓库设置

1. 创建公开仓库并启用 Issues。
2. 创建 `pet-submission` 标签。
3. 推送到 `main`。
4. Pages 来源设为 **GitHub Actions**。
5. 通过「提交我的宠物」表单投稿。

工作流：`npm ci` → 生成画廊数据/预览 → `vite build` → 上传 `dist/`。预览图仍走 Actions cache；前端构建通常只需数秒。

## 投稿有效条件

- Issue 开启且带 `pet-submission`
- 标题含宠物名，昵称与介绍非空
- 分组可空；填写时仅 1–33
- 具名附件 `pet.json` + `spritesheet.webp`（GitHub 托管）
- WebP 尺寸 v1/v2 合法且 ≤10 MB
- 已勾选公开展示确认

## 迁移到正式仓库

复制 `.github/`、`lib/`、`scripts/`、`web/`、`gallery.config.json`、`package.json`、`package-lock.json` 与 `tests/`。修改 `gallery.config.json` 中的仓库地址与文案即可。
