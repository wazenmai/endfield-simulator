'use strict';
const assert = require('assert');
const { loadEngine } = require('./_load');
const E = loadEngine();
const { MiFu, BattleState, SKILL_TYPE, JOB_CLASS, DAMAGE_TYPE, EFFECT_TYPE, PHYSICAL_ABNORMALITY_TYPE } = E;

const char = new MiFu();
assert.strictEqual(char.name, '弭芙', 'name');
assert.strictEqual(char.stars, 6, 'stars');
assert.strictEqual(char.jobClass, JOB_CLASS.GUARD, 'jobClass');
assert.strictEqual(char.damageType, DAMAGE_TYPE.PHYSICAL, 'damageType');

const battle = new BattleState([char], 1);
const enemy = battle.enemies[0];

// Stage 1: 斷雲 costs 100, returns 50, advances to 追形
assert.strictEqual(char.specialState.skillStage, 'duanyun', 'starts on 斷雲');
assert.strictEqual(char.battleTechCost(battle), 100, '斷雲 costs 100');
const fx1 = char.useSkill(SKILL_TYPE.BATTLE, [enemy], battle);
assert.ok(fx1.some(f => f.type === EFFECT_TYPE.TECH_RESTORE && f.amount === 50), '斷雲 returns 50 技力');
assert.strictEqual(char.specialState.skillStage, 'zhuixing', '→ 追形');
assert.strictEqual(char.battleTechCost(battle), 50, '追形 costs 50');

// 追形 with break < 3 → resets to 斷雲
enemy.armorBreak = 1;
char.useSkill(SKILL_TYPE.BATTLE, [enemy], battle);
assert.strictEqual(char.specialState.skillStage, 'duanyun', '追形 (break<3) resets to 斷雲');

// 追形 with break >= 3 → advances to 開天
char._setStage('zhuixing');
enemy.armorBreak = 3;
char.useSkill(SKILL_TYPE.BATTLE, [enemy], battle);
assert.strictEqual(char.specialState.skillStage, 'kaitian', '追形 (break>=3) → 開天');

// 開天 → back to 斷雲
const fxK = char.useSkill(SKILL_TYPE.BATTLE, [enemy], battle);
assert.ok(fxK.some(f => f.type === EFFECT_TYPE.PHYSICAL_ABNORMALITY && f.abnormalType === PHYSICAL_ABNORMALITY_TYPE.CRUSH), '開天 is 猛擊');
assert.strictEqual(char.specialState.skillStage, 'duanyun', '開天 resets to 斷雲');

// 連攜技 sets stage to 追形
char.useSkill(SKILL_TYPE.CHAIN, [enemy], battle);
assert.strictEqual(char.specialState.skillStage, 'zhuixing', '連攜技 → 追形');

console.log('MiFu tests passed');
