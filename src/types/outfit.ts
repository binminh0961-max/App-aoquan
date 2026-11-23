// src/types/outfit.ts
import { FashionColor } from '../constants/fashionColors';

export type OutfitSlotId = 'outerwear' | 'top' | 'bottom' | 'shoes';

// Giữ tương thích ngược với 'accessory' trong các component cũ
export type OutfitSlotKey = OutfitSlotId | 'accessory';

// Giới hạn bộ chọn giới tính chuẩn: chỉ gồm 'male' (Nam) và 'female' (Nữ)
export type SilhouetteStyleType = 'male' | 'female';

export type TopSilhouetteId = 'tshirt' | 'shirt' | 'hoodie' | 'blazer';
export type BottomSilhouetteId = 'wide_pants' | 'jeans' | 'shorts' | 'a_line_skirt';
export type ShoesSilhouetteId = 'sneakers' | 'loafers' | 'boots';

export type SilhouetteId = TopSilhouetteId | BottomSilhouetteId | ShoesSilhouetteId;

export interface SilhouetteOption {
  id: SilhouetteId;
  label: string;
  slotId: OutfitSlotId;
  areaFactor: number;
  iconName: string;
  description: string;
}

export interface OutfitItemState {
  id: OutfitSlotId;
  label: string;
  color: FashionColor;
  silhouette: SilhouetteId;
  locked: boolean;
  isBase?: boolean;
}

export type OutfitSlotsMap = {
  outerwear: OutfitItemState;
  top: OutfitItemState;
  bottom: OutfitItemState;
  shoes: OutfitItemState;
};

export type VisualRatiosMap = {
  outerwear: number;
  top: number;
  bottom: number;
  shoes: number;
};

export type StyleHarmonyMode = 'all' | 'neutral' | 'analogous' | 'complementary';

export type FabricColorGroup = 'neutral' | 'earth' | 'cool' | 'warm' | 'accent';

export type PaletteDisplayGroupId = 'neutral' | 'earth_warm' | 'cool' | 'accent';

export interface OutfitAdvice {
  title: string;
  reason: string;
  isWarning?: boolean;
}

export interface StudioOutfitState {
  isLayering: boolean;
  sourceSlot: OutfitSlotId;
  scannedColor: FashionColor;
  slots: OutfitSlotsMap;
  styleType: SilhouetteStyleType;
  visualRatios: VisualRatiosMap;
  harmonyTitle: string;
  harmonyDescription: string;
  harmonyType: 'neutral' | 'analogous' | 'complementary' | 'triadic' | 'custom';
}

// ================= CÁC TYPE TƯƠNG THÍCH NGƯỢC =================
export interface OutfitProportions {
  topPercent: number;
  bottomPercent: number;
  accessoryPercent: number;
  outerwearPercent?: number;
}

export interface OutfitSlots {
  top: FashionColor;
  bottom: FashionColor;
  accessory: FashionColor;
  outerwear?: FashionColor;
}

export type OutfitStyleId = 'neutral' | 'analogous' | 'complementary' | 'triadic';

export interface OutfitSuggestion {
  id: OutfitStyleId;
  title: string;
  subtitle: string;
  slots: OutfitSlots;
  proportions: OutfitProportions;
}

// ================= CHẤM ĐIỂM 2 MÓN & PRESET STUDIO =================
export interface MatchItemSelection {
  slot: OutfitSlotId;
  color: FashionColor;
}

export interface CompareContext {
  mode: 'pick_second' | 'rescan_item1' | 'rescan_item2';
  item1?: MatchItemSelection;
  item2?: MatchItemSelection;
}

export interface StudioPresetOutfit {
  isLayering: boolean;
  gender: SilhouetteStyleType;
  lockedSlots: OutfitSlotId[];
  colors: Partial<Record<OutfitSlotId, FashionColor>>;
  sourceSlot: OutfitSlotId;
}
