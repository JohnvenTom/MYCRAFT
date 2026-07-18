/**
 * @file 生物模型工厂
 * @description 用 BoxGeometry 程序化构建 Minecraft 风格的方块状生物模型
 *              所有模型不带骨骼动画, 仅通过整体旋转/位置表达朝向 (简化)
 *              每种生物返回 { group, animations } - animations 为可选的腿部摆动函数
 */

import * as THREE from 'three';

/**
 * 创建带颜色的 MeshLambertMaterial
 * @param {number} color 0xRRGGBB
 * @returns {THREE.MeshLambertMaterial}
 */
function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

/**
 * 创建方块 mesh
 * @param {number} w 宽
 * @param {number} h 高
 * @param {number} d 深
 * @param {number} color 颜色
 * @param {number} x 中心 X
 * @param {number} y 中心 Y
 * @param {number} z 中心 Z
 * @returns {THREE.Mesh}
 */
function box(w, h, d, color, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * 牛模型 (黑白色块状)
 * @returns {THREE.Group}
 */
export function createCowModel() {
  const g = new THREE.Group();
  // 身体 (白色)
  const body = box(0.9, 0.7, 1.3, 0xe8e0d0, 0, 0.65, 0);
  g.add(body);
  // 黑色斑块
  g.add(box(0.2, 0.4, 0.2, 0x222222, 0.3, 0.65, 0.4));
  g.add(box(0.3, 0.3, 0.3, 0x222222, -0.2, 0.65, -0.3));
  // 头
  const head = box(0.5, 0.5, 0.5, 0xe8e0d0, 0, 0.95, 0.85);
  g.add(head);
  // 角 (黑色)
  g.add(box(0.08, 0.18, 0.08, 0x222222, -0.25, 1.25, 0.85));
  g.add(box(0.08, 0.18, 0.08, 0x222222, 0.25, 1.25, 0.85));
  // 腿 (4 条)
  g.add(box(0.25, 0.5, 0.25, 0x222222, -0.3, 0.15, 0.4));
  g.add(box(0.25, 0.5, 0.25, 0x222222, 0.3, 0.15, 0.4));
  g.add(box(0.25, 0.5, 0.25, 0x222222, -0.3, 0.15, -0.4));
  g.add(box(0.25, 0.5, 0.25, 0x222222, 0.3, 0.15, -0.4));
  return g;
}

/**
 * 猪模型 (粉红色)
 * @returns {THREE.Group}
 */
export function createPigModel() {
  const g = new THREE.Group();
  // 身体
  g.add(box(0.8, 0.6, 1.1, 0xee9999, 0, 0.6, 0));
  // 头
  g.add(box(0.5, 0.45, 0.45, 0xee9999, 0, 0.65, 0.7));
  // 鼻子 (深粉)
  g.add(box(0.25, 0.2, 0.1, 0xcc7777, 0, 0.6, 0.95));
  // 腿
  g.add(box(0.22, 0.4, 0.22, 0xcc7777, -0.25, 0.1, 0.35));
  g.add(box(0.22, 0.4, 0.22, 0xcc7777, 0.25, 0.1, 0.35));
  g.add(box(0.22, 0.4, 0.22, 0xcc7777, -0.25, 0.1, -0.35));
  g.add(box(0.22, 0.4, 0.22, 0xcc7777, 0.25, 0.1, -0.35));
  return g;
}

/**
 * 羊模型 (白色蓬松)
 * @returns {THREE.Group}
 */
export function createSheepModel() {
  const g = new THREE.Group();
  // 身体 (蓬松的白色)
  g.add(box(0.85, 0.85, 1.15, 0xeeeedd, 0, 0.7, 0));
  // 头 (灰白)
  g.add(box(0.45, 0.45, 0.45, 0xddddcc, 0, 0.85, 0.75));
  // 腿 (深色)
  g.add(box(0.2, 0.4, 0.2, 0x333333, -0.25, 0.1, 0.35));
  g.add(box(0.2, 0.4, 0.2, 0x333333, 0.25, 0.1, 0.35));
  g.add(box(0.2, 0.4, 0.2, 0x333333, -0.25, 0.1, -0.35));
  g.add(box(0.2, 0.4, 0.2, 0x333333, 0.25, 0.1, -0.35));
  return g;
}

/**
 * 鸡模型 (小, 黄色)
 * @returns {THREE.Group}
 */
export function createChickenModel() {
  const g = new THREE.Group();
  // 身体
  g.add(box(0.4, 0.4, 0.5, 0xf0f0f0, 0, 0.45, 0));
  // 头
  g.add(box(0.25, 0.25, 0.25, 0xf0f0f0, 0, 0.7, 0.25));
  // 喙 (黄色)
  g.add(box(0.1, 0.08, 0.1, 0xffaa00, 0, 0.65, 0.4));
  // 鸡冠 (红色)
  g.add(box(0.15, 0.08, 0.08, 0xcc0000, 0, 0.85, 0.2));
  // 腿 (黄色)
  g.add(box(0.08, 0.25, 0.08, 0xffaa00, -0.1, 0.1, 0));
  g.add(box(0.08, 0.25, 0.08, 0xffaa00, 0.1, 0.1, 0));
  return g;
}

/**
 * 僵尸模型 (绿色, 类玩家形状)
 * @returns {THREE.Group}
 */
export function createZombieModel() {
  const g = new THREE.Group();
  // 身体 (蓝绿色衣服)
  g.add(box(0.5, 0.7, 0.3, 0x4455aa, 0, 1.05, 0));
  // 头 (绿色)
  g.add(box(0.5, 0.5, 0.5, 0x447733, 0, 1.55, 0));
  // 眼睛 (黑色)
  g.add(box(0.1, 0.1, 0.05, 0x000000, -0.12, 1.6, 0.25));
  g.add(box(0.1, 0.1, 0.05, 0x000000, 0.12, 1.6, 0.25));
  // 手臂 (前伸)
  g.add(box(0.2, 0.6, 0.2, 0x447733, -0.4, 1.05, 0.3));
  g.add(box(0.2, 0.6, 0.2, 0x447733, 0.4, 1.05, 0.3));
  // 腿 (蓝色裤子)
  g.add(box(0.22, 0.7, 0.22, 0x223388, -0.13, 0.35, 0));
  g.add(box(0.22, 0.7, 0.22, 0x223388, 0.13, 0.35, 0));
  return g;
}

/**
 * 蜘蛛模型 (黑色, 8 腿)
 * @returns {THREE.Group}
 */
export function createSpiderModel() {
  const g = new THREE.Group();
  // 身体 (两段)
  g.add(box(0.7, 0.5, 0.7, 0x221111, 0, 0.4, 0.3));
  g.add(box(0.5, 0.4, 0.5, 0x331111, 0, 0.4, -0.4));
  // 头
  g.add(box(0.3, 0.3, 0.3, 0x331111, 0, 0.4, 0.7));
  // 眼睛 (红色)
  g.add(box(0.06, 0.06, 0.05, 0xff0000, -0.08, 0.45, 0.85));
  g.add(box(0.06, 0.06, 0.05, 0xff0000, 0.08, 0.45, 0.85));
  // 8 条腿 (左右各 4)
  const legPositions = [
    [-0.5, 0.6], [-0.55, 0.2], [-0.55, -0.2], [-0.5, -0.6],
    [0.5, 0.6], [0.55, 0.2], [0.55, -0.2], [0.5, -0.6],
  ];
  for (const [x, z] of legPositions) {
    g.add(box(0.1, 0.1, 0.7, 0x110000, x, 0.2, z));
  }
  return g;
}
