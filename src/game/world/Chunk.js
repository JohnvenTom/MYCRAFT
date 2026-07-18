/**
 * @file 区块数据
 * @description 单个区块 (16×16×256) 的方块数据存储与读写, 持有网格引用
 */

import { CHUNK_SIZE, CHUNK_HEIGHT } from '../../config/constants.js';

/** 区块方块数据总长度 */
const BLOCK_COUNT = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

export class Chunk {
  /**
   * @param {number} cx 区块 X 索引
   * @param {number} cz 区块 Z 索引
   */
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    /** @type {Uint8Array} 方块 id 数组 (索引 = lx + lz*CHUNK_SIZE + ly*CHUNK_SIZE*CHUNK_SIZE) */
    this.blocks = new Uint8Array(BLOCK_COUNT);
    /** @type {THREE.Mesh|null} 不透明网格 */
    this.meshOpaque = null;
    /** @type {THREE.Mesh|null} 透明网格 (水/叶/玻璃) */
    this.meshTransparent = null;
    /** 是否需要重建网格 */
    this.dirty = true;
    /** 是否已加载到世界 */
    this.loaded = false;
    /** 是否已生成地形 (区分 "已分配但未生成" 与 "已生成") */
    this.generated = false;
    /** 当前网格的 LOD 等级 (0=完整, 1=跳过树叶, 2=跳过AO); 用于检测 LOD 变化触发重建 */
    this.lodLevel = 0;
  }

  /**
   * 将局部坐标转为数组索引
   * @param {number} lx 局部 X [0, CHUNK_SIZE)
   * @param {number} ly 局部 Y [0, CHUNK_HEIGHT)
   * @param {number} lz 局部 Z [0, CHUNK_SIZE)
   * @returns {number} 数组索引
   */
  index(lx, ly, lz) {
    return lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE;
  }

  /**
   * 读取局部坐标处方块 id
   * @param {number} lx 局部 X
   * @param {number} ly 局部 Y
   * @param {number} lz 局部 Z
   * @returns {number} 方块 id (越界返回 0/AIR)
   */
  getLocal(lx, ly, lz) {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT) {
      return 0;
    }
    return this.blocks[this.index(lx, ly, lz)];
  }

  /**
   * 设置局部坐标处方块 id
   * @param {number} lx 局部 X
   * @param {number} ly 局部 Y
   * @param {number} lz 局部 Z
   * @param {number} id 方块 id
   */
  setLocal(lx, ly, lz, id) {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT) {
      return;
    }
    this.blocks[this.index(lx, ly, lz)] = id;
    this.dirty = true;
  }

  /**
   * 序列化方块数据用于持久化
   * @returns {Uint8Array} 数据副本
   */
  serialize() {
    return this.blocks.slice();
  }

  /**
   * 从持久化数据恢复
   * @param {Uint8Array} data 方块数据
   */
  deserialize(data) {
    if (data.length !== BLOCK_COUNT) {
      throw new Error(`区块数据长度不匹配: 期望 ${BLOCK_COUNT}, 实际 ${data.length}`);
    }
    this.blocks.set(data);
    this.generated = true;
    this.dirty = true;
  }

  /**
   * 销毁网格并释放资源 (区块卸载时调用)
   * @param {THREE.Scene} scene 场景, 用于移除 mesh
   */
  dispose(scene) {
    if (this.meshOpaque) {
      scene.remove(this.meshOpaque);
      this.meshOpaque.geometry.dispose();
      this.meshOpaque = null;
    }
    if (this.meshTransparent) {
      scene.remove(this.meshTransparent);
      this.meshTransparent.geometry.dispose();
      this.meshTransparent = null;
    }
  }
}
