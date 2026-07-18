/**
 * @file 物品栏 UI
 * @description 按 E 打开的物品栏 + 合成 UI
 *              - 2x2 物品栏自带合成区 / 3x3 工作台合成区
 *              - 27 格背包 + 9 格热键栏 (与 Inventory 数据联动)
 *              - 鼠标左键拾取/放下整堆, 右键取一半
 *              - 合成区改动时实时匹配配方, 点击输出槽位取出产物
 */

import { BlockId, getBlock } from '../game/world/BlockType.js';
import { Inventory } from '../game/items/Inventory.js';
import { ItemStack, isTool } from '../game/items/ItemStack.js';
import { matchRecipe } from '../game/items/Recipes.js';

export class InventoryUI {
  /**
   * @param {Object} opts
   * @param {Inventory} opts.inventory 玩家物品栏
   * @param {import('../utils/TextureAtlas.js').TextureAtlas} opts.atlas 纹理图集
   * @param {HTMLElement} opts.root 根容器 (#inventory-screen)
   * @param {HTMLElement} opts.craftingGrid 合成网格容器
   * @param {HTMLElement} opts.craftingOutput 合成产物容器
   * @param {HTMLElement} opts.inventoryGrid 27 格背包容器
   * @param {HTMLElement} opts.inventoryHotbar 物品栏热键栏容器
   */
  constructor({ inventory, atlas, root, craftingGrid, craftingOutput, inventoryGrid, inventoryHotbar }) {
    this.inventory = inventory;
    this.atlas = atlas;
    this.root = root;
    this.craftingGrid = craftingGrid;
    this.craftingOutput = craftingOutput;
    this.inventoryGrid = inventoryGrid;
    this.inventoryHotbar = inventoryHotbar;

    /** 当前是否使用工作台 (3x3) - false 则物品栏自带 2x2 */
    this.usingTable = false;
    /** 是否打开 */
    this.open = false;

    /** 合成区槽位 (长度 4 或 9) */
    this.craftingSlots = [];
    /** 合成产物 (ItemStack 或 null) */
    this.craftingResult = null;

    /** 鼠标手持物品 (拖动中) */
    this.cursorStack = new ItemStack(BlockId.AIR, 0);
    /** 鼠标跟随图标 */
    this.cursorIconEl = null;

    this._buildDom();
    this._bindEvents();
  }

  /**
   * 构建 DOM: 合成网格 + 27 格背包 + 9 格热键栏
   */
  _buildDom() {
    // 合成网格 (默认 2x2)
    this._renderCraftingGrid();
    // 背包 27 格
    this.inventoryGrid.innerHTML = '';
    for (let i = 9; i < 36; i++) {
      const el = document.createElement('div');
      el.className = 'inv-slot';
      el.dataset.slot = i;
      this.inventoryGrid.appendChild(el);
    }
    // 热键栏 9 格
    this.inventoryHotbar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const el = document.createElement('div');
      el.className = 'inv-slot';
      el.dataset.slot = i;
      this.inventoryHotbar.appendChild(el);
    }
    // 鼠标跟随图标
    this.cursorIconEl = document.createElement('div');
    this.cursorIconEl.className = 'inv-slot cursor-stack';
    this.cursorIconEl.style.position = 'fixed';
    this.cursorIconEl.style.pointerEvents = 'none';
    this.cursorIconEl.style.zIndex = '200';
    this.cursorIconEl.style.display = 'none';
    document.body.appendChild(this.cursorIconEl);
  }

  /**
   * 渲染合成网格 (2x2 或 3x3)
   */
  _renderCraftingGrid() {
    this.craftingGrid.innerHTML = '';
    const size = this.usingTable ? 3 : 2;
    this.craftingGrid.className = `crafting-grid size-${size}`;
    this.craftingSlots = [];
    for (let i = 0; i < size * size; i++) {
      const el = document.createElement('div');
      el.className = 'inv-slot';
      el.dataset.craft = i;
      this.craftingGrid.appendChild(el);
      this.craftingSlots.push(new ItemStack(BlockId.AIR, 0));
    }
  }

  /**
   * 绑定点击事件 (左键拾取/放下, 右键取一半)
   */
  _bindEvents() {
    // 点击槽位 (背包 / 热键栏 / 合成区 / 输出)
    this.root.addEventListener('mousedown', (e) => {
      if (!this.open) return;
      const slot = e.target.closest('.inv-slot');
      if (!slot) return;
      const slotIdx = slot.dataset.slot !== undefined ? parseInt(slot.dataset.slot, 10) : -1;
      const craftIdx = slot.dataset.craft !== undefined ? parseInt(slot.dataset.craft, 10) : -1;
      const isOutput = slot === this.craftingOutput;

      if (e.button === 0) {
        // 左键
        if (isOutput) this._takeOutput();
        else if (craftIdx >= 0) this._clickCraft(craftIdx, false);
        else if (slotIdx >= 0) this._clickSlot(slotIdx, false);
      } else if (e.button === 2) {
        // 右键
        e.preventDefault();
        if (isOutput) this._takeOutput();
        else if (craftIdx >= 0) this._clickCraft(craftIdx, true);
        else if (slotIdx >= 0) this._clickSlot(slotIdx, true);
      }
      this._render();
      this._updateCursorIcon(e);
    });

    // 右键菜单屏蔽
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());

    // 鼠标移动: 更新光标图标位置
    document.addEventListener('mousemove', (e) => {
      if (this.cursorIconEl.style.display !== 'none') {
        this.cursorIconEl.style.left = (e.clientX - 24) + 'px';
        this.cursorIconEl.style.top = (e.clientY - 24) + 'px';
      }
    });
  }

  /**
   * 点击物品栏槽位
   * @param {number} slotIdx 0-35
   * @param {boolean} rightClick 右键 (取一半)
   */
  _clickSlot(slotIdx, rightClick) {
    const slot = this.inventory.getSlot(slotIdx);
    if (this.cursorStack.isEmpty()) {
      // 拾取
      if (slot.isEmpty()) return;
      if (rightClick) {
        // 取一半
        const half = Math.ceil(slot.count / 2);
        this.cursorStack = new ItemStack(slot.id, half);
        slot.consume(half);
      } else {
        this.cursorStack = slot.clone();
        slot.consume(slot.count);
      }
    } else {
      // 放下
      if (slot.isEmpty()) {
        this.inventory.setSlot(slotIdx, this.cursorStack.clone());
        this.cursorStack.consume(this.cursorStack.count);
      } else if (slot.canStackWith(this.cursorStack)) {
        slot.absorb(this.cursorStack);
      } else if (rightClick) {
        // 右键放下 1 个
        slot.absorb(new ItemStack(this.cursorStack.id, 1));
        this.cursorStack.consume(1);
      } else {
        // 交换
        const tmp = slot.clone();
        this.inventory.setSlot(slotIdx, this.cursorStack.clone());
        this.cursorStack = tmp;
      }
    }
  }

  /**
   * 点击合成区槽位
   * @param {number} idx 0-3 / 0-8
   * @param {boolean} rightClick
   */
  _clickCraft(idx, rightClick) {
    const slot = this.craftingSlots[idx];
    if (this.cursorStack.isEmpty()) {
      if (slot.isEmpty()) return;
      if (rightClick) {
        const half = Math.ceil(slot.count / 2);
        this.cursorStack = new ItemStack(slot.id, half);
        slot.consume(half);
      } else {
        this.cursorStack = slot.clone();
        slot.consume(slot.count);
      }
    } else {
      if (slot.isEmpty()) {
        const take = rightClick ? 1 : this.cursorStack.count;
        this.craftingSlots[idx] = new ItemStack(this.cursorStack.id, take);
        this.cursorStack.consume(take);
      } else if (slot.canStackWith(this.cursorStack)) {
        if (rightClick) {
          slot.absorb(new ItemStack(this.cursorStack.id, 1));
          this.cursorStack.consume(1);
        } else {
          slot.absorb(this.cursorStack);
        }
      }
    }
    this._updateCraftingResult();
  }

  /**
   * 取出合成产物
   */
  _takeOutput() {
    if (!this.craftingResult) return;
    if (this.cursorStack.isEmpty()) {
      this.cursorStack = new ItemStack(this.craftingResult.id, this.craftingResult.count);
    } else if (this.cursorStack.id === this.craftingResult.id
               && this.cursorStack.count + this.craftingResult.count <= 64) {
      this.cursorStack.count += this.craftingResult.count;
    } else {
      return;
    }
    // 消耗合成区材料 (每个槽位 -1)
    for (const slot of this.craftingSlots) {
      slot.consume(1);
    }
    this.craftingResult = null;
    this._updateCraftingResult();
  }

  /**
   * 重新匹配配方, 更新合成产物
   */
  _updateCraftingResult() {
    const ids = this.craftingSlots.map((s) => (s.isEmpty() ? 0 : s.id));
    const result = matchRecipe(ids, this.usingTable);
    this.craftingResult = result;
  }

  /**
   * 更新光标跟随图标
   * @param {MouseEvent} e
   */
  _updateCursorIcon(e) {
    if (this.cursorStack.isEmpty()) {
      this.cursorIconEl.style.display = 'none';
      return;
    }
    this.cursorIconEl.style.display = 'flex';
    this.cursorIconEl.innerHTML = '';
    const def = getBlock(this.cursorStack.id);
    const icon = this.atlas.getIcon(def.tiles.side, 40);
    icon.className = 'slot-icon';
    this.cursorIconEl.appendChild(icon);
    if (this.cursorStack.count > 1) {
      const cnt = document.createElement('span');
      cnt.className = 'slot-count';
      cnt.textContent = this.cursorStack.count;
      this.cursorIconEl.appendChild(cnt);
    }
    if (e) {
      this.cursorIconEl.style.left = (e.clientX - 24) + 'px';
      this.cursorIconEl.style.top = (e.clientY - 24) + 'px';
    }
  }

  /**
   * 打开物品栏 (E 键)
   * @param {boolean} [useTable=false] 是否使用工作台
   */
  openInventory(useTable = false) {
    if (this.open) return;
    // 切换工作台模式时若 size 变化需重新渲染
    if (this.usingTable !== useTable) {
      this.usingTable = useTable;
      this._renderCraftingGrid();
    }
    this.open = true;
    this.root.classList.remove('hidden');
    // UI 美化: 工作台模式加 mode-table class (CSS 用于木色边框高亮), 切换标题文本
    this.root.classList.toggle('mode-table', useTable);
    const titleEl = this.root.querySelector('#inventory-title');
    if (titleEl) titleEl.textContent = useTable ? '工作台' : '物品栏';
    this._render();
  }

  /**
   * 关闭物品栏
   */
  closeInventory() {
    if (!this.open) return;
    // 把合成区的物品和鼠标手持物品退回背包
    for (let i = 0; i < this.craftingSlots.length; i++) {
      if (!this.craftingSlots[i].isEmpty()) {
        this.inventory.add(this.craftingSlots[i]);
        this.craftingSlots[i] = new ItemStack(BlockId.AIR, 0);
      }
    }
    if (!this.cursorStack.isEmpty()) {
      this.inventory.add(this.cursorStack);
      this.cursorStack = new ItemStack(BlockId.AIR, 0);
    }
    this.craftingResult = null;
    this.open = false;
    this.root.classList.add('hidden');
    this.cursorIconEl.style.display = 'none';
  }

  /**
   * 切换打开/关闭
   * @param {boolean} [useTable=false]
   */
  toggle(useTable = false) {
    if (this.open) this.closeInventory();
    else this.openInventory(useTable);
  }

  /**
   * 渲染所有槽位
   */
  _render() {
    // 渲染 36 个物品栏槽位
    const slots = this.root.querySelectorAll('[data-slot]');
    slots.forEach((el) => {
      const idx = parseInt(el.dataset.slot, 10);
      const stack = this.inventory.getSlot(idx);
      this._renderSlot(el, stack);
      if (idx === this.inventory.selected) el.classList.add('selected');
      else el.classList.remove('selected');
    });
    // 渲染合成区
    const craftEls = this.root.querySelectorAll('[data-craft]');
    craftEls.forEach((el) => {
      const idx = parseInt(el.dataset.craft, 10);
      this._renderSlot(el, this.craftingSlots[idx]);
    });
    // 渲染输出
    this.craftingOutput.classList.remove('has-item');
    this.craftingOutput.innerHTML = '';
    if (this.craftingResult) {
      const def = getBlock(this.craftingResult.id);
      const icon = this.atlas.getIcon(def.tiles.side, 40);
      icon.className = 'slot-icon';
      this.craftingOutput.appendChild(icon);
      if (this.craftingResult.count > 1) {
        const cnt = document.createElement('span');
        cnt.className = 'slot-count';
        cnt.textContent = this.craftingResult.count;
        this.craftingOutput.appendChild(cnt);
      }
      this.craftingOutput.classList.add('has-item');
    }
  }

  /**
   * 渲染单个槽位
   * @param {HTMLElement} el
   * @param {ItemStack} stack
   */
  _renderSlot(el, stack) {
    el.innerHTML = '';
    if (stack.isEmpty()) return;
    const def = getBlock(stack.id);
    const icon = this.atlas.getIcon(def.tiles.side, 40);
    icon.className = 'slot-icon';
    el.appendChild(icon);
    if (stack.count > 1) {
      const cnt = document.createElement('span');
      cnt.className = 'slot-count';
      cnt.textContent = stack.count;
      el.appendChild(cnt);
    }
  }

  /**
   * 设置选中热键栏 (用于热键栏切换同步)
   * @param {number} idx 0-8
   */
  setSelected(idx) {
    this.inventory.selected = idx;
    if (this.open) this._render();
  }
}
