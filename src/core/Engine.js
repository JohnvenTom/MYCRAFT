/**
 * @file 引擎主类
 * @description 装配 Three.js Scene / Camera / Renderer, 驱动主循环, 管理屏幕尺寸
 *              通过 onUpdate 回调把每帧控制权交给游戏系统
 */

import * as THREE from 'three';
import { CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR } from '../config/constants.js';
import { Clock } from './Clock.js';
import { Input } from './Input.js';

export class Engine {
  /**
   * @param {HTMLCanvasElement} canvas 渲染目标 canvas
   */
  constructor(canvas) {
    this.canvas = canvas;

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // 像素风关闭抗锯齿, 由后处理 FXAA 替代
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // 高级光影: 启用阴影贴图 (PCFSoft 软阴影)
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 场景与雾
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    // 摄像机 (第一人称)
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      CAMERA_NEAR,
      CAMERA_FAR
    );
    this.camera.position.set(0, 70, 0);

    // 时钟与输入
    this.clock = new Clock();
    this.input = new Input(canvas);

    /** 每帧更新回调 (dt 秒) */
    this.onUpdate = null;
    /** 渲染前回调 (在 render 之前, 可用于摄像机同步) */
    this.onPreRender = null;

    /** 后处理系统 (可选, 设置后用 composer.render 替代 renderer.render) */
    this.postFX = null;

    this._running = false;
    this._rafId = 0;

    // 窗口尺寸变化
    window.addEventListener('resize', () => this._onResize());
  }

  /**
   * 安装后处理系统 (替代直接 renderer.render)
   * @param {import('./PostProcessing.js').PostProcessing} postFX
   */
  setPostProcessing(postFX) {
    this.postFX = postFX;
  }

  /**
   * 启动主循环
   */
  start() {
    if (this._running) return;
    this._running = true;
    this.clock.reset();
    this._loop();
  }

  /**
   * 停止主循环
   */
  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  /**
   * 主循环
   */
  _loop() {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(() => this._loop());
    const dt = this.clock.tick();

    if (this.onUpdate) this.onUpdate(dt);
    if (this.onPreRender) this.onPreRender();

    // 高级光影: 优先用后处理 composer 渲染, 否则直接 renderer.render
    if (this.postFX) {
      this.postFX.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // 帧末清理输入一次性状态
    this.input.endFrame();
  }

  /**
   * 窗口尺寸变化处理 / 强制重新设置 canvas 尺寸
   * 公开方法, 供游戏状态切换 (如从隐藏切到显示) 时调用
   */
  resize() {
    const w = window.innerWidth || 800;
    const h = window.innerHeight || 600;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    // 后处理系统也需同步分辨率
    if (this.postFX) this.postFX.resize();
  }

  /**
   * 内部 resize 监听器
   */
  _onResize() {
    this.resize();
  }

  /**
   * 设置场景雾 (远处遮挡区块边缘)
   * @param {THREE.Color} color 雾色
   * @param {number} near 近距离
   * @param {number} far 远距离
   */
  setFog(color, near, far) {
    this.scene.fog = new THREE.Fog(color, near, far);
  }

  /**
   * 设置背景色
   * @param {THREE.Color} color
   */
  setBackground(color) {
    this.scene.background = color;
    if (this.scene.fog) this.scene.fog.color = color;
  }
}
