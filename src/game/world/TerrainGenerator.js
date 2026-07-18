/**
 * @file 地形生成器
 * @description 基于 Simplex 噪声的程序化地形: 高度起伏 + 山脉 + 洞穴 + 矿石 + 树木 + 海平面
 *              使用 mulberry32 种子化 PRNG 注入噪声, 保证同一种子生成相同世界
 */

import { createNoise2D, createNoise3D } from 'simplex-noise';
import { CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL } from '../../config/constants.js';
import { BlockId } from './BlockType.js';
import { worldToLocal } from '../../utils/MathUtils.js';

/**
 * Mulberry32 种子化伪随机数生成器
 * @param {number} seed 32位整数种子
 * @returns {() => number} 返回 0-1 随机数函数
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class TerrainGenerator {
  /**
   * @param {number} seed 世界种子 (32 位整数)
   */
  constructor(seed) {
    this.seed = seed >>> 0;
    const prng = mulberry32(this.seed);

    // 高度噪声 (大尺度起伏)
    this.noiseBase = createNoise2D(mulberry32(this.seed ^ 0x1111));
    // 细节噪声 (中小起伏)
    this.noiseDetail = createNoise2D(mulberry32(this.seed ^ 0x2222));
    // 山脉噪声 (超大尺度)
    this.noiseMountain = createNoise2D(mulberry32(this.seed ^ 0x3333));
    // 树点噪声
    this.noiseTree = createNoise2D(mulberry32(this.seed ^ 0x4444));
    // 洞穴 3D 噪声
    this.noiseCave = createNoise3D(mulberry32(this.seed ^ 0x5555));
    // 矿石 3D 噪声
    this.noiseOre = createNoise3D(mulberry32(this.seed ^ 0x6666));
    // 生物群系 (温度/湿度, 简化)
    this.noiseBiome = createNoise2D(mulberry32(this.seed ^ 0x7777));
    this.prng = prng;
  }

  /**
   * 计算世界坐标 (x,z) 处的地形高度
   * @param {number} x 世界 X
   * @param {number} z 世界 Z
   * @returns {number} 地表 Y 坐标 (草方块所在 y, 即 top solid y)
   */
  heightAt(x, z) {
    const base = this.noiseBase(x / 80, z / 80) * 14;        // -14..14
    const detail = this.noiseDetail(x / 30, z / 30) * 6;      // -6..6
    const mtnRaw = this.noiseMountain(x / 220, z / 220);      // -1..1
    const mountain = Math.max(0, mtnRaw) ** 2 * 60;           // 0..60
    return Math.floor(SEA_LEVEL + base + detail + mountain);
  }

  /**
   * 判断世界 (x,z) 是否生成树 (基于噪声 + 概率)
   * @param {number} x 世界 X
   * @param {number} z 世界 Z
   * @returns {boolean}
   */
  treeAt(x, z) {
    // 树点密度噪声, 高于阈值则有树
    const n = this.noiseTree(x / 4, z / 4);
    if (n < 0.4) return false;
    // 用 hash 进一步稀疏化, 避免连续成林
    const h = ((x * 73856093) ^ (z * 19349663) ^ (this.seed * 83492791)) >>> 0;
    return (h % 100) < 8; // ~8% 概率
  }

  /**
   * 判断世界 (x,y,z) 是否为洞穴 (3D 噪声阈值)
   * @param {number} x 世界 X
   * @param {number} y 世界 Y
   * @param {number} z 世界 Z
   * @returns {boolean}
   */
  isCave(x, y, z) {
    if (y < 5 || y > 80) return false;
    const n = this.noiseCave(x / 18, y / 12, z / 18);
    // ridged: 越接近 0 越像管道
    return Math.abs(n) < 0.06;
  }

  /**
   * 决定石头处的矿石类型 (按 Y 与噪声)
   * @param {number} x 世界 X
   * @param {number} y 世界 Y
   * @param {number} z 世界 Z
   * @returns {number} 方块 id (默认 STONE)
   */
  oreAt(x, y, z) {
    const n = this.noiseOre(x / 10, y / 10, z / 10);
    if (y < 16 && n > 0.85) return BlockId.DIAMOND_ORE;
    if (y < 32 && n > 0.82) return BlockId.GOLD_ORE;
    if (y < 48 && n > 0.78) return BlockId.IRON_ORE;
    if (n > 0.75) return BlockId.COAL_ORE;
    return BlockId.STONE;
  }

  /**
   * 生成区块地形 (填充 chunk.blocks), 不含跨区块树叶; 树木会向邻块探出
   * 通过扫描 3 格边距内的树点确保边界树叶正确
   * @param {import('./Chunk.js').Chunk} chunk 目标区块
   */
  generate(chunk) {
    const { cx, cz } = chunk;
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    // 1. 地表与地下填充
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const h = this.heightAt(wx, wz);

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let id = BlockId.AIR;
          if (y === 0) {
            id = BlockId.BEDROCK;
          } else if (y < h - 4) {
            id = this.oreAt(wx, y, wz);
            // 洞穴挖空
            if (this.isCave(wx, y, wz)) id = BlockId.AIR;
          } else if (y < h - 1) {
            id = BlockId.DIRT;
            if (this.isCave(wx, y, wz)) id = BlockId.AIR;
          } else if (y < h) {
            // 表层
            if (h <= SEA_LEVEL + 1) {
              id = BlockId.SAND; // 海滩
            } else if (h > SEA_LEVEL + 28) {
              id = BlockId.SNOW; // 雪山
            } else {
              id = BlockId.GRASS;
            }
          } else if (y < SEA_LEVEL) {
            id = BlockId.WATER;
          }
          chunk.setLocal(lx, y, lz, id);
        }
      }
    }

    // 2. 树木: 扫描本区块及 3 格外延世界坐标, 命中树点则盖章
    // 修复: 必须验证地面方块是 GRASS (排除沙子/水面/洞穴挖空), 否则会出现"空中树"或"水上树"
    const MARGIN = 3;
    for (let dx = -MARGIN; dx < CHUNK_SIZE + MARGIN; dx++) {
      for (let dz = -MARGIN; dz < CHUNK_SIZE + MARGIN; dz++) {
        const wx = baseX + dx;
        const wz = baseZ + dz;
        if (!this.treeAt(wx, wz)) continue;
        const h = this.heightAt(wx, wz);
        const groundY = h; // 草方块 y = h-1, 树干起始 y = h
        // 1. 高度限制: 只在草地高度范围 (高于海滩 + 低于雪线)
        if (h <= SEA_LEVEL + 1 || h > SEA_LEVEL + 28) continue;
        // 2. 验证地面方块: 检查 (wx, h-1, wz) 处实际方块是否为 GRASS
        //    (洞穴会挖空地表导致 h-1 为 AIR, 海滩 h-1 为 SAND, 都不应生成树)
        const groundBlockId = this._getGroundBlock(chunk, wx, h - 1, wz);
        if (groundBlockId !== BlockId.GRASS) continue;
        this.stampTree(chunk, wx, groundY, wz);
      }
    }
  }

  /**
   * 获取世界坐标 (wx, wy, wz) 处的方块 id (限定本区块内)
   * 用于树木生成前的地面方块验证 (不依赖跨区块查询, 因为树点扫描边距内的方块已在步骤1生成)
   * @param {import('./Chunk.js').Chunk} chunk
   * @param {number} wx 世界 X
   * @param {number} wy 世界 Y
   * @param {number} wz 世界 Z
   * @returns {number} 方块 id (越界返回 0)
   */
  _getGroundBlock(chunk, wx, wy, wz) {
    const lx = worldToLocal(wx, CHUNK_SIZE);
    const lz = worldToLocal(wz, CHUNK_SIZE);
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return 0;
    if (wy < 0 || wy >= CHUNK_HEIGHT) return 0;
    return chunk.getLocal(lx, wy, lz);
  }

  /**
   * 在世界坐标 (wx, groundY, wz) 处盖章一棵树 (树干 + 树叶)
   * 自动裁剪到区块边界, 树干高度 4-6, 树叶为球冠
   * @param {import('./Chunk.js').Chunk} chunk 区块
   * @param {number} wx 树干 X (世界)
   * @param {number} groundY 树干底部 Y (草地之上)
   * @param {number} wz 树干 Z (世界)
   */
  stampTree(chunk, wx, groundY, wz) {
    // 用世界坐标作为种子, 保证树形态稳定
    const treePrng = mulberry32(((wx * 374761393) ^ (wz * 668265263) ^ (this.seed * 2147483647)) >>> 0);
    const trunkHeight = 4 + Math.floor(treePrng() * 3); // 4-6
    const topY = groundY + trunkHeight;

    // 树干
    for (let i = 0; i < trunkHeight; i++) {
      this.setWorldBlock(chunk, wx, groundY + i, wz, BlockId.LOG);
    }

    // 树叶: 顶部 2 层球形 + 顶端十字
    const leafRadius = 2;
    for (let dy = -2; dy <= 1; dy++) {
      const ly = topY + dy;
      const r = dy < 0 ? leafRadius : leafRadius - 1;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0 && dy < 0) continue; // 树干位置跳过
          // 圆形 (曼哈顿/欧式混合)
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > r + 0.3) continue;
          // 边缘随机裁剪使形状自然
          if (dist > r - 0.3 && treePrng() < 0.4) continue;
          this.setWorldBlock(chunk, wx + dx, ly, wz + dz, BlockId.LEAVES);
        }
      }
    }
    // 顶端高 1 格
    this.setWorldBlock(chunk, wx, topY + 1, wz, BlockId.LEAVES);
  }

  /**
   * 将世界坐标处方块写入指定区块 (自动裁剪到区块边界, 不覆盖已存在的非空气方块以保护地形)
   * @param {import('./Chunk.js').Chunk} chunk 区块
   * @param {number} wx 世界 X
   * @param {number} wy 世界 Y
   * @param {number} wz 世界 Z
   * @param {number} id 方块 id
   */
  setWorldBlock(chunk, wx, wy, wz, id) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const lx = worldToLocal(wx, CHUNK_SIZE);
    const lz = worldToLocal(wz, CHUNK_SIZE);
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
    // 树叶不覆盖已有方块 (保留树干)
    const existing = chunk.getLocal(lx, wy, lz);
    if (id === BlockId.LEAVES && existing !== BlockId.AIR) return;
    chunk.setLocal(lx, wy, lz, id);
  }
}
