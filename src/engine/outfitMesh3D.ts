// src/engine/outfitMesh3D.ts
/**
 * Bộ sinh lưới 3D Tứ giác cao cấp + Hệ thống 3D Projected Surface Details cho GPU Skia PictureRecorder
 * - Phân tách 9 bộ phận độc lập cho Hierarchical Part Z-Sorting (triệt tiêu 100% xuyên thấu & nhảy lớp 360°).
 * - Hỗ trợ hệ thống DetailLine3D & DetailDot3D gắn trực tiếp theo từng `partId` với normal culling chính xác
 *   (chi tiết mặt trước biến mất sạch khi xoay ra sau, chi tiết mặt sau tự hiện khi xoay ra Sau).
 * - Phân biệt sắc nét nhìn phát biết ngay:
 *   + 7 dáng Áo: Áo thun, Polo, Baby Tee (lộ eo), Áo kiểu (cổ vuông lộ quai xanh + tay phồng), Sơ mi, Hoodie thiết kế lại hoàn toàn (mũ rũ lưng tự nhiên + vai xuôi + bo gấu/cổ tay + dây rút + túi kangaroo), Blazer.
 *   + 5 dáng Quần/Váy: Quần suông (ly đứng), Quần Jean (túi trước/sau + J-stitch + chỉ sườn), Quần Short, Váy chữ A, Váy ngắn (Mini Skirt).
 *   + 5 dáng Giày: Sneaker (đế trắng dày + dây đan chéo), Loafer (đai ngang + chỉ mũi), Giày da (mũi nhọn dài + cap-toe + gót tách + bóng da +25%), Cao gót (khoét mu + vòm hở + gót nhọn tách biệt), Boot (cổ cao Chelsea).
 */

import type {
  OutfitSlotId,
  SilhouetteId,
  SilhouetteStyleType,
} from '../types/outfit';

export type Vec3 = [number, number, number];

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
  | 'top_lining'
  | 'outer_lining'
  | 'mannequin_leg'
  | 'accent_light'
  | 'accent_metal';

export type MeshPartId =
  | 'mannequinCore'
  | 'bottomCore'
  | 'pelvis'
  | 'neckCavity'
  | 'torsoCore'
  | 'outerwearShell'
  | 'hoodBack'
  | 'leftArm'
  | 'rightArm'
  | 'leftLeg'
  | 'rightLeg'
  | 'leftShoe'
  | 'rightShoe';

export type DetailLineStyle =
  | 'seamDark'
  | 'seamLight'
  | 'contrastWhite'
  | 'contrastDark'
  | 'zipper'
  | 'lace';

export type DetailDotStyle = 'button' | 'aglet' | 'buckle';

export interface DetailLine3D {
  partId: MeshPartId;
  /** Vật liệu nền để thích nghi độ tương phản (VD: trên đồ đen sẽ chuyển sang viền sáng mảnh) */
  material: MeshMaterialKind;
  points: Vec3[];
  normal: Vec3;
  width: number;
  style: DetailLineStyle;
}

export interface DetailDot3D {
  partId: MeshPartId;
  material: MeshMaterialKind;
  center: Vec3;
  normal: Vec3;
  radius: number;
  style: DetailDotStyle;
}

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
  /** true nếu là vòng bịt gầm gấu áo (`hemSealRing`) — chỉ vẽ khi dot(N, V) > 0.05 (góc nhìn từ dưới lên) */
  isHemSeal: boolean;
  /** Vật liệu xác định màu gốc */
  material: MeshMaterialKind;
  /** Slot tương ứng cho tap hit-test chọn món */
  slot: OutfitSlotId | null;
  /** Hệ số Ambient Occlusion mềm */
  ao: number;
  /** Độ bóng Specular (0 = vải lì, ~0.25 = da bóng cho Giày Tây) */
  shininess: number;
}

export interface OutfitMesh3D {
  vertexCount: number;
  quadCount: number;
  /** Tọa độ đỉnh phẳng [x0, y0, z0, ...] đã auto-center về (0, 0, 0), chiều cao = 2.8 */
  positions: Float32Array;
  /** Danh sách toàn bộ mặt tứ giác */
  quads: Quad3D[];
  /** Đường chỉ may, nếp gấp, dây rút, nẹp cúc, khóa kéo, dây giày chiếu 3D theo từng partId */
  detailLines: DetailLine3D[];
  /** Cúc áo, đầu dây rút, khóa loafer chiếu 3D theo từng partId */
  detailDots: DetailDot3D[];
  /** Tâm 3D sau chuẩn hóa của từng bộ phận (dùng sắp xếp tầng 1 theo khoảng cách camera) */
  partCenters: Record<MeshPartId, Vec3>;
  /** Vị trí đáy 2 bàn chân sau chuẩn hóa để vẽ 2 bóng tiếp xúc sàn xoay theo giày */
  shoeGroundCenters: {
    left: Vec3;
    right: Vec3;
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
export function safeNormalize(x: number, y: number, z: number): Vec3 {
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
  /** Khoét cổ vuông rộng (Áo kiểu Blouse) */
  squareNeckDrop?: number;
  /** Lượn gấu áo sơ mi nhẹ hai bên sườn */
  sideHemRise?: number;
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
      squareNeckDrop: interp(r => r.squareNeckDrop ?? 0, 0),
      sideHemRise: interp(r => r.sideHemRise ?? 0, 0),
    });
  }
  return out;
}

/** Đánh giá tọa độ 3D trên mặt cắt vòng elip tại góc theta (theta = 0 là chính giữa mặt trước +Z) */
function evalRingPoint(
  r: RingDef,
  theta: number,
  sq: number,
  radialScale = 1.0,
  radialOffset = 0
): Vec3 {
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
    rz += Math.pow(cosT, 2.0) * Math.sin(Math.abs(sinT) * Math.PI) * chestBulge;
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

  const sqDrop = r.squareNeckDrop ?? 0;
  if (sqDrop > 0 && cosT > 0.35) {
    // Khoét phẳng hình chữ nhật thanh lịch ở mặt trước ngực cho Áo kiểu (Blouse)
    const flatWeight = Math.min(1, Math.pow((cosT - 0.35) / 0.42, 0.55));
    y -= flatWeight * sqDrop;
  }

  const sideRise = r.sideHemRise ?? 0;
  if (sideRise > 0) {
    y += Math.pow(Math.abs(sinT), 2.4) * sideRise;
  }

  return [(r.xOff ?? 0) + sinT * rx, y, (r.zOff ?? 0) + cosT * rz];
}

function evalRingNormal(r: RingDef, theta: number): Vec3 {
  const rx = Math.max(0.01, r.rx);
  const rz = Math.max(0.01, r.rz);
  return safeNormalize(Math.sin(theta) / rx, 0, Math.cos(theta) / rz);
}

/** Nội suy tuyến tính 1 vòng cắt giữa danh sách rings đã sample theo tham số t ∈ [0..1] */
function sampleRingAtT(rings: RingDef[], t: number): RingDef {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (rings.length - 1);
  const i0 = Math.min(rings.length - 1, Math.floor(scaled));
  const i1 = Math.min(rings.length - 1, i0 + 1);
  const f = scaled - i0;
  const a = rings[i0];
  const b = rings[i1];
  const mix = (va: number, vb: number) => va + (vb - va) * f;
  return {
    y: mix(a.y, b.y),
    rx: mix(a.rx, b.rx),
    rz: mix(a.rz, b.rz),
    xOff: mix(a.xOff ?? 0, b.xOff ?? 0),
    zOff: mix(a.zOff ?? 0, b.zOff ?? 0),
    ao: mix(a.ao ?? 1, b.ao ?? 1),
    waveAmp: mix(a.waveAmp ?? 0, b.waveAmp ?? 0),
    waveFreq: a.waveFreq ?? b.waveFreq ?? 8,
    chestBulge: mix(a.chestBulge ?? 0, b.chestBulge ?? 0),
    backArch: mix(a.backArch ?? 0, b.backArch ?? 0),
    frontGap: mix(a.frontGap ?? 0, b.frontGap ?? 0),
    neckDrop: mix(a.neckDrop ?? 0, b.neckDrop ?? 0),
    squareNeckDrop: mix(a.squareNeckDrop ?? 0, b.squareNeckDrop ?? 0),
    sideHemRise: mix(a.sideHemRise ?? 0, b.sideHemRise ?? 0),
  };
}

interface RawQuad {
  v0: number;
  v1: number;
  v2: number;
  v3: number;
  partId: MeshPartId;
  zBias: number;
  isDeepCavity: boolean;
  isHemSeal: boolean;
  material: MeshMaterialKind;
  slot: OutfitSlotId | null;
  ao: number;
  shininess: number;
  smoothGroup: number;
}

class SmoothQuadBuilder {
  private pos: number[] = [];
  private rawQuads: RawQuad[] = [];
  private rawLines: DetailLine3D[] = [];
  private rawDots: DetailDot3D[] = [];
  private nextSmoothGroup = 1;

  public allocSmoothGroup(): number {
    return this.nextSmoothGroup++;
  }

  public addVertex(x: number, y: number, z: number): number {
    const id = this.pos.length / 3;
    this.pos.push(
      Number.isFinite(x) ? x : 0,
      Number.isFinite(y) ? y : 0,
      Number.isFinite(z) ? z : 0
    );
    return id;
  }

  public addDetailLine(
    partId: MeshPartId,
    material: MeshMaterialKind,
    points: Vec3[],
    normal: Vec3,
    width: number,
    style: DetailLineStyle
  ) {
    if (points.length < 2) return;
    this.rawLines.push({
      partId,
      material,
      points,
      normal: safeNormalize(normal[0], normal[1], normal[2]),
      width,
      style,
    });
  }

  public addDetailDot(
    partId: MeshPartId,
    material: MeshMaterialKind,
    center: Vec3,
    normal: Vec3,
    radius: number,
    style: DetailDotStyle
  ) {
    this.rawDots.push({
      partId,
      material,
      center,
      normal: safeNormalize(normal[0], normal[1], normal[2]),
      radius,
      style,
    });
  }

  /**
   * Vẽ 1 đường chỉ/nếp gấp bám khít lên mặt cong của chuỗi rings theo hàm (t -> theta)
   */
  public addSurfaceCurve(
    rings: RingDef[],
    sq: number,
    steps: number,
    tStart: number,
    tEnd: number,
    thetaFn: (u: number) => number,
    radialOffset: number,
    partId: MeshPartId,
    material: MeshMaterialKind,
    width: number,
    style: DetailLineStyle
  ) {
    const pts: Vec3[] = [];
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const t = tStart + (tEnd - tStart) * u;
      const r = sampleRingAtT(rings, t);
      const th = thetaFn(u);
      pts.push(evalRingPoint(r, th, sq, 1.0, radialOffset));
      const n = evalRingNormal(r, th);
      nx += n[0];
      ny += n[1];
      nz += n[2];
    }
    this.addDetailLine(partId, material, pts, safeNormalize(nx, ny, nz), width, style);
  }

  /**
   * Vẽ vòng đường chỉ ngang khép kín quanh ống (gấu áo, bo tay, cạp quần) chia 4 cung
   * để mỗi cung có pháp tuyến hướng ngoài riêng -> KHÔNG BAO GIỜ xuyên mặt sau!
   */
  public addCircumferentialSeam(
    ring: RingDef,
    sq: number,
    radialOffset: number,
    partId: MeshPartId,
    material: MeshMaterialKind,
    width: number,
    style: DetailLineStyle,
    openFrontGap = 0
  ) {
    const arcs: [number, number][] =
      openFrontGap > 0
        ? [
            [openFrontGap, Math.PI * 0.55],
            [Math.PI * 0.55, Math.PI * 1.45],
            [Math.PI * 1.45, Math.PI * 2 - openFrontGap],
          ]
        : [
            [-Math.PI * 0.34, Math.PI * 0.34],
            [Math.PI * 0.24, Math.PI * 0.76],
            [Math.PI * 0.66, Math.PI * 1.34],
            [Math.PI * 1.24, Math.PI * 1.76],
          ];

    for (const [a0, a1] of arcs) {
      const segs = 5;
      const pts: Vec3[] = [];
      let nx = 0;
      let nz = 0;
      for (let i = 0; i <= segs; i++) {
        const th = a0 + ((a1 - a0) * i) / segs;
        pts.push(evalRingPoint(ring, th, sq, 1.0, radialOffset));
        const n = evalRingNormal(ring, th);
        nx += n[0];
        nz += n[2];
      }
      this.addDetailLine(partId, material, pts, safeNormalize(nx, 0, nz), width, style);
    }
  }

  /**
   * Thêm mặt tứ giác KÈM TỰ ĐỘNG KIỂM CHỨNG HƯỚNG PHÁP TUYẾN (Outward / Inward Winding Check)
   */
  public addVerifiedQuad(
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
    smoothGroup: number,
    shininess = 0
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
      isHemSeal: false,
      material,
      slot,
      ao,
      shininess,
      smoothGroup,
    });
  }

  public addDirectedQuad(
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
    smoothGroup: number,
    shininess = 0,
    isHemSeal = false
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
      isHemSeal,
      material,
      slot,
      ao,
      shininess,
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
      /** Quét cung góc mở tùy chỉnh [thetaStart, thetaEnd] quanh mặt trước (+Z là 0 rad) */
      thetaRange?: [number, number];
      inward?: boolean;
      superEllipse?: number;
      capTop?: boolean;
      capBottom?: boolean;
      capTopMaterial?: MeshMaterialKind;
      capBottomMaterial?: MeshMaterialKind;
      uStart?: number;
      uEnd?: number;
      shininess?: number;
    }
  ): { grid: number[][]; rings: RingDef[] } {
    const zBias = options?.zBias ?? 0;
    const isDeepCavity = options?.isDeepCavity ?? false;
    const openFront = options?.openFront ?? false;
    const thetaRange = options?.thetaRange;
    const isOpenArc = openFront || thetaRange !== undefined;
    const inward = options?.inward ?? false;
    const sq = options?.superEllipse ?? 0.018;
    const uStart = options?.uStart ?? 0;
    const uEnd = options?.uEnd ?? 1;
    const shininess = options?.shininess ?? 0;

    const ringCount = rings.length;
    const smoothGroup = this.allocSmoothGroup();
    const cols = isOpenArc ? radialSegments + 1 : radialSegments;
    const grid: number[][] = [];

    for (let i = 0; i < ringCount; i++) {
      const r = rings[i];
      const gap = openFront ? Math.max(0.18, r.frontGap ?? 0.42) : 0;
      const row: number[] = [];

      for (let j = 0; j < cols; j++) {
        const localU = j / radialSegments;
        const u = uStart + localU * (uEnd - uStart);
        let theta: number;
        if (thetaRange !== undefined) {
          theta = thetaRange[0] + u * (thetaRange[1] - thetaRange[0]);
        } else if (openFront) {
          theta = gap + u * (Math.PI * 2 - gap * 2);
        } else {
          theta = u * Math.PI * 2;
        }
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
        const jNext = isOpenArc ? j + 1 : (j + 1) % radialSegments;
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
          smoothGroup,
          shininess
        );
      }
    }

    const capStep = radialSegments >= 8 && radialSegments % 2 === 0 ? 2 : 1;

    if (options?.capTop && !isOpenArc) {
      const capGroup = this.allocSmoothGroup();
      const top = rings[ringCount - 1];
      const topRow = grid[ringCount - 1];
      const dirY = inward ? -1 : 1;
      let sumY = 0;
      for (let j = 0; j < radialSegments; j++) {
        sumY += this.pos[topRow[j] * 3 + 1];
      }
      const avgY = sumY / radialSegments;
      const centerIdx = this.addVertex(
        top.xOff ?? 0,
        avgY + (inward ? -0.003 : 0.005),
        top.zOff ?? 0
      );
      const capMat = options.capTopMaterial ?? material;
      for (let j = 0; j < radialSegments; j += capStep) {
        const j1 = (j + 1) % radialSegments;
        const j2 = (j + capStep) % radialSegments;
        this.addDirectedQuad(
          topRow[j],
          topRow[j1],
          capStep === 2 ? topRow[j2] : centerIdx,
          centerIdx,
          0,
          dirY,
          0,
          partId,
          zBias,
          isDeepCavity,
          capMat,
          slot,
          (top.ao ?? 0.94) * (inward ? 0.86 : 1.0),
          capGroup,
          shininess
        );
      }
    }

    if (options?.capBottom && !isOpenArc) {
      const capGroup = this.allocSmoothGroup();
      const bot = rings[0];
      const botRow = grid[0];
      const dirY = inward ? 1 : -1;
      let sumY = 0;
      for (let j = 0; j < radialSegments; j++) {
        sumY += this.pos[botRow[j] * 3 + 1];
      }
      const avgY = sumY / radialSegments;
      const centerIdx = this.addVertex(
        bot.xOff ?? 0,
        avgY + (inward ? 0.003 : -0.003),
        bot.zOff ?? 0
      );
      const capMat = options.capBottomMaterial ?? material;
      for (let j = 0; j < radialSegments; j += capStep) {
        const j1 = (j + 1) % radialSegments;
        const j2 = (j + capStep) % radialSegments;
        this.addDirectedQuad(
          botRow[j],
          botRow[j1],
          capStep === 2 ? botRow[j2] : centerIdx,
          centerIdx,
          0,
          dirY,
          0,
          partId,
          zBias,
          isDeepCavity,
          capMat,
          slot,
          (bot.ao ?? 0.88) * 0.85,
          capGroup,
          shininess
        );
      }
    }

    return { grid, rings };
  }

  /**
   * Nối vành độ dày mép vải kín khít giữa 2 dải lưới
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
    ao: number,
    isDeepCavity = false,
    isHemSeal = false
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
        isDeepCavity,
        material,
        slot,
        ao,
        group,
        0,
        isHemSeal
      );
    }
  }

  /**
   * Dựng cổ áo 2 mặt dày kín 100% Watertight (vỏ ngoài + mặt lót trong tối màu + mép trên/dưới/trước)
   * Đảm bảo cổ Polo, cổ Sơ mi, cổ Mũ Hoodie không bao giờ bị biến mất mặt trong khi xoay góc.
   */
  public addThickCollar(
    rings: RingDef[],
    radialSegments: number,
    outerMat: MeshMaterialKind,
    innerMat: MeshMaterialKind,
    slot: OutfitSlotId,
    partId: MeshPartId,
    options?: {
      zBias?: number;
      openFront?: boolean;
      superEllipse?: number;
      thickness?: number;
      innerIsDeepCavity?: boolean;
    }
  ) {
    const zBias = options?.zBias ?? 0.012;
    const openFront = options?.openFront ?? false;
    const sq = options?.superEllipse ?? 0.016;
    const thickness = options?.thickness ?? 0.0085;
    const innerIsDeepCavity = options?.innerIsDeepCavity ?? false;

    const outerMesh = this.loftTube(rings, radialSegments, outerMat, slot, partId, {
      zBias,
      openFront,
      inward: false,
      superEllipse: sq,
    });

    const innerRings = rings.map(r => ({
      ...r,
      rx: Math.max(0.018, r.rx - thickness),
      rz: Math.max(0.018, r.rz - thickness),
      ao: (r.ao ?? 0.96) * 0.78,
    }));

    const innerMesh = this.loftTube(innerRings, radialSegments, innerMat, slot, partId, {
      zBias: zBias - 0.008,
      isDeepCavity: innerIsDeepCavity,
      openFront,
      inward: true,
      superEllipse: sq,
    });

    const topIdx = rings.length - 1;
    const outerTop = openFront
      ? outerMesh.grid[topIdx]
      : [...outerMesh.grid[topIdx], outerMesh.grid[topIdx][0]];
    const innerTop = openFront
      ? innerMesh.grid[topIdx]
      : [...innerMesh.grid[topIdx], innerMesh.grid[topIdx][0]];
    this.bridgeEdgeStrip(outerTop, innerTop, 0, 1, 0, partId, zBias + 0.002, outerMat, slot, 0.95);

    if (openFront) {
      const lastCol = outerMesh.grid[0].length - 1;
      this.bridgeEdgeStrip(
        outerMesh.grid.map(row => row[0]),
        innerMesh.grid.map(row => row[0]),
        -0.86,
        0,
        0.5,
        partId,
        zBias + 0.001,
        outerMat,
        slot,
        0.91
      );
      this.bridgeEdgeStrip(
        innerMesh.grid.map(row => row[lastCol]),
        outerMesh.grid.map(row => row[lastCol]),
        0.86,
        0,
        0.5,
        partId,
        zBias + 0.001,
        outerMat,
        slot,
        0.91
      );
    }
  }

  /**
   * Chèn khối cầu/đệm nối vai–nách (`shoulderJoint`) nằm lùi sâu vào trong giữa thân áo & đầu tay áo
   * Triệt tiêu 100% khe hở nách khi xoay góc ngang 90°.
   */
  public addShoulderJoint(
    side: -1 | 1,
    shoulderW: number,
    shoulderY: number,
    topR: number,
    material: MeshMaterialKind,
    slot: OutfitSlotId,
    bodyPartId: MeshPartId
  ) {
    const cx = side * (shoulderW * 0.87);
    const cz = -0.004;
    const rxMax = topR * 0.82;
    const rzMax = topR * 0.84;
    const jointRings: RingDef[] = [
      { y: shoulderY - topR * 0.92, rx: rxMax * 0.85, rz: rzMax * 0.85, xOff: cx, zOff: cz, ao: 0.88 },
      { y: shoulderY + 0.008, rx: rxMax * 0.68, rz: rzMax * 0.68, xOff: side * (shoulderW * 0.84), zOff: cz, ao: 0.95 },
    ];
    this.loftTube(jointRings, 6, material, slot, bodyPartId, {
      zBias: -0.002,
      capTop: false,
      capBottom: false,
      superEllipse: 0.012,
    });
  }

  /**
   * Dựng miếng chi tiết nổi UỐN CONG ÔM SÁT ĐÚNG BỀ MẶT THÂN ÁO (Ve áo Blazer, Túi áo, Nẹp cúc)
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
   * Dựng tay áo có Chỏm Vai Tròn & tùy biến hình dáng cho từng loại áo:
   * - `hoodie`: vai xuôi rộng, ống tay phồng giữa rồi BÓ GỌN cổ tay (ribbed cuff) kèm đường chỉ gân bo.
   * - `blouse`: tay lỡ phồng mềm (puff sleeve) nở tròn ở bắp tay rồi thu gọn thanh lịch ở cửa tay.
   * - `shirt`: tay dài thu gọn ở măng-séc cổ tay kèm đường chia măng-séc & chấm cúc nhỏ.
   * - `polo`: tay ngắn ôm gọn bắp tay có đường viền bo cửa tay.
   * - `baby_tee`: tay rất ngắn ôm sát vai trên.
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
    partId: MeshPartId,
    sleeveStyle: 'standard' | 'hoodie' | 'puff' | 'shirt' | 'polo' | 'cap' = 'standard'
  ) {
    const cuffY = shoulderY - length;
    const dropShift = sleeveStyle === 'hoodie' ? 0.012 : 0;
    const armOutX = (t: number) =>
      side * (shoulderW * (sleeveStyle === 'hoodie' ? 0.98 : 0.96) + t * (sleeveStyle === 'cap' ? 0.04 : 0.095) - Math.sin(t * Math.PI) * 0.008);
    const armZ = (t: number) =>
      -0.006 + Math.sin(t * Math.PI * 0.88) * 0.02 + t * 0.02;

    let controls: RingDef[];

    if (sleeveStyle === 'hoodie') {
      // Hoodie: ống tay phồng rộng suốt cẳng tay, rồi BÓ GỌN RÕ RỆT ở cổ tay (ribbed cuff)!
      controls = [
        { y: cuffY, rx: endR, rz: endR * 0.94, xOff: armOutX(1.0), zOff: armZ(1.0), ao: 0.91 },
        { y: cuffY + 0.048, rx: endR * 1.04, rz: endR * 0.98, xOff: armOutX(0.9), zOff: armZ(0.9), ao: 0.93 },
        // Phần phồng rủ ngay trên cổ tay bo (signature streetwear hoodie drape)
        { y: cuffY + 0.088, rx: topR * 0.94, rz: topR * 0.9, xOff: armOutX(0.8), zOff: armZ(0.8), ao: 0.99 },
        { y: shoulderY - length * 0.48, rx: topR * 1.02, rz: topR * 0.96, xOff: armOutX(0.48), zOff: armZ(0.48), ao: 1.0 },
        { y: shoulderY - length * 0.18, rx: topR * 1.03, rz: topR * 0.97, xOff: side * (shoulderW * 0.98), zOff: -0.005, ao: 0.94 },
        { y: shoulderY - dropShift, rx: topR * 0.88, rz: topR * 0.88, xOff: side * (shoulderW * 0.92), zOff: -0.004, ao: 0.96 },
        { y: shoulderY + 0.018 - dropShift, rx: topR * 0.48, rz: topR * 0.5, xOff: side * (shoulderW * 0.84), zOff: -0.004, ao: 0.97 },
      ];
    } else if (sleeveStyle === 'puff') {
      // Blouse tay lỡ phồng mềm (Puff Sleeve): phồng tròn bắp tay trên -> thu gọn duyên dáng ở cửa tay
      controls = [
        { y: cuffY, rx: endR, rz: endR * 0.94, xOff: armOutX(1.0), zOff: armZ(1.0), ao: 0.92 },
        { y: cuffY + 0.036, rx: endR * 1.08, rz: endR * 1.02, xOff: armOutX(0.88), zOff: armZ(0.88), ao: 0.95 },
        { y: shoulderY - length * 0.56, rx: topR * 1.18, rz: topR * 1.12, xOff: armOutX(0.56), zOff: armZ(0.56), ao: 1.01 },
        { y: shoulderY - length * 0.24, rx: topR * 1.22, rz: topR * 1.14, xOff: side * (shoulderW * 1.02), zOff: -0.004, ao: 0.99 },
        { y: shoulderY + 0.006, rx: topR * 0.94, rz: topR * 0.92, xOff: side * (shoulderW * 0.93), zOff: -0.004, ao: 0.97 },
        { y: shoulderY + 0.028, rx: topR * 0.52, rz: topR * 0.54, xOff: side * (shoulderW * 0.84), zOff: -0.004, ao: 0.97 },
      ];
    } else if (sleeveStyle === 'shirt') {
      // Sơ mi: ống tay thẳng gọn có đoạn măng-séc thu nhỏ rõ ở cổ tay
      controls = [
        { y: cuffY, rx: endR, rz: endR * 0.94, xOff: armOutX(1.0), zOff: armZ(1.0), ao: 0.93 },
        { y: cuffY + 0.052, rx: endR * 1.02, rz: endR * 0.96, xOff: armOutX(0.88), zOff: armZ(0.88), ao: 0.95 },
        { y: cuffY + 0.075, rx: endR * 1.24, rz: endR * 1.18, xOff: armOutX(0.82), zOff: armZ(0.82), ao: 0.98 },
        { y: shoulderY - length * 0.44, rx: endR + (topR - endR) * 0.68, rz: (endR + (topR - endR) * 0.68) * 0.96, xOff: armOutX(0.44), zOff: armZ(0.44), ao: 0.99 },
        { y: shoulderY - length * 0.16, rx: topR * 0.98, rz: topR * 0.94, xOff: side * (shoulderW * 0.96), zOff: -0.005, ao: 0.93 },
        { y: shoulderY - 0.002, rx: topR * 0.86, rz: topR * 0.86, xOff: side * (shoulderW * 0.91), zOff: -0.004, ao: 0.96 },
        { y: shoulderY + 0.022, rx: topR * 0.46, rz: topR * 0.5, xOff: side * (shoulderW * 0.83), zOff: -0.004, ao: 0.97 },
      ];
    } else {
      controls = [
        { y: cuffY, rx: endR, rz: endR * 0.94, xOff: armOutX(1.0), zOff: armZ(1.0), ao: 0.93 },
        {
          y: shoulderY - length * 0.72,
          rx: endR + (topR - endR) * 0.34,
          rz: (endR + (topR - endR) * 0.34) * 0.95,
          xOff: armOutX(0.72),
          zOff: armZ(0.72),
          ao: 0.97,
        },
        {
          y: shoulderY - length * 0.44,
          rx: endR + (topR - endR) * 0.68,
          rz: (endR + (topR - endR) * 0.68) * 0.96,
          xOff: armOutX(0.44),
          zOff: armZ(0.44),
          ao: 0.99,
        },
        {
          y: shoulderY - length * 0.16,
          rx: topR * 0.98,
          rz: topR * 0.94,
          xOff: side * (shoulderW * 0.96),
          zOff: -0.005,
          ao: 0.93,
        },
        {
          y: shoulderY - 0.002,
          rx: topR * 0.86,
          rz: topR * 0.86,
          xOff: side * (shoulderW * 0.91),
          zOff: -0.004,
          ao: 0.96,
        },
        {
          y: shoulderY + 0.022,
          rx: topR * 0.46,
          rz: topR * 0.5,
          xOff: side * (shoulderW * 0.83),
          zOff: -0.004,
          ao: 0.97,
        },
      ];
    }

    // Tối ưu mật độ tay áo: 4–5 vòng dọc × 10 cạnh ngang + bịt đáy cổ tay bằng cavityMat kín 100%
    const armBands =
      sleeveStyle === 'hoodie' || sleeveStyle === 'puff' || sleeveStyle === 'shirt'
        ? 4
        : 3;
    const sampled = sampleSplineRings(controls, armBands);
    this.loftTube(sampled, 10, material, slot, partId, {
      capTop: false,
      capBottom: true,
      capBottomMaterial: cavityMat,
      superEllipse: 0.015,
    });

    // Chi tiết đường chỉ cổ tay / măng-séc / bo tay
    if (sleeveStyle === 'hoodie') {
      const ribRing = sampleRingAtT(sampled, 0.14);
      this.addCircumferentialSeam(ribRing, 0.015, 0.002, partId, material, 1.35, 'seamDark');
      const midRib = sampleRingAtT(sampled, 0.06);
      this.addCircumferentialSeam(midRib, 0.015, 0.002, partId, material, 0.9, 'seamDark');
    } else if (sleeveStyle === 'shirt') {
      const cuffSeam = sampleRingAtT(sampled, 0.15);
      this.addCircumferentialSeam(cuffSeam, 0.015, 0.002, partId, material, 1.25, 'seamDark');
      // Cúc măng-séc nhỏ mặt ngoài cổ tay
      const btnRing = sampleRingAtT(sampled, 0.08);
      const btnTheta = side === 1 ? Math.PI * 0.48 : -Math.PI * 0.48;
      this.addDetailDot(
        partId,
        material,
        evalRingPoint(btnRing, btnTheta, 0.015, 1.0, 0.004),
        evalRingNormal(btnRing, btnTheta),
        0.005,
        'button'
      );
    } else if (sleeveStyle === 'polo' || sleeveStyle === 'puff') {
      const bandRing = sampleRingAtT(sampled, 0.12);
      this.addCircumferentialSeam(bandRing, 0.015, 0.002, partId, material, 1.2, 'seamDark');
    }
  }

  /**
   * Dựng đôi giày 3D LIỀN KHỐI 100% WATERTIGHT phân biệt rõ 5 phom dáng:
   * - `sneaker`: đế cao su trắng dày + dây đan chéo X (`lace`) + viền cổ giày
   * - `loafer`: cổ thấp + đế tối mỏng + đai ngang penny strap + đường chỉ mũi apron
   * - `dress_shoes`: mũi thuôn dài nhọn hơn + gót tách biệt + chỉ ngang cap-toe + dây mảnh + bóng da (+25%)
   * - `heels`: mũi nhọn + khoét mu sâu lộ bàn chân mannequin + vòm đế hở gầm + gót cao mảnh tách biệt
   * - `boot`: cổ cao vượt mắt cá + đế dày + khung chun hông kiểu Chelsea Boot
   */
  public addSculptedShoe(
    side: -1 | 1,
    fx: number,
    shoesShape: SilhouetteId,
    isFemale: boolean,
    partId: MeshPartId,
    extendAnkleForPants = false
  ) {
    const segs = 8;
    const toeOutYaw = side * 0.055;
    const cosY = Math.cos(toeOutYaw);
    const sinY = Math.sin(toeOutYaw);
    const fz = 0.022;

    const toWorld = (xLocal: number, y: number, zLocal: number): Vec3 => [
      fx + xLocal * cosY + zLocal * sinY,
      y,
      fz - xLocal * sinY + zLocal * cosY,
    ];
    const toWorldNormal = (nx: number, ny: number, nz: number): Vec3 =>
      safeNormalize(nx * cosY + nz * sinY, ny, -nx * sinY + nz * cosY);

    // =========================================================
    // PHOM ĐẶC BIỆT: GIÀY CAO GÓT (`heels` — Nữ)
    // Mũi nhọn + khoét mu lộ bàn chân + vòm hở gầm + gót cao mảnh tách biệt!
    // =========================================================
    if (shoesShape === 'heels') {
      const halfW = 0.036;
      const toeLen = 0.142;
      const heelZ = -0.054;
      const archLift = 0.058;

      // Hàm tính mặt đất vòm đế cong (chạm đất ở mũi trước z > 0.04, nâng vòm lên ở giữa và gót!)
      const archY = (zLocal: number) => {
        if (zLocal >= 0.055) return 0.0;
        if (zLocal <= -0.025) return archLift;
        const u = (0.055 - zLocal) / 0.08;
        return archLift * (u * u * (3 - 2 * u));
      };

      const buildHeelRing = (
        yAddFront: number,
        yAddBack: number,
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
          const zLocal = zShift + (cosT >= 0 ? cosT * toeLen * sToe : cosT * 0.064 * sHeel);
          // Mũi nhọn thanh mảnh đặc trưng giày cao gót
          let wProf = 1.0;
          if (cosT > 0.15) {
            const t = (cosT - 0.15) / 0.85;
            wProf = 1 - 0.56 * Math.pow(t, 1.55);
          } else if (cosT < -0.15) {
            const t = (-cosT - 0.15) / 0.85;
            wProf = 1 - 0.24 * t;
          }
          const xLocal = sinT * halfW * sX * wProf;
          const backMix = 0.5 - 0.5 * cosT;
          const y = archY(zLocal) + yAddFront + (yAddBack - yAddFront) * backMix;
          const [wx, wy, wz] = toWorld(xLocal, y, zLocal);
          row.push(this.addVertex(wx, wy, wz));
        }
        return row;
      };

      const connectPair = (
        lowRow: number[],
        highRow: number[],
        refY: number,
        refZ: number,
        mat: MeshMaterialKind,
        ao: number,
        group: number,
        shininess = 0.18
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
            0,
            false,
            mat,
            'shoes',
            ao,
            group,
            shininess
          );
        }
      };

      // 1. Đế cong mảnh tối màu (tạo vòm hở gầm rõ rệt ở góc nghiêng/ngang!)
      const soleGroup = this.allocSmoothGroup();
      const sBot = buildHeelRing(0.0, 0.0, 0.98, 1.0, 0.98);
      const sTop = buildHeelRing(0.009, 0.011, 1.0, 1.0, 1.0);
      connectPair(sBot, sTop, 0.025, fz + 0.02, 'sole_dark', 0.9, soleGroup, 0.05);

      // 2. Thân giày cao gót khoét mu thấp thanh mảnh
      const upperGroup = this.allocSmoothGroup();
      const u0 = buildHeelRing(0.009, 0.011, 1.0, 1.0, 1.0);
      const u1 = buildHeelRing(0.024, 0.036, 0.94, 0.88, 0.92);
      const u2 = buildHeelRing(0.032, 0.058, 0.84, 0.56, 0.86, -0.006);
      connectPair(u0, u1, 0.04, fz + 0.015, 'shoes', 0.98, upperGroup, 0.22);
      connectPair(u1, u2, 0.065, fz, 'shoes', 1.0, upperGroup, 0.22);

      // Lòng đế trên (insole)
      const insoleGroup = this.allocSmoothGroup();
      const inCenter = this.addVertex(...toWorld(0, 0.058, -0.005));
      for (let j = 0; j < segs; j += 2) {
        this.addDirectedQuad(
          u2[j],
          u2[(j + 1) % segs],
          u2[(j + 2) % segs],
          inCenter,
          0,
          1,
          0,
          partId,
          -0.002,
          false,
          'sole_dark',
          'shoes',
          0.74,
          insoleGroup
        );
      }

      // 3. Mu bàn chân & cổ chân mannequin (#D2CCC4) cắm sâu vào gấu quần nếu mặc quần dài
      const footRings: RingDef[] = [
        { y: 0.042, rx: 0.026, rz: 0.042, xOff: fx, zOff: fz + 0.006, ao: 0.94 },
        { y: 0.105, rx: 0.03, rz: 0.032, xOff: fx, zOff: fz - 0.018, ao: 0.96 },
      ];
      if (extendAnkleForPants) {
        footRings.push({ y: 0.145, rx: 0.031, rz: 0.033, xOff: fx, zOff: 0.0, ao: 0.92 });
      }
      this.loftTube(footRings, 8, 'mannequin_leg', 'shoes', partId, {
        capTop: true,
        capBottom: false,
        zBias: 0.004,
      });

      // 4. GÓT NHỌN MẢNH TÁCH BIỆT RÕ RÀNG (Stiletto Heel Post gọn nhẹ)
      const [hx, , hz] = toWorld(0, 0, heelZ);
      const stilettoRings: RingDef[] = [
        { y: 0.009, rx: 0.0074, rz: 0.0078, xOff: hx, zOff: hz, ao: 0.88 },
        { y: 0.068, rx: 0.0155, rz: 0.0175, xOff: hx, zOff: hz + 0.005, ao: 0.96 },
      ];
      this.loftTube(stilettoRings, 6, 'shoes', 'shoes', partId, {
        capTop: false,
        capBottom: false,
        shininess: 0.22,
      });
      // Đệm gót cao su đen ở đầu nhọn tiếp sàn
      this.loftTube(
        [
          { y: 0.0, rx: 0.0072, rz: 0.0076, xOff: hx, zOff: hz, ao: 0.8 },
          { y: 0.009, rx: 0.0074, rz: 0.0078, xOff: hx, zOff: hz, ao: 0.84 },
        ],
        6,
        'sole_dark',
        'shoes',
        partId,
        { capTop: false, capBottom: false }
      );

      // Viền khoét mu thanh mảnh
      this.addDetailLine(
        partId,
        'shoes',
        [
          toWorld(-halfW * 0.72, 0.045, 0.015),
          toWorld(-halfW * 0.45, 0.034, 0.062),
          toWorld(0, 0.031, 0.072),
          toWorld(halfW * 0.45, 0.034, 0.062),
          toWorld(halfW * 0.72, 0.045, 0.015),
        ],
        toWorldNormal(0, 0.6, 0.8),
        1.1,
        'seamDark'
      );
      return;
    }

    // =========================================================
    // 4 PHOM GIÀY CÒN LẠI: SNEAKER | LOAFER | DRESS_SHOES | BOOT
    // =========================================================
    const isLoafer = shoesShape === 'loafer';
    const isDress = shoesShape === 'dress_shoes';
    const isBoot = shoesShape === 'boot';
    const isSneaker = !isLoafer && !isDress && !isBoot;

    const soleMat: MeshMaterialKind = isSneaker ? 'sole_white' : 'sole_dark';
    const soleH = isSneaker ? 0.032 : isBoot ? 0.031 : isDress ? 0.014 : 0.015;
    const halfW = isFemale
      ? isLoafer
        ? 0.036
        : 0.041
      : isDress
      ? 0.04
      : isLoafer
      ? 0.041
      : 0.046;
    const toeLen = isDress
      ? 0.162
      : isFemale
      ? 0.128
      : isLoafer
      ? 0.146
      : 0.142;
    const heelLen = isFemale ? 0.066 : 0.074;
    const upperShininess = isDress ? 0.28 : isLoafer ? 0.1 : 0;

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

        const zLocal =
          zShift + (cosT >= 0 ? cosT * toeLen * sToe : cosT * heelLen * sHeel);
        let wProf = 1.0;
        if (cosT > 0.2) {
          const t = (cosT - 0.2) / 0.8;
          // Giày da mũi thuôn nhọn rõ; Loafer thuôn vừa; Sneaker bo tròn thể thao
          const taper = isDress ? 0.42 : isLoafer ? 0.28 : 0.13;
          wProf = 1 - taper * Math.pow(t, isDress ? 1.65 : 2.0);
        } else if (cosT < -0.15) {
          const t = (-cosT - 0.15) / 0.85;
          wProf = 1 - 0.15 * t;
        }
        const xLocal = sinT * halfW * sX * wProf;
        const backMix = 0.5 - 0.5 * cosT;
        const y = yFront + (yBack - yFront) * backMix;

        const [rx, ry, rz] = toWorld(xLocal, y, zLocal);
        row.push(this.addVertex(rx, ry, rz));
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
      zBias = 0,
      shininess = 0
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
          smoothGroup,
          shininess
        );
      }
    };

    // 1. ĐẾ GIÀY LIỀN MẠCH (Giày Tây & Boot có khối gót tách biệt rõ)
    const soleGroup = this.allocSmoothGroup();
    const soleBot = buildLastRing(
      0.0,
      0.0,
      isSneaker ? 1.04 : 1.02,
      isSneaker ? 1.02 : 1.01,
      1.02
    );
    const soleTop = buildLastRing(
      soleH,
      isDress ? soleH + 0.01 : isLoafer ? soleH + 0.005 : soleH,
      isSneaker ? 1.05 : 1.02,
      isSneaker ? 1.03 : 1.01,
      1.02
    );
    connectRingPair(soleBot, soleTop, soleH * 0.5, fz + 0.02, soleMat, isSneaker ? 0.99 : 0.91, soleGroup);

    // 2. THÂN GIÀY + MU BÀN CHÂN + CỔ GIÀY LIỀN KHỐI GỌN NHẸ
    const upperGroup = this.allocSmoothGroup();
    const heelLift = isDress ? 0.01 : isLoafer ? 0.005 : 0;
    const r0 = isSneaker
      ? buildLastRing(soleH, soleH + heelLift, 0.99, 0.99, 0.99)
      : buildLastRing(soleH, soleH + heelLift, 1.02, 1.01, 1.02);

    if (isSneaker) {
      // Bịt kín gờ trắng đế Sneaker
      this.bridgeEdgeStrip(
        [...soleTop, soleTop[0]],
        [...r0, r0[0]],
        0,
        1,
        0,
        partId,
        0.001,
        soleMat,
        'shoes',
        0.96
      );
    }

    const rMid = buildLastRing(
      soleH + (isDress ? 0.024 : isLoafer ? 0.025 : 0.042),
      soleH + heelLift + (isDress ? 0.044 : isLoafer ? 0.042 : 0.062),
      0.9,
      isDress ? 0.76 : 0.78,
      0.88,
      -0.005
    );
    const rAnkleBase = buildLastRing(
      soleH + (isDress ? 0.044 : isLoafer ? 0.039 : 0.066),
      soleH + heelLift + (isDress ? 0.056 : isLoafer ? 0.048 : 0.078),
      0.86,
      0.34,
      0.72,
      -0.018
    );

    connectRingPair(r0, rMid, soleH + 0.026, fz + 0.012, 'shoes', 0.98, upperGroup, 0, upperShininess);
    connectRingPair(rMid, rAnkleBase, soleH + 0.056, fz, 'shoes', 1.0, upperGroup, 0, upperShininess);

    let topRing = rAnkleBase;
    let topY = soleH + heelLift + (isLoafer ? 0.045 : isDress ? 0.054 : 0.072);

    if (isBoot) {
      // Boot cổ cao vượt hẳn mắt cá chân ôm gọn bắp chân dưới!
      const bootTopY = isFemale ? 0.215 : 0.232;
      const rBootTop = buildLastRing(bootTopY, bootTopY + 0.005, 0.9, 0.34, 0.68, -0.02);
      connectRingPair(rAnkleBase, rBootTop, (topY + bootTopY) * 0.5, fz - 0.018, 'shoes', 0.96, upperGroup);
      topRing = rBootTop;
      topY = bootTopY + 0.002;
    }

    // Đóng kín cổ giày (lòng cổ giày tối màu)
    const topCapGroup = this.allocSmoothGroup();
    const topCenter = this.addVertex(...toWorld(0, topY - 0.004, -0.018));
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

    // Khớp cổ chân mannequin cắm sâu từ bên trong cổ giày lên tận bên trong gấu quần dài
    if (extendAnkleForPants && !isBoot) {
      const ankleRx = isFemale ? 0.028 : 0.034;
      const ankleRz = isFemale ? 0.03 : 0.036;
      const [ax0, , az0] = toWorld(0, 0, -0.018);
      this.loftTube(
        [
          { y: Math.max(0.028, soleH + 0.012), rx: ankleRx * 0.94, rz: ankleRz * 0.94, xOff: ax0, zOff: az0, ao: 0.86 },
          { y: 0.148, rx: ankleRx * 1.06, rz: ankleRz * 1.06, xOff: fx, zOff: 0.0, ao: 0.9 },
        ],
        6,
        'mannequin_leg',
        'shoes',
        partId,
        {
          zBias: -0.003,
          capTop: false,
          capBottom: false,
          superEllipse: 0.01,
        }
      );
    }

    // 3. CHI TIẾT NHẬN DIỆN 3D PROJECTED SURFACE DETAILS CHO TỪNG LOẠI GIÀY
    if (isSneaker) {
      // Dây giày đan chéo 3 cặp chữ X (`lace`) nổi bật trên mu Sneaker
      const laceNorm = toWorldNormal(0, 0.68, 0.73);
      for (let k = 0; k < 3; k++) {
        const z0 = 0.022 + k * 0.022;
        const z1 = z0 + 0.018;
        const y0 = soleH + 0.066 - k * 0.011;
        const y1 = soleH + 0.056 - k * 0.011;
        const w = halfW * (0.44 - k * 0.03);
        this.addDetailLine(partId, 'shoes', [toWorld(-w, y0, z0), toWorld(w, y1, z1)], laceNorm, 1.55, 'lace');
        this.addDetailLine(partId, 'shoes', [toWorld(w, y0, z0), toWorld(-w, y1, z1)], laceNorm, 1.55, 'lace');
      }
      // Đường chỉ phân cách đế trắng midsole
      this.addDetailLine(
        partId,
        'sole_white',
        [
          toWorld(-halfW * 1.01, soleH * 0.48, -heelLen * 0.6),
          toWorld(-halfW * 1.03, soleH * 0.48, 0.02),
          toWorld(-halfW * 0.9, soleH * 0.48, toeLen * 0.78),
        ],
        toWorldNormal(-1, 0, 0.15),
        0.95,
        'seamDark'
      );
      this.addDetailLine(
        partId,
        'sole_white',
        [
          toWorld(halfW * 1.01, soleH * 0.48, -heelLen * 0.6),
          toWorld(halfW * 1.03, soleH * 0.48, 0.02),
          toWorld(halfW * 0.9, soleH * 0.48, toeLen * 0.78),
        ],
        toWorldNormal(1, 0, 0.15),
        0.95,
        'seamDark'
      );
      // Viền cổ giày bên hông
      ([-1, 1] as const).forEach(s => {
        this.addDetailLine(
          partId,
          'shoes',
          [
            toWorld(s * halfW * 0.82, soleH + 0.072, -heelLen * 0.55),
            toWorld(s * halfW * 0.86, soleH + 0.062, -0.005),
            toWorld(s * halfW * 0.72, soleH + 0.056, 0.035),
          ],
          toWorldNormal(s, 0.1, 0.1),
          1.1,
          'seamDark'
        );
      });
    } else if (isLoafer) {
      // Đai ngang mu giày (Penny Strap) + khóa kim loại nhỏ + đường chỉ mũi chữ U (Apron Seam)
      const vampNorm = toWorldNormal(0, 0.72, 0.69);
      const strapY = soleH + 0.039;
      this.addDetailLine(
        partId,
        'shoes',
        [
          toWorld(-halfW * 0.84, strapY - 0.004, 0.022),
          toWorld(0, strapY + 0.007, 0.034),
          toWorld(halfW * 0.84, strapY - 0.004, 0.022),
        ],
        vampNorm,
        2.6,
        'contrastDark'
      );
      this.addDetailDot(partId, 'shoes', toWorld(0, strapY + 0.009, 0.035), vampNorm, 0.006, 'buckle');
      // Đường chỉ nổi chữ U quanh mũi Loafer (Apron seam)
      this.addDetailLine(
        partId,
        'shoes',
        [
          toWorld(-halfW * 0.66, soleH + 0.032, 0.045),
          toWorld(-halfW * 0.52, soleH + 0.026, toeLen * 0.7),
          toWorld(0, soleH + 0.024, toeLen * 0.8),
          toWorld(halfW * 0.52, soleH + 0.026, toeLen * 0.7),
          toWorld(halfW * 0.66, soleH + 0.032, 0.045),
        ],
        toWorldNormal(0, 0.62, 0.78),
        1.15,
        'seamDark'
      );
    } else if (isDress) {
      // Giày Da / Giày Tây: đường chỉ ngang mũi Cap-Toe + dây buộc mảnh Oxford + rãnh tách gót
      const toeNorm = toWorldNormal(0, 0.58, 0.81);
      this.addDetailLine(
        partId,
        'shoes',
        [
          toWorld(-halfW * 0.66, soleH + 0.021, toeLen * 0.62),
          toWorld(0, soleH + 0.027, toeLen * 0.66),
          toWorld(halfW * 0.66, soleH + 0.021, toeLen * 0.62),
        ],
        toeNorm,
        1.25,
        'seamDark'
      );
      // 3 dây mảnh Oxford nằm ngang sát mu giày
      const laceNorm = toWorldNormal(0, 0.7, 0.71);
      for (let k = 0; k < 3; k++) {
        const z = 0.024 + k * 0.018;
        const y = soleH + 0.049 - k * 0.007;
        const w = halfW * 0.34;
        this.addDetailLine(partId, 'shoes', [toWorld(-w, y, z), toWorld(w, y, z)], laceNorm, 1.1, 'contrastDark');
      }
      // Rãnh tách khối gót giày Tây nhìn từ 2 bên hông
      ([-1, 1] as const).forEach(s => {
        this.addDetailLine(
          partId,
          'sole_dark',
          [
            toWorld(s * halfW * 0.94, 0.0, -0.012),
            toWorld(s * halfW * 0.94, soleH + 0.008, -0.012),
          ],
          toWorldNormal(s, 0, 0),
          1.4,
          'seamLight'
        );
      });
    } else if (isBoot) {
      // Chelsea Boot: mảng chun đàn hồi hình chữ U ở 2 bên cổ boot + đường viền cổ trên
      ([-1, 1] as const).forEach(s => {
        const sNorm = toWorldNormal(s, 0, 0.08);
        this.addDetailLine(
          partId,
          'shoes',
          [
            toWorld(s * halfW * 0.84, topY - 0.012, -0.042),
            toWorld(s * halfW * 0.84, soleH + 0.072, -0.036),
            toWorld(s * halfW * 0.84, soleH + 0.062, -0.014),
            toWorld(s * halfW * 0.84, soleH + 0.072, 0.008),
            toWorld(s * halfW * 0.84, topY - 0.012, 0.014),
          ],
          sNorm,
          1.45,
          'contrastDark'
        );
        // Rãnh chia đế dày Boot & khối gót
        this.addDetailLine(
          partId,
          'sole_dark',
          [
            toWorld(s * halfW * 0.98, 0.002, -0.015),
            toWorld(s * halfW * 0.98, soleH, -0.015),
          ],
          sNorm,
          1.4,
          'seamLight'
        );
      });
      // Quai kéo nhỏ sau cổ boot (nhìn rõ ở góc Sau)
      this.addDetailLine(
        partId,
        'shoes',
        [
          toWorld(-0.008, topY - 0.016, -heelLen * 0.72),
          toWorld(-0.008, topY + 0.012, -heelLen * 0.74),
          toWorld(0.008, topY + 0.012, -heelLen * 0.74),
          toWorld(0.008, topY - 0.016, -heelLen * 0.72),
        ],
        toWorldNormal(0, 0.2, -1),
        1.5,
        'contrastDark'
      );
    }
  }

  /**
   * Auto-Fit Bounding Box về đúng tâm (0, 0, 0), chuẩn hóa chiều cao = 2.8,
   * chuẩn hóa đồng bộ positions + detailLines + detailDots,
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

    const normPt = (p: Vec3): Vec3 => [
      (p[0] - bCx) * normScale,
      (p[1] - bCy) * normScale,
      (p[2] - bCz) * normScale,
    ];

    const detailLines: DetailLine3D[] = this.rawLines.map(line => ({
      ...line,
      points: line.points.map(normPt),
      normal: safeNormalize(line.normal[0], line.normal[1], line.normal[2]),
    }));

    const detailDots: DetailDot3D[] = this.rawDots.map(dot => ({
      ...dot,
      center: normPt(dot.center),
      normal: safeNormalize(dot.normal[0], dot.normal[1], dot.normal[2]),
      radius: dot.radius * normScale,
    }));

    const qCount = this.rawQuads.length;
    const faceNx = new Float32Array(qCount);
    const faceNy = new Float32Array(qCount);
    const faceNz = new Float32Array(qCount);

    const smoothAccum = new Map<number, Vec3>();
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
      'mannequinCore',
      'bottomCore',
      'pelvis',
      'neckCavity',
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
        isHemSeal: rq.isHemSeal,
        material: rq.material,
        slot: rq.slot,
        ao: rq.ao,
        shininess: rq.shininess,
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

    const partCenters = {} as Record<MeshPartId, Vec3>;
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
      detailLines,
      detailDots,
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
// HELPER: THIẾT KẾ LẠI HOÀN TOÀN MŨ HOODIE RŨ LƯNG TỰ NHIÊN
// (KHÔNG DỰNG KHỐI CẦU LỒI XẤU — ÔM CỔ CHÉO MẶT TRƯỚC, RŨ DẸT MỀM SAU LƯNG)
// =============================================================

function addRedesignedHoodieHood(
  mb: SmoothQuadBuilder,
  neckRx: number,
  neckRz: number,
  material: MeshMaterialKind,
  slot: OutfitSlotId,
  collarPartId: MeshPartId,
  isOuter: boolean
) {
  const scale = isOuter ? 1.07 : 1.0;
  const liningMat: MeshMaterialKind = isOuter ? 'outer_lining' : 'top_lining';
  const cavityMat: MeshMaterialKind = isOuter ? 'outer_cavity' : 'inner_cavity';

  // 1. Vòng cổ mũ 2 mặt dày kín gọn nhẹ
  const collarRings: RingDef[] = [
    {
      y: isOuter ? 1.468 : 1.448,
      rx: neckRx * 1.32 * scale,
      rz: neckRz * 1.24 * scale,
      zOff: -0.01,
      ao: 0.94,
      neckDrop: 0.02,
      frontGap: isOuter ? 0.48 : 0,
    },
    {
      y: 1.51,
      rx: neckRx * 1.12 * scale,
      rz: neckRz * 1.08 * scale,
      zOff: -0.016,
      ao: 0.97,
      neckDrop: 0.012,
      frontGap: isOuter ? 0.54 : 0,
    },
  ];
  mb.addThickCollar(collarRings, 8, material, liningMat, slot, collarPartId, {
    zBias: 0.01,
    openFront: isOuter,
    superEllipse: 0.015,
    thickness: 0.01,
    innerIsDeepCavity: false,
  });

  // Đường xếp lớp chéo cổ mũ mặt trước (chỉ vẽ khi mặc hoodie kín)
  if (!isOuter) {
    const midCollar = sampleRingAtT(collarRings, 0.5);
    mb.addDetailLine(
      collarPartId,
      material,
      [
        evalRingPoint(collarRings[1], -0.45, 0.015, 1.0, 0.004),
        evalRingPoint(midCollar, -0.1, 0.015, 1.0, 0.005),
        evalRingPoint(collarRings[0], 0.24, 0.015, 1.0, 0.004),
      ],
      [0, 0.2, 1],
      1.35,
      'seamDark'
    );
    mb.addDetailLine(
      collarPartId,
      material,
      [
        evalRingPoint(collarRings[1], 0.45, 0.015, 1.0, 0.004),
        evalRingPoint(midCollar, 0.1, 0.015, 1.0, 0.005),
        evalRingPoint(collarRings[0], -0.24, 0.015, 1.0, 0.004),
      ],
      [0, 0.2, 1],
      1.35,
      'seamDark'
    );
  }

  // 2. Vạt mũ rũ phẳng mềm hình giọt nước ôm sát vùng lưng trên (`hoodBack`, -Z) — tối ưu số vòng gọn nhẹ
  const backZBase = isOuter ? -0.132 : -0.114;
  const drapeControls: RingDef[] = [
    { y: 1.235, rx: 0.056 * scale, rz: 0.019 * scale, zOff: backZBase - 0.008, ao: 0.89 },
    { y: 1.32, rx: 0.126 * scale, rz: 0.038 * scale, zOff: backZBase - 0.019, ao: 0.97 },
    { y: 1.42, rx: 0.132 * scale, rz: 0.044 * scale, zOff: backZBase + 0.002, ao: 0.98 },
    { y: 1.494, rx: neckRx * 1.18 * scale, rz: 0.044 * scale, zOff: -0.06 * scale, ao: 0.96 },
  ];
  const drapeSampled = sampleSplineRings(drapeControls, 3);
  mb.loftTube(drapeSampled, 8, material, slot, 'hoodBack', {
    capTop: true,
    capBottom: true,
    capTopMaterial: cavityMat,
    superEllipse: 0.02,
  });

  // Đường sống mũ chạy dọc giữa mặt sau vạt mũ + viền nếp rũ hai bên (nhìn cực đẹp ở góc Nghiêng & Sau)
  mb.addSurfaceCurve(
    drapeSampled,
    0.02,
    6,
    0.06,
    0.94,
    () => Math.PI,
    0.003,
    'hoodBack',
    material,
    1.35,
    'seamDark'
  );
  ([-1, 1] as const).forEach(s => {
    mb.addSurfaceCurve(
      drapeSampled,
      0.02,
      5,
      0.12,
      0.86,
      () => Math.PI + s * 0.62,
      0.003,
      'hoodBack',
      material,
      1.0,
      'seamLight'
    );
  });
}

// =============================================================
// HÀM CHÍNH: DỰNG LƯỚI 3D TRƠN MỊN + CHI TIẾT BỀ MẶT (~1.100–1.500 QUADS)
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

  const isSoloBabyTee = !isLayering && topShape === 'baby_tee';
  const isSoloBlouse = !isLayering && topShape === 'blouse';
  const isSoloHoodie = !isLayering && topShape === 'hoodie';
  const isSoloPolo = !isLayering && topShape === 'polo';
  const isSoloShirt = !isLayering && topShape === 'shirt';
  const isSoloBlazer = !isLayering && topShape === 'blazer';

  // -----------------------------------------------------------
  // 1. LÕI MANNEQUIN CỔ/QUAI XANH (`blouse`) & TRỤ EO KÍN 360° (`baby_tee`) -> `mannequinCore`
  //    Vẽ TRƯỚC `bottom` và `torsoLayerGroup` (cắm sâu +0.14 vào áo trên & -0.14 xuống cạp quần/váy dưới)
  // -----------------------------------------------------------
  if (isSoloBlouse) {
    // Cổ & xương quai xanh ma-nơ-canh (#D2CCC4) đóng kín đỉnh, cắm sâu vào ngực áo kiểu
    mb.loftTube(
      sampleSplineRings(
        [
          { y: 1.24, rx: 0.122, rz: 0.086, ao: 0.88 },
          { y: 1.385, rx: 0.12, rz: 0.085, ao: 0.97 },
          { y: 1.465, rx: neckRx * 0.94, rz: neckRz * 0.9, ao: 0.96 },
          { y: 1.505, rx: neckRx * 0.82, rz: neckRz * 0.8, ao: 0.92 },
        ],
        3
      ),
      12,
      'mannequin_leg',
      'top',
      'mannequinCore',
      { capTop: true, capBottom: false }
    );
  }

  if (isSoloBabyTee) {
    // Trụ thân eo ma-nơ-canh kín 360° cắm sâu -0.146 xuống trong cạp quần/váy (y = 0.75)
    // và +0.145 lên trong gấu Baby Tee (y = 1.18) -> 0% khe hở ngang eo
    const midriffRx = isFemale ? 0.109 : 0.136;
    const midriffRz = isFemale ? 0.083 : 0.085;
    mb.loftTube(
      sampleSplineRings(
        [
          { y: 0.75, rx: midriffRx * 0.92, rz: midriffRz * 0.88, zOff: -0.004, ao: 0.86 },
          { y: 0.93, rx: midriffRx * 1.01, rz: midriffRz * 0.99, zOff: -0.006, ao: 0.98 },
          { y: 1.04, rx: midriffRx * 0.99, rz: midriffRz * 0.99, zOff: -0.007, ao: 0.96 },
          { y: 1.18, rx: midriffRx * 0.88, rz: midriffRz * 0.88, zOff: -0.007, ao: 0.88 },
        ],
        3
      ),
      14,
      'mannequin_leg',
      'top',
      'mannequinCore',
      { capTop: false, capBottom: false, superEllipse: 0.014 }
    );
  }

  let activeTopHemY = isSoloBabyTee ? 1.035 : isSoloBlazer ? 0.8 : 0.87;

  // -----------------------------------------------------------
  // 2. THÂN ÁO CHÍNH KHI MẶC LẺ (`!isLayering`, `torsoCore` -> `top`, 24 CẠNH VÒNG)
  // -----------------------------------------------------------
  if (!isLayering) {
    const baseShoulderW = isFemale ? 0.174 : 0.21;
    const baseChestW = isFemale ? 0.158 : 0.19;
    const baseWaistW = isFemale ? 0.122 : 0.162;
    const baseHipW = isFemale ? 0.162 : 0.172;
    const baseChestD = isFemale ? 0.112 : 0.118;

    const shoulderW =
      baseShoulderW *
      (isSoloHoodie ? 1.09 : isSoloBlazer ? 1.06 : isSoloBabyTee ? 0.95 : 1.0);
    const chestW =
      baseChestW *
      (isSoloHoodie ? 1.13 : isSoloBabyTee ? 0.95 : isSoloPolo ? 0.98 : 1.0);
    const waistW =
      baseWaistW *
      (isSoloHoodie ? 1.18 : isSoloBabyTee ? 0.93 : isSoloBlouse ? 0.95 : isSoloPolo ? 0.96 : 1.0);
    const hipW =
      baseHipW *
      (isSoloHoodie ? 0.94 : isSoloBlazer ? 1.03 : isSoloBabyTee ? 0.92 : 1.0);
    const chestD = baseChestD * (isSoloHoodie ? 1.12 : isSoloBabyTee ? 0.96 : 1.0);

    const hemY = activeTopHemY;
    const torsoSq = isSoloBlazer ? 0.028 : 0.018;

    let torsoControls: RingDef[];

    if (isSoloHoodie) {
      // Hoodie: thân trên rộng rãi -> BÓ GỌN RÕ RỆT ở bo gấu (ribbed waistband hem y=0.87..0.935)
      torsoControls = [
        { y: 0.87, rx: baseHipW * 0.93, rz: 0.095, ao: 0.92 },
        { y: 0.93, rx: baseHipW * 0.95, rz: 0.098, ao: 0.95 },
        // Phần phồng rủ nhẹ ngay trên bo gấu áo
        { y: 0.985, rx: baseHipW * 1.11, rz: 0.118, zOff: -0.004, ao: 0.99 },
        { y: 1.11, rx: waistW, rz: 0.116, zOff: -0.006, ao: 1.0 },
        { y: 1.29, rx: chestW, rz: chestD, chestBulge: isFemale ? 0.018 : 0.008, backArch: 0.008, ao: 1.0 },
        { y: 1.38, rx: shoulderW, rz: 0.106, ao: 0.98 },
        { y: 1.44, rx: shoulderW * 0.64, rz: 0.088, ao: 0.95, neckDrop: 0.014 },
        { y: 1.482, rx: neckRx * 1.12, rz: neckRz * 1.1, ao: 0.92, neckDrop: 0.024 },
      ];
    } else if (isSoloBabyTee) {
      // Baby Tee: cắt ngắn trên rốn (y = 1.035) + ôm sát đường cong cơ thể
      torsoControls = [
        { y: 1.035, rx: waistW * 1.03, rz: 0.095, zOff: -0.007, ao: 0.96 },
        { y: 1.12, rx: waistW * 1.01, rz: 0.096, zOff: -0.008, backArch: -0.008, ao: 0.99 },
        { y: 1.21, rx: chestW * 0.96, rz: 0.105, zOff: -0.003, ao: 1.0 },
        { y: 1.295, rx: chestW, rz: chestD, chestBulge: 0.025, backArch: 0.007, ao: 1.0 },
        { y: 1.385, rx: shoulderW, rz: 0.092, ao: 0.97 },
        { y: 1.442, rx: shoulderW * 0.62, rz: 0.078, ao: 0.95, neckDrop: 0.018 },
        { y: 1.49, rx: neckRx * 1.02, rz: neckRz * 1.0, ao: 0.91, neckDrop: 0.044 },
      ];
    } else if (isSoloBlouse) {
      // Áo kiểu (Blouse): cổ vuông rộng hạ thấp mặt trước lộ xương quai xanh + chiết eo mềm mại
      torsoControls = [
        { y: 0.87, rx: hipW * 1.02, rz: 0.104, ao: 0.95 },
        { y: 0.97, rx: waistW + 0.012, rz: 0.096, zOff: -0.006, ao: 0.98 },
        { y: 1.08, rx: waistW, rz: 0.094, zOff: -0.01, backArch: -0.009, ao: 1.0 },
        { y: 1.2, rx: chestW - 0.006, rz: 0.108, zOff: -0.003, ao: 1.0 },
        { y: 1.295, rx: chestW, rz: chestD, chestBulge: 0.024, backArch: 0.007, ao: 1.0 },
        { y: 1.385, rx: shoulderW, rz: 0.094, ao: 0.97, squareNeckDrop: 0.024 },
        { y: 1.44, rx: shoulderW * 0.68, rz: 0.082, ao: 0.96, squareNeckDrop: 0.068 },
        { y: 1.482, rx: neckRx * 1.24, rz: neckRz * 1.12, ao: 0.94, squareNeckDrop: 0.108 },
      ];
    } else {
      torsoControls = [
        {
          y: hemY,
          rx: hipW,
          rz: 0.104,
          ao: 0.94,
          sideHemRise: isSoloShirt ? 0.024 : 0,
        },
        { y: 0.97, rx: waistW + 0.015, rz: 0.1, zOff: -0.006, ao: 0.97 },
        { y: 1.08, rx: waistW, rz: 0.096, zOff: -0.01, backArch: -0.008, ao: 0.99 },
        { y: 1.19, rx: chestW - 0.008, rz: 0.107, zOff: -0.003, ao: 1.0 },
        {
          y: 1.295,
          rx: chestW,
          rz: chestD,
          chestBulge: isFemale ? 0.022 : 0.009,
          backArch: 0.007,
          ao: 1.0,
        },
        { y: 1.385, rx: shoulderW, rz: 0.095, ao: 0.97 },
        { y: 1.442, rx: shoulderW * 0.62, rz: 0.08, ao: 0.95, neckDrop: 0.018 },
        { y: 1.49, rx: neckRx * 1.03, rz: neckRz * 1.01, ao: 0.91, neckDrop: 0.042 },
      ];
    }

    const torsoSegs = 16;
    const torsoSampled = sampleSplineRings(torsoControls, 6);
    mb.loftTube(torsoSampled, torsoSegs, 'top', 'top', 'torsoCore', {
      zBias: 0,
      superEllipse: torsoSq,
    });

    // BỊT KÍN MIỆNG CỔ ÁO (`neckCavity` bám khít mép `topRim` -> 100% Watertight, 0 khe hở, tiết kiệm quad!)
    const topRim = torsoSampled[torsoSampled.length - 1];
    if (isSoloBlouse) {
      mb.loftTube(
        [
          {
            ...topRim,
            y: topRim.y - 0.026,
            rx: Math.max(0.024, topRim.rx - 0.012),
            rz: Math.max(0.024, topRim.rz - 0.012),
            ao: 0.66,
          },
          {
            ...topRim,
            ao: 0.82,
          },
        ],
        torsoSegs,
        'inner_cavity',
        'top',
        'neckCavity',
        { inward: true, superEllipse: torsoSq }
      );
    } else {
      mb.loftTube(
        [
          {
            y: topRim.y - 0.09,
            rx: Math.max(0.02, topRim.rx * 0.72),
            rz: Math.max(0.02, topRim.rz * 0.72),
            xOff: topRim.xOff,
            zOff: topRim.zOff,
            ao: 0.58,
          },
          {
            ...topRim,
            ao: 0.82,
          },
        ],
        torsoSegs,
        'inner_cavity',
        'top',
        'neckCavity',
        { inward: true, capBottom: true, superEllipse: torsoSq }
      );
    }

    {
      // Chọn thông số tay áo theo từng phom áo để nhìn 1 giây phân biệt ngay
      let sleeveLen = 0.22;
      let topR = isFemale ? 0.061 : 0.071;
      let endR = isFemale ? 0.053 : 0.061;
      let sleeveStyle: 'standard' | 'hoodie' | 'puff' | 'shirt' | 'polo' | 'cap' = 'standard';

      if (isSoloBabyTee) {
        sleeveLen = 0.132;
        topR = 0.056;
        endR = 0.05;
        sleeveStyle = 'cap';
      } else if (isSoloPolo) {
        sleeveLen = 0.248;
        topR = 0.068;
        endR = 0.052;
        sleeveStyle = 'polo';
      } else if (isSoloBlouse) {
        sleeveLen = 0.335;
        topR = 0.068;
        endR = 0.041;
        sleeveStyle = 'puff';
      } else if (isSoloShirt) {
        sleeveLen = 0.46;
        topR = isFemale ? 0.061 : 0.071;
        endR = 0.041;
        sleeveStyle = 'shirt';
      } else if (isSoloHoodie) {
        sleeveLen = 0.485;
        topR = isFemale ? 0.076 : 0.084;
        endR = 0.041;
        sleeveStyle = 'hoodie';
      } else if (isSoloBlazer) {
        sleeveLen = 0.48;
        topR = isFemale ? 0.064 : 0.074;
        endR = 0.047;
        sleeveStyle = 'standard';
      }

      // Khóa kín khớp Vai – Nách (`shoulderJoint`) chống hở khe khi xoay ngang 90°
      mb.addShoulderJoint(-1, shoulderW, 1.385, topR, 'top', 'top', 'torsoCore');
      mb.addShoulderJoint(1, shoulderW, 1.385, topR, 'top', 'top', 'torsoCore');

      mb.addSculptedArm(-1, shoulderW, 1.385, sleeveLen, topR, endR, 'top', 'inner_cavity', 'top', 'leftArm', sleeveStyle);
      mb.addSculptedArm(1, shoulderW, 1.385, sleeveLen, topR, endR, 'top', 'inner_cavity', 'top', 'rightArm', sleeveStyle);

      // ----- CHI TIẾT NHẬN DIỆN TỪNG DÁNG ÁO (TOP) -----
      if (topShape === 'tshirt' || isSoloBabyTee) {
        // Viền cổ tròn mảnh & đường chỉ gấu áo gọn
        const neckTrimRing = sampleRingAtT(torsoSampled, 0.97);
        mb.addCircumferentialSeam(neckTrimRing, torsoSq, 0.0025, 'torsoCore', 'top', 1.25, 'seamDark');
        const hemTrimRing = sampleRingAtT(torsoSampled, 0.04);
        mb.addCircumferentialSeam(hemTrimRing, torsoSq, 0.002, 'torsoCore', 'top', 1.0, 'seamDark');
      } else if (isSoloPolo) {
        // Cổ bẻ gập 2 mặt dày kín 100% Watertight (12 cạnh gọn nhẹ)
        mb.addThickCollar(
          [
            { y: 1.466, rx: neckRx * 1.18, rz: neckRz * 1.16, ao: 0.96, neckDrop: 0.032 },
            { y: 1.516, rx: neckRx * 1.05, rz: neckRz * 1.04, ao: 1.0, neckDrop: 0.022 },
          ],
          12,
          'top',
          'top_lining',
          'top',
          'torsoCore',
          { zBias: 0.012, thickness: 0.0085 }
        );
        // 2 lá cổ bẻ chữ V mặt trước
        ([-1, 1] as const).forEach(s => {
          const rHigh = sampleRingAtT(torsoSampled, 0.95);
          const rTip = sampleRingAtT(torsoSampled, 0.85);
          mb.addDetailLine(
            'torsoCore',
            'top',
            [
              evalRingPoint(rHigh, s * 0.06, torsoSq, 1.0, 0.007),
              evalRingPoint(rTip, s * 0.34, torsoSq, 1.0, 0.006),
              evalRingPoint(rHigh, s * 0.56, torsoSq, 1.0, 0.006),
            ],
            [s * 0.25, 0.15, 0.95],
            1.4,
            'seamDark'
          );
        });
        // Trụ nẹp cúc ngắn xuống 1/3 ngực + 3 cúc nổi bật
        mb.addConformingPatch(
          [
            sampleRingAtT(torsoSampled, 0.6),
            sampleRingAtT(torsoSampled, 0.77),
            sampleRingAtT(torsoSampled, 0.93),
          ],
          torsoSq,
          () => -0.075,
          () => 0.075,
          0.006,
          1,
          'top',
          'top',
          'torsoCore',
          { zBias: 0.012, ao: 1.03 }
        );
        mb.addSurfaceCurve(torsoSampled, torsoSq, 4, 0.6, 0.93, () => -0.078, 0.007, 'torsoCore', 'top', 1.15, 'seamDark');
        mb.addSurfaceCurve(torsoSampled, torsoSq, 4, 0.6, 0.93, () => 0.078, 0.007, 'torsoCore', 'top', 1.15, 'seamDark');
        const placketBot = sampleRingAtT(torsoSampled, 0.6);
        mb.addDetailLine(
          'torsoCore',
          'top',
          [
            evalRingPoint(placketBot, -0.078, torsoSq, 1.0, 0.007),
            evalRingPoint(placketBot, 0.078, torsoSq, 1.0, 0.007),
          ],
          [0, 0, 1],
          1.2,
          'seamDark'
        );
        [0.66, 0.76, 0.86].forEach(tBtn => {
          const r = sampleRingAtT(torsoSampled, tBtn);
          mb.addDetailDot('torsoCore', 'top', evalRingPoint(r, 0, torsoSq, 1.0, 0.009), [0, 0, 1], 0.0065, 'button');
        });
      } else if (isSoloBlouse) {
        // Viền cổ vuông sắc nét (trái - ngang ngực - phải) + 2 đường chiết eo nữ tính
        const sqTop = sampleRingAtT(torsoSampled, 0.98);
        mb.addDetailLine(
          'torsoCore',
          'top',
          [
            evalRingPoint(sqTop, -0.66, torsoSq, 1.0, 0.004),
            evalRingPoint(sqTop, -0.45, torsoSq, 1.0, 0.004),
            evalRingPoint(sqTop, 0, torsoSq, 1.0, 0.004),
            evalRingPoint(sqTop, 0.45, torsoSq, 1.0, 0.004),
            evalRingPoint(sqTop, 0.66, torsoSq, 1.0, 0.004),
          ],
          [0, 0.2, 0.98],
          1.6,
          'seamDark'
        );
        // 2 đường ly chiết eo mảnh mặt trước
        ([-1, 1] as const).forEach(s => {
          mb.addSurfaceCurve(
            torsoSampled,
            torsoSq,
            5,
            0.12,
            0.66,
            u => s * (0.28 + u * 0.08),
            0.003,
            'torsoCore',
            'top',
            1.0,
            'seamDark'
          );
        });
      } else if (isSoloShirt) {
        // Cổ sơ mi đứng 2 mặt dày kín 100% Watertight + 2 lá cổ nhọn mặt trước
        mb.addThickCollar(
          [
            { y: 1.472, rx: neckRx * 1.16, rz: neckRz * 1.15, ao: 0.95, neckDrop: 0.035 },
            { y: 1.524, rx: neckRx * 1.05, rz: neckRz * 1.04, ao: 1.0, neckDrop: 0.025 },
          ],
          12,
          'top',
          'top_lining',
          'top',
          'torsoCore',
          { zBias: 0.012, thickness: 0.0085 }
        );
        ([-1, 1] as const).forEach(s => {
          const rHigh = sampleRingAtT(torsoSampled, 0.95);
          const rTip = sampleRingAtT(torsoSampled, 0.84);
          mb.addDetailLine(
            'torsoCore',
            'top',
            [
              evalRingPoint(rHigh, s * 0.05, torsoSq, 1.0, 0.008),
              evalRingPoint(rTip, s * 0.36, torsoSq, 1.0, 0.007),
              evalRingPoint(rHigh, s * 0.62, torsoSq, 1.0, 0.006),
            ],
            [s * 0.25, 0.12, 0.96],
            1.45,
            'seamDark'
          );
        });
        // Nẹp cúc chạy suốt từ cổ xuống tận gấu áo + 6 chấm cúc đều tăm tắp
        mb.addConformingPatch(
          torsoSampled.slice(0, torsoSampled.length - 1),
          torsoSq,
          () => -0.068,
          () => 0.068,
          0.006,
          1,
          'top',
          'top',
          'torsoCore',
          { zBias: 0.012, ao: 1.03 }
        );
        mb.addSurfaceCurve(torsoSampled, torsoSq, 6, 0.02, 0.93, () => -0.07, 0.007, 'torsoCore', 'top', 1.1, 'seamDark');
        mb.addSurfaceCurve(torsoSampled, torsoSq, 6, 0.02, 0.93, () => 0.07, 0.007, 'torsoCore', 'top', 1.1, 'seamDark');
        [0.14, 0.29, 0.44, 0.59, 0.74, 0.88].forEach(tBtn => {
          const r = sampleRingAtT(torsoSampled, tBtn);
          mb.addDetailDot('torsoCore', 'top', evalRingPoint(r, 0, torsoSq, 1.0, 0.009), [0, 0, 1], 0.006, 'button');
        });
        // Đường cầu vai ngang mặt sau lưng (Back Yoke) + đường sống lưng
        const backYokeRing = sampleRingAtT(torsoSampled, 0.8);
        const yokePts: Vec3[] = [];
        for (let k = 0; k <= 6; k++) {
          const th = Math.PI - 0.85 + (1.7 * k) / 6;
          yokePts.push(evalRingPoint(backYokeRing, th, torsoSq, 1.0, 0.003));
        }
        mb.addDetailLine('torsoCore', 'top', yokePts, [0, 0, -1], 1.2, 'seamDark');
        mb.addSurfaceCurve(torsoSampled, torsoSq, 5, 0.14, 0.8, () => Math.PI, 0.003, 'torsoCore', 'top', 0.95, 'seamDark');
      } else if (isSoloHoodie) {
        // Mũ Hoodie thiết kế lại hoàn toàn (ôm cổ chéo trước, rũ dẹt tự nhiên sau lưng)
        addRedesignedHoodieHood(mb, neckRx, neckRz, 'top', 'top', 'torsoCore', false);

        // Đường gân bo gấu dưới (Ribbed Waistband Hem)
        const waistRibRing = sampleRingAtT(torsoSampled, 0.11);
        mb.addCircumferentialSeam(waistRibRing, torsoSq, 0.0025, 'torsoCore', 'top', 1.4, 'seamDark');
        const waistMidRing = sampleRingAtT(torsoSampled, 0.05);
        mb.addCircumferentialSeam(waistMidRing, torsoSq, 0.002, 'torsoCore', 'top', 0.9, 'seamDark');

        // Túi Kangaroo hình thang nổi rõ ở bụng dưới + 2 miệng túi chéo tối màu
        const pocketRings = [
          sampleRingAtT(torsoSampled, 0.14),
          sampleRingAtT(torsoSampled, 0.3),
          sampleRingAtT(torsoSampled, 0.44),
        ];
        mb.addConformingPatch(
          pocketRings,
          torsoSq,
          t => -0.56 + t * 0.15,
          t => 0.56 - t * 0.15,
          0.011,
          2,
          'top',
          'top',
          'torsoCore',
          { zBias: 0.014, ao: 1.03, sideBevel: false }
        );
        // Viền trên & 2 đường miệng túi chéo tối màu không thể nhầm lẫn
        const pTopR = pocketRings[pocketRings.length - 1];
        const pBotR = pocketRings[0];
        mb.addDetailLine(
          'torsoCore',
          'top',
          [
            evalRingPoint(pTopR, -0.41, torsoSq, 1.0, 0.013),
            evalRingPoint(pTopR, 0, torsoSq, 1.0, 0.013),
            evalRingPoint(pTopR, 0.41, torsoSq, 1.0, 0.013),
          ],
          [0, 0.1, 1],
          1.2,
          'seamDark'
        );
        ([-1, 1] as const).forEach(s => {
          mb.addDetailLine(
            'torsoCore',
            'top',
            [
              evalRingPoint(pTopR, s * 0.41, torsoSq, 1.0, 0.013),
              evalRingPoint(pBotR, s * 0.56, torsoSq, 1.0, 0.013),
            ],
            safeNormalize(s * 0.45, 0, 0.88),
            2.1,
            'contrastDark'
          );
        });

        // 2 dây rút song song (Drawstrings) màu trắng ngà + đầu bọc kim loại (Aglet)
        ([-1, 1] as const).forEach(s => {
          mb.addSurfaceCurve(
            torsoSampled,
            torsoSq,
            5,
            0.54,
            0.91,
            () => s * 0.19,
            0.008,
            'torsoCore',
            'top',
            2.1,
            'contrastWhite'
          );
          const tipR = sampleRingAtT(torsoSampled, 0.54);
          mb.addDetailDot(
            'torsoCore',
            'top',
            evalRingPoint(tipR, s * 0.19, torsoSq, 1.0, 0.009),
            [s * 0.18, 0, 0.98],
            0.0055,
            'aglet'
          );
        });
      } else if (isSoloBlazer) {
        // 2 ve áo chữ V có khía (Notched Lapels) + 2 cúc + 2 nắp túi hông + đường xẻ tà sau lưng
        const soloLapelRings = [
          sampleRingAtT(torsoSampled, 0.42),
          sampleRingAtT(torsoSampled, 0.68),
          sampleRingAtT(torsoSampled, 0.92),
        ];
        ([-1, 1] as const).forEach(s => {
          mb.addConformingPatch(
            soloLapelRings,
            torsoSq,
            t => (s === 1 ? 0.04 + t * 0.1 : -(0.28 + t * 0.22)),
            t => (s === 1 ? 0.28 + t * 0.22 : -(0.04 + t * 0.1)),
            0.011,
            1,
            'top',
            'top',
            'torsoCore',
            { zBias: 0.014, ao: 1.04, sideBevel: false }
          );
          // Viền gập ve áo có khía chữ V sắc nét
          const rMid = sampleRingAtT(torsoSampled, 0.44);
          const rNotch = sampleRingAtT(torsoSampled, 0.76);
          const rTop = sampleRingAtT(torsoSampled, 0.93);
          mb.addDetailLine(
            'torsoCore',
            'top',
            [
              evalRingPoint(rMid, s * 0.04, torsoSq, 1.0, 0.013),
              evalRingPoint(rNotch, s * 0.44, torsoSq, 1.0, 0.013),
              evalRingPoint(rNotch, s * 0.32, torsoSq, 1.0, 0.013),
              evalRingPoint(rTop, s * 0.36, torsoSq, 1.0, 0.012),
            ],
            safeNormalize(s * 0.28, 0.08, 0.95),
            1.45,
            'seamDark'
          );
          // Nắp túi ngang hai bên hông
          const pR = sampleRingAtT(torsoSampled, 0.23);
          mb.addDetailLine(
            'torsoCore',
            'top',
            [
              evalRingPoint(pR, s * 0.26, torsoSq, 1.0, 0.005),
              evalRingPoint(pR, s * 0.66, torsoSq, 1.0, 0.005),
            ],
            safeNormalize(s * 0.42, 0, 0.9),
            1.9,
            'contrastDark'
          );
        });
        // 2 cúc áo Blazer chính giữa
        [0.32, 0.44].forEach(tBtn => {
          const r = sampleRingAtT(torsoSampled, tBtn);
          mb.addDetailDot('torsoCore', 'top', evalRingPoint(r, 0, torsoSq, 1.0, 0.008), [0, 0, 1], 0.0085, 'button');
        });
        // Đường sống lưng & xẻ tà chính giữa mặt sau (nhìn sắc nét ở góc Sau)
        mb.addSurfaceCurve(torsoSampled, torsoSq, 6, 0.02, 0.88, () => Math.PI, 0.003, 'torsoCore', 'top', 1.25, 'seamDark');
        mb.addSurfaceCurve(torsoSampled, torsoSq, 4, 0.02, 0.34, () => Math.PI, 0.004, 'torsoCore', 'top', 2.0, 'contrastDark');
      }
    }
  }

  // -----------------------------------------------------------
  // 3. KHI BẬT `+ ÁO KHOÁC` (`isLayering === true`):
  //    - Dựng Áo trong (`torsoCore`): mảng ngực + sườn trước kín đặc (-100°..+100°), bán kính 0.84x,
  //      dùng chung đúng các mốc độ cao `y` với `outerwear` (KHÔNG dựng lưng sau, KHÔNG dựng tay áo trong).
  //    - Dựng Áo khoác (`outerwearShell`): CHỈ vỏ mặt ngoài + dải viền độ dày mép trước `edgeBevel`
  //      (~0.025–0.035 đơn vị) ôm sát vào áo trong (XÓA HOÀN TOÀN `innerLining` ở lưng & sườn sau).
  //    - Hai phần vẽ chung trong `torsoLayerGroup` sắp xếp theo `avgZ` -> 0% xuyên thấu mọi góc 360°!
  // -----------------------------------------------------------
  if (isLayering) {
    const isHoodieOuter = outerShape === 'hoodie';
    const isShirtOuter = outerShape === 'shirt';
    const isBlazerOuter = !isHoodieOuter && !isShirtOuter;

    const bulk = isHoodieOuter ? 1.09 : isBlazerOuter ? 1.03 : 1.0;
    const shoulderW = (isFemale ? 0.194 : 0.232) * bulk;
    const chestW = (isFemale ? 0.176 : 0.21) * bulk;
    const waistW = (isFemale ? 0.15 : 0.188) * bulk;
    const hipW = (isFemale ? 0.184 : 0.2) * (isHoodieOuter ? 0.96 : bulk);
    const depth = isHoodieOuter ? 0.142 : 0.132;
    const outerHemY = isBlazerOuter ? 0.8 : 0.84;

    const outerControls: RingDef[] = isHoodieOuter
      ? [
          { y: 0.84, rx: hipW, rz: depth * 0.9, frontGap: 0.33, ao: 0.92 },
          { y: 0.9, rx: hipW * 1.01, rz: depth * 0.92, frontGap: 0.34, ao: 0.95 },
          { y: 0.98, rx: waistW + 0.024, rz: depth * 1.03, zOff: -0.004, frontGap: 0.35, ao: 0.99 },
          { y: 1.16, rx: waistW + 0.028, rz: depth * 1.04, zOff: -0.006, frontGap: 0.37, ao: 1.0 },
          { y: 1.3, rx: chestW, rz: depth * 1.03, chestBulge: isFemale ? 0.016 : 0.008, frontGap: 0.42, ao: 1.0 },
          { y: 1.39, rx: shoulderW, rz: depth * 0.94, frontGap: 0.47, ao: 0.98 },
          { y: 1.448, rx: shoulderW * 0.65, rz: depth * 0.8, frontGap: 0.51, ao: 0.95 },
          { y: 1.474, rx: neckRx * 1.24, rz: neckRz * 1.2, frontGap: 0.54, ao: 0.94, neckDrop: 0.02 },
        ]
      : [
          { y: outerHemY, rx: hipW, rz: depth * (isFemale ? 0.97 : 0.94), frontGap: isBlazerOuter ? 0.3 : 0.36, ao: 0.94 },
          { y: 0.98, rx: waistW + 0.012, rz: depth * 0.98, zOff: -0.005, frontGap: isBlazerOuter ? 0.31 : 0.36, ao: 0.97 },
          { y: 1.15, rx: waistW + 0.019, rz: depth * 1.0, zOff: -0.007, frontGap: isBlazerOuter ? 0.36 : 0.38, ao: 0.99 },
          { y: 1.3, rx: chestW, rz: depth * 1.01, chestBulge: isFemale ? 0.018 : 0.008, frontGap: isBlazerOuter ? 0.46 : 0.44, ao: 1.0 },
          { y: 1.395, rx: shoulderW, rz: depth * 0.9, frontGap: 0.5, ao: 0.98 },
          { y: 1.448, rx: shoulderW * 0.64, rz: depth * 0.78, frontGap: 0.54, ao: 0.95 },
          { y: 1.474, rx: neckRx * 1.22, rz: neckRz * 1.2, frontGap: 0.58, ao: 0.94, neckDrop: 0.022 },
        ];

    const outerBands = 5; // 6 vòng dọc
    const outerSegs = 14; // ~16.8 cạnh tương đương khi mở vạt trước
    const outerSampled = sampleSplineRings(outerControls, outerBands);
    const outerSq = isBlazerOuter ? 0.028 : 0.018;

    // A. ÁO TRONG (`top` -> `torsoCore`): dùng chung chính xác mốc `y` với `outerSampled`,
    //    thu bán kính X/Z đúng 0.84x, chỉ dựng cung mặt trước [-100°, +100°] quanh +Z (KHÔNG dựng lưng sau!)
    const innerTopSource = isBlazerOuter ? outerSampled.slice(1) : outerSampled;
    activeTopHemY = innerTopSource[0].y;

    const innerTopRings: RingDef[] = innerTopSource.map((r, idx) => {
      const isTopRing = idx === innerTopSource.length - 1;
      const isPreTop = idx === innerTopSource.length - 2;
      return {
        ...r,
        rx: r.rx * 0.84,
        rz: r.rz * 0.84,
        chestBulge: (r.chestBulge ?? 0) * 0.84,
        backArch: 0,
        frontGap: 0,
        neckDrop: isTopRing ? 0.04 : isPreTop ? 0.014 : 0,
        ao: (r.ao ?? 0.96) * 0.95,
      };
    });

    const frontArcRad = (100 * Math.PI) / 180;
    const innerTopSegs = 8;
    mb.loftTube(innerTopRings, innerTopSegs, 'top', 'top', 'torsoCore', {
      zBias: 0,
      thetaRange: [-frontArcRad, frontArcRad],
      superEllipse: outerSq,
    });

    // Lòng cổ áo trong (`neckCavity`, vẽ TRƯỚC `torsoLayerGroup`) — đóng kín hốc cổ 360° gọn nhẹ
    const innerTopRim = innerTopRings[innerTopRings.length - 1];
    mb.loftTube(
      [
        {
          y: innerTopRim.y - 0.09,
          rx: Math.max(0.02, innerTopRim.rx * 0.72),
          rz: Math.max(0.02, innerTopRim.rz * 0.72),
          xOff: innerTopRim.xOff,
          zOff: innerTopRim.zOff,
          ao: 0.58,
        },
        {
          ...innerTopRim,
          ao: 0.82,
        },
      ],
      12,
      'inner_cavity',
      'top',
      'neckCavity',
      { inward: true, capBottom: true, superEllipse: outerSq }
    );

    // B. VỎ MẶT NGOÀI ÁO KHOÁC (`outerwearShell`) — KHÔNG DỰNG LỚP LÓT LƯNG/SƯỜN TRONG!
    const outerMesh = mb.loftTube(outerSampled, outerSegs, 'outerwear', 'outerwear', 'outerwearShell', {
      zBias: 0,
      openFront: true,
      inward: false,
      superEllipse: outerSq,
    });

    // C. Dải viền độ dày mép mở phía trước (`edgeBevel`, sâu ~0.025–0.035 đơn vị) cong nhẹ ôm sát vào áo trong (0.84x)
    const rightBevelEdge: number[] = [];
    const leftBevelEdge: number[] = [];
    for (let i = 0; i < outerSampled.length; i++) {
      const r = outerSampled[i];
      const gap = Math.max(0.18, r.frontGap ?? 0.42);
      // Kéo mép vào trong đúng 0.84x (~0.025..0.035 đơn vị) và uốn nhẹ +0.035 rad ôm sát ngực áo trong
      const [rxPt, ryPt, rzPt] = evalRingPoint(r, gap + 0.035, outerSq, 0.84);
      rightBevelEdge.push(mb.addVertex(rxPt, ryPt, rzPt));
      const [lxPt, lyPt, lzPt] = evalRingPoint(r, Math.PI * 2 - (gap + 0.035), outerSq, 0.84);
      leftBevelEdge.push(mb.addVertex(lxPt, lyPt, lzPt));
    }

    mb.bridgeEdgeStrip(
      outerMesh.grid.map(row => row[0]),
      rightBevelEdge,
      -0.88,
      0,
      0.48,
      'outerwearShell',
      0.002,
      'outer_lining',
      'outerwear',
      0.88
    );
    const lastCol = outerMesh.grid[0].length - 1;
    mb.bridgeEdgeStrip(
      leftBevelEdge,
      outerMesh.grid.map(row => row[lastCol]),
      0.88,
      0,
      0.48,
      'outerwearShell',
      0.002,
      'outer_lining',
      'outerwear',
      0.88
    );

    // Viền dày cổ trên của áo khoác Blazer (Hoodie & Shirt đã có addThickCollar trùm kín phía trên)
    if (isBlazerOuter) {
      const outerTopIdx = outerMesh.grid.length - 1;
      const outerTopRim = outerSampled[outerTopIdx];
      const outerTopGap = Math.max(0.18, outerTopRim.frontGap ?? 0.54);
      const outerTopInnerRow: number[] = [];
      for (let j = 0; j <= outerSegs; j++) {
        const u = j / outerSegs;
        const th = outerTopGap + u * (Math.PI * 2 - outerTopGap * 2);
        const [vx, vy, vz] = evalRingPoint(outerTopRim, th, outerSq, 0.86);
        outerTopInnerRow.push(mb.addVertex(vx, vy, vz));
      }
      mb.bridgeEdgeStrip(
        outerMesh.grid[outerTopIdx],
        outerTopInnerRow,
        0,
        1,
        0,
        'outerwearShell',
        0.002,
        'outerwear',
        'outerwear',
        0.92
      );
    }

    const sleeveTopR = isHoodieOuter ? 0.084 : isFemale ? 0.067 : 0.076;
    const sleeveEndR = isHoodieOuter || isShirtOuter ? 0.043 : 0.049;
    const outerSleeveStyle = isHoodieOuter ? 'hoodie' : isShirtOuter ? 'shirt' : 'standard';

    // Khóa kín khớp Vai – Nách (`shoulderJoint`) cho áo khoác ngoài chống hở khe 90°
    mb.addShoulderJoint(-1, shoulderW, 1.395, sleeveTopR, 'outerwear', 'outerwear', 'outerwearShell');
    mb.addShoulderJoint(1, shoulderW, 1.395, sleeveTopR, 'outerwear', 'outerwear', 'outerwearShell');

    mb.addSculptedArm(-1, shoulderW, 1.395, 0.49, sleeveTopR, sleeveEndR, 'outerwear', 'outer_cavity', 'outerwear', 'leftArm', outerSleeveStyle);
    mb.addSculptedArm(1, shoulderW, 1.395, 0.49, sleeveTopR, sleeveEndR, 'outerwear', 'outer_cavity', 'outerwear', 'rightArm', outerSleeveStyle);

    if (isShirtOuter) {
      mb.addThickCollar(
        [
          { y: 1.478, rx: neckRx * 1.32, rz: neckRz * 1.28, frontGap: 0.56, ao: 0.95 },
          { y: 1.522, rx: neckRx * 1.2, rz: neckRz * 1.16, frontGap: 0.6, ao: 1.0 },
        ],
        8,
        'outerwear',
        'outer_lining',
        'outerwear',
        'outerwearShell',
        { zBias: 0.01, openFront: true, thickness: 0.009, innerIsDeepCavity: false }
      );
      // Hàng cúc dọc 1 bên mép mở áo sơ mi khoác + đường cầu vai sau lưng
      [0.14, 0.3, 0.46, 0.62, 0.78].forEach(tBtn => {
        const r = sampleRingAtT(outerSampled, tBtn);
        const th = (r.frontGap ?? 0.38) + 0.07;
        mb.addDetailDot('outerwearShell', 'outerwear', evalRingPoint(r, th, outerSq, 1.0, 0.005), evalRingNormal(r, th), 0.006, 'button');
      });
      const backYokeRing = sampleRingAtT(outerSampled, 0.8);
      const yokePts: Vec3[] = [];
      for (let k = 0; k <= 6; k++) {
        const th = Math.PI - 0.85 + (1.7 * k) / 6;
        yokePts.push(evalRingPoint(backYokeRing, th, outerSq, 1.0, 0.003));
      }
      mb.addDetailLine('outerwearShell', 'outerwear', yokePts, [0, 0, -1], 1.25, 'seamDark');
    } else if (isHoodieOuter) {
      // Mũ Hoodie rũ lưng thiết kế mới cho áo khoác Hoodie Zip-up
      addRedesignedHoodieHood(mb, neckRx, neckRz, 'outerwear', 'outerwear', 'outerwearShell', true);

      // Đường bo gấu dưới
      const ribRing = sampleRingAtT(outerSampled, 0.12);
      mb.addCircumferentialSeam(ribRing, outerSq, 0.0025, 'outerwearShell', 'outerwear', 1.4, 'seamDark', ribRing.frontGap ?? 0.35);

      // 2 dải khóa kéo kim loại (`zipper`) chạy dọc 2 mép mở giữa áo!
      ([-1, 1] as const).forEach(s => {
        const zipPts: Vec3[] = [];
        for (let k = 0; k <= 7; k++) {
          const r = sampleRingAtT(outerSampled, 0.02 + (0.9 * k) / 7);
          const th = s === 1 ? (r.frontGap ?? 0.36) + 0.015 : Math.PI * 2 - ((r.frontGap ?? 0.36) + 0.015);
          zipPts.push(evalRingPoint(r, th, outerSq, 1.0, 0.005));
        }
        mb.addDetailLine('outerwearShell', 'outerwear', zipPts, safeNormalize(s * 0.32, 0, 0.94), 2.0, 'zipper');
      });

      // 2 túi kangaroo chia đôi + miệng túi chéo tối màu
      const pocketRings = [
        sampleRingAtT(outerSampled, 0.14),
        sampleRingAtT(outerSampled, 0.3),
        sampleRingAtT(outerSampled, 0.44),
      ];
      mb.addConformingPatch(
        pocketRings,
        outerSq,
        (_t, r) => (r.frontGap ?? 0.36) + 0.05,
        (_t, r) => (r.frontGap ?? 0.36) + 0.5,
        0.01,
        1,
        'outerwear',
        'outerwear',
        'outerwearShell',
        { zBias: 0.014, ao: 1.03, sideBevel: false }
      );
      mb.addConformingPatch(
        pocketRings,
        outerSq,
        (_t, r) => Math.PI * 2 - ((r.frontGap ?? 0.36) + 0.5),
        (_t, r) => Math.PI * 2 - ((r.frontGap ?? 0.36) + 0.05),
        0.01,
        1,
        'outerwear',
        'outerwear',
        'outerwearShell',
        { zBias: 0.014, ao: 1.03, sideBevel: false }
      );
      const pTop = pocketRings[pocketRings.length - 1];
      const pBot = pocketRings[0];
      ([-1, 1] as const).forEach(s => {
        const gTop = pTop.frontGap ?? 0.36;
        const gBot = pBot.frontGap ?? 0.35;
        const thTop = s === 1 ? gTop + 0.38 : Math.PI * 2 - (gTop + 0.38);
        const thBot = s === 1 ? gBot + 0.5 : Math.PI * 2 - (gBot + 0.5);
        mb.addDetailLine(
          'outerwearShell',
          'outerwear',
          [
            evalRingPoint(pTop, thTop, outerSq, 1.0, 0.012),
            evalRingPoint(pBot, thBot, outerSq, 1.0, 0.012),
          ],
          safeNormalize(s * 0.58, 0, 0.8),
          2.0,
          'contrastDark'
        );
      });

      // 2 dây rút trắng ngà + đầu aglet dọc 2 mép ngực
      ([-1, 1] as const).forEach(s => {
        mb.addSurfaceCurve(
          outerSampled,
          outerSq,
          5,
          0.54,
          0.9,
          () => (s === 1 ? 0.52 : Math.PI * 2 - 0.52),
          0.008,
          'outerwearShell',
          'outerwear',
          2.0,
          'contrastWhite'
        );
        const tipR = sampleRingAtT(outerSampled, 0.54);
        const tipTh = s === 1 ? 0.52 : Math.PI * 2 - 0.52;
        mb.addDetailDot('outerwearShell', 'outerwear', evalRingPoint(tipR, tipTh, outerSq, 1.0, 0.009), evalRingNormal(tipR, tipTh), 0.0055, 'aglet');
      });
    } else {
      // Blazer khoác ngoài: 2 ve áo chữ V có khía sắc nét + 2 nắp túi ngang + 2 nút cúc + xẻ tà sau lưng
      const lapelRings = [
        sampleRingAtT(outerSampled, 0.42),
        sampleRingAtT(outerSampled, 0.68),
        sampleRingAtT(outerSampled, 0.92),
      ];
      mb.addConformingPatch(
        lapelRings,
        outerSq,
        (_t, r) => r.frontGap ?? 0.42,
        (t, r) => (r.frontGap ?? 0.42) + 0.14 + Math.sin(t * Math.PI * 0.85) * 0.24,
        0.011,
        1,
        'outerwear',
        'outerwear',
        'outerwearShell',
        { zBias: 0.014, ao: 1.04, sideBevel: false }
      );
      mb.addConformingPatch(
        lapelRings,
        outerSq,
        (t, r) => Math.PI * 2 - ((r.frontGap ?? 0.42) + 0.14 + Math.sin(t * Math.PI * 0.85) * 0.24),
        (_t, r) => Math.PI * 2 - (r.frontGap ?? 0.42),
        0.011,
        1,
        'outerwear',
        'outerwear',
        'outerwearShell',
        { zBias: 0.014, ao: 1.04, sideBevel: false }
      );
      // Viền ve áo chữ V có khía + nắp túi hông
      ([-1, 1] as const).forEach(s => {
        const rMid = sampleRingAtT(outerSampled, 0.42);
        const rNotch = sampleRingAtT(outerSampled, 0.74);
        const rTop = sampleRingAtT(outerSampled, 0.92);
        const toSide = (th: number) => (s === 1 ? th : Math.PI * 2 - th);
        mb.addDetailLine(
          'outerwearShell',
          'outerwear',
          [
            evalRingPoint(rMid, toSide(rMid.frontGap ?? 0.36), outerSq, 1.0, 0.013),
            evalRingPoint(rNotch, toSide((rNotch.frontGap ?? 0.46) + 0.34), outerSq, 1.0, 0.013),
            evalRingPoint(rNotch, toSide((rNotch.frontGap ?? 0.46) + 0.22), outerSq, 1.0, 0.013),
            evalRingPoint(rTop, toSide((rTop.frontGap ?? 0.54) + 0.24), outerSq, 1.0, 0.012),
          ],
          safeNormalize(s * 0.42, 0.1, 0.9),
          1.45,
          'seamDark'
        );
        // Nắp túi hông ngang
        const pR = sampleRingAtT(outerSampled, 0.23);
        const g = pR.frontGap ?? 0.32;
        mb.addDetailLine(
          'outerwearShell',
          'outerwear',
          [
            evalRingPoint(pR, toSide(g + 0.18), outerSq, 1.0, 0.01),
            evalRingPoint(pR, toSide(g + 0.6), outerSq, 1.0, 0.01),
          ],
          safeNormalize(s * 0.55, 0, 0.83),
          1.9,
          'contrastDark'
        );
      });
      // 2 cúc áo bên vạt phải Blazer
      [0.3, 0.42].forEach(tBtn => {
        const r = sampleRingAtT(outerSampled, tBtn);
        const th = (r.frontGap ?? 0.34) + 0.09;
        mb.addDetailDot('outerwearShell', 'outerwear', evalRingPoint(r, th, outerSq, 1.0, 0.008), evalRingNormal(r, th), 0.008, 'button');
      });
      // Xẻ tà chính giữa mặt sau Blazer
      mb.addSurfaceCurve(outerSampled, outerSq, 6, 0.02, 0.88, () => Math.PI, 0.003, 'outerwearShell', 'outerwear', 1.2, 'seamDark');
      mb.addSurfaceCurve(outerSampled, outerSq, 4, 0.02, 0.34, () => Math.PI, 0.004, 'outerwearShell', 'outerwear', 2.0, 'contrastDark');
    }
  }

  // -----------------------------------------------------------
  // 4. QUẦN / CHÂN VÁY (`torsoCore` hông/váy + `leftLeg` / `rightLeg`)
  // -----------------------------------------------------------
  const pantsCoverShoes = bottomShape === 'wide_pants' || bottomShape === 'jeans';
  const isSkirt = bottomShape === 'a_line_skirt' || bottomShape === 'mini_skirt';

  {
    const waistW = isFemale ? 0.136 : 0.164;
    const hipW = isFemale ? 0.18 : 0.178;

    // 2 chân ma-nơ-canh mịn giải phẫu (#D2CCC4) đóng kín 2 đầu, cắm sâu vào cả trong váy/short lẫn cổ giày
    if (bottomShape === 'shorts' || isSkirt) {
      const topLegY =
        bottomShape === 'mini_skirt' ? 0.8 : bottomShape === 'a_line_skirt' ? 0.76 : 0.72;
      const bottomLegY = shoesShape === 'heels' ? 0.068 : 0.034;
      const ankleRx = isFemale ? 0.028 : 0.034;
      const ankleRz = isFemale ? 0.03 : 0.036;
      const topThighRx = isFemale ? 0.064 : 0.069;
      const topThighRz = isFemale ? 0.066 : 0.071;
      ([-1, 1] as const).forEach(side => {
        const partId: MeshPartId = side === -1 ? 'leftLeg' : 'rightLeg';
        const calfControls: RingDef[] = [
          { y: bottomLegY, rx: ankleRx, rz: ankleRz, xOff: side * legSpread, zOff: 0.004, ao: 0.86 },
          { y: 0.16, rx: isFemale ? 0.036 : 0.043, rz: isFemale ? 0.04 : 0.046, xOff: side * (legSpread + 0.001), zOff: -0.003, ao: 0.94 },
          { y: 0.33, rx: isFemale ? 0.05 : 0.058, rz: isFemale ? 0.055 : 0.062, xOff: side * (legSpread + 0.003), zOff: -0.009, ao: 1.0 },
          { y: 0.45, rx: isFemale ? 0.049 : 0.057, rz: isFemale ? 0.052 : 0.06, xOff: side * (legSpread + 0.002), zOff: -0.002, ao: 0.97 },
          { y: 0.57, rx: isFemale ? 0.061 : 0.068, rz: isFemale ? 0.063 : 0.07, xOff: side * (legSpread + 0.001), ao: 0.94 },
          { y: topLegY, rx: topThighRx, rz: topThighRz, xOff: side * (legSpread - 0.004), ao: 0.86 },
        ];
        mb.loftTube(
          sampleSplineRings(calfControls, 3),
          8,
          'mannequin_leg',
          'bottom',
          partId,
          { capTop: false, capBottom: false, superEllipse: 0.01 }
        );
      });
    }

    const waistTopY = 0.896;

    // Cắm sâu khối Cạp Váy lên bên trong thân áo tối thiểu +0.20 đơn vị (Deep Waist Overlap >= +0.18),
    // thu bán kính nhỏ hơn vòng eo áo ~11-12% để không cộm/lòi ra ngoài, đóng nắp đỉnh kín đặc (`capTop: true`)
    const addDeepWaistPlug = (baseRing: RingDef, sq: number) => {
      if (isSoloBabyTee) return;
      const plugTopY = Math.max(activeTopHemY + 0.2, 1.07);
      const plugRx = isFemale ? 0.104 : 0.136;
      const plugRz = isFemale ? 0.082 : 0.084;
      mb.loftTube(
        [
          { y: baseRing.y - 0.01, rx: baseRing.rx * 0.96, rz: baseRing.rz * 0.96, zOff: baseRing.zOff ?? 0, ao: 0.9 },
          { y: plugTopY, rx: plugRx, rz: plugRz, zOff: -0.009, ao: 0.82 },
        ],
        12,
        'bottom',
        'bottom',
        'bottomCore',
        { capTop: true, superEllipse: sq }
      );
    };

    if (bottomShape === 'a_line_skirt') {
      // Váy chữ A: dài ngang gối (0.48), xòe rộng mềm 360° với 8 nếp sóng dọc
      const skirtControls: RingDef[] = [
        { y: 0.48, rx: 0.258, rz: 0.214, waveAmp: 0.011, waveFreq: 8, ao: 0.97 },
        { y: 0.61, rx: 0.22, rz: 0.182, waveAmp: 0.007, waveFreq: 8, ao: 1.0 },
        { y: 0.74, rx: hipW * 1.05, rz: 0.138, waveAmp: 0.003, waveFreq: 8, ao: 0.98 },
        { y: 0.835, rx: hipW * 0.94, rz: 0.114, ao: 0.95 },
        { y: waistTopY, rx: waistW * 0.96, rz: 0.094, ao: 0.92 },
      ];
      const skirtSampled = sampleSplineRings(skirtControls, 4);
      const skirtOuter = mb.loftTube(skirtSampled, 14, 'bottom', 'bottom', 'bottomCore', {
        capTop: isSoloBabyTee,
        superEllipse: 0.012,
      });
      addDeepWaistPlug(skirtSampled[skirtSampled.length - 1], 0.012);

      // Lớp lót mặt trong đầy đủ + nắp trần tối màu kín 100% (`capTop: true`) chống nhìn xuyên từ dưới lên!
      const skirtInnerRings = [
        skirtSampled[0],
        skirtSampled[2],
        skirtSampled[3],
      ].map(r => ({
        ...r,
        rx: r.rx * 0.955,
        rz: r.rz * 0.955,
        ao: 0.76,
      }));
      const skirtInner = mb.loftTube(skirtInnerRings, 14, 'bottom_cavity', 'bottom', 'bottomCore', {
        zBias: -0.01,
        isDeepCavity: true,
        inward: true,
        capTop: true,
        superEllipse: 0.012,
      });
      mb.bridgeEdgeStrip(
        [...skirtOuter.grid[0], skirtOuter.grid[0][0]],
        [...skirtInner.grid[0], skirtInner.grid[0][0]],
        0,
        -1,
        0,
        'bottomCore',
        0.002,
        'bottom',
        'bottom',
        0.88
      );
      // Cạp váy cao + các đường nếp rũ dọc mềm
      mb.addCircumferentialSeam(sampleRingAtT(skirtSampled, 0.88), 0.012, 0.002, 'bottomCore', 'bottom', 1.25, 'seamDark');
      [-0.52, 0, 0.52].forEach(th => {
        mb.addSurfaceCurve(skirtSampled, 0.012, 5, 0.06, 0.78, () => th, 0.0025, 'bottomCore', 'bottom', 0.95, 'seamDark');
      });
    } else if (bottomShape === 'mini_skirt') {
      // VÁY NGẮN (Mini Skirt): ngắn rõ rệt tới giữa đùi (y = 0.635), cạp cao ôm hông gọn + 2 đường ly sắc nét & xẻ vạt nhỏ!
      const miniControls: RingDef[] = [
        { y: 0.635, rx: hipW * 1.12, rz: 0.142, ao: 0.98 },
        { y: 0.72, rx: hipW * 1.05, rz: 0.128, ao: 1.0 },
        { y: 0.815, rx: hipW * 0.96, rz: 0.114, ao: 0.97 },
        { y: waistTopY, rx: waistW * 0.96, rz: 0.094, ao: 0.94 },
      ];
      const miniSampled = sampleSplineRings(miniControls, 3);
      const miniOuter = mb.loftTube(miniSampled, 14, 'bottom', 'bottom', 'bottomCore', {
        capTop: isSoloBabyTee,
        superEllipse: 0.016,
      });
      addDeepWaistPlug(miniSampled[miniSampled.length - 1], 0.016);

      // Lớp lót mặt trong đầy đủ + nắp trần tối màu kín 100% (`capTop: true`) chống nhìn xuyên từ dưới lên!
      const miniInnerRings = [
        miniSampled[0],
        miniSampled[2],
      ].map(r => ({
        ...r,
        rx: r.rx * 0.95,
        rz: r.rz * 0.95,
        ao: 0.74,
      }));
      const miniInner = mb.loftTube(miniInnerRings, 14, 'bottom_cavity', 'bottom', 'bottomCore', {
        zBias: -0.01,
        isDeepCavity: true,
        inward: true,
        capTop: true,
        superEllipse: 0.016,
      });
      mb.bridgeEdgeStrip(
        [...miniOuter.grid[0], miniOuter.grid[0][0]],
        [...miniInner.grid[0], miniInner.grid[0][0]],
        0,
        -1,
        0,
        'bottomCore',
        0.002,
        'bottom',
        'bottom',
        0.88
      );

      // Cạp váy cao + 2 nếp ly trước sắc nét + đường xẻ nhỏ cá tính bên đùi trước
      mb.addCircumferentialSeam(sampleRingAtT(miniSampled, 0.86), 0.016, 0.0025, 'bottomCore', 'bottom', 1.3, 'seamDark');
      mb.addCircumferentialSeam(sampleRingAtT(miniSampled, 0.05), 0.016, 0.002, 'bottomCore', 'bottom', 1.0, 'seamDark');
      ([-0.34, 0.34] as const).forEach(th => {
        mb.addSurfaceCurve(miniSampled, 0.016, 4, 0.08, 0.84, () => th, 0.003, 'bottomCore', 'bottom', 1.2, 'seamDark');
      });
      // Đường xẻ tà ngắn tinh tế ở vạt trước bên trái
      mb.addSurfaceCurve(miniSampled, 0.016, 3, 0.0, 0.36, () => -0.44, 0.004, 'bottomCore', 'bottom', 2.0, 'contrastDark');
    } else {
      // QUẦN: wide_pants | jeans | shorts — khối `pelvis` (4 vòng × 16 cạnh) + 2 ống chân liền mạch (Z-sort chung thành 1 khối quần!)
      // KHÔNG dựng nắp đáy `pelvis` hay khối đen thừa để tránh cắt ngang đầu đùi.
      const isShort = bottomShape === 'shorts';
      const isWide = bottomShape === 'wide_pants';
      const isJeans = bottomShape === 'jeans';

      const pelvisBotRx = isWide ? hipW * 0.94 : hipW * 0.91;
      const pelvisBotRz = isWide ? 0.104 : 0.102;
      const pelvisRings = sampleSplineRings(
        [
          { y: 0.695, rx: pelvisBotRx, rz: pelvisBotRz, ao: 0.94 },
          { y: 0.768, rx: hipW * 0.97, rz: 0.111, ao: 0.98 },
          { y: 0.84, rx: (hipW + waistW) * 0.48, rz: 0.104, ao: 0.99 },
          { y: waistTopY, rx: waistW * 0.95, rz: 0.092, ao: 0.96 },
        ],
        3 // 4 vòng dọc (3 dải quad) × 16 cạnh ngang
      );
      // Cạp quần cắm nhẹ +0.06 lên bên trong gấu áo trực tiếp bằng vòng đỉnh thứ 4/5 liền mạch (không tạo ống thừa)
      const pelvisLoftRings: RingDef[] = isSoloBabyTee
        ? pelvisRings
        : [
            pelvisRings[0],
            pelvisRings[1],
            pelvisRings[3],
            {
              y: Math.max(waistTopY + 0.04, activeTopHemY + 0.06),
              rx: pelvisRings[3].rx * 0.91,
              rz: pelvisRings[3].rz * 0.91,
              zOff: -0.004,
              ao: 0.89,
            },
          ];
      mb.loftTube(pelvisLoftRings, 16, 'bottom', 'bottom', 'pelvis', {
        capTop: true,
        capBottom: false,
        superEllipse: 0.016,
      });

      // Đỉnh trên 2 ống chân nối liền mượt vào bên trong khối `pelvis` (khớp khít biên ngoài hông, giữ dáng tròn tự nhiên)
      const legTopCenterX = legSpread - 0.008;
      const maxLegTopRx = Math.min(0.088, pelvisBotRx - legTopCenterX + 0.002);

      ([-1, 1] as const).forEach(side => {
        const partId: MeshPartId = side === -1 ? 'leftLeg' : 'rightLeg';
        let legControls: RingDef[];
        let bands: number;

        if (isShort) {
          bands = 3; // 4 vòng dọc
          legControls = [
            { y: 0.54, rx: isFemale ? 0.075 : 0.081, rz: 0.083, xOff: side * legSpread, ao: 0.96 },
            { y: 0.65, rx: isFemale ? 0.079 : 0.084, rz: 0.089, xOff: side * (legSpread - 0.002), ao: 0.98 },
            { y: 0.775, rx: maxLegTopRx, rz: 0.097, xOff: side * legTopCenterX, ao: 0.95 },
          ];
        } else if (isWide) {
          // Quần ống suông: 6 vòng dọc (5 dải) × 14 cạnh ngang — chia đều quad ngắn cho Painter's Algorithm, nhẹ gấp đôi!
          bands = 5;
          legControls = [
            { y: 0.044, rx: 0.087, rz: 0.092, xOff: side * (legSpread + 0.003), ao: 0.94 },
            { y: 0.25, rx: 0.087, rz: 0.092, xOff: side * (legSpread + 0.002), ao: 0.98 },
            { y: 0.48, rx: 0.087, rz: 0.093, xOff: side * legSpread, ao: 1.0 },
            { y: 0.65, rx: 0.087, rz: 0.095, xOff: side * (legSpread - 0.003), ao: 0.98 },
            { y: 0.775, rx: maxLegTopRx, rz: 0.098, xOff: side * legTopCenterX, ao: 0.95 },
          ];
        } else {
          // Quần Jean: 6 vòng dọc (5 dải) × 14 cạnh ngang
          bands = 5;
          legControls = [
            { y: 0.072, rx: isFemale ? 0.049 : 0.056, rz: isFemale ? 0.054 : 0.061, xOff: side * legSpread, ao: 0.94 },
            { y: 0.27, rx: isFemale ? 0.058 : 0.066, rz: isFemale ? 0.063 : 0.071, xOff: side * legSpread, ao: 0.98 },
            { y: 0.49, rx: isFemale ? 0.07 : 0.077, rz: isFemale ? 0.075 : 0.082, xOff: side * legSpread, ao: 1.0 },
            { y: 0.65, rx: isFemale ? 0.078 : 0.084, rz: isFemale ? 0.083 : 0.09, xOff: side * (legSpread - 0.003), ao: 0.98 },
            { y: 0.775, rx: maxLegTopRx, rz: 0.097, xOff: side * legTopCenterX, ao: 0.95 },
          ];
        }

        const sampledLeg = sampleSplineRings(legControls, bands);
        mb.loftTube(sampledLeg, 14, 'bottom', 'bottom', partId, {
          capTop: false,
          capBottom: false,
          superEllipse: 0.015,
        });

        // ----- CHI TIẾT NHẬN DIỆN TỪNG LOẠI ỐNG QUẦN (TINH TẾ, DỊU MẮT) -----
        if (isWide) {
          // Đường ly thẳng đứng mảnh dịu dọc chính giữa mặt trước mỗi ống quần suông (bỏ viền ngang gấu chói)
          mb.addSurfaceCurve(sampledLeg, 0.015, 7, 0.04, 0.9, () => 0, 0.0025, partId, 'bottom', 1.0, 'seamDark');
          mb.addSurfaceCurve(sampledLeg, 0.015, 7, 0.04, 0.9, () => 0.07, 0.0025, partId, 'bottom', 0.75, 'seamLight');
        } else if (isJeans) {
          // Đường chỉ sườn ngoài dọc ống quần Jean + viền gấu denim mảnh
          const outerSideTheta = side === 1 ? Math.PI * 0.5 : -Math.PI * 0.5;
          mb.addSurfaceCurve(sampledLeg, 0.015, 7, 0.03, 0.94, () => outerSideTheta, 0.0025, partId, 'bottom', 1.05, 'seamDark');
          mb.addCircumferentialSeam(sampleRingAtT(sampledLeg, 0.03), 0.015, 0.002, partId, 'bottom', 0.95, 'seamDark');
        } else if (isShort) {
          // Viền gấu quần Short mảnh gọn
          mb.addCircumferentialSeam(sampleRingAtT(sampledLeg, 0.06), 0.015, 0.002, partId, 'bottom', 0.95, 'seamDark');
        }
      });

      // ----- CHI TIẾT HÔNG / CẠP QUẦN (GẮN VÀO `pelvis` ĐỂ LUÔN NẰM DƯỚI GẤU ÁO) -----
      mb.addCircumferentialSeam(sampleRingAtT(pelvisRings, 0.84), 0.016, 0.0025, 'pelvis', 'bottom', 1.05, 'seamDark');

      if (isJeans) {
        // 1. Nút quần kim loại + đường khóa kéo J-stitch mặt trước
        const btnR = sampleRingAtT(pelvisRings, 0.86);
        mb.addDetailDot('pelvis', 'bottom', evalRingPoint(btnR, 0, 0.016, 1.0, 0.005), [0, 0, 1], 0.007, 'buckle');
        mb.addDetailLine(
          'pelvis',
          'bottom',
          [
            evalRingPoint(sampleRingAtT(pelvisRings, 0.82), 0.06, 0.016, 1.0, 0.004),
            evalRingPoint(sampleRingAtT(pelvisRings, 0.45), 0.06, 0.016, 1.0, 0.004),
            evalRingPoint(sampleRingAtT(pelvisRings, 0.2), 0.01, 0.016, 1.0, 0.004),
          ],
          [0, 0, 1],
          1.15,
          'seamDark'
        );

        // 2. Hai túi cong mặt trước + con đỉa cạp quần
        ([-1, 1] as const).forEach(s => {
          mb.addDetailLine(
            'pelvis',
            'bottom',
            [
              evalRingPoint(sampleRingAtT(pelvisRings, 0.8), s * 0.44, 0.016, 1.0, 0.004),
              evalRingPoint(sampleRingAtT(pelvisRings, 0.56), s * 0.62, 0.016, 1.0, 0.004),
              evalRingPoint(sampleRingAtT(pelvisRings, 0.42), s * 0.86, 0.016, 1.0, 0.004),
            ],
            safeNormalize(s * 0.55, 0, 0.83),
            1.15,
            'seamDark'
          );
          // Con đỉa cạp quần mặt trước
          mb.addDetailLine(
            'pelvis',
            'bottom',
            [
              evalRingPoint(sampleRingAtT(pelvisRings, 0.96), s * 0.36, 0.016, 1.0, 0.005),
              evalRingPoint(sampleRingAtT(pelvisRings, 0.78), s * 0.36, 0.016, 1.0, 0.005),
            ],
            safeNormalize(s * 0.32, 0, 0.94),
            1.4,
            'contrastDark'
          );
        });

        // 3. HAI TÚI SAU VUÔNG GÓC NHỌN ĐẶC TRƯNG QUẦN JEAN (tự động chỉ hiện ở góc Sau!)
        ([-1, 1] as const).forEach(s => {
          const rTop = sampleRingAtT(pelvisRings, 0.68);
          const rMid = sampleRingAtT(pelvisRings, 0.24);
          const rTip = sampleRingAtT(pelvisRings, 0.08);
          const thIn = Math.PI + s * 0.16;
          const thMid = Math.PI + s * 0.42;
          const thOut = Math.PI + s * 0.68;
          const pNorm = safeNormalize(Math.sin(thMid), 0, Math.cos(thMid));
          mb.addDetailLine(
            'pelvis',
            'bottom',
            [
              evalRingPoint(rTop, thIn, 0.016, 1.0, 0.004),
              evalRingPoint(rTop, thOut, 0.016, 1.0, 0.004),
              evalRingPoint(rMid, thOut, 0.016, 1.0, 0.004),
              evalRingPoint(rTip, thMid, 0.016, 1.0, 0.004),
              evalRingPoint(rMid, thIn, 0.016, 1.0, 0.004),
              evalRingPoint(rTop, thIn, 0.016, 1.0, 0.004),
            ],
            pNorm,
            1.15,
            'seamDark'
          );
        });
      } else {
        // Đường khóa giữa mảnh gọn cho Quần suông & Quần Short
        mb.addSurfaceCurve(pelvisRings, 0.016, 3, 0.22, 0.82, () => 0, 0.0025, 'pelvis', 'bottom', 1.0, 'seamDark');
      }
    }
  }

  // -----------------------------------------------------------
  // 5. ĐÔI GIÀY 3D LIỀN KHỐI WATERTIGHT (`leftShoe`, `rightShoe`)
  // -----------------------------------------------------------
  mb.addSculptedShoe(-1, -legSpread, shoesShape, isFemale, 'leftShoe', pantsCoverShoes);
  mb.addSculptedShoe(1, legSpread, shoesShape, isFemale, 'rightShoe', pantsCoverShoes);

  return mb.finalize(pantsCoverShoes);
}
