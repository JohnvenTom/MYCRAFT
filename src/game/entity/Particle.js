/**
 * @file 像素风粒子系统
 * @description 简易粒子效果: 死亡烟雾 / 受击飞屑等
 *              每个粒子是小型彩色方块 (像素风), 向上飘并淡出
 *              使用 Points + 自定义着色器, 高效渲染
 */

import * as THREE from 'three';

/** 顶点着色器: 输出位置 + 传 uv/alpha 给片元 */
const VERT_SHADER = `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * (300.0 / -mvPosition.z);
  }
`;

/** 片元着色器: 像素方块 (无圆角) + alpha 测试 */
const FRAG_SHADER = `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    // 像素方块 (gl_PointCoord 范围 0..1, 不做圆形裁剪保持像素感)
    if (vAlpha <= 0.01) discard;
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

export class ParticleSystem {
  /**
   * @param {THREE.Scene} scene 场景
   */
  constructor(scene) {
    this.scene = scene;
    /** 活动粒子列表 {pos, vel, life, maxLife, size, color, gravity} */
    this.particles = [];
    /** THREE.Points 对象 (惰性创建) */
    this.points = null;
    /** 最大粒子数 (避免无限增长) */
    this.maxParticles = 500;
  }

  /**
   * 在指定位置生成死亡烟雾粒子 (向上飘 + 扩散 + 淡出)
   * @param {THREE.Vector3} pos 死亡位置
   * @param {number} [count=24] 粒子数量
   * @param {number} [color=0x888888] 烟雾颜色 (默认灰)
   */
  spawnDeathSmoke(pos, count = 24, color = 0x888888) {
    const col = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      // 随机水平方向 + 略向上初速度
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.0;
      this.particles.push({
        pos: pos.clone(),
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          2.0 + Math.random() * 2.5, // 向上
          Math.sin(angle) * speed
        ),
        life: 0,
        maxLife: 1.2 + Math.random() * 0.8, // 1.2-2.0 秒
        size: 4 + Math.random() * 4, // 像素大小 4-8
        color: col.clone(),
        gravity: -1.5, // 轻微下沉 (烟雾上升后消散)
      });
    }
  }

  /**
   * 生成受击血溅粒子 (红色, 短时间)
   * @param {THREE.Vector3} pos 受击位置
   * @param {number} [count=8] 粒子数量
   */
  spawnHurtBlood(pos, count = 8) {
    const col = new THREE.Color(0xcc0000);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 2.0;
      this.particles.push({
        pos: pos.clone(),
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          1.0 + Math.random() * 2.0,
          Math.sin(angle) * speed
        ),
        life: 0,
        maxLife: 0.4 + Math.random() * 0.3,
        size: 3 + Math.random() * 2,
        color: col.clone(),
        gravity: -10, // 受重力影响掉落
      });
    }
  }

  /**
   * 每帧更新粒子位置/生命, 重建 Points geometry
   * @param {number} dt 帧间隔 (秒)
   */
  update(dt) {
    // 更新粒子物理 + 过期
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      // 重力
      p.vel.y += p.gravity * dt;
      // 阻尼 (烟雾扩散减速)
      p.vel.x *= 0.94;
      p.vel.z *= 0.94;
      // 位置积分
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;
    }

    // 同步到 THREE.Points
    this._syncGeometry();
  }

  /**
   * 重建 Points 的 geometry (每帧调用, 粒子数量少, 性能可控)
   */
  _syncGeometry() {
    if (this.particles.length === 0) {
      if (this.points) this.points.visible = false;
      return;
    }
    if (!this.points) {
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT_SHADER,
        fragmentShader: FRAG_SHADER,
        transparent: true,
        depthWrite: false,
      });
      this.points = new THREE.Points(geo, mat);
      this.points.frustumCulled = false;
      this.scene.add(this.points);
    }
    this.points.visible = true;

    const n = this.particles.length;
    const positions = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const alphas = new Float32Array(n);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      positions[i * 3] = p.pos.x;
      positions[i * 3 + 1] = p.pos.y;
      positions[i * 3 + 2] = p.pos.z;
      sizes[i] = p.size;
      // 淡出曲线: 前 30% 不透明, 后 70% 线性淡出
      const t = p.life / p.maxLife;
      alphas[i] = t < 0.3 ? 1.0 : 1.0 - (t - 0.3) / 0.7;
      colors[i * 3] = p.color.r;
      colors[i * 3 + 1] = p.color.g;
      colors[i * 3 + 2] = p.color.b;
    }
    const geo = this.points.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.attributes.position.needsUpdate = true;
  }

  /**
   * 销毁粒子系统 (退出世界时调用)
   */
  dispose() {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.points.material.dispose();
      this.points = null;
    }
    this.particles = [];
  }
}
