/**
 * @file 生物基类
 * @description 所有可活动实体 (动物/怪物) 的基类:
 *              - 持有 position/velocity/yaw 等 3D 状态
 *              - 持有 Three.js Group 作为可视模型
 *              - 提供 AABB (供物理碰撞)
 *              - 提供 update(dt, ctx) 钩子由子类实现 AI
 *
 *  注意: 实体不使用相机, 也不参与指针锁; 由 MobAI 驱动
 */

import * as THREE from 'three';

/** 生物类型枚举 */
export const MobType = Object.freeze({
  COW: 'cow',
  PIG: 'pig',
  SHEEP: 'sheep',
  CHICKEN: 'chicken',
  ZOMBIE: 'zombie',
  SPIDER: 'spider',
});

/** 生物行为类别 */
export const MobCategory = Object.freeze({
  PASSIVE: 'passive',     // 友好 (牛猪羊鸡)
  HOSTILE: 'hostile',     // 敌对 (僵尸蜘蛛)
});

export class Entity {
  /**
   * @param {Object} opts
   * @param {number} opts.id 实体唯一 id
   * @param {MobType} opts.type 类型
   * @param {MobCategory} opts.category 行为类别
   * @param {number} opts.x 初始世界 X
   * @param {number} opts.y 初始世界 Y
   * @param {number} opts.z 初始世界 Z
   * @param {number} [opts.width=0.6] AABB 宽 (X/Z)
   * @param {number} [opts.height=1.8] AABB 高 (Y)
   * @param {number} [opts.health=10] 生命值
   * @param {number} [opts.maxHealth=10] 最大生命值
   */
  constructor({ id, type, category, x, y, z, width = 0.6, height = 1.8, health = 10, maxHealth = 10 }) {
    this.id = id;
    this.type = type;
    this.category = category;

    this.position = new THREE.Vector3(x, y, z);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = 0; // 朝向 (绕 Y)
    this.onGround = false;

    this.width = width;
    this.height = height;
    this.halfWidth = width / 2;

    this.health = health;
    this.maxHealth = maxHealth;

    /** Three.js Group (模型根, 由子类构建) */
    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    /** AABB (每帧由 Physics 更新) */
    this.aabb = new THREE.Box3();
    this._updateAABB();

    /** AI 状态计时器 (秒) */
    this.aiTimer = 0;
    /** 当前 AI 状态 */
    this.aiState = 'idle';
    /** 目标朝向 (AI 旋转插值用) */
    this.targetYaw = 0;

    /** 是否已死亡 */
    this.dead = false;

    /** 受击无敌时间 (防止单次攻击多次触发) */
    this.invulnTime = 0;
    /** 受击闪烁剩余时间 (秒, 期间模型变红) */
    this.hurtFlash = 0;
    /** 受击后逃跑剩余时间 (秒, 友好生物被玩家攻击后逃跑一段时间; 0=不逃跑) */
    this.fleeTimer = 0;
  }

  /**
   * 更新 AABB (基于 position)
   */
  _updateAABB() {
    this.aabb.min.set(
      this.position.x - this.halfWidth,
      this.position.y,
      this.position.z - this.halfWidth
    );
    this.aabb.max.set(
      this.position.x + this.halfWidth,
      this.position.y + this.height,
      this.position.z + this.halfWidth
    );
  }

  /**
   * 同步 group 位置/朝向到 position/yaw (物理更新后调用)
   */
  syncTransform() {
    this._updateAABB();
    this.group.position.copy(this.position);
    // 平滑朝向插值 (避免突变)
    let diff = this.targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * 0.15;
    this.group.rotation.y = this.yaw;
  }

  /**
   * 实体受伤
   * @param {number} amount 伤害值
   * @returns {boolean} 是否受伤成功 (无敌时间内返回 false)
   */
  damage(amount) {
    if (this.dead) return false;
    if (this.invulnTime > 0) return false;
    this.health -= amount;
    this.invulnTime = 0.5;
    // 受击后逃跑计时 (友好生物被玩家打后逃跑 6 秒)
    this.fleeTimer = 6.0;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
    return true;
  }

  /**
   * 每帧更新 (子类重写以实现 AI)
   * @param {number} dt 帧间隔 (秒)
   * @param {Object} ctx 上下文 (world/player/...)
   */
  update(dt, ctx) {
    if (this.invulnTime > 0) this.invulnTime -= dt;
    // 受击闪烁倒计时
    if (this.hurtFlash > 0) {
      this.hurtFlash -= dt;
      if (this.hurtFlash < 0) this.hurtFlash = 0;
    }
    // 受击逃跑倒计时
    if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      if (this.fleeTimer < 0) this.fleeTimer = 0;
    }
    this._updateHurtFlash();
    if (this.dead) return;
    // 默认行为: 无 AI (子类实现)
    this.syncTransform();
  }

  /**
   * 更新受击闪烁效果 (模型材质 emissive 变红)
   */
  _updateHurtFlash() {
    const flashing = this.hurtFlash > 0;
    this.group.traverse((obj) => {
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.emissive) {
            if (flashing) {
              m.emissive.setRGB(0.8, 0.1, 0.1);
              m.emissiveIntensity = 1;
            } else {
              m.emissive.setRGB(0, 0, 0);
              m.emissiveIntensity = 0;
            }
          }
        }
      }
    });
  }

  /**
   * 销毁: 释放 group 资源
   * @param {THREE.Scene} scene
   */
  dispose(scene) {
    if (scene && this.group.parent === scene) scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
