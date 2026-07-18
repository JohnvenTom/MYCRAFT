/**
 * @file DDA 体素射线检测
 * @description 实现 voxel raycasting (基于 Amanatides & Woo 的 DDA 算法),
 *              用于玩家瞄准方块、破坏与放置判定。
 */

/**
 * 射线命中结果
 * @typedef {Object} RayHit
 * @property {number} x 命中方块 X
 * @property {number} y 命中方块 Y
 * @property {number} z 命中方块 Z
 * @property {number} nx 命中面法线 X (用于放置相邻格)
 * @property {number} ny 命中面法线 Y
 * @property {number} nz 命中面法线 Z
 * @property {number} distance 命中距离
 */

/**
 * 从给定原点沿方向步进 DDA, 命中第一个非空气方块即返回
 * @param {{x:number,y:number,z:number}} origin 射线起点 (世界坐标)
 * @param {{x:number,y:number,z:number}} dir 射线方向 (需归一化)
 * @param {number} maxDistance 最大距离
 * @param {(x:number,y:number,z:number) => boolean} isSolidCallback 判断坐标处方块是否阻挡射线 (非空气且非透明视为阻挡)
 * @returns {RayHit|null} 命中结果, 未命中返回 null
 */
export function raycastVoxel(origin, dir, maxDistance, isSolidCallback) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
  const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
  const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;

  // 到下一格边界的 t 值
  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  let tMaxX = dir.x !== 0
    ? (stepX > 0 ? (x + 1 - origin.x) : (origin.x - x)) * tDeltaX
    : Infinity;
  let tMaxY = dir.y !== 0
    ? (stepY > 0 ? (y + 1 - origin.y) : (origin.y - y)) * tDeltaY
    : Infinity;
  let tMaxZ = dir.z !== 0
    ? (stepZ > 0 ? (z + 1 - origin.z) : (origin.z - z)) * tDeltaZ
    : Infinity;

  // 法线 = 上一步进方向取反
  let nx = 0, ny = 0, nz = 0;
  let t = 0;

  // 先检查起点格
  if (isSolidCallback(x, y, z)) {
    return { x, y, z, nx: 0, ny: 0, nz: 0, distance: 0 };
  }

  while (t <= maxDistance) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0; ny = 0; nz = -stepZ;
    }
    if (t > maxDistance) break;
    if (isSolidCallback(x, y, z)) {
      return { x, y, z, nx, ny, nz, distance: t };
    }
  }
  return null;
}
