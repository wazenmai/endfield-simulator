'use strict';
const assert = require('assert');
const { loadEngine } = require('./_load');
const E = loadEngine();
const { ZhuangFangYi, BattleState, SKILL_TYPE, JOB_CLASS, DAMAGE_TYPE, EFFECT_TYPE, SPELL_ELEMENT, SPELL_ABNORMALITY_TYPE } = E;

const char = new ZhuangFangYi();
assert.strictEqual(char.name, '莊芳宜', 'name');
assert.strictEqual(char.stars, 6, 'stars');
assert.strictEqual(char.jobClass, JOB_CLASS.ASSAULT, 'jobClass');
assert.strictEqual(char.damageType, DAMAGE_TYPE.ELECTRIC, 'damageType');

const battle = new BattleState([char], 1);
const enemy = battle.enemies[0];

// 連攜技 on electric-attached enemy → consume electric + apply conducting
enemy.spellAttachment.electric = 2;
const chainFx = char.useSkill(SKILL_TYPE.CHAIN, [enemy], battle);
assert.ok(chainFx.some(f => f.type === EFFECT_TYPE.SPELL_ATTACH_CLEAR && f.element === SPELL_ELEMENT.ELECTRIC), 'chain clears electric');
assert.ok(chainFx.some(f => f.type === EFFECT_TYPE.SPELL_ABNORMALITY && f.abnormalType === SPELL_ABNORMALITY_TYPE.CONDUCTING && f.level === 2), 'chain applies 導電 level 2');

// 戰技 with no 導電 and < 3 swords → generate 1 sword
const battleFx = char.useSkill(SKILL_TYPE.BATTLE, [enemy], battle);
assert.strictEqual(char.specialState.azureSwords, 1, 'one sword generated');
assert.ok(battleFx.some(f => f.type === EFFECT_TYPE.ULTIMATE_CHARGE), 'sword strike charges ult');

// 大招 → enter 天理合真 + battleTechCost becomes free for first skill
char.useSkill(SKILL_TYPE.ULTIMATE, [enemy], battle);
assert.strictEqual(char.specialState.tianliState, true, 'tianli active');
assert.strictEqual(char.battleTechCost(battle), 0, 'first 天理 戰技 is free');
// In 天理, 戰技 guarantees 3 swords
char.specialState.azureSwords = 0;
char.useSkill(SKILL_TYPE.BATTLE, [enemy], battle);
assert.strictEqual(char.specialState.azureSwords, 3, '天理 戰技 yields 3 swords');
assert.strictEqual(char.battleTechCost(battle), 30, 'second 天理 戰技 costs 技力 again');

console.log('ZhuangFangYi tests passed');
