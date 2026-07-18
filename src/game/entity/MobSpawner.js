/**
 * @file 生物生成器
 * @description 在玩家周围生成/销毁生物:
 *              - 友好生物: 草地上随机生成, 白天为主
 *              - 敌对生物: 夜晚或低光照下生成, 限制数量
 *              - 距离玩家过远的生物自动销毁
 *              - 维持一定生物密度
 */

import * as THREE from 'three';
import { MobType } from './Entity.js';
import { createMobByType } from './Mobs.js';

/** 友好生物类型池 */
const PASSIVE_TYPES = [MobType.COW, MobType.PIG, MobType.SHEEP, MobType.CHICKEN];
/** 敌对生物类型池 */
const HOSTILE_TYPES = [MobType.ZOMBIE, MobType.SPIDER];

export class MobSpawner {
  /**
   * @param {Object} opts
   * @param {import('../world/World.js').World} opts.world 世界引用
   * @param {THREE.Scene} opts.scene 场景 (用于加入生物 group)
   * @param {number} [opts.maxPassive=15] 友好生物上限
   * @param {number} [opts.maxHostile=10] 敌对生物上限
   * @param {number} [opts.spawnRadius=48] 生成半径 (米)
   * @param {number} [opts.despawnRadius=80] 销毁半径 (米)
   */
  constructor({ world, scene, maxPassive = 15, maxHostile = 10, spawnRadius = 48, despawnRadius = 80 }) {
    this.world = world;
    this.scene = scene;
    this.maxPassive = maxPassive;
    this.maxHostile = maxHostile;
    this.spawnRadius = spawnRadius;
    this.despawnRadius = despawnRadius;

    /** 已生成的生物列表 */
    this.mobs = [];

    /** 下次生成检查时间 */
    this.spawnTimer = 0;
    /** 生成间隔 (秒) */
    this.spawnInterval = 2.0;

    /** 下一实体 id */
    this._nextId = 1;
  }

  /**
   * 每帧更新
   * @param {number} dt
   * @param {Object} ctx { player, dayNight, physics, ai, onPlayerDamaged }
   */
  update(dt, ctx) {
    // 定时尝试生成
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval;
      this._trySpawn(ctx);
    }

    // 销毁距离过远或死亡的生物
    const playerPos = ctx.player.position;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      const dist = mob.position.distanceTo(playerPos);
      if (dist > this.despawnRadius || mob.dead) {
        // 生物死亡: 生成灰色烟雾粒子 (玩家死亡也是, 但在 main.js 处理)
        if (mob.dead && ctx.particles) {
          const center = new THREE.Vector3(
            mob.position.x,
            mob.position.y + mob.height / 2,
            mob.position.z
          );
          ctx.particles.spawnDeathSmoke(center, 24, 0x888888);
        }
        mob.dispose(this.scene);
        this.mobs.splice(i, 1);
        continue;
      }
      // 更新 AI
      ctx.ai.update(mob, dt, ctx);
    }
  }

  /**
   * 尝试在玩家周围生成生物
   * @param {Object} ctx
   */
  _trySpawn(ctx) {
    const player = ctx.player;
    const isNight = ctx.dayNight ? ctx.dayNight.isNight() : false;

    // 统计现有数量
    let passiveCount = 0;
    let hostileCount = 0;
    for (const mob of this.mobs) {
      if (mob.category === 'passive') passiveCount++;
      else hostileCount++;
    }

    // 友好生物 (白天/草地)
    if (passiveCount < this.maxPassive) {
      const type = PASSIVE_TYPES[Math.floor(Math.random() * PASSIVE_TYPES.length)];
      const pos = this._findSpawnPosition(player.position, true);
      if (pos) {
        const mob = createMobByType(type, this._nextId++, pos.x, pos.y, pos.z);
        if (mob) {
          this.scene.add(mob.group);
          this.mobs.push(mob);
        }
      }
    }

    // 敌对生物 (夜晚)
    if (isNight && hostileCount < this.maxHostile) {
      const type = HOSTILE_TYPES[Math.floor(Math.random() * HOSTILE_TYPES.length)];
      const pos = this._findSpawnPosition(player.position, false);
      if (pos) {
        const mob = createMobByType(type, this._nextId++, pos.x, pos.y, pos.z);
        if (mob) {
          this.scene.add(mob.group);
          this.mobs.push(mob);
        }
      }
    }
  }

  /**
   * 在玩家周围寻找合适的生成位置
   * @param {THREE.Vector3} playerPos 玩家位置
   * @param {boolean} needsGrass 友好生物需要草地
   * @returns {{x:number,y:number,z:number}|null}
   */
  _findSpawnPosition(playerPos, needsGrass) {
    // 随机角度和距离
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 16 + Math.random() * (this.spawnRadius - 16);
      const x = Math.floor(playerPos.x + Math.cos(angle) * dist) + 0.5;
      const z = Math.floor(playerPos.z + Math.sin(angle) * dist) + 0.5;
      const y = this.world.getHighestY(Math.floor(x), Math.floor(z)) + 1;
      if (y <= 0) continue;
      // 检查脚下方块 (友好需要草地, 敌对任意固体)
      const belowId = this.world.getBlock(Math.floor(x), y - 1, Math.floor(z));
      if (belowId === 0) continue;
      if (needsGrass && belowId !== 1 /* GRASS */) continue; // 1 = BlockId.GRASS
      // 检查上方两格是否为空气 (避免卡在方块里)
      if (this.world.getBlock(Math.floor(x), y, Math.floor(z)) !== 0) continue;
      if (this.world.getBlock(Math.floor(x), y + 1, Math.floor(z)) !== 0) continue;
      return { x, y, z };
    }
    return null;
  }

  /**
   * 获取指定位置附近的生物 (用于攻击判定)
   * @param {THREE.Vector3} pos
   * @param {number} radius
   * @returns {Entity[]}
   */
  getMobsNear(pos, radius) {
    const r2 = radius * radius;
    return this.mobs.filter((m) => !m.dead && m.position.distanceToSquared(pos) <= r2);
  }

  /**
   * 销毁所有生物 (退出世界时调用)
   */
  dispose() {
    for (const mob of this.mobs) {
      mob.dispose(this.scene);
    }
    this.mobs = [];
  }
}
