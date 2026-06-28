'use strict';
const assert = require('assert');
const { loadEngine } = require('./_load');
const E = loadEngine();
const { KaMiu, BattleState, SKILL_TYPE, JOB_CLASS, DAMAGE_TYPE, EFFECT_TYPE, CHAIN_EVENT_TYPE } = E;

const char = new KaMiu();
assert.strictEqual(char.name, '卡繆', 'name');
assert.strictEqual(char.stars, 6, 'stars');
assert.strictEqual(char.jobClass, JOB_CLASS.VANGUARD, 'jobClass');
assert.strictEqual(char.damageType, DAMAGE_TYPE.FIRE, 'damageType');

const battle = new BattleState([char], 1);
const enemy = battle.enemies[0];

// 戰技 applies 銜火血翼 to the enemy
const fx = char.useSkill(SKILL_TYPE.BATTLE, [enemy], battle);
assert.ok(fx.some(f => f.type === EFFECT_TYPE.SPECIAL_STATE && f.key === 'fireWings' && f.value === true), 'applies 銜火血翼');
assert.ok(fx.some(f => f.type === EFFECT_TYPE.DEBUFF && f.debuffType === 'weak'), 'applies 虛弱');

// 大招 → enter huntMode, next 戰技 becomes 追獵 (free)
char.useSkill(SKILL_TYPE.ULTIMATE, [enemy], battle);
assert.strictEqual(char.specialState.huntMode, true, 'huntMode active after 大招');
assert.strictEqual(char.battleTechCost(battle), 0, '追獵 is free');
assert.strictEqual(char.currentSkillLabel(battle), '戰技\n追獵', 'label shows 追獵');

// 追獵 acts as a chain skill and clears huntMode
const huntFx = char.useSkill(SKILL_TYPE.BATTLE, [enemy], battle);
assert.ok(huntFx.some(f => f.type === EFFECT_TYPE.CHAIN_EVENT &&
  f.events.some(e => e.type === CHAIN_EVENT_TYPE.CHAIN_SKILL_USED)), '追獵 emits chain-skill-used');
assert.strictEqual(char.specialState.huntMode, false, 'huntMode consumed');

// FIRE_ATTACHMENT_CONSUMED unlocks 卡繆 chain
enemy.spellAttachment.fire = 2;
const res = enemy.clearSpellAttachment('fire', battle.log);
assert.ok(res.chainEvents.some(e => e.type === CHAIN_EVENT_TYPE.FIRE_ATTACHMENT_CONSUMED), 'fire clear emits FIRE_ATTACHMENT_CONSUMED');
for (const e of res.chainEvents) battle.fireChainEvent(e);
assert.ok(battle.chainAvailable.has('卡繆'), '卡繆 chain unlocked by fire consumption');

console.log('KaMiu tests passed');
