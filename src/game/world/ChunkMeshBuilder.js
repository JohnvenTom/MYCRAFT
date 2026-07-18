/**
 * @file 区块网格构建器
 * @description 把区块方块数据转换为 Three.js BufferGeometry:
 *              - 面剔除 (邻居为不透明则跳过)
 *              - 纹理图集 UV 映射 (top/bottom/side 三面)
 *              - 环境光遮蔽 (AO) 4 级亮度
 *              - 不透明 / 透明 双网格分离
 *              - AO 翻转避免对角线伪影
 */

import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../../config/constants.js';
import { getBlock, isTransparent } from './BlockType.js';

/**
 * 6 面定义: 方向 + 4 个顶点 (CCW 从外部看) + 每顶点的 UV 索引
 * pos 为相对方块原点 (0..1) 的偏移; uv[0]=u 方向索引(0或1), uv[1]=v 方向索引
 */
const FACES = [
  { // +X 右
    dir: [1, 0, 0],
    tile: 'side',
    corners: [
      { pos: [1, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [1, 1] },
      { pos: [1, 1, 1], uv: [0, 1] },
    ],
  },
  { // -X 左
    dir: [-1, 0, 0],
    tile: 'side',
    corners: [
      { pos: [0, 0, 0], uv: [0, 0] },
      { pos: [0, 0, 1], uv: [1, 0] },
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [0, 1, 0], uv: [0, 1] },
    ],
  },
  { // +Y 顶
    dir: [0, 1, 0],
    tile: 'top',
    corners: [
      { pos: [0, 1, 1], uv: [0, 0] },
      { pos: [1, 1, 1], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [1, 1] },
      { pos: [0, 1, 0], uv: [0, 1] },
    ],
  },
  { // -Y 底
    dir: [0, -1, 0],
    tile: 'bottom',
    corners: [
      { pos: [0, 0, 0], uv: [0, 0] },
      { pos: [1, 0, 0], uv: [1, 0] },
      { pos: [1, 0, 1], uv: [1, 1] },
      { pos: [0, 0, 1], uv: [0, 1] },
    ],
  },
  { // +Z 前 (修复: 顶点缠绕改为 CCW 从 +Z 看, 使正面朝外, 避免被背面剔除)
    dir: [0, 0, 1],
    tile: 'side',
    corners: [
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [1, 1, 1], uv: [1, 1] },
      { pos: [0, 1, 1], uv: [0, 1] },
    ],
  },
  { // -Z 后 (修复: 顶点缠绕改为 CCW 从 -Z 看, 使正面朝外)
    dir: [0, 0, -1],
    tile: 'side',
    corners: [
      { pos: [1, 0, 0], uv: [0, 0] },
      { pos: [0, 0, 0], uv: [1, 0] },
      { pos: [0, 1, 0], uv: [1, 1] },
      { pos: [1, 1, 0], uv: [0, 1] },
    ],
  },
];

/** AO 亮度映射 (4 级: 0 最暗, 3 最亮)
 *  修复: 原 [0.5, 0.7, 0.85, 1.0] 最暗级别 0.5 导致凹角发黑看不清
 *        提高到 [0.65, 0.78, 0.9, 1.0] 让暗部仍可辨认 */
const AO_LEVELS = [0.65, 0.78, 0.9, 1.0];

/**
 * 计算单顶点 AO 等级 (0-3)
 * @param {boolean} side1 邻居1 是否遮挡
 * @param {boolean} side2 邻居2 是否遮挡
 * @param {boolean} corner 对角 是否遮挡
 * @returns {number} 0-3
 */
function vertexAO(side1, side2, corner) {
  if (side1 && side2) return 0;
  return 3 - ((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0));
}

/**
 * 网格构建器
 */
export class ChunkMeshBuilder {
  /**
   * @param {import('../../utils/TextureAtlas.js').TextureAtlas} atlas 纹理图集
   */
  constructor(atlas) {
    this.atlas = atlas;
  }

  /**
   * 构建区块网格 (不透明 + 透明 + 水面), 返回 BufferGeometry 数组
   * 高级光影: 水面单独分离, 让 World 用 materialWater (有 normalMap + 高光)
   * @param {import('./Chunk.js').Chunk} chunk 区块
   * @param {(wx:number,wy:number,wz:number) => number} getBlockWorld 获取世界坐标方块 id (跨区块)
   * @param {Object} [opts]
   * @param {number} [opts.lodLevel=0] LOD 等级: 0=完整(含AO), 1=跳过透明网格, 2=跳过AO
   * @returns {{opaque: THREE.BufferGeometry|null, transparent: THREE.BufferGeometry|null, water: THREE.BufferGeometry|null}}
   */
  build(chunk, getBlockWorld, opts = {}) {
    const lodLevel = opts.lodLevel || 0;
    // LOD1: 只跳过树叶 (大量面, 远处不可见的性能大头); 保留水/玻璃 (大面积缺失会有明显视觉伪影)
    const skipLeaves = lodLevel >= 1;
    const skipAO = lodLevel >= 2;

    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    /** 不透明面数据 */
    const opaqueData = this._newMeshData();
    /** 透明面数据 (树叶/玻璃) */
    const transparentData = this._newMeshData();
    /** 水面数据 (单独材质) */
    const waterData = this._newMeshData();

    for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const id = chunk.getLocal(lx, ly, lz);
          if (id === 0) continue; // 空气
          const def = getBlock(id);
          const wx = baseX + lx;
          const wy = ly;
          const wz = baseZ + lz;
          // LOD1+ 跳过树叶 (性能大头); 水和玻璃仍渲染
          if (skipLeaves && id === 6 /* LEAVES */) continue;
          // 路由: 水单独放 waterData; 其他透明 (树叶/玻璃) 放 transparentData; 不透明放 opaqueData
          let target;
          if (def.liquid) target = waterData;
          else if (def.transparent) target = transparentData;
          else target = opaqueData;

          for (let f = 0; f < FACES.length; f++) {
            const face = FACES[f];
            const nx = wx + face.dir[0];
            const ny = wy + face.dir[1];
            const nz = wz + face.dir[2];
            const neighborId = getBlockWorld(nx, ny, nz);

            // 面剔除判定
            if (!this._shouldRenderFace(id, neighborId)) continue;

            // 贴图
            const tileIndex = def.tiles[face.tile];
            const uv = this.atlas.getUV(tileIndex);

            // AO: 对 4 个顶点分别计算 (LOD2 跳过)
            const ao = skipAO ? [3, 3, 3, 3] : this._computeFaceAO(face, wx, wy, wz, getBlockWorld);

            this._addFace(target, face, wx, wy, wz, uv, ao, def.renderDoubleSided);
          }
        }
      }
    }

    return {
      opaque: this._finalize(opaqueData, false),
      transparent: transparentData ? this._finalize(transparentData, true) : null,
      water: waterData.positions.length > 0 ? this._finalize(waterData, true) : null,
    };
  }

  /**
   * 判定当前方块某面是否应渲染
   * 规则:
   *   - 邻居为空气 → 渲染
   *   - 邻居不透明 → 隐藏
   *   - 邻居透明同类 (水-水) → 跳过 (水面连续)
   *   - 邻居透明同类 (叶-叶) → 仍渲染 (树叶有孔洞, 需要看到内部, 否则从外面看会出现"空"的伪影)
   *   - 邻居透明异类 → 渲染
   * @param {number} currentId 当前方块 id
   * @param {number} neighborId 邻居方块 id
   * @returns {boolean}
   */
  _shouldRenderFace(currentId, neighborId) {
    if (neighborId === 0) return true; // 空气
    const current = getBlock(currentId);
    const neighbor = getBlock(neighborId);
    if (!neighbor.transparent) return false; // 邻居不透明 → 隐藏
    // 邻居透明
    if (neighborId === currentId) {
      // 同类透明: 水面连续不渲染; 树叶有孔洞仍渲染 (renderDoubleSided 标志)
      return !!current.renderDoubleSided;
    }
    return true;
  }

  /**
   * 创建空的网格数据容器
   * @returns {{positions:number[], normals:number[], uvs:number[], colors:number[], indices:number[]}}
   */
  _newMeshData() {
    return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  }

  /**
   * 计算面 4 顶点的 AO 等级
   * @param {Object} face 面定义
   * @param {number} wx 世界 X
   * @param {number} wy 世界 Y
   * @param {number} wz 世界 Z
   * @param {(wx:number,wy:number,wz:number) => number} getBlockWorld
   * @returns {number[]} 4 个 AO 等级 [0..3]
   */
  _computeFaceAO(face, wx, wy, wz, getBlockWorld) {
    const dx = face.dir[0], dy = face.dir[1], dz = face.dir[2];
    // 切线方向 (与法线垂直的两个轴)
    // 选择法线为 0 的两个轴作为切线
    let t1, t2;
    if (dx !== 0) { t1 = [0, 1, 0]; t2 = [0, 0, 1]; }
    else if (dy !== 0) { t1 = [1, 0, 0]; t2 = [0, 0, 1]; }
    else { t1 = [1, 0, 0]; t2 = [0, 1, 0]; }

    const ao = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      ao[i] = this._vertexAOExplicit(face, face.corners[i], wx, wy, wz, getBlockWorld, t1, t2, dx, dy, dz);
    }
    return ao;
  }

  /**
   * 显式计算单顶点 AO
   * @param {Object} face 面定义
   * @param {Object} corner 顶点定义
   * @param {number} wx 世界 X
   * @param {number} wy 世界 Y
   * @param {number} wz 世界 Z
   * @param {(wx:number,wy:number,wz:number) => number} getBlockWorld
   * @param {number[]} t1 切线1
   * @param {number[]} t2 切线2
   * @param {number} dx 法线 X
   * @param {number} dy 法线 Y
   * @param {number} dz 法线 Z
   * @returns {number} AO 等级 0-3
   */
  _vertexAOExplicit(face, corner, wx, wy, wz, getBlockWorld, t1, t2, dx, dy, dz) {
    // 顶点在切线方向上的符号 (-1/+1)
    const s1 = (corner.pos[0] * t1[0] + corner.pos[1] * t1[1] + corner.pos[2] * t1[2]) > 0 ? 1 : -1;
    const s2 = (corner.pos[0] * t2[0] + corner.pos[1] * t2[1] + corner.pos[2] * t2[2]) > 0 ? 1 : -1;

    // side1 = 法线方向 + t1 方向 的邻居
    const side1 = this._isOccluder(getBlockWorld(
      wx + dx + t1[0] * s1,
      wy + dy + t1[1] * s1,
      wz + dz + t1[2] * s1
    ));
    // side2 = 法线方向 + t2 方向 的邻居
    const side2 = this._isOccluder(getBlockWorld(
      wx + dx + t2[0] * s2,
      wy + dy + t2[1] * s2,
      wz + dz + t2[2] * s2
    ));
    // corner = 法线 + t1 + t2 方向的邻居
    const cornerOccl = this._isOccluder(getBlockWorld(
      wx + dx + t1[0] * s1 + t2[0] * s2,
      wy + dy + t1[1] * s1 + t2[1] * s2,
      wz + dz + t1[2] * s1 + t2[2] * s2
    ));
    return vertexAO(side1, side2, cornerOccl);
  }

  /**
   * 判断方块 id 是否为 AO 遮挡源 (不透明固体)
   * @param {number} id 方块 id
   * @returns {boolean}
   */
  _isOccluder(id) {
    if (id === 0) return false;
    const def = getBlock(id);
    return !def.transparent;
  }

  /**
   * 添加一个面 (4 顶点, 2 三角形) 到网格数据
   * 根据 AO 决定是否翻转对角线, 避免单边暗化伪影
   * @param {Object} data 网格数据容器
   * @param {Object} face 面定义
   * @param {number} wx 世界 X
   * @param {number} wy 世界 Y
   * @param {number} wz 世界 Z
   * @param {{u0:number,v0:number,u1:number,v1:number}} uv 贴图 UV
   * @param {number[]} ao 4 顶点 AO 等级
   * @param {boolean} doubleSided 是否双面 (用于翻转法线/不影响)
   */
  _addFace(data, face, wx, wy, wz, uv, ao, doubleSided) {
    const start = data.positions.length / 3;
    const n = face.dir;

    for (let i = 0; i < 4; i++) {
      const c = face.corners[i];
      data.positions.push(wx + c.pos[0], wy + c.pos[1], wz + c.pos[2]);
      data.normals.push(n[0], n[1], n[2]);
      // UV: 用顶点的 uv 索引 (0/1) 在贴图 UV 范围内插值
      const u = uv.u0 + c.uv[0] * (uv.u1 - uv.u0);
      const v = uv.v0 + c.uv[1] * (uv.v1 - uv.v0);
      data.uvs.push(u, v);
      // 顶点颜色 = AO 亮度 (灰度)
      const brightness = AO_LEVELS[ao[i] ?? 3];
      data.colors.push(brightness, brightness, brightness);
    }

    // 三角形索引: AO[0]+AO[2] > AO[1]+AO[3] 时翻转, 否则按默认 (0,1,2)(0,2,3)
    const a0 = ao[0], a1 = ao[1], a2 = ao[2], a3 = ao[3];
    if (a0 + a2 > a1 + a3) {
      // 翻转对角线: (0,1,3)(1,2,3)
      data.indices.push(start, start + 1, start + 3);
      data.indices.push(start + 1, start + 2, start + 3);
    } else {
      data.indices.push(start, start + 1, start + 2);
      data.indices.push(start, start + 2, start + 3);
    }
  }

  /**
   * 把网格数据封装为 BufferGeometry
   * @param {Object} data 网格数据
   * @param {boolean} transparent 是否透明网格
   * @returns {THREE.BufferGeometry|null}
   */
  _finalize(data, transparent) {
    if (data.indices.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
    geo.setIndex(data.indices);
    geo.computeBoundingSphere();
    return geo;
  }
}
