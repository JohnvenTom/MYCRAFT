/**
 * @file 全局配置常量
 * @description 定义游戏所有可调参数：区块尺寸、物理、玩家、渲染、昼夜
 */

/** 区块水平尺寸 (X/Z 方向格子数) */
export const CHUNK_SIZE = 16;

/** 区块最大高度 (Y 方向格子数, Minecraft 原版为 256) */
export const CHUNK_HEIGHT = 256;

/** 默认渲染距离 (区块数, 半径) */
export const RENDER_DISTANCE = 8;

/** 方块边长 (米) */
export const BLOCK_SIZE = 1;

/** 重力加速度 (m/s^2, Minecraft 原版约 32) */
export const GRAVITY = 32;

/** 玩家行走速度 (m/s, 原版 4.317) */
export const WALK_SPEED = 4.317;

/** 玩家冲刺速度 (m/s, 原版 5.6) */
export const SPRINT_SPEED = 5.6;

/** 创造模式飞行速度 (m/s) */
export const FLY_SPEED = 11.0;

/** 蹲下时速度倍率 */
export const SNEAK_MULTIPLIER = 0.3;

/** 跳跃初速度 (m/s, 原版约 8.4) */
export const JUMP_VELOCITY = 8.4;

/** 玩家身体宽度 (米, AABB X/Z 尺寸) */
export const PLAYER_WIDTH = 0.6;

/** 玩家身体高度 (米, AABB Y 尺寸) */
export const PLAYER_HEIGHT = 1.8;

/** 玩家眼睛距脚底高度 (米) */
export const PLAYER_EYE = 1.62;

/** 玩家交互距离 (米, 原版创造 5, 生存 4.5) */
export const REACH_DISTANCE = 5;

/** 水平面 (Y), 海平面高度 */
export const SEA_LEVEL = 64;

/** 一天总时长 (秒, 真实时间) */
export const DAY_LENGTH = 600;

/** 摄像机视场角 (度) */
export const CAMERA_FOV = 70;

/** 摄像机近裁剪面 */
export const CAMERA_NEAR = 0.1;

/** 摄像机远裁剪面 */
export const CAMERA_FAR = 1000;

/** 默认鼠标灵敏度 */
export const DEFAULT_SENSITIVITY = 1.0;

/** 鼠标灵敏度范围 */
export const SENSITIVITY_RANGE = { min: 0.1, max: 3.0 };

/** 渲染距离范围 */
export const RENDER_DISTANCE_RANGE = { min: 2, max: 16 };

/** IndexedDB 数据库名 */
export const DB_NAME = 'mycraft';

/** IndexedDB 版本 */
export const DB_VERSION = 1;

/** 世界数据存储 key */
export const WORLD_META_KEY = 'world';

/** 热键栏槽位数量 */
export const HOTBAR_SIZE = 9;

/** 破坏方块基础时间倍率 (秒/硬度) */
export const BREAK_TIME_PER_HARDNESS = 1.5;
