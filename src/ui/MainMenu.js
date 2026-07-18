/**
 * @file 主菜单
 * @description 标题画面: 种子输入 / 进入世界 / 加载存档 / 删除存档 / 操作说明
 */

export class MainMenu {
  /**
   * @param {Object} els 元素引用
   * @param {HTMLElement} els.root 根容器
   * @param {HTMLInputElement} els.seedInput 种子输入框
   * @param {HTMLButtonElement} els.playBtn 进入按钮
   * @param {HTMLButtonElement} els.loadBtn 加载按钮
   * @param {HTMLButtonElement} els.deleteBtn 删除按钮
   */
  constructor({ root, seedInput, playBtn, loadBtn, deleteBtn }) {
    this.root = root;
    this.seedInput = seedInput;
    this.playBtn = playBtn;
    this.loadBtn = loadBtn;
    this.deleteBtn = deleteBtn;

    /** 回调 */
    this.onPlay = null;     // (seed: string) => void
    this.onLoad = null;     // () => void
    this.onDelete = null;   // () => void
    this._bind();
  }

  /**
   * 绑定按钮事件
   */
  _bind() {
    this.playBtn.addEventListener('click', () => {
      if (this.onPlay) this.onPlay(this.seedInput.value.trim());
    });
    this.loadBtn.addEventListener('click', () => {
      if (this.onLoad) this.onLoad();
    });
    this.deleteBtn.addEventListener('click', () => {
      if (this.onDelete) this.onDelete();
    });
  }

  /**
   * 显示主菜单
   * @param {boolean} hasSave 是否有存档 (控制加载/删除按钮)
   */
  show(hasSave = false) {
    this.root.classList.remove('hidden');
    this.loadBtn.disabled = !hasSave;
    this.deleteBtn.disabled = !hasSave;
    if (!hasSave) {
      this.loadBtn.classList.add('disabled');
      this.deleteBtn.classList.add('disabled');
    } else {
      this.loadBtn.classList.remove('disabled');
      this.deleteBtn.classList.remove('disabled');
    }
  }

  /**
   * 隐藏主菜单
   */
  hide() {
    this.root.classList.add('hidden');
  }
}
