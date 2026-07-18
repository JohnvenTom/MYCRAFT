/**
 * @file 方块交互
 * @description 射线瞄准 + 破坏进度 + 放置方块; 通过回调把变化推给 World
 *              破坏: 左键按住累积进度, 完成后置空气; 创造模式瞬破坏
 *              放置: 右键单击, 在命中面法线方向相邻格放置当前热键栏方块
 *              物品栏集成: 生存模式破坏方块时掉落物入物品栏; 放置时消耗物品栏物品
 */

import * as THREE from 'three';
import { REACH_DISTANCE, BREAK_TIME_PER_HARDNESS, PLAYER_WIDTH, PLAYER_HEIGHT } from '../../config/constants.js';
import { raycastVoxel } from '../../utils/Raycast.js';
import { getBlock, isBreakable, isSolid, BlockId } from '../world/BlockType.js';
import { GameMode } from '../player/Player.js';
import { ItemStack, isPlaceable } from '../items/ItemStack.js';

export class BlockInteraction {
  /**
   * @param {Object} opts
   * @param {import('../world/World.js').World} opts.world
   * @param {import('../player/Player.js').Player} opts.player
   * @param {import('../../core/Input.js').Input} opts.input
   * @param {import('./Highlight.js').Highlight} opts.highlight
   * @param {import('./Hotbar.js').Hotbar} opts.hotbar
   * @param {import('../audio/AudioManager.js').AudioManager} [opts.audio]
   * @param {import('../items/Inventory.js').Inventory} [opts.inventory] 物品栏 (生存模式)
   * @param {import('../entity/MobSpawner.js').MobSpawner} [opts.mobSpawner] 生物生成器 (用于攻击生物)
   * @param {import('../net/MultiplayerClient.js').MultiplayerClient} [opts.net] 多人联机客户端
   * @param {() => void} [opts.onUseWorkbench] 右键使用工作台回调 (main.js 注入, 打开 3x3 合成 UI)
   * @param {import('./BreakOverlay.js').BreakOverlay} [opts.breakOverlay] 破坏裂缝覆盖层 (显示挖掘进度)
   * @param {import('../entity/Particle.js').ParticleSystem} [opts.particles] 粒子系统 (方块破坏飞溅粒子)
   * @param {import('../../utils/TextureAtlas.js').TextureAtlas} [opts.atlas] 纹理图集 (用于获取方块代表色)
   */
  constructor({ world, player, input, highlight, hotbar, audio, inventory, mobSpawner, net, onUseWorkbench, breakOverlay, particles, atlas }) {
    this.world = world;
    this.player = player;
    this.input = input;
    this.highlight = highlight;
    this.hotbar = hotbar;
    this.audio = audio;
    this.inventory = inventory;
    this.mobSpawner = mobSpawner;
    this.net = net;
    /** 右键使用工作台回调 (由 main.js 注入 _openInventory(true)) */
    this.onUseWorkbench = onUseWorkbench;
    /** 破坏裂缝覆盖层 (可选, 未注入则不显示裂缝) */
    this.breakOverlay = breakOverlay;
    /** 粒子系统 (可选, 未注入则不产生破坏粒子) */
    this.particles = particles;
    /** 纹理图集 (可选, 用于查询方块代表色) */
    this.atlas = atlas;

    /** 当前瞄准的方块命中结果 */
    this.currentHit = null;
    /** 当前破坏进度 (0..1) */
    this.breakProgress = 0;
    /** 正在破坏的方块坐标 (用于检测目标是否变化) */
    this.breakingX = Infinity;
    this.breakingY = Infinity;
    this.breakingZ = Infinity;

    /** 放置冷却 (防止右键连发) */
    this.placeCooldown = 0;
    /** 攻击冷却 */
    this.attackCooldown = 0;
  }

  /**
   * 每帧更新
   * @param {number} dt 帧间隔 (秒)
   */
  update(dt) {
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    // 攻击生物 (左键单击 + 在攻击冷却内)
    if (this.input.mouseClicked[0] && this.attackCooldown <= 0 && this.mobSpawner) {
      if (this._tryAttackMob()) {
        this.attackCooldown = 0.4;
        return; // 攻击到生物, 不再处理方块破坏
      }
    }

    // 射线检测瞄准方块
    const eye = new THREE.Vector3(
      this.player.position.x,
      this.player.position.y + this.player.eyeHeight,
      this.player.position.z
    );
    const dir = this.player.getLookDir();
    const hit = raycastVoxel(eye, dir, REACH_DISTANCE, (x, y, z) => this._isTargetable(x, y, z));
    this.currentHit = hit;

    if (hit) {
      this.highlight.show(hit.x, hit.y, hit.z);
      this._handleBreak(hit, dt);
      // 修复架构: 工作台交互统一在 BlockInteraction 处理, 不再写在 main.js
      // 若右键使用了可交互方块 (如工作台), 消费右键并跳过放置
      if (this._handleUseBlock(hit)) {
        this.input.mouseClicked[2] = false;
      } else {
        this._handlePlace(hit);
      }
    } else {
      this.highlight.hide();
      this.breakProgress = 0;
      this.breakingX = Infinity;
      // 没瞄准方块: 隐藏破坏裂缝覆盖层
      if (this.breakOverlay) this.breakOverlay.hide();
    }
  }

  /**
   * 处理右键使用方块 (工作台等可交互方块)
   * 架构: 把工作台交互从 main.js 移到这里统一管理, 通过 onUseWorkbench 回调解耦 UI
   *
   * 注意: 不检查 placeCooldown, 因为放置工作台后会设置 0.2s 冷却,
   *       若此处也检查 placeCooldown 会导致玩家放置工作台后 0.2s 内右键工作台无法打开 UI
   *       (玩家瞄准刚放置的工作台期望立即打开 UI, 这是 Minecraft 原版行为)
   *       防重复触发由 _openInventory 内部的 `if (this.inventoryUI.open) return` 保证
   *
   * @param {Object} hit 命中结果
   * @returns {boolean} 是否消费了右键 (true 则不再触发放置)
   */
  _handleUseBlock(hit) {
    if (!this.input.mouseClicked[2]) return false;
    const id = this.world.getBlock(hit.x, hit.y, hit.z);
    if (id === BlockId.CRAFTING_TABLE) {
      if (this.onUseWorkbench) this.onUseWorkbench();
      this.placeCooldown = 0.2; // 200ms 冷却, 防止同一帧重复触发 onUseWorkbench
      return true;
    }
    return false;
  }

  /**
   * 尝试攻击附近的生物 (瞄准方向 + 距离判定)
   * 修复: 原角度阈值 30° 太小, 矮小生物 (鸡 height=0.7) 在玩家平视时夹角约 32° 无法命中
   *       改为 60° (更宽松), 距离 4m (覆盖 REACH_DISTANCE)
   * @returns {boolean} 是否攻击到
   */
  _tryAttackMob() {
    if (!this.mobSpawner) return false;
    const eye = new THREE.Vector3(
      this.player.position.x,
      this.player.position.y + this.player.eyeHeight,
      this.player.position.z
    );
    const dir = this.player.getLookDir();
    // 找出玩家前方 4.5m 内的生物
    const mobs = this.mobSpawner.getMobsNear(this.player.position, 5);
    let bestMob = null;
    let bestDist = Infinity;
    for (const mob of mobs) {
      // 生物中心点
      const mobCenter = new THREE.Vector3(
        mob.position.x,
        mob.position.y + mob.height / 2,
        mob.position.z
      );
      const toMob = mobCenter.clone().sub(eye);
      const dist = toMob.length();
      if (dist > 4.5) continue;
      // 视线与生物夹角 < 60° (宽松判定, 避免矮小生物无法命中)
      const angle = toMob.normalize().angleTo(dir);
      if (angle > Math.PI / 3) continue;
      if (dist < bestDist) {
        bestDist = dist;
        bestMob = mob;
      }
    }
    if (bestMob) {
      // 计算伤害 (木质: 剑=4, 斧=3, 镐=2, 锹=1; 石质: 剑=5, 斧=4, 镐=3, 锹=2)
      const heldId = this.hotbar.getSelectedBlock();
      let damage = 1;
      if (heldId === BlockId.WOOD_SWORD) damage = 4;
      else if (heldId === BlockId.STONE_SWORD) damage = 5;
      else if (heldId === BlockId.WOOD_AXE) damage = 3;
      else if (heldId === BlockId.STONE_AXE) damage = 4;
      else if (heldId === BlockId.WOOD_PICKAXE) damage = 2;
      else if (heldId === BlockId.STONE_PICKAXE) damage = 3;
      else if (heldId === BlockId.WOOD_SHOVEL) damage = 1;
      else if (heldId === BlockId.STONE_SHOVEL) damage = 2;
      // 创造模式一击必杀
      if (this.player.gameMode === GameMode.CREATIVE) damage = 100;
      const damaged = bestMob.damage(damage);
      // 击退 (无论是否受伤都给击退, 提供反馈)
      bestMob.velocity.x += dir.x * 5;
      bestMob.velocity.z += dir.z * 5;
      bestMob.velocity.y += 3;
      // 受击闪烁标记 (Entity.syncTransform 中读取)
      bestMob.hurtFlash = 0.3;
      this.attackCooldown = 0.4;
      if (this.audio) this.audio.play('stone');
      return true;
    }
    return false;
  }

  /**
   * 判断坐标处方块是否可作为瞄准目标 (非空气 + 非液体)
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {boolean}
   */
  _isTargetable(x, y, z) {
    const id = this.world.getBlock(x, y, z);
    if (id === BlockId.AIR) return false;
    const def = getBlock(id);
    if (def.liquid) return false;
    return true;
  }

  /**
   * 处理破坏 (左键)
   * @param {Object} hit 命中结果
   * @param {number} dt
   */
  _handleBreak(hit, dt) {
    // 目标改变 → 重置进度
    if (hit.x !== this.breakingX || hit.y !== this.breakingY || hit.z !== this.breakingZ) {
      this.breakProgress = 0;
      this.breakingX = hit.x;
      this.breakingY = hit.y;
      this.breakingZ = hit.z;
    }

    const id = this.world.getBlock(hit.x, hit.y, hit.z);
    const def = getBlock(id);
    if (!isBreakable(id)) {
      this.breakProgress = 0;
      // 不可破坏 (基岩): 隐藏裂缝
      if (this.breakOverlay) this.breakOverlay.hide();
      return;
    }

    if (!this.input.mouseDown[0]) {
      // 没按住 → 进度清零, 隐藏裂缝
      this.breakProgress = 0;
      if (this.breakOverlay) this.breakOverlay.hide();
      return;
    }

    // 创造模式: 瞬破坏
    if (this.player.gameMode === GameMode.CREATIVE) {
      this._doBreak(hit, id);
      return;
    }

    // 生存: 按硬度累积 (持有工具加速)
    // 工具梯度: 木 2.5x, 石 4.0x (石质工具比木质更快, 符合原版)
    let speed = 1;
    const heldId = this.hotbar.getSelectedBlock();
    // 镐子: 石头/矿石类
    const pickaxeBlocks = [BlockId.STONE, BlockId.COBBLESTONE, BlockId.COAL_ORE, BlockId.IRON_ORE, BlockId.GOLD_ORE, BlockId.DIAMOND_ORE];
    if (heldId === BlockId.WOOD_PICKAXE && pickaxeBlocks.includes(id)) {
      speed = 2.5;
    } else if (heldId === BlockId.STONE_PICKAXE && pickaxeBlocks.includes(id)) {
      speed = 4.0;
    } else if (heldId === BlockId.WOOD_AXE && [BlockId.LOG, BlockId.PLANKS, BlockId.CRAFTING_TABLE].includes(id)) {
      speed = 2.5;
    } else if (heldId === BlockId.STONE_AXE && [BlockId.LOG, BlockId.PLANKS, BlockId.CRAFTING_TABLE].includes(id)) {
      speed = 4.0;
    } else if (heldId === BlockId.WOOD_SHOVEL && [BlockId.DIRT, BlockId.GRASS, BlockId.SAND, BlockId.GRAVEL, BlockId.SNOW].includes(id)) {
      speed = 2.5;
    } else if (heldId === BlockId.STONE_SHOVEL && [BlockId.DIRT, BlockId.GRASS, BlockId.SAND, BlockId.GRAVEL, BlockId.SNOW].includes(id)) {
      speed = 4.0;
    } else if (heldId === BlockId.WOOD_SWORD && [BlockId.LEAVES].includes(id)) {
      speed = 2.5;
    } else if (heldId === BlockId.STONE_SWORD && [BlockId.LEAVES].includes(id)) {
      speed = 4.0;
    }
    const breakTime = (def.hardness * BREAK_TIME_PER_HARDNESS) / speed;
    this.breakProgress += dt / breakTime;

    // 同步破坏裂缝覆盖层 (根据进度显示对应 stage 的裂缝贴图)
    if (this.breakOverlay) {
      this.breakOverlay.show(hit.x, hit.y, hit.z, this.breakProgress);
    }

    if (this.breakProgress >= 1) {
      this._doBreak(hit, id);
    }
  }

  /**
   * 执行破坏: 置空气 + 音效 + 重置进度 + 掉落物入物品栏 + 粒子飞溅
   * @param {Object} hit
   * @param {number} id 原方块 id
   */
  _doBreak(hit, id) {
    this.world.setBlock(hit.x, hit.y, hit.z, BlockId.AIR);
    // 多人联机广播
    if (this.net && this.net.connected) {
      this.net.sendBlockChange(hit.x, hit.y, hit.z, BlockId.AIR);
    }
    const def = getBlock(id);
    if (this.audio && def.breakSound) {
      this.audio.play(def.breakSound);
    }
    // 生存模式: 掉落物入物品栏
    if (this.inventory && this.player.gameMode === GameMode.SURVIVAL) {
      // 简化: 直接掉落原方块 (矿石原版应掉落矿物, 此处简化)
      const dropId = id;
      const stack = new ItemStack(dropId, 1);
      this.inventory.add(stack);
      this.hotbar.markDirty();
    }
    // 生成像素方块破坏粒子 (颜色与方块贴图一致)
    if (this.particles && this.atlas) {
      // 方块中心位置 (世界坐标)
      const center = new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      // 从 atlas 获取方块 side 贴图的代表色
      const color = this.atlas.getTileColor(def.tiles.side);
      this.particles.spawnBlockBreak(center, color, 20);
    }
    // 隐藏破坏裂缝覆盖层
    if (this.breakOverlay) this.breakOverlay.hide();
    this.breakProgress = 0;
    this.breakingX = Infinity;
  }

  /**
   * 处理放置 (右键单击)
   * @param {Object} hit
   */
  _handlePlace(hit) {
    if (this.placeCooldown > 0) return;
    if (!this.input.mouseClicked[2]) return;

    const placeX = hit.x + hit.nx;
    const placeY = hit.y + hit.ny;
    const placeZ = hit.z + hit.nz;

    // 目标格必须为空 (空气或水)
    const targetId = this.world.getBlock(placeX, placeY, placeZ);
    if (targetId !== BlockId.AIR && targetId !== BlockId.WATER) return;

    // 校验: 不能与玩家 AABB 重叠
    if (this._overlapsPlayer(placeX, placeY, placeZ)) return;

    const blockId = this.hotbar.getSelectedBlock();
    if (!blockId || blockId === BlockId.AIR) return;
    if (!isPlaceable(blockId)) return; // 物品 (木棍/工具) 不可放置

    // 生存模式: 消耗物品栏物品
    if (this.inventory && this.player.gameMode === GameMode.SURVIVAL) {
      const selected = this.inventory.getSelected();
      if (selected.isEmpty()) return;
      this.inventory.consumeSelected();
      this.hotbar.markDirty();
    }

    this.world.setBlock(placeX, placeY, placeZ, blockId);
    // 多人联机广播
    if (this.net && this.net.connected) {
      this.net.sendBlockChange(placeX, placeY, placeZ, blockId);
    }
    const def = getBlock(blockId);
    if (this.audio && def.placeSound) {
      this.audio.play(def.placeSound);
    }
    this.placeCooldown = 0.2; // 200ms 冷却
  }

  /**
   * 检测方块 (placeX,placeY,placeZ) 是否与玩家 AABB 重叠
   * @param {number} placeX
   * @param {number} placeY
   * @param {number} placeZ
   * @returns {boolean}
   */
  _overlapsPlayer(placeX, placeY, placeZ) {
    const p = this.player;
    const minX = placeX;
    const maxX = placeX + 1;
    const minY = placeY;
    const maxY = placeY + 1;
    const minZ = placeZ;
    const maxZ = placeZ + 1;
    const pMinX = p.position.x - p.halfWidth;
    const pMaxX = p.position.x + p.halfWidth;
    const pMinY = p.position.y;
    const pMaxY = p.position.y + p.height;
    const pMinZ = p.position.z - p.halfWidth;
    const pMaxZ = p.position.z + p.halfWidth;
    return (
      minX < pMaxX && maxX > pMinX &&
      minY < pMaxY && maxY > pMinY &&
      minZ < pMaxZ && maxZ > pMinZ
    );
  }

  /**
   * 获取当前破坏进度 (0..1) 供 HUD 显示破坏裂纹
   * @returns {number}
   */
  getBreakProgress() {
    return this.breakProgress;
  }
}
