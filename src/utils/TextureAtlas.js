/**
 * @file 程序化纹理图集
 * @description 使用 Canvas 2D 程序化生成 Minecraft 风格的 16×16 像素方块贴图，
 *              合并为一张图集纹理供所有方块共享，避免外部 PNG 资源依赖与版权问题。
 *              生成结果: 单张 CanvasTexture + UV 映射表 + 每方块 UI 图标 canvas。
 */

import * as THREE from 'three';

/** 图集中单张贴图边长 (像素) */
export const TILE_SIZE = 16;
/** 图集每行贴图数 */
export const TILES_PER_ROW = 16;
/** 图集总行数 (预留) */
export const ATLAS_ROWS = 6;

/** 贴图索引枚举 (与下方 ATLAS_TILES 顺序一致) */
export const TileIndex = Object.freeze({
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  LOG_SIDE: 5,
  LOG_TOP: 6,
  LEAVES: 7,
  SAND: 8,
  WATER: 9,
  BEDROCK: 10,
  COAL_ORE: 11,
  IRON_ORE: 12,
  GOLD_ORE: 13,
  DIAMOND_ORE: 14,
  PLANKS: 15,
  GLASS: 16,
  SNOW: 17,
  BRICK: 18,
  GRAVEL: 19,
  CRAFTING_TABLE_TOP: 20,
  CRAFTING_TABLE_SIDE: 21,
  FURNACE_TOP: 22,
  FURNACE_SIDE: 23,
  COAL_BLOCK: 24,
  IRON_BLOCK: 25,
  GOLD_BLOCK: 26,
  DIAMOND_BLOCK: 27,
  STICK: 28,
  WOOD_PICKAXE: 29,
  WOOD_AXE: 30,
  WOOD_SWORD: 31,
  WOOD_SHOVEL: 32,
});

/**
 * 简易可重复随机数 (基于种子), 用于纹理噪声可复现
 * @param {number} seed 种子
 * @returns {() => number} 返回 0-1 之间随机数的函数
 */
function makeRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 在 ctx 上绘制单个像素
 * @param {CanvasRenderingContext2D} ctx 2D 上下文
 * @param {number} x 像素 X
 * @param {number} y 像素 Y
 * @param {string} color 颜色字符串
 */
function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

/**
 * 绘制带噪声的纯色贴图
 * @param {CanvasRenderingContext2D} ctx 上下文
 * @param {number} ox 贴图原点 X
 * @param {number} oy 贴图原点 Y
 * @param {number} seed 噪声种子
 * @param {number} r 基色红 0-255
 * @param {number} g 基色绿 0-255
 * @param {number} b 基色蓝 0-255
 * @param {number} variation 每像素颜色偏移幅度 0-50
 */
function noisyFill(ctx, ox, oy, seed, r, g, b, variation = 12) {
  const rand = makeRand(seed);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const n = Math.floor((rand() - 0.5) * 2 * variation);
      const rr = Math.max(0, Math.min(255, r + n));
      const gg = Math.max(0, Math.min(255, g + n));
      const bb = Math.max(0, Math.min(255, b + n));
      px(ctx, ox + x, oy + y, `rgb(${rr},${gg},${bb})`);
    }
  }
}

/**
 * 在噪声底上绘制若干深色斑块 (矿石/砾石用)
 * @param {CanvasRenderingContext2D} ctx 上下文
 * @param {number} ox 原点 X
 * @param {number} oy 原点 Y
 * @param {number} seed 种子
 * @param {string} blobColor 斑块颜色
 * @param {number} blobCount 斑块数量
 * @param {number} blobSize 斑块最大半径
 */
function drawBlobs(ctx, ox, oy, seed, blobColor, blobCount = 6, blobSize = 2) {
  const rand = makeRand(seed);
  for (let i = 0; i < blobCount; i++) {
    const cx = Math.floor(rand() * (TILE_SIZE - blobSize * 2)) + blobSize;
    const cy = Math.floor(rand() * (TILE_SIZE - blobSize * 2)) + blobSize;
    const r = 1 + Math.floor(rand() * blobSize);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) {
          px(ctx, ox + cx + x, oy + cy + y, blobColor);
        }
      }
    }
  }
}

/**
 * 绘制草顶贴图 (亮绿带噪声)
 */
function drawGrassTop(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 95, 165, 70, 14);
  // 散布暗色草尖
  const rand = makeRand(seed + 1);
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(rand() * TILE_SIZE);
    const y = Math.floor(rand() * TILE_SIZE);
    px(ctx, ox + x, oy + y, 'rgb(70,130,55)');
  }
}

/**
 * 绘制草侧贴图 (顶部3行草, 下方泥土)
 */
function drawGrassSide(ctx, ox, oy, seed) {
  // 先铺泥土底
  noisyFill(ctx, ox, oy, seed + 9, 121, 85, 58, 10);
  // 顶部草层 + 不规则下沿
  const rand = makeRand(seed + 2);
  for (let x = 0; x < TILE_SIZE; x++) {
    const grassH = 3 + (rand() < 0.4 ? 1 : 0);
    for (let y = 0; y < grassH; y++) {
      const n = Math.floor((rand() - 0.5) * 16);
      px(ctx, ox + x, oy + y, `rgb(${95 + n},${165 + n},${70 + n})`);
    }
    // 草向下滴落
    if (rand() < 0.3) {
      px(ctx, ox + x, oy + grassH, 'rgb(80,140,60)');
    }
  }
}

/**
 * 绘制原木侧面 (树皮)
 */
function drawLogSide(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 102, 76, 47, 10);
  const rand = makeRand(seed + 3);
  // 垂直纹理
  for (let x = 0; x < TILE_SIZE; x++) {
    if (rand() < 0.35) {
      for (let y = 0; y < TILE_SIZE; y++) {
        const n = Math.floor((rand() - 0.5) * 20);
        px(ctx, ox + x, oy + y, `rgb(${72 + n},${52 + n},${32 + n})`);
      }
    }
  }
}

/**
 * 绘制原木横截面 (年轮)
 */
function drawLogTop(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 168, 132, 86, 8);
  const cx = TILE_SIZE / 2 - 0.5;
  const cy = TILE_SIZE / 2 - 0.5;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (Math.floor(d) % 2 === 0) {
        px(ctx, ox + x, oy + y, 'rgb(130,96,60)');
      }
    }
  }
}

/**
 * 绘制树叶 (深绿, 带透明孔洞)
 */
function drawLeaves(ctx, ox, oy, seed) {
  const rand = makeRand(seed + 7);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (rand() < 0.15) {
        // 透明孔洞
        ctx.clearRect(ox + x, oy + y, 1, 1);
      } else {
        const base = rand() < 0.5 ? 60 : 90;
        const n = Math.floor((rand() - 0.5) * 30);
        px(ctx, ox + x, oy + y, `rgb(${base + n},${base + 40 + n},${30 + n})`);
      }
    }
  }
}

/**
 * 绘制水 (半透明蓝, 平静)
 */
function drawWater(ctx, ox, oy, seed) {
  const rand = makeRand(seed + 4);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const n = Math.floor((rand() - 0.5) * 18);
      ctx.fillStyle = `rgba(${40 + n},${100 + n},${200 + n},0.75)`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

/**
 * 绘制玻璃 (近透明, 白色边框 + 高光)
 */
function drawGlass(ctx, ox, oy, seed) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE);
  // 外边框
  ctx.fillStyle = 'rgba(220,235,240,0.85)';
  for (let i = 0; i < TILE_SIZE; i++) {
    px(ctx, ox + i, oy + 0, 'rgba(220,235,240,0.85)');
    px(ctx, ox + i, oy + TILE_SIZE - 1, 'rgba(220,235,240,0.85)');
    px(ctx, ox + 0, oy + i, 'rgba(220,235,240,0.85)');
    px(ctx, ox + TILE_SIZE - 1, oy + i, 'rgba(220,235,240,0.85)');
  }
  // 高光斜线
  for (let i = 2; i < 7; i++) {
    px(ctx, ox + i, oy + i + 1, 'rgba(255,255,255,0.6)');
  }
}

/**
 * 绘制圆石 (灰, 块状图案)
 */
function drawCobblestone(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 120, 120, 120, 14);
  const rand = makeRand(seed + 5);
  // 黑色 mortar 网格
  ctx.fillStyle = 'rgb(60,60,60)';
  // 不规则块边界
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rand() * TILE_SIZE);
    const y = Math.floor(rand() * TILE_SIZE);
    for (let k = 0; k < 4 + Math.floor(rand() * 4); k++) {
      px(ctx, ox + (x + k) % TILE_SIZE, oy + y, 'rgb(70,70,70)');
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rand() * TILE_SIZE);
    const y = Math.floor(rand() * TILE_SIZE);
    for (let k = 0; k < 4 + Math.floor(rand() * 4); k++) {
      px(ctx, ox + x, oy + (y + k) % TILE_SIZE, 'rgb(70,70,70)');
    }
  }
}

/**
 * 绘制砖块 (红砖 + 灰浆)
 */
function drawBrick(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 150, 70, 55, 10);
  ctx.fillStyle = 'rgb(200,200,195)';
  // 横向灰浆 (每4行)
  for (let y = 0; y < TILE_SIZE; y += 4) {
    for (let x = 0; x < TILE_SIZE; x++) {
      px(ctx, ox + x, oy + y, 'rgb(200,200,195)');
    }
  }
  // 纵向灰浆 (错位)
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 === 0 ? 0 : 4;
    for (let y = row * 4 + 1; y < row * 4 + 4 && y < TILE_SIZE; y++) {
      for (let x = offset; x < TILE_SIZE; x += 8) {
        px(ctx, ox + x, oy + y, 'rgb(200,200,195)');
      }
    }
  }
}

/**
 * 绘制基岩 (深灰 + 黑色块)
 */
function drawBedrock(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 80, 80, 80, 18);
  drawBlobs(ctx, ox, oy, seed + 6, 'rgb(40,40,40)', 8, 2);
}

/**
 * 绘制沙子
 */
function drawSand(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 219, 211, 160, 8);
}

/**
 * 绘制砾石
 */
function drawGravel(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 128, 120, 116, 18);
  drawBlobs(ctx, ox, oy, seed + 2, 'rgb(80,75,72)', 10, 2);
  drawBlobs(ctx, ox, oy, seed + 3, 'rgb(170,165,160)', 6, 1);
}

/**
 * 绘制木板
 */
function drawPlanks(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 168, 132, 86, 8);
  // 横向木板分隔 (每4行)
  for (let y = 3; y < TILE_SIZE; y += 4) {
    for (let x = 0; x < TILE_SIZE; x++) {
      px(ctx, ox + x, oy + y, 'rgb(120,90,55)');
    }
  }
  // 纵向接缝 (错位)
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 === 0 ? 5 : 11;
    for (let y = row * 4; y < row * 4 + 3 && y < TILE_SIZE; y++) {
      px(ctx, ox + offset, oy + y, 'rgb(120,90,55)');
    }
  }
}

/**
 * 绘制雪
 */
function drawSnow(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 245, 248, 252, 4);
}

/**
 * 绘制工作台顶面 (3x3 网格 + 中央十字)
 */
function drawCraftingTableTop(ctx, ox, oy, seed) {
  drawPlanks(ctx, ox, oy, seed);
  ctx.fillStyle = 'rgb(80,55,30)';
  // 外框
  for (let i = 0; i < TILE_SIZE; i++) {
    px(ctx, ox + i, oy + 0, 'rgb(80,55,30)');
    px(ctx, ox + i, oy + TILE_SIZE - 1, 'rgb(80,55,30)');
    px(ctx, ox + 0, oy + i, 'rgb(80,55,30)');
    px(ctx, ox + TILE_SIZE - 1, oy + i, 'rgb(80,55,30)');
  }
  // 内部网格线
  for (let i = 5; i <= 10; i++) {
    px(ctx, ox + i, oy + 5, 'rgb(80,55,30)');
    px(ctx, ox + i, oy + 10, 'rgb(80,55,30)');
    px(ctx, ox + 5, oy + i, 'rgb(80,55,30)');
    px(ctx, ox + 10, oy + i, 'rgb(80,55,30)');
  }
}

/**
 * 绘制工作台侧面 (工具图案)
 */
function drawCraftingTableSide(ctx, ox, oy, seed) {
  drawPlanks(ctx, ox, oy, seed);
  // 顶部草绿色条
  for (let x = 0; x < TILE_SIZE; x++) {
    px(ctx, ox + x, oy + 0, 'rgb(95,165,70)');
    px(ctx, ox + x, oy + 1, 'rgb(95,165,70)');
  }
  // 十字工具图案
  ctx.fillStyle = 'rgb(60,40,20)';
  for (let i = 5; i <= 10; i++) {
    px(ctx, ox + i, oy + 7, 'rgb(60,40,20)');
    px(ctx, ox + i, oy + 12, 'rgb(60,40,20)');
    px(ctx, ox + 7, oy + i, 'rgb(60,40,20)');
    px(ctx, ox + 12, oy + i, 'rgb(60,40,20)');
  }
}

/**
 * 绘制熔炉顶面 (烟囱口)
 */
function drawFurnaceTop(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 90, 90, 90, 10);
  // 中央黑色烟囱
  ctx.fillStyle = 'rgb(30,30,30)';
  for (let y = 5; y <= 10; y++) {
    for (let x = 5; x <= 10; x++) {
      px(ctx, ox + x, oy + y, 'rgb(30,30,30)');
    }
  }
}

/**
 * 绘制熔炉侧面 (火口)
 */
function drawFurnaceSide(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 100, 100, 100, 10);
  // 火口 (黑色凹陷)
  ctx.fillStyle = 'rgb(40,40,40)';
  for (let y = 6; y <= 11; y++) {
    for (let x = 4; x <= 11; x++) {
      px(ctx, ox + x, oy + y, 'rgb(40,40,40)');
    }
  }
  // 火焰 (橙红)
  const rand = makeRand(seed + 1);
  for (let y = 9; y <= 11; y++) {
    for (let x = 5; x <= 10; x++) {
      if (rand() < 0.6) {
        px(ctx, ox + x, oy + y, `rgb(${220 + Math.floor(rand() * 30)},${100 + Math.floor(rand() * 50)},30)`);
      }
    }
  }
}

/**
 * 绘制煤炭块
 */
function drawCoalBlock(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 25, 25, 25, 8);
  drawBlobs(ctx, ox, oy, seed + 1, 'rgb(10,10,10)', 8, 2);
  drawBlobs(ctx, ox, oy, seed + 2, 'rgb(60,60,60)', 4, 1);
}

/**
 * 绘制铁块
 */
function drawIronBlock(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 220, 220, 220, 8);
  // 边框
  for (let i = 0; i < TILE_SIZE; i++) {
    px(ctx, ox + i, oy + 0, 'rgb(180,180,180)');
    px(ctx, ox + i, oy + TILE_SIZE - 1, 'rgb(180,180,180)');
    px(ctx, ox + 0, oy + i, 'rgb(180,180,180)');
    px(ctx, ox + TILE_SIZE - 1, oy + i, 'rgb(180,180,180)');
  }
}

/**
 * 绘制金块
 */
function drawGoldBlock(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 240, 215, 80, 10);
  for (let i = 0; i < TILE_SIZE; i++) {
    px(ctx, ox + i, oy + 0, 'rgb(200,175,50)');
    px(ctx, ox + i, oy + TILE_SIZE - 1, 'rgb(200,175,50)');
    px(ctx, ox + 0, oy + i, 'rgb(200,175,50)');
    px(ctx, ox + TILE_SIZE - 1, oy + i, 'rgb(200,175,50)');
  }
}

/**
 * 绘制钻石块
 */
function drawDiamondBlock(ctx, ox, oy, seed) {
  noisyFill(ctx, ox, oy, seed, 100, 230, 230, 12);
  // 菱形图案
  const cx = TILE_SIZE / 2 - 0.5;
  const cy = TILE_SIZE / 2 - 0.5;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      if (d < 3) px(ctx, ox + x, oy + y, 'rgb(180,255,255)');
    }
  }
}

/**
 * 绘制木棍图标 (对角线)
 */
function drawStick(ctx, ox, oy, seed) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE);
  const rand = makeRand(seed);
  for (let i = 2; i < 14; i++) {
    const n = Math.floor((rand() - 0.5) * 20);
    px(ctx, ox + i, oy + 14 - i, `rgb(${150 + n},${115 + n},${70 + n})`);
    px(ctx, ox + i + 1, oy + 14 - i, `rgb(${150 + n},${115 + n},${70 + n})`);
  }
}

/**
 * 绘制木镐图标 (对角线 + 镐头)
 */
function drawWoodPickaxe(ctx, ox, oy, seed) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE);
  // 柄
  for (let i = 4; i < 14; i++) {
    px(ctx, ox + i, oy + 14 - i + 4, 'rgb(150,115,70)');
    px(ctx, ox + i + 1, oy + 14 - i + 4, 'rgb(150,115,70)');
  }
  // 镐头 (顶部圆弧)
  for (let x = 2; x <= 10; x++) {
    px(ctx, ox + x, oy + 3, 'rgb(120,90,55)');
    px(ctx, ox + x, oy + 4, 'rgb(120,90,55)');
  }
  px(ctx, ox + 2, oy + 4, 'rgb(120,90,55)');
  px(ctx, ox + 2, oy + 5, 'rgb(120,90,55)');
  px(ctx, ox + 10, oy + 4, 'rgb(120,90,55)');
  px(ctx, ox + 10, oy + 5, 'rgb(120,90,55)');
}

/**
 * 绘制木斧图标
 */
function drawWoodAxe(ctx, ox, oy, seed) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE);
  // 柄
  for (let i = 4; i < 14; i++) {
    px(ctx, ox + i, oy + 14 - i + 4, 'rgb(150,115,70)');
    px(ctx, ox + i + 1, oy + 14 - i + 4, 'rgb(150,115,70)');
  }
  // 斧头 (L 形)
  for (let x = 2; x <= 6; x++) {
    for (let y = 2; y <= 6; y++) {
      px(ctx, ox + x, oy + y, 'rgb(120,90,55)');
    }
  }
}

/**
 * 绘制木剑图标
 */
function drawWoodSword(ctx, ox, oy, seed) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE);
  // 剑刃 (垂直)
  for (let y = 2; y <= 11; y++) {
    px(ctx, ox + 8, oy + y, 'rgb(150,115,70)');
    px(ctx, ox + 7, oy + y, 'rgb(120,90,55)');
  }
  // 剑尖
  px(ctx, ox + 7, oy + 1, 'rgb(150,115,70)');
  px(ctx, ox + 8, oy + 1, 'rgb(150,115,70)');
  // 护手
  for (let x = 5; x <= 10; x++) {
    px(ctx, ox + x, oy + 11, 'rgb(80,55,30)');
    px(ctx, ox + x, oy + 12, 'rgb(80,55,30)');
  }
  // 柄
  for (let y = 13; y <= 14; y++) {
    px(ctx, ox + 7, oy + y, 'rgb(80,55,30)');
    px(ctx, ox + 8, oy + y, 'rgb(80,55,30)');
  }
}

/**
 * 绘制木锹图标
 */
function drawWoodShovel(ctx, ox, oy, seed) {
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE);
  // 柄
  for (let i = 4; i < 14; i++) {
    px(ctx, ox + i, oy + 14 - i + 4, 'rgb(150,115,70)');
    px(ctx, ox + i + 1, oy + 14 - i + 4, 'rgb(150,115,70)');
  }
  // 铲头 (梯形)
  for (let y = 2; y <= 5; y++) {
    const w = 4 - (y - 2);
    for (let x = 4 - w; x <= 4 + w; x++) {
      px(ctx, ox + x, oy + y, 'rgb(120,90,55)');
    }
  }
}

/**
 * 纹理图集类
 * 负责生成图集画布、构造 THREE.CanvasTexture、提供 UV 查询与 UI 图标
 */
export class TextureAtlas {
  constructor() {
    /** @type {HTMLCanvasElement} */
    this.canvas = null;
    /** @type {THREE.CanvasTexture} */
    this.texture = null;
    /** @type {Map<number, {u0:number,v0:number,u1:number,v1:number}>} */
    this.uvMap = new Map();
    /** @type {Map<number, HTMLCanvasElement>} 用于 UI 的单贴图小 canvas */
    this.iconCache = new Map();
  }

  /**
   * 生成图集并构建纹理
   * @returns {Promise<void>}
   */
  async generate() {
    const width = TILES_PER_ROW * TILE_SIZE;
    const height = ATLAS_ROWS * TILE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);

    const drawers = [
      drawGrassTop,    // 0
      drawGrassSide,   // 1
      (c, x, y, s) => noisyFill(c, x, y, s, 121, 85, 58, 10),   // 2 dirt
      (c, x, y, s) => noisyFill(c, x, y, s, 127, 127, 127, 10), // 3 stone
      drawCobblestone, // 4
      drawLogSide,     // 5
      drawLogTop,      // 6
      drawLeaves,      // 7
      drawSand,        // 8
      drawWater,       // 9
      drawBedrock,     // 10
      (c, x, y, s) => { noisyFill(c, x, y, s, 127, 127, 127, 10); drawBlobs(c, x, y, s, 'rgb(30,30,30)', 5, 2); }, // 11 coal
      (c, x, y, s) => { noisyFill(c, x, y, s, 127, 127, 127, 10); drawBlobs(c, x, y, s, 'rgb(200,160,120)', 5, 2); }, // 12 iron
      (c, x, y, s) => { noisyFill(c, x, y, s, 127, 127, 127, 10); drawBlobs(c, x, y, s, 'rgb(240,215,80)', 5, 2); }, // 13 gold
      (c, x, y, s) => { noisyFill(c, x, y, s, 127, 127, 127, 10); drawBlobs(c, x, y, s, 'rgb(100,230,230)', 5, 2); }, // 14 diamond
      drawPlanks,      // 15
      drawGlass,       // 16
      drawSnow,        // 17
      drawBrick,       // 18
      drawGravel,      // 19
      drawCraftingTableTop,    // 20
      drawCraftingTableSide,   // 21
      drawFurnaceTop,          // 22
      drawFurnaceSide,         // 23
      drawCoalBlock,           // 24
      drawIronBlock,           // 25
      drawGoldBlock,           // 26
      drawDiamondBlock,        // 27
      drawStick,               // 28
      drawWoodPickaxe,         // 29
      drawWoodAxe,             // 30
      drawWoodSword,           // 31
      drawWoodShovel,          // 32
    ];

    drawers.forEach((drawer, i) => {
      const col = i % TILES_PER_ROW;
      const row = Math.floor(i / TILES_PER_ROW);
      const ox = col * TILE_SIZE;
      const oy = row * TILE_SIZE;
      drawer(ctx, ox, oy, i * 1337 + 42);
      this.uvMap.set(i, this._computeUV(i));
    });

    this.canvas = canvas;

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.texture = tex;
  }

  /**
   * 计算贴图索引对应 UV (带半纹素内缩, 避免邻接纹理渗透)
   * @param {number} tileIndex 贴图索引
   * @returns {{u0:number,v0:number,u1:number,v1:number}} UV 边界
   */
  _computeUV(tileIndex) {
    const col = tileIndex % TILES_PER_ROW;
    const row = Math.floor(tileIndex / TILES_PER_ROW);
    const totalWidth = TILES_PER_ROW * TILE_SIZE;
    const totalHeight = ATLAS_ROWS * TILE_SIZE;
    const inset = 0.5; // 半像素
    const u0 = (col * TILE_SIZE + inset) / totalWidth;
    const u1 = ((col + 1) * TILE_SIZE - inset) / totalWidth;
    // Three.js 纹理 V 轴向上, Canvas 向下, 这里翻转
    const v1 = 1 - (row * TILE_SIZE + inset) / totalHeight;
    const v0 = 1 - ((row + 1) * TILE_SIZE - inset) / totalHeight;
    return { u0, v0, u1, v1 };
  }

  /**
   * 获取贴图 UV
   * @param {number} tileIndex 贴图索引
   * @returns {{u0:number,v0:number,u1:number,v1:number}}
   */
  getUV(tileIndex) {
    const uv = this.uvMap.get(tileIndex);
    if (!uv) throw new Error(`未知贴图索引: ${tileIndex}`);
    return uv;
  }

  /**
   * 生成单贴图 UI 图标 canvas (放大版, 用于热键栏 / 背包 / 合成)
   *
   * 重要: 每次调用必须返回独立的 canvas 元素
   *   - DOM 中一个节点只能有一个父节点, 若多个槽位复用同一 canvas,
   *     后续 appendChild 会把 canvas 从前一个槽位移走, 导致 "每种方块只显示一个图标" 的 bug
   *   - 修复: iconCache 仅缓存 "源 canvas" 避免重复 drawImage 整张图集,
   *           每次返回源 canvas 的独立副本 (新 canvas + 复制内容)
   *
   * @param {number} tileIndex 贴图索引
   * @param {number} size 输出像素边长
   * @returns {HTMLCanvasElement} 独立的 canvas 元素 (可被自由 appendChild)
   */
  getIcon(tileIndex, size = 48) {
    // 缓存源 canvas (按 tileIndex+size 复合键, 避免不同尺寸互相覆盖)
    const cacheKey = tileIndex * 1000 + size;
    let src = this.iconCache.get(cacheKey);
    if (!src) {
      const col = tileIndex % TILES_PER_ROW;
      const row = Math.floor(tileIndex / TILES_PER_ROW);
      src = document.createElement('canvas');
      src.width = size;
      src.height = size;
      const ctx = src.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        this.canvas,
        col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE,
        0, 0, size, size
      );
      this.iconCache.set(cacheKey, src);
    }
    // 每次返回独立副本: 新建 canvas 并把源 canvas 内容复制过去
    // 这样多个槽位可同时持有自己的图标 canvas, 不会互相抢占父节点
    const clone = document.createElement('canvas');
    clone.width = size;
    clone.height = size;
    const cloneCtx = clone.getContext('2d');
    cloneCtx.imageSmoothingEnabled = false;
    cloneCtx.drawImage(src, 0, 0);
    return clone;
  }
}
