# SC26 宠物画廊

这是 SummerCamp 2026 学员宠物画廊的个人仓库原型。学员通过 GitHub Issue Form 投稿，GitHub Actions 汇总有效投稿并部署静态页面；页面始终展示三个示例宠物，示例不计入投稿数量。

示例宠物直接保留原始 `spritesheet.webp`。构建脚本在校验完整精灵图时，同时生成默认状态封面和低分辨率动画预览；画廊列表懒加载这些轻量资源，只在宠物进入可视区域时播放预览，打开详情后才读取完整精灵图。页面支持按宠物名、作者、分组和介绍搜索；分组搜索预置第 1 组到第 33 组，也允许直接输入，并按每页 40 只分页展示。所有图片处理都在 GitHub Actions 构建阶段完成，不需要后端图片服务。

## 本地预览

需要 Node.js 20 或更高版本，以及任意可用的静态文件服务器。

```powershell
npm install
npm test
npm run build:data:empty
D:\miniconda3\envs\daily\python.exe -m http.server 4173 --directory site
```

然后访问 `http://localhost:4173/`。`build:data:empty` 会生成被 Git 忽略的 `site/pets.json`、运行时配置、示例预览索引和预览图片，用来模拟“尚无真实投稿”的状态。

如需在本地读取真实 Issue，先设置只读范围的 GitHub Token：

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
scripts/                 # Issue 解析和数据生成
site/
  generated/previews/    # 构建生成的封面和低分辨率动画预览
  examples/
    manifest.json        # 固定示例清单
    <pet-id>/
      pet.json           # 宠物信息和精灵图网格
      spritesheet.webp   # 原始精灵图
  index.html             # 静态画廊
  pets.json              # 构建生成的投稿清单
  previews.json          # 构建生成的示例预览索引
  styles.css
  app.js
.gallery-cache/          # Actions 复用的预览和校验缓存
tests/                   # 数据解析测试
gallery.config.json      # 可迁移的仓库与页面配置
```

新增固定示例时，复制一个 `site/examples/<pet-id>/` 目录并把 `<pet-id>` 加入 `site/examples/manifest.json`。建议在 `pet.json` 中完整描述精灵图列数、行数、默认状态，以及每种状态的行号、帧数和播放间隔；省略这些字段时，画廊会按 Codex 宠物的基础九状态和图片实际尺寸补齐。不要把学员投稿文件提交到 `site/examples/`；真实投稿只存在于 Issue 和每次部署生成的 `pets.json` 中。

## 精灵图兼容

画廊根据图片实际尺寸自动识别两版 Codex 宠物精灵图：

| 版本 | 网格 | 图片尺寸 | 当前展示范围 |
| --- | --- | --- | --- |
| v1 | 8×9 | 1536×1872 | 九行基础状态 |
| v2 | 8×11 | 1536×2288 | 前九行基础状态 |

两版的单帧都是 192×208。v2 末两行的 16 方位注视动画会被保留在原始文件中，但当前基础画廊不把它们加入状态选择器。即使 `pet.json` 没有声明版本，浏览器也会用 `spritesheet.webp` 的实际尺寸识别 v1 或 v2。

## GitHub 仓库设置

1. 创建公开仓库并启用 Issues。
2. 创建名为 `pet-submission` 的标签。Issue Form 引用的标签必须预先存在。
3. 推送本项目到 `main` 分支。
4. 在仓库的 Pages 设置中把来源设为 **GitHub Actions**。
5. 打开一次“提交我的宠物”表单，建议填写与夏令营名单一致的所属分组，再通过专用附件控件上传 `pet.json` 和 `spritesheet.webp`，确认两个文件都完成后再提交。

工作流监听投稿 Issue 的编辑、删除、关闭、重新打开和标签变化，也可以手动运行。新投稿由 Issue Form 自动添加的 `pet-submission` 标签触发一次构建；同一时间发生连续变化时只保留最新一次 Pages 部署。关闭 Issue 会从画廊撤回宠物，重新打开会恢复，管理员永久删除 Issue 也会移除对应宠物。构建脚本分页读取所有开启的 `pet-submission` Issue，只接受 GitHub 托管的附件地址，以有限并发下载并校验不超过 10 MB 的 `spritesheet.webp`，然后按 GitHub 账号保留最近更新的一条有效投稿。校验成功后会生成封面和默认状态动画预览，并通过 Actions 缓存复用没有变化的结果。`pet.json` 作为原始作品文件保留链接，但不会成为构建依赖；画廊根据精灵图尺寸生成安全的标准网格配置，不会执行投稿文件中的代码。

## 投稿有效条件

投稿必须同时满足：

- Issue 处于开启状态，并带有 `pet-submission` 标签；
- Issue 标题中填写了宠物名，学员昵称和一句话介绍不为空；
- 所属分组可以留空；填写后会在卡片和详情中展示，并可用于搜索与筛选；
- 同时上传了名为 `pet.json` 和 `spritesheet.webp` 的 GitHub 附件；
- `spritesheet.webp` 是有效 WebP，尺寸为 v1 的 1536×1872 或 v2 的 1536×2288，且不超过 10 MB；
- 已勾选公开展示确认；
- Issue 不是 Pull Request。

不符合条件的 Issue 会被忽略，不会导致整个画廊构建失败。投稿内容在页面中始终以纯文本渲染。

## 迁移到正式仓库

原型验证后，复制 `.github/ISSUE_TEMPLATE/`、`.github/workflows/`、`scripts/`、`site/`、`gallery.config.json`、`package.json` 和 `package-lock.json`。修改 `gallery.config.json` 中的仓库地址和页面文案，并确认正式仓库中已创建同名投稿标签；页面代码不需要绑定个人仓库地址。
