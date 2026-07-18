/**
 * @file HUD 调试信息
 * @description 显示 FPS / 坐标 / 朝向 / 区块数 / 面数; F3 切换
 */

import * as THREE from 'three';

export class HUD {
  /**
   * @param {HTMLElement} el 调试信息容器
   */
  constructor(el) {
    this.el = el;
    this.visible = true;

    /** 缓存统计 */
    this.stats = {
      fps: 0,
      x: 0, y: 0, z: 0,
      yaw: 0, pitch: 0,
      chunks: 0,
      faces: 0,
      block: '—',
      time: '00:00',
      mode: 'survival',
    };
  }

  /**
   * 切换显示
   */
  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  /**
   * 更新统计 (由 main.js 调用)
   * @param {Object} s
   */
  updateStats(s) {
    Object.assign(this.stats, s);
    this._render();
  }

  /**
   * 渲染文本
   */
  _render() {
    const s = this.stats;
    let html =
      `<div class="dbg-line">MYCRAFT · ${s.fps.toFixed(0)} FPS</div>` +
      `<div class="dbg-line">XYZ: ${s.x.toFixed(2)} / ${s.y.toFixed(2)} / ${s.z.toFixed(2)}</div>` +
      `<div class="dbg-line">朝向: yaw ${this._rad2deg(s.yaw).toFixed(0)}° pitch ${this._rad2deg(s.pitch).toFixed(0)}°</div>` +
      `<div class="dbg-line">区块: ${s.chunks} · 面: ${s.faces}</div>` +
      `<div class="dbg-line">目标: ${s.block}</div>` +
      `<div class="dbg-line">时间: ${s.time} · ${s.mode}</div>`;
    // P2: 生命值 / 生物
    if (s.health != null) {
      html += `<div class="dbg-line">生命: ${s.health}/${s.maxHealth}</div>`;
    }
    if (s.mobs != null) {
      html += `<div class="dbg-line">生物: ${s.mobs}</div>`;
    }
    // P3: 玩家计数
    if (s.players != null && s.players > 1) {
      html += `<div class="dbg-line">在线玩家: ${s.players}</div>`;
    }
    this.el.innerHTML = html;
  }

  /**
   * 弧度转度
   * @param {number} r
   * @returns {number}
   */
  _rad2deg(r) {
    return r * 180 / Math.PI;
  }
}
