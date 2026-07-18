/**
 * @file 物品堆叠
 * @description 单个物品槽位的抽象: 物品 id + 数量; 支持合并、拆分、消耗
 */

import { BlockId, getBlock } from '../world/BlockType.js';

/** 物品最大堆叠数 (原版大多数方块 64, 工具 1) */
export const MAX_STACK = 64;

/**
 * 判断物品 id 是否为工具 (不可堆叠)
 * @param {number} id 物品 id
 * @returns {boolean}
 */
export function isTool(id) {
  return id === BlockId.WOOD_PICKAXE
    || id === BlockId.WOOD_AXE
    || id === BlockId.WOOD_SWORD
    || id === BlockId.WOOD_SHOVEL;
}

/**
 * 获取物品的最大堆叠数
 * @param {number} id 物品 id
 * @returns {number}
 */
export function getMaxStack(id) {
  if (isTool(id)) return 1;
  return MAX_STACK;
}

/**
 * 判断物品 id 是否为可放置的方块 (相对于纯物品如木棍/工具)
 * @param {number} id 物品 id
 * @returns {boolean}
 */
export function isPlaceable(id) {
  const def = getBlock(id);
  // 物品类型占位 (硬度=0 且非固体) 不可放置
  return def.solid;
}

export class ItemStack {
  /**
   * @param {number} id 物品 id (与 BlockId 共用空间)
   * @param {number} [count=1] 数量
   */
  constructor(id, count = 1) {
    this.id = id;
    this.count = count;
  }

  /**
   * 是否为空物品
   * @returns {boolean}
   */
  isEmpty() {
    return this.id === BlockId.AIR || this.count <= 0;
  }

  /**
   * 获取最大堆叠数
   * @returns {number}
   */
  maxStack() {
    return getMaxStack(this.id);
  }

  /**
   * 是否可继续堆叠
   * @returns {boolean}
   */
  canStack() {
    return !isTool(this.id) && this.count < MAX_STACK;
  }

  /**
   * 判断两个 ItemStack 是否可堆叠 (同 id 且非工具)
   * @param {ItemStack} other
   * @returns {boolean}
   */
  canStackWith(other) {
    if (!other || other.isEmpty()) return false;
    if (this.isEmpty()) return true;
    if (isTool(this.id) || isTool(other.id)) return false;
    return this.id === other.id;
  }

  /**
   * 从其他堆叠吸收物品, 返回吸收后的剩余 (other 的剩余)
   * @param {ItemStack} other
   * @returns {ItemStack} other 的剩余 (可能为空)
   */
  absorb(other) {
    if (!other || other.isEmpty()) return other;
    if (this.isEmpty()) {
      this.id = other.id;
      this.count = 0;
    }
    if (this.id !== other.id) return other;
    const max = getMaxStack(this.id);
    const can = Math.min(max - this.count, other.count);
    this.count += can;
    other.count -= can;
    if (other.count <= 0) other.id = BlockId.AIR;
    return other;
  }

  /**
   * 拆分出 n 个为新 ItemStack
   * @param {number} n 数量
   * @returns {ItemStack} 新堆叠
   */
  split(n) {
    const take = Math.min(n, this.count);
    const out = new ItemStack(this.id, take);
    this.count -= take;
    if (this.count <= 0) this.id = BlockId.AIR;
    return out;
  }

  /**
   * 消耗 n 个物品
   * @param {number} n
   */
  consume(n = 1) {
    this.count -= n;
    if (this.count <= 0) {
      this.count = 0;
      this.id = BlockId.AIR;
    }
  }

  /**
   * 克隆
   * @returns {ItemStack}
   */
  clone() {
    return new ItemStack(this.id, this.count);
  }

  /**
   * 序列化为存档
   * @returns {[number, number]|null}
   */
  serialize() {
    if (this.isEmpty()) return null;
    return [this.id, this.count];
  }

  /**
   * 从存档恢复
   * @param {[number, number]|null} data
   * @returns {ItemStack}
   */
  static deserialize(data) {
    if (!data) return new ItemStack(BlockId.AIR, 0);
    return new ItemStack(data[0], data[1]);
  }
}
