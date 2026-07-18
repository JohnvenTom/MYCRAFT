/**
 * @file 暂停菜单
 * @description ESC 唤出: 渲染距离 / 灵敏度 / 音量 滑块, 继续/保存/退出 按钮
 */

export class PauseMenu {
  /**
   * @param {Object} els
   * @param {HTMLElement} els.root
   * @param {HTMLInputElement} els.renderDistance
   * @param {HTMLElement} els.rdValue
   * @param {HTMLInputElement} els.sensitivity
   * @param {HTMLElement} els.sensValue
   * @param {HTMLInputElement} els.volume
   * @param {HTMLElement} els.volValue
   * @param {HTMLButtonElement} els.resumeBtn
   * @param {HTMLButtonElement} els.saveBtn
   * @param {HTMLButtonElement} els.quitBtn
   */
  constructor(els) {
    this.els = els;
    this.visible = false;

    /** 回调 */
    this.onResume = null;
    this.onSave = null;
    this.onQuit = null;
    /** 设置变化: (key, value) => void */
    this.onSettingChange = null;

    this._bind();
    this._syncLabels();
  }

  /**
   * 绑定事件
   */
  _bind() {
    this.els.renderDistance.addEventListener('input', () => {
      this._syncLabels();
      if (this.onSettingChange) this.onSettingChange('renderDistance', parseInt(this.els.renderDistance.value, 10));
    });
    this.els.sensitivity.addEventListener('input', () => {
      this._syncLabels();
      if (this.onSettingChange) this.onSettingChange('sensitivity', parseFloat(this.els.sensitivity.value));
    });
    this.els.volume.addEventListener('input', () => {
      this._syncLabels();
      if (this.onSettingChange) this.onSettingChange('volume', parseFloat(this.els.volume.value));
    });
    this.els.resumeBtn.addEventListener('click', () => {
      if (this.onResume) this.onResume();
    });
    this.els.saveBtn.addEventListener('click', () => {
      if (this.onSave) this.onSave();
    });
    this.els.quitBtn.addEventListener('click', () => {
      if (this.onQuit) this.onQuit();
    });
  }

  /**
   * 同步滑块数值标签
   */
  _syncLabels() {
    this.els.rdValue.textContent = this.els.renderDistance.value;
    this.els.sensValue.textContent = parseFloat(this.els.sensitivity.value).toFixed(1);
    this.els.volValue.textContent = parseFloat(this.els.volume.value).toFixed(2);
  }

  /**
   * 显示暂停菜单 (会自动退出指针锁)
   */
  show() {
    this.visible = true;
    this.els.root.classList.remove('hidden');
  }

  /**
   * 隐藏暂停菜单
   */
  hide() {
    this.visible = false;
    this.els.root.classList.add('hidden');
  }

  /**
   * 切换显示
   */
  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  /**
   * 设置滑块初始值
   * @param {{renderDistance?:number, sensitivity?:number, volume?:number}} settings
   */
  applySettings(settings) {
    if (settings.renderDistance != null) this.els.renderDistance.value = settings.renderDistance;
    if (settings.sensitivity != null) this.els.sensitivity.value = settings.sensitivity;
    if (settings.volume != null) this.els.volume.value = settings.volume;
    this._syncLabels();
  }
}
