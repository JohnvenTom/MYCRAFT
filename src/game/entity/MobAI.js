/**
 * @file 实体物理与 AI 系统
 * @description 实体与方块的碰撞解算 (复用 Player 物理的思路) + AI 行为驱动
 *              - 重力 + 分轴 AABB 碰撞
 *              - AI 状态机: idle / wander / flee / chase / attack
 *              - 动物: 游荡 + 玩家靠近时逃跑
 *              - 怪物: 游荡 + 玩家靠近时追击 + 攻击
 */

import * as THREE from 'three';
import { GRAVITY } from '../../config/constants.js';
import { isSolid, BlockId } from '../world/BlockType.js';

/** 水中浮力加速度 (m/s², 略大于重力让生物缓慢上浮) */
const MOB_BUOYANCY = 36;
/** 水中水平阻尼 (每秒衰减到这个比例, 0.8=每秒衰减到 80%) */
const WATER_DAMP = 0.8;

/** AI 状态枚举 */
export const AIState = Object.freeze({
  IDLE: 'idle',
  WANDER: 'wander',
  FLEE: 'flee',
  CHASE: 'chase',
  ATTACK: 'attack',
});

export class MobPhysics {
  /**
   * @param {import('../world/World.js').World} world
   */
  constructor(world) {
    this.world = world;
    this.terminalVelocity = -50;
  }

  /**
   * 物理步进 (固定步长)
   * 修复: _moveAxis 只改 AABB, 必须从 AABB 反推 entity.position, 否则 syncTransform()
   * 调用 _updateAABB() 会用旧 position 重置 AABB, 实体永远无法移动 (与 Player 物理同根因)
   * 修复: 添加水中浮力 (生物脚或身体在水方块中时上浮), 避免生物沉水底
   * @param {import('./Entity.js').Entity} entity
   * @param {number} dt
   */
  step(entity, dt) {
    // 检测是否在水中 (脚位或身体中段在水方块)
    const inWater = this._isInWater(entity);

    if (inWater) {
      // 水中: 浮力抵消大部分重力, 缓慢上浮
      entity.velocity.y -= (GRAVITY - MOB_BUOYANCY) * dt;
      // 限制下沉速度, 让生物主要漂浮
      if (entity.velocity.y < -2) entity.velocity.y = -2;
      // 水平阻尼 (水中阻力)
      entity.velocity.x *= WATER_DAMP;
      entity.velocity.z *= WATER_DAMP;
    } else {
      // 空气中: 正常重力
      entity.velocity.y -= GRAVITY * dt;
      if (entity.velocity.y < this.terminalVelocity) entity.velocity.y = this.terminalVelocity;
    }

    // 分轴碰撞 (只修改 AABB)
    entity.onGround = false;
    this._moveAxis(entity, 'x', entity.velocity.x * dt);
    this._moveAxis(entity, 'z', entity.velocity.z * dt);
    this._moveAxis(entity, 'y', entity.velocity.y * dt);

    // 关键: 从 AABB 反推 entity.position (中心 X/Z, 脚底 Y)
    entity.position.x = (entity.aabb.min.x + entity.aabb.max.x) / 2;
    entity.position.y = entity.aabb.min.y;
    entity.position.z = (entity.aabb.min.z + entity.aabb.max.z) / 2;

    entity.syncTransform();
  }

  /**
   * 检测实体是否在水中 (脚位或身体中段在水方块中)
   * @param {import('./Entity.js').Entity} entity
   * @returns {boolean}
   */
  _isInWater(entity) {
    // 检查实体 AABB 覆盖的所有方块是否有水
    const minX = Math.floor(entity.aabb.min.x);
    const maxX = Math.floor(entity.aabb.max.x - 1e-6);
    const minY = Math.floor(entity.aabb.min.y);
    const maxY = Math.floor(entity.aabb.max.y - 1e-6);
    const minZ = Math.floor(entity.aabb.min.z);
    const maxZ = Math.floor(entity.aabb.max.z - 1e-6);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.getBlock(x, y, z) === BlockId.WATER) return true;
        }
      }
    }
    return false;
  }

  /**
   * 沿单轴移动并解算碰撞 (与 Physics.js 类似)
   * @param {import('./Entity.js').Entity} entity
   * @param {'x'|'y'|'z'} axis
   * @param {number} delta
   */
  _moveAxis(entity, axis, delta) {
    if (delta === 0) return;
    const aabb = entity.aabb;
    aabb.min[axis] += delta;
    aabb.max[axis] += delta;
    if (!this._aabbCollides(aabb)) return;

    if (delta > 0) {
      const blockBoundary = Math.floor(aabb.max[axis]);
      aabb.max[axis] = blockBoundary;
      aabb.min[axis] = aabb.max[axis] - this._aabbSize(entity, axis);
    } else {
      const blockBoundary = Math.floor(aabb.min[axis]) + 1;
      aabb.min[axis] = blockBoundary;
      aabb.max[axis] = aabb.min[axis] + this._aabbSize(entity, axis);
      if (axis === 'y') entity.onGround = true;
    }
    entity.velocity[axis] = 0;
    // position 由 step() 末尾统一从 AABB 反推, 此处不再同步
  }

  /**
   * AABB 在指定轴上的尺寸
   * @param {import('./Entity.js').Entity} entity
   * @param {'x'|'y'|'z'} axis
   * @returns {number}
   */
  _aabbSize(entity, axis) {
    if (axis === 'y') return entity.height;
    return entity.width;
  }

  /**
   * 检测 AABB 是否与固体方块重叠
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
   * 让实体朝目标点转向 (水平)
   * @param {import('./Entity.js').Entity} entity
   * @param {THREE.Vector3} target
   */
  faceTo(entity, target) {
    const dx = target.x - entity.position.x;
    const dz = target.z - entity.position.z;
    if (dx === 0 && dz === 0) return;
    entity.targetYaw = Math.atan2(dx, dz);
  }

  /**
   * 让实体朝当前 yaw 方向移动
   * 同时检测前方1格高障碍自动起跳 (跳上一格台阶/方块)
   * @param {import('./Entity.js').Entity} entity
   * @param {number} speed 速度 (m/s)
   */
  moveForward(entity, speed) {
    const sin = Math.sin(entity.yaw);
    const cos = Math.cos(entity.yaw);
    entity.velocity.x = sin * speed;
    entity.velocity.z = cos * speed;
    // 检测前方1格高障碍自动跳 (仅在地面时)
    if (entity.onGround) {
      this._tryJumpObstacle(entity, speed);
    }
  }

  /**
   * 检测实体前方是否有1格高障碍, 若有则起跳越过
   * 障碍定义: 脚位+1 高的方块为固体, 且脚位+2 高的方块为空 (可跳上)
   * @param {import('./Entity.js').Entity} entity
   * @param {number} speed 当前水平速度 (用于判断是否在移动)
   */
  _tryJumpObstacle(entity, speed) {
    if (speed <= 0.1) return;
    // 前方探测点 (实体前方 0.5m, 略大于 halfWidth 避免卡墙内)
    const fx = entity.position.x + Math.sin(entity.yaw) * 0.55;
    const fz = entity.position.z + Math.cos(entity.yaw) * 0.55;
    const footY = Math.floor(entity.position.y);
    // 脚位+1 高 (即前方挡路方块)
    const blockAtFeet = this.world.getBlock(Math.floor(fx), footY, Math.floor(fz));
    // 脚位+2 高 (跳起后头部位置, 需为空才能跳上)
    const blockAtHead = this.world.getBlock(Math.floor(fx), footY + 1, Math.floor(fz));
    // 前方脚下1格是固体 (台阶/方块) 且 上方是空 → 跳
    if (blockAtFeet !== BlockId.AIR && isSolid(blockAtFeet)
        && (blockAtHead === BlockId.AIR || !isSolid(blockAtHead))) {
      // 跳跃初速度 9.0: 上升高度 = 9²/(2*32) ≈ 1.27m > 1m, 足够跳上 1 格方块
      entity.velocity.y = 9.0;
    }
  }
}

/**
 * AI 控制器 (驱动单个实体)
 */
export class MobAI {
  constructor() {
    /** 全局实体计数器 (用于生成 id) */
    this._nextId = 1;
  }

  /**
   * 生成新 id
   * @returns {number}
   */
  nextId() {
    return this._nextId++;
  }

  /**
   * 更新单个实体 AI
   * @param {import('./Entity.js').Entity} entity
   * @param {number} dt
   * @param {Object} ctx { world, player, physics }
   */
  update(entity, dt, ctx) {
    if (entity.dead) return;
    // 先调用 Entity.update 处理 invulnTime/hurtFlash 倒计时 + 受击闪烁渲染
    entity.update(dt, ctx);
    entity.aiTimer -= dt;

    const player = ctx.player;
    const distToPlayer = entity.position.distanceTo(player.position);

    // 通用 AI 决策
    if (entity.category === 'passive') {
      this._updatePassive(entity, dt, ctx, distToPlayer);
    } else if (entity.category === 'hostile') {
      this._updateHostile(entity, dt, ctx, distToPlayer);
    }

    // 通用: 应用物理 (实体 always 受重力)
    ctx.physics.step(entity, dt);
  }

  /**
   * 友好生物 AI
   * 修复: 原版玩家靠近 8m 就逃跑 → 改为只在被玩家攻击后逃跑 (fleeTimer > 0)
   * @param {import('./Entity.js').Entity} entity
   * @param {number} dt
   * @param {Object} ctx
   * @param {number} distToPlayer
   */
  _updatePassive(entity, dt, ctx, distToPlayer) {
    // 仅在被攻击后 (fleeTimer > 0) 才逃跑
    if (entity.fleeTimer > 0) {
      if (entity.aiState !== 'flee') {
        entity.aiState = 'flee';
      }
      // 朝远离玩家方向
      const dx = entity.position.x - ctx.player.position.x;
      const dz = entity.position.z - ctx.player.position.z;
      entity.targetYaw = Math.atan2(dx, dz);
      ctx.physics.moveForward(entity, 4.5);
      // 跳跃 (若被卡住)
      if (entity.onGround && Math.random() < 0.1) entity.velocity.y = 9;
    } else {
      // 不在逃跑状态 → 切回游荡
      if (entity.aiState === 'flee') {
        entity.aiState = 'idle';
        entity.aiTimer = 0;
      }
      // 游荡
      if (entity.aiTimer <= 0) {
        const r = Math.random();
        if (r < 0.4) {
          entity.aiState = 'wander';
          entity.targetYaw = Math.random() * Math.PI * 2;
          entity.aiTimer = 2 + Math.random() * 3;
        } else {
          entity.aiState = 'idle';
          entity.velocity.x = 0;
          entity.velocity.z = 0;
          entity.aiTimer = 1 + Math.random() * 2;
        }
      }
      if (entity.aiState === 'wander') {
        ctx.physics.moveForward(entity, 1.5);
        // 偶尔跳跃
        if (entity.onGround && Math.random() < 0.02) entity.velocity.y = 9;
      }
    }
  }

  /**
   * 敌对生物 AI
   * @param {import('./Entity.js').Entity} entity
   * @param {number} dt
   * @param {Object} ctx
   * @param {number} distToPlayer
   */
  _updateHostile(entity, dt, ctx, distToPlayer) {
    const attackRange = 1.8;
    const detectRange = 16;

    if (distToPlayer < attackRange) {
      // 攻击
      entity.aiState = 'attack';
      entity.velocity.x = 0;
      entity.velocity.z = 0;
      ctx.physics.faceTo(entity, ctx.player.position);
      // 攻击玩家 (每秒 1 次)
      if (entity.aiTimer <= 0) {
        entity.aiTimer = 1.0;
        if (ctx.player.gameMode !== 'creative') {
          // 传攻击者位置, 供 main.js 计算击退方向
          if (ctx.onPlayerDamaged) ctx.onPlayerDamaged(2, entity.position);
        }
      }
    } else if (distToPlayer < detectRange) {
      // 追击
      entity.aiState = 'chase';
      ctx.physics.faceTo(entity, ctx.player.position);
      ctx.physics.moveForward(entity, 3.5);
      // 跳跃 (若被卡住)
      if (entity.onGround && Math.random() < 0.05) entity.velocity.y = 9;
    } else {
      // 游荡
      if (entity.aiTimer <= 0) {
        const r = Math.random();
        if (r < 0.5) {
          entity.aiState = 'wander';
          entity.targetYaw = Math.random() * Math.PI * 2;
          entity.aiTimer = 2 + Math.random() * 3;
        } else {
          entity.aiState = 'idle';
          entity.velocity.x = 0;
          entity.velocity.z = 0;
          entity.aiTimer = 1 + Math.random() * 2;
        }
      }
      if (entity.aiState === 'wander') {
        ctx.physics.moveForward(entity, 1.0);
      }
    }
  }
}
