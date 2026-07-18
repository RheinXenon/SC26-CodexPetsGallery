import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { GalleryTools, Pagination, SiteHeader } from "../components/Chrome";
import { DetailDialog } from "../components/DetailDialog";
import { HeroShowcase } from "../components/HeroShowcase";
import { PetCard } from "../components/PetCard";
import { PhotoBooth } from "../components/PhotoBooth";
import { DEFAULT_CONFIG, loadConfig, loadExamples, loadSubmissions } from "../lib/data";
import { loadDensity, saveDensity } from "../lib/density";
import { matchesGroup, matchesSearch } from "../lib/gallery-filter";
import { reduceMotion } from "../lib/media";
import { PHOTO_MAX } from "../lib/photo-booth";
import { readUrlState, writeUrlState } from "../lib/url-state";
import type { DensityMode, GalleryConfig, Pet } from "../lib/types";

const PAGE_SIZE = 40;

export function App() {
  const initialUrl = useMemo(() => readUrlState(), []);
  const [config, setConfig] = useState<GalleryConfig>(DEFAULT_CONFIG);
  const [allPets, setAllPets] = useState<Pet[]>([]);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>({
    text: "正在叫醒宠物……",
  });
  const [query, setQuery] = useState(initialUrl.query);
  const [group, setGroup] = useState(initialUrl.group);
  const [page, setPage] = useState(initialUrl.page);
  const [density, setDensity] = useState<DensityMode>(() => loadDensity());
  const [activePetId, setActivePetId] = useState<string | null>(initialUrl.petId);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [photoOpen, setPhotoOpen] = useState(false);
  const toolsAnchorRef = useRef<HTMLDivElement>(null);
  const cardFocusRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const configPromise = loadConfig().catch(() => DEFAULT_CONFIG);
      const examplesPromise = loadExamples();
      const submissionsPromise = loadSubmissions();
      let examples: Pet[] = [];
      let submissions = { generatedAt: null as string | null, pets: [] as Pet[] };
      let loadError = false;

      const nextConfig = await configPromise;
      if (cancelled) return;
      setConfig(nextConfig);
      document.title = nextConfig.pageTitle;

      try {
        examples = await examplesPromise;
      } catch {
        loadError = true;
      }

      try {
        submissions = await submissionsPromise;
      } catch {
        loadError = true;
      }

      if (cancelled) return;
      setSubmissionCount(submissions.pets.length);
      setGeneratedAt(submissions.generatedAt);
      setAllPets([...submissions.pets, ...examples]);

      if (loadError) setStatus({ text: "部分数据加载失败，请稍后刷新页面。", error: true });
      else if (submissions.pets.length === 0) setStatus({ text: "还没有真实投稿，先看看三个示例宠物。" });
      else setStatus(null);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPets = useMemo(
    () => allPets.filter((pet) => matchesSearch(pet, query) && matchesGroup(pet, group)),
    [allPets, query, group],
  );

  const pageCount = Math.max(1, Math.ceil(filteredPets.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pagePets = filteredPets.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const activePet = activePetId ? allPets.find((pet) => pet.id === activePetId) ?? null : null;

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    writeUrlState({
      petId: activePetId,
      query,
      group,
      page: safePage,
    });
  }, [activePetId, query, group, safePage]);

  useEffect(() => {
    if (!activePetId) return;
    if (allPets.length === 0) return;
    if (!allPets.some((pet) => pet.id === activePetId)) {
      setActivePetId(null);
    }
  }, [activePetId, allPets]);

  const resultSummary = filteredPets.length === 0
    ? "0 个结果"
    : `显示 ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filteredPets.length)}，共 ${filteredPets.length} 只宠物`;

  function openPet(pet: Pet) {
    cardFocusRef.current = pet.id;
    setActivePetId(pet.id);
  }

  function closePet() {
    setActivePetId(null);
    if (cardFocusRef.current) {
      const button = document.querySelector<HTMLButtonElement>(`[data-pet-id="${cardFocusRef.current}"]`);
      button?.focus();
    }
  }

  function changePage(next: number) {
    setPage(next);
    toolsAnchorRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  function toggleSelect(pet: Pet) {
    setSelectedIds((current) => {
      if (current.includes(pet.id)) return current.filter((id) => id !== pet.id);
      if (current.length >= PHOTO_MAX) return current;
      return [...current, pet.id];
    });
  }

  function updateDensity(mode: DensityMode) {
    setDensity(mode);
    saveDensity(mode);
  }

  return (
    <div className="min-h-screen">
      <SiteHeader
        config={config}
        submissionCount={submissionCount}
        selectMode={selectMode}
        selectedCount={selectedIds.length}
        onToggleSelectMode={() => setSelectMode((value) => !value)}
        onOpenPhotoBooth={() => {
          setSelectMode(true);
          setPhotoOpen(true);
        }}
      />

      <main>
        <HeroShowcase
          pets={allPets}
          eventName={config.eventName}
          submissionCount={submissionCount}
        />

        <div ref={toolsAnchorRef}>
          <GalleryTools
            query={query}
            group={group}
            density={density}
            resultSummary={resultSummary}
            onQueryChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            onGroupChange={(value) => {
              setGroup(value);
              setPage(1);
            }}
            onDensityChange={updateDensity}
          />
        </div>

        <section className="shell py-6 sm:py-8">
          {status ? (
            <div className={`mb-5 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
              status.error
                ? "border-red-200 bg-red-50 text-danger"
                : "border-line bg-white/90 text-ink-soft"
            }`} role="status">
              <span className={`h-2.5 w-2.5 rounded-full ${status.error ? "bg-danger" : "bg-brand"}`} aria-hidden="true" />
              <span>{status.text}</span>
            </div>
          ) : null}

          {selectMode ? (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand/15 bg-gradient-to-r from-brand-soft via-white to-brand-soft/80 px-4 py-3 text-sm text-brand-dark shadow-[0_10px_28px_rgba(59,130,246,0.08)]">
              <span className="font-medium">合影选宠中：点击卡片勾选，最多 {PHOTO_MAX} 只。已选 <strong className="tabular-nums">{selectedIds.length}</strong> 只。</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-full bg-brand px-3.5 py-1.5 font-semibold text-white shadow-[0_8px_16px_rgba(59,130,246,0.25)] transition hover:bg-brand-dark active:scale-[0.98]"
                  onClick={() => setPhotoOpen(true)}
                >
                  进入合影棚
                </button>
                <button
                  type="button"
                  className="rounded-full border border-brand/20 bg-white px-3.5 py-1.5 font-semibold transition hover:border-brand/40 active:scale-[0.98]"
                  onClick={() => setSelectMode(false)}
                >
                  退出选宠
                </button>
              </div>
            </div>
          ) : null}

          <div
            className="gallery-grid"
            data-density={density}
            aria-live="polite"
            aria-busy={status?.text === "正在叫醒宠物……" ? "true" : "false"}
          >
            {pagePets.map((pet, index) => (
              <PetCard
                key={pet.id}
                pet={pet}
                index={index}
                density={density}
                selectMode={selectMode}
                selected={selectedIds.includes(pet.id)}
                onOpen={openPet}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>

          {filteredPets.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted">没有找到匹配的宠物。</p>
          ) : null}

          <Pagination page={safePage} pageCount={pageCount} onChange={changePage} />
        </section>
      </main>

      <footer className="border-t border-line/80 bg-white/50 py-8">
        <div className="shell flex flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium text-ink-soft">SC26 宠物画廊 · Light Dex</span>
          <span>
            {generatedAt
              ? `投稿更新于 ${new Intl.DateTimeFormat("zh-CN", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(generatedAt))}`
              : "本地预览模式"}
          </span>
        </div>
      </footer>

      <DetailDialog pet={activePet} onClose={closePet} />
      <PhotoBooth
        open={photoOpen}
        allPets={allPets}
        selectedIds={selectedIds}
        onClose={() => setPhotoOpen(false)}
        onChangeSelected={setSelectedIds}
        onExitSelectMode={() => setSelectMode(false)}
      />
    </div>
  );
}
