/**
 * @file 世界管理器
 * @description 区块的创建、流式加载/卸载、世界坐标方块查询/修改、网格重建调度
 *              维护一个 Map<chunkKey, Chunk>, 在玩家移动时按渲染距离更新可见区块集合
 */

import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE, SEA_LEVEL } from '../../config/constants.js';
import { Chunk } from './Chunk.js';
import { ChunkMeshBuilder } from './ChunkMeshBuilder.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { BlockId, isSolid } from './BlockType.js';
import { worldToChunkX, worldToChunkZ, worldToLocal } from '../../utils/MathUtils.js';

export class World {
  /**
   * @param {Object} opts
   * @param {number} opts.seed 世界种子
   * @param {THREE.Scene} opts.scene Three.js 场景
   * @param {import('../../utils/TextureAtlas.js').TextureAtlas} opts.atlas 纹理图集
   * @param {number} [opts.renderDistance] 渲染距离 (区块数)
   */
  constructor({ seed, scene, atlas, renderDistance = RENDER_DISTANCE }) {
    this.seed = seed;
    this.scene = scene;
    this.atlas = atlas;
    this.renderDistance = renderDistance;

    this.terrain = new TerrainGenerator(seed);
    this.meshBuilder = new ChunkMeshBuilder(atlas);

    /** @type {Map<string, Chunk>} 已加载区块 */
    this.chunks = new Map();
    /** 待生成/重建网格的区块队列 (FIFO) */
    this.buildQueue = [];
    /** 每帧最多构建几个区块 (避免卡顿) */
    this.maxBuildsPerFrame = 2;

    // 共享材质 (所有区块复用)
    this.materialOpaque = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
    });
    this.materialTransparent = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      transparent: true,
      opacity: 1,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    // 水单独用半透明材质? 此处先用统一透明材质, 后续可拆分

    /** 用于增量保存: 修改过的区块 key 集合 */
    this.dirtyForSave = new Set();
  }

  /**
   * 生成区块 key
   * @param {number} cx
   * @param {number} cz
   * @returns {string}
   */
  _key(cx, cz) {
    return `${cx},${cz}`;
  }

  /**
   * 设置新的渲染距离, 触发区块重载
   * @param {number} rd 渲染距离 (区块)
   */
  setRenderDistance(rd) {
    this.renderDistance = rd;
  }

  /**
   * 根据玩家区块坐标更新可见区块集合
   * 加载范围内未生成的区块 → 加入生成队列; 范围外区块 → 卸载
   * @param {number} pcx 玩家所在区块 X
   * @param {number} pcz 玩家所在区块 Z
   */
  updateChunks(pcx, pcz) {
    const rd = this.renderDistance;
    // 卸载范围外区块
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - pcx;
      const dz = chunk.cz - pcz;
      if (Math.abs(dx) > rd + 1 || Math.abs(dz) > rd + 1) {
        chunk.dispose(this.scene);
        this.chunks.delete(key);
      }
    }

    // 加载范围内区块 (按距离排序, 近的先)
    const toLoad = [];
    for (let dz = -rd; dz <= rd; dz++) {
      for (let dx = -rd; dx <= rd; dx++) {
        if (dx * dx + dz * dz > (rd + 0.5) * (rd + 0.5)) continue; // 圆形
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = this._key(cx, cz);
        if (this.chunks.has(key)) continue;
        toLoad.push({ cx, cz, dist: dx * dx + dz * dz });
      }
    }
    toLoad.sort((a, b) => a.dist - b.dist);
    for (const { cx, cz } of toLoad) {
      const chunk = new Chunk(cx, cz);
      this.chunks.set(this._key(cx, cz), chunk);
      this.buildQueue.push({ type: 'generate', chunk });
    }

    // 修复: 检查已加载区块的 LOD 等级是否变化, 若变化则入队重建
    // (例如玩家靠近/远离时, 树叶/AO 应出现/消失, 但旧逻辑只在新建区块时构建网格)
    for (const chunk of this.chunks.values()) {
      if (!chunk.generated) continue;
      const newLod = this._computeLOD(chunk, pcx, pcz);
      if (newLod !== chunk.lodLevel && !this._isInBuildQueue(chunk)) {
        chunk.dirty = true;
        this.buildQueue.push({ type: 'rebuild', chunk });
      }
    }
  }

  /**
   * 检查区块是否已在构建队列中
   * @param {Chunk} chunk
   * @returns {boolean}
   */
  _isInBuildQueue(chunk) {
    for (const job of this.buildQueue) {
      if (job.chunk === chunk) return true;
    }
    return false;
  }

  /**
   * 每帧处理构建队列 (受 maxBuildsPerFrame 限制)
   * 生成地形 → 构建网格 → 加入场景
   * @param {number} [pcx] 玩家区块 X (用于 LOD 计算)
   * @param {number} [pcz] 玩家区块 Z
   */
  processBuildQueue(pcx, pcz) {
    let count = 0;
    while (this.buildQueue.length > 0 && count < this.maxBuildsPerFrame) {
      const job = this.buildQueue.shift();
      const lod = (pcx !== undefined && pcz !== undefined)
        ? this._computeLOD(job.chunk, pcx, pcz)
        : 0;
      if (job.type === 'generate') {
        this._generateChunk(job.chunk, lod);
      } else if (job.type === 'rebuild') {
        this._rebuildChunkMesh(job.chunk, { lodLevel: lod });
      }
      count++;
    }
  }

  /**
   * 生成区块地形并构建网格
   * @param {Chunk} chunk
   * @param {number} [lodLevel=0] LOD 等级
   */
  _generateChunk(chunk, lodLevel = 0) {
    if (chunk.generated) {
      this._rebuildChunkMesh(chunk, { lodLevel });
      return;
    }
    this.terrain.generate(chunk);
    chunk.generated = true;
    chunk.loaded = true;
    this._rebuildChunkMesh(chunk, { lodLevel });

    // 标记邻居区块为 dirty (因为新区块的边界方块可能改变邻居的面剔除)
    this._markNeighborsDirty(chunk);
  }

  /**
   * 重建区块网格 (会先清理旧 mesh)
   * @param {Chunk} chunk
   * @param {Object} [opts]
   * @param {number} [opts.lodLevel=0] LOD 等级
   */
  _rebuildChunkMesh(chunk, opts = {}) {
    // 清理旧 mesh
    if (chunk.meshOpaque) {
      this.scene.remove(chunk.meshOpaque);
      chunk.meshOpaque.geometry.dispose();
      chunk.meshOpaque = null;
    }
    if (chunk.meshTransparent) {
      this.scene.remove(chunk.meshTransparent);
      chunk.meshTransparent.geometry.dispose();
      chunk.meshTransparent = null;
    }

    const { opaque, transparent } = this.meshBuilder.build(
      chunk,
      (wx, wy, wz) => this.getBlock(wx, wy, wz),
      opts
    );

    if (opaque) {
      const mesh = new THREE.Mesh(opaque, this.materialOpaque);
      mesh.position.set(0, 0, 0);
      // 显式启用视锥剔除 (Three.js 默认即 true, 此处表达意图)
      // 配合 geometry.computeBoundingSphere() 即可让超出相机视锥的区块提前剔除
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      chunk.meshOpaque = mesh;
    }
    if (transparent) {
      const mesh = new THREE.Mesh(transparent, this.materialTransparent);
      mesh.position.set(0, 0, 0);
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      chunk.meshTransparent = mesh;
    }
    chunk.dirty = false;
    // 记录本次构建使用的 LOD 等级, 供 updateChunks 检测变化
    chunk.lodLevel = opts.lodLevel || 0;
  }

  /**
   * 计算区块相对玩家的 LOD 等级
   * @param {Chunk} chunk
   * @param {number} pcx 玩家区块 X
   * @param {number} pcz 玩家区块 Z
   * @returns {number} 0=完整, 1=跳过透明, 2=跳过AO
   */
  _computeLOD(chunk, pcx, pcz) {
    const dx = chunk.cx - pcx;
    const dz = chunk.cz - pcz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= this.renderDistance * 0.5) return 0; // 近处: 完整
    if (dist <= this.renderDistance * 0.75) return 1; // 中等: 跳过透明
    return 2; // 远处: 跳过 AO
  }

  /**
   * 标记区块的 4 个邻居为 dirty (用于面剔除更新), 仅当邻居已生成时
   * @param {Chunk} chunk
   */
  _markNeighborsDirty(chunk) {
    const neighbors = [
      [chunk.cx + 1, chunk.cz],
      [chunk.cx - 1, chunk.cz],
      [chunk.cx, chunk.cz + 1],
      [chunk.cx, chunk.cz - 1],
    ];
    for (const [nx, nz] of neighbors) {
      const n = this.chunks.get(this._key(nx, nz));
      if (n && n.generated && !n.dirty) {
        n.dirty = true;
        this.buildQueue.push({ type: 'rebuild', chunk: n });
      }
    }
  }

  /**
   * 获取世界坐标处方块 id (跨区块查询)
   * @param {number} wx 世界 X
   * @param {number} wy 世界 Y
   * @param {number} wz 世界 Z
   * @returns {number} 方块 id (越界 / 未加载返回 0)
   */
  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return 0;
    const cx = worldToChunkX(wx, CHUNK_SIZE);
    const cz = worldToChunkZ(wz, CHUNK_SIZE);
    const chunk = this.chunks.get(this._key(cx, cz));
    if (!chunk || !chunk.generated) return 0;
    const lx = worldToLocal(wx, CHUNK_SIZE);
    const lz = worldToLocal(wz, CHUNK_SIZE);
    return chunk.getLocal(lx, wy, lz);
  }

  /**
   * 设置世界坐标处方块 id (会触发该区块及边界邻居网格重建)
   * @param {number} wx 世界 X
   * @param {number} wy 世界 Y
   * @param {number} wz 世界 Z
   * @param {number} id 方块 id
   * @returns {boolean} 是否成功 (区块未加载则失败)
   */
  setBlock(wx, wy, wz, id) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
    const cx = worldToChunkX(wx, CHUNK_SIZE);
    const cz = worldToChunkZ(wz, CHUNK_SIZE);
    const chunk = this.chunks.get(this._key(cx, cz));
    if (!chunk || !chunk.generated) return false;
    const lx = worldToLocal(wx, CHUNK_SIZE);
    const lz = worldToLocal(wz, CHUNK_SIZE);
    chunk.setLocal(lx, wy, lz, id);
    this.dirtyForSave.add(this._key(cx, cz));

    // 立即重建该区块网格
    this._rebuildChunkMesh(chunk);
    // 边界情况: 修改的方块在区块边缘 → 邻居区块也要重建
    if (lx === 0) this._rebuildNeighbor(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this._rebuildNeighbor(cx + 1, cz);
    if (lz === 0) this._rebuildNeighbor(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this._rebuildNeighbor(cx, cz + 1);
    return true;
  }

  /**
   * 重建邻居区块网格 (若已生成)
   * @param {number} cx
   * @param {number} cz
   */
  _rebuildNeighbor(cx, cz) {
    const chunk = this.chunks.get(this._key(cx, cz));
    if (chunk && chunk.generated) {
      this._rebuildChunkMesh(chunk);
    }
  }

  /**
   * 检查玩家 AABB 是否与任何固体方块相交
   * 用于物理碰撞检测
   * @param {THREE.Box3} aabb 玩家 AABB
   * @returns {boolean}
   */
  collides(aabb) {
    const minX = Math.floor(aabb.min.x);
    const maxX = Math.floor(aabb.max.x);
    const minY = Math.floor(aabb.min.y);
    const maxY = Math.floor(aabb.max.y);
    const minZ = Math.floor(aabb.min.z);
    const maxZ = Math.floor(aabb.max.z);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const id = this.getBlock(x, y, z);
          if (id !== 0 && isSolid(id)) return true;
        }
      }
    }
    return false;
  }

  /**
   * 在世界坐标 (wx, wz) 找到最高非空方块 Y (用于出生点)
   * @param {number} wx
   * @param {number} wz
   * @returns {number} 最高方块 Y, 全空返回 0
   */
  getHighestY(wx, wz) {
    const cx = worldToChunkX(wx, CHUNK_SIZE);
    const cz = worldToChunkZ(wz, CHUNK_SIZE);
    const chunk = this.chunks.get(this._key(cx, cz));
    if (!chunk || !chunk.generated) return SEA_LEVEL;
    const lx = worldToLocal(wx, CHUNK_SIZE);
    const lz = worldToLocal(wz, CHUNK_SIZE);
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const id = chunk.getLocal(lx, y, lz);
      if (id !== 0 && id !== BlockId.WATER) return y;
    }
    return 0;
  }

  /**
   * 销毁所有区块, 释放资源
   */
  dispose() {
    for (const chunk of this.chunks.values()) {
      chunk.dispose(this.scene);
    }
    this.chunks.clear();
    this.buildQueue.length = 0;
    this.materialOpaque.dispose();
    this.materialTransparent.dispose();
  }
}
