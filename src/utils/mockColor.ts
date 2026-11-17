// src/utils/mockColor.ts
import { FASHION_COLORS, FashionColor } from '../constants/fashionColors';

export const getRandomColor = (): FashionColor => {
  const randomIndex = Math.floor(Math.random() * FASHION_COLORS.length);
  return FASHION_COLORS[randomIndex];
};

export const getNextColor = (currentId?: string): FashionColor => {
  if (!currentId) return FASHION_COLORS[0];
  const currentIndex = FASHION_COLORS.findIndex(c => c.id === currentId);
  const nextIndex = (currentIndex + 1) % FASHION_COLORS.length;
  return FASHION_COLORS[nextIndex];
};

export const getColorByCoordinates = (xRatio: number, yRatio: number): FashionColor => {
  // Generate consistent pseudo-color based on touch ratio on the image
  const seed = Math.abs(Math.sin(xRatio * 10 + yRatio * 20));
  const index = Math.floor(seed * FASHION_COLORS.length) % FASHION_COLORS.length;
  return FASHION_COLORS[index];
};
