import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractAllowedUrl,
  extractFields,
  extractPetAttachments,
  extractPetName,
  hydrateSubmission,
  isAllowedGithubAttachment,
  parseSubmission,
  selectLatestSubmissions,
  selectLatestValidSubmissions,
} from "../scripts/build-gallery-data.mjs";
import {
  normalizeSpriteGrid,
  resolveSpriteLayout,
} from "../site/sprite-format.js";

const validBody = ({ nickname = "阿澈", suffix = "one" } = {}) => `### 学员昵称
${nickname}

### 一句话介绍
一只会帮我检查代码的小伙伴。

### 宠物文件
[pet.json](https://github.com/user-attachments/files/${suffix}/pet.json)
![spritesheet](https://github.com/user-attachments/assets/${suffix})

### 公开展示确认
- [x] 我确认该作品可以公开展示
`;

function issue(overrides = {}) {
  return {
    number: 7,
    title: "[宠物投稿] 小火苗",
    state: "open",
    body: validBody(),
    user: { login: "student" },
    html_url: "https://github.com/owner/repo/issues/7",
    updated_at: "2026-07-17T08:00:00Z",
    ...overrides,
  };
}

test("extractFields 读取 Issue Form 生成的标题字段", () => {
  const fields = extractFields(validBody());
  assert.equal(fields["学员昵称"], "阿澈");
  assert.equal(extractPetName("[宠物投稿] 小火苗"), "小火苗");
  assert.match(fields["公开展示确认"], /\[x\]/);
});

test("只接受 GitHub 托管的附件地址", () => {
  assert.equal(isAllowedGithubAttachment("https://github.com/user-attachments/assets/abc"), true);
  assert.equal(isAllowedGithubAttachment("https://user-images.githubusercontent.com/1/a.png"), true);
  assert.equal(isAllowedGithubAttachment("https://example.com/pet.png"), false);
  assert.equal(extractAllowedUrl("![x](https://example.com/x.png)"), null);
});

test("宠物文件必须同时包含具名的 pet.json 和 spritesheet.webp", () => {
  assert.deepEqual(extractPetAttachments(`
[pet.json](https://github.com/user-attachments/files/one/pet.json)
![spritesheet](https://github.com/user-attachments/assets/one)
`), {
    petConfigUrl: "https://github.com/user-attachments/files/one/pet.json",
    spritesheetUrl: "https://github.com/user-attachments/assets/one",
  });
  assert.equal(extractPetAttachments("![other](https://github.com/user-attachments/assets/one)"), null);
});

test("兼容 GitHub 将 WebP 附件写成 HTML 图片的实际 Issue 内容", () => {
  assert.deepEqual(extractPetAttachments(`
<img width="1536" height="1872" alt="Image" src="https://github.com/user-attachments/assets/sprite-id" />
[pet.json](https://github.com/user-attachments/files/30125974/pet.json)
`), {
    petConfigUrl: "https://github.com/user-attachments/files/30125974/pet.json",
    spritesheetUrl: "https://github.com/user-attachments/assets/sprite-id",
  });
});

test("有多张未具名图片时不猜测哪一张是精灵图", () => {
  assert.equal(extractPetAttachments(`
<img alt="Image" src="https://github.com/user-attachments/assets/first" />
<img alt="Image" src="https://github.com/user-attachments/assets/second" />
[pet.json](https://github.com/user-attachments/files/one/pet.json)
`), null);
});

test("有效投稿会转成公开画廊数据", () => {
  assert.deepEqual(parseSubmission(issue()), {
    issueNumber: 7,
    petName: "小火苗",
    nickname: "阿澈",
    description: "一只会帮我检查代码的小伙伴。",
    githubLogin: "student",
    githubUrl: "https://github.com/student",
    petConfigUrl: "https://github.com/user-attachments/files/one/pet.json",
    spritesheetUrl: "https://github.com/user-attachments/assets/one",
    issueUrl: "https://github.com/owner/repo/issues/7",
    updatedAt: "2026-07-17T08:00:00Z",
  });
});

test("未确认公开展示和已关闭投稿会被丢弃", () => {
  assert.equal(parseSubmission(issue({ body: validBody().replace("[x]", "[ ]") })), null);
  assert.equal(parseSubmission(issue({ state: "closed" })), null);
});

test("同一账号只保留最近更新的有效投稿", () => {
  const older = issue({ number: 1, updated_at: "2026-07-16T08:00:00Z" });
  const newer = issue({
    number: 2,
    title: "[宠物投稿] 新宠物",
    updated_at: "2026-07-17T09:00:00Z",
    body: validBody({ suffix: "two" }),
  });
  const other = issue({
    number: 3,
    user: { login: "another" },
    updated_at: "2026-07-17T10:00:00Z",
  });

  const selected = selectLatestSubmissions([older, newer, other]);
  assert.equal(selected.length, 2);
  assert.equal(selected.find((pet) => pet.githubLogin === "student").petName, "新宠物");
});

test("pet.json 通过校验后会补齐精灵图配置", async () => {
  const submission = parseSubmission(issue());
  const hydrated = await hydrateSubmission(submission, {
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => "120" },
      text: async () => JSON.stringify({
        id: "spark",
        spritesheetPath: "spritesheet.webp",
      }),
    }),
  });

  assert.equal(hydrated.petId, "spark");
  assert.equal(hydrated.spriteGrid.columns, 8);
  assert.equal(hydrated.spriteGrid.states.length, 9);
});

test("读取 GitHub pet.json 附件时会使用 Actions 令牌", async () => {
  const submission = parseSubmission(issue());
  let requestHeaders;
  await hydrateSubmission(submission, {
    token: "test-token",
    fetchImpl: async (_url, options) => {
      requestHeaders = options.headers;
      return {
        ok: true,
        headers: { get: () => "120" },
        text: async () => JSON.stringify({ id: "spark", spritesheetPath: "spritesheet.webp" }),
      };
    },
  });

  assert.equal(requestHeaders.Authorization, "Bearer test-token");
});

test("Actions 令牌不会发送给 GitHub 附件域名之外的地址", async () => {
  let requestHeaders;
  await hydrateSubmission({
    petConfigUrl: "https://example.com/pet.json",
  }, {
    token: "test-token",
    fetchImpl: async (_url, options) => {
      requestHeaders = options.headers;
      return { ok: false };
    },
  });

  assert.equal(requestHeaders.Authorization, undefined);
});

test("同一账号的最新附件无效时会回退到较早的有效投稿", async () => {
  const older = issue({ number: 1, updated_at: "2026-07-16T08:00:00Z" });
  const newer = issue({
    number: 2,
    title: "[宠物投稿] 无效新投稿",
    updated_at: "2026-07-17T09:00:00Z",
    body: validBody({ suffix: "invalid" }),
  });
  const selected = await selectLatestValidSubmissions([older, newer], {
    fetchImpl: async (url) => ({
      ok: true,
      headers: { get: () => "120" },
      text: async () => url.includes("invalid")
        ? "not json"
        : JSON.stringify({ id: "spark", spritesheetPath: "spritesheet.webp" }),
    }),
  });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].issueNumber, 1);
});

test("三个示例宠物都使用完整且不越界的精灵图状态配置", async () => {
  const ids = ["bananacat", "hachiroku", "oiiai"];

  for (const id of ids) {
    const content = await readFile(new URL(`../site/examples/${id}/pet.json`, import.meta.url), "utf8");
    const pet = JSON.parse(content);
    const grid = pet.spriteGrid;

    assert.equal(grid.columns, 8, `${id} 应为 8 列`);
    assert.equal(grid.rows, 9, `${id} 应为 9 行`);
    assert.equal(grid.states.length, 9, `${id} 应包含 9 种状态`);
    assert.ok(grid.states.some((state) => state.id === grid.defaultState));
    for (const state of grid.states) {
      assert.ok(state.row >= 0 && state.row < grid.rows, `${id}/${state.id} 行号越界`);
      assert.ok(state.frames >= 1 && state.frames <= grid.columns, `${id}/${state.id} 帧数越界`);
      assert.ok(state.frameDuration > 0, `${id}/${state.id} 缺少播放间隔`);
    }
  }
});

test("v1 与 v2 精灵图都按 192×208 的基础帧解析", () => {
  const grid = normalizeSpriteGrid();
  const v1 = resolveSpriteLayout({ naturalWidth: 1536, naturalHeight: 1872 }, grid);
  const v2 = resolveSpriteLayout({ naturalWidth: 1536, naturalHeight: 2288 }, grid);

  assert.deepEqual(v1, {
    version: "v1",
    columns: 8,
    rows: 9,
    frameWidth: 192,
    frameHeight: 208,
  });
  assert.deepEqual(v2, {
    version: "v2",
    columns: 8,
    rows: 11,
    frameWidth: 192,
    frameHeight: 208,
  });
  assert.equal(grid.states.find((state) => state.id === "running").label, "处理中");
});

test("v2 的额外方位状态不会进入基础状态查看器", () => {
  const grid = normalizeSpriteGrid({
    formatVersion: "v2",
    rows: 11,
    states: [
      ...normalizeSpriteGrid().states,
      { id: "look-a", label: "方位 A", row: 9, frames: 8, frameDuration: 100 },
      { id: "look-b", label: "方位 B", row: 10, frames: 8, frameDuration: 100 },
    ],
  });

  assert.equal(grid.rows, 11);
  assert.equal(grid.states.length, 9);
  assert.equal(grid.states.some((state) => state.row >= 9), false);
});
