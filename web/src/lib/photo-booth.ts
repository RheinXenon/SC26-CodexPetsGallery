import type { PhotoBackground, Pet } from "./types";
import { requestImage } from "./media";

export const PHOTO_MIN = 1;
export const PHOTO_MAX = 12;

export const PHOTO_BACKGROUNDS: PhotoBackground[] = [
  { id: "sky", label: "晴空", type: "gradient", from: "#dbeafe", to: "#93c5fd" },
  { id: "cloud", label: "云白", type: "gradient", from: "#f8fafc", to: "#e2e8f0" },
  { id: "mint", label: "薄荷", type: "gradient", from: "#d1fae5", to: "#6ee7b7" },
  { id: "sunset", label: "暮色", type: "gradient", from: "#ffedd5", to: "#fdba74" },
  { id: "lavender", label: "薄紫", type: "gradient", from: "#ede9fe", to: "#c4b5fd" },
];

function layoutSlots(count: number, width: number, height: number) {
  const groundY = height * 0.78;
  if (count <= 0) return [] as Array<{ x: number; y: number; size: number }>;

  if (count <= 5) {
    const size = Math.min(210, width / (count + 0.8));
    const total = count * size;
    const startX = (width - total) / 2 + size / 2;
    return Array.from({ length: count }, (_, index) => ({
      x: startX + index * size,
      y: groundY,
      size,
    }));
  }

  const topCount = Math.ceil(count / 2);
  const bottomCount = count - topCount;
  const topSize = Math.min(170, width / (topCount + 0.9));
  const bottomSize = Math.min(190, width / (bottomCount + 0.8));
  const topY = groundY - topSize * 0.72;
  const bottomY = groundY + 8;
  const topStart = (width - topCount * topSize) / 2 + topSize / 2;
  const bottomStart = (width - bottomCount * bottomSize) / 2 + bottomSize / 2;

  return [
    ...Array.from({ length: topCount }, (_, index) => ({
      x: topStart + index * topSize,
      y: topY,
      size: topSize,
    })),
    ...Array.from({ length: bottomCount }, (_, index) => ({
      x: bottomStart + index * bottomSize,
      y: bottomY,
      size: bottomSize,
    })),
  ];
}

function fillBackground(
  ctx: CanvasRenderingContext2D,
  background: PhotoBackground,
  width: number,
  height: number,
  image?: HTMLImageElement | null,
) {
  if (background.type === "image" && image) {
    ctx.drawImage(image, 0, 0, width, height);
    return;
  }

  if (background.type === "gradient") {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, background.from);
    gradient.addColorStop(1, background.to);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Soft ground band.
    const ground = ctx.createLinearGradient(0, height * 0.62, 0, height);
    ground.addColorStop(0, "rgba(255,255,255,0)");
    ground.addColorStop(1, "rgba(20,24,22,0.12)");
    ctx.fillStyle = ground;
    ctx.fillRect(0, height * 0.62, width, height * 0.38);

    if (background.id === "sky") {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 5; i += 1) {
        const x = 120 + i * 280;
        const y = 90 + (i % 2) * 40;
        ctx.beginPath();
        ctx.ellipse(x, y, 70, 28, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 40, y + 8, 50, 22, 0, 0, Math.PI * 2);
        ctx.ellipse(x - 36, y + 10, 44, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  ctx.fillStyle = "#eef2ee";
  ctx.fillRect(0, 0, width, height);
}

export async function composeGroupPhoto({
  pets,
  background,
  showNames = true,
  width = 1600,
  height = 900,
}: {
  pets: Pet[];
  background: PhotoBackground;
  showNames?: boolean;
  width?: number;
  height?: number;
}) {
  if (pets.length < PHOTO_MIN || pets.length > PHOTO_MAX) {
    throw new Error(`合影人数需在 ${PHOTO_MIN}–${PHOTO_MAX} 之间`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");

  let bgImage: HTMLImageElement | null = null;
  if (background.type === "image") {
    bgImage = await requestImage(background.src, { anonymous: true });
  }
  fillBackground(ctx, background, width, height, bgImage);

  const slots = layoutSlots(pets.length, width, height);
  const posters = await Promise.all(
    pets.map(async (pet) => {
      if (!pet.posterUrl) throw new Error(`${pet.petName} 缺少可导出的预览图`);
      // Same-origin posters only — never draw external full spritesheets.
      const url = new URL(pet.posterUrl, window.location.href);
      if (url.origin !== window.location.origin) {
        throw new Error(`${pet.petName} 的预览图不是同源资源，无法安全导出`);
      }
      return requestImage(url.href);
    }),
  );

  posters.forEach((image, index) => {
    const slot = slots[index];
    const drawHeight = slot.size * (image.naturalHeight / image.naturalWidth || 208 / 192);
    const x = slot.x - slot.size / 2;
    const y = slot.y - drawHeight;

    ctx.save();
    ctx.shadowColor = "rgba(20,24,22,0.28)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, x, y, slot.size, drawHeight);
    ctx.restore();

    if (showNames) {
      const label = pets[index].petName;
      ctx.font = `600 ${Math.max(16, Math.floor(slot.size * 0.12))}px "Segoe UI", "PingFang SC", sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const padX = 12;
      const padY = 8;
      const boxW = textWidth + padX * 2;
      const boxH = Math.max(28, slot.size * 0.16);
      const boxX = slot.x - boxW / 2;
      const boxY = slot.y + 8;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 999);
      ctx.fill();
      ctx.fillStyle = "#141816";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, slot.x, boxY + boxH / 2 + 0.5);
      void padY;
    }
  });

  // Brand watermark.
  ctx.fillStyle = "rgba(20,24,22,0.55)";
  ctx.font = '600 22px "Segoe UI", "PingFang SC", sans-serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("SC26 宠物画廊 · 合影", 36, height - 28);

  return canvas;
}

export async function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("导出失败");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
