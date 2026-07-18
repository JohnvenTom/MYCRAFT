/**
 * @file IndexedDB 持久化封装
 * @description 存储区块数据与世界元信息; 使用原生 IDB API, 无第三方依赖
 */

import { DB_NAME, DB_VERSION, WORLD_META_KEY } from '../config/constants.js';

/** @type {IDBDatabase|null} */
let dbPromise = null;

/**
 * 打开/初始化数据库
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('chunks')) {
        const store = db.createObjectStore('chunks', { keyPath: 'key' });
        store.createIndex('cx_cz', ['cx', 'cz'], { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * 保存区块数据
 * @param {number} cx 区块 X
 * @param {number} cz 区块 Z
 * @param {Uint8Array} blocks 方块数据
 * @returns {Promise<void>}
 */
export async function saveChunk(cx, cz, blocks) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chunks', 'readwrite');
    const store = tx.objectStore('chunks');
    const record = {
      key: `${cx},${cz}`,
      cx, cz,
      blocks: blocks.buffer,
      version: DB_VERSION,
    };
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 加载区块数据
 * @param {number} cx 区块 X
 * @param {number} cz 区块 Z
 * @returns {Promise<Uint8Array|null>}
 */
export async function loadChunk(cx, cz) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chunks', 'readonly');
    const store = tx.objectStore('chunks');
    const req = store.get(`${cx},${cz}`);
    req.onsuccess = () => {
      if (!req.result) return resolve(null);
      resolve(new Uint8Array(req.result.blocks));
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * 保存世界元信息
 * @param {Object} meta 元信息 { seed, playerPos, playerRot, time, settings }
 * @returns {Promise<void>}
 */
export async function saveMeta(meta) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key: WORLD_META_KEY, ...meta });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 加载世界元信息
 * @returns {Promise<Object|null>}
 */
export async function loadMeta() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get(WORLD_META_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 删除全部存档数据
 * @returns {Promise<void>}
 */
export async function clearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['chunks', 'meta'], 'readwrite');
    tx.objectStore('chunks').clear();
    tx.objectStore('meta').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 检测是否已存在存档
 * @returns {Promise<boolean>}
 */
export async function hasSave() {
  const meta = await loadMeta();
  return !!meta;
}
