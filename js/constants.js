'use strict';

const SKILL_TYPE = Object.freeze({
  BATTLE: 'battle',
  CHAIN: 'chain',
  ULTIMATE: 'ultimate'
});

const JOB_CLASS = Object.freeze({
  GUARD: '近衛',
  VANGUARD: '先鋒',
  ASSAULT: '突擊',
  CASTER: '術師',
  DEFENDER: '重裝',
  SUPPORT: '輔助'
});

const DAMAGE_TYPE = Object.freeze({
  PHYSICAL: 'physical',
  FIRE: 'fire',
  ELECTRIC: 'electric',
  NATURE: 'nature',
  COLD: 'cold'
});

const SPELL_ELEMENT = Object.freeze({
  FIRE: 'fire',
  ELECTRIC: 'electric',
  NATURE: 'nature',
  COLD: 'cold'
});

const PHYSICAL_ABNORMALITY_TYPE = Object.freeze({
  CRUSH: 'crush',           // 猛擊
  ARMOR_CRUSH: 'armorCrush', // 碎甲
  KNOCKDOWN: 'knockdown',   // 倒地
  LAUNCHED: 'launched'      // 擊飛
});

const SPELL_ABNORMALITY_TYPE = Object.freeze({
  BURNING: 'burning',       // 燃燒 🔥
  CONDUCTING: 'conducting', // 導電 ⚡
  CORROSION: 'corrosion',   // 腐蝕 🤢
  FROZEN: 'frozen'          // 凍結 ❄️
});

const EFFECT_TYPE = Object.freeze({
  ARMOR_BREAK: 'ARMOR_BREAK',
  PHYSICAL_ABNORMALITY: 'PHYSICAL_ABNORMALITY',
  SPELL_ATTACH: 'SPELL_ATTACH',
  SPELL_ATTACH_CLEAR: 'SPELL_ATTACH_CLEAR',
  SPELL_ATTACH_CLEAR_ALL: 'SPELL_ATTACH_CLEAR_ALL',
  SPELL_ABNORMALITY: 'SPELL_ABNORMALITY',
  SPELL_ABNORMALITY_CLEAR: 'SPELL_ABNORMALITY_CLEAR',
  VULNERABLE: 'VULNERABLE',
  DEBUFF: 'DEBUFF',
  SPECIAL_STATE: 'SPECIAL_STATE',
  TIMED_CHAR_STATE: 'TIMED_CHAR_STATE',  // timed buff on a character's specialState
  LOG_ONLY: 'LOG_ONLY',
  TECH_RESTORE: 'TECH_RESTORE',
  ULTIMATE_CHARGE: 'ULTIMATE_CHARGE',
  CHAIN_EVENT: 'CHAIN_EVENT'
});

const CHAIN_EVENT_TYPE = Object.freeze({
  ARMOR_BREAK_GAINED: 'ARMOR_BREAK_GAINED',
  ARMOR_BREAK_4: 'ARMOR_BREAK_4',
  PHYSICAL_ABNORMALITY_CONSUMED: 'PHYSICAL_ABNORMALITY_CONSUMED', // 猛擊 or 碎甲 consumed 破防
  SPELL_ATTACHMENT_APPLIED: 'SPELL_ATTACHMENT_APPLIED',
  SPELL_ABNORMALITY_APPLIED: 'SPELL_ABNORMALITY_APPLIED',
  CONDUCTING_CHANGED: 'CONDUCTING_CHANGED',          // 導電 entered or exited
  FROZEN_APPLIED: 'FROZEN_APPLIED',
  BURNING_APPLIED: 'BURNING_APPLIED',
  CORROSION_APPLIED: 'CORROSION_APPLIED',
  ENEMY_HAS_BREAK_AND_ATTACHMENT: 'ENEMY_HAS_BREAK_AND_ATTACHMENT',
  HEAVY_HIT_ANY: 'HEAVY_HIT_ANY',                   // any skill tagged heavy
  HEAVY_HIT_PHYSICAL_VULN: 'HEAVY_HIT_PHYSICAL_VULN', // heavy on phys-vuln or 碎甲 enemy
  HEAVY_HIT_NO_BREAK_NO_ATTACH: 'HEAVY_HIT_NO_BREAK_NO_ATTACH',
  HEAVY_HIT_ELECTRIC: 'HEAVY_HIT_ELECTRIC',          // heavy on electric-attach/conducting
  HEAVY_HIT_FROZEN: 'HEAVY_HIT_FROZEN',              // heavy on frozen enemy
  CHAIN_SKILL_USED: 'CHAIN_SKILL_USED',
  ENEMY_IMBALANCE: 'ENEMY_IMBALANCE',
  CRYSTAL_CHARGES_DEPLETED: 'CRYSTAL_CHARGES_DEPLETED',
  MAIN_UNIT_ATTACKED: 'MAIN_UNIT_ATTACKED',
  MAIN_UNIT_HP_LOW: 'MAIN_UNIT_HP_LOW',
  FOCUSED_ENEMY_ABNORMALITY: 'FOCUSED_ENEMY_ABNORMALITY',
  SPELL_ABNORMALITY_CONSUMED: 'SPELL_ABNORMALITY_CONSUMED',  // 阿列什: 法術異常 consumed
  FIRE_ATTACHMENT_CONSUMED: 'FIRE_ATTACHMENT_CONSUMED',     // 卡繆: 灼熱附著 consumed or absorbed
  EXECUTE_ATTACK: 'EXECUTE_ATTACK'                          // 處決攻擊 on an imbalanced enemy
});

const VULNERABLE_TYPE = Object.freeze({
  PHYSICAL: 'physical',
  SPELL: 'spell',
  COLD: 'cold',
  ELECTRIC: 'electric',
  FIRE: 'fire',
  NATURE: 'nature'
});

// Colour schema for element types
const ELEMENT_COLOR = Object.freeze({
  fire:     { primary: '#e53935', bg: '#ffcdd2', text: '#b71c1c', cssClass: 'fire' },
  cold:     { primary: '#1e88e5', bg: '#bbdefb', text: '#0d47a1', cssClass: 'cold' },
  nature:   { primary: '#43a047', bg: '#c8e6c9', text: '#1b5e20', cssClass: 'nature' },
  electric: { primary: '#f9a825', bg: '#fff9c4', text: '#f57f17', cssClass: 'electric' },
  physical: { primary: '#757575', bg: '#eeeeee', text: '#424242', cssClass: 'physical' }
});

// Maps damage type string (from CSV) to internal DAMAGE_TYPE key
const DAMAGE_TYPE_MAP = Object.freeze({
  '物理': DAMAGE_TYPE.PHYSICAL,
  '灼熱': DAMAGE_TYPE.FIRE,
  '電磁': DAMAGE_TYPE.ELECTRIC,
  '自然': DAMAGE_TYPE.NATURE,
  '寒冷': DAMAGE_TYPE.COLD
});

// Maps DAMAGE_TYPE to CSS class
const DAMAGE_TYPE_CSS = Object.freeze({
  [DAMAGE_TYPE.PHYSICAL]: 'physical',
  [DAMAGE_TYPE.FIRE]: 'fire',
  [DAMAGE_TYPE.ELECTRIC]: 'electric',
  [DAMAGE_TYPE.NATURE]: 'nature',
  [DAMAGE_TYPE.COLD]: 'cold'
});

// Which spell elements combine to produce each abnormality
// To trigger abnormality X: need at least one OTHER element + X element
const ABNORMALITY_TRIGGER = Object.freeze({
  [SPELL_ABNORMALITY_TYPE.BURNING]:    SPELL_ELEMENT.FIRE,
  [SPELL_ABNORMALITY_TYPE.CONDUCTING]: SPELL_ELEMENT.ELECTRIC,
  [SPELL_ABNORMALITY_TYPE.CORROSION]:  SPELL_ELEMENT.NATURE,
  [SPELL_ABNORMALITY_TYPE.FROZEN]:     SPELL_ELEMENT.COLD
});

const ULTIMATE_MAX = Object.freeze({
  [JOB_CLASS.ASSAULT]: 300,
  default: 180
});

const TECH_POWER_MAX = 100;
const TECH_POWER_COST = 30;
const TECH_POWER_REGEN_AMOUNT = 5;
const TECH_POWER_REGEN_INTERVAL_MS = 3000;
const ULTIMATE_CHARGE_PER_SKILL = 30;

const MAX_ATTACHMENT_LAYERS = 4;
const MAX_ARMOR_BREAK = 4;

// Durations in milliseconds for timed effects
const TIMED_EFFECT_DURATIONS = Object.freeze({
  CRYSTAL_ATTACHED: 20000,  // 管理員 源石結晶: 20s
  CRYSTAL_CHARGES:  40000,  // 塞希 支援晶體: 40s
  DEFAULT_STATE:    40000,  // vulnerable / debuff / spellAbnormality / specialStates default
  // Per-effect durations (see docs: each operator's chain-applied effect lasts a different time)
  CHAIN_CONDUCTING:  5000,  // 佩麗卡 連攜技 導電 ⚡: 5s
  JIE_LAUNCH:        5000,  // 潔爾佩塔 大招 擊飛 / 法術脆弱: 5s
  TANG_VORTEX:       3000,  // 湯湯 水龍捲: 3s
  TANG_SPELL_VULN:  15000,  // 湯湯 戰技 法術脆弱: 15s
  LAMB_CORROSION:    7000,  // 艾爾黛拉 連攜技 腐蝕 🤢: 7s
  COLD_VULN:        15000,  // 別禮 寒冷脆弱: 15s
  ELECTRIC_AMP:      5000,  // 莊芳宜 電磁增幅: 5s
  TIANLI_STATE:     10000,  // 莊芳宜 天理合真: 10s (matches ultimate active window)
  HUNT_MODE:        10000,  // 卡繆 追獵 替換戰技: 10s after 大招
  FIRE_WINGS:       30000,  // 卡繆 銜火血翼 (long 虛弱/灼熱脆弱): 30s
  SKILL_STAGE:      10000,  // 弭芙 戰技替換視窗 (斷雲→追形→開天): 10s
});
