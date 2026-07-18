/**
 * @file 多人联机客户端
 * @description WebSocket 客户端, 负责与联机服务器通信:
 *              - 连接/断开
 *              - 发送本地玩家位置/朝向 (限频 10Hz)
 *              - 接收其他玩家位置并渲染
 *              - 发送/接收方块修改事件
 *              - 接收聊天消息 (回调)
 *
 *  注意: 服务器地址默认 ws://localhost:8080, 可通过 connect(url) 自定义
 */

import * as THREE from 'three';

/** 玩家模型创建 (简化的 Steve 风格) */
function createRemotePlayerModel(name) {
  const g = new THREE.Group();
  // 身体 (蓝色衣服)
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.7, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x4488dd })
  );
  body.position.y = 1.05;
  g.add(body);
  // 头 (肤色)
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xddaa88 })
  );
  head.position.y = 1.55;
  g.add(head);
  // 手臂 (肤色, 两侧)
  const armL = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.6, 0.2),
    new THREE.MeshLambertMaterial({ color: 0xddaa88 })
  );
  armL.position.set(-0.4, 1.05, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  g.add(armR);
  // 腿 (蓝色裤子)
  const legL = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.7, 0.22),
    new THREE.MeshLambertMaterial({ color: 0x336699 })
  );
  legL.position.set(-0.13, 0.35, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.13;
  g.add(legR);
  // 名牌 (Sprite)
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = '32px VT323, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 12), 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(1.5, 0.4, 1);
  sprite.position.y = 2.3;
  g.add(sprite);
  return g;
}

/**
 * 远程玩家对象
 */
class RemotePlayer {
  /**
   * @param {string} id
   * @param {string} name
   * @param {THREE.Scene} scene
   */
  constructor(id, name, scene) {
    this.id = id;
    this.name = name;
    this.scene = scene;
    this.group = createRemotePlayerModel(name);
    scene.add(this.group);
    /** 目标位置 (用于插值) */
    this.targetPos = new THREE.Vector3(0, 64, 0);
    /** 当前位置 (插值后) */
    this.currentPos = new THREE.Vector3(0, 64, 0);
    this.targetYaw = 0;
    this.yaw = 0;
  }

  /**
   * 设置目标位置/朝向
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} yaw
   * @param {number} pitch
   */
  setTransform(x, y, z, yaw, pitch) {
    this.targetPos.set(x, y, z);
    this.targetYaw = yaw;
  }

  /**
   * 每帧插值更新
   * @param {number} dt
   */
  update(dt) {
    // 位置插值 (lerp)
    this.currentPos.lerp(this.targetPos, Math.min(1, dt * 10));
    this.group.position.copy(this.currentPos);
    // 朝向插值
    let diff = this.targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * 10);
    this.group.rotation.y = this.yaw;
  }

  /**
   * 销毁
   */
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  }
}

export class MultiplayerClient {
  /**
   * @param {Object} opts
   * @param {THREE.Scene} opts.scene Three.js 场景
   * @param {import('../game/world/World.js').World} [opts.world] 世界引用 (用于应用远程方块修改)
   * @param {Object} [opts.callbacks] 回调
   * @param {(name:string, text:string)=>void} [opts.callbacks.onChat] 聊天消息回调
   * @param {(name:string)=>void} [opts.callbacks.onPlayerJoin] 玩家加入
   * @param {(name:string)=>void} [opts.callbacks.onPlayerLeave] 玩家离开
   */
  constructor({ scene, world, callbacks = {} }) {
    this.scene = scene;
    this.world = world;
    this.callbacks = callbacks;
    /** @type {WebSocket|null} */
    this.socket = null;
    /** @type {Map<string, RemotePlayer>} */
    this.players = new Map();
    /** 自身 id */
    this.id = null;
    /** 是否已连接 */
    this.connected = false;
    /** 上次发送位置的时间 (限频 10Hz) */
    this.lastSendTime = 0;
    /** 上次发送的位置 (避免重复发送) */
    this.lastSentX = 0; this.lastSentY = 0; this.lastSentZ = 0;
  }

  /**
   * 连接到服务器
   * @param {string} url 服务器地址 (ws://host:port)
   * @param {string} name 玩家名
   * @param {number|string} seed 世界种子 (相同种子 = 同一房间)
   * @returns {Promise<void>}
   */
  connect(url, name, seed) {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(url);
      } catch (e) {
        reject(e);
        return;
      }
      this.socket.onopen = () => {
        this.connected = true;
        this.socket.send(JSON.stringify({ type: 'join', name, seed }));
        resolve();
      };
      this.socket.onclose = () => {
        this.connected = false;
        this._cleanup();
      };
      this.socket.onerror = (e) => {
        reject(new Error('WebSocket 连接失败'));
      };
      this.socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          this._handleMessage(msg);
        } catch (err) {
          console.warn('解析消息失败:', err);
        }
      };
    });
  }

  /**
   * 处理服务器消息
   * @param {Object} msg
   */
  _handleMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        this.id = msg.id;
        for (const p of (msg.players || [])) {
          const rp = new RemotePlayer(p.id, p.name, this.scene);
          rp.setTransform(p.x, p.y, p.z, p.yaw, p.pitch);
          this.players.set(p.id, rp);
        }
        break;
      case 'player_join': {
        if (msg.id === this.id) break;
        const rp = new RemotePlayer(msg.id, msg.name, this.scene);
        rp.setTransform(msg.x, msg.y, msg.z, 0, 0);
        this.players.set(msg.id, rp);
        if (this.callbacks.onPlayerJoin) this.callbacks.onPlayerJoin(msg.name);
        break;
      }
      case 'player_leave': {
        const rp = this.players.get(msg.id);
        if (rp) {
          rp.dispose();
          this.players.delete(msg.id);
          if (this.callbacks.onPlayerLeave) this.callbacks.onPlayerLeave(rp.name);
        }
        break;
      }
      case 'player_move': {
        const rp = this.players.get(msg.id);
        if (rp) rp.setTransform(msg.x, msg.y, msg.z, msg.yaw, msg.pitch);
        break;
      }
      case 'block':
        // 远程方块修改, 应用到本地世界 (避免回调环: 不再广播)
        if (this.world && this.world.setBlockRemote) {
          this.world.setBlockRemote(msg.x, msg.y, msg.z, msg.id);
        } else if (this.world) {
          this.world.setBlock(msg.x, msg.y, msg.z, msg.id);
        }
        break;
      case 'chat':
        if (this.callbacks.onChat) this.callbacks.onChat(msg.name, msg.text);
        break;
    }
  }

  /**
   * 每帧更新 (插值远程玩家位置)
   * @param {number} dt
   */
  update(dt) {
    for (const rp of this.players.values()) {
      rp.update(dt);
    }
  }

  /**
   * 发送本地玩家位置 (限频 10Hz + 仅在移动时)
   * @param {THREE.Vector3} pos
   * @param {number} yaw
   * @param {number} pitch
   */
  sendPlayerMove(pos, yaw, pitch) {
    if (!this.connected) return;
    const now = performance.now();
    if (now - this.lastSendTime < 100) return; // 10Hz
    // 仅在位置变化超过 0.05 时发送
    const dx = pos.x - this.lastSentX;
    const dy = pos.y - this.lastSentY;
    const dz = pos.z - this.lastSentZ;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05 && Math.abs(dz) < 0.05) return;
    this.lastSendTime = now;
    this.lastSentX = pos.x; this.lastSentY = pos.y; this.lastSentZ = pos.z;
    this.socket.send(JSON.stringify({
      type: 'move', x: pos.x, y: pos.y, z: pos.z, yaw, pitch,
    }));
  }

  /**
   * 广播方块修改 (本地破坏/放置后调用)
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} id 方块 id (0=空气)
   */
  sendBlockChange(x, y, z, id) {
    if (!this.connected) return;
    this.socket.send(JSON.stringify({ type: 'block', x, y, z, id }));
  }

  /**
   * 发送聊天消息
   * @param {string} text
   */
  sendChat(text) {
    if (!this.connected) return;
    this.socket.send(JSON.stringify({ type: 'chat', text }));
  }

  /**
   * 清理 (断开后)
   */
  _cleanup() {
    for (const rp of this.players.values()) {
      rp.dispose();
    }
    this.players.clear();
    this.id = null;
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      try {
        this.socket.send(JSON.stringify({ type: 'leave' }));
      } catch {}
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
    this._cleanup();
  }
}
