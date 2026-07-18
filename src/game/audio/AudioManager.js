/**
 * @file 音频管理器
 * @description 使用 WebAudio API 程序化生成方块破坏/放置音效, 无外部音频文件
 *              按方块材质类型 (stone/dirt/wood/sand/grass/glass/gravel) 合成短促噪声
 */

export class AudioManager {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    /** 主音量 [0,1] */
    this.volume = 0.5;
    /** 是否已初始化 (需用户交互后才能创建 AudioContext) */
    this._initialized = false;
  }

  /**
   * 初始化 AudioContext (必须在用户交互后调用, 否则浏览器会阻止)
   */
  init() {
    if (this._initialized) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this._initialized = true;
    } catch (e) {
      console.warn('AudioContext 初始化失败:', e);
    }
  }

  /**
   * 设置音量
   * @param {number} v 0..1
   */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  /**
   * 播放指定类型音效
   * @param {string} type 音效 key (stone/dirt/wood/sand/grass/glass/gravel)
   */
  play(type) {
    if (!this._initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.value = this.volume * 0.3;
    gain.connect(this.ctx.destination);

    // 各材质参数: 频率范围 / 时长 / 滤波类型
    const presets = {
      stone:   { freq: 200, q: 1, dur: 0.12, type: 'square' },
      dirt:    { freq: 320, q: 1, dur: 0.10, type: 'sawtooth' },
      wood:    { freq: 400, q: 2, dur: 0.10, type: 'triangle' },
      sand:    { freq: 500, q: 0.5, dur: 0.08, type: 'sawtooth' },
      grass:   { freq: 450, q: 0.8, dur: 0.10, type: 'triangle' },
      gravel:  { freq: 250, q: 0.5, dur: 0.12, type: 'sawtooth' },
      glass:   { freq: 1200, q: 3, dur: 0.15, type: 'sine' },
    };
    const p = presets[type] || presets.stone;

    // 主音: 短促振荡 + 噪声混合
    const osc = this.ctx.createOscillator();
    osc.type = p.type;
    osc.frequency.value = p.freq * (0.95 + Math.random() * 0.1);
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.6, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + p.dur);
    osc.connect(oscGain);
    oscGain.connect(gain);
    osc.start(now);
    osc.stop(now + p.dur);

    // 噪声层 (材质颗粒感)
    const noise = this._makeNoiseBuffer(p.dur);
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noise;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = p.freq * 2;
    noiseFilter.Q.value = p.q;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + p.dur);
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(gain);
    noiseSrc.start(now);
    noiseSrc.stop(now + p.dur);
  }

  /**
   * 生成短噪声 buffer
   * @param {number} dur 时长 (秒)
   * @returns {AudioBuffer}
   */
  _makeNoiseBuffer(dur) {
    const sr = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * dur));
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    return buf;
  }
}
