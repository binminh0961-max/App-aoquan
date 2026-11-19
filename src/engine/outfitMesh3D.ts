// src/engine/outfitMesh3D.ts
/**
 * Bộ sinh lưới 3D Tứ giác cao cấp (Stylized 3D Mannequin) cho GPU Skia PictureRecorder
 * - Phân tách 9 bộ phận độc lập cho Hierarchical Part Z-Sorting (triệt tiêu 100% xuyên thấu & nhảy lớp).
 * - Cổ áo khoét cong giải phẫu (thấp mặt trước +Z, cao sau gáy -Z), khớp vai-tay & hông-đùi liền mạch.
 * - Chi tiết nổi (ve áo Blazer, túi Hoodie, dây rút, nẹp cúc) uốn ôm sát mặt cong bề mặt vải (không nổi hộp rời!).
 * - Giày 3D loft liền khối 100% Watertight (không giao cắt cổ giày, mũi bo tròn kiểu Sneaker tối giản).
 * - Tự động kiểm chứng hướng pháp tuyến (Outward / Inward Winding) + Smooth Vertex Normals theo smoothing group.
 */

import type {
  OutfitSlotId,
  SilhouetteId,
  SilhouetteStyleType,
} from '../types/outfit';

export type MeshMaterialKind =
  | 'outerwear'
  | 'top'
  | 'bottom'
  | 'shoes'
  | 'sole_white'
  | 'sole_dark'
  | 'inner_cavity'
  | 'outer_cavity'
  | 'bottom_cavity'
  | 'mannequin_leg'
  | 'accent_light'
  | 'accent_metal';

export type MeshPartId =
  | 'torsoCore'
  | 'outerwearShell'
  | 'hoodBack'
  | 'leftArm'
  | 'rightArm'
  | 'leftLeg'
  | 'rightLeg'
  | 'leftShoe'
  | 'rightShoe';

export interface Quad3D {
  /** 4 chỉ số đỉnh trong mảng positions */
  v0: number;
  v1: number;
  v2: number;
  v3: number;
  /** Pháp tuyến hình học chuẩn hóa của mặt (dùng cho Perspective View-Vector Culling) */
  nx: number;
  ny: number;
  nz: number;
  /** Pháp tuyến mượt trung bình từ 4 đỉnh trong cùng smoothing group (dùng cho Shading trơn mịn) */
  snx: number;
  sny: number;
  snz: number;
  /** Tâm 3D của mặt sau khi chuẩn hóa */
  cx: number;
  cy: number;
  cz: number;
  /** Bộ phận trực thuộc cho Hierarchical Part Z-Sorting tầng 1 */
  partId: MeshPartId;
  /** Lớp sâu nhỏ (`zBias` cộng vào avgZ để chi tiết nổi không z-fighting nhưng KHÔNG xuyên qua lưng!) */
  zBias: number;
  /** true nếu là khoang lòng sâu mặt trong của thân/váy (vẽ trước bắp chân mannequin) */
  isDeepCavity: boolean;
  /** Vật liệu xác định màu gốc */
  material: MeshMaterialKind;
  /** Slot tương ứng cho tap hit-test chọn món */
  slot: OutfitSlotId | null;
  /** Hệ số Ambient Occlusion mềm */
  ao: number;
}

export interface OutfitMesh3D {
  vertexCount: number;
  quadCount: number;
  /** Tọa độ đỉnh phẳng [x0, y0, z0, ...] đã auto-center về (0, 0, 0), chiều cao = 2.8 */
  positions: Float32Array;
  /** Danh sách toàn bộ mặt tứ giác */
  quads: Quad3D[];
  /** Tâm 3D sau chuẩn hóa của từng bộ phận (dùng sắp xếp tầng 1 theo khoảng cách camera) */
  partCenters: Record<MeshPartId, [number, number, number]>;
  /** Vị trí đáy 2 bàn chân sau chuẩn hóa để vẽ 2 bóng tiếp xúc sàn xoay theo giày */
  shoeGroundCenters: {
    left: [number, number, number];
    right: [number, number, number];
  };
  /** Nửa chiều cao sau chuẩn hóa (= 1.4) */
  halfHeight: number;
  /** Y thấp nhất (= -1.4, mặt sàn đế giày) */
  minY: number;
  /** Có cần vẽ ống quần phủ lên cổ giày hay không (wide_pants / jeans) */
  pantsCoverShoes: boolean;
}

/**
 * Chuẩn hóa vector 3D an toàn tuyệt đối: không bao giờ chia cho 0 hoặc sinh NaN
 */
export function safeNormalize(
  x: number,
  y: number,
  z: number
): [number, number, number] {
  const lenSq = x * x + y * y + z * z;
  if (!Number.isFinite(lenSq) || lenSq < 1e-12) {
    return [0, 0, 1];
  }
  const len = Math.sqrt(lenSq);
  if (len < 1e-6) {
    return [0, 0, 1];
  }
  return [x / len, y / len, z / len];
}

interface RingDef {
  y: number;
  rx: number;
  rz: number;
  xOff?: number;
  zOff?: number;
  ao?: number;
  waveAmp?: number;
  waveFreq?: number;
  chestBulge?: number;
  backArch?: number;
  frontGap?: number;
  /** Độ võng cổ áo mặt trước (+Z hạ thấp tự nhiên, -Z gáy cao hơn) */
  neckDrop?: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * Nội suy đường cong Spline Catmull-Rom mượt dọc theo biên dạng cơ thể
 */
function sampleSplineRings(controls: RingDef[], targetBands: number): RingDef[] {
  const n = controls.length;
  if (n < 2 || targetBands < 1) return controls;

  const out: RingDef[] = [];
  for (let s = 0; s <= targetBands; s++) {
    const u = (s / targetBands) * (n - 1);
    const seg = Math.min(n - 2, Math.floor(u));
    const t = u - seg;

    const c0 = controls[Math.max(0, seg - 1)];
    const c1 = controls[seg];
    const c2 = controls[seg + 1];
    const c3 = controls[Math.min(n - 1, seg + 2)];

    const interp = (getter: (r: RingDef) => number, minVal?: number): number => {
      const val = catmullRom(getter(c0), getter(c1), getter(c2), getter(c3), t);
      return minVal !== undefined ? Math.max(minVal, val) : val;
    };

    out.push({
      y: interp(r => r.y),
      rx: interp(r => r.rx, 0.006),
      rz: interp(r => r.rz, 0.006),
      xOff: interp(r => r.xOff ?? 0),
      zOff: interp(r => r.zOff ?? 0),
      ao: Math.max(0.5, Math.min(1.05, interp(r => r.ao ?? 1.0))),
      waveAmp: interp(r => r.waveAmp ?? 0, 0),
      waveFreq: c1.waveFreq ?? c2.waveFreq ?? 8,
      chestBulge: interp(r => r.chestBulge ?? 0, 0),
      backArch: interp(r => r.backArch ?? 0),
      frontGap: interp(r => r.frontGap ?? 0, 0),
      neckDrop: interp(r => r.neckDrop ?? 0, 0),
    });
  }
  return out;
}

/** Đánh giá tọa độ 3D trên mặt cắt vòng elip tại góc theta */
function evalRingPoint(
  r: RingDef,
  theta: number,
  sq: number,
  radialScale = 1.0,
  radialOffset = 0
): [number, number, number] {
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  let rx = r.rx * (1 + sq * Math.cos(4 * theta)) * radialScale + radialOffset;
  let rz = r.rz * (1 - sq * Math.cos(4 * theta)) * radialScale + radialOffset;

  const waveAmp = r.waveAmp ?? 0;
  if (waveAmp > 0) {
    const w = Math.sin(theta * (r.waveFreq ?? 8)) * waveAmp;
    rx += w;
    rz += w;
  }
  const chestBulge = r.chestBulge ?? 0;
  if (chestBulge > 0 && cosT > 0.05) {
    rz +=
      Math.pow(cosT, 2.0) * Math.sin(Math.abs(sinT) * Math.PI) * chestBulge;
  }
  const backArch = r.backArch ?? 0;
  if (backArch !== 0 && cosT < -0.1) {
    rz += Math.pow(-cosT, 1.8) * backArch;
  }

  let y = r.y;
  const neckDrop = r.neckDrop ?? 0;
  if (neckDrop > 0) {
    if (cosT > 0) {
      y -= Math.pow(cosT, 1.55) * neckDrop;
    } else {
      y += Math.pow(-cosT, 1.6) * neckDrop * 0.25;
    }
  }

  return [(r.xOff ?? 0) + sinT * rx, y, (r.zOff ?? 0) + cosT * rz];
}

interface RawQuad {
  v0: number;
  v1: number;
  v2: number;
  v3: number;
  partId: MeshPartId;
  zBias: number;
  isDeepCavity: boolean;
  material: MeshMaterialKind;
  slot: OutfitSlotId | null;
  ao: number;
  smoothGroup: number;
}

class SmoothQuadBuilder {
  private pos: number[] = [];
  private rawQuads: RawQuad[] = [];
  private nextSmoothGroup = 1;

  public allocSmoothGroup(): number {
    return this.nextSmoothGroup++;
  }

  private addVertex(x: number, y: number, z: number): number {
    const id = this.pos.length / 3;
    this.pos.push(
      Number.isFinite(x) ? x : 0,
      Number.isFinite(y) ? y : 0,
      Number.isFinite(z) ? z : 0
    );
    return id;
  }

  /**
   * Thêm mặt tứ giác KÈM TỰ ĐỘNG KIỂM CHỨNG HƯỚNG PHÁP TUYẾN (Outward / Inward Winding Check)
   */
  private addVerifiedQuad(
    v0: number,
    v1: number,
    v2: number,
    v3: number,
    refX: number,
    refY: number,
    refZ: number,
    expectInward: boolean,
    partId: MeshPartId,
    zBias: number,
    isDeepCavity: boolean,
    material: MeshMaterialKind,
    slot: OutfitSlotId | null,
    ao: number,
    smoothGroup: number
  ) {
    const p0x = this.pos[v0 * 3];
    const p0y = this.pos[v0 * 3 + 1];
    const p0z = this.pos[v0 * 3 + 2];
    const p1x = this.pos[v1 * 3];
    const p1y = this.pos[v1 * 3 + 1];
    const p1z = this.pos[v1 * 3 + 2];
    const p2x = this.pos[v2 * 3];
    const p2y = this.pos[v2 * 3 + 1];
    const p2z = this.pos[v2 * 3 + 2];
    const p3x = this.pos[v3 * 3];
    const p3y = this.pos[v3 * 3 + 1];
    const p3z = this.pos[v3 * 3 + 2];

    const d1x = p2x - p0x;
    const d1y = p2y - p0y;
    const d1z = p2z - p0z;
    const d2x = p3x - p1x;
    const d2y = p3y - p1y;
    const d2z = p3z - p1z;

    const nx = d1y * d2z - d1z * d2y;
    const ny = d1z * d2x - d1x * d2z;
    const nz = d1x * d2y - d1y * d2x;

    const qcx = (p0x + p1x + p2x + p3x) * 0.25;
    const qcy = (p0y + p1y + p2y + p3y) * 0.25;
    const qcz = (p0z + p1z + p2z + p3z) * 0.25;

    const outDot = nx * (qcx - refX) + ny * (qcy - refY) + nz * (qcz - refZ);
    const shouldFlip = expectInward ? outDot > 0 : outDot < 0;

    this.rawQuads.push({
      v0,
      v1: shouldFlip ? v3 : v1,
      v2,
      v3: shouldFlip ? v1 : v3,
      partId,
      zBias,
      isDeepCavity,
      material,
      slot,
      ao,
      smoothGroup,
    });
  }

  private addDirectedQuad(
    v0: number,
    v1: number,
    v2: number,
    v3: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    partId: MeshPartId,
    zBias: number,
    isDeepCavity: boolean,
    material: MeshMaterialKind,
    slot: OutfitSlotId | null,
    ao: number,
    smoothGroup: number
  ) {
    const p0x = this.pos[v0 * 3];
    const p0y = this.pos[v0 * 3 + 1];
    const p0z = this.pos[v0 * 3 + 2];
    const p1x = this.pos[v1 * 3];
    const p1y = this.pos[v1 * 3 + 1];
    const p1z = this.pos[v1 * 3 + 2];
    const p2x = this.pos[v2 * 3];
    const p2y = this.pos[v2 * 3 + 1];
    const p2z = this.pos[v2 * 3 + 2];
    const p3x = this.pos[v3 * 3];
    const p3y = this.pos[v3 * 3 + 1];
    const p3z = this.pos[v3 * 3 + 2];

    const d1x = p2x - p0x;
    const d1y = p2y - p0y;
    const d1z = p2z - p0z;
    const d2x = p3x - p1x;
    const d2y = p3y - p1y;
    const d2z = p3z - p1z;

    const nx = d1y * d2z - d1z * d2y;
    const ny = d1z * d2x - d1x * d2z;
    const nz = d1x * d2y - d1y * d2x;

    const flip = nx * dirX + ny * dirY + nz * dirZ < 0;
    this.rawQuads.push({
      v0,
      v1: flip ? v3 : v1,
      v2,
      v3: flip ? v1 : v3,
      partId,
      zBias,
      isDeepCavity,
      material,
      slot,
      ao,
      smoothGroup,
    });
  }

  /**
   * Dựng ống 3D mượt với kiểm chứng hướng pháp tuyến tự động & hỗ trợ khoét cổ áo tự nhiên
   */
  public loftTube(
    rings: RingDef[],
    radialSegments: number,
    material: MeshMaterialKind,
    slot: OutfitSlotId | null,
    partId: MeshPartId,
    options?: {
      zBias?: number;
      isDeepCavity?: boolean;
      openFront?: boolean;
      inward?: boolean;
      superEllipse?: number;
      capTop?: boolean;
      capBottom?: boolean;
      uStart?: number;
      uEnd?: number;
    }
  ): { grid: number[][]; rings: RingDef[] } {
    const zBias = options?.zBias ?? 0;
    const isDeepCavity = options?.isDeepCavity ?? false;
    const openFront = options?.openFront ?? false;
    const inward = options?.inward ?? false;
    const sq = options?.superEllipse ?? 0.018;
    const uStart = options?.uStart ?? 0;
    const uEnd = options?.uEnd ?? 1;

    const ringCount = rings.length;
    const smoothGroup = this.allocSmoothGroup();
    const cols = openFront ? radialSegments + 1 : radialSegments;
    const grid: number[][] = [];

    for (let i = 0; i < ringCount; i++) {
      const r = rings[i];
      const gap = openFront ? Math.max(0.18, r.frontGap ?? 0.42) : 0;
      const row: number[] = [];

      for (let j = 0; j < cols; j++) {
        const localU = j / radialSegments;
        const u = uStart + localU * (uEnd - uStart);
        const theta = openFront
          ? gap + u * (Math.PI * 2 - gap * 2)
          : u * Math.PI * 2;
        const [vx, vy, vz] = evalRingPoint(r, theta, sq);
        row.push(this.addVertex(vx, vy, vz));
      }
      grid.push(row);
    }

    for (let i = 0; i < ringCount - 1; i++) {
      const rLow = rings[i];
      const rHigh = rings[i + 1];
      const bandAo = ((rLow.ao ?? 1.0) + (rHigh.ao ?? 1.0)) * 0.5;
      const refX = ((rLow.xOff ?? 0) + (rHigh.xOff ?? 0)) * 0.5;
      const refY = (rLow.y + rHigh.y) * 0.5;
      const refZ = ((rLow.zOff ?? 0) + (rHigh.zOff ?? 0)) * 0.5;

      for (let j = 0; j < radialSegments; j++) {
        const jNext = openFront ? j + 1 : (j + 1) % radialSegments;
        this.addVerifiedQuad(
          grid[i][j],
          grid[i][jNext],
          grid[i + 1][jNext],
          grid[i + 1][j],
          refX,
          refY,
          refZ,
          inward,
          partId,
          zBias,
          isDeepCavity,
          material,
          slot,
          bandAo,
          smoothGroup
        );
      }
    }

    if (options?.capTop && !openFront) {
      const capGroup = this.allocSmoothGroup();
      const top = rings[ringCount - 1];
      const topRow = grid[ringCount - 1];
      const dirY = inward ? -1 : 1;
      const centerIdx = this.addVertex(
        top.xOff ?? 0,
        top.y + (inward ? -0.003 : 0.006),
        top.zOff ?? 0
      );
      const step = radialSegments >= 12 ? 2 : 1;
      for (let j = 0; j < radialSegments; j += step) {
        const j1 = (j + 1) % radialSegments;
        const j2 = (j + step) % radialSegments;
        this.addDirectedQuad(
          topRow[j],
          topRow[j1],
          step === 2 ? topRow[j2] : centerIdx,
          centerIdx,
          0,
          dirY,
          0,
          partId,
          zBias,
          isDeepCavity,
          material,
          slot,
          (top.ao ?? 0.94) * (inward ? 0.88 : 1.0),
          capGroup
        );
      }
    }

    if (options?.capBottom && !openFront) {
      const capGroup = this.allocSmoothGroup();
      const bot = rings[0];
      const botRow = grid[0];
      const dirY = inward ? 1 : -1;
      const centerIdx = this.addVertex(
        bot.xOff ?? 0,
        bot.y + (inward ? 0.003 : -0.003),
        bot.zOff ?? 0
      );
      const step = radialSegments >= 12 ? 2 : 1;
      for (let j = 0; j < radialSegments; j += step) {
        const j1 = (j + 1) % radialSegments;
        const j2 = (j + step) % radialSegments;
        this.addDirectedQuad(
          botRow[j],
          botRow[j1],
          step === 2 ? botRow[j2] : centerIdx,
          centerIdx,
          0,
          dirY,
          0,
          partId,
          zBias,
          isDeepCavity,
          material,
          slot,
          (bot.ao ?? 0.88) * 0.85,
          capGroup
        );
      }
    }

    return { grid, rings };
  }

  /**
   * Nối vành độ dày mép vải kín khít giữa 2 dải lưới (vạt mở áo khoác, gấu áo/váy/tay)
   */
  public bridgeEdgeStrip(
    edgeA: number[],
    edgeB: number[],
    dirX: number,
    dirY: number,
    dirZ: number,
    partId: MeshPartId,
    zBias: number,
    material: MeshMaterialKind,
    slot: OutfitSlotId | null,
    ao: number
  ) {
    const count = Math.min(edgeA.length, edgeB.length);
    const group = this.allocSmoothGroup();
    for (let i = 0; i < count - 1; i++) {
      this.addDirectedQuad(
        edgeA[i],
        edgeB[i],
        edgeB[i + 1],
        edgeA[i + 1],
        dirX,
        dirY,
        dirZ,
        partId,
        zBias,
        false,
        material,
        slot,
        ao,
        group
      );
    }
  }

  /**
   * Dựng miếng chi tiết nổi UỐN CONG ÔM SÁT ĐÚNG BỀ MẶT THÂN ÁO (Ve áo Blazer, Túi áo, Nẹp cúc, Dây rút)
   * Tuyệt đối KHÔNG nổi hộp rời ở góc nhìn ngang 90° và KHÔNG xuyên mặt lưng ở góc nhìn 180°!
   */
  public addConformingPatch(
    rings: RingDef[],
    sq: number,
    thetaStartFn: (t: number, ring: RingDef) => number,
    thetaEndFn: (t: number, ring: RingDef) => number,
    radialOffset: number,
    cols: number,
    material: MeshMaterialKind,
    slot: OutfitSlotId | null,
    partId: MeshPartId,
    options?: { zBias?: number; ao?: number; sideBevel?: boolean }
  ) {
    const n = rings.length;
    if (n < 2) return;
    const zBias = options?.zBias ?? 0.014;
    const ao = options?.ao ?? 1.02;
    const smoothGroup = this.allocSmoothGroup();

    const frontGrid: number[][] = [];
    const baseGrid: number[][] = [];

    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const r = rings[i];
      const th0 = thetaStartFn(t, r);
      const th1 = thetaEndFn(t, r);
      const fRow: number[] = [];
      const bRow: number[] = [];
      for (let j = 0; j <= cols; j++) {
        const u = j / cols;
        const theta = th0 + u * (th1 - th0);
        const [fx, fy, fz] = evalRingPoint(r, theta, sq, 1.0, radialOffset);
        fRow.push(this.addVertex(fx, fy, fz));
        if (options?.sideBevel) {
          const [bx, by, bz] = evalRingPoint(r, theta, sq, 1.0, 0.001);
          bRow.push(this.addVertex(bx, by, bz));
        }
      }
      frontGrid.push(fRow);
      if (options?.sideBevel) baseGrid.push(bRow);
    }

    // Mặt ngoài uốn cong (Outward Normal kiểm chứng theo tâm vòng cắt -> tự động bị cull ở góc nhìn sau 180°!)
    for (let i = 0; i < n - 1; i++) {
      const rLow = rings[i];
      const rHigh = rings[i + 1];
      const refX = ((rLow.xOff ?? 0) + (rHigh.xOff ?? 0)) * 0.5;
      const refY = (rLow.y + rHigh.y) * 0.5;
      const refZ = ((rLow.zOff ?? 0) + (rHigh.zOff ?? 0)) * 0.5;

      for (let j = 0; j < cols; j++) {
        this.addVerifiedQuad(
          frontGrid[i][j],
          frontGrid[i][j + 1],
          frontGrid[i + 1][j + 1],
          frontGrid[i + 1][j],
          refX,
          refY,
          refZ,
          false,
          partId,
          zBias,
          false,
          material,
          slot,
          ao,
          smoothGroup
        );
      }
    }

    // Viền cạnh nổi mỏng bám kín vào mặt vải thân áo (tạo độ dày thật ở góc nhìn 3/4 & 90°)
    if (options?.sideBevel && baseGrid.length === n) {
      const edgeLeftF = frontGrid.map(row => row[0]);
      const edgeLeftB = baseGrid.map(row => row[0]);
      this.bridgeEdgeStrip(edgeLeftB, edgeLeftF, -1, 0, 0.2, partId, zBias - 0.002, material, slot, ao * 0.9);

      const edgeRightF = frontGrid.map(row => row[cols]);
      const edgeRightB = baseGrid.map(row => row[cols]);
      this.bridgeEdgeStrip(edgeRightF, edgeRightB, 1, 0, 0.2, partId, zBias - 0.002, material, slot, ao * 0.9);
    }
  }

  /**
   * Dựng tay áo có Chỏm Vai Tròn (Shoulder Cap) nằm gọn ngang đường dốc vai thân áo
   * (KHÔNG nhô u lên trên vai và KHÔNG chọc ngược vào ngực trước ở góc 3/4!).
   */
  public addSculptedArm(
    side: -1 | 1,
    shoulderW: number,
    shoulderY: number,
    length: number,
    topR: number,
    endR: number,
    material: MeshMaterialKind,
    cavityMat: MeshMaterialKind,
    slot: OutfitSlotId,
    partId: MeshPartId
  ) {
    const cuffY = shoulderY - length;
    const armOutX = (t: number) =>
      side * (shoulderW * 0.96 + t * 0.095 - Math.sin(t * Math.PI) * 0.008);
    const armZ = (t: number) =>
      -0.006 + Math.sin(t * Math.PI * 0.88) * 0.02 + t * 0.02;

    const controls: RingDef[] = [
      // Cổ tay
      { y: cuffY, rx: endR, rz: endR * 0.94, xOff: armOutX(1.0), zOff: armZ(1.0), ao: 0.93 },
      // Cẳng tay dưới
      {
        y: shoulderY - length * 0.72,
        rx: endR + (topR - endR) * 0.34,
        rz: (endR + (topR - endR) * 0.34) * 0.95,
        xOff: armOutX(0.72),
        zOff: armZ(0.72),
        ao: 0.97,
      },
      // Khuỷu tay
      {
        y: shoulderY - length * 0.44,
        rx: endR + (topR - endR) * 0.68,
        rz: (endR + (topR - endR) * 0.68) * 0.96,
        xOff: armOutX(0.44),
        zOff: armZ(0.44),
        ao: 0.99,
      },
      // Bắp tay trên dưới nách
      {
        y: shoulderY - length * 0.16,
        rx: topR * 0.98,
        rz: topR * 0.94,
        xOff: side * (shoulderW * 0.96),
        zOff: -0.005,
        ao: 0.93,
      },
      // Đầu vai ngoài nối mượt độ cong bờ vai thân áo (không lấn sâu qua ngực)
      {
        y: shoulderY - 0.002,
        rx: topR * 0.86,
        rz: topR * 0.86,
        xOff: side * (shoulderW * 0.91),
        zOff: -0.004,
        ao: 0.96,
      },
      // Đỉnh chỏm vai tròn ôm khít mép vai trên (đúng cao độ dốc vai, không gồ cao hơn vai!)
      {
        y: shoulderY + 0.022,
        rx: topR * 0.46,
        rz: topR * 0.5,
        xOff: side * (shoulderW * 0.83),
        zOff: -0.004,
        ao: 0.97,
      },
    ];

    const sampled = sampleSplineRings(controls, 7);
    const { grid } = this.loftTube(sampled, 16, material, slot, partId, {
      capTop: true,
      superEllipse: 0.015,
    });

    // Đóng kín đầu ống tay (Watertight Cuff Liner lùi vào trong 0.006 để không lộ viền đen khi nhìn ngang)
    const cuff = sampled[0];
    const innerLiner = this.loftTube(
      [
        {
          y: cuff.y + 0.006,
          rx: endR * 0.9,
          rz: endR * 0.84,
          xOff: cuff.xOff,
          zOff: cuff.zOff,
          ao: 0.74,
        },
        {
          y: cuff.y + 0.044,
          rx: endR * 0.72,
          rz: endR * 0.68,
          xOff: cuff.xOff,
          zOff: cuff.zOff,
          ao: 0.6,
        },
      ],
      16,
      cavityMat,
      slot,
      partId,
      {
        zBias: -0.01,
        inward: true,
        capTop: true,
      }
    );

    this.bridgeEdgeStrip(
      [...grid[0], grid[0][0]],
      [...innerLiner.grid[0], innerLiner.grid[0][0]],
      0,
      -1,
      0,
      partId,
      0.002,
      material,
      slot,
      0.88
    );
  }

  /**
   * Dựng đôi giày 3D 16 cạnh vòng LOFT LIỀN KHỐI 100% WATERTIGHT (không giao cắt cổ giày, không đốm hở!).
   * Phom Minimalist Sneaker (mũi tròn mịn + đế trắng #F3F3F0 dày đều), Loafer thuôn gọn, hoặc Boot cổ cao.
   */
  public addSculptedShoe(
    side: -1 | 1,
    fx: number,
    shoesShape: SilhouetteId,
    isFemale: boolean,
    partId: MeshPartId
  ) {
    const segs = 16;
    const toeOutYaw = side * 0.055;
    const cosY = Math.cos(toeOutYaw);
    const sinY = Math.sin(toeOutYaw);

    const isLoafer = shoesShape === 'loafers';
    const isBoot = shoesShape === 'boots';
    const isSneaker = !isLoafer && !isBoot;

    const soleMat: MeshMaterialKind = isSneaker ? 'sole_white' : 'sole_dark';
    const soleH = isSneaker ? 0.028 : isLoafer ? 0.014 : isFemale ? 0.017 : 0.026;
    const halfW = isFemale
      ? isLoafer
        ? 0.036
        : 0.041
      : isLoafer
      ? 0.041
      : 0.046;
    const toeLen = isFemale ? 0.128 : 0.142;
    const heelLen = isFemale ? 0.066 : 0.074;
    const fz = 0.022;

    const buildLastRing = (
      yFront: number,
      yBack: number,
      sX: number,
      sToe: number,
      sHeel: number,
      zShift = 0
    ): number[] => {
      const row: number[] = [];
      for (let j = 0; j < segs; j++) {
        const theta = (j / segs) * Math.PI * 2;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);

        // Mũi giày bo tròn tự nhiên kiểu Stan Smith / Common Projects (không nhọn!)
        const zLocal =
          zShift +
          (cosT >= 0 ? cosT * toeLen * sToe : cosT * heelLen * sHeel);
        let wProf = 1.0;
        if (cosT > 0.25) {
          const t = (cosT - 0.25) / 0.75;
          wProf = 1 - (isLoafer ? 0.26 : 0.14) * t * t;
        } else if (cosT < -0.15) {
          const t = (-cosT - 0.15) / 0.85;
          wProf = 1 - 0.15 * t;
        }
        const xLocal = sinT * halfW * sX * wProf;

        // Chuyển cao độ mượt từ mũi giày (+Z) lên cổ chân (-Z)
        const backMix = 0.5 - 0.5 * cosT;
        const y = yFront + (yBack - yFront) * backMix;

        const rx = fx + xLocal * cosY + zLocal * sinY;
        const rz = fz - xLocal * sinY + zLocal * cosY;
        row.push(this.addVertex(rx, y, rz));
      }
      return row;
    };

    const connectRingPair = (
      lowRow: number[],
      highRow: number[],
      refY: number,
      refZ: number,
      mat: MeshMaterialKind,
      ao: number,
      smoothGroup: number,
      zBias = 0
    ) => {
      for (let j = 0; j < segs; j++) {
        const jNext = (j + 1) % segs;
        this.addVerifiedQuad(
          lowRow[j],
          lowRow[jNext],
          highRow[jNext],
          highRow[j],
          fx,
          refY,
          refZ,
          false,
          partId,
          zBias,
          false,
          mat,
          'shoes',
          ao,
          smoothGroup
        );
      }
    };

    // 1. ĐẾ GIÀY LIỀN MẠCH (tách nhóm làm mịn riêng cho đường viền đế sắc nét)
    const soleGroup = this.allocSmoothGroup();
    const soleBot = buildLastRing(0.0, 0.0, 1.02, 1.01, 1.02);
    const soleTop = buildLastRing(soleH, soleH, 1.03, 1.02, 1.03);
    connectRingPair(soleBot, soleTop, soleH * 0.5, fz + 0.02, soleMat, isSneaker ? 0.98 : 0.92, soleGroup);

    // Đóng kín đáy đế giày
    const botCapGroup = this.allocSmoothGroup();
    const botCenter = this.addVertex(fx, 0.0, fz + 0.02);
    for (let j = 0; j < segs; j += 2) {
      this.addDirectedQuad(
        soleBot[j],
        soleBot[(j + 1) % segs],
        soleBot[(j + 2) % segs],
        botCenter,
        0,
        -1,
        0,
        partId,
        -0.005,
        false,
        soleMat,
        'shoes',
        0.74,
        botCapGroup
      );
    }

    // 2. THÂN GIÀY + MU BÀN CHÂN + CỔ GIÀY LIỀN KHỐI 100% (ZERO GIAO CẮT, ZERO ĐỐM HỞ!)
    const upperGroup = this.allocSmoothGroup();
    const r0 = buildLastRing(soleH, soleH, 0.99, 0.99, 0.99);
    const r1 = buildLastRing(
      soleH + (isLoafer ? 0.017 : 0.024),
      soleH + (isLoafer ? 0.032 : 0.044),
      0.96,
      0.95,
      0.95
    );
    const r2 = buildLastRing(
      soleH + (isLoafer ? 0.03 : 0.046),
      soleH + (isLoafer ? 0.048 : 0.068),
      0.88,
      0.74,
      0.86,
      -0.006
    );
    const rAnkleBase = buildLastRing(
      soleH + (isLoafer ? 0.042 : 0.066),
      soleH + (isLoafer ? 0.052 : 0.078),
      0.86,
      0.34,
      0.72,
      -0.018
    );

    connectRingPair(r0, r1, soleH + 0.016, fz + 0.015, 'shoes', 0.97, upperGroup);
    connectRingPair(r1, r2, soleH + 0.04, fz + 0.01, 'shoes', 0.99, upperGroup);
    connectRingPair(r2, rAnkleBase, soleH + 0.06, fz, 'shoes', 1.0, upperGroup);

    let topRing = rAnkleBase;
    let topY = soleH + (isLoafer ? 0.048 : 0.072);

    if (isBoot) {
      const bootMidY = isFemale ? 0.14 : 0.155;
      const bootTopY = isFemale ? 0.19 : 0.212;
      const rBootMid = buildLastRing(bootMidY, bootMidY + 0.004, 0.88, 0.34, 0.68, -0.02);
      const rBootTop = buildLastRing(bootTopY, bootTopY + 0.004, 0.92, 0.35, 0.7, -0.02);
      connectRingPair(rAnkleBase, rBootMid, (topY + bootMidY) * 0.5, fz - 0.018, 'shoes', 0.97, upperGroup);
      connectRingPair(rBootMid, rBootTop, (bootMidY + bootTopY) * 0.5, fz - 0.018, 'shoes', 0.95, upperGroup);
      topRing = rBootTop;
      topY = bootTopY + 0.002;
    } else if (isSneaker) {
      const collarTopY = soleH + 0.088;
      const rCollar = buildLastRing(collarTopY, collarTopY + 0.004, 0.84, 0.32, 0.68, -0.02);
      connectRingPair(rAnkleBase, rCollar, (topY + collarTopY) * 0.5, fz - 0.018, 'shoes', 0.95, upperGroup);
      topRing = rCollar;
      topY = collarTopY + 0.002;
    }

    // Đóng kín cổ giày (màu tối lòng cổ giày) để nhìn từ trên xuống không bị thủng rỗng
    const topCapGroup = this.allocSmoothGroup();
    const topCenter = this.addVertex(fx, topY - 0.004, fz - 0.018);
    for (let j = 0; j < segs; j += 2) {
      this.addDirectedQuad(
        topRing[j],
        topRing[(j + 1) % segs],
        topRing[(j + 2) % segs],
        topCenter,
        0,
        1,
        0,
        partId,
        -0.002,
        false,
        'sole_dark',
        'shoes',
        0.72,
        topCapGroup
      );
    }
  }

  /**
   * Auto-Fit Bounding Box về đúng tâm (0, 0, 0), chuẩn hóa chiều cao = 2.8,
   * tính cả Geometric Face Normal (Culling) & Smooth Vertex-Averaged Normal (Shading trơn mịn).
   */
  public finalize(pantsCoverShoes: boolean): OutfitMesh3D {
    const vertexCount = this.pos.length / 3;
    const positions = new Float32Array(this.pos);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
      minX = -0.5;
      maxX = 0.5;
      minY = 0;
      maxY = 1.5;
      minZ = -0.3;
      maxZ = 0.3;
    }

    const bCx = (minX + maxX) * 0.5;
    const bCy = (minY + maxY) * 0.5;
    const bCz = (minZ + maxZ) * 0.5;
    const curH = Math.max(0.4, maxY - minY);
    const normScale = 2.8 / curH;

    for (let i = 0; i < vertexCount; i++) {
      positions[i * 3] = (positions[i * 3] - bCx) * normScale;
      positions[i * 3 + 1] = (positions[i * 3 + 1] - bCy) * normScale;
      positions[i * 3 + 2] = (positions[i * 3 + 2] - bCz) * normScale;
    }

    const qCount = this.rawQuads.length;
    const faceNx = new Float32Array(qCount);
    const faceNy = new Float32Array(qCount);
    const faceNz = new Float32Array(qCount);

    const smoothAccum = new Map<number, [number, number, number]>();
    const makeKey = (vIdx: number, group: number) => group * 100000 + vIdx;

    for (let i = 0; i < qCount; i++) {
      const rq = this.rawQuads[i];
      const i0 = rq.v0 * 3;
      const i1 = rq.v1 * 3;
      const i2 = rq.v2 * 3;
      const i3 = rq.v3 * 3;

      const d1x = positions[i2] - positions[i0];
      const d1y = positions[i2 + 1] - positions[i0 + 1];
      const d1z = positions[i2 + 2] - positions[i0 + 2];

      const d2x = positions[i3] - positions[i1];
      const d2y = positions[i3 + 1] - positions[i1 + 1];
      const d2z = positions[i3 + 2] - positions[i1 + 2];

      const rawNx = d1y * d2z - d1z * d2y;
      const rawNy = d1z * d2x - d1x * d2z;
      const rawNz = d1x * d2y - d1y * d2x;
      const [nx, ny, nz] = safeNormalize(rawNx, rawNy, rawNz);

      faceNx[i] = nx;
      faceNy[i] = ny;
      faceNz[i] = nz;

      const verts = [rq.v0, rq.v1, rq.v2, rq.v3];
      for (let k = 0; k < 4; k++) {
        const key = makeKey(verts[k], rq.smoothGroup);
        const cur = smoothAccum.get(key);
        if (cur) {
          cur[0] += nx;
          cur[1] += ny;
          cur[2] += nz;
        } else {
          smoothAccum.set(key, [nx, ny, nz]);
        }
      }
    }

    smoothAccum.forEach((vec, key) => {
      smoothAccum.set(key, safeNormalize(vec[0], vec[1], vec[2]));
    });

    const ALL_PARTS: MeshPartId[] = [
      'torsoCore',
      'outerwearShell',
      'hoodBack',
      'leftArm',
      'rightArm',
      'leftLeg',
      'rightLeg',
      'leftShoe',
      'rightShoe',
    ];
    const partBounds = {} as Record<
      MeshPartId,
      { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; has: boolean }
    >;
    for (const p of ALL_PARTS) {
      partBounds[p] = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
        minZ: Infinity,
        maxZ: -Infinity,
        has: false,
      };
    }

    const quads: Quad3D[] = new Array(qCount);
    for (let i = 0; i < qCount; i++) {
      const rq = this.rawQuads[i];
      const i0 = rq.v0 * 3;
      const i1 = rq.v1 * 3;
      const i2 = rq.v2 * 3;
      const i3 = rq.v3 * 3;

      const cx = (positions[i0] + positions[i1] + positions[i2] + positions[i3]) * 0.25;
      const cy = (positions[i0 + 1] + positions[i1 + 1] + positions[i2 + 1] + positions[i3 + 1]) * 0.25;
      const cz = (positions[i0 + 2] + positions[i1 + 2] + positions[i2 + 2] + positions[i3 + 2]) * 0.25;

      const n0 = smoothAccum.get(makeKey(rq.v0, rq.smoothGroup))!;
      const n1 = smoothAccum.get(makeKey(rq.v1, rq.smoothGroup))!;
      const n2 = smoothAccum.get(makeKey(rq.v2, rq.smoothGroup))!;
      const n3 = smoothAccum.get(makeKey(rq.v3, rq.smoothGroup))!;
      const [snx, sny, snz] = safeNormalize(
        n0[0] + n1[0] + n2[0] + n3[0],
        n0[1] + n1[1] + n2[1] + n3[1],
        n0[2] + n1[2] + n2[2] + n3[2]
      );

      quads[i] = {
        v0: rq.v0,
        v1: rq.v1,
        v2: rq.v2,
        v3: rq.v3,
        nx: faceNx[i],
        ny: faceNy[i],
        nz: faceNz[i],
        snx,
        sny,
        snz,
        cx,
        cy,
        cz,
        partId: rq.partId,
        zBias: rq.zBias,
        isDeepCavity: rq.isDeepCavity,
        material: rq.material,
        slot: rq.slot,
        ao: rq.ao,
      };

      const pb = partBounds[rq.partId];
      pb.has = true;
      if (cx < pb.minX) pb.minX = cx;
      if (cx > pb.maxX) pb.maxX = cx;
      if (cy < pb.minY) pb.minY = cy;
      if (cy > pb.maxY) pb.maxY = cy;
      if (cz < pb.minZ) pb.minZ = cz;
      if (cz > pb.maxZ) pb.maxZ = cz;
    }

    const partCenters = {} as Record<MeshPartId, [number, number, number]>;
    for (const p of ALL_PARTS) {
      const pb = partBounds[p];
      partCenters[p] = pb.has
        ? [
            (pb.minX + pb.maxX) * 0.5,
            (pb.minY + pb.maxY) * 0.5,
            (pb.minZ + pb.maxZ) * 0.5,
          ]
        : [0, 0, 0];
    }

    const halfHeight = (maxY - minY) * 0.5 * normScale;
    const normMinY = -halfHeight;

    return {
      vertexCount,
      quadCount: quads.length,
      positions,
      quads,
      partCenters,
      shoeGroundCenters: {
        left: [partCenters.leftShoe[0], normMinY, partCenters.leftShoe[2]],
        right: [partCenters.rightShoe[0], normMinY, partCenters.rightShoe[2]],
      },
      halfHeight,
      minY: normMinY,
      pantsCoverShoes,
    };
  }
}

// =============================================================
// HÀM CHÍNH: DỰNG LƯỚI 3D TRƠN MỊN & PHÂN TẦNG (~1.000–1.250 QUADS)
// =============================================================

export function buildOutfitMesh3D(
  gender: SilhouetteStyleType,
  isLayering: boolean,
  outerShape: SilhouetteId,
  topShape: SilhouetteId,
  bottomShape: SilhouetteId,
  shoesShape: SilhouetteId
): OutfitMesh3D {
  const mb = new SmoothQuadBuilder();
  const isFemale = gender === 'female';
  const legSpread = isFemale ? 0.084 : 0.097;

  const neckRx = isFemale ? 0.068 : 0.078;
  const neckRz = isFemale ? 0.064 : 0.072;

  // -----------------------------------------------------------
  // 1. VÀNH LÒNG CỔ ÁO ĐỘC LẬP (KHOÉT CONG MẶT TRƯỚC, TỐI HƠN VẢI 42%)
  // -----------------------------------------------------------
  mb.loftTube(
    [
      { y: 1.405, rx: neckRx * 0.86, rz: neckRz * 0.85, ao: 0.68 },
      { y: 1.45, rx: neckRx * 0.93, rz: neckRz * 0.91, ao: 0.76, neckDrop: 0.02 },
      { y: 1.49, rx: neckRx * 0.98, rz: neckRz * 0.96, ao: 0.84, neckDrop: 0.042 },
    ],
    18,
    'inner_cavity',
    'top',
    'torsoCore',
    { zBias: -0.01, isDeepCavity: true, inward: true, capBottom: true }
  );

  // -----------------------------------------------------------
  // 2. THÂN ÁO CHÍNH (`torsoCore` -> `top`, 24 CẠNH VÒNG + CỔ CONG TỰ NHIÊN)
  // -----------------------------------------------------------
  {
    const shoulderW = isFemale ? 0.174 : 0.21;
    const chestW = isFemale ? 0.158 : 0.19;
    const waistW = isFemale ? 0.122 : 0.162;
    const hipW = isFemale ? 0.162 : 0.172;
    const chestD = isFemale ? 0.112 : 0.118;

    // Thu thân trong về 0.89 khi bật + Áo khoác -> khoảng hở hình học an toàn >= +18% trên cả X và Z
    const shrink = isLayering ? 0.89 : 1.0;
    const isSoloHoodie = !isLayering && topShape === 'hoodie';
    const bulk = isSoloHoodie ? 1.07 : 1.0;
    const innerAo = isLayering ? 0.93 : 1.0;
    const hemY = !isLayering && topShape === 'blazer' ? 0.81 : 0.87;

    const torsoControls: RingDef[] = [
      { y: hemY, rx: hipW * shrink * bulk, rz: 0.104 * shrink * bulk, ao: innerAo * 0.94 },
      { y: 0.97, rx: (waistW + 0.015) * shrink * bulk, rz: 0.1 * shrink * bulk, zOff: -0.006, ao: innerAo * 0.97 },
      { y: 1.08, rx: waistW * shrink * bulk, rz: 0.096 * shrink * bulk, zOff: -0.01, backArch: -0.008, ao: innerAo * 0.99 },
      { y: 1.19, rx: (chestW - 0.008) * shrink * bulk, rz: 0.107 * shrink * bulk, zOff: -0.003, ao: innerAo },
      {
        y: 1.295,
        rx: chestW * shrink * bulk,
        rz: chestD * shrink * bulk,
        chestBulge: isFemale ? 0.022 : 0.009,
        backArch: 0.007,
        ao: innerAo,
      },
      // Bờ vai dốc mềm từ cổ (1.49) -> vai giữa (1.44) -> đầu vai (1.385)
      { y: 1.385, rx: shoulderW * shrink * bulk, rz: 0.095 * shrink * bulk, ao: innerAo * 0.97 },
      { y: 1.442, rx: shoulderW * 0.62 * shrink * bulk, rz: 0.08 * shrink * bulk, ao: 0.95, neckDrop: 0.018 },
      { y: 1.49, rx: neckRx * 1.03 * shrink, rz: neckRz * 1.01 * shrink, ao: 0.91, neckDrop: 0.042 },
    ];

    const torsoBands = isLayering ? 6 : 8;
    const torsoSegs = isLayering ? 20 : 24;
    const torsoSampled = sampleSplineRings(torsoControls, torsoBands);
    mb.loftTube(torsoSampled, torsoSegs, 'top', 'top', 'torsoCore', {
      zBias: 0.004,
      superEllipse: 0.018,
      capBottom: true,
    });

    if (!isLayering) {
      const sleeveLen =
        topShape === 'tshirt' ? 0.23 : topShape === 'shirt' ? 0.46 : 0.48;
      const topR = topShape === 'hoodie' ? 0.075 : isFemale ? 0.061 : 0.071;
      const endR =
        topShape === 'tshirt'
          ? isFemale
            ? 0.054
            : 0.062
          : topShape === 'shirt'
          ? 0.043
          : 0.047;

      mb.addSculptedArm(-1, shoulderW * bulk, 1.385, sleeveLen, topR, endR, 'top', 'inner_cavity', 'top', 'leftArm');
      mb.addSculptedArm(1, shoulderW * bulk, 1.385, sleeveLen, topR, endR, 'top', 'inner_cavity', 'top', 'rightArm');

      if (topShape === 'shirt') {
        // Cổ sơ mi bẻ ôm khít cổ cong + nẹp cúc ôm sát mặt ngực
        mb.loftTube(
          [
            { y: 1.475, rx: neckRx * 1.15, rz: neckRz * 1.14, ao: 0.95, neckDrop: 0.036 },
            { y: 1.522, rx: neckRx * 1.05, rz: neckRz * 1.04, ao: 1.0, neckDrop: 0.026 },
          ],
          18,
          'top',
          'top',
          'torsoCore',
          { zBias: 0.012 }
        );
        mb.addConformingPatch(
          torsoSampled.slice(0, torsoSampled.length - 1),
          0.018,
          () => -0.07,
          () => 0.07,
          0.006,
          1,
          'top',
          'top',
          'torsoCore',
          { zBias: 0.012, ao: 1.02 }
        );
      } else if (topShape === 'hoodie') {
        // Mũ trùm 3D rũ mềm tự nhiên ôm sát sau cổ & bờ vai (-Z)
        mb.loftTube(
          sampleSplineRings(
            [
              { y: 1.38, rx: 0.12, rz: 0.075, zOff: -0.055, ao: 0.88 },
              { y: 1.45, rx: 0.132, rz: 0.098, zOff: -0.088, ao: 0.95 },
              { y: 1.52, rx: 0.118, rz: 0.092, zOff: -0.084, ao: 0.99 },
              { y: 1.568, rx: 0.074, rz: 0.062, zOff: -0.058, ao: 1.01 },
            ],
            5
          ),
          16,
          'top',
          'top',
          'hoodBack',
          { capTop: true }
        );
        // Túi kangaroo uốn cong ôm sát bụng (không nổi gạch ở góc 90°!)
        mb.addConformingPatch(
          torsoSampled.slice(1, 4),
          0.018,
          t => -0.58 + t * 0.14,
          t => 0.58 - t * 0.14,
          0.011,
          4,
          'top',
          'top',
          'torsoCore',
          { zBias: 0.014, ao: 1.02, sideBevel: true }
        );
        // 2 dây rút mảnh uốn sát mặt ngực
        ([-1, 1] as const).forEach(side => {
          mb.addConformingPatch(
            torsoSampled.slice(4, torsoSampled.length - 1),
            0.018,
            () => side * 0.18 - 0.025,
            () => side * 0.18 + 0.025,
            0.008,
            1,
            'accent_light',
            'top',
            'torsoCore',
            { zBias: 0.016, ao: 1.0 }
          );
        });
      } else if (topShape === 'blazer') {
        // 2 ve áo chữ V uốn sát bề mặt ngực
        ([-1, 1] as const).forEach(side => {
          mb.addConformingPatch(
            torsoSampled.slice(3, torsoSampled.length - 1),
            0.018,
            t => (side === 1 ? 0.05 + t * 0.12 : -(0.28 + t * 0.2)),
            t => (side === 1 ? 0.28 + t * 0.2 : -(0.05 + t * 0.12)),
            0.01,
            2,
            'top',
            'top',
            'torsoCore',
            { zBias: 0.014, ao: 1.03, sideBevel: true }
          );
        });
      }
    }
  }

  // -----------------------------------------------------------
  // 3. ÁO KHOÁC NGOÀI (`outerwearShell` + `hoodBack`, 24 CẠNH VÒNG)
  // Khoảng hở >= +18%, ve/túi/dây rút uốn cong bám mặt áo (KHÔNG nổi hộp, KHÔNG xuyên lưng!)
  // -----------------------------------------------------------
  if (isLayering) {
    const bulk = outerShape === 'hoodie' ? 1.06 : 1.0;
    const isBlazer = outerShape !== 'shirt' && outerShape !== 'hoodie';
    const shoulderW = (isFemale ? 0.194 : 0.232) * bulk;
    const chestW = (isFemale ? 0.176 : 0.21) * bulk;
    const waistW = (isFemale ? 0.15 : 0.188) * bulk;
    const hipW = (isFemale ? 0.184 : 0.2) * bulk;
    const depth = (outerShape === 'hoodie' ? 0.138 : 0.132);
    const outerHemY = isBlazer ? 0.81 : 0.84;

    const outerControls: RingDef[] = [
      { y: outerHemY, rx: hipW, rz: depth * 0.94, frontGap: isBlazer ? 0.3 : 0.36, ao: 0.94 },
      { y: 0.98, rx: waistW + 0.012, rz: depth * 0.96, zOff: -0.005, frontGap: isBlazer ? 0.31 : 0.36, ao: 0.97 },
      { y: 1.15, rx: waistW + 0.019, rz: depth * 1.0, zOff: -0.007, frontGap: isBlazer ? 0.36 : 0.38, ao: 0.99 },
      { y: 1.3, rx: chestW, rz: depth * 1.01, chestBulge: isFemale ? 0.018 : 0.008, frontGap: isBlazer ? 0.46 : 0.44, ao: 1.0 },
      { y: 1.395, rx: shoulderW, rz: depth * 0.9, frontGap: 0.5, ao: 0.98 },
      { y: 1.448, rx: shoulderW * 0.64, rz: depth * 0.78, frontGap: 0.54, ao: 0.95 },
      { y: 1.474, rx: neckRx * 1.22, rz: neckRz * 1.2, frontGap: 0.58, ao: 0.94, neckDrop: 0.022 },
    ];

    const outerSampled = sampleSplineRings(outerControls, 7);
    const outerSq = isBlazer ? 0.025 : 0.018;

    // 3a. Vỏ áo khoác ngoài (24 cạnh vòng, Outward Normal)
    const outerMesh = mb.loftTube(
      outerSampled,
      24,
      'outerwear',
      'outerwear',
      'outerwearShell',
      {
        openFront: true,
        inward: false,
        superEllipse: outerSq,
      }
    );

    // 3b. Dải vành độ dày mép vạt mở hẹp (chỉ uốn vào 0.04 rad = viền mép vải gọn, KHÔNG che mặt trước áo trong!)
    const innerRimRings = outerSampled.map(r => ({
      ...r,
      rx: r.rx * 0.96,
      rz: r.rz * 0.96,
      ao: 0.82,
    }));
    const rightGapInner = mb.loftTube(innerRimRings, 2, 'outer_cavity', 'outerwear', 'outerwearShell', {
      zBias: -0.012,
      openFront: true,
      inward: true,
      uStart: 0.0,
      uEnd: 0.055,
      superEllipse: outerSq,
    });
    const leftGapInner = mb.loftTube(innerRimRings, 2, 'outer_cavity', 'outerwear', 'outerwearShell', {
      zBias: -0.012,
      openFront: true,
      inward: true,
      uStart: 0.945,
      uEnd: 1.0,
      superEllipse: outerSq,
    });

    // Vành mép vải khép kín dọc 2 vạt mở phía trước
    mb.bridgeEdgeStrip(
      outerMesh.grid.map(row => row[0]),
      rightGapInner.grid.map(row => row[0]),
      -0.8,
      0,
      0.6,
      'outerwearShell',
      0.004,
      'outerwear',
      'outerwear',
      0.92
    );
    const lastCol = outerMesh.grid[0].length - 1;
    mb.bridgeEdgeStrip(
      leftGapInner.grid.map(row => row[row.length - 1]),
      outerMesh.grid.map(row => row[lastCol]),
      0.8,
      0,
      0.6,
      'outerwearShell',
      0.004,
      'outerwear',
      'outerwear',
      0.92
    );

    // 3c. 2 Tay áo khoác có Chỏm Vai Tròn (nằm gọn ngang bờ vai)
    const sleeveTopR =
      outerShape === 'hoodie' ? 0.08 : isFemale ? 0.067 : 0.076;
    mb.addSculptedArm(-1, shoulderW, 1.395, 0.49, sleeveTopR, 0.049, 'outerwear', 'outer_cavity', 'outerwear', 'leftArm');
    mb.addSculptedArm(1, shoulderW, 1.395, 0.49, sleeveTopR, 0.049, 'outerwear', 'outer_cavity', 'outerwear', 'rightArm');

    // 3d. Chi tiết uốn cong ôm sát bề mặt từng dáng áo khoác (KHÔNG nổi hộp, KHÔNG xuyên lưng!)
    if (outerShape === 'shirt') {
      // Cổ bẻ ôm khít quanh cổ áo khoác
      mb.loftTube(
        [
          { y: 1.478, rx: neckRx * 1.32, rz: neckRz * 1.28, frontGap: 0.56, ao: 0.95 },
          { y: 1.522, rx: neckRx * 1.2, rz: neckRz * 1.16, frontGap: 0.6, ao: 1.0 },
        ],
        18,
        'outerwear',
        'outerwear',
        'outerwearShell',
        { zBias: 0.01, openFront: true }
      );
    } else if (outerShape === 'hoodie') {
      // Mũ trùm 3D rũ tròn mềm ôm sát sau cổ & vai trên (`hoodBack` riêng biệt)
      mb.loftTube(
        sampleSplineRings(
          [
            { y: 1.385, rx: 0.132, rz: 0.082, zOff: -0.058, ao: 0.88 },
            { y: 1.458, rx: 0.144, rz: 0.104, zOff: -0.094, ao: 0.95 },
            { y: 1.53, rx: 0.128, rz: 0.098, zOff: -0.088, ao: 0.99 },
            { y: 1.58, rx: 0.078, rz: 0.066, zOff: -0.06, ao: 1.01 },
          ],
          5
        ),
        16,
        'outerwear',
        'outerwear',
        'hoodBack',
        { capTop: true }
      );
      // 2 túi trước uốn cong bám sát vạt áo khoác (không nổi gạch ở góc 90° & không hiện ở mặt sau 180°!)
      const pocketRings = outerSampled.slice(1, 4);
      mb.addConformingPatch(
        pocketRings,
        outerSq,
        (_t, r) => (r.frontGap ?? 0.36) + 0.05,
        (_t, r) => (r.frontGap ?? 0.36) + 0.52,
        0.01,
        3,
        'outerwear',
        'outerwear',
        'outerwearShell',
        { zBias: 0.014, ao: 1.02, sideBevel: true }
      );
      mb.addConformingPatch(
        pocketRings,
        outerSq,
        (_t, r) => Math.PI * 2 - ((r.frontGap ?? 0.36) + 0.52),
        (_t, r) => Math.PI * 2 - ((r.frontGap ?? 0.36) + 0.05),
        0.01,
        3,
        'outerwear',
        'outerwear',
        'outerwearShell',
        { zBias: 0.014, ao: 1.02, sideBevel: true }
      );
      // 2 dây rút mảnh buông thẳng tự nhiên dọc 2 mép cổ ngực (không bẻ cong sang vai!)
      const cordRings = outerSampled.slice(3, 6);
      mb.addConformingPatch(
        cordRings,
        outerSq,
        () => 0.44,
        () => 0.485,
        0.008,
        1,
        'accent_light',
        'outerwear',
        'outerwearShell',
        { zBias: 0.016, ao: 1.0 }
      );
      mb.addConformingPatch(
        cordRings,
        outerSq,
        () => Math.PI * 2 - 0.485,
        () => Math.PI * 2 - 0.44,
        0.008,
        1,
        'accent_light',
        'outerwear',
        'outerwearShell',
        { zBias: 0.016, ao: 1.0 }
      );
    } else {
      // Blazer: 2 miếng ve áo chữ V uốn cong ôm sát thân áo khoác + 2 nắp túi mảnh bám hông
      const lapelRings = outerSampled.slice(3, 7);
      // Ve phải (+X)
      mb.addConformingPatch(
        lapelRings,
        outerSq,
        (_t, r) => (r.frontGap ?? 0.42),
        (t, r) => (r.frontGap ?? 0.42) + 0.14 + Math.sin(t * Math.PI * 0.85) * 0.22,
        0.01,
        3,
        'outerwear',
        'outerwear',
        'outerwearShell',
        { zBias: 0.014, ao: 1.04, sideBevel: true }
      );
      // Ve trái (-X)
      mb.addConformingPatch(
        lapelRings,
        outerSq,
        (t, r) =>
          Math.PI * 2 -
          ((r.frontGap ?? 0.42) + 0.14 + Math.sin(t * Math.PI * 0.85) * 0.22),
        (_t, r) => Math.PI * 2 - (r.frontGap ?? 0.42),
        0.01,
        3,
        'outerwear',
        'outerwear',
        'outerwearShell',
        { zBias: 0.014, ao: 1.04, sideBevel: true }
      );
      // 2 nắp túi mảnh ôm sát mặt cong hông blazer
      const flapRings = outerSampled.slice(1, 3);
      mb.addConformingPatch(
        flapRings,
        outerSq,
        (_t, r) => (r.frontGap ?? 0.32) + 0.18,
        (_t, r) => (r.frontGap ?? 0.32) + 0.58,
        0.008,
        2,
        'outerwear',
        'outerwear',
        'outerwearShell',
        { zBias: 0.012, ao: 1.03 }
      );
      mb.addConformingPatch(
        flapRings,
        outerSq,
        (_t, r) => Math.PI * 2 - ((r.frontGap ?? 0.32) + 0.58),
        (_t, r) => Math.PI * 2 - ((r.frontGap ?? 0.32) + 0.18),
        0.008,
        2,
        'outerwear',
        'outerwear',
        'outerwearShell',
        { zBias: 0.012, ao: 1.03 }
      );
    }
  }

  // -----------------------------------------------------------
  // 4. QUẦN / CHÂN VÁY (`torsoCore` hông/váy + `leftLeg` / `rightLeg`)
  // Khớp eo - hông - 2 đùi liền mạch, KHÔNG gãy bậc ngang ở đùi!
  // -----------------------------------------------------------
  const pantsCoverShoes =
    bottomShape === 'wide_pants' || bottomShape === 'jeans';

  {
    const waistW = isFemale ? 0.136 : 0.164;
    const hipW = isFemale ? 0.18 : 0.178;

    // 2 bắp chân mannequin giải phẫu tự nhiên (#CBC6BF) cắm khít vào cổ giày
    if (bottomShape === 'shorts' || bottomShape === 'a_line_skirt') {
      const topLegY = bottomShape === 'a_line_skirt' ? 0.56 : 0.62;
      ([-1, 1] as const).forEach(side => {
        const partId: MeshPartId = side === -1 ? 'leftLeg' : 'rightLeg';
        const calfControls: RingDef[] = [
          { y: 0.062, rx: isFemale ? 0.032 : 0.038, rz: isFemale ? 0.034 : 0.04, xOff: side * legSpread, ao: 0.9 },
          { y: 0.17, rx: isFemale ? 0.038 : 0.045, rz: isFemale ? 0.042 : 0.048, xOff: side * (legSpread + 0.001), zOff: -0.005, ao: 0.95 },
          { y: 0.33, rx: isFemale ? 0.05 : 0.058, rz: isFemale ? 0.055 : 0.062, xOff: side * (legSpread + 0.003), zOff: -0.009, ao: 1.0 },
          { y: 0.45, rx: isFemale ? 0.049 : 0.057, rz: isFemale ? 0.052 : 0.06, xOff: side * (legSpread + 0.002), zOff: -0.002, ao: 0.97 },
          { y: topLegY, rx: isFemale ? 0.062 : 0.07, rz: isFemale ? 0.064 : 0.072, xOff: side * (legSpread + 0.001), ao: 0.88 },
        ];
        mb.loftTube(
          sampleSplineRings(calfControls, 5),
          16,
          'mannequin_leg',
          'bottom',
          partId,
          { superEllipse: 0.01 }
        );
      });
    }

    if (bottomShape === 'a_line_skirt') {
      // Váy chữ A 24 cạnh vòng xòe đều 360°, 8 nếp sóng nhẹ quanh gấu + mặt trong độc lập
      const skirtControls: RingDef[] = [
        { y: 0.48, rx: 0.258, rz: 0.214, waveAmp: 0.011, waveFreq: 8, ao: 0.97 },
        { y: 0.61, rx: 0.22, rz: 0.182, waveAmp: 0.007, waveFreq: 8, ao: 1.0 },
        { y: 0.74, rx: hipW * 1.05, rz: 0.138, waveAmp: 0.003, waveFreq: 8, ao: 0.98 },
        { y: 0.835, rx: hipW * 0.94, rz: 0.114, ao: 0.95 },
        { y: 0.895, rx: waistW * 0.96, rz: 0.094, ao: 0.92 },
      ];
      const skirtSampled = sampleSplineRings(skirtControls, 7);
      const skirtOuter = mb.loftTube(
        skirtSampled,
        24,
        'bottom',
        'bottom',
        'torsoCore',
        { capTop: true, superEllipse: 0.012 }
      );

      const skirtInnerRings = skirtSampled.slice(0, 4).map(r => ({
        ...r,
        rx: r.rx * 0.96,
        rz: r.rz * 0.96,
        ao: 0.8,
      }));
      const skirtInner = mb.loftTube(
        skirtInnerRings,
        24,
        'bottom_cavity',
        'bottom',
        'torsoCore',
        { zBias: -0.01, isDeepCavity: true, inward: true, superEllipse: 0.012 }
      );
      mb.bridgeEdgeStrip(
        [...skirtOuter.grid[0], skirtOuter.grid[0][0]],
        [...skirtInner.grid[0], skirtInner.grid[0][0]],
        0,
        -1,
        0,
        'torsoCore',
        0.002,
        'bottom',
        'bottom',
        0.88
      );
    } else {
      // Khối hông / cạp quần cắm gọn BÊN TRONG gấu áo (rx, rz nhỏ hơn gấu áo -> tuyệt đối không xuyên răng cưa ở eo!)
      const pelvisRings = sampleSplineRings(
        [
          { y: 0.715, rx: hipW * 0.96, rz: 0.111, ao: 0.92 },
          { y: 0.775, rx: hipW * 1.01, rz: 0.116, ao: 0.97 },
          { y: 0.84, rx: (hipW + waistW) * 0.49, rz: 0.106, ao: 0.98 },
          { y: 0.895, rx: waistW * 0.95, rz: 0.092, ao: 0.94 },
        ],
        4
      );
      mb.loftTube(pelvisRings, 24, 'bottom', 'bottom', 'torsoCore', {
        capTop: true,
        capBottom: true,
        superEllipse: 0.016,
      });

      const isShort = bottomShape === 'shorts';
      const isWide = bottomShape === 'wide_pants';

      // 2 Ống quần 16 cạnh vòng ăn khớp mượt vào hông (mép ngoài đùi <= hipW, khe giữa 2 đùi sạch sẽ!)
      const maxLegTopRx = Math.min(0.089, hipW - legSpread + 0.004);

      ([-1, 1] as const).forEach(side => {
        const partId: MeshPartId = side === -1 ? 'leftLeg' : 'rightLeg';
        let legControls: RingDef[];
        let bands: number;

        if (isShort) {
          bands = 3;
          legControls = [
            { y: 0.54, rx: isFemale ? 0.075 : 0.081, rz: 0.081, xOff: side * legSpread, ao: 0.96 },
            { y: 0.65, rx: isFemale ? 0.079 : 0.084, rz: 0.087, xOff: side * (legSpread + 0.001), ao: 0.98 },
            { y: 0.77, rx: maxLegTopRx, rz: 0.095, xOff: side * (legSpread - 0.005), ao: 0.92 },
          ];
        } else if (isWide) {
          bands = 6;
          legControls = [
            { y: 0.068, rx: 0.084, rz: 0.088, xOff: side * (legSpread + 0.003), ao: 0.92 },
            { y: 0.27, rx: 0.084, rz: 0.089, xOff: side * (legSpread + 0.002), ao: 0.97 },
            { y: 0.5, rx: 0.086, rz: 0.091, xOff: side * (legSpread + 0.001), ao: 1.0 },
            { y: 0.66, rx: 0.087, rz: 0.093, xOff: side * (legSpread - 0.002), ao: 0.97 },
            { y: 0.77, rx: maxLegTopRx, rz: 0.096, xOff: side * (legSpread - 0.005), ao: 0.92 },
          ];
        } else {
          bands = 6;
          legControls = [
            { y: 0.082, rx: isFemale ? 0.052 : 0.059, rz: isFemale ? 0.056 : 0.063, xOff: side * legSpread, ao: 0.92 },
            { y: 0.28, rx: isFemale ? 0.061 : 0.069, rz: isFemale ? 0.065 : 0.073, xOff: side * legSpread, ao: 0.97 },
            { y: 0.5, rx: isFemale ? 0.072 : 0.079, rz: isFemale ? 0.076 : 0.083, xOff: side * legSpread, ao: 1.0 },
            { y: 0.66, rx: isFemale ? 0.079 : 0.085, rz: isFemale ? 0.083 : 0.09, xOff: side * (legSpread - 0.002), ao: 0.97 },
            { y: 0.77, rx: maxLegTopRx, rz: 0.095, xOff: side * (legSpread - 0.005), ao: 0.92 },
          ];
        }

        const sampledLeg = sampleSplineRings(legControls, bands);
        const legMesh = mb.loftTube(sampledLeg, 16, 'bottom', 'bottom', partId, {
          capBottom: !isShort,
          superEllipse: 0.015,
        });

        if (isShort) {
          const hem = sampledLeg[0];
          const shortInner = mb.loftTube(
            [
              { y: hem.y + 0.005, rx: hem.rx * 0.91, rz: hem.rz * 0.91, xOff: hem.xOff, ao: 0.78 },
              { y: hem.y + 0.052, rx: hem.rx * 0.84, rz: hem.rz * 0.84, xOff: hem.xOff, ao: 0.65 },
            ],
            16,
            'bottom_cavity',
            'bottom',
            partId,
            { zBias: -0.008, inward: true }
          );
          mb.bridgeEdgeStrip(
            [...legMesh.grid[0], legMesh.grid[0][0]],
            [...shortInner.grid[0], shortInner.grid[0][0]],
            0,
            -1,
            0,
            partId,
            0.002,
            'bottom',
            'bottom',
            0.88
          );
        }
      });

      if (bottomShape === 'jeans') {
        // Nút quần kim loại nhỏ gọn sát cạp quần (chỉ lộ khi gấu áo không che, không hiện mặt sau!)
        mb.addConformingPatch(
          [
            { y: 0.848, rx: (hipW + waistW) * 0.49, rz: 0.105 },
            { y: 0.862, rx: (hipW + waistW) * 0.48, rz: 0.101 },
          ],
          0.016,
          () => -0.04,
          () => 0.04,
          0.005,
          1,
          'accent_metal',
          'bottom',
          'torsoCore',
          { zBias: 0.012, ao: 1.0 }
        );
      }
    }
  }

  // -----------------------------------------------------------
  // 5. ĐÔI GIÀY 3D LIỀN KHỐI WATERTIGHT (`leftShoe`, `rightShoe`, 16 CẠNH VÒNG)
  // -----------------------------------------------------------
  mb.addSculptedShoe(-1, -legSpread, shoesShape, isFemale, 'leftShoe');
  mb.addSculptedShoe(1, legSpread, shoesShape, isFemale, 'rightShoe');

  return mb.finalize(pantsCoverShoes);
}
