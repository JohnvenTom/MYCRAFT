/**
 * @file 昼夜循环
 * @description 推进世界时间, 计算太阳角度, 插值天空色 / 雾色 / 光强 / 星空透明度
 *              绑定 HemisphereLight + DirectionalLight + 场景背景
 */

import * as THREE from 'three';
import { DAY_LENGTH } from '../../config/constants.js';
import { Sky } from './Sky.js';

/** 一天中的关键时间点 (0..1, 0=午夜, 0.25=日出, 0.5=正午, 0.75=日落) */
const TimeOfDay = Object.freeze({
  MIDNIGHT: 0,
  DAWN: 0.25,
  NOON: 0.5,
  DUSK: 0.75,
});

/** 天空配色关键帧 [time, topColor, bottomColor] */
const SKY_KEYFRAMES = [
  { t: 0.0,  top: 0x0a0e23, bot: 0x1a1f3a }, // 午夜: 深蓝黑
  { t: 0.22, top: 0x2a3a5e, bot: 0xd28a4a }, // 日出前: 暖橙地平线
  { t: 0.28, top: 0x4a90d9, bot: 0xfbd9a0 }, // 日出
  { t: 0.5,  top: 0x4a90d9, bot: 0xc8e8ff }, // 正午
  { t: 0.72, top: 0x4a90d9, bot: 0xfbd9a0 }, // 日落前
  { t: 0.78, top: 0x2a3a5e, bot: 0xd28a4a }, // 日落
  { t: 0.85, top: 0x0a0e23, bot: 0x1a1f3a }, // 夜晚
  { t: 1.0,  top: 0x0a0e23, bot: 0x1a1f3a }, // 接午夜
];

export class DayNightCycle {
  /**
   * @param {Object} opts
   * @param {THREE.Scene} opts.scene
   * @param {THREE.Camera} opts.camera
   * @param {Sky} [opts.sky] 天空对象
   * @param {import('../../core/PostProcessing.js').PostProcessing} [opts.postFX] 后处理系统 (用于动态调整 Bloom/曝光)
   */
  constructor({ scene, camera, sky, postFX }) {
    this.scene = scene;
    this.camera = camera;
    this.sky = sky;
    /** 后处理系统引用 (可选, 用于动态调整 Bloom 强度/色温) */
    this.postFX = postFX;

    /** 一天内时间 [0,1) */
    this.time = 0.3; // 早晨开始
    /** 时间流速倍率 (1 = 真实 DAY_LENGTH 秒一天) */
    this.timeScale = 1;

    // 光源
    this.hemiLight = new THREE.HemisphereLight(0xb8d8ff, 0x6b5a3a, 0.6);
    scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff4d6, 1.0);
    this.sunLight.position.set(50, 100, 30);
    // 高级光影: 启用动态阴影
    this.sunLight.castShadow = true;
    // 阴影贴图分辨率 (2048 高质量; 性能不足可降为 1024)
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    // 阴影正交视锥 (覆盖玩家周围 80m × 80m 区域)
    const SHADOW_RANGE = 80;
    this.sunLight.shadow.camera.left = -SHADOW_RANGE;
    this.sunLight.shadow.camera.right = SHADOW_RANGE;
    this.sunLight.shadow.camera.top = SHADOW_RANGE;
    this.sunLight.shadow.camera.bottom = -SHADOW_RANGE;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 300;
    // PCFSoft 软阴影, 边缘平滑
    this.sunLight.shadow.radius = 2;
    this.sunLight.shadow.bias = -0.0005;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // 环境光 (夜里有微光避免全黑)
    this.ambient = new THREE.AmbientLight(0x404060, 0.2);
    scene.add(this.ambient);
  }

  /**
   * 设置当前时间 (0..1)
   * @param {number} t
   */
  setTime(t) {
    this.time = ((t % 1) + 1) % 1;
  }

  /**
   * 每帧更新
   * @param {number} dt 帧间隔 (秒)
   */
  update(dt) {
    this.time = (this.time + (dt / DAY_LENGTH) * this.timeScale) % 1;

    // 太阳角度: time=0.25 (日出) → 角度 0; time=0.5 (正午) → 角度 PI/2; time=0.75 (日落) → 角度 PI
    // 即 angle = (time - 0.25) * 2*PI
    const sunAngle = (this.time - 0.25) * Math.PI * 2;
    const sunHeight = Math.sin(sunAngle); // -1 (夜) .. 1 (正午)

    // 天空色插值
    const { top, bot } = this._sampleSkyColors(this.time);
    if (this.sky) {
      this.sky.setColors(new THREE.Color(top), new THREE.Color(bot));
      this.sky.update(this.camera, sunAngle, dt);
      // 星空透明度: 太阳低于地平线时显现
      const starOpacity = THREE.MathUtils.clamp(-sunHeight * 2, 0, 1);
      this.sky.setStarOpacity(starOpacity);
      // 太阳/月亮可见性
      this.sky.setCelestialVisibility(sunHeight > -0.1, sunHeight < 0.1);
    }

    // 背景与雾色 (用底色, 比顶色更近地平线视觉)
    const bgColor = new THREE.Color(bot);
    this.scene.background = bgColor;
    if (this.scene.fog) this.scene.fog.color.copy(bgColor);

    // 光强: 白天强, 夜里弱 (修复: 提高夜晚基础亮度, 避免暗部看不清)
    // dayFactor: 0=夜, 1=正午
    const dayFactor = THREE.MathUtils.clamp(sunHeight * 1.5 + 0.2, 0, 1);
    // 太阳/月光: 白天 1.3, 夜晚保留 0.25 月光 (原版夜晚 0 太黑)
    this.sunLight.intensity = dayFactor * 1.3 + 0.25;
    // 半球光 (天空→地面): 夜晚 0.45 基础, 白天 1.0
    this.hemiLight.intensity = 0.45 + dayFactor * 0.55;
    // 环境光: 夜晚 0.4 基础 (原 0.15 太暗), 白天 0.6
    this.ambient.intensity = 0.4 + dayFactor * 0.2;

    // 太阳光位置 (方向光, 模拟太阳方向; 跟随相机让阴影视锥始终覆盖玩家周围)
    const skyR = 100;
    this.sunLight.position.set(
      this.camera.position.x + Math.cos(sunAngle) * skyR,
      this.camera.position.y + Math.sin(sunAngle) * skyR,
      this.camera.position.z + 30
    );
    this.sunLight.target.position.copy(this.camera.position);
    this.sunLight.target.updateMatrixWorld();
    // 太阳在地平线下时关闭阴影 (避免无效渲染 + 错误阴影)
    this.sunLight.castShadow = sunHeight > 0.05;

    // 太阳光色温: 日出/日落偏暖, 正午偏白
    const warmth = THREE.MathUtils.clamp(1 - Math.abs(sunHeight), 0, 1);
    const sunColor = new THREE.Color(0xfff4d6).lerp(new THREE.Color(0xff9a4a), warmth * 0.6);
    this.sunLight.color.copy(sunColor);

    // 高级光影: 动态调整后处理参数
    // 修复: 暗部太暗看不清 → 提高夜晚曝光补偿 + 降低对比度
    if (this.postFX) {
      // dayFactor: 0=夜, 1=正午 (已在上面计算)
      const bloomStrength = 0.4 + dayFactor * 0.5; // 夜 0.4, 白天 0.9
      const bloomThreshold = 0.9 - dayFactor * 0.3; // 夜 0.9 (仅强光), 白天 0.6 (更多发光)
      this.postFX.setBloomParams(bloomStrength, bloomThreshold);
      // 曝光: 夜晚 1.15 (提亮暗部), 正午 1.05 (避免过曝)
      // 修复: 原版夜晚 0.85 太暗, 改为夜晚更高曝光补偿
      const exposure = 1.15 - dayFactor * 0.1;
      // 色温: 日出/日落偏暖 (+0.3), 正午中性 (0), 夜晚偏冷 (-0.3, 减弱冷感)
      const temperature = warmth * 0.3 - (1 - dayFactor) * 0.3;
      // 饱和度: 日出/日落增强 (1.25), 夜晚略降 (0.95, 不太灰)
      const saturation = 0.95 + dayFactor * 0.2 + warmth * 0.1;
      this.postFX.setColorGrade(exposure, temperature, saturation);
    }
  }

  /**
   * 在关键帧间插值取天空顶/底色
   * @param {number} t 时间 [0,1]
   * @returns {{top:number, bot:number}} 颜色 (数字)
   */
  _sampleSkyColors(t) {
    const keys = SKY_KEYFRAMES;
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      if (t >= a.t && t <= b.t) {
        const k = (t - a.t) / (b.t - a.t);
        return {
          top: this._lerpColor(a.top, b.top, k),
          bot: this._lerpColor(a.bot, b.bot, k),
        };
      }
    }
    return { top: keys[0].top, bot: keys[0].bot };
  }

  /**
   * 线性插值两个 0xRRGGBB 颜色
   * @param {number} c1
   * @param {number} c2
   * @param {number} k 0..1
   * @returns {number} 插值后的颜色
   */
  _lerpColor(c1, c2, k) {
    const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
    const r = Math.round(r1 + (r2 - r1) * k);
    const g = Math.round(g1 + (g2 - g1) * k);
    const b = Math.round(b1 + (b2 - b1) * k);
    return (r << 16) | (g << 8) | b;
  }

  /**
   * 获取当前时间字符串 (HH:MM)
   * @returns {string}
   */
  getTimeString() {
    const totalMin = Math.floor(this.time * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /**
   * 判断当前是否为夜晚 (用于怪物生成)
   * 夜晚定义: time ∈ [0.78, 1.0) ∪ [0.0, 0.22) (日落后到日出前)
   * @returns {boolean}
   */
  isNight() {
    return this.time < 0.22 || this.time > 0.78;
  }
}
