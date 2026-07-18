/**
 * @file 输入管理
 * @description 键盘、鼠标、指针锁的统一管理; 支持查询按键状态、鼠标增量、灵敏度
 */

import { DEFAULT_SENSITIVITY } from '../config/constants.js';

export class Input {
  /**
   * @param {HTMLCanvasElement} canvas 目标 canvas (用于指针锁请求)
   */
  constructor(canvas) {
    this.canvas = canvas;

    /** 当前按下的键集合 (使用 e.code, 如 'KeyW') */
    this.keysDown = new Set();
    /** 本帧刚按下的键 (一次性, 每帧末清除) */
    this.keysPressed = new Set();
    /** 鼠标位置增量 (本帧累计, 鼠标移动事件累加, 每帧末清零) */
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    /** 鼠标按键状态 [left, middle, right] */
    this.mouseDown = [false, false, false];
    /** 本帧刚点击的鼠标键 (一次性) */
    this.mouseClicked = [false, false, false];
    /** 鼠标滚轮增量 (本帧, 向上为正) */
    this.wheelDelta = 0;

    /** 指针锁是否激活 */
    this.pointerLocked = false;
    /** 鼠标灵敏度 */
    this.sensitivity = DEFAULT_SENSITIVITY;

    /** 事件回调注册表 (外部可注册 ESC 等) */
    this._escHandlers = [];
    /** 阻止下一帧 mouseClick (用于刚解锁时) */
    this._suppressClick = false;

    this._bind();
  }

  /**
   * 绑定 DOM 事件
   */
  _bind() {
    window.addEventListener('keydown', (e) => {
      // 防止 Tab/Space 滚动页面
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (!this.keysDown.has(e.code)) {
        this.keysPressed.add(e.code);
      }
      this.keysDown.add(e.code);
      if (e.code === 'Escape') {
        this._escHandlers.forEach((h) => h());
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.mouseDown = [false, false, false];
    });

    // 鼠标按键
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDown[e.button] = true;
      if (!this._suppressClick) {
        this.mouseClicked[e.button] = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      this.mouseDown[e.button] = false;
    });

    // 鼠标移动 (指针锁下使用 movementX/Y)
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDeltaX += e.movementX || 0;
      this.mouseDeltaY += e.movementY || 0;
    });

    // 滚轮
    window.addEventListener('wheel', (e) => {
      if (!this.pointerLocked) return;
      this.wheelDelta += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });

    // 指针锁状态变化
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (this.pointerLocked) {
        // 刚锁定时短暂屏蔽点击, 避免锁定瞬间触发破坏
        this._suppressClick = true;
        setTimeout(() => { this._suppressClick = false; }, 200);
      } else {
        // 解锁时清空所有鼠标状态
        this.mouseDown = [false, false, false];
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
      }
    });

    // 右键菜单屏蔽
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * 请求指针锁
   */
  requestPointerLock() {
    this.canvas.requestPointerLock();
  }

  /**
   * 退出指针锁
   */
  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /**
   * 注册 ESC 处理器 (按 ESC 时调用)
   * @param {() => void} handler
   */
  onEscape(handler) {
    this._escHandlers.push(handler);
  }

  /**
   * 查询某键是否按下 (持续)
   * @param {string} code e.code, 如 'KeyW'
   * @returns {boolean}
   */
  isDown(code) {
    return this.keysDown.has(code);
  }

  /**
   * 查询某键本帧是否刚按下 (一次性)
   * @param {string} code
   * @returns {boolean}
   */
  isPressed(code) {
    return this.keysPressed.has(code);
  }

  /**
   * 查询任一键是否按下
   * @param {string[]} codes
   * @returns {boolean}
   */
  anyDown(codes) {
    return codes.some((c) => this.keysDown.has(c));
  }

  /**
   * 帧末清理: 清空一次性状态与鼠标增量
   */
  endFrame() {
    this.keysPressed.clear();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.mouseClicked = [false, false, false];
    this.wheelDelta = 0;
  }
}
