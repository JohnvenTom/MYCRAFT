/**
 * @file MYCRAFT 入口
 * @description 装配引擎、世界、玩家、UI; 管理 游戏状态机 (菜单 → 加载 → 游戏中 → 暂停)
 *              处理新建/加载/保存/退出世界; 驱动每帧更新
 */

import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { PostProcessing } from './core/PostProcessing.js';
import { TextureAtlas } from './utils/TextureAtlas.js';
import { World } from './game/world/World.js';
import { Chunk } from './game/world/Chunk.js';
import { Player, GameMode } from './game/player/Player.js';
import { Physics } from './game/player/Physics.js';
import { Controller } from './game/player/Controller.js';
import { BlockInteraction } from './game/blocks/BlockInteraction.js';
import { Highlight } from './game/blocks/Highlight.js';
import { Hotbar } from './ui/Hotbar.js';
import { HUD } from './ui/HUD.js';
import { MainMenu } from './ui/MainMenu.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { Sky } from './game/sky/Sky.js';
import { DayNightCycle } from './game/sky/DayNightCycle.js';
import { AudioManager } from './game/audio/AudioManager.js';
import * as Storage from './utils/Storage.js';
import { hashSeed, worldToChunkX, worldToChunkZ } from './utils/MathUtils.js';
import {
  RENDER_DISTANCE, CHUNK_SIZE, SEA_LEVEL, PLAYER_EYE,
  DEFAULT_SENSITIVITY, CAMERA_FOV,
} from './config/constants.js';
import { BlockId, getBlock } from './game/world/BlockType.js';

// P2/P3 新系统
import { Inventory } from './game/items/Inventory.js';
import { ItemStack } from './game/items/ItemStack.js';
import { InventoryUI } from './ui/InventoryUI.js';
import { MobPhysics, MobAI } from './game/entity/MobAI.js';
import { MobSpawner } from './game/entity/MobSpawner.js';
import { MultiplayerClient } from './game/net/MultiplayerClient.js';
import { ParticleSystem } from './game/entity/Particle.js';
import { BreakOverlay } from './game/blocks/BreakOverlay.js';

/* ==========================================================================
   像素风格状态图标 (心形 / 鸡腿) 的像素图定义
   'X' = 填充像素, '.' = 透明
   ========================================================================== */
/** 像素心 (8x8, 满心形状, 视觉重心在第 3-4 行) */
const HEART_PIXELS = [
  '.XX..XX.',
  'XXXXXXXX',
  'XXXXXXXX',
  'XXXXXXXX',
  '.XXXXXX.',
  '..XXXX..',
  '...XX...',
  '....X...',
];
/** 像素鸡腿 (8x8, 顶部加 1 行空白让视觉重心与心形对齐)
 *  肉团在左上, 骨头伸向右下 */
const DRUMSTICK_PIXELS = [
  '........', // 顶部留白, 与心形顶部凸起对齐
  '.XXXX...',
  'XXXXXX..',
  'XXXXXX..',
  '.XXXX...',
  '..XX....',
  '..XX....',
  '..XXX...',
];

/**
 * 生成像素风格 SVG 图标
 * @param {string[]} pixelMap 像素图 (字符串数组, 'X'=填充)
 * @param {string} color 填充颜色
 * @returns {string} inline SVG 字符串
 */
function pixelSvg(pixelMap, color) {
  const h = pixelMap.length;
  const w = pixelMap[0].length;
  let rects = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pixelMap[y][x] === 'X') {
        rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
      }
    }
  }
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

/** 游戏状态 */
const GameState = Object.freeze({
  BOOT: 'boot',
  MENU: 'menu',
  LOADING: 'loading',
  READY: 'ready',      // 加载完成, 等待点击进入
  PLAYING: 'playing',
  PAUSED: 'paused',
});

class Game {
  constructor() {
    this.state = GameState.BOOT;
    this.engine = null;
    this.atlas = null;
    this.world = null;
    this.player = null;
    this.physics = null;
    this.controller = null;
    this.interaction = null;
    this.highlight = null;
    this.hotbar = null;
    this.hud = null;
    this.sky = null;
    this.dayNight = null;
    this.audio = null;
    this.mainMenu = null;
    this.pauseMenu = null;

    // P2/P3 新系统
    this.inventory = null;
    this.inventoryUI = null;
    this.mobPhysics = null;
    this.mobAI = null;
    this.mobSpawner = null;
    this.net = null;
    /** 玩家生命值 (主循环维护) */
    this.playerHealth = 20;
    /** 玩家最大生命值 */
    this.playerMaxHealth = 20;
    /** 玩家饥饿值 (0..20) */
    this.playerHunger = 20;
    /** 玩家最大饥饿值 */
    this.playerMaxHunger = 20;
    /** 玩家饱和度 (吃饱程度, 优先消耗于饥饿值前, 简化为不实现) */
    this.hungerTimer = 0;
    /** 饥饿值消耗间隔 (秒, 每 30 秒消耗 1 点) */
    this.hungerDecayInterval = 30;
    /** 饥饿回血间隔 (秒, 每 4 秒回 1 血) */
    this.healthRegenInterval = 4;
    /** 饥饿掉血间隔 (秒, 每 4 秒掉 1 血, 饥饿值为 0 时) */
    this.starveInterval = 4;
    /** 上次受伤时间 (秒, 用于红屏闪烁) */
    this.lastHurtTime = 0;
    /** 受伤红屏持续时间 (秒) */
    this.hurtOverlayDuration = 0.4;
    /** 受伤红屏剩余时间 (秒, <=0 表示隐藏) */
    this.hurtOverlayTimer = 0;
    /** 累计游戏时间 (秒) */
    this.gameTime = 0;
    /** 玩家是否死亡 (用于锁定输入 + 显示死亡画面) */
    this.playerDead = false;
    /** 联机配置 (URL, 玩家名, 是否启用) */
    this.multiplayerOpts = null;

    /** 当前世界种子 (整数) */
    this.seed = 0;
    /** 设置 */
    this.settings = {
      renderDistance: RENDER_DISTANCE,
      sensitivity: DEFAULT_SENSITIVITY,
      volume: 0.5,
    };

    this._cacheDom();
  }

  /**
   * 缓存 DOM 元素引用
   */
  _cacheDom() {
    this.dom = {
      canvas: document.getElementById('game-canvas'),
      crosshair: document.getElementById('crosshair'),
      debugHud: document.getElementById('debug-hud'),
      hotbar: document.getElementById('hotbar'),
      blockName: document.getElementById('block-name'),
      loading: document.getElementById('loading-screen'),
      loadingText: document.getElementById('loading-text'),
      loadingProgress: document.getElementById('loading-progress'),
      mainMenu: document.getElementById('main-menu'),
      seedInput: document.getElementById('seed-input'),
      playBtn: document.getElementById('play-btn'),
      loadBtn: document.getElementById('load-btn'),
      deleteBtn: document.getElementById('delete-btn'),
      pauseMenu: document.getElementById('pause-menu'),
      renderDistance: document.getElementById('render-distance'),
      rdValue: document.getElementById('rd-value'),
      sensitivity: document.getElementById('sensitivity'),
      sensValue: document.getElementById('sens-value'),
      volume: document.getElementById('volume'),
      volValue: document.getElementById('vol-value'),
      resumeBtn: document.getElementById('resume-btn'),
      saveBtn: document.getElementById('save-btn'),
      quitBtn: document.getElementById('quit-btn'),
      // P2: 物品栏 + 合成 UI
      inventoryScreen: document.getElementById('inventory-screen'),
      craftingGrid: document.getElementById('crafting-grid'),
      craftingOutput: document.getElementById('crafting-output'),
      inventoryGrid: document.getElementById('inventory-grid'),
      inventoryHotbar: document.getElementById('inventory-hotbar'),
      // 视觉效果覆盖层 + UI
      waterOverlay: document.getElementById('water-overlay'),
      hurtOverlay: document.getElementById('hurt-overlay'),
      statusBar: document.getElementById('status-bar'),
      healthRow: document.getElementById('health-row'),
      hungerRow: document.getElementById('hunger-row'),
      deathScreen: document.getElementById('death-screen'),
      respawnBtn: document.getElementById('respawn-btn'),
    };
  }

  /**
   * 启动游戏: 生成纹理 → 显示主菜单
   */
  async start() {
    // 隐藏 canvas 直到进入游戏 (避免初始黑屏闪烁)
    this.dom.canvas.style.display = 'none';

    // 1. 生成纹理图集
    this.atlas = new TextureAtlas();
    await this.atlas.generate();

    // 2. 创建引擎 (但不 start 主循环)
    this.engine = new Engine(this.dom.canvas);

    // 3. 音频
    this.audio = new AudioManager();
    this.audio.setVolume(this.settings.volume);

    // 4. HUD
    this.hud = new HUD(this.dom.debugHud);

    // 5. 主菜单
    this.mainMenu = new MainMenu({
      root: this.dom.mainMenu,
      seedInput: this.dom.seedInput,
      playBtn: this.dom.playBtn,
      loadBtn: this.dom.loadBtn,
      deleteBtn: this.dom.deleteBtn,
    });
    this.mainMenu.onPlay = (seedStr) => this._newGame(seedStr);
    this.mainMenu.onLoad = () => this._loadGame();
    this.mainMenu.onDelete = () => this._deleteSave();

    // 6. 暂停菜单
    this.pauseMenu = new PauseMenu({
      root: this.dom.pauseMenu,
      renderDistance: this.dom.renderDistance,
      rdValue: this.dom.rdValue,
      sensitivity: this.dom.sensitivity,
      sensValue: this.dom.sensValue,
      volume: this.dom.volume,
      volValue: this.dom.volValue,
      resumeBtn: this.dom.resumeBtn,
      saveBtn: this.dom.saveBtn,
      quitBtn: this.dom.quitBtn,
    });
    this.pauseMenu.applySettings(this.settings);
    this.pauseMenu.onResume = () => this._resume();
    this.pauseMenu.onSave = () => this._saveGame();
    this.pauseMenu.onQuit = () => this._quitToMenu();
    this.pauseMenu.onSettingChange = (k, v) => this._applySetting(k, v);

    // 7. ESC: 优先关闭物品栏, 否则切换暂停
    this.engine.input.onEscape(() => {
      if (this.inventoryUI && this.inventoryUI.open) {
        this._closeInventory();
        return;
      }
      if (this.state === GameState.PLAYING) this._pause();
      else if (this.state === GameState.PAUSED) this._resume();
    });

    // 8. 引擎主循环回调
    this.engine.onUpdate = (dt) => this._update(dt);

    // 隐藏 loading, 显示主菜单
    this.dom.loading.classList.add('hidden');
    const hasSave = await Storage.hasSave();
    this.mainMenu.show(hasSave);
    this.state = GameState.MENU;
  }

  /* ========================================================================
     世界创建 / 加载 / 保存
     ======================================================================== */

  /**
   * 新建世界
   * @param {string} seedStr 种子字符串
   */
  async _newGame(seedStr) {
    this.seed = hashSeed(seedStr || Date.now());
    this._isFreshWorld = true;
    await this._enterGame();
  }

  /**
   * 加载已存世界
   */
  async _loadGame() {
    const meta = await Storage.loadMeta();
    if (!meta) {
      alert('未找到存档');
      return;
    }
    this.seed = meta.seed >>> 0;
    this._isFreshWorld = false;
    this._savedMeta = meta;
    await this._enterGame();
  }

  /**
   * 删除存档
   */
  async _deleteSave() {
    if (!confirm('确定删除存档? 此操作不可恢复')) return;
    await Storage.clearAll();
    this.mainMenu.show(false);
  }

  /**
   * 进入游戏 (新建或加载): 显示 loading → 生成世界与出生点 → 等待点击 → 开始
   */
  async _enterGame() {
    this.mainMenu.hide();
    this.dom.loading.classList.remove('hidden');
    this.dom.loadingText.textContent = '生成世界中...';
    this.dom.loadingProgress.style.width = '0%';
    this.state = GameState.LOADING;

    // 初始化音频 (用户手势内)
    this.audio.init();

    // 创建世界
    this.world = new World({
      seed: this.seed,
      scene: this.engine.scene,
      atlas: this.atlas,
      renderDistance: this.settings.renderDistance,
    });
    this.engine.setFog(new THREE.Color(0xc8e8ff), 20, (this.settings.renderDistance - 1) * CHUNK_SIZE);

    // 生成天空与昼夜
    this.sky = new Sky(this.engine.scene);
    // 高级光影: 创建后处理系统 (Bloom + ToneMapping + FXAA + 颜色分级)
    this.postFX = new PostProcessing({
      renderer: this.engine.renderer,
      scene: this.engine.scene,
      camera: this.engine.camera,
    });
    this.engine.setPostProcessing(this.postFX);
    this.dayNight = new DayNightCycle({
      scene: this.engine.scene,
      camera: this.engine.camera,
      sky: this.sky,
      postFX: this.postFX,
    });

    // 加载存档区块 (如有)
    if (!this._isFreshWorld) {
      this.dom.loadingText.textContent = '加载区块中...';
      await this._loadAllSavedChunks();
    }

    // 同步生成出生点附近区块 (确保玩家不悬空)
    this.dom.loadingText.textContent = '生成地形中...';
    this.dom.loadingProgress.style.width = '30%';
    await this._generateSpawnArea();

    // 放置玩家
    this.player = new Player(this.engine.camera);
    if (!this._isFreshWorld && this._savedMeta && this._savedMeta.playerPos) {
      this.player.setPosition(
        this._savedMeta.playerPos[0],
        this._savedMeta.playerPos[1],
        this._savedMeta.playerPos[2]
      );
      this.player.setRotation(this._savedMeta.playerRot[0], this._savedMeta.playerRot[1]);
      this.player.gameMode = this._savedMeta.gameMode || GameMode.SURVIVAL;
    } else {
      const spawnY = this.world.getHighestY(0, 0) + 2;
      this.player.setPosition(0.5, spawnY, 0.5);
    }
    if (this._savedMeta && this._savedMeta.time != null) {
      this.dayNight.setTime(this._savedMeta.time);
    }

    // 物理与控制器
    this.physics = new Physics(this.world);
    this.controller = new Controller(this.player, this.engine.input, this.physics);

    // 物品栏 (生存模式必备)
    this.inventory = new Inventory();
    if (!this._isFreshWorld && this._savedMeta && this._savedMeta.inventory) {
      // 加载存档物品栏
      this.inventory.deserialize(this._savedMeta.inventory);
      this.inventory.selected = this._savedMeta.selectedSlot || 0;
    } else {
      // 新世界: 给玩家一些起始物资 (便于测试合成系统)
      this._setupStartingInventory();
    }
    if (this._savedMeta && this._savedMeta.playerHealth != null) {
      this.playerHealth = this._savedMeta.playerHealth;
    }
    if (this._savedMeta && this._savedMeta.playerHunger != null) {
      this.playerHunger = this._savedMeta.playerHunger;
    }

    // 高亮 + 热键栏 + 生物系统 + 联机
    this.highlight = new Highlight(this.engine.scene);
    this.hotbar = new Hotbar(
      this.atlas, this.engine.input, this.dom.hotbar, this.dom.blockName, this.inventory
    );
    // 破坏裂缝覆盖层 (在 atlas 生成之后创建, 复用 atlas 纹理采样破坏阶段贴图)
    this.breakOverlay = new BreakOverlay(this.engine.scene, this.atlas.texture);
    this.mobPhysics = new MobPhysics(this.world);
    this.mobAI = new MobAI();
    this.mobSpawner = new MobSpawner({
      world: this.world,
      scene: this.engine.scene,
    });
    // 粒子系统 (死亡烟雾 / 受击血溅 / 方块破坏飞溅)
    this.particles = new ParticleSystem(this.engine.scene);

    // 多人联机 (可选)
    if (this.multiplayerOpts) {
      this.net = new MultiplayerClient({
        scene: this.engine.scene,
        world: this.world,
        callbacks: {
          onChat: (name, text) => console.log(`[聊天] ${name}: ${text}`),
          onPlayerJoin: (name) => console.log(`[联机] ${name} 加入了世界`),
          onPlayerLeave: (name) => console.log(`[联机] ${name} 离开了世界`),
        },
      });
      try {
        await this.net.connect(this.multiplayerOpts.url, this.multiplayerOpts.name, this.seed);
        console.log('[联机] 已连接:', this.multiplayerOpts.url);
      } catch (e) {
        console.warn('[联机] 连接失败, 进入单机模式:', e.message);
        this.net = null;
      }
    }

    this.interaction = new BlockInteraction({
      world: this.world,
      player: this.player,
      input: this.engine.input,
      highlight: this.highlight,
      hotbar: this.hotbar,
      audio: this.audio,
      inventory: this.inventory,
      mobSpawner: this.mobSpawner,
      net: this.net,
      // 工作台交互回调: 右键工作台时打开 3x3 合成 UI
      onUseWorkbench: () => this._openInventory(true),
      // 破坏裂缝覆盖层: 显示挖掘进度 (像素裂缝贴图叠加在被破坏的方块上)
      breakOverlay: this.breakOverlay,
      // 粒子系统: 方块破坏时产生像素飞屑
      particles: this.particles,
      // 纹理图集: 用于查询方块代表色 (粒子着色)
      atlas: this.atlas,
    });

    // 物品栏 + 合成 UI
    this.inventoryUI = new InventoryUI({
      inventory: this.inventory,
      atlas: this.atlas,
      root: this.dom.inventoryScreen,
      craftingGrid: this.dom.craftingGrid,
      craftingOutput: this.dom.craftingOutput,
      inventoryGrid: this.dom.inventoryGrid,
      inventoryHotbar: this.dom.inventoryHotbar,
    });

    // loading 完成, 等待点击
    this.dom.loadingProgress.style.width = '100%';
    this.dom.loadingText.textContent = '点击进入世界';
    this.state = GameState.READY;
    // loading 屏变可点击
    this.dom.loading.onclick = () => this._beginPlay();
  }

  /**
   * 同步生成出生点 3×3 区块 (玩家所在 + 周围一圈), 并立即构建网格
   */
  async _generateSpawnArea() {
    const pcx = worldToChunkX(0, CHUNK_SIZE);
    const pcz = worldToChunkZ(0, CHUNK_SIZE);
    const range = 1;
    for (let dz = -range; dz <= range; dz++) {
      for (let dx = -range; dx <= range; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const chunk = new Chunk(cx, cz);
        this.world.chunks.set(`${cx},${cz}`, chunk);
        this.world.terrain.generate(chunk);
        chunk.generated = true;
        chunk.loaded = true;
      }
    }
    // 全部生成后再统一构建网格 (此时跨区块邻居查询可命中)
    for (const chunk of this.world.chunks.values()) {
      this.world._rebuildChunkMesh(chunk);
    }
    this.dom.loadingProgress.style.width = '70%';
    await new Promise((r) => setTimeout(r, 30));
  }

  /**
   * 加载存档中出生点附近 5×5 区块 (其余在玩家移动时按需加载)
   */
  async _loadAllSavedChunks() {
    const pcx = worldToChunkX(0, CHUNK_SIZE);
    const pcz = worldToChunkZ(0, CHUNK_SIZE);
    const range = 2;
    for (let dz = -range; dz <= range; dz++) {
      for (let dx = -range; dx <= range; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const data = await Storage.loadChunk(cx, cz);
        if (!data) continue;
        const chunk = new Chunk(cx, cz);
        chunk.deserialize(data);
        this.world.chunks.set(`${cx},${cz}`, chunk);
      }
    }
    this.dom.loadingProgress.style.width = '40%';
  }

  /**
   * 初始化新世界的起始物品栏 (前 9 格热键栏 + 一些背包物资, 便于测试合成系统)
   * 调整: 工作台改为玩家用 4 个木板在 2x2 物品栏合成 (不再直接给)
   *       新增圆石用于合成石质工具
   */
  _setupStartingInventory() {
    // 热键栏 (0-8)
    this.inventory.setSlot(0, new ItemStack(BlockId.GRASS, 64));
    this.inventory.setSlot(1, new ItemStack(BlockId.DIRT, 64));
    this.inventory.setSlot(2, new ItemStack(BlockId.STONE, 64));
    this.inventory.setSlot(3, new ItemStack(BlockId.LOG, 32));
    this.inventory.setSlot(4, new ItemStack(BlockId.PLANKS, 32));
    this.inventory.setSlot(5, new ItemStack(BlockId.GLASS, 16));
    this.inventory.setSlot(6, new ItemStack(BlockId.WOOD_PICKAXE, 1));
    this.inventory.setSlot(7, new ItemStack(BlockId.WOOD_AXE, 1));
    this.inventory.setSlot(8, new ItemStack(BlockId.WOOD_SWORD, 1));
    // 背包 (9-35) - 工作台需玩家用 4 个木板在 2x2 物品栏合成 (配方 crafting_table)
    this.inventory.setSlot(9, new ItemStack(BlockId.FURNACE, 4));
    this.inventory.setSlot(10, new ItemStack(BlockId.STICK_BLOCK, 16));
    this.inventory.setSlot(11, new ItemStack(BlockId.COAL_ORE, 16));
    this.inventory.setSlot(12, new ItemStack(BlockId.IRON_ORE, 8));
    this.inventory.setSlot(13, new ItemStack(BlockId.SAND, 16));
    this.inventory.setSlot(14, new ItemStack(BlockId.WOOD_SHOVEL, 1));
    this.inventory.setSlot(15, new ItemStack(BlockId.COBBLESTONE, 32)); // 用于合成石质工具
  }

  /**
   * 打开物品栏 (E 键 / 右键工作台)
   * @param {boolean} [useTable=false] 是否使用 3x3 工作台合成区
   */
  _openInventory(useTable = false) {
    if (!this.inventoryUI) return;
    if (this.inventoryUI.open) return;
    this.inventoryUI.openInventory(useTable);
    this.engine.input.exitPointerLock();
  }

  /**
   * 关闭物品栏, 重新请求指针锁
   */
  _closeInventory() {
    if (!this.inventoryUI || !this.inventoryUI.open) return;
    this.inventoryUI.closeInventory();
    this.hotbar.markDirty();
    // 重新请求指针锁 (仅游戏中)
    if (this.state === GameState.PLAYING) {
      this.engine.input.requestPointerLock();
    }
  }

  /**
   * 切换物品栏开关
   * @param {boolean} [useTable=false]
   */
  _toggleInventory(useTable = false) {
    if (this.inventoryUI && this.inventoryUI.open) this._closeInventory();
    else this._openInventory(useTable);
  }

  /**
   * 玩家受伤回调 (由 MobAI 调用)
   * 修复: 添加受伤红屏反馈 + 死亡画面 + 击退效果 + 血溅粒子
   * @param {number} amount 伤害值
   * @param {THREE.Vector3} [fromPos] 攻击者位置 (用于计算击退方向)
   */
  _onPlayerDamaged(amount, fromPos) {
    if (this.player.gameMode === GameMode.CREATIVE) return;
    if (this.playerDead) return; // 已死亡不再受伤
    this.playerHealth = Math.max(0, this.playerHealth - amount);
    this.lastHurtTime = this.gameTime;
    // 触发红屏覆盖层
    this.hurtOverlayTimer = this.hurtOverlayDuration;
    if (this.dom.hurtOverlay) this.dom.hurtOverlay.classList.add('active');
    if (this.audio) this.audio.play('stone');
    // 血溅粒子 (玩家中心位置)
    if (this.particles) {
      const center = new THREE.Vector3(
        this.player.position.x,
        this.player.position.y + this.player.height / 2,
        this.player.position.z
      );
      this.particles.spawnHurtBlood(center, 10);
    }
    // 击退: 从攻击者方向推向玩家, 向上抛一点
    if (fromPos) {
      const dx = this.player.position.x - fromPos.x;
      const dz = this.player.position.z - fromPos.z;
      const len = Math.hypot(dx, dz) || 1;
      this.player.velocity.x = (dx / len) * 6;
      this.player.velocity.z = (dz / len) * 6;
      this.player.velocity.y = 4;
    }
    if (this.playerHealth <= 0) {
      this._showDeathScreen();
    }
  }

  /**
   * 显示死亡画面 + 锁定玩家输入 + 生成死亡烟雾粒子
   */
  _showDeathScreen() {
    this.playerDead = true;
    this.player.velocity.set(0, 0, 0);
    // 生成死亡烟雾粒子 (玩家中心位置, 灰色)
    if (this.particles) {
      const center = new THREE.Vector3(
        this.player.position.x,
        this.player.position.y + this.player.height / 2,
        this.player.position.z
      );
      this.particles.spawnDeathSmoke(center, 32, 0xffffff);
    }
    if (this.engine.input.pointerLocked) this.engine.input.exitPointerLock();
    if (this.dom.deathScreen) this.dom.deathScreen.classList.remove('hidden');
    console.log('[玩家] 死亡');
  }

  /**
   * 玩家死亡后重生 (传送到出生点 + 重置生命值/饥饿值 + 隐藏死亡画面)
   */
  _respawnPlayer() {
    const spawnY = this.world.getHighestY(0, 0) + 2;
    this.player.setPosition(0.5, spawnY, 0.5);
    this.player.velocity.set(0, 0, 0);
    this.playerHealth = this.playerMaxHealth;
    this.playerHunger = this.playerMaxHunger;
    this.playerDead = false;
    this.hurtOverlayTimer = 0;
    if (this.dom.hurtOverlay) this.dom.hurtOverlay.classList.remove('active');
    if (this.dom.deathScreen) this.dom.deathScreen.classList.add('hidden');
    // 重新请求指针锁
    if (this.state === GameState.PLAYING) this.engine.input.requestPointerLock();
    console.log('[玩家] 已重生');
  }

  /**
   * 开始游戏: 隐藏 loading, 显示 canvas + HUD, 请求指针锁, 启动主循环
   */
  _beginPlay() {
    this.dom.loading.onclick = null;
    this.dom.loading.classList.add('hidden');
    this.dom.canvas.style.display = 'block';
    // 显式 resize, 确保 canvas 尺寸正确 (从 display:none 切到 block 后)
    this.engine.resize();
    this.dom.crosshair.style.display = 'block';
    this.dom.debugHud.style.display = this.hud.visible ? 'block' : 'none';
    this.dom.hotbar.style.display = 'flex';
    this.dom.blockName.style.display = 'block';

    this.state = GameState.PLAYING;
    this.engine.input.sensitivity = this.settings.sensitivity;
    this.engine.input.requestPointerLock();
    this.engine.start();

    // 绑定重生按钮 (仅绑定一次)
    if (this.dom.respawnBtn && !this._respawnBound) {
      this.dom.respawnBtn.addEventListener('click', () => {
        if (this.playerDead) this._respawnPlayer();
      });
      this._respawnBound = true;
    }

    // 首帧先更新一次区块 (确保出生点周围加载)
    this.world.updateChunks(
      worldToChunkX(this.player.position.x, CHUNK_SIZE),
      worldToChunkZ(this.player.position.z, CHUNK_SIZE)
    );
  }

  /**
   * 暂停
   */
  _pause() {
    if (this.state !== GameState.PLAYING) return;
    // 关闭可能打开的物品栏
    if (this.inventoryUI && this.inventoryUI.open) this._closeInventory();
    this.state = GameState.PAUSED;
    this.engine.input.exitPointerLock();
    this.pauseMenu.show();
  }

  /**
   * 继续
   */
  _resume() {
    if (this.state !== GameState.PAUSED) return;
    this.pauseMenu.hide();
    this.engine.clock.reset();
    this.engine.input.requestPointerLock();
    this.state = GameState.PLAYING;
  }

  /**
   * 应用设置变化
   */
  _applySetting(key, value) {
    this.settings[key] = value;
    if (key === 'sensitivity') this.engine.input.sensitivity = value;
    if (key === 'volume') this.audio.setVolume(value);
    if (key === 'renderDistance' && this.world) {
      this.world.setRenderDistance(value);
      this.engine.setFog(new THREE.Color(0xc8e8ff), 20, (value - 1) * CHUNK_SIZE);
    }
  }

  /**
   * 保存世界 (写所有已加载区块 + 元信息)
   */
  async _saveGame() {
    if (!this.world || !this.player) return;
    this.pauseMenu.els.saveBtn.textContent = '保存中...';
    this.pauseMenu.els.saveBtn.disabled = true;
    try {
      // 保存所有已加载区块
      const tasks = [];
      for (const chunk of this.world.chunks.values()) {
        if (!chunk.generated) continue;
        tasks.push(Storage.saveChunk(chunk.cx, chunk.cz, chunk.serialize()));
      }
      await Promise.all(tasks);
      // 保存元信息
      await Storage.saveMeta({
        seed: this.seed,
        playerPos: [this.player.position.x, this.player.position.y, this.player.position.z],
        playerRot: [this.player.yaw, this.player.pitch],
        gameMode: this.player.gameMode,
        time: this.dayNight.time,
        settings: this.settings,
        // P2: 物品栏 + 玩家生命值 + 饥饿值
        inventory: this.inventory.serialize(),
        selectedSlot: this.inventory.selected,
        playerHealth: this.playerHealth,
        playerHunger: this.playerHunger,
      });
      this.pauseMenu.els.saveBtn.textContent = '已保存 ✓';
      setTimeout(() => {
        this.pauseMenu.els.saveBtn.textContent = '保存世界';
        this.pauseMenu.els.saveBtn.disabled = false;
      }, 1500);
    } catch (e) {
      console.error('保存失败:', e);
      this.pauseMenu.els.saveBtn.textContent = '保存失败';
      this.pauseMenu.els.saveBtn.disabled = false;
    }
  }

  /**
   * 退出到主菜单
   */
  async _quitToMenu() {
    if (this.state === GameState.PLAYING) this._pause();
    // 自动保存一次
    await this._saveGame();
    this.engine.stop();
    // 清理 P2/P3 新系统
    if (this.net) { this.net.disconnect(); this.net = null; }
    if (this.mobSpawner) { this.mobSpawner.dispose(); this.mobSpawner = null; }
    if (this.inventoryUI) {
      this.inventoryUI.closeInventory();
      this.inventoryUI = null;
    }
    this.inventory = null;
    this.mobPhysics = null;
    this.mobAI = null;
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
    if (this.highlight) { this.highlight.dispose(); this.highlight = null; }
    if (this.breakOverlay) { this.breakOverlay.dispose(); this.breakOverlay = null; }
    // 清场景中的非引擎对象 (天空/光照由 dayNight/sky 持有, 此处简化: 直接清场景子项)
    while (this.engine.scene.children.length > 0) {
      const obj = this.engine.scene.children[0];
      this.engine.scene.remove(obj);
    }
    this.player = null;
    this.physics = null;
    this.controller = null;
    this.interaction = null;
    this.hotbar = null;
    this.sky = null;
    this.dayNight = null;
    this._savedMeta = null;
    // 重置玩家状态
    this.playerHealth = this.playerMaxHealth;
    this.playerHunger = this.playerMaxHunger;
    this.playerDead = false;
    this.lastHurtTime = 0;
    this.gameTime = 0;
    this.hurtOverlayTimer = 0;
    this.hungerTimer = 0;
    this._healthRegenTimer = 0;
    this._starveTimer = 0;

    this.dom.canvas.style.display = 'none';
    this.dom.crosshair.style.display = 'none';
    this.dom.debugHud.style.display = 'none';
    this.dom.hotbar.style.display = 'none';
    this.dom.blockName.style.display = 'none';
    if (this.dom.inventoryScreen) this.dom.inventoryScreen.classList.add('hidden');
    // 隐藏所有覆盖层 + 死亡画面
    if (this.dom.waterOverlay) this.dom.waterOverlay.classList.remove('active');
    if (this.dom.hurtOverlay) this.dom.hurtOverlay.classList.remove('active');
    if (this.dom.deathScreen) this.dom.deathScreen.classList.add('hidden');
    if (this.dom.statusBar) this.dom.statusBar.style.display = 'none';
    // 销毁粒子系统
    if (this.particles) {
      this.particles.dispose();
      this.particles = null;
    }
    this.pauseMenu.hide();
    const hasSave = await Storage.hasSave();
    this.mainMenu.show(hasSave);
    this.state = GameState.MENU;
  }

  /* ========================================================================
     主循环更新
     ======================================================================== */

  /**
   * 每帧更新 (由 engine 调用)
   * 集成: 水下覆盖层 / 受伤红屏 / 饥饿值 / 心形鸡腿 UI / 死亡画面
   * @param {number} dt 帧间隔 (秒)
   */
  _update(dt) {
    if (this.state !== GameState.PLAYING) return;
    this.gameTime += dt;

    // F3 调试信息切换
    if (this.engine.input.isPressed('F3')) {
      this.hud.toggle();
    }

    // 受伤红屏倒计时 (即使死亡/打开物品栏也要倒计时)
    this._updateHurtOverlay(dt);

    // 玩家死亡: 只更新昼夜 + 生物 (生物仍可移动) + HUD + 状态栏, 锁定玩家输入
    if (this.playerDead) {
      this.dayNight.update(dt);
      if (this.mobSpawner) {
        const aiCtx = {
          world: this.world,
          player: this.player,
          physics: this.mobPhysics,
          ai: this.mobAI,
          dayNight: this.dayNight,
          particles: this.particles,
          onPlayerDamaged: () => {}, // 死亡期间不再受伤
        };
        this.mobSpawner.update(dt, aiCtx);
      }
      this._updateHud();
      this._updateStatusBar();
      this._updateWaterEffect();
      if (this.particles) this.particles.update(dt);
      return;
    }

    // E 键开关物品栏 (仅当未瞄准工作台时使用 2x2)
    if (this.engine.input.isPressed('KeyE')) {
      this._toggleInventory(false);
    }

    // 物品栏打开时: 仅推进昼夜/插值联机, 跳过游戏交互
    if (this.inventoryUI && this.inventoryUI.open) {
      this.dayNight.update(dt);
      if (this.net) this.net.update(dt);
      this._updateHud();
      this._updateStatusBar();
      this._updateWaterEffect();
      if (this.particles) this.particles.update(dt);
      return;
    }

    // 工作台交互已移到 BlockInteraction._handleUseBlock, 通过 onUseWorkbench 回调打开 3x3 UI

    // 玩家控制 + 物理 (固定步长子步, 避免高速穿墙)
    this.controller.update(dt);
    let fixedDt;
    let steps = 0;
    while ((fixedDt = this.engine.clock.consumeFixed()) && steps < 8) {
      this.physics.step(this.player, fixedDt);
      steps++;
    }

    // 区块流式加载 (按玩家位置) + LOD 透传
    const pcx = worldToChunkX(this.player.position.x, CHUNK_SIZE);
    const pcz = worldToChunkZ(this.player.position.z, CHUNK_SIZE);
    this.world.updateChunks(pcx, pcz);
    this.world.processBuildQueue(pcx, pcz);

    // 方块交互 (含生物攻击)
    this.interaction.update(dt);

    // 热键栏
    this.hotbar.update(dt);

    // 昼夜
    this.dayNight.update(dt);

    // 饥饿值系统 (消耗 + 回血/掉血)
    this._updateHunger(dt);

    // 生物生成与 AI
    if (this.mobSpawner) {
      const aiCtx = {
        world: this.world,
        player: this.player,
        physics: this.mobPhysics,
        ai: this.mobAI,
        dayNight: this.dayNight,
        particles: this.particles,
        onPlayerDamaged: (amt, fromPos) => this._onPlayerDamaged(amt, fromPos),
      };
      this.mobSpawner.update(dt, aiCtx);
    }

    // 多人联机: 远程玩家插值 + 发送本地位置
    if (this.net) {
      this.net.update(dt);
      this.net.sendPlayerMove(this.player.position, this.player.yaw, this.player.pitch);
    }

    // HUD 统计
    this._updateHud();
    // 视觉/状态 UI
    this._updateWaterEffect();
    this._updateStatusBar();
    // 粒子系统更新
    if (this.particles) this.particles.update(dt);
    // FOV 平滑过渡 (疾跑时变大)
    this._updateFov(dt);
  }

  /**
   * 更新摄像机 FOV (疾跑时从默认 70° 平滑过渡到 80°, 松开时回弹)
   * 视野变大会让疾跑显得更快 (视觉加速感)
   * @param {number} dt 帧间隔 (秒)
   */
  _updateFov(dt) {
    if (!this.player || !this.engine.camera) return;
    const targetFov = this.player.sprinting && this.player.gameMode !== GameMode.CREATIVE
      ? CAMERA_FOV + 10
      : CAMERA_FOV;
    const cam = this.engine.camera;
    // 平滑插值 (10倍速率, 约 100ms 过渡)
    cam.fov += (targetFov - cam.fov) * Math.min(1, 10 * dt);
    cam.updateProjectionMatrix();
  }

  /**
   * 更新水下视觉覆盖层 (眼睛在水下时显示蓝色滤镜)
   */
  _updateWaterEffect() {
    if (!this.dom.waterOverlay || !this.physics) return;
    const inWater = this.physics.isEyeInWater(this.player);
    this.dom.waterOverlay.classList.toggle('active', inWater);
  }

  /**
   * 更新受伤红屏覆盖层 (倒计时, 到 0 时隐藏)
   * @param {number} dt 帧间隔 (秒)
   */
  _updateHurtOverlay(dt) {
    if (this.hurtOverlayTimer <= 0) return;
    this.hurtOverlayTimer -= dt;
    if (this.hurtOverlayTimer <= 0) {
      this.hurtOverlayTimer = 0;
      if (this.dom.hurtOverlay) this.dom.hurtOverlay.classList.remove('active');
    }
  }

  /**
   * 饥饿值系统: 持续消耗; 饱满 (hunger >= 18) 且未满血时缓慢回血; 饥饿值为 0 时缓慢掉血
   * @param {number} dt 帧间隔 (秒)
   */
  _updateHunger(dt) {
    if (this.player.gameMode === GameMode.CREATIVE) return;
    // 1. 饥饿值缓慢消耗
    this.hungerTimer += dt;
    if (this.hungerTimer >= this.hungerDecayInterval) {
      this.hungerTimer -= this.hungerDecayInterval;
      if (this.playerHunger > 0) {
        this.playerHunger = Math.max(0, this.playerHunger - 1);
      }
    }
    // 2. 饱满回血 (hunger >= 18 且未满血)
    if (this.playerHunger >= 18 && this.playerHealth < this.playerMaxHealth) {
      this._healthRegenTimer = (this._healthRegenTimer || 0) + dt;
      if (this._healthRegenTimer >= this.healthRegenInterval) {
        this._healthRegenTimer = 0;
        this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + 1);
      }
    } else {
      this._healthRegenTimer = 0;
    }
    // 3. 饥饿掉血 (hunger === 0)
    if (this.playerHunger === 0) {
      this._starveTimer = (this._starveTimer || 0) + dt;
      if (this._starveTimer >= this.starveInterval) {
        this._starveTimer = 0;
        if (this.playerHealth > 1) {
          // 饥饿只能掉到 1 颗心 (原版机制, 简单实现)
          this._onPlayerDamaged(1);
        }
      }
    } else {
      this._starveTimer = 0;
    }
  }

  /**
   * 渲染生命值/饥饿值状态栏 (像素风 10 颗心 + 10 个鸡腿)
   * 1 颗心 = 2 血量; 1 个鸡腿 = 2 饥饿值
   * 满 = 完整图标; 半 = opacity 0.5; 空 = 深灰轮廓
   * 心行左对齐, 鸡腿行右对齐 (由 CSS .health-row/.hunger-row 控制)
   */
  _updateStatusBar() {
    if (!this.dom.healthRow || !this.dom.hungerRow) return;
    // 生存模式才显示
    const show = this.player && this.player.gameMode === GameMode.SURVIVAL;
    this.dom.statusBar.style.display = show ? 'flex' : 'none';
    if (!show) return;

    // 颜色定义
    const HEART_FULL = '#ff3b3b';   // 满心红
    const HEART_EMPTY = '#3a1a1a';  // 空心深红灰
    const HUNGER_FULL = '#c8742a';  // 满鸡腿棕
    const HUNGER_EMPTY = '#2a2a1a'; // 空鸡腿深棕灰

    // 渲染 10 颗心 (满/半/空)
    const fullHearts = Math.floor(this.playerHealth / 2);
    const hasHalfHeart = this.playerHealth % 2 === 1;
    let heartHtml = '';
    for (let i = 0; i < 10; i++) {
      let opacity = 1;
      let color = HEART_FULL;
      if (i < fullHearts) {
        // 满心
      } else if (i === fullHearts && hasHalfHeart) {
        opacity = 0.5; // 半心
      } else {
        color = HEART_EMPTY; // 空心
      }
      heartHtml += `<span class="status-icon" style="opacity:${opacity}">${pixelSvg(HEART_PIXELS, color)}</span>`;
    }
    this.dom.healthRow.innerHTML = heartHtml;

    // 渲染 10 个鸡腿 (满/半/空)
    const fullHunger = Math.floor(this.playerHunger / 2);
    const hasHalfHunger = this.playerHunger % 2 === 1;
    let hungerHtml = '';
    for (let i = 0; i < 10; i++) {
      let opacity = 1;
      let color = HUNGER_FULL;
      if (i < fullHunger) {
        // 满
      } else if (i === fullHunger && hasHalfHunger) {
        opacity = 0.5; // 半
      } else {
        color = HUNGER_EMPTY; // 空
      }
      hungerHtml += `<span class="status-icon" style="opacity:${opacity}">${pixelSvg(DRUMSTICK_PIXELS, color)}</span>`;
    }
    this.dom.hungerRow.innerHTML = hungerHtml;
  }

  /**
   * 更新 HUD 统计信息
   */
  _updateHud() {
    const p = this.player;
    let chunks = 0, faces = 0;
    for (const c of this.world.chunks.values()) {
      if (c.generated) chunks++;
      if (c.meshOpaque) faces += c.meshOpaque.geometry.index.count / 6;
      if (c.meshTransparent) faces += c.meshTransparent.geometry.index.count / 6;
    }
    let blockName = '—';
    if (this.interaction && this.interaction.currentHit) {
      const id = this.world.getBlock(
        this.interaction.currentHit.x,
        this.interaction.currentHit.y,
        this.interaction.currentHit.z
      );
      blockName = getBlock(id).name;
    }
    // 生物计数
    let mobCount = 0;
    if (this.mobSpawner) mobCount = this.mobSpawner.mobs.length;
    // 玩家计数
    let playerCount = 1;
    if (this.net && this.net.connected) playerCount += this.net.players.size;
    this.hud.updateStats({
      fps: this.engine.clock.fps,
      x: p.position.x, y: p.position.y, z: p.position.z,
      yaw: p.yaw, pitch: p.pitch,
      chunks, faces: Math.floor(faces),
      block: blockName,
      time: this.dayNight.getTimeString(),
      mode: p.gameMode,
      health: this.playerHealth,
      maxHealth: this.playerMaxHealth,
      mobs: mobCount,
      players: playerCount,
    });
  }
}

// 启动
const game = new Game();
// 调试暴露 (供控制台检查游戏状态, 生产环境可移除)
if (typeof window !== 'undefined') window.__game = game;
game.start().catch((e) => {
  console.error('MYCRAFT 启动失败:', e);
  const lt = document.getElementById('loading-text');
  if (lt) lt.textContent = '启动失败: ' + e.message;
});
