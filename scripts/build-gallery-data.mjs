import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeSpriteGrid, validateSpriteGrid } from "../site/sprite-format.js";

const FIELD_LABELS = {
  nickname: "学员昵称",
  description: "一句话介绍",
  files: "宠物文件",
  consent: "公开展示确认",
};

const PET_TITLE_PREFIX = "[宠物投稿]";
const MAX_SPRITE_BYTES = 10 * 1024 * 1024;
const EXPECTED_SPRITE_FORMATS = new Map([
  ["1536x1872", { formatVersion: "v1", rows: 9 }],
  ["1536x2288", { formatVersion: "v2", rows: 11 }],
]);

const ALLOWED_ATTACHMENT_HOSTS = new Set([
  "user-images.githubusercontent.com",
  "private-user-images.githubusercontent.com",
]);

export function extractFields(body = "") {
  const fields = new Map();
  const headings = [...body.matchAll(/^###\s+(.+?)\s*$/gm)];

  for (const [index, heading] of headings.entries()) {
    const valueStart = heading.index + heading[0].length;
    const valueEnd = headings[index + 1]?.index ?? body.length;
    fields.set(heading[1].trim(), body.slice(valueStart, valueEnd).trim());
  }

  return Object.fromEntries(fields);
}

export function isAllowedGithubAttachment(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;

    if (ALLOWED_ATTACHMENT_HOSTS.has(url.hostname)) return true;
    return url.hostname === "github.com" && url.pathname.startsWith("/user-attachments/");
  } catch {
    return false;
  }
}

export function extractAllowedUrl(value = "") {
  const candidates = value.match(/https:\/\/[^\s<>)\]"']+/g) ?? [];
  return candidates.find(isAllowedGithubAttachment) ?? null;
}

export function extractPetAttachments(value = "") {
  const markdownLinks = [...value.matchAll(/(!?)\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g)]
    .map((match) => ({
      isImage: match[1] === "!",
      name: match[2].trim(),
      url: match[3],
    }));
  const htmlImages = [...value.matchAll(/<img\b[^>]*>/gi)]
    .map((match) => {
      const attributes = new Map();
      for (const attribute of match[0].matchAll(
        /([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi,
      )) {
        attributes.set(attribute[1].toLowerCase(), attribute[2] ?? attribute[3] ?? attribute[4]);
      }
      return {
        isImage: true,
        name: attributes.get("alt") ?? "",
        url: attributes.get("src") ?? "",
      };
    });
  const links = [...markdownLinks, ...htmlImages]
    .map((link) => {
      const { url } = link;
      if (!isAllowedGithubAttachment(url)) return null;

      let pathName = "";
      try {
        pathName = decodeURIComponent(new URL(url).pathname).toLowerCase();
      } catch {
        return null;
      }
      return {
        isImage: link.isImage,
        name: link.name.toLowerCase(),
        pathName,
        url,
      };
    })
    .filter(Boolean);

  const config = links.find((link) => (
    link.name === "pet.json"
    || link.pathName.endsWith("/pet.json")
  ));
  const spritesheet = links.find((link) => (
    link.name === "spritesheet.webp"
    || link.name === "spritesheet"
    || link.pathName.endsWith("/spritesheet.webp")
  )) ?? (() => {
    const unnamedImages = links.filter((link) => link.isImage && link.url !== config?.url);
    return unnamedImages.length === 1 ? unnamedImages[0] : null;
  })();

  if (!config || !spritesheet || config.url === spritesheet.url) return null;
  return {
    petConfigUrl: config.url,
    spritesheetUrl: spritesheet.url,
  };
}

function cleanSingleLine(value, maxLength) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned === "_No response_") return null;
  return cleaned.slice(0, maxLength);
}

export function extractPetName(title = "") {
  const withoutPrefix = title.startsWith(PET_TITLE_PREFIX)
    ? title.slice(PET_TITLE_PREFIX.length)
    : title;
  return cleanSingleLine(withoutPrefix, 80);
}

export function parseSubmission(issue) {
  if (!issue || issue.pull_request || issue.state !== "open" || !issue.user?.login) return null;

  const fields = extractFields(issue.body ?? "");
  const petName = extractPetName(issue.title ?? "");
  const nickname = cleanSingleLine(fields[FIELD_LABELS.nickname] ?? "", 50);
  const description = cleanSingleLine(fields[FIELD_LABELS.description] ?? "", 160);
  const attachments = extractPetAttachments(fields[FIELD_LABELS.files]);
  const hasConsent = /-\s*\[x\]/i.test(fields[FIELD_LABELS.consent] ?? "");

  if (!petName || !nickname || !description || !attachments || !hasConsent) return null;

  return {
    issueNumber: issue.number,
    petName,
    nickname,
    description,
    githubLogin: issue.user.login,
    githubUrl: `https://github.com/${encodeURIComponent(issue.user.login)}`,
    ...attachments,
    issueUrl: issue.html_url,
    updatedAt: issue.updated_at,
  };
}

function readUInt24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

export function readWebpDimensions(source) {
  const bytes = Buffer.from(source);
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "RIFF"
    || bytes.toString("ascii", 8, 12) !== "WEBP") return null;

  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + size > bytes.length) return null;

    if (type === "VP8X" && size >= 10) {
      return {
        width: readUInt24LE(bytes, dataOffset + 4) + 1,
        height: readUInt24LE(bytes, dataOffset + 7) + 1,
      };
    }
    if (type === "VP8L" && size >= 5 && bytes[dataOffset] === 0x2f) {
      const bits = bytes.readUInt32LE(dataOffset + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
    if (type === "VP8 " && size >= 10
      && bytes[dataOffset + 3] === 0x9d
      && bytes[dataOffset + 4] === 0x01
      && bytes[dataOffset + 5] === 0x2a) {
      return {
        width: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }

    offset = dataOffset + size + (size % 2);
  }

  return null;
}

export async function hydrateSubmission(submission, { fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(submission.spritesheetUrl, {
      headers: { Accept: "image/webp" },
    });
    if (!response.ok) return null;

    const declaredSize = Number(response.headers?.get?.("content-length") ?? 0);
    if (declaredSize > MAX_SPRITE_BYTES) return null;
    const source = Buffer.from(await response.arrayBuffer());
    if (source.byteLength > MAX_SPRITE_BYTES) return null;
    const dimensions = readWebpDimensions(source);
    const format = dimensions
      ? EXPECTED_SPRITE_FORMATS.get(`${dimensions.width}x${dimensions.height}`)
      : null;
    if (!format) return null;

    const spriteGrid = normalizeSpriteGrid({
      formatVersion: format.formatVersion,
      columns: 8,
      rows: format.rows,
    });
    if (!validateSpriteGrid(spriteGrid)) return null;

    return {
      ...submission,
      petId: `issue-${submission.issueNumber}`,
      spriteGrid,
    };
  } catch {
    return null;
  }
}

export function selectLatestSubmissions(issues) {
  const latestByAccount = new Map();
  const sorted = [...issues].sort(
    (left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at),
  );

  for (const issue of sorted) {
    const submission = parseSubmission(issue);
    if (!submission || latestByAccount.has(submission.githubLogin)) continue;
    latestByAccount.set(submission.githubLogin, submission);
  }

  return [...latestByAccount.values()];
}

export async function selectLatestValidSubmissions(
  issues,
  { fetchImpl = fetch, onRejected = () => {} } = {},
) {
  const latestByAccount = new Map();
  const sorted = [...issues].sort(
    (left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at),
  );

  for (const issue of sorted) {
    const candidate = parseSubmission(issue);
    if (!candidate) {
      onRejected(issue, "表单字段、附件或公开展示确认不完整");
      continue;
    }
    if (latestByAccount.has(candidate.githubLogin)) {
      onRejected(issue, "同一账号已有更新的有效投稿");
      continue;
    }
    const submission = await hydrateSubmission(candidate, { fetchImpl });
    if (submission) {
      latestByAccount.set(submission.githubLogin, submission);
    } else {
      onRejected(issue, "spritesheet.webp 无法读取、超过 10 MB 或尺寸不符合 v1/v2 标准");
    }
  }

  return [...latestByAccount.values()];
}

async function fetchSubmissionIssues({ repository, label, token, fetchImpl = fetch }) {
  const issues = [];

  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      state: "open",
      labels: label,
      per_page: "100",
      page: String(page),
    });
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}/issues?${query}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub API 请求失败：${response.status} ${response.statusText}`);
    }

    const pageIssues = await response.json();
    issues.push(...pageIssues);
    if (pageIssues.length < 100) break;
  }

  return issues;
}

export async function buildGalleryData({
  rootDir = process.cwd(),
  token = process.env.GITHUB_TOKEN,
  repository = process.env.GITHUB_REPOSITORY,
  fetchImpl = fetch,
} = {}) {
  const configPath = path.join(rootDir, "gallery.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const targetRepository = repository || config.repository;

  if (!token) throw new Error("缺少 GITHUB_TOKEN，无法读取投稿 Issue。");
  if (!targetRepository) throw new Error("缺少仓库地址。");

  const issues = await fetchSubmissionIssues({
    repository: targetRepository,
    label: config.submissionLabel,
    token,
    fetchImpl,
  });
  const rejected = [];
  const pets = await selectLatestValidSubmissions(issues, {
    fetchImpl,
    onRejected: (issue, reason) => rejected.push({ number: issue.number, reason }),
  });
  const data = {
    generatedAt: new Date().toISOString(),
    pets,
  };
  const siteDir = path.join(rootDir, "site");

  await writeFile(path.join(siteDir, "pets.json"), `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(
    path.join(siteDir, "gallery.config.json"),
    `${JSON.stringify({ ...config, repository: targetRepository }, null, 2)}\n`,
  );

  console.log(`读取到 ${issues.length} 条投稿 Issue，接受 ${pets.length} 条，忽略 ${rejected.length} 条。`);
  for (const item of rejected) {
    console.warn(`忽略投稿 #${item.number}：${item.reason}`);
  }

  return data;
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  const emptyPreview = process.argv.includes("--empty");
  buildGalleryData(emptyPreview
    ? {
        token: "local-preview",
        fetchImpl: async () => ({ ok: true, json: async () => [] }),
      }
    : undefined)
    .then((data) => {
      console.log(`已生成 ${data.pets.length} 条有效投稿。`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
