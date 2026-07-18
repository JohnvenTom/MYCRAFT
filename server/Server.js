/**
 * @file 多人联机 WebSocket 服务器 (原生 Node.js 实现, 无外部依赖)
 * @description 协议:
 *   客户端 → 服务器:
 *     {type:'join', name, seed}                  加入房间
 *     {type:'move', x, y, z, yaw, pitch}        位置/朝向更新
 *     {type:'block', x, y, z, id}              方块修改
 *     {type:'chat', text}                       聊天消息
 *     {type:'leave'}                            离开
 *   服务器 → 客户端:
 *     {type:'welcome', id, players:[{id,name,x,y,z,yaw,pitch}]}   欢迎包 (含现有玩家列表)
 *     {type:'player_join', id, name}            新玩家加入
 *     {type:'player_leave', id}                 玩家离开
 *     {type:'player_move', id, x, y, z, yaw, pitch}  玩家位置更新
 *     {type:'block', x, y, z, id, by}          方块修改广播
 *     {type:'chat', id, name, text}            聊天广播
 *
 * 启动: node server/Server.js [port]
 *   默认端口 8080
 */

import http from 'http';
import crypto from 'crypto';

/** 默认端口 */
const PORT = parseInt(process.argv[2] || '8080', 10);

/** 房间: seed → Set<client> */
const rooms = new Map();

/**
 * 简单 UUID 生成
 * @returns {string}
 */
function uuid() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * 创建 WebSocket 帧并发送
 * @param {import('net').Socket} socket
 * @param {string|object} data 数据 (对象会自动 JSON 序列化)
 */
function send(socket, data) {
  if (socket.destroyed) return;
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  const payloadBytes = Buffer.from(payload, 'utf-8');
  const len = payloadBytes.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text frame
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  socket.write(Buffer.concat([header, payloadBytes]));
}

/**
 * 广播消息到房间内所有客户端 (排除发送者)
 * @param {Set} room
 * @param {object} msg
 * @param {object} [except] 排除的客户端
 */
function broadcast(room, msg, except) {
  for (const client of room) {
    if (client === except) continue;
    send(client.socket, msg);
  }
}

/**
 * 处理 WebSocket 握手
 * @param {import('http').IncomingMessage} req
 * @param {import('net').Socket} socket
 */
function handleUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ];
  socket.write(headers.join('\r\n'));

  // 创建 client 对象
  const client = {
    id: uuid(),
    socket,
    name: 'Player',
    seed: null,
    room: null,
    x: 0, y: 64, z: 0, yaw: 0, pitch: 0,
  };

  // 缓冲区 (处理分片)
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    // 解析所有完整帧
    while (buffer.length >= 2) {
      const parsed = parseFrame(buffer);
      if (!parsed) break;
      buffer = buffer.slice(parsed.consumed);
      if (parsed.message) {
        handleMessage(client, parsed.message);
      }
    }
  });

  socket.on('close', () => handleDisconnect(client));
  socket.on('error', () => handleDisconnect(client));
}

/**
 * 解析 WebSocket 帧 (支持 64 位长度, 文本帧)
 * @param {Buffer} buf
 * @returns {{message: string|null, consumed: number}|null}
 */
function parseFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  let mask = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    mask = buf.slice(offset, offset + 4);
    offset += 4;
  }

  if (buf.length < offset + payloadLen) return null;

  let payload = buf.slice(offset, offset + payloadLen);
  if (masked) {
    payload = Buffer.from(payload); // 复制
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
  }

  // opcode 8 = close
  if (opcode === 8) {
    return { message: null, consumed: offset + payloadLen };
  }
  // opcode 9/10 = ping/pong (忽略)
  if (opcode === 9 || opcode === 10) {
    return { message: null, consumed: offset + payloadLen };
  }

  const message = payload.toString('utf-8');
  return { message, consumed: offset + payloadLen };
}

/**
 * 处理客户端消息
 * @param {object} client
 * @param {string} raw
 */
function handleMessage(client, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg.type !== 'string') return;

  switch (msg.type) {
    case 'join': {
      // 离开旧房间
      if (client.room) {
        client.room.delete(client);
        broadcast(client.room, { type: 'player_leave', id: client.id });
      }
      client.name = (msg.name || 'Player').slice(0, 16);
      client.seed = msg.seed || 'default';
      client.x = msg.x || 0; client.y = msg.y || 64; client.z = msg.z || 0;
      client.yaw = 0; client.pitch = 0;
      // 加入新房间
      if (!rooms.has(client.seed)) rooms.set(client.seed, new Set());
      const room = rooms.get(client.seed);
      client.room = room;
      room.add(client);
      // 发送欢迎包: 现有所有玩家
      const players = [];
      for (const c of room) {
        if (c === client) continue;
        players.push({ id: c.id, name: c.name, x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: c.pitch });
      }
      send(client.socket, { type: 'welcome', id: client.id, players });
      // 通知房间内其他玩家
      broadcast(room, { type: 'player_join', id: client.id, name: client.name, x: client.x, y: client.y, z: client.z }, client);
      break;
    }
    case 'move': {
      client.x = msg.x; client.y = msg.y; client.z = msg.z;
      client.yaw = msg.yaw; client.pitch = msg.pitch;
      if (client.room) {
        broadcast(client.room, { type: 'player_move', id: client.id, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch });
      }
      break;
    }
    case 'block': {
      if (client.room) {
        broadcast(client.room, { type: 'block', x: msg.x, y: msg.y, z: msg.z, id: msg.id, by: client.id }, client);
      }
      break;
    }
    case 'chat': {
      if (client.room) {
        broadcast(client.room, { type: 'chat', id: client.id, name: client.name, text: String(msg.text).slice(0, 100) });
      }
      break;
    }
    case 'leave': {
      handleDisconnect(client);
      break;
    }
  }
}

/**
 * 处理客户端断开
 * @param {object} client
 */
function handleDisconnect(client) {
  if (client.socket && !client.socket.destroyed) {
    try { client.socket.destroy(); } catch {}
  }
  if (client.room) {
    client.room.delete(client);
    broadcast(client.room, { type: 'player_leave', id: client.id });
    if (client.room.size === 0) rooms.delete(client.seed);
    client.room = null;
  }
}

// HTTP 服务器, 用于升级 WebSocket
const server = http.createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const info = [];
    for (const [seed, room] of rooms) {
      info.push({ seed, players: room.size });
    }
    res.end(JSON.stringify({ rooms: info, total: info.reduce((a, b) => a + b.players, 0) }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('MYCRAFT Multiplayer Server. Connect via WebSocket.');
});

server.on('upgrade', (req, socket) => {
  if (req.headers.upgrade !== 'websocket') {
    socket.destroy();
    return;
  }
  handleUpgrade(req, socket);
});

server.listen(PORT, () => {
  console.log(`MYCRAFT 多人联机服务器已启动: ws://localhost:${PORT}`);
  console.log(`状态接口: http://localhost:${PORT}/status`);
});
