/**
 * @file 热键栏
 * @description 9 个方块槽位 + 数字键/滚轮切换 + DOM 渲染图标
 *              与 Inventory 联动: 数据从 inventory.slots[0..8] 读取,
 *              选中状态同步到 inventory.selected
 */

import { HOTBAR_SIZE } from '../config/constants.js';
import { BlockId, getBlock } from '../game/world/BlockType.js';
import { ItemStack } from '../game/items/ItemStack.js';

export class Hotbar {
  /**
   * @param {import('../utils/TextureAtlas.js').TextureAtlas} atlas 纹理图集 (用于生成图标)
   * @param {import('../core/Input.js').Input} input
   * @param {HTMLElement} rootEl 热键栏 DOM 容器
   * @param {HTMLElement} nameEl 当前方块名 DOM
   * @param {import('../game/items/Inventory.js').Inventory} [inventory] 可选物品栏 (生存模式)
   */
  constructor(atlas, input, rootEl, nameEl, inventory = null) {
    this.atlas = atlas;
    this.input = input;
    this.rootEl = rootEl;
    this.nameEl = nameEl;
    this.inventory = inventory;

    /** 创造模式默认布局 (无 inventory 时使用)
     *  修复: 用 CRAFTING_TABLE + FURNACE 替换 SAND + BRICK, 建造场景下工作台/熔炉更常用 */
    this.creativeSlots = [
      BlockId.GRASS,
      BlockId.DIRT,
      BlockId.STONE,
      BlockId.COBBLESTONE,
      BlockId.LOG,
      BlockId.PLANKS,
      BlockId.CRAFTING_TABLE,
      BlockId.FURNACE,
      BlockId.GLASS,
    ];
    this.selectedIndex = 0;
    /** 名称提示自动消失计时 */
    this.nameTimer = 0;
    /** 是否需要重新渲染 (脏标记) */
    this._dirty = true;

    this._buildDom();
    this._render();
  }

  /**
   * 构建 9 个槽位 DOM
   */
  _buildDom() {
    this.rootEl.innerHTML = '';
    this.slotEls = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const el = document.createElement('div');
      el.className = 'hotbar-slot';
      el.dataset.index = i;
      const num = document.createElement('span');
      num.className = 'slot-num';
      num.textContent = i + 1;
      el.appendChild(num);
      this.rootEl.appendChild(el);
      this.slotEls.push(el);
    }
  }

  /**
   * 每帧更新: 处理数字键 / 滚轮 / 名称淡出
   * @param {number} dt
   */
  update(dt) {
    // 数字键 1-9
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const code = `Digit${i + 1}`;
      if (this.input.isPressed(code)) {
        this.setSelected(i);
      }
    }
    // 滚轮
    if (this.input.wheelDelta !== 0) {
      const dir = this.input.wheelDelta > 0 ? 1 : -1;
      let idx = (this.selectedIndex + dir) % HOTBAR_SIZE;
      if (idx < 0) idx += HOTBAR_SIZE;
      this.setSelected(idx);
    }
    // 名称淡出
    if (this.nameTimer > 0) {
      this.nameTimer -= dt;
      if (this.nameTimer <= 0) {
        this.nameEl.style.opacity = '0';
      }
    }
    // 检测物品栏变化, 重新渲染
    if (this.inventory && this._dirty) {
      this._render();
      this._dirty = false;
    }
  }

  /**
   * 标记需要重新渲染
   */
  markDirty() {
    this._dirty = true;
  }

  /**
   * 设置当前选中槽位
   * @param {number} index
   */
  setSelected(index) {
    if (index < 0 || index >= HOTBAR_SIZE) return;
    if (index === this.selectedIndex) return;
    this.selectedIndex = index;
    if (this.inventory) this.inventory.selected = index;
    this._render();
    this._showName();
  }

  /**
   * 获取当前选中方块 id (创造模式直接返回, 生存模式从 inventory 读取)
   * @returns {number}
   */
  getSelectedBlock() {
    if (this.inventory) {
      const stack = this.inventory.getSlot(this.selectedIndex);
      return stack.isEmpty() ? BlockId.AIR : stack.id;
    }
    return this.creativeSlots[this.selectedIndex];
  }

  /**
   * 渲染图标与高亮
   */
  _render() {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const el = this.slotEls[i];
      // 清空除 slot-num 外的子元素
      const num = el.querySelector('.slot-num');
      el.innerHTML = '';
      el.appendChild(num);
      // 获取物品 id 和数量
      let id;
      let count = 0;
      if (this.inventory) {
        const stack = this.inventory.getSlot(i);
        id = stack.isEmpty() ? BlockId.AIR : stack.id;
        count = stack.count;
      } else {
        id = this.creativeSlots[i];
      }
      if (id !== BlockId.AIR) {
        const def = getBlock(id);
        const tileIndex = def.tiles.side;
        const iconCanvas = this.atlas.getIcon(tileIndex, 40);
        iconCanvas.className = 'slot-icon';
        el.appendChild(iconCanvas);
        // 生存模式显示数量
        if (this.inventory && count > 1) {
          const cnt = document.createElement('span');
          cnt.className = 'slot-count';
          cnt.textContent = count;
          el.appendChild(cnt);
        }
      }
      if (i === this.selectedIndex) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    }
    this._showName();
  }

  /**
   * 显示当前方块名称 (短暂)
   */
  _showName() {
    const id = this.getSelectedBlock();
    if (id === BlockId.AIR) {
      this.nameEl.textContent = '空手';
    } else {
      const def = getBlock(id);
      this.nameEl.textContent = def.name;
    }
    this.nameEl.style.opacity = '1';
    this.nameTimer = 1.5;
  }
}
