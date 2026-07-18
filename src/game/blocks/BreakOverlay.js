/**
 * @file 方块破坏裂缝覆盖层
 * @description 在玩家正在破坏的方块上方叠加一层 "破坏阶段" 贴图,
 *              根据破坏进度 (0..1) 切换 10 档裂缝贴图, 视觉上像 Minecraft 原版
 *              的方块逐渐龟裂效果.
 *
 * 实现细节:
 *   - 单个 BoxGeometry(1.005) 略大于方块, 避免与方块表面 Z-fighting
 *   - 6 面共享同一张破坏阶段贴图 (MeshBasicMaterial map = atlas)
 *   - 透明 + 不写深度 + polygonOffset, 让裂缝显示在方块表面之上但不遮挡视线
 *   - 通过修改 geometry 的 UV 来切换 10 档裂缝贴图 (UV 指向 atlas 中不同 stage)
 */

import * as THREE from 'three';
import { TileIndex, TILES_PER_ROW, TILE_SIZE, ATLAS_ROWS } from '../../utils/TextureAtlas.js';

/** 破坏阶段贴图数量 (0..9 共 10 档, 与 Minecraft 原版一致) */
const DESTROY_STAGES = 10;

export class BreakOverlay {
  /**
   * @param {THREE.Scene} scene 场景
   * @param {THREE.Texture} atlasTexture 图集纹理 (用于破坏阶段贴图采样)
   */
  constructor(scene, atlasTexture) {
    this.scene = scene;
    this.atlasTexture = atlasTexture;

    /** 当前显示的破坏阶段 (-1 = 未显示) */
    this.currentStage = -1;

    // 预计算 10 档破坏阶段贴图的 UV (4 个数: u0, v0, u1, v1)
    this.stageUVs = [];
    for (let i = 0; i < DESTROY_STAGES; i++) {
      const tileIndex = TileIndex.DESTROY_STAGE_0 + i;
      this.stageUVs.push(this._computeUV(tileIndex));
    }

    // BoxGeometry 6 个面, 每面 4 个顶点, 每顶点 2 个 UV 分量
    // geometry.uv 默认顺序: 6 面, 每面 4 个 UV, 共 24 个 UV 顶点
    const geo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    // 把每个面的 4 个 UV 都改为 stage 0 的 UV (初始状态)
    this._uvAttr = geo.attributes.uv;
    this._setUVForStage(0);

    const mat = new THREE.MeshBasicMaterial({
      map: atlasTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this._geo = geo;
    this._mat = mat;
  }

  /**
   * 计算贴图索引对应的 UV (与 TextureAtlas._computeUV 一致, 但避免循环依赖)
   * @param {number} tileIndex 贴图索引
   * @returns {{u0:number, v0:number, u1:number, v1:number}}
   */
  _computeUV(tileIndex) {
    const col = tileIndex % TILES_PER_ROW;
    const row = Math.floor(tileIndex / TILES_PER_ROW);
    const totalWidth = TILES_PER_ROW * TILE_SIZE;
    const totalHeight = ATLAS_ROWS * TILE_SIZE;
    const inset = 0.5;
    const u0 = (col * TILE_SIZE + inset) / totalWidth;
    const u1 = ((col + 1) * TILE_SIZE - inset) / totalWidth;
    const v1 = 1 - (row * TILE_SIZE + inset) / totalHeight;
    const v0 = 1 - ((row + 1) * TILE_SIZE - inset) / totalHeight;
    return { u0, v0, u1, v1 };
  }

  /**
   * 把 BoxGeometry 6 个面的 UV 全部设置为指定 stage 的 UV
   * BoxGeometry 默认每面 4 个顶点 UV, 排列: (0,1)(1,1)(0,0)(1,0)
   * 我们改为 (u0,v1)(u1,v1)(u0,v0)(u1,v0) 让贴图正向显示
   * @param {number} stage 破坏阶段 0-9
   */
  _setUVForStage(stage) {
    const { u0, v0, u1, v1 } = this.stageUVs[stage];
    const arr = this._uvAttr.array;
    // BoxGeometry 6 面, 每面 4 顶点
    for (let face = 0; face < 6; face++) {
      const base = face * 8; // 每面 4 顶点 * 2 分量
      // 顶点顺序: (0,1) (1,1) (0,0) (1,0) → (u0,v1) (u1,v1) (u0,v0) (u1,v0)
      arr[base + 0] = u0; arr[base + 1] = v1;
      arr[base + 2] = u1; arr[base + 3] = v1;
      arr[base + 4] = u0; arr[base + 5] = v0;
      arr[base + 6] = u1; arr[base + 7] = v0;
    }
    this._uvAttr.needsUpdate = true;
  }

  /**
   * 在指定方块位置显示对应破坏进度的裂缝
   * @param {number} x 方块 X
   * @param {number} y 方块 Y
   * @param {number} z 方块 Z
   * @param {number} progress 破坏进度 0..1
   */
  show(x, y, z, progress) {
    // 把 0..1 映射到 0..9 (stage)
    const stage = Math.min(DESTROY_STAGES - 1, Math.max(0, Math.floor(progress * DESTROY_STAGES)));
    if (stage !== this.currentStage) {
      this._setUVForStage(stage);
      this.currentStage = stage;
    }
    this.mesh.visible = true;
    this.mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  }

  /**
   * 隐藏裂缝覆盖层 (玩家停止破坏或方块已破坏)
   */
  hide() {
    this.mesh.visible = false;
    this.currentStage = -1;
  }

  /**
   * 释放资源
   */
  dispose() {
    this.scene.remove(this.mesh);
    this._geo.dispose();
    this._mat.dispose();
  }
}
