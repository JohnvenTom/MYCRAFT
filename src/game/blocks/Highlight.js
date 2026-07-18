/**
 * @file 选中方块高亮
 * @description 在玩家瞄准的方块周围绘制黑色线框, 提供视觉反馈
 */

import * as THREE from 'three';

export class Highlight {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
      depthTest: true,
    });
    this.mesh = new THREE.LineSegments(edges, mat);
    this.mesh.visible = false;
    scene.add(this.mesh);
    this._baseGeo = geo;
  }

  /**
   * 显示高亮在指定方块位置 (方块中心 = (x+0.5, y+0.5, z+0.5))
   * @param {number} x 方块 X
   * @param {number} y 方块 Y
   * @param {number} z 方块 Z
   */
  show(x, y, z) {
    this.mesh.visible = true;
    this.mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  }

  /**
   * 隐藏高亮
   */
  hide() {
    this.mesh.visible = false;
  }

  /**
   * 释放资源
   */
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
