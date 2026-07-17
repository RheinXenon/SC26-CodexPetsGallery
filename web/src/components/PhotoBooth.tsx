import { useMemo, useState } from "preact/hooks";
import { KNOWN_GROUPS, normalizeGroupNumber } from "../lib/gallery-filter";
import {
  PHOTO_BACKGROUNDS,
  PHOTO_MAX,
  PHOTO_MIN,
  composeGroupPhoto,
  downloadCanvasPng,
} from "../lib/photo-booth";
import type { Pet, PhotoBackground } from "../lib/types";
import { safeExternalUrl } from "../lib/media";

type Props = {
  open: boolean;
  allPets: Pet[];
  selectedIds: string[];
  onClose: () => void;
  onChangeSelected: (ids: string[]) => void;
  onExitSelectMode: () => void;
};

export function PhotoBooth({
  open,
  allPets,
  selectedIds,
  onClose,
  onChangeSelected,
  onExitSelectMode,
}: Props) {
  const [backgroundId, setBackgroundId] = useState(PHOTO_BACKGROUNDS[0].id);
  const [groupInput, setGroupInput] = useState("");
  const [showNames, setShowNames] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const selectedPets = useMemo(
    () => selectedIds
      .map((id) => allPets.find((pet) => pet.id === id))
      .filter(Boolean) as Pet[],
    [allPets, selectedIds],
  );

  const background = PHOTO_BACKGROUNDS.find((item) => item.id === backgroundId) ?? PHOTO_BACKGROUNDS[0];

  if (!open) return null;

  function removePet(id: string) {
    onChangeSelected(selectedIds.filter((item) => item !== id));
  }

  function clearAll() {
    onChangeSelected([]);
    setMessage(null);
    setPreviewUrl(null);
  }

  function addGroup() {
    const group = normalizeGroupNumber(groupInput);
    if (!group) {
      setMessage("请输入 1–33 的分组数字");
      return;
    }
    const groupPets = allPets.filter((pet) => normalizeGroupNumber(pet.group) === group);
    if (groupPets.length === 0) {
      setMessage(`第 ${group} 组暂时没有可合影的宠物`);
      return;
    }
    const merged = [...selectedIds];
    for (const pet of groupPets) {
      if (!merged.includes(pet.id)) merged.push(pet.id);
    }
    if (merged.length > PHOTO_MAX) {
      setMessage(`合影最多 ${PHOTO_MAX} 只，已尽量加入第 ${group} 组，请再手动调整`);
      onChangeSelected(merged.slice(0, PHOTO_MAX));
      return;
    }
    onChangeSelected(merged);
    setMessage(`已加入第 ${group} 组 ${groupPets.length} 只宠物`);
  }

  async function renderPreview() {
    setBusy(true);
    setMessage(null);
    try {
      if (selectedPets.length < PHOTO_MIN) throw new Error(`请至少选择 ${PHOTO_MIN} 只宠物`);
      if (selectedPets.some((pet) => !pet.posterUrl || !safeExternalUrl(pet.posterUrl))) {
        throw new Error("部分宠物缺少同源预览图，暂时无法合影");
      }
      const canvas = await composeGroupPhoto({
        pets: selectedPets,
        background: background as PhotoBackground,
        showNames,
      });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = canvas.toDataURL("image/png");
      setPreviewUrl(url);
      setMessage("预览已生成，可以导出分享");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function exportPng() {
    setBusy(true);
    setMessage(null);
    try {
      const canvas = await composeGroupPhoto({
        pets: selectedPets,
        background: background as PhotoBackground,
        showNames,
      });
      await downloadCanvasPng(canvas, "sc26-pets-photo.png");
      setMessage("已开始下载合影 PNG");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[1.75rem] border border-line bg-white shadow-[var(--shadow-panel)] sm:max-h-[min(920px,calc(100dvh-2rem))] sm:rounded-[1.75rem]">
        <header className="flex items-center justify-between border-b border-line px-4 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand">Photo Booth</p>
            <h2 className="text-xl font-extrabold tracking-tight">宠物合影</h2>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-xl text-ink-soft transition hover:border-brand/30 hover:text-brand"
            aria-label="关闭合影"
            onClick={() => {
              onClose();
              onExitSelectMode();
            }}
          >
            ×
          </button>
        </header>

        <div className="grid flex-1 gap-0 overflow-auto lg:grid-cols-[0.95fr_1.05fr]">
          <section className="space-y-4 border-b border-line p-4 sm:p-6 lg:border-b-0 lg:border-r">
            <p className="text-sm leading-6 text-muted">
              在画廊中点选宠物，或按组一键加入。最多 {PHOTO_MAX} 只。导出使用同源封面图，避免跨域污染。
            </p>

            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-[8rem] flex-1 flex-col gap-1.5 text-sm">
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">按组加入</span>
                <input
                  className="rounded-2xl border border-line bg-canvas/60 px-3 py-2.5 outline-none transition focus:border-brand/40 focus:bg-white focus:ring-4 focus:ring-brand/10"
                  list="photo-group-suggestions"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="1-33"
                  value={groupInput}
                  onInput={(event) => setGroupInput((event.target as HTMLInputElement).value.replace(/\D/g, ""))}
                />
                <datalist id="photo-group-suggestions">
                  {KNOWN_GROUPS.map((group) => <option key={group} value={group} />)}
                </datalist>
              </label>
              <button
                type="button"
                className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(59,130,246,0.25)] hover:bg-brand-dark"
                onClick={addGroup}
              >
                加入该组
              </button>
              <button
                type="button"
                className="rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink-soft hover:border-brand/30"
                onClick={clearAll}
              >
                清空
              </button>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">已选 {selectedPets.length}/{PHOTO_MAX}</h3>
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={showNames}
                    onChange={(event) => setShowNames((event.target as HTMLInputElement).checked)}
                  />
                  显示名牌
                </label>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {selectedPets.length === 0 ? (
                  <p className="text-sm text-muted">还没有选择宠物。关闭此面板后可在画廊勾选。</p>
                ) : selectedPets.map((pet) => (
                  <div key={pet.id} className="relative w-20 shrink-0 rounded-2xl border border-line bg-canvas/50 p-1.5">
                    {pet.posterUrl ? (
                      <img src={pet.posterUrl} alt={pet.petName} className="pixelated mx-auto h-16 w-16 object-contain" />
                    ) : (
                      <div className="grid h-16 place-items-center text-[10px] text-muted">无图</div>
                    )}
                    <p className="truncate px-1 text-center text-[11px] font-medium">{pet.petName}</p>
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] text-white"
                      aria-label={`移除 ${pet.petName}`}
                      onClick={() => removePet(pet.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">背景</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PHOTO_BACKGROUNDS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`overflow-hidden rounded-2xl border p-2 text-left transition ${
                      item.id === backgroundId ? "border-brand ring-2 ring-brand/15" : "border-line hover:border-brand/25"
                    }`}
                    onClick={() => setBackgroundId(item.id)}
                  >
                    <span
                      className="mb-2 block h-12 rounded-xl"
                      style={item.type === "gradient"
                        ? { background: `linear-gradient(180deg, ${item.from}, ${item.to})` }
                        : undefined}
                    />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-[1.5rem] border border-line bg-canvas">
              {previewUrl ? (
                <img src={previewUrl} alt="合影预览" className="max-h-[min(52vh,420px)] w-full object-contain" />
              ) : (
                <p className="px-6 text-center text-sm text-muted">选择宠物并生成预览后，会显示在这里</p>
              )}
            </div>
            {message ? <p className="text-sm text-ink-soft">{message}</p> : null}
            <div className="sticky bottom-0 flex flex-wrap gap-2 bg-white pt-1">
              <button
                type="button"
                className="rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold text-ink-soft disabled:opacity-50"
                disabled={busy || selectedPets.length === 0}
                onClick={renderPreview}
              >
                {busy ? "处理中…" : "生成预览"}
              </button>
              <button
                type="button"
                className="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(59,130,246,0.25)] hover:bg-brand-dark disabled:opacity-50"
                disabled={busy || selectedPets.length === 0}
                onClick={exportPng}
              >
                导出 PNG
              </button>
              <button
                type="button"
                className="rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold text-ink-soft"
                onClick={onClose}
              >
                返回选宠
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
