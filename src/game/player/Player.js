/**
 * @file 玩家实体
 * @description 玩家位置、速度、朝向、AABB、游戏模式; 持有摄像机并同步眼睛位置
 */

import * as THREE from 'three';
import {
  PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_EYE,
  WALK_SPEED, SPRINT_SPEED, FLY_SPEED, SNEAK_MULTIPLIER, JUMP_VELOCITY,
} from '../../config/constants.js';

/** 游戏模式 */
export const GameMode = Object.freeze({
  SURVIVAL: 'survival',
  CREATIVE: 'creative',
});

export class Player {
  /**
   * @param {THREE.PerspectiveCamera} camera 第一人称摄像机
   */
  constructor(camera) {
    this.camera = camera;

    /** 位置 (脚底中心) */
    this.position = new THREE.Vector3(0, 80, 0);
    /** 速度 (m/s) */
    this.velocity = new THREE.Vector3(0, 0, 0);
    /** 朝向 (yaw 绕 Y, pitch 俯仰, 弧度) */
    this.yaw = 0;
    this.pitch = 0;

    /** 是否在地面 (用于跳跃判定) */
    this.onGround = false;
    /** 是否蹲下 */
    this.sneaking = false;
    /** 是否冲刺 */
    this.sprinting = false;
    /** 游戏模式 */
    this.gameMode = GameMode.SURVIVAL;

    /** AABB 半宽 (X/Z) */
    this.halfWidth = PLAYER_WIDTH / 2;
    /** 身高 */
    this.height = PLAYER_HEIGHT;
    /** 眼睛高度 */
    this.eyeHeight = PLAYER_EYE;

    /** 当前 AABB (每帧由 Physics 更新) */
    this.aabb = new THREE.Box3();

    /** 视角晃动相位 (走/跑时累积, 用于摄像头 bobbing) */
    this.bobPhase = 0;
    /** 当前晃动强度 (0=静止, 0..1) */
    this.bobAmount = 0;
    /** 目标晃动强度 (用于平滑过渡) */
    this.bobAmountTarget = 0;
    /** 当前晃动 Y 偏移 (由相位计算, _syncCamera 中应用) */
    this.bobOffsetY = 0;
    /** 当前晃动 X 偏移 (左右摆动, 由相位计算) */
    this.bobOffsetX = 0;

    this._updateAABB();
    this._syncCamera();
  }

  /**
   * 设置玩家位置 (脚底)
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this._updateAABB();
    this._syncCamera();
  }

  /**
   * 设置朝向
   * @param {number} yaw 偏航 (弧度)
   * @param {number} pitch 俯仰 (弧度)
   */
  setRotation(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = pitch;
    this._syncCamera();
  }

  /**
   * 切换游戏模式
   */
  toggleGameMode() {
    this.gameMode = this.gameMode === GameMode.SURVIVAL ? GameMode.CREATIVE : GameMode.SURVIVAL;
    this.velocity.set(0, 0, 0);
  }

  /**
   * 更新 AABB (基于 position)
   */
  _updateAABB() {
    this.aabb.min.set(
      this.position.x - this.halfWidth,
      this.position.y,
      this.position.z - this.halfWidth
    );
    this.aabb.max.set(
      this.position.x + this.halfWidth,
      this.position.y + this.height,
      this.position.z + this.halfWidth
    );
  }

  /**
   * 同步摄像机到玩家眼睛位置 + 朝向
   * 应用视角晃动偏移 (走/跑时上下/左右轻微摆动)
   */
  _syncCamera() {
    this.camera.position.set(
      this.position.x + this.bobOffsetX,
      this.position.y + this.eyeHeight + this.bobOffsetY,
      this.position.z
    );
    // Three.js Euler 顺序 'YXZ': 先绕 Y (yaw), 再绕 X (pitch)
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }

  /**
   * 同步玩家位置到 AABB 与摄像机 (物理更新后调用)
   */
  syncTransform() {
    this._updateAABB();
    this._syncCamera();
  }

  /**
   * 获取前进方向 (水平, 不含 Y)
   * @returns {THREE.Vector3} 归一化向量
   */
  getForward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /**
   * 获取右方向 (水平)
   * @returns {THREE.Vector3}
   */
  getRight() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /**
   * 获取视线方向 (含 pitch, 用于射线检测)
   * @returns {THREE.Vector3} 归一化
   */
  getLookDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(
      -Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp
    ).normalize();
  }

  /**
   * 获取当前移动速度 (m/s)
   * @returns {number}
   */
  getMoveSpeed() {
    if (this.gameMode === GameMode.CREATIVE) return FLY_SPEED;
    let s = this.sprinting ? SPRINT_SPEED : WALK_SPEED;
    if (this.sneaking) s *= SNEAK_MULTIPLIER;
    return s;
  }

  /**
   * 序列化为存档
   * @returns {Object}
   */
  serialize() {
    return {
      position: [this.position.x, this.position.y, this.position.z],
      rotation: [this.yaw, this.pitch],
      gameMode: this.gameMode,
    };
  }

  /**
   * 从存档恢复
   * @param {Object} data
   */
  deserialize(data) {
    if (!data) return;
    if (data.position) this.setPosition(data.position[0], data.position[1], data.position[2]);
    if (data.rotation) this.setRotation(data.rotation[0], data.rotation[1]);
    if (data.gameMode) this.gameMode = data.gameMode;
  }
}

// 引用 JUMP_VELOCITY (供 Physics 使用, 此处仅导出标记避免未使用警告)
export { JUMP_VELOCITY };
