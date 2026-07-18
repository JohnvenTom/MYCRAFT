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

    // 云层: 多个白色扁平方块组成的群, 飘浮在高空, 跟随相机 XZ 移动并缓慢漂移
    this._initClouds();
  }

  /**
   * 初始化云层 (一片大平面, 用多个白色矩形拼接的云朵)
   * 云朵用 MeshBasicMaterial, 不受光照影响, fog=false 避免被远雾吃掉
   */
  _initClouds() {
    this.cloudGroup = new THREE.Group();
    /** @type {{mesh: THREE.Mesh, drift: number}[]} 云朵句柄 */
    this.clouds = [];
    /** 云层高度 (远高于玩家但低于天空盒半径 500) */
    this.cloudY = 120;
    /** 云朵材质 (白色半透明, 双面, 不受光照/雾影响) */
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      fog: false,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // 生成 60 朵随机分布的云
    for (let i = 0; i < 60; i++) {
      const cloud = this._makeCloud(cloudMat);
      // 在以原点为中心的 400×400 范围内随机分布
      cloud.position.set(
        (Math.random() - 0.5) * 800,
        this.cloudY + (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 800
      );
      // 每朵云独立的漂移速度 (向 +X 方向缓慢移动)
      const drift = 0.5 + Math.random() * 1.2;
      this.clouds.push({ mesh: cloud, drift });
      this.cloudGroup.add(cloud);
    }
    this.scene.add(this.cloudGroup);
  }

  /**
   * 生成一朵云 (由若干白色扁平矩形组成的群)
   * @param {THREE.Material} mat 共享材质
   * @returns {THREE.Group}
   */
  _makeCloud(mat) {
    const cloud = new THREE.Group();
    const blocks = 4 + Math.floor(Math.random() * 5); // 4-8 个块
    for (let i = 0; i < blocks; i++) {
      // 扁平方块: 8×1×8 (像素风扁平云)
      const w = 6 + Math.random() * 6;
      const d = 6 + Math.random() * 6;
      const geo = new THREE.BoxGeometry(w, 1, d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 10
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
   * 同时更新云朵: 跟随相机 XZ (避免视差穿出) + 缓慢向 +X 漂移
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
    // 云朵: 整体跟随相机 XZ (Y 保持固定高度), 然后每朵独立漂移
    this.cloudGroup.position.x = camPos.x;
    this.cloudGroup.position.z = camPos.z;
    // 云朵漂移: 每朵独立向 +X 方向移动, 超出相机范围则从对面回来 (环绕)
    const wrapRange = 400;
    for (const { mesh, drift } of this.clouds) {
      mesh.position.x += drift * dt;
      // 相对相机的 X 偏移超过 wrapRange 则环绕
      if (mesh.position.x > wrapRange) mesh.position.x = -wrapRange;
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
