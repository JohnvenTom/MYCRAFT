/**
 * @file 天空盒
 * @description 渐变天空 (顶/底两色插值) + 太阳 + 月亮, 跟随相机移动避免视差
 */

import * as THREE from 'three';

export class Sky {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    // 渐变天空: 大球壳, BackSide, 顶点色上下插值
    const skyGeo = new THREE.SphereGeometry(500, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x4a90d9) },
        bottomColor: { value: new THREE.Color(0xc8e8ff) },
        offset: { value: 33 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.renderOrder = -1;
    scene.add(this.skyMesh);

    // 太阳: 发光圆盘
    const sunGeo = new THREE.CircleGeometry(20, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false, transparent: true });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    scene.add(this.sunMesh);

    // 月亮
    const moonGeo = new THREE.CircleGeometry(14, 32);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xeef2ff, fog: false, transparent: true });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    scene.add(this.moonMesh);

    // 星星 (简单点云, 夜间淡入)
    const starGeo = new THREE.BufferGeometry();
    const starCount = 600;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // 球面均匀分布 (上半球)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random()); // 0..PI/2 (上半球)
      const r = 450;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, starMat);
    scene.add(this.stars);

    // 云层: 放到世界里 (不跟随天空盒), 由 world-cloud-group 承载, 在 update 中跟随相机 XZ 平移
    this._initClouds();
  }

  /**
   * 初始化云层 (世界中云朵, 不跟随天空盒, 跟随相机 XZ 平移)
   * 云朵由若干随机大小的扁平体素拼接, 形状更随机 (受 Perlin 启发的噪声偏移)
   * 材质受 fog 影响 (与现实雾融合), 颜色在 update 中按时间变化
   */
  _initClouds() {
    /** 云群组 (位于世界里, 不进 skyMesh 的子集) */
    this.cloudGroup = new THREE.Group();
    this.scene.add(this.cloudGroup);
    /** @type {{mesh: THREE.Mesh, drift: number, offsetX: number}[]} 云朵句柄 */
    this.clouds = [];
    /** 云层高度 (世界里 Y=120, 远高于玩家) */
    this.cloudY = 120;
    /** 云朵范围 (相对相机 XZ 平移的范围, 米) */
    this.cloudRange = 500;
    /** 每朵云独立材质 (用于时间变色) */
    this.cloudMaterials = [];

    // 生成 40 朵随机分布的云 (减少数量, 单朵形状更随机)
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        fog: true, // 受雾影响, 与世界融合
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.cloudMaterials.push(mat);
      const cloud = this._makeCloud(mat);
      // 固定世界坐标 (在 -cloudRange..cloudRange 范围)
      const baseX = (Math.random() - 0.5) * this.cloudRange * 2;
      const baseZ = (Math.random() - 0.5) * this.cloudRange * 2;
      cloud.position.set(
        baseX,
        this.cloudY + (Math.random() - 0.5) * 10,
        baseZ
      );
      // 每朵云独立的漂移速度 (向 +X 方向缓慢移动)
      const drift = 0.6 + Math.random() * 1.4;
      this.clouds.push({ mesh: cloud, drift, offsetX: baseX });
      this.cloudGroup.add(cloud);
    }
  }

  /**
   * 生成一朵云 (由若干随机体素拼接, 形状不规则)
   * 修复: 原版用规则 BoxGeometry 排列, 形状死板; 改为多层不规则偏移 + 高度变化
   * @param {THREE.Material} mat 共享材质
   * @returns {THREE.Group}
   */
  _makeCloud(mat) {
    const cloud = new THREE.Group();
    const blocks = 6 + Math.floor(Math.random() * 8); // 6-13 个块
    // 云朵主体尺寸范围
    const baseW = 8 + Math.random() * 14;
    const baseD = 8 + Math.random() * 14;
    for (let i = 0; i < blocks; i++) {
      // 每个块尺寸不同 (有的长条, 有的方块)
      const w = baseW * (0.4 + Math.random() * 0.6);
      const d = baseD * (0.4 + Math.random() * 0.6);
      const h = 1 + Math.random() * 2.5; // 厚度 1-3.5
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, mat);
      // 块在云朵内分布: 用极坐标, 角度+半径随机
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * (baseW * 0.5);
      mesh.position.set(
        Math.cos(angle) * radius + (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 2, // Y 微小变化
        Math.sin(angle) * radius + (Math.random() - 0.5) * 3
      );
      cloud.add(mesh);
    }
    return cloud;
  }

  /**
   * 设置天空顶/底色
   * @param {THREE.Color} topColor
   * @param {THREE.Color} bottomColor
   */
  setColors(topColor, bottomColor) {
    this.skyMesh.material.uniforms.topColor.value.copy(topColor);
    this.skyMesh.material.uniforms.bottomColor.value.copy(bottomColor);
  }

  /**
   * 更新太阳/月亮/星空位置: 跟随相机, 围绕相机绕一圈
   * 同时更新云朵: 漂移 + 超出范围环绕 + 按时间染色
   * @param {THREE.Camera} camera
   * @param {number} sunAngle 太阳角度 (弧度, 0=正午顶上, PI=午夜)
   * @param {number} [dt] 帧间隔 (秒, 用于云朵漂移)
   */
  update(camera, sunAngle, dt = 0.016) {
    const camPos = camera.position;
    // 太阳轨迹半径
    const skyR = 400;
    const sunX = Math.cos(sunAngle) * skyR;
    const sunY = Math.sin(sunAngle) * skyR;
    const sunZ = 0;
    this.sunMesh.position.set(camPos.x + sunX, camPos.y + sunY, camPos.z + sunZ);
    this.sunMesh.lookAt(camPos);
    // 月亮在太阳对面
    this.moonMesh.position.set(camPos.x - sunX, camPos.y - sunY, camPos.z - sunZ);
    this.moonMesh.lookAt(camPos);
    // 星空跟随相机
    this.stars.position.copy(camPos);
    // 天空盒跟随相机 (避免穿出)
    this.skyMesh.position.copy(camPos);

    // 云朵: 漂移 + 环绕 (世界坐标, 不跟随相机, 但超出范围则从对面回来)
    const range = this.cloudRange;
    for (const c of this.clouds) {
      c.mesh.position.x += c.drift * dt;
      // 相对相机的 X 距离超过 range 则从对面回来 (始终覆盖相机周围)
      const relX = c.mesh.position.x - camPos.x;
      if (relX > range) c.mesh.position.x -= range * 2;
      else if (relX < -range) c.mesh.position.x += range * 2;
      // Z 方向也环绕
      const relZ = c.mesh.position.z - camPos.z;
      if (relZ > range) c.mesh.position.z -= range * 2;
      else if (relZ < -range) c.mesh.position.z += range * 2;
    }

    // 云朵颜色随时间变化: 日出/日落橙红, 正午白, 夜晚灰暗
    this._updateCloudColor(sunAngle);
  }

  /**
   * 根据太阳角度更新云朵颜色
   * - sunAngle=0 (正午): 白色 0xffffff
   * - sunAngle=PI/2 (日出/日落, 地平线): 橙红 0xff9966
   * - sunAngle=PI (午夜): 深灰蓝 0x4a5060
   * 用 sin(sunAngle) 在 [0, 1] 范围判断天黑程度, 用 |cos(sunAngle)| 判断日出日落
   */
  _updateCloudColor(sunAngle) {
    // 天亮程度: 0=夜, 1=正午
    const daylight = Math.max(0, Math.sin(sunAngle));
    // 日出日落程度: 1=地平线, 0=正午/午夜
    const horizon = Math.abs(Math.cos(sunAngle));
    // 三色插值
    const night = new THREE.Color(0x4a5060);   // 夜晚灰蓝
    const noon = new THREE.Color(0xffffff);    // 正午白
    const sunset = new THREE.Color(0xff9966);  // 日落橙
    // 基础色: 夜→正午
    const base = night.clone().lerp(noon, daylight);
    // 日出日落时混入橙红
    const sunsetMix = horizon * (1 - Math.abs(daylight - 0.5) * 2); // 仅在地平线附近生效
    const final = base.lerp(sunset, Math.max(0, sunsetMix) * 0.6);
    for (const mat of this.cloudMaterials) {
      mat.color.copy(final);
    }
  }

  /**
   * 设置星星透明度 (0 白天, 1 夜晚)
   * @param {number} opacity
   */
  setStarOpacity(opacity) {
    this.stars.material.opacity = opacity;
  }

  /**
   * 设置太阳/月亮可见性 (地平线下隐藏)
   * @param {boolean} sunVisible
   * @param {boolean} moonVisible
   */
  setCelestialVisibility(sunVisible, moonVisible) {
    this.sunMesh.visible = sunVisible;
    this.moonMesh.visible = moonVisible;
  }
}
