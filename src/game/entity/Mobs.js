/**
 * @file 生物种类
 * @description 各 MobType 的具体实体类, 继承 Entity, 构建 3D 模型 + 配置生命值/速度等
 */

import { Entity, MobType, MobCategory } from './Entity.js';
import {
  createCowModel, createPigModel, createSheepModel,
  createChickenModel, createZombieModel, createSpiderModel,
} from '../../components/MobModels.js';

/**
 * 牛
 */
export class Cow extends Entity {
  /**
   * @param {number} id 实体 id
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  constructor(id, x, y, z) {
    super({
      id, type: MobType.COW, category: MobCategory.PASSIVE,
      x, y, z,
      width: 0.9, height: 1.3,
      health: 10, maxHealth: 10,
    });
    const model = createCowModel();
    this.group.add(model);
    this.targetYaw = Math.random() * Math.PI * 2;
    this.yaw = this.targetYaw;
  }
}

/**
 * 猪
 */
export class Pig extends Entity {
  constructor(id, x, y, z) {
    super({
      id, type: MobType.PIG, category: MobCategory.PASSIVE,
      x, y, z,
      width: 0.8, height: 0.85,
      health: 10, maxHealth: 10,
    });
    const model = createPigModel();
    this.group.add(model);
    this.targetYaw = Math.random() * Math.PI * 2;
    this.yaw = this.targetYaw;
  }
}

/**
 * 羊
 */
export class Sheep extends Entity {
  constructor(id, x, y, z) {
    super({
      id, type: MobType.SHEEP, category: MobCategory.PASSIVE,
      x, y, z,
      width: 0.85, height: 1.1,
      health: 8, maxHealth: 8,
    });
    const model = createSheepModel();
    this.group.add(model);
    this.targetYaw = Math.random() * Math.PI * 2;
    this.yaw = this.targetYaw;
  }
}

/**
 * 鸡
 */
export class Chicken extends Entity {
  constructor(id, x, y, z) {
    super({
      id, type: MobType.CHICKEN, category: MobCategory.PASSIVE,
      x, y, z,
      width: 0.5, height: 0.7,
      health: 4, maxHealth: 4,
    });
    const model = createChickenModel();
    this.group.add(model);
    this.targetYaw = Math.random() * Math.PI * 2;
    this.yaw = this.targetYaw;
  }
}

/**
 * 僵尸 (敌对, 仅夜晚生成)
 */
export class Zombie extends Entity {
  constructor(id, x, y, z) {
    super({
      id, type: MobType.ZOMBIE, category: MobCategory.HOSTILE,
      x, y, z,
      width: 0.6, height: 1.9,
      health: 20, maxHealth: 20,
    });
    const model = createZombieModel();
    this.group.add(model);
    this.targetYaw = Math.random() * Math.PI * 2;
    this.yaw = this.targetYaw;
  }
}

/**
 * 蜘蛛 (敌对, 可昼夜生成, 会爬墙 - 简化: 仅平地移动)
 */
export class Spider extends Entity {
  constructor(id, x, y, z) {
    super({
      id, type: MobType.SPIDER, category: MobCategory.HOSTILE,
      x, y, z,
      width: 1.0, height: 0.7,
      health: 16, maxHealth: 16,
    });
    const model = createSpiderModel();
    this.group.add(model);
    this.targetYaw = Math.random() * Math.PI * 2;
    this.yaw = this.targetYaw;
  }
}

/**
 * 根据 MobType 实例化对应实体
 * @param {MobType} type
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {Entity|null}
 */
export function createMobByType(type, id, x, y, z) {
  switch (type) {
    case MobType.COW: return new Cow(id, x, y, z);
    case MobType.PIG: return new Pig(id, x, y, z);
    case MobType.SHEEP: return new Sheep(id, x, y, z);
    case MobType.CHICKEN: return new Chicken(id, x, y, z);
    case MobType.ZOMBIE: return new Zombie(id, x, y, z);
    case MobType.SPIDER: return new Spider(id, x, y, z);
    default: return null;
  }
}
