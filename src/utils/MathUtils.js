/**
 * @file 数学/坐标工具函数
 * @description 区块坐标转换、种子哈希、线性插值、钳位等
 */

import * as THREE from 'three';

/**
 * 将世界 X 坐标转换为区块 X 坐标
 * @param {number} x 世界 X 坐标
 * @returns {number} 区块 X 索引
 */
export function worldToChunkX(x, chunkSize) {
  return Math.floor(x / chunkSize);
}

/**
 * 将世界 Z 坐标转换为区块 Z 坐标
 * @param {number} z 世界 Z 坐标
 * @returns {number} 区块 Z 索引
 */
export function worldToChunkZ(z, chunkSize) {
  return Math.floor(z / chunkSize);
}

/**
 * 世界坐标转区块内局部坐标
 * @param {number} v 世界坐标分量
 * @param {number} chunkSize 区块尺寸
 * @returns {number} 局部坐标 [0, chunkSize)
 */
export function worldToLocal(v, chunkSize) {
  const m = ((v % chunkSize) + chunkSize) % chunkSize;
  return m;
}

/**
 * 将任意字符串种子转为 32 位整数种子
 * @param {string|number} seed 输入种子
 * @returns {number} 32 位无符号整数种子
 */
export function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed | 0;
  }
  const str = String(seed || '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 线性插值
 * @param {number} a 起点
 * @param {number} b 终点
 * @param {number} t 插值因子 [0,1]
 * @returns {number} 插值结果
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * 钳位
 * @param {number} v 输入值
 * @param {number} min 下限
 * @param {number} max 上限
 * @returns {number} 钳位后的值
 */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/**
 * 平滑插值 (smoothstep)
 * @param {number} t 输入 [0,1]
 * @returns {number} 平滑后的值
 */
export function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * 计算两点距离平方 (省一次 sqrt)
 * @param {number} ax 起点X
 * @param {number} ay 起点Y
 * @param {number} az 起点Z
 * @param {number} bx 终点X
 * @param {number} by 终点Y
 * @param {number} bz 终点Z
 * @returns {number} 距离平方
 */
export function distanceSquared3(ax, ay, az, bx, by, bz) {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * 把 THREE.Vector3 的角度规范化为 yaw/pitch
 * @param {THREE.Vector3} dir 方向向量
 * @returns {{yaw:number, pitch:number}} yaw (绕Y, 弧度), pitch (俯仰, 弧度)
 */
export function dirToYawPitch(dir) {
  const yaw = Math.atan2(-dir.x, -dir.z);
  const pitch = Math.asin(clamp(dir.y, -1, 1));
  return { yaw, pitch };
}

/**
 * 角度差归一化到 [-PI, PI]
 * @param {number} a 角度差
 * @returns {number} 归一化角度
 */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * 生成随机浮点数 [min, max) 基于种子
 * 注意: 非加密安全, 仅用于游戏
 * @param {number} seed 种子
 * @param {number} min 下限
 * @param {number} max 上限
 * @returns {number} 随机数
 */
export function seededRandom(seed, min = 0, max = 1) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  const r = x - Math.floor(x);
  return min + r * (max - min);
}

/**
 * 把 RGB 0-255 颜色转为 THREE.Color
 * @param {number} r 红 0-255
 * @param {number} g 绿 0-255
 * @param {number} b 蓝 0-255
 * @returns {THREE.Color}
 */
export function rgb(r, g, b) {
  return new THREE.Color(r / 255, g / 255, b / 255);
}
