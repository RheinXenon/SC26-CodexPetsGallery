export type SpriteState = {
  id: string;
  label: string;
  row: number;
  frames: number;
  frameDuration: number;
  description?: string;
};

export type SpriteGrid = {
  formatVersion?: string;
  columns: number;
  rows: number;
  defaultState: string;
  states: SpriteState[];
};

export type GalleryConfig = {
  repository: string;
  submissionLabel?: string;
  pageTitle: string;
  eventName: string;
};

export type PetKind = "example" | "submission";

export type Pet = {
  id: string;
  kind: PetKind;
  petName: string;
  nickname: string;
  description: string;
  accent: string;
  spriteUrl: string;
  spriteGrid: SpriteGrid;
  posterUrl?: string | null;
  previewUrl?: string | null;
  previewFrameWidth?: number;
  previewFrameHeight?: number;
  githubLogin?: string;
  githubUrl?: string;
  group?: string | null;
  issueNumber?: number;
  issueUrl?: string;
  petConfigUrl?: string;
  spritesheetUrl?: string;
  configUrl?: string;
  updatedAt?: string;
};

export type DensityMode = "cozy" | "comfortable" | "compact";

export type UrlState = {
  petId: string | null;
  query: string;
  group: string;
  page: number;
};

export type PhotoBackground =
  | { id: string; label: string; type: "gradient"; from: string; to: string }
  | { id: string; label: string; type: "image"; src: string };
