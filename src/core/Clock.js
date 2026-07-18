/**
 * @file 帧时钟
 * @description 提供帧间隔 dt、累计时间、固定步长累加器 (用于物理)
 */

export class Clock {
  constructor() {
    this._lastTime = performance.now();
    /** 本帧 dt (秒) */
    this.dt = 0;
    /** 累计时间 (秒) */
    this.elapsed = 0;
    /** 固定物理步长 (秒) */
    this.fixedStep = 1 / 60;
    /** 累加器 */
    this._accumulator = 0;
    /** 帧计数 */
    this.frame = 0;
    /** FPS 平滑值 */
    this.fps = 60;
  }

  /**
   * 推进一帧, 计算 dt 与累加器
   * @returns {number} 本帧 dt (秒)
   */
  tick() {
    const now = performance.now();
    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;
    // 限制单帧最大 dt, 避免长时间挂起后大跳变
    if (dt > 0.1) dt = 0.1;
    this.dt = dt;
    this.elapsed += dt;
    this._accumulator += dt;
    this.frame++;
    // FPS 平滑
    if (dt > 0) {
      this.fps = this.fps * 0.9 + (1 / dt) * 0.1;
    }
    return dt;
  }

  /**
   * 消耗固定步长 (用于物理子步循环)
   * @returns {number|null} 返回固定步长 dt, 累加器不足时返回 null
   */
  consumeFixed() {
    if (this._accumulator >= this.fixedStep) {
      this._accumulator -= this.fixedStep;
      return this.fixedStep;
    }
    return null;
  }

  /**
   * 重置累加器 (避免暂停后大跳变)
   */
  reset() {
    this._lastTime = performance.now();
    this._accumulator = 0;
  }
}
