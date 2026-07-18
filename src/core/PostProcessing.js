/**
 * @file 后处理系统
 * @description 高级光影后处理链:
 *              RenderPass → Bloom (UnrealBloom) → ToneMapping → FXAA → Output
 *              - Bloom: 让太阳/月亮/发光方块 (岩浆/萤石) 产生光晕
 *              - ToneMapping: ACESFilmic 电影级色调映射, 避免高光过曝
 *              - FXAA: 抗锯齿 (像素风基础上的边缘平滑)
 *              - 颜色分级: 简单的对比度 + 饱和度调整
 *              支持动态参数 (Bloom 阈值随昼夜变化)
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** 颜色分级 + 色调映射 自定义着色器 */
const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    /** 曝光 (默认 1.0) */
    uExposure: { value: 1.0 },
    /** 对比度 (1.0=不变, >1 增加)
     *  修复: 原 1.08 会进一步压缩暗部, 降到 1.02 让暗部更可见 */
    uContrast: { value: 1.02 },
    /** 饱和度 (1.0=不变, 0=灰度) */
    uSaturation: { value: 1.1 },
    /** 色温偏移 (-1=冷, +1=暖), 用于夜晚偏冷蓝 */
    uTemperature: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uTemperature;
    varying vec2 vUv;

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 rgb = c.rgb;

      // 曝光
      rgb *= uExposure;

      // 色温: 暖色 (R+B 加红减蓝) / 冷色 (加蓝减红)
      rgb.r += uTemperature * 0.05;
      rgb.b -= uTemperature * 0.05;

      // 对比度 (绕 0.5 灰度点)
      rgb = (rgb - 0.5) * uContrast + 0.5;

      // 饱和度 (绕亮度)
      float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
      rgb = mix(vec3(luma), rgb, uSaturation);

      gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), c.a);
    }
  `,
};

export class PostProcessing {
  /**
   * @param {Object} opts
   * @param {THREE.WebGLRenderer} opts.renderer 渲染器
   * @param {THREE.Scene} opts.scene 场景
   * @param {THREE.Camera} opts.camera 摄像机
   */
  constructor({ renderer, scene, camera }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    /** EffectComposer 实例 */
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    /** Bloom: 让明亮区域产生光晕 */
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.7,  // strength: 光晕强度
      0.6,  // radius: 光晕半径
      0.85  // threshold: 仅亮度 > 0.85 的区域产生光晕
    );
    this.composer.addPass(this.bloomPass);

    /** 颜色分级 + 色调映射 */
    this.colorGradePass = new ShaderPass(ColorGradeShader);
    this.composer.addPass(this.colorGradePass);

    /** FXAA 抗锯齿 */
    this.fxaaPass = new ShaderPass(FXAAShader);
    this._updateFXAAResolution();
    this.composer.addPass(this.fxaaPass);

    /** Output Pass (处理色彩空间转换, Three.js r152+ 必需) */
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    /** 渲染器色调映射: ACESFilmic 电影级 (与 Bloom 配合) */
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
  }

  /**
   * 更新 FXAA 分辨率 uniform (resize 时调用)
   * @private
   */
  _updateFXAAResolution() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pixelRatio = this.renderer.getPixelRatio();
    this.fxaaPass.material.uniforms.resolution.value.set(
      1 / (w * pixelRatio),
      1 / (h * pixelRatio)
    );
  }

  /**
   * 渲染一帧 (替代 renderer.render)
   */
  render() {
    this.composer.render();
  }

  /**
   * 窗口尺寸变化时同步 composer 分辨率
   */
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);
    this._updateFXAAResolution();
  }

  /**
   * 设置 Bloom 参数 (供昼夜系统动态调整)
   * @param {number} strength 光晕强度 (0..2)
   * @param {number} threshold 亮度阈值 (0..1, 仅 > 该值的像素产生光晕)
   */
  setBloomParams(strength, threshold) {
    this.bloomPass.strength = strength;
    this.bloomPass.threshold = threshold;
  }

  /**
   * 设置颜色分级参数 (供昼夜系统动态调整)
   * @param {number} exposure 曝光 (0.5..2.0)
   * @param {number} temperature 色温 (-1 冷 .. +1 暖)
   * @param {number} saturation 饱和度 (0..2)
   */
  setColorGrade(exposure, temperature, saturation) {
    this.colorGradePass.uniforms.uExposure.value = exposure;
    this.colorGradePass.uniforms.uTemperature.value = temperature;
    this.colorGradePass.uniforms.uSaturation.value = saturation;
  }
}
