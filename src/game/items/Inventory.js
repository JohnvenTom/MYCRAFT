/**
 * @file 玩家物品栏
 * @description 36 槽位物品栏: 9 格热键栏 + 27 格背包; 支持增删查与序列化
 *              槽位编号: 0-8 热键栏 (与 Hotbar.selectedIndex 联动), 9-35 背包
 */

import { BlockId } from '../world/BlockType.js';
import { ItemStack } from './ItemStack.js';

export class Inventory {
  constructor() {
    /** 36 个槽位, 初始化为空 ItemStack */
    this.slots = Array.from({ length: 36 }, () => new ItemStack(BlockId.AIR, 0));
    /** 当前选中的热键栏槽位 (0-8) */
    this.selected = 0;
  }

  /**
   * 获取当前选中的热键栏物品
   * @returns {ItemStack}
   */
  getSelected() {
    return this.slots[this.selected];
  }

  /**
   * 添加物品到物品栏, 优先堆叠到已有槽位, 否则放入第一个空槽
   * @param {ItemStack} stack 待添加堆叠 (会被消耗)
   * @returns {ItemStack} 剩余未放入的物品 (可能为空)
   */
  add(stack) {
    if (!stack || stack.isEmpty()) return stack;
    // 1. 优先堆叠到已有同类
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot.isEmpty() && slot.canStackWith(stack)) {
        slot.absorb(stack);
        if (stack.isEmpty()) return stack;
      }
    }
    // 2. 放入第一个空槽
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.isEmpty()) {
        slot.absorb(stack);
        if (stack.isEmpty()) return stack;
      }
    }
    return stack;
  }

  /**
   * 消耗当前选中槽位的 1 个物品 (用于放置方块)
   * @returns {number} 被消耗的物品 id (若空槽返回 AIR)
   */
  consumeSelected() {
    const slot = this.getSelected();
    if (slot.isEmpty()) return BlockId.AIR;
    const id = slot.id;
    slot.consume(1);
    return id;
  }

  /**
   * 设置指定槽位的物品 (替换)
   * @param {number} index 槽位 0-35
   * @param {ItemStack} stack
   */
  setSlot(index, stack) {
    if (index < 0 || index >= this.slots.length) return;
    this.slots[index] = stack;
  }

  /**
   * 获取指定槽位
   * @param {number} index
   * @returns {ItemStack}
   */
  getSlot(index) {
    return this.slots[index];
  }

  /**
   * 交换两个槽位内容
   * @param {number} a
   * @param {number} b
   */
  swap(a, b) {
    if (a < 0 || a >= this.slots.length) return;
    if (b < 0 || b >= this.slots.length) return;
    const tmp = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = tmp;
  }

  /**
   * 查找第一个包含指定物品的槽位 (热键栏优先)
   * @param {number} id 物品 id
   * @returns {number} 槽位 index, -1 表示未找到
   */
  findFirst(id) {
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i].id === id && !this.slots[i].isEmpty()) return i;
    }
    return -1;
  }

  /**
   * 序列化为存档 (跳过空槽)
   * @returns {Array<[number, [number, number]]>}
   */
  serialize() {
    const out = [];
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i].serialize();
      if (s) out.push([i, s]);
    }
    return out;
  }

  /**
   * 从存档恢复
   * @param {Array<[number, [number, number]]>} data
   */
  deserialize(data) {
    if (!data) return;
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i] = new ItemStack(BlockId.AIR, 0);
    }
    for (const [idx, itemData] of data) {
      if (idx < 0 || idx >= this.slots.length) continue;
      this.slots[idx] = ItemStack.deserialize(itemData);
    }
  }
}
