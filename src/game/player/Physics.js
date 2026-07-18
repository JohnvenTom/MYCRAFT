/**
 * @file 物理系统
 * @description 重力 + AABB 分轴碰撞解算; 处理玩家与方块的碰撞响应 (滑墙/落地/撞顶)
 *              水中: 减速 + 浮力 (玩家可上下游动)
 */

import * as THREE from 'three';
import { GRAVITY, JUMP_VELOCITY } from '../../config/constants.js';
import { isSolid } from '../world/BlockType.js';
import { BlockId } from '../world/BlockType.js';

export class Physics {
  /**
   * @param {import('../world/World.js').World} world 世界引用 (用于查询方块)
   */
  constructor(world) {
    this.world = world;
    /** 最大下落速度 (m/s), 防止穿地 */
    this.terminalVelocity = -78;
    /** 水中水平速度倍率 */
    this.waterSpeedMul = 0.5;
    /** 水中浮力加速度 (m/s², 抵消部分重力) */
    this.waterBuoyancy = 18;
    /** 水中最大上浮速度 (m/s) */
    this.waterMaxUpSpeed = 4;
  }

  /**
   * 物理步进 (固定步长)
   * 修复: _moveAxis 只改 AABB, 必须从 AABB 反推 player.position, 否则 syncTransform()
   * 调用 _updateAABB() 会用旧 position 重置 AABB, 玩家永远无法移动
   * 水中: 应用浮力抵消重力, 玩家可上下游动
   * @param {import('./Player.js').Player} player
   * @param {number} dt 固定步长 (秒)
   */
  step(player, dt) {
    if (player.gameMode === 'creative') {
      // 创造模式: 不应用重力, 不碰撞 (但仍检查方块避免穿模? 此处直接飞行)
      this._moveCreative(player, dt);
      return;
    }

    // 检查玩家是否在水中 (眼睛或脚在 WATER 方块内)
    const inWater = this._isInWater(player);

    if (inWater) {
      // 水中: 浮力抵消大部分重力, 限制下落速度
      player.velocity.y -= (GRAVITY - this.waterBuoyancy) * dt;
      if (player.velocity.y < -3) player.velocity.y = -3; // 水中下沉速度限制
      // 水平减速 (水阻力)
      player.velocity.x *= 0.8;
      player.velocity.z *= 0.8;
    } else {
      // 空气中: 正常重力
      player.velocity.y -= GRAVITY * dt;
      if (player.velocity.y < this.terminalVelocity) player.velocity.y = this.terminalVelocity;
    }

    // 分轴移动 + 碰撞 (只修改 AABB)
    player.onGround = false;
    this._moveAxis(player, 'x', player.velocity.x * dt);
    this._moveAxis(player, 'z', player.velocity.z * dt);
    this._moveAxis(player, 'y', player.velocity.y * dt);

    // 关键: 从 AABB 反推 player.position (脚底中心)
    // AABB 的 X/Z 中心 = player.position.x/z; AABB.min.y = player.position.y (脚底)
    player.position.x = (player.aabb.min.x + player.aabb.max.x) / 2;
    player.position.y = player.aabb.min.y;
    player.position.z = (player.aabb.min.z + player.aabb.max.z) / 2;

    player.syncTransform();
  }

  /**
   * 检查玩家是否在水中 (脚底或眼睛位置为 WATER)
   * @param {import('./Player.js').Player} player
   * @returns {boolean}
   */
  _isInWater(player) {
    // 检查脚底位置
    const feetId = this.world.getBlock(
      Math.floor(player.position.x),
      Math.floor(player.position.y + 0.1),
      Math.floor(player.position.z)
    );
    if (feetId === BlockId.WATER) return true;
    // 检查眼睛位置 (玩家完全浸入水中)
    const eyeId = this.world.getBlock(
      Math.floor(player.position.x),
      Math.floor(player.position.y + player.eyeHeight),
      Math.floor(player.position.z)
    );
    return eyeId === BlockId.WATER;
  }

  /**
   * 检查玩家眼睛是否在水下 (用于视觉效果)
   * @param {import('./Player.js').Player} player
   * @returns {boolean}
   */
  isEyeInWater(player) {
    const id = this.world.getBlock(
      Math.floor(player.position.x),
      Math.floor(player.position.y + player.eyeHeight),
      Math.floor(player.position.z)
    );
    return id === BlockId.WATER;
  }

  /**
   * 创造模式移动 (无重力, 无碰撞, 玩家自行控制 Y)
   * @param {import('./Player.js').Player} player
   * @param {number} dt
   */
  _moveCreative(player, dt) {
    player.position.x += player.velocity.x * dt;
    player.position.y += player.velocity.y * dt;
    player.position.z += player.velocity.z * dt;
    // 简单边界: 不低于 y=0
    if (player.position.y < 0) player.position.y = 0;
    player.syncTransform();
  }

  /**
   * 沿单轴移动并解算碰撞
   * @param {import('./Player.js').Player} player
   * @param {'x'|'y'|'z'} axis 轴
   * @param {number} delta 该轴位移
   */
  _moveAxis(player, axis, delta) {
    if (delta === 0) return;
    const aabb = player.aabb;
    aabb.min[axis] += delta;
    aabb.max[axis] += delta;

    if (!this._aabbCollides(aabb)) return;

    // 发生碰撞: 回退到方块边界
    if (delta > 0) {
      // 向 + 移动, max 撞到 block.min (整数边界)
      const blockBoundary = Math.floor(aabb.max[axis]);
      aabb.max[axis] = blockBoundary;
      aabb.min[axis] = aabb.max[axis] - this._aabbSize(player, axis);
    } else {
      // 向 - 移动, min 撞到 block.max
      const blockBoundary = Math.floor(aabb.min[axis]) + 1;
      aabb.min[axis] = blockBoundary;
      aabb.max[axis] = aabb.min[axis] + this._aabbSize(player, axis);
      if (axis === 'y') player.onGround = true;
    }
    player.velocity[axis] = 0;
  }

  /**
   * 获取 AABB 在指定轴上的尺寸
   * @param {import('./Player.js').Player} player
   * @param {'x'|'y'|'z'} axis
   * @returns {number}
   */
  _aabbSize(player, axis) {
    if (axis === 'y') return player.height;
    return player.halfWidth * 2;
  }

  /**
   * 检测 AABB 是否与任何固体方块重叠
   * 遍历 AABB 覆盖的所有方块, 任一为固体即碰撞
   * @param {THREE.Box3} aabb
   * @returns {boolean}
   */
  _aabbCollides(aabb) {
    const minX = Math.floor(aabb.min.x);
    const maxX = Math.floor(aabb.max.x - 1e-6);
    const minY = Math.floor(aabb.min.y);
    const maxY = Math.floor(aabb.max.y - 1e-6);
    const minZ = Math.floor(aabb.min.z);
    const maxZ = Math.floor(aabb.max.z - 1e-6);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const id = this.world.getBlock(x, y, z);
          if (id !== 0 && isSolid(id)) return true;
        }
      }
    }
    return false;
  }

  /**
   * 玩家跳跃 (若在地面)
   * @param {import('./Player.js').Player} player
   */
  jump(player) {
    if (player.gameMode === 'creative') return;
    if (player.onGround) {
      player.velocity.y = JUMP_VELOCITY;
      player.onGround = false;
    }
  }

  /**
   * 引用 GRAVITY (用于外部调试)
   */
  get gravity() { return GRAVITY; }
}
