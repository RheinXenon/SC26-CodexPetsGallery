export const GROUP_COUNT = 33;
export const KNOWN_GROUPS = Object.freeze(
  Array.from({ length: GROUP_COUNT }, (_, index) => `第 ${index + 1} 组`),
);
export const UNGROUPED_FILTER = "未填写分组";

export function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-CN");
}

export function matchesSearch(pet, query) {
  if (!query) return true;
  return normalizeSearchText([
    pet.petName,
    pet.nickname,
    pet.githubLogin,
    pet.group,
    pet.description,
    pet.issueNumber,
    pet.kind === "example" ? "示例" : "学员作品",
  ].join(" ")).includes(normalizeSearchText(query));
}

export function matchesGroup(pet, selectedGroup) {
  if (!selectedGroup) return true;
  if (selectedGroup === UNGROUPED_FILTER) {
    return pet.kind === "submission" && !normalizeSearchText(pet.group).trim();
  }
  return normalizeSearchText(pet.group).includes(normalizeSearchText(selectedGroup).trim());
}

export function collectSubmissionGroups(pets) {
  const groups = new Map();
  for (const pet of pets) {
    if (pet.kind !== "submission" || !pet.group) continue;
    const normalized = normalizeSearchText(pet.group).trim();
    if (normalized && !groups.has(normalized)) groups.set(normalized, pet.group.trim());
  }
  return [...groups.values()].sort((left, right) => (
    left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" })
  ));
}
