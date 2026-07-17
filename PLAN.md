# SC26-CodexPetsGallery 个人仓库原型

## 目标

先在公开个人仓库 `RheinXenon/SC26-CodexPetsGallery` 中验证最小闭环：

1. 学员通过 GitHub Issue Form 提交宠物。
2. GitHub Actions 自动读取投稿并生成静态数据。
3. GitHub Pages 在约 1–3 分钟后展示新宠物。
4. 点击卡片可以查看各状态动画、作者、原 Issue 和两个原始宠物文件。

原型采用独立小项目结构，不直接模拟暑校仓库；验证成功后再整理迁移方案。

## 工程结构

- `.github/ISSUE_TEMPLATE/pet-submission.yml`：宠物投稿表单。
- `.github/workflows/deploy-pages.yml`：读取投稿、生成数据并部署 Pages。
- `scripts/build-gallery-data.mjs`：解析 Issue 并生成 `pets.json`。
- `site/`：无框架的静态 HTML、CSS、JavaScript 页面和示例资源。
- `gallery.config.json`：仓库地址、投稿标签、页面标题等可迁移配置。
- `README.md`：项目说明、在线画廊和投稿入口。

使用原生前端，不引入 React、数据库或服务端，优先验证 GitHub 工作流本身。

## 投稿与数据流程

- 创建公开仓库并启用 Issues。
- 创建 `pet-submission` 标签，Issue Form 自动添加该标签。
- 表单必填：标题中的宠物名、学员昵称、一句话介绍、`pet.json`、`spritesheet.webp` 和公开展示确认。
- GitHub 账号直接读取 Issue 作者。
- Actions 读取并校验 `pet.json`；`spritesheet.webp` 由浏览器直接按帧展示，不生成派生图片。
- Actions 监听 Issue 的新建、编辑、关闭和重新开启，并支持手动运行。
- 构建脚本分页读取所有开启的 `pet-submission` Issue，提取结构化字段，生成：

```json
{
  "generatedAt": "ISO-8601",
  "pets": [
    {
      "issueNumber": 1,
      "petName": "宠物名",
      "nickname": "昵称",
      "description": "一句话介绍",
      "githubLogin": "账号",
      "githubUrl": "GitHub 主页",
      "petConfigUrl": "pet.json 附件地址",
      "spritesheetUrl": "spritesheet.webp 附件地址",
      "spriteGrid": "经过校验的精灵图配置",
      "issueUrl": "投稿 Issue",
      "updatedAt": "ISO-8601"
    }
  ]
}
```

- 每个 GitHub 账号只展示最近更新的一条有效投稿。
- 生成的 `pets.json` 只写入部署产物，不提交回仓库。
- 页面构建失败时保留上一次成功部署。

## 页面范围

- 简洁、响应式的作品网格，首屏直接显示宠物，不制作宣传首页。
- 顶部显示项目名、真实投稿数量和“提交我的宠物”按钮。
- 卡片显示宠物预览、宠物名、昵称和 GitHub 账号。
- 点击卡片打开详情层，提供状态动画、GitHub 主页、原 Issue 和两个原始文件入口。
- 始终保留 3 个原创示例宠物，明确标注“示例”，且不计入投稿数量。
- 投稿文本通过纯文本方式渲染，只接受 GitHub 托管的附件地址。
- 包含加载中、暂无真实投稿、数据加载失败和图片损坏状态。

首轮不实现搜索、标签筛选、审核评论、排行榜、安装说明、300 条性能优化和网页直接上传。

## 验证步骤

- 重新登录失效的 `gh` 账号，并创建公开仓库 `RheinXenon/SC26-CodexPetsGallery`。
- 推送原型后，将 Pages 来源设置为 GitHub Actions。
- 确认仅有示例数据时页面可以正常部署和浏览。
- 使用真实 Issue Form 提交一个 `pet.json` 和一个 `spritesheet.webp`。
- 确认工作流成功，投稿在 1–3 分钟内出现在 Pages。
- 确认卡片动画、状态详情、作者链接、Issue 链接和两个文件入口均正确。
- 在桌面和手机尺寸下检查卡片、长名称、动画图片和详情层没有溢出。
- 首轮以“能真实提交并正确展示”为通过标准；编辑、关闭、重复投稿和异常格式只做基础支持，不作为本轮验收阻塞项。

## 后续迁移

原型通过后，再把 Issue Form、数据生成脚本、Pages 页面和工作流迁入 SummerCamp-2026。迁移时只替换仓库配置、部署目录和活动文案，并补齐正式活动所需的校验反馈、搜索、分批加载及 100–300 条投稿测试。
