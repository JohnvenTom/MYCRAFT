/**
 * @file 合成配方表
 * @description Minecraft 风格的合成配方:
 *   - shaped: 有形配方 (3x3 网格, 物品必须放在正确位置)
 *   - shapeless: 无形配方 (任意位置摆放)
 *   - 2x2 配方用于物品栏自带合成区, 3x3 配方需要工作台
 *
 * 配方 key 字符含义:
 *   ' ' 或 '' = 空
 *   其他字符 = 对应 ingredient 中的物品 id
 */

import { BlockId } from '../world/BlockType.js';

/**
 * @typedef {Object} Recipe
 * @property {string} id 配方唯一 id
 * @property {'shaped'|'shapeless'} type 类型
 * @property {string[]|number[]} pattern 形状 (shaped 用字符串数组, shapeless 用物品 id 数组)
 * @property {Record<string, number>} [ingredients] 字符到物品 id 的映射 (shaped)
 * @property {{id:number, count:number}} output 产物
 * @property {boolean} requiresTable 是否需要工作台 (3x3); false 表示 2x2 即可
 */

/** 全局配方表 */
export const RECIPES = [
  // ===== 2x2 配方 (物品栏自带) =====
  {
    id: 'planks_from_log',
    type: 'shaped',
    pattern: ['L'],
    ingredients: { L: BlockId.LOG },
    output: { id: BlockId.PLANKS, count: 4 },
    requiresTable: false,
  },
  {
    id: 'stick',
    type: 'shaped',
    pattern: ['P', 'P'],
    ingredients: { P: BlockId.PLANKS },
    output: { id: BlockId.STICK_BLOCK, count: 4 },
    requiresTable: false,
  },
  {
    id: 'coal_block',
    type: 'shaped',
    pattern: ['CC', 'CC'],
    ingredients: { C: BlockId.COAL_ORE }, // 简化: 直接用煤矿石合煤炭块 (原版需先烧成煤)
    output: { id: BlockId.COAL_BLOCK, count: 1 },
    requiresTable: false,
  },

  // ===== 3x3 配方 (需要工作台) =====
  {
    id: 'crafting_table',
    type: 'shaped',
    pattern: ['PP', 'PP'],
    ingredients: { P: BlockId.PLANKS },
    output: { id: BlockId.CRAFTING_TABLE, count: 1 },
    requiresTable: false,
  },
  {
    id: 'furnace',
    type: 'shaped',
    pattern: ['CCC', 'C C', 'CCC'],
    ingredients: { C: BlockId.COBBLESTONE },
    output: { id: BlockId.FURNACE, count: 1 },
    requiresTable: true,
  },
  {
    id: 'wood_pickaxe',
    type: 'shaped',
    pattern: ['PPP', ' S ', ' S '],
    ingredients: { P: BlockId.PLANKS, S: BlockId.STICK_BLOCK },
    output: { id: BlockId.WOOD_PICKAXE, count: 1 },
    requiresTable: true,
  },
  {
    id: 'wood_axe',
    type: 'shaped',
    pattern: ['PP ', 'PS ', ' S '],
    ingredients: { P: BlockId.PLANKS, S: BlockId.STICK_BLOCK },
    output: { id: BlockId.WOOD_AXE, count: 1 },
    requiresTable: true,
  },
  {
    id: 'wood_sword',
    type: 'shaped',
    pattern: ['P', 'P', 'S'],
    ingredients: { P: BlockId.PLANKS, S: BlockId.STICK_BLOCK },
    output: { id: BlockId.WOOD_SWORD, count: 1 },
    requiresTable: true,
  },
  {
    id: 'wood_shovel',
    type: 'shaped',
    pattern: ['P', 'S', 'S'],
    ingredients: { P: BlockId.PLANKS, S: BlockId.STICK_BLOCK },
    output: { id: BlockId.WOOD_SHOVEL, count: 1 },
    requiresTable: true,
  },
  // ===== 石质工具系列 (需要工作台, 用圆石代替木板, 性能优于木质) =====
  {
    id: 'stone_pickaxe',
    type: 'shaped',
    pattern: ['CCC', ' S ', ' S '],
    ingredients: { C: BlockId.COBBLESTONE, S: BlockId.STICK_BLOCK },
    output: { id: BlockId.STONE_PICKAXE, count: 1 },
    requiresTable: true,
  },
  {
    id: 'stone_axe',
    type: 'shaped',
    pattern: ['CC ', 'CS ', ' S '],
    ingredients: { C: BlockId.COBBLESTONE, S: BlockId.STICK_BLOCK },
    output: { id: BlockId.STONE_AXE, count: 1 },
    requiresTable: true,
  },
  {
    id: 'stone_sword',
    type: 'shaped',
    pattern: ['C', 'C', 'S'],
    ingredients: { C: BlockId.COBBLESTONE, S: BlockId.STICK_BLOCK },
    output: { id: BlockId.STONE_SWORD, count: 1 },
    requiresTable: true,
  },
  {
    id: 'stone_shovel',
    type: 'shaped',
    pattern: ['C', 'S', 'S'],
    ingredients: { C: BlockId.COBBLESTONE, S: BlockId.STICK_BLOCK },
    output: { id: BlockId.STONE_SHOVEL, count: 1 },
    requiresTable: true,
  },
  {
    id: 'iron_block',
    type: 'shaped',
    pattern: ['III', 'III', 'III'],
    ingredients: { I: BlockId.IRON_ORE }, // 简化
    output: { id: BlockId.IRON_BLOCK, count: 1 },
    requiresTable: true,
  },
  {
    id: 'gold_block',
    type: 'shaped',
    pattern: ['GGG', 'GGG', 'GGG'],
    ingredients: { G: BlockId.GOLD_ORE },
    output: { id: BlockId.GOLD_BLOCK, count: 1 },
    requiresTable: true,
  },
  {
    id: 'diamond_block',
    type: 'shaped',
    pattern: ['DDD', 'DDD', 'DDD'],
    ingredients: { D: BlockId.DIAMOND_ORE },
    output: { id: BlockId.DIAMOND_BLOCK, count: 1 },
    requiresTable: true,
  },
  {
    id: 'glass_from_sand', // 简化: 沙子直接合成玻璃 (原版需熔炉烧)
    type: 'shapeless',
    pattern: [BlockId.SAND, BlockId.SAND],
    output: { id: BlockId.GLASS, count: 2 },
    requiresTable: false,
  },
  // 修复: 移除 brick_block 配方 (输入输出都是 BRICK, 自循环无意义; BRICK 本身已是方块)

  // ===== 反向分解配方 (1 块 → 9 矿石, 增加合成灵活性) =====
  {
    id: 'unpack_coal',
    type: 'shapeless',
    pattern: [BlockId.COAL_BLOCK],
    output: { id: BlockId.COAL_ORE, count: 9 },
    requiresTable: true,
  },
  {
    id: 'unpack_iron',
    type: 'shapeless',
    pattern: [BlockId.IRON_BLOCK],
    output: { id: BlockId.IRON_ORE, count: 9 },
    requiresTable: true,
  },
  {
    id: 'unpack_gold',
    type: 'shapeless',
    pattern: [BlockId.GOLD_BLOCK],
    output: { id: BlockId.GOLD_ORE, count: 9 },
    requiresTable: true,
  },
  {
    id: 'unpack_diamond',
    type: 'shapeless',
    pattern: [BlockId.DIAMOND_BLOCK],
    output: { id: BlockId.DIAMOND_ORE, count: 9 },
    requiresTable: true,
  },
];

/**
 * 把 2x2 或 3x3 网格标准化为带 padding 的 3x3 (供 pattern 匹配)
 * @param {Array<number>} grid 输入网格 (长度 4 或 9), 每元素为物品 id 或 0
 * @param {number} size 边长 (2 或 3)
 * @returns {number[]} 长度 9 的数组
 */
function normalizeGrid(grid, size) {
  if (size === 3) return grid.slice();
  if (size === 2) {
    const out = new Array(9).fill(0);
    out[0] = grid[0]; out[1] = grid[1]; out[3] = grid[2]; out[4] = grid[3];
    return out;
  }
  return new Array(9).fill(0);
}

/**
 * 将 pattern 字符串数组转为 3x3 字符网格 (去除空行/空列, 然后居中)
 * @param {string[]} pattern 形状数组, 如 ['PPP', ' S ', ' S ']
 * @returns {string[]} 长度 9 的字符数组 (' ' 表示空)
 */
function patternToGrid(pattern) {
  // 转为字符矩阵
  const rows = pattern.map((row) => row.padEnd(3, ' ').split('').slice(0, 3));
  while (rows.length < 3) rows.push([' ', ' ', ' ']);
  // 找出非空范围
  let minR = 3, maxR = -1, minC = 3, maxC = -1;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = rows[r][c];
      if (ch && ch !== ' ') {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR < 0) {
    // 全空配方
    return new Array(9).fill(' ');
  }
  const out = new Array(9).fill(' ');
  // 把非空部分放到 (0,0) 对齐 (允许任意位置匹配)
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      out[(r - minR) * 3 + (c - minC)] = rows[r][c] || ' ';
    }
  }
  return out;
}

/**
 * 找出输入网格的非空范围, 然后左上对齐
 * @param {number[]} grid 长度 9 的物品 id 数组
 * @returns {number[]} 长度 9 的归一化数组
 */
function shrinkInputGrid(grid) {
  let minR = 3, maxR = -1, minC = 3, maxC = -1;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[r * 3 + c] !== 0) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR < 0) return new Array(9).fill(0);
  const out = new Array(9).fill(0);
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      out[(r - minR) * 3 + (c - minC)] = grid[r * 3 + c];
    }
  }
  return out;
}

/**
 * 在 9 格输入网格上匹配配方
 * @param {number[]} inputGrid 长度 9 的物品 id 数组 (0=空)
 * @param {boolean} hasTable 是否使用工作台 (true=3x3, false=2x2 仅左上 4 格)
 * @returns {Object|null} 匹配的配方 output ({id, count}) 或 null
 */
export function matchRecipe(inputGrid, hasTable) {
  // 修复 2x2 索引错位 BUG:
  //   原代码 [inputGrid[0], inputGrid[1], inputGrid[3], inputGrid[4]] 假设输入长度 9,
  //   但 InventoryUI 在 2x2 模式下传入长度 4 的数组 (inputGrid[4] 为 undefined),
  //   导致竖向 2 格配方 (stick/wood_sword/wood_shovel) 匹配异常。
  //   修复: 2x2 模式直接 normalizeGrid 长度 4 的输入到 3x3 网格的 [0,1,3,4] 位置。
  const grid = hasTable ? inputGrid.slice() : normalizeGrid(inputGrid, 2);
  const shrunkInput = shrinkInputGrid(grid);
  // 检查所有配方
  for (const recipe of RECIPES) {
    if (recipe.requiresTable && !hasTable) continue;
    if (recipe.type === 'shaped') {
      const patternGrid = patternToGrid(recipe.pattern);
      if (matchShaped(shrunkInput, patternGrid, recipe.ingredients || {})) {
        return recipe.output;
      }
    } else if (recipe.type === 'shapeless') {
      if (matchShapeless(shrunkInput, recipe.pattern, recipe.output)) {
        return recipe.output;
      }
    }
  }
  return null;
}

/**
 * 匹配有形配方
 * @param {number[]} input 长度 9 的物品 id (已 shrink)
 * @param {string[]} pattern 长度 9 的字符 (已 shrink)
 * @param {Record<string, number>} ingredients 字符到物品 id 映射
 * @returns {boolean}
 */
function matchShaped(input, pattern, ingredients) {
  for (let i = 0; i < 9; i++) {
    const ch = pattern[i];
    const id = input[i];
    if (ch === ' ') {
      if (id !== 0) return false;
    } else {
      const expected = ingredients[ch];
      if (expected === undefined) return false;
      if (id !== expected) return false;
    }
  }
  return true;
}

/**
 * 匹配无形配方 (任意位置, 数量匹配即可)
 * @param {number[]} input 长度 9 的物品 id (已 shrink, 但 shapeless 不关心位置)
 * @param {number[]} required 必需物品 id 列表
 * @param {Object} output 产物 (用于校验, 此处忽略)
 * @returns {boolean}
 */
function matchShapeless(input, required) {
  // 收集输入中所有非空物品
  const inputItems = input.filter((id) => id !== 0);
  if (inputItems.length !== required.length) return false;
  // 比较 (顺序无关)
  const inputSorted = inputItems.slice().sort();
  const reqSorted = required.slice().sort();
  for (let i = 0; i < inputItems.length; i++) {
    if (inputSorted[i] !== reqSorted[i]) return false;
  }
  return true;
}

/**
 * 获取所有配方 (用于 UI 显示)
 * @returns {Recipe[]}
 */
export function getAllRecipes() {
  return RECIPES;
}
