/**
 * @file 第一人称控制器
 * @description 读取 Input, 计算朝向 (鼠标) 与水平速度 (WASD); 处理跳跃/冲刺/蹲下/飞行
 */

import * as THREE from 'three';

export class Controller {
  /**
   * @param {import('./Player.js').Player} player
   * @param {import('../../core/Input.js').Input} input
   * @param {import('./Physics.js').Physics} physics
   */
  constructor(player, input, physics) {
    this.player = player;
    this.input = input;
    this.physics = physics;

    /** 鼠标灵敏度乘子 (与 Input.sensitivity 配合) */
    this.mouseSensitivity = 0.002;

    /** 创造模式飞行升降速度 */
    this.flyVerticalSpeed = 9;
  }

  /**
   * 每帧更新 (在物理步进之前调用)
   * 处理: 鼠标视角、按键速度设置、模式切换、视角晃动
   * @param {number} dt 帧间隔 (秒)
   */
  update(dt) {
    this._updateLook();
    this._updateMovement();
    this._updateBob(dt);
    this._updateActions();
  }

  /**
   * 更新视角晃动 (bobbing) - 低频大振幅, 模拟走路摆头
   * 走动: 频率 1.5 Hz, 振幅 0.18m; 疾跑: 频率 2.5 Hz, 振幅 0.28m
   * (低频显摆动, 高频会变颤抖)
   * 水中/飞行/静止时平滑衰减到 0
   * @param {number} dt 帧间隔 (秒)
   */
  _updateBob(dt) {
    const p = this.player;
    // 判断是否在地面上水平移动 (创造模式不晃动)
    const isMoving = (p.velocity.x !== 0 || p.velocity.z !== 0)
                  && p.gameMode !== 'creative';
    // 在水中也不晃动 (浮力效果替代)
    const inWater = this._isInWater(p);
    if (isMoving && p.onGround && !inWater) {
      p.bobAmountTarget = p.sprinting ? 1.0 : 0.5;
    } else {
      p.bobAmountTarget = 0;
    }
    // 平滑过渡强度 (避免起停突变), 起步快, 停步慢
    const lerpSpeed = p.bobAmountTarget > p.bobAmount ? 6 : 3;
    p.bobAmount += (p.bobAmountTarget - p.bobAmount) * Math.min(1, lerpSpeed * dt);
    // 相位推进: 走 1.5Hz, 跑 2.5Hz (低频才有"晃动"感)
    const freq = p.sprinting ? 2.5 : 1.5;
    p.bobPhase += freq * dt * Math.PI * 2;
    // 计算偏移: Y 用 sin (一步一周期上下), X 用 sin(相位/2) 左右摆
    // 振幅: 走 0.18m, 跑 0.28m (按 bobAmount 缩放)
    const amp = p.sprinting ? 0.28 : 0.18;
    const k = p.bobAmount * amp;
    p.bobOffsetY = Math.abs(Math.sin(p.bobPhase)) * k; // 上下 (只取正半, 模拟落脚)
    p.bobOffsetX = Math.sin(p.bobPhase / 2) * k * 0.6; // 左右摆 (频率减半)
  }

  /**
   * 鼠标视角更新 (yaw/pitch)
   * 修复: yaw 必须归一化到 [-PI, PI], 否则累积到极大值时浮点精度下降,
   * 在某些角度会出现视角突然跳动 (sin/cos 精度损失)
   */
  _updateLook() {
    const sens = this.input.sensitivity * this.mouseSensitivity;
    this.player.yaw -= this.input.mouseDeltaX * sens;
    this.player.pitch -= this.input.mouseDeltaY * sens;
    // 归一化 yaw 到 [-PI, PI] (避免大角度精度损失)
    const TWO_PI = Math.PI * 2;
    this.player.yaw = ((this.player.yaw % TWO_PI) + TWO_PI) % TWO_PI;
    if (this.player.yaw > Math.PI) this.player.yaw -= TWO_PI;
    // 限制 pitch
    const limit = Math.PI / 2 - 0.01;
    if (this.player.pitch > limit) this.player.pitch = limit;
    if (this.player.pitch < -limit) this.player.pitch = -limit;
  }

  /**
   * WASD 水平移动 + 创造模式升降
   */
  _updateMovement() {
    const p = this.player;
    const input = this.input;

    p.sneaking = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    p.sprinting = input.isDown('ControlLeft') || input.isDown('ControlRight');

    // 水平输入
    let forward = 0, strafe = 0;
    if (input.isDown('KeyW')) forward += 1;
    if (input.isDown('KeyS')) forward -= 1;
    if (input.isDown('KeyD')) strafe += 1;
    if (input.isDown('KeyA')) strafe -= 1;

    const fwd = p.getForward();
    const right = p.getRight();
    const moveDir = new THREE.Vector3();
    moveDir.addScaledVector(fwd, forward);
    moveDir.addScaledVector(right, strafe);

    const speed = p.getMoveSpeed();
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(speed);
    }

    p.velocity.x = moveDir.x;
    p.velocity.z = moveDir.z;

    // 创造模式: 垂直手动控制
    if (p.gameMode === 'creative') {
      let vy = 0;
      if (input.isDown('Space')) vy += this.flyVerticalSpeed;
      if (p.sneaking) vy -= this.flyVerticalSpeed;
      p.velocity.y = vy;
    } else if (this._isInWater(p)) {
      // 水中: 空格上浮, Shift 下潜
      let vy = p.velocity.y;
      if (input.isDown('Space')) vy = 4; // 上浮
      else if (p.sneaking) vy = -3; // 下潜
      // 否则由 Physics 的浮力控制 (缓慢上浮或保持)
      p.velocity.y = vy;
    } else {
      // 生存: 跳跃
      if (input.isPressed('Space') || input.isDown('Space')) {
        this.physics.jump(p);
      }
    }
  }

  /**
   * 检查玩家是否在水中 (代理到 Physics)
   * @param {import('./Player.js').Player} p
   * @returns {boolean}
   */
  _isInWater(p) {
    return this.physics && this.physics._isInWater(p);
  }

  /**
   * 一次性动作: 切换游戏模式 (F)、调试 (F3)
   */
  _updateActions() {
    if (this.input.isPressed('KeyF')) {
      this.player.toggleGameMode();
    }
  }
}
