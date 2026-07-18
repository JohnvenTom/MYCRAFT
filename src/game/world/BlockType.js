/**
 * @file 方块类型注册表
 * @description 定义所有方块 id、名称、硬度、是否透明/固体、6 面贴图索引
 */

import { TileIndex } from '../../utils/TextureAtlas.js';

/** 方块 ID 枚举 */
export const BlockId = Object.freeze({
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  LOG: 5,
  LEAVES: 6,
  SAND: 7,
  WATER: 8,
  BEDROCK: 9,
  COAL_ORE: 10,
  IRON_ORE: 11,
  GOLD_ORE: 12,
  DIAMOND_ORE: 13,
  PLANKS: 14,
  GLASS: 15,
  SNOW: 16,
  BRICK: 17,
  GRAVEL: 18,
  CRAFTING_TABLE: 19,
  FURNACE: 20,
  COAL_BLOCK: 21,
  IRON_BLOCK: 22,
  GOLD_BLOCK: 23,
  DIAMOND_BLOCK: 24,
  STICK_BLOCK: 25, // 占位, 实际原版无此方块, 仅用于内部 ID 分配
  WOOD_PICKAXE: 26, // 占位 (物品 ID 共享空间)
  WOOD_AXE: 27,
  WOOD_SWORD: 28,
  WOOD_SHOVEL: 29,
  STONE_PICKAXE: 30, // 石质工具 (比木质更强)
  STONE_AXE: 31,
  STONE_SWORD: 32,
  STONE_SHOVEL: 33,
});

/**
 * @typedef {Object} BlockDef
 * @property {number} id 方块 id
 * @property {string} name 显示名称
 * @property {number} hardness 硬度 (0=瞬破坏, -1=不可破坏如基岩)
 * @property {boolean} solid 是否可碰撞 (水/空气 false)
 * @property {boolean} transparent 是否透明 (玻璃/叶/水 true)
 * @property {boolean} liquid 是否液体
 * @property {boolean} renderDoubleSided 是否双面渲染 (树叶)
 * @property {{top:number, bottom:number, side:number}} tiles 6 面贴图索引 (top/bottom/side)
 * @property {string} [placeSound] 放置音效 key
 * @property {string} [breakSound] 破坏音效 key
 */

/**
 * 所有方块定义
 * @type {Record<number, BlockDef>}
 */
export const BLOCKS = {
  [BlockId.AIR]: {
    id: BlockId.AIR, name: '空气', hardness: 0,
    solid: false, transparent: true, liquid: false, renderDoubleSided: false,
    tiles: { top: 0, bottom: 0, side: 0 },
  },
  [BlockId.GRASS]: {
    id: BlockId.GRASS, name: '草方块', hardness: 0.6,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.GRASS_TOP, bottom: TileIndex.DIRT, side: TileIndex.GRASS_SIDE },
    breakSound: 'grass', placeSound: 'dirt',
  },
  [BlockId.DIRT]: {
    id: BlockId.DIRT, name: '泥土', hardness: 0.5,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.DIRT, bottom: TileIndex.DIRT, side: TileIndex.DIRT },
    breakSound: 'dirt', placeSound: 'dirt',
  },
  [BlockId.STONE]: {
    id: BlockId.STONE, name: '石头', hardness: 1.5,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.STONE, bottom: TileIndex.STONE, side: TileIndex.STONE },
    breakSound: 'stone', placeSound: 'stone',
  },
  [BlockId.COBBLESTONE]: {
    id: BlockId.COBBLESTONE, name: '圆石', hardness: 2.0,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.COBBLESTONE, bottom: TileIndex.COBBLESTONE, side: TileIndex.COBBLESTONE },
    breakSound: 'stone', placeSound: 'stone',
  },
  [BlockId.LOG]: {
    id: BlockId.LOG, name: '原木', hardness: 2.0,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.LOG_TOP, bottom: TileIndex.LOG_TOP, side: TileIndex.LOG_SIDE },
    breakSound: 'wood', placeSound: 'wood',
  },
  [BlockId.LEAVES]: {
    id: BlockId.LEAVES, name: '树叶', hardness: 0.2,
    solid: true, transparent: true, liquid: false, renderDoubleSided: true,
    tiles: { top: TileIndex.LEAVES, bottom: TileIndex.LEAVES, side: TileIndex.LEAVES },
    breakSound: 'grass', placeSound: 'grass',
  },
  [BlockId.SAND]: {
    id: BlockId.SAND, name: '沙子', hardness: 0.5,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.SAND, bottom: TileIndex.SAND, side: TileIndex.SAND },
    breakSound: 'sand', placeSound: 'sand',
  },
  [BlockId.WATER]: {
    id: BlockId.WATER, name: '水', hardness: -1,
    solid: false, transparent: true, liquid: true, renderDoubleSided: false,
    tiles: { top: TileIndex.WATER, bottom: TileIndex.WATER, side: TileIndex.WATER },
  },
  [BlockId.BEDROCK]: {
    id: BlockId.BEDROCK, name: '基岩', hardness: -1,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.BEDROCK, bottom: TileIndex.BEDROCK, side: TileIndex.BEDROCK },
    breakSound: 'stone', placeSound: 'stone',
  },
  [BlockId.COAL_ORE]: {
    id: BlockId.COAL_ORE, name: '煤矿石', hardness: 3.0,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.COAL_ORE, bottom: TileIndex.COAL_ORE, side: TileIndex.COAL_ORE },
    breakSound: 'stone', placeSound: 'stone',
  },
  [BlockId.IRON_ORE]: {
    id: BlockId.IRON_ORE, name: '铁矿石', hardness: 3.0,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.IRON_ORE, bottom: TileIndex.IRON_ORE, side: TileIndex.IRON_ORE },
    breakSound: 'stone', placeSound: 'stone',
  },
  [BlockId.GOLD_ORE]: {
    id: BlockId.GOLD_ORE, name: '金矿石', hardness: 3.0,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.GOLD_ORE, bottom: TileIndex.GOLD_ORE, side: TileIndex.GOLD_ORE },
    breakSound: 'stone', placeSound: 'stone',
  },
  [BlockId.DIAMOND_ORE]: {
    id: BlockId.DIAMOND_ORE, name: '钻石矿石', hardness: 3.0,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.DIAMOND_ORE, bottom: TileIndex.DIAMOND_ORE, side: TileIndex.DIAMOND_ORE },
    breakSound: 'stone', placeSound: 'stone',
  },
  [BlockId.PLANKS]: {
    id: BlockId.PLANKS, name: '木板', hardness: 2.0,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.PLANKS, bottom: TileIndex.PLANKS, side: TileIndex.PLANKS },
    breakSound: 'wood', placeSound: 'wood',
  },
  [BlockId.GLASS]: {
    id: BlockId.GLASS, name: '玻璃', hardness: 0.3,
    solid: true, transparent: true, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.GLASS, bottom: TileIndex.GLASS, side: TileIndex.GLASS },
    breakSound: 'glass', placeSound: 'glass',
  },
  [BlockId.SNOW]: {
    id: BlockId.SNOW, name: '雪', hardness: 0.2,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.SNOW, bottom: TileIndex.SNOW, side: TileIndex.SNOW },
    breakSound: 'sand', placeSound: 'sand',
  },
  [BlockId.BRICK]: {
    id: BlockId.BRICK, name: '砖块', hardness: 2.0,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.BRICK, bottom: TileIndex.BRICK, side: TileIndex.BRICK },
    breakSound: 'stone', placeSound: 'stone',
  },
  [BlockId.GRAVEL]: {
    id: BlockId.GRAVEL, name: '砾石', hardness: 0.6,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.GRAVEL, bottom: TileIndex.GRAVEL, side: TileIndex.GRAVEL },
    breakSound: 'gravel', placeSound: 'gravel',
  },
  [BlockId.CRAFTING_TABLE]: {
    id: BlockId.CRAFTING_TABLE, name: '工作台', hardness: 2.5,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.CRAFTING_TABLE_TOP, bottom: TileIndex.PLANKS, side: TileIndex.CRAFTING_TABLE_SIDE },
    breakSound: 'wood', placeSound: 'wood',
  },
  [BlockId.FURNACE]: {
    id: BlockId.FURNACE, name: '熔炉', hardness: 3.5,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.FURNACE_TOP, bottom: TileIndex.FURNACE_TOP, side: TileIndex.FURNACE_SIDE },
    breakSound: 'stone', placeSound: 'stone',
  },
  [BlockId.COAL_BLOCK]: {
    id: BlockId.COAL_BLOCK, name: '煤炭块', hardness: 5.0,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.COAL_BLOCK, bottom: TileIndex.COAL_BLOCK, side: TileIndex.COAL_BLOCK },
    breakSound: 'stone', placeSound: 'stone',
  },
  [BlockId.IRON_BLOCK]: {
    id: BlockId.IRON_BLOCK, name: '铁块', hardness: 5.0,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.IRON_BLOCK, bottom: TileIndex.IRON_BLOCK, side: TileIndex.IRON_BLOCK },
    breakSound: 'stone', placeSound: 'stone',
  },
  [BlockId.GOLD_BLOCK]: {
    id: BlockId.GOLD_BLOCK, name: '金块', hardness: 5.0,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.GOLD_BLOCK, bottom: TileIndex.GOLD_BLOCK, side: TileIndex.GOLD_BLOCK },
    breakSound: 'stone', placeSound: 'stone',
  },
  [BlockId.DIAMOND_BLOCK]: {
    id: BlockId.DIAMOND_BLOCK, name: '钻石块', hardness: 5.0,
    solid: true, transparent: false, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.DIAMOND_BLOCK, bottom: TileIndex.DIAMOND_BLOCK, side: TileIndex.DIAMOND_BLOCK },
    breakSound: 'stone', placeSound: 'stone',
  },
  // 物品类型占位 (不在世界中放置, 仅用于物品系统/合成)
  [BlockId.STICK_BLOCK]: {
    id: BlockId.STICK_BLOCK, name: '木棍', hardness: 0,
    solid: false, transparent: true, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.STICK, bottom: TileIndex.STICK, side: TileIndex.STICK },
  },
  [BlockId.WOOD_PICKAXE]: {
    id: BlockId.WOOD_PICKAXE, name: '木镐', hardness: 0,
    solid: false, transparent: true, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.WOOD_PICKAXE, bottom: TileIndex.WOOD_PICKAXE, side: TileIndex.WOOD_PICKAXE },
  },
  [BlockId.WOOD_AXE]: {
    id: BlockId.WOOD_AXE, name: '木斧', hardness: 0,
    solid: false, transparent: true, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.WOOD_AXE, bottom: TileIndex.WOOD_AXE, side: TileIndex.WOOD_AXE },
  },
  [BlockId.WOOD_SWORD]: {
    id: BlockId.WOOD_SWORD, name: '木剑', hardness: 0,
    solid: false, transparent: true, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.WOOD_SWORD, bottom: TileIndex.WOOD_SWORD, side: TileIndex.WOOD_SWORD },
  },
  [BlockId.WOOD_SHOVEL]: {
    id: BlockId.WOOD_SHOVEL, name: '木锹', hardness: 0,
    solid: false, transparent: true, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.WOOD_SHOVEL, bottom: TileIndex.WOOD_SHOVEL, side: TileIndex.WOOD_SHOVEL },
  },
  // 石质工具 (比木质更强: 速度 4.0 vs 2.5, 伤害 +1)
  [BlockId.STONE_PICKAXE]: {
    id: BlockId.STONE_PICKAXE, name: '石镐', hardness: 0,
    solid: false, transparent: true, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.STONE_PICKAXE, bottom: TileIndex.STONE_PICKAXE, side: TileIndex.STONE_PICKAXE },
  },
  [BlockId.STONE_AXE]: {
    id: BlockId.STONE_AXE, name: '石斧', hardness: 0,
    solid: false, transparent: true, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.STONE_AXE, bottom: TileIndex.STONE_AXE, side: TileIndex.STONE_AXE },
  },
  [BlockId.STONE_SWORD]: {
    id: BlockId.STONE_SWORD, name: '石剑', hardness: 0,
    solid: false, transparent: true, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.STONE_SWORD, bottom: TileIndex.STONE_SWORD, side: TileIndex.STONE_SWORD },
  },
  [BlockId.STONE_SHOVEL]: {
    id: BlockId.STONE_SHOVEL, name: '石锹', hardness: 0,
    solid: false, transparent: true, liquid: false, renderDoubleSided: false,
    tiles: { top: TileIndex.STONE_SHOVEL, bottom: TileIndex.STONE_SHOVEL, side: TileIndex.STONE_SHOVEL },
  },
};

/**
 * 获取方块定义
 * @param {number} id 方块 id
 * @returns {BlockDef}
 */
export function getBlock(id) {
  const def = BLOCKS[id];
  if (!def) return BLOCKS[BlockId.AIR];
  return def;
}

/**
 * 方块是否为空气
 * @param {number} id 方块 id
 * @returns {boolean}
 */
export function isAir(id) {
  return id === BlockId.AIR;
}

/**
 * 方块是否透明 (空气/玻璃/叶/水)
 * @param {number} id 方块 id
 * @returns {boolean}
 */
export function isTransparent(id) {
  return getBlock(id).transparent;
}

/**
 * 方块是否可碰撞
 * @param {number} id 方块 id
 * @returns {boolean}
 */
export function isSolid(id) {
  return getBlock(id).solid;
}

/**
 * 方块是否可破坏
 * @param {number} id 方块 id
 * @returns {boolean}
 */
export function isBreakable(id) {
  return getBlock(id).hardness >= 0;
}
