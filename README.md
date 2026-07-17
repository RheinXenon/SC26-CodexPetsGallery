# SC26 宠物画廊

这是 SummerCamp 2026 学员宠物画廊的个人仓库原型。学员通过 GitHub Issue Form 投稿，GitHub Actions 汇总有效投稿并部署静态页面；页面始终展示三个示例宠物，示例不计入投稿数量。

示例宠物直接保留原始 `spritesheet.webp`。浏览器根据 `pet.json` 中的网格和状态数据，用 Canvas 裁切并播放各行帧动画；项目不会在构建时生成缩略图或动画文件，也没有处理图片的后端服务。

## 本地预览

需要 Node.js 20 或更高版本，以及任意可用的静态文件服务器。

```powershell
npm test
npm run build:data:empty
D:\miniconda3\envs\daily\python.exe -m http.server 4173 --directory site
```

然后访问 `http://localhost:4173/`。`build:data:empty` 只会生成被 Git 忽略的 `site/pets.json` 和运行时配置，用来模拟“尚无真实投稿”的状态。

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
  examples/
    manifest.json        # 固定示例清单
    <pet-id>/
      pet.json           # 宠物信息和精灵图网格
      spritesheet.webp   # 原始精灵图
  index.html             # 静态画廊
  styles.css
  app.js
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
5. 打开一次“提交我的宠物”表单，确认 `pet.json` 和 `spritesheet.webp` 都上传完成后再提交。

工作流监听投稿 Issue 的新建、编辑、关闭和重新打开，也可以手动运行。构建脚本分页读取所有开启的 `pet-submission` Issue，只接受 GitHub 托管的附件地址，读取并校验不超过 100 KB 的 `pet.json`，然后按 GitHub 账号保留最近更新的一条有效投稿。精灵图只在浏览器中按帧显示，不会执行投稿文件中的代码。

## 投稿有效条件

投稿必须同时满足：

- Issue 处于开启状态，并带有 `pet-submission` 标签；
- Issue 标题中填写了宠物名，学员昵称和一句话介绍不为空；
- 同时上传了名为 `pet.json` 和 `spritesheet.webp` 的 GitHub 附件；
- `pet.json` 是有效 JSON，包含 `id`，并且 `spritesheetPath` 为 `spritesheet.webp`；
- 已勾选公开展示确认；
- Issue 不是 Pull Request。

不符合条件的 Issue 会被忽略，不会导致整个画廊构建失败。投稿内容在页面中始终以纯文本渲染。

## 迁移到正式仓库

原型验证后，复制 `.github/ISSUE_TEMPLATE/`、`.github/workflows/`、`scripts/`、`site/` 和 `gallery.config.json`。修改 `gallery.config.json` 中的仓库地址和页面文案，并确认正式仓库中已创建同名投稿标签；页面代码不需要绑定个人仓库地址。
