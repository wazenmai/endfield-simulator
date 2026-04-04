'use strict';

// ── Base Character ────────────────────────────────────────────────────────────
class Character {
  constructor({ name, stars, jobClass, damageType,
                skillDesc, chainDesc, ultimateDesc, chainConditionText,
                talent1 = '', talent2 = '', specialMechanic = '' }) {
    this.name = name;
    this.stars = stars;
    this.jobClass = jobClass;
    this.damageType = damageType;
    this.skillDesc = skillDesc;
    this.chainDesc = chainDesc;
    this.ultimateDesc = ultimateDesc;
    this.chainConditionText = chainConditionText;
    this.talent1 = talent1;
    this.talent2 = talent2;
    this.specialMechanic = specialMechanic;
    this.specialState = {};
  }

  useSkill(skillType, targets, battle) {
    throw new Error(`${this.name}.useSkill() not implemented`);
  }

  /** Called by BattleState when main unit lands a heavy hit on `target`. Returns chainEvents[]. */
  onHeavyAttack(_target, _battle) { return []; }

  colorClass() { return DAMAGE_TYPE_CSS[this.damageType] || 'physical'; }

  _heavyHitEvents(target) {
    const evts = [{ type: CHAIN_EVENT_TYPE.HEAVY_HIT_ANY, enemy: target }];
    if (target.vulnerable.physical || target.physicalAbnormality === PHYSICAL_ABNORMALITY_TYPE.ARMOR_CRUSH)
      evts.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_PHYSICAL_VULN, enemy: target });
    if (target.spellAttachment.electric > 0 || target.spellAbnormality.conducting)
      evts.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_ELECTRIC, enemy: target });
    if (target.spellAbnormality.frozen)
      evts.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_FROZEN, enemy: target });
    if (!target.armorBreak && !target.hasAnySpellAttachment())
      evts.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_NO_BREAK_NO_ATTACH, enemy: target });
    return evts;
  }

  _logOnly(msg)                          { return { type: EFFECT_TYPE.LOG_ONLY, message: msg }; }
  _chainEvent(evts)                      { return { type: EFFECT_TYPE.CHAIN_EVENT, events: evts }; }
  _techRestore(amt)                      { return { type: EFFECT_TYPE.TECH_RESTORE, amount: amt }; }
  _ultCharge(charName, amt)              { return { type: EFFECT_TYPE.ULTIMATE_CHARGE, charName, amount: amt }; }
  _spellAttach(el, n, target)            { return { type: EFFECT_TYPE.SPELL_ATTACH, element: el, layers: n, target }; }
  _spellAttachClear(el, target)          { return { type: EFFECT_TYPE.SPELL_ATTACH_CLEAR, element: el, target }; }
  _spellAttachClearAll(target)           { return { type: EFFECT_TYPE.SPELL_ATTACH_CLEAR_ALL, target }; }
  _spellAbnorm(abnType, target)          { return { type: EFFECT_TYPE.SPELL_ABNORMALITY, abnormalType: abnType, target }; }
  _spellAbnormClear(abnType, target)     { return { type: EFFECT_TYPE.SPELL_ABNORMALITY_CLEAR, abnormalType: abnType, target }; }
  _physAbnorm(abnType, target)           { return { type: EFFECT_TYPE.PHYSICAL_ABNORMALITY, abnormalType: abnType, target }; }
  _armorBreak(delta, target)             { return { type: EFFECT_TYPE.ARMOR_BREAK, delta, target }; }
  _vulnerable(vulnType, target, val = true) { return { type: EFFECT_TYPE.VULNERABLE, vulnType, value: val, target }; }
  _debuff(debuffType, target)            { return { type: EFFECT_TYPE.DEBUFF, debuffType, target }; }
  _specialState(key, value, target, label) { return { type: EFFECT_TYPE.SPECIAL_STATE, key, value, target, label }; }
}

// ════════════════════════════════════════════════════════════════════════════
//  CHARACTER DEFINITIONS
// ════════════════════════════════════════════════════════════════════════════

// ── 1. 管理員 ─────────────────────────────────────────────────────────────
class GuanLiYuan extends Character {
  constructor() {
    super({
      name: '管理員', stars: 6, jobClass: JOB_CLASS.GUARD, damageType: DAMAGE_TYPE.PHYSICAL,
      skillDesc: '物理傷害，猛擊。若敵人附著源石結晶，消耗結晶並造成二次物理傷害',
      chainDesc: '物理傷害，對敵人附著源石結晶，定住敵人',
      ultimateDesc: '大範圍物理傷害（群傷）。消耗敵人源石結晶時觸發二次物理傷害',
      chainConditionText: '連攜技造成傷害後觸發',
      talent1: '當敵人附著的源石結晶被消耗後，自身攻擊力++ 持續 15s（不疊加）',
      talent2: '附著源石結晶的敵人收到的物理傷害++',
      specialMechanic: '施加物理異常和破防會消耗源石結晶，造成物理傷害'
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：物理傷害`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.CRUSH, t));
      if (t.specialStates.crystalAttached) {
        effects.push(this._specialState('crystalAttached', false, t, '源石結晶消耗'));
        effects.push(this._logOnly(`${this.name} 觸發【源石結晶】消耗，造成二次物理傷害`));
      }
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：物理傷害`));
      effects.push(this._specialState('crystalAttached', true, t, '附著源石結晶 💎，敵人定住'));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：大範圍物理傷害（群傷）`));
      for (const enemy of targets) {
        if (enemy.specialStates.crystalAttached) {
          effects.push(this._specialState('crystalAttached', false, enemy, '源石結晶消耗'));
          effects.push(this._logOnly(`${this.name} 大招消耗 敵人 ${enemy.id} 源石結晶，二次物理傷害`));
        }
      }
    }
    return effects;
  }
}

// ── 2. 黎風 ───────────────────────────────────────────────────────────────
class LiFeng extends Character {
  constructor() {
    super({
      name: '黎風', stars: 6, jobClass: JOB_CLASS.GUARD, damageType: DAMAGE_TYPE.PHYSICAL,
      skillDesc: '2次物理傷害 + 倒地。最後一擊若敵人無破防，施加物理脆弱',
      chainDesc: '物理傷害 + 連擊（提升全隊下一次技能傷害30%/20%）',
      ultimateDesc: '群傷 + 倒地。若處於連擊狀態，大量物理傷害',
      chainConditionText: '處於物理脆弱 or 碎甲的敵人受到重擊',
      talent1: '智識、意志 → 攻擊++',
      talent2: '自身造成倒地狀態時，額外造成傷害',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：2次物理傷害`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.KNOCKDOWN, t));
      if (!t.armorBreak) {
        effects.push(this._vulnerable(VULNERABLE_TYPE.PHYSICAL, t));
        effects.push(this._logOnly(`${this.name} 最後一擊敵人無破防，施加物理脆弱`));
      } else {
      }
      effects.push(this._chainEvent(this._heavyHitEvents(t)));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：物理傷害 + 【連擊】（全隊下次技能傷害 +30%）`));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：群傷 + 倒地${battle.teamBuffs.combo ? '（連擊狀態：大量物理傷害！）' : ''}`));
      for (const enemy of targets)
        effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.KNOCKDOWN, enemy));
    }
    return effects;
  }
}

// ── 3. 陳千語 ─────────────────────────────────────────────────────────────
class ChenQianYu extends Character {
  constructor() {
    super({
      name: '陳千語', stars: 5, jobClass: JOB_CLASS.GUARD, damageType: DAMAGE_TYPE.PHYSICAL,
      skillDesc: '物理傷害 + 擊飛',
      chainDesc: '物理傷害 + 擊飛',
      ultimateDesc: '單體物理傷害',
      chainConditionText: '敵人進入破防狀態',
      talent1: '技能命中敵人後，攻擊++',
      talent2: '技能打斷敵人蓄力時，失衡++',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：物理傷害`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.LAUNCHED, t));
      effects.push(this._chainEvent(this._heavyHitEvents(t)));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：物理傷害`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.LAUNCHED, t));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：單體物理傷害`));
      effects.push(this._chainEvent(this._heavyHitEvents(t)));
    }
    return effects;
  }
}

// ── 4. 駿尉 ───────────────────────────────────────────────────────────────
class JunWei extends Character {
  constructor() {
    super({
      name: '駿尉', stars: 6, jobClass: JOB_CLASS.VANGUARD, damageType: DAMAGE_TYPE.PHYSICAL,
      skillDesc: '碎甲。基於消耗的破防層數回復技力',
      chainDesc: '根據消耗破防層數斬擊，恢復技力',
      ultimateDesc: '物理傷害，召喚4個盾衛，鐵誓 +5',
      chainConditionText: '敵人被猛擊 or 碎甲消耗破防',
      talent1: '通過自身恢復80技力後，獲得持續20s 士氣激昂（攻擊++、源石技藝強度++）',
      talent2: '當任意幹員使鐵誓-1時，該幹員獲得持續10s 士氣激昂',
      specialMechanic: '當敵人受到物理異常或自身連攜技時，鐵誓-1，召喚盾衛造成物理傷害並恢復技力；當鐵誓→0時，4名盾衛同時造成物理傷害並恢復技力'
    });
    this.specialState = { ironVow: 0 };
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      const consumed = t.armorBreak > 0 ? t.armorBreak : 0;
      effects.push(this._logOnly(`${this.name} 戰技：碎甲`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.ARMOR_CRUSH, t));
      if (consumed > 0) {
        effects.push(this._techRestore(consumed * 10));
        effects.push(this._logOnly(`${this.name} 碎甲消耗 ${consumed} 層破防，回復技力 ${consumed * 10}`));
      }
    } else if (skillType === SKILL_TYPE.CHAIN) {
      const consumed = t.armorBreak > 0 ? t.armorBreak : 0;
      effects.push(this._logOnly(`${this.name} 連攜技：斬擊物理傷害，回復技力`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.ARMOR_CRUSH, t));
      if (consumed > 0) {
        effects.push(this._techRestore(consumed * 10));
        effects.push(this._logOnly(`${this.name} 連攜技消耗 ${consumed} 層破防，回復技力 ${consumed * 10}`));
      }
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      this.specialState.ironVow = Math.max(5, this.specialState.ironVow + 5);
      effects.push(this._logOnly(`${this.name} 大招：物理傷害，召喚4盾衛，鐵誓 → ${this.specialState.ironVow}`));
    }
    return effects;
  }
}

// ── 5. 洛茜 ───────────────────────────────────────────────────────────────
class LuoXi extends Character {
  constructor() {
    super({
      name: '洛茜', stars: 6, jobClass: JOB_CLASS.GUARD, damageType: DAMAGE_TYPE.PHYSICAL,
      skillDesc: '物理傷害 + 擊飛。若目標已破防，額外造成灼熱傷害',
      chainDesc: '①物理傷害 ②清除所有法術附著，按層數造成物理傷害 + 擊飛（精準銜接：破防+1）',
      ultimateDesc: '灼熱傷害 + 灼熱附著，爆擊時高額灼熱傷害',
      chainConditionText: '敵人同時處於破防 + 法術附著',
      talent1: '戰技會對目標施加爪印斫痕持續15s（不疊加）',
      talent2: '對處於爪印斫痕的敵人造成爆擊傷害時，觸發1次攻擊力24%的灼熱傷害，且自身回復生命 ❇️。若目標處於燃燒🔥，上述傷害+治療效果提升至1.5倍',
      specialMechanic: '爪印斫痕：目標每s受到自身30%物理傷害，受到的物理傷害和灼熱傷害+12%'
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：物理傷害 + 擊飛`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.LAUNCHED, t));
      if (t.armorBreak > 0)
        effects.push(this._logOnly(`${this.name} 目標有破防，額外灼熱傷害`));
      effects.push(this._chainEvent(this._heavyHitEvents(t)));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      const total = t._totalSpellAttachment();
      effects.push(this._logOnly(`${this.name} 連攜技①：物理傷害`));
      effects.push(this._spellAttachClearAll(t));
      if (total > 0) {
        effects.push(this._logOnly(`${this.name} 連攜技②：清除法術附著 ${total} 層，${total} 段物理傷害 + 擊飛`));
        effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.LAUNCHED, t));
        effects.push(this._armorBreak(1, t));
        effects.push(this._logOnly(`${this.name} 精準銜接，破防 +1`));
      }
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：灼熱傷害，爆擊高傷`));
      effects.push(this._spellAttach(SPELL_ELEMENT.FIRE, 1, t));
    }
    return effects;
  }
}

// ── 6. 佩麗卡 ─────────────────────────────────────────────────────────────
class PeiLiKa extends Character {
  constructor() {
    super({
      name: '佩麗卡', stars: 5, jobClass: JOB_CLASS.CASTER, damageType: DAMAGE_TYPE.ELECTRIC,
      skillDesc: '電磁傷害 + 電磁附著 +1',
      chainDesc: '電磁傷害 + 導電 ⚡',
      ultimateDesc: '電磁傷害（群）',
      chainConditionText: '對敵人重擊',
      talent1: '對失衡敵人攻擊++',
      talent2: '連攜技命中破防敵人時，彈射1次',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：電磁傷害`));
      effects.push(this._spellAttach(SPELL_ELEMENT.ELECTRIC, 1, t));
      effects.push(this._chainEvent(this._heavyHitEvents(t)));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：電磁傷害`));
      effects.push(this._spellAbnorm(SPELL_ABNORMALITY_TYPE.CONDUCTING, t));
      if (t.armorBreak > 0)
        effects.push(this._logOnly(`${this.name} 命中破防敵人，觸發彈射`));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：電磁傷害（群）`));
    }
    return effects;
  }
}

// ── 7. 狼衛 ───────────────────────────────────────────────────────────────
class LangWei extends Character {
  constructor() {
    super({
      name: '狼衛', stars: 5, jobClass: JOB_CLASS.CASTER, damageType: DAMAGE_TYPE.FIRE,
      skillDesc: '若目標已燃燒🔥或導電⚡：清除所有法術附著，造成灼熱傷害。否則：灼熱傷害 + 灼熱附著',
      chainDesc: '灼熱傷害 + 灼熱附著',
      ultimateDesc: '灼熱傷害 + 燃燒 🔥',
      chainConditionText: '敵人被施加法術附著',
      talent1: '施加燃燒🔥後，自身攻擊++',
      talent2: '戰技消耗法術異常，返還技力',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      if (t.spellAbnormality.burning || t.spellAbnormality.conducting) {
        effects.push(this._logOnly(`${this.name} 戰技：目標有燃燒/導電，清除法術附著，造成灼熱傷害`));
        effects.push(this._spellAttachClearAll(t));
        effects.push(this._techRestore(15));
        effects.push(this._logOnly(`${this.name} 天賦：消耗法術異常，返還技力`));
      } else {
        effects.push(this._logOnly(`${this.name} 戰技：灼熱傷害 + 灼熱附著`));
        effects.push(this._spellAttach(SPELL_ELEMENT.FIRE, 1, t));
      }
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：灼熱傷害 + 灼熱附著`));
      effects.push(this._spellAttach(SPELL_ELEMENT.FIRE, 1, t));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：灼熱傷害 + 燃燒 🔥`));
      effects.push(this._spellAbnorm(SPELL_ABNORMALITY_TYPE.BURNING, t));
    }
    return effects;
  }
}

// ── 8. 艾爾黛拉 ──────────────────────────────────────────────────────────
class AiErDaiLa extends Character {
  constructor() {
    super({
      name: '艾爾黛拉', stars: 6, jobClass: JOB_CLASS.SUPPORT, damageType: DAMAGE_TYPE.NATURE,
      skillDesc: '自然傷害。若目標已腐蝕🤢：清除腐蝕，施加物理脆弱 + 法術脆弱',
      chainDesc: '自然傷害（群）+ 腐蝕 🤢',
      ultimateDesc: '散射多利先生的分身，命中敵人造成自然傷害',
      chainConditionText: '對無破防且無法術附著的敵人重擊',
      talent1: '戰技命中敵人後生成3個多利先生的影子；終結技分身落地時有10%概率生成影子',
      talent2: '當戰技觸發額外效果後，若附近存在其他處於腐蝕🤢的敵人，再發動一次戰技（最多一次）',
      specialMechanic: '多利先生的影子：主控幹員觸碰後可回復生命 ❇️；主幹員滿血後治療小隊生命最低的人'
    });
    this.specialState = { shadowCount: 0 };
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：自然傷害`));
      if (t.spellAbnormality.corrosion) {
        effects.push(this._spellAbnormClear(SPELL_ABNORMALITY_TYPE.CORROSION, t));
        effects.push(this._vulnerable(VULNERABLE_TYPE.PHYSICAL, t));
        effects.push(this._vulnerable(VULNERABLE_TYPE.SPELL, t));
        effects.push(this._logOnly(`${this.name} 腐蝕消耗，施加物理脆弱 + 法術脆弱`));
      }
      // Talent 1: generate 3 shadows on skill hit
      this.specialState.shadowCount = 3;
      effects.push(this._logOnly(`${this.name} 天賦：生成 3 個多利先生的影子 🌿`));
      effects.push(this._chainEvent(this._heavyHitEvents(t)));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：自然傷害（群）`));
      for (const enemy of targets)
        effects.push(this._spellAbnorm(SPELL_ABNORMALITY_TYPE.CORROSION, enemy));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：多利先生分身散射，自然傷害（群）`));
      // Talent 1: 10% chance to generate 1 shadow per hit (simulate as guaranteed 1 for clarity)
      this.specialState.shadowCount = Math.min(this.specialState.shadowCount + 1, 5);
      effects.push(this._logOnly(`${this.name} 天賦：分身落地，多利影子 +1（現 ${this.specialState.shadowCount}）`));
    }
    return effects;
  }
  // Called when main unit collects a shadow (manual trigger via UI button)
  consumeShadow(battle) {
    if (this.specialState.shadowCount <= 0) return;
    this.specialState.shadowCount--;
    battle.log.addSystem(`${this.name} 主幹員收集多利影子 🌿，回復生命 ❇️（剩餘 ${this.specialState.shadowCount}）`);
    if (this._onChange) this._onChange('all');
  }
}

// ── 9. 潔爾佩塔 ──────────────────────────────────────────────────────────
class JieErPeiTa extends Character {
  constructor() {
    super({
      name: '潔爾佩塔', stars: 6, jobClass: JOB_CLASS.SUPPORT, damageType: DAMAGE_TYPE.NATURE,
      skillDesc: '吸引敵人，自然傷害 + 自然附著',
      chainDesc: '吸引，自然傷害 + 擊飛',
      ultimateDesc: '自然傷害 + 自然附著 + 緩速 + 法術脆弱（依破防層數提升；若擊飛維持狀態）',
      chainConditionText: '敵人被施加法術異常',
      talent1: '近衛、術師、輔助終結技充能效率++',
      talent2: '戰技最後一擊 or 連攜技命中≥2敵人後，主控幹員生命 ❇️++；主幹員滿後治療小隊生命最低的人',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：吸引敵人，自然傷害 + 自然附著`));
      effects.push(this._spellAttach(SPELL_ELEMENT.NATURE, 1, t));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：吸引，自然傷害 + 擊飛`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.LAUNCHED, t));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：自然傷害 + 自然附著 + 緩速 + 法術脆弱${t.armorBreak > 0 ? `（破防 ${t.armorBreak} 層加成）` : ''}`));
      effects.push(this._spellAttach(SPELL_ELEMENT.NATURE, 1, t));
      effects.push(this._debuff('slow', t));
      effects.push(this._vulnerable(VULNERABLE_TYPE.SPELL, t));
      if (t.physicalAbnormality === PHYSICAL_ABNORMALITY_TYPE.LAUNCHED)
        effects.push(this._logOnly(`${this.name} 大招：擊飛狀態維持延長`));
    }
    return effects;
  }
}

// ── 10. 湯湯 ─────────────────────────────────────────────────────────────
class TangTang extends Character {
  constructor() {
    super({
      name: '湯湯', stars: 6, jobClass: JOB_CLASS.CASTER, damageType: DAMAGE_TYPE.COLD,
      skillDesc: '寒冷傷害，掀起水龍捲（消耗現有渦流形成額外水龍捲，每個返還技力）。若形成≥2個水龍捲，施加法術脆弱',
      chainDesc: '寒冷傷害 + 渦流 +1（場上最多2個）',
      ultimateDesc: '寒冷傷害 + 暫停行動（若下落攻擊，傷害++）',
      chainConditionText: '敵人被施加寒冷附著 or 法術爆發',
      talent1: '渦流5m範圍內，友方加速，敵人緩速',
      talent2: '若終結技時下落攻擊，水龍捲+1，所有渦流→水龍捲，造成傷害++（可使用下墜攻擊按鈕觸發）',
      specialMechanic: '水龍捲：範圍內敵人寒冷附著+1，造成寒冷傷害和戰技傷害'
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      const vortex = battle.vortexCount;
      battle.vortexCount = 0;
      const formed = 1 + vortex;
      effects.push(this._logOnly(`${this.name} 戰技：寒冷傷害，形成 ${formed} 個水龍捲（消耗 ${vortex} 渦流）`));
      effects.push(this._techRestore(formed * 10));
      if (formed >= 2) {
        effects.push(this._vulnerable(VULNERABLE_TYPE.SPELL, t));
        effects.push(this._logOnly(`${this.name} 形成≥2水龍捲，施加法術脆弱`));
      }
    } else if (skillType === SKILL_TYPE.CHAIN) {
      battle.vortexCount = Math.min(2, battle.vortexCount + 1);
      effects.push(this._logOnly(`${this.name} 連攜技：寒冷傷害 + 渦流 +1（現 ${battle.vortexCount}）`));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：寒冷傷害，敵人暫停行動（可接下墜攻擊觸發天賦）`));
      effects.push(this._spellAttach(SPELL_ELEMENT.COLD, 1, t));
    }
    return effects;
  }
}

// ── 11. 別禮 ─────────────────────────────────────────────────────────────
class BieLi extends Character {
  constructor() {
    super({
      name: '別禮', stars: 6, jobClass: JOB_CLASS.ASSAULT, damageType: DAMAGE_TYPE.COLD,
      skillDesc: '對主控武器施加增幅，返還技力。重擊時造成寒冷傷害 + 寒冷附著',
      chainDesc: '清除目標寒冷附著，按層數造成寒冷傷害，按層數獲得終結技能量',
      ultimateDesc: '寒冷傷害（高傷）',
      chainConditionText: '敵人有 ≥3 的寒冷附著',
      talent1: '當別禮消耗任何法術附著後，對目標施加寒冷脆弱 = 被消耗的層數×4%，持續15s',
      talent2: '別禮終結技造成傷害時，若敵人處於寒冷脆弱，效果 1.5×',
      specialMechanic: ''
    });
    this.specialState = { weaponCooling: 0 };
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      this.specialState.weaponCooling = 1;
      effects.push(this._logOnly(`${this.name} 戰技：主控武器增幅，返還技力，重擊寒冷傷害`));
      effects.push(this._techRestore(15));
      effects.push(this._ultCharge('別禮', 30));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      const consumed = t.spellAttachment.cold;
      effects.push(this._spellAttachClear(SPELL_ELEMENT.COLD, t));
      effects.push(this._logOnly(`${this.name} 連攜技：寒冷附著 ${consumed} 層消耗，造成 ${consumed} 段寒冷傷害`));
      if (consumed > 0)
        effects.push(this._vulnerable(VULNERABLE_TYPE.COLD, t, consumed * 4));
      effects.push(this._ultCharge('別禮', consumed * 25));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：高額寒冷傷害${t.vulnerable.cold ? `（目標有寒冷脆弱 ${t.vulnerable.cold}%，效果1.5×）` : ''}`));
    }
    return effects;
  }
  onHeavyAttack(target, battle) {
    if (this.specialState.weaponCooling <= 0) return [];
    this.specialState.weaponCooling = 0;
    battle.log.addSystem(`${this.name} 重擊：主控武器增幅觸發，施加寒冷附著 1 層`);
    const result = target.applySpellAttachment(SPELL_ELEMENT.COLD, 1, battle.log);
    return result.chainEvents;
  }
}

// ── 12. 塞西 ─────────────────────────────────────────────────────────────
class SaiXi extends Character {
  constructor() {
    super({
      name: '塞西', stars: 5, jobClass: JOB_CLASS.SUPPORT, damageType: DAMAGE_TYPE.COLD,
      skillDesc: '召喚支援晶體環繞主幹員（晶體：重擊後為主幹員回復生命，最多2次；若已滿施加法術增幅）',
      chainDesc: '寒冷傷害 + 寒冷附著',
      ultimateDesc: '全隊獲得寒冷增福 + 自然增福',
      chainConditionText: '支援晶體生命回復次數耗盡（點擊角色欄的「使用晶體」按鈕）',
      talent1: '連攜技命中敵人後，若敵人處於寒冷附著 or 凍結❄️，使目標受到寒冷傷害++',
      talent2: '終結技會淨化全隊的寒冷附著和凍結❄️',
      specialMechanic: '支援晶體：重擊後（由主幹員觸發）為主幹員回復生命 ❇️，最多2次；若生命已滿則施加法術增幅'
    });
    this.specialState = { crystalCharges: 0 };
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      this.specialState.crystalCharges = 2;
      effects.push(this._logOnly(`${this.name} 戰技：召喚支援晶體（2次回復充能）`));
      effects.push({ type: EFFECT_TYPE.TIMED_CHAR_STATE, char: this, key: 'crystalCharges', label: '支援晶體 💠', duration: TIMED_EFFECT_DURATIONS.CRYSTAL_CHARGES });
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：寒冷傷害 + 寒冷附著`));
      effects.push(this._spellAttach(SPELL_ELEMENT.COLD, 1, t));
      if (t.spellAttachment.cold > 0 || t.spellAbnormality.frozen)
        effects.push(this._logOnly(`${this.name} 天賦：目標有寒冷附著/凍結，寒冷傷害++`));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：全隊寒冷增福 + 自然增福`));
    }
    return effects;
  }
  onHeavyAttack(_target, battle) {
    if (this.specialState.crystalCharges <= 0) return [];
    this.specialState.crystalCharges--;
    battle.log.addSystem(`${this.name} 晶體回復主幹員生命 ❇️（剩餘 ${this.specialState.crystalCharges} 次）`);
    if (this.specialState.crystalCharges === 0)
      return [{ type: CHAIN_EVENT_TYPE.CRYSTAL_CHARGES_DEPLETED }];
    return [];
  }
}

// ── 13. 晝雪 ─────────────────────────────────────────────────────────────
class ZhuXue extends Character {
  constructor() {
    super({
      name: '晝雪', stars: 5, jobClass: JOB_CLASS.DEFENDER, damageType: DAMAGE_TYPE.COLD,
      skillDesc: '自身及周圍幹員獲得庇護，返還技力。預設敵人攻擊觸發反擊：寒冷傷害 + 寒冷附著',
      chainDesc: '回復主控幹員生命（大量）',
      ultimateDesc: '寒冷傷害 + 生成冰雪地帶（敵人在其中一段時間後凍結）',
      chainConditionText: '主幹員受到攻擊且生命 < 60%',
      talent1: '對生命值 < 55% 的目標，治療效果 +25%',
      talent2: '戰技成功格擋攻擊後，終結技能量++',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：全隊庇護，返還技力（預設敵人攻擊 → 觸發反擊：寒冷傷害 + 寒冷附著）`));
      effects.push(this._techRestore(20));
      effects.push(this._spellAttach(SPELL_ELEMENT.COLD, 1, t));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：大量回復主控幹員生命`));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：寒冷傷害 + 生成冰雪地帶（敵人久留後凍結）`));
      effects.push(this._specialState('snowfield', true, t, '冰雪地帶'));
    }
    return effects;
  }
}

// ── 14. 餘燼 ───────────────���─────────────────────────────────────────────
class YuJin extends Character {
  constructor() {
    super({
      name: '餘燼', stars: 6, jobClass: JOB_CLASS.DEFENDER, damageType: DAMAGE_TYPE.FIRE,
      skillDesc: '灼熱傷害 + 倒地（過程中受到敵人攻擊，失衡值++）',
      chainDesc: '物理傷害 + 倒地 + 治療主控幹員生命',
      ultimateDesc: '灼熱傷害 + 全隊獲得護盾（基於餘燼最大生命值）',
      chainConditionText: '主幹員受到攻擊',
      talent1: '戰技、連攜技施放過程中獲得50%庇護，更不容易被打斷',
      talent2: '受到來自敵人的傷害後，攻擊++',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：灼熱傷害 + 倒地（受擊期間失衡值++）`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.KNOCKDOWN, t));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：物理傷害 + 倒地 + 治療主控幹員`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.KNOCKDOWN, t));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：灼熱傷害 + 全隊護盾`));
    }
    return effects;
  }
}

// ── 15. 弧光 ─────────────────────────────────────────────────────────────
class HuGuang extends Character {
  constructor() {
    super({
      name: '弧光', stars: 5, jobClass: JOB_CLASS.VANGUARD, damageType: DAMAGE_TYPE.ELECTRIC,
      skillDesc: '物理傷害。若敵人處於導電⚡：清除導電，電磁傷害，恢復技力',
      chainDesc: '物理傷害 + 回復技力',
      ultimateDesc: '電磁傷害 + 電磁附著（延遲後自動觸發導電⚡）',
      chainConditionText: '敵人進入導電⚡ or 導電⚡→0',
      talent1: '戰技觸發3次額外效果後，提升全隊電磁傷害15s',
      talent2: '自身被施加法術附著時，有50%概率忽略該效果',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：物理傷害`));
      if (t.spellAbnormality.conducting) {
        effects.push(this._spellAbnormClear(SPELL_ABNORMALITY_TYPE.CONDUCTING, t));
        effects.push(this._logOnly(`${this.name} 清除導電，電磁傷害，回復技力`));
        effects.push(this._techRestore(25));
        effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CONDUCTING_CHANGED, enemy: t }]));
      }
      effects.push(this._chainEvent(this._heavyHitEvents(t)));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：物理傷害 + 回復技力`));
      effects.push(this._techRestore(20));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：電磁傷害 + 電磁附著（延遲觸發導電⚡）`));
      effects.push(this._spellAttach(SPELL_ELEMENT.ELECTRIC, 1, t));
      effects.push(this._spellAbnorm(SPELL_ABNORMALITY_TYPE.CONDUCTING, t));
    }
    return effects;
  }
}

// ── 16. 艾維文娜 ─────────────────────────────────────────────────────────
class AiWeiWenNa extends Character {
  constructor() {
    super({
      name: '艾維文娜', stars: 5, jobClass: JOB_CLASS.ASSAULT, damageType: DAMAGE_TYPE.ELECTRIC,
      skillDesc: '電磁傷害，召回所有雷槍強化。強雷槍穿過敵人：電磁傷害 + 電磁附著',
      chainDesc: '擲出3支雷槍，電磁傷害',
      ultimateDesc: '投下1支強雷槍，電磁傷害 + 電磁脆弱',
      chainConditionText: '對電磁附著 or 導電⚡的敵人重擊',
      talent1: '擲出、召回雷槍、強雷槍時若命中敵人，終結技能量++',
      talent2: '終結技命中敵人時施加電磁脆弱10s',
      specialMechanic: ''
    });
    this.specialState = { guns: 0 };
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：召回所有雷槍（強化），電磁傷害 + 電磁附著`));
      effects.push(this._spellAttach(SPELL_ELEMENT.ELECTRIC, Math.max(1, this.specialState.guns), t));
      this.specialState.guns = 0;
      effects.push(this._chainEvent(this._heavyHitEvents(t)));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      this.specialState.guns = Math.min(4, this.specialState.guns + 3);
      effects.push(this._logOnly(`${this.name} 連攜技：擲出3支雷槍，電磁傷害（槍數: ${this.specialState.guns}）`));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：投下強雷槍，電磁傷害`));
      effects.push(this._spellAttach(SPELL_ELEMENT.ELECTRIC, 1, t));
      effects.push(this._vulnerable(VULNERABLE_TYPE.ELECTRIC, t));
      effects.push(this._chainEvent(this._heavyHitEvents(t)));
    }
    return effects;
  }
}

// ── 17. 大潘 ─────────────────────────────────────────────────────────────
class DaPan extends Character {
  constructor() {
    super({
      name: '大潘', stars: 5, jobClass: JOB_CLASS.ASSAULT, damageType: DAMAGE_TYPE.PHYSICAL,
      skillDesc: '物理傷害 + 擊飛',
      chainDesc: '物理傷害 + 猛擊',
      ultimateDesc: '擊飛 + 物理傷害 + 倒地',
      chainConditionText: '敵人達到4層破防',
      talent1: '每消耗1破防，物理傷害++ 10s',
      talent2: '終結技最後一擊每命中一個敵人，備料狀態+1（最多3，持續20s）；備料狀態時連攜技命中後立即恢復40%冷卻時間',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：物理傷害 + 擊飛`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.LAUNCHED, t));
      effects.push(this._chainEvent(this._heavyHitEvents(t)));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：物理傷害 + 猛擊`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.CRUSH, t));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：擊飛 → 物理傷害 → 倒地`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.LAUNCHED, t));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.KNOCKDOWN, t));
    }
    return effects;
  }
}

// ── 18. 阿列什 ───────────────────────────────────────────────────────────
class ALieShi extends Character {
  constructor() {
    super({
      name: '阿列什', stars: 5, jobClass: JOB_CLASS.VANGUARD, damageType: DAMAGE_TYPE.COLD,
      skillDesc: '物理傷害。若敵人有寒冷附著：清除附著，凍結❄️���恢復技力',
      chainDesc: '物理傷害 + 技力大回復（有機率釣出珍鱗：大幅傷害 + 技力+++）',
      ultimateDesc: '寒冷傷害 + 寒冷附著 +1 + 技力回復',
      chainConditionText: '附近目標的法術異常 or 源石結晶被消耗',
      talent1: '附近有敵人被凍結❄️或被附著源石結晶後，自身終結技能量++；自身造成凍結❄️，終結技能量+++',
      talent2: '每10點智識會使連攜技釣起珍鱗的概率+0.5%（最多30%）',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：物理傷害`));
      if (t.spellAttachment.cold > 0) {
        effects.push(this._logOnly(`${this.name} 目標有寒冷附著，清除並觸發凍結❄️，恢復技力`));
        effects.push(this._spellAttachClear(SPELL_ELEMENT.COLD, t));
        effects.push(this._spellAbnorm(SPELL_ABNORMALITY_TYPE.FROZEN, t));
        effects.push(this._techRestore(25));
        effects.push(this._ultCharge('阿列什', 60));
      }
      effects.push(this._chainEvent(this._heavyHitEvents(t)));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      const isTreasure = Math.random() < 0.15;
      effects.push(this._logOnly(`${this.name} 連攜技：物理傷害 + 回復技力${isTreasure ? '（釣出珍鱗！大傷+技力大回復）' : ''}`));
      effects.push(this._techRestore(isTreasure ? 50 : 25));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：寒冷傷害 + 寒冷附著 + 技力回復`));
      effects.push(this._spellAttach(SPELL_ELEMENT.COLD, 1, t));
      effects.push(this._techRestore(20));
    }
    return effects;
  }
}

// ── 19. 安塔爾 ───────────────────────────────────────────────────────────
class AnTaEr extends Character {
  constructor() {
    super({
      name: '安塔爾', stars: 4, jobClass: JOB_CLASS.SUPPORT, damageType: DAMAGE_TYPE.ELECTRIC,
      skillDesc: '對單體敵人施加長時間聚焦（電磁脆弱 + 灼熱脆弱），電磁傷害',
      chainDesc: '電磁傷害，再對目標施加其當前物理異常 or 法術附著',
      ultimateDesc: '全隊電磁增福 + 灼熱增福',
      chainConditionText: '被聚焦的敵人進入物理異常 or 法術附著',
      talent1: '處於增幅狀態的幹員造成技能傷害後，回復生命值 ❇️++',
      talent2: '有30%概率免疫物理傷害，回復生命值 ❇️++',
      specialMechanic: '聚焦：敵人受到電磁脆弱 + 灼熱脆弱'
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：對 敵人${t.id} 施加聚焦（電磁脆弱 + 灼熱脆弱），電磁傷害`));
      effects.push(this._specialState('focused', true, t, '聚焦（電磁+灼熱脆弱）'));
      effects.push(this._vulnerable(VULNERABLE_TYPE.ELECTRIC, t));
      effects.push(this._vulnerable(VULNERABLE_TYPE.FIRE, t));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：電磁傷害，再施加目標現有的物理異常/法術附著`));
      if (t.physicalAbnormality)
        effects.push(this._physAbnorm(t.physicalAbnormality, t));
      for (const [el, layers] of Object.entries(t.spellAttachment))
        if (layers > 0) effects.push(this._spellAttach(el, 1, t));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：全隊電磁增福 + 灼熱增福`));
    }
    return effects;
  }
}

// ── 20. 埃特拉 ───────────────────────────────────────────────────────────
class AiTeLa extends Character {
  constructor() {
    super({
      name: '埃特拉', stars: 4, jobClass: JOB_CLASS.GUARD, damageType: DAMAGE_TYPE.COLD,
      skillDesc: '寒冷傷害 + 寒冷附著',
      chainDesc: '物理傷害 + 擊飛。若目標凍結❄️，施加物理脆弱',
      ultimateDesc: '物理傷害。若目標有物理脆弱，強制擊飛',
      chainConditionText: '敵人進入凍結❄️',
      talent1: '每當觸發碎冰🧊，下一次戰技返還15技力',
      talent2: '不會被寒冷附著，受到寒冷傷害 -20%',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：寒冷傷害 + 寒冷附著`));
      effects.push(this._spellAttach(SPELL_ELEMENT.COLD, 1, t));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：物理傷害 + 擊飛${t.spellAbnormality.frozen ? '（目標凍結，施加物理脆弱）' : ''}`));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.LAUNCHED, t));
      if (t.spellAbnormality.frozen) effects.push(this._vulnerable(VULNERABLE_TYPE.PHYSICAL, t));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：物理傷害${t.vulnerable.physical ? '（目標有物理脆弱，強制擊飛）' : ''}`));
      effects.push(this._chainEvent(this._heavyHitEvents(t)));
      if (t.vulnerable.physical) effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.LAUNCHED, t));
    }
    return effects;
  }
}

// ── 21. 秋栗 ─────────────────────────────────────────────────────────────
class QiuLi extends Character {
  constructor() {
    super({
      name: '秋栗', stars: 4, jobClass: JOB_CLASS.VANGUARD, damageType: DAMAGE_TYPE.FIRE,
      skillDesc: '灼熱傷害 + 灼熱附著',
      chainDesc: '物理傷害 + 技力回復',
      ultimateDesc: '大量技力回復（技力+++）',
      chainConditionText: '敵人失衡 or 觸發失衡節點',
      talent1: '每10智識使連攜技技力回復量+1.5%，最多75%',
      talent2: '施放終結技時，獲得連擊',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：灼熱傷害 + 灼熱附著`));
      effects.push(this._spellAttach(SPELL_ELEMENT.FIRE, 1, t));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：物理傷害 + 技力回復`));
      effects.push(this._techRestore(25));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：大量技力回復（+++）`));
      effects.push(this._techRestore(60));
    }
    return effects;
  }
}

// ── 22. 螢石 ─────────────────────────────────────────────────────────────
class YingShi extends Character {
  constructor() {
    super({
      name: '螢石', stars: 4, jobClass: JOB_CLASS.CASTER, damageType: DAMAGE_TYPE.NATURE,
      skillDesc: '在目標黏附自製炸彈（緩速）。延遲2s後爆炸：自然傷害 + 自然附著',
      chainDesc: '自然傷害 + 再施加目標當前的法術附著',
      ultimateDesc: '自然傷害。若目標有炸彈立即引爆（範圍擴大）。若目標有≥2層寒冷/自然附著，再次施加',
      chainConditionText: '敵人有 ≥2 的寒冷附著 or 自然附著',
      talent1: '對緩速狀態的目標造成傷害++',
      talent2: '有20%概率免疫法術傷害，使自身攻擊力++',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：黏附自製炸彈（緩速，2s後爆炸→自然附著）`));
      effects.push(this._specialState('bomb', true, t, '自製炸彈 💣'));
      effects.push(this._debuff('slow', t));
      setTimeout(() => { if (t.specialStates.bomb) battle.detonateBomb(t); }, 2000);
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：自然傷害 + 再施加目標法術附著`));
      for (const [el, layers] of Object.entries(t.spellAttachment))
        if (layers > 0) effects.push(this._spellAttach(el, 1, t));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：自然傷害${t.specialStates.bomb ? '（炸彈立即引爆，範圍++）' : ''}`));
      if (t.specialStates.bomb) {
        effects.push(this._specialState('bomb', false, t, '炸彈引爆'));
        effects.push(this._spellAttach(SPELL_ELEMENT.NATURE, 1, t));
      }
      if (t.spellAttachment.cold >= 2 || t.spellAttachment.nature >= 2) {
        const el = t.spellAttachment.cold >= 2 ? SPELL_ELEMENT.COLD : SPELL_ELEMENT.NATURE;
        effects.push(this._spellAttach(el, 1, t));
        effects.push(this._logOnly(`${this.name} 大招：≥2層附著，再施加 ${el} 附著`));
      }
    }
    return effects;
  }
}

// ── 23. 卡契爾 ───────────────────────────────────────────────────────────
class KaQiEr extends Character {
  constructor() {
    super({
      name: '卡契爾', stars: 4, jobClass: JOB_CLASS.DEFENDER, damageType: DAMAGE_TYPE.PHYSICAL,
      skillDesc: '全隊庇護，返還技力。預設敵人攻擊觸發反擊：物理傷害 + 破防+1',
      chainDesc: '物理傷害 + 自身和主幹員獲得護盾',
      ultimateDesc: '物理傷害 + 施加虛弱 + 物理傷害 + 倒地',
      chainConditionText: '敵人開始蓄力 or 主幹員生命 < 40%',
      talent1: '每有10意志，防禦力+1.2',
      talent2: '終結技最後一擊產生3衝擊波，每個波造成物理傷害',
      specialMechanic: ''
    });
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：全隊庇護，返還技力（預設敵人攻擊 → 反擊：物理傷害 + 破防+1）`));
      effects.push(this._techRestore(20));
      effects.push(this._armorBreak(1, t));
      effects.push(this._logOnly(`${this.name} 反擊，破防 +1`));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：物理傷害 + 護盾`));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：物理傷害 + 虛弱 + 物理傷害 + 倒地`));
      effects.push(this._debuff('weak', t));
      effects.push(this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.KNOCKDOWN, t));
    }
    return effects;
  }
}

// ── 24. 萊萬汀 ───────────────────────────────────────────────────────────
class LaiWanTing extends Character {
  constructor() {
    super({
      name: '萊萬汀', stars: 6, jobClass: JOB_CLASS.ASSAULT, damageType: DAMAGE_TYPE.FIRE,
      skillDesc: '灼熱傷害 + 熔火+1。若有4層熔火：熔火→0，灼熱傷害 + 燃燒🔥，終結技能量++',
      chainDesc: '灼熱傷害，命中敵人各+熔火+1，終結技能量++',
      ultimateDesc: '灼熱傷害 + 灼熱附著（普攻強化範圍）',
      chainConditionText: '敵人進入燃燒🔥 or 腐蝕🤢',
      talent1: '主幹員重擊或處決命中後，吸收周圍敵人的灼熱附著（含被擊敗敵人）；每吸收1灼熱附著，熔火+1（最多4）；達到4層熔火後，無視20點灼熱抗性持續20s',
      talent2: '生命值<40%，獲得90%庇護，每s回復5%最大生命 ❇️++，持續8s（120s最多觸發一次）',
      specialMechanic: ''
    });
    this.specialState = { moltenFire: 0 };
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      if (this.specialState.moltenFire >= 4) {
        this.specialState.moltenFire = 0;
        effects.push(this._logOnly(`${this.name} 戰技：熔火4層引爆！灼熱大傷 + 燃燒🔥 + 終結技充能`));
        effects.push(this._spellAbnorm(SPELL_ABNORMALITY_TYPE.BURNING, t));
        effects.push(this._ultCharge('萊萬汀', 60));
      } else {
        this.specialState.moltenFire++;
        effects.push(this._logOnly(`${this.name} 戰技：灼熱傷害 + 熔火 → ${this.specialState.moltenFire}`));
      }
    } else if (skillType === SKILL_TYPE.CHAIN) {
      for (const _enemy of targets)
        this.specialState.moltenFire = Math.min(4, this.specialState.moltenFire + 1);
      effects.push(this._logOnly(`${this.name} 連攜技：灼熱傷害，熔火 → ${this.specialState.moltenFire}`));
      effects.push(this._ultCharge('萊萬汀', 30));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：灼熱傷害 + 灼熱附著（普攻範圍強化）`));
      for (const enemy of targets)
        effects.push(this._spellAttach(SPELL_ELEMENT.FIRE, 1, enemy));
    }
    return effects;
  }
  onHeavyAttack(target, battle) {
    // Absorb fire attachment from target → moltenFire++
    const absorbed = target.spellAttachment.fire;
    if (absorbed > 0) {
      target.clearSpellAttachment('fire', battle.log);
      const prev = this.specialState.moltenFire;
      this.specialState.moltenFire = Math.min(4, this.specialState.moltenFire + absorbed);
      battle.log.addSystem(`${this.name} 天賦：重擊吸收 ${absorbed} 層灼熱附著，熔火 ${prev} → ${this.specialState.moltenFire}`);
    }
    return [];
  }
}

// ── 25. 伊馮 ─────────────────────────────────────────────────────────────
class YiFan extends Character {
  constructor() {
    super({
      name: '伊馮', stars: 6, jobClass: JOB_CLASS.ASSAULT, damageType: DAMAGE_TYPE.COLD,
      skillDesc: '寒冷傷害。若目標有寒冷/自然附著：清除所有法術附著，凍結❄️，按消耗層數造成寒冷傷害；獲得終結技能量',
      chainDesc: '寒冷傷害 + 中心牽引 + 凍結❄️。命中敵人，終結技能量++',
      ultimateDesc: '普攻強化為主幹員，爆擊率層疊，最後一擊重擊（寒冷）。若目標凍結：額外傷害 + 消耗凍結',
      chainConditionText: '對處於凍結❄️狀態的敵人重擊',
      talent1: '戰技施加凍結❄️後，下次普攻就是重擊，且此次重擊傷害+50%',
      talent2: '對處於寒冷附著的敵人造成爆擊傷害++，對處於凍結❄️的敵人效果加倍',
      specialMechanic: ''
    });
    this.specialState = { nextAttackIsHeavy: false };
  }
  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0];
    if (skillType === SKILL_TYPE.BATTLE) {
      effects.push(this._logOnly(`${this.name} 戰技：寒冷傷害`));
      const coldLayers = t.spellAttachment.cold;
      const natureLayers = t.spellAttachment.nature;
      if (coldLayers > 0 || natureLayers > 0) {
        const total = coldLayers + natureLayers;
        effects.push(this._spellAttachClearAll(t));
        effects.push(this._logOnly(`${this.name} 清除 ${total} 層法術附著，觸發凍結❄️，${total} 段寒冷傷害`));
        effects.push(this._spellAbnorm(SPELL_ABNORMALITY_TYPE.FROZEN, t));
        effects.push(this._ultCharge('伊馮', total * 20));
        // Talent 1: next attack is heavy
        this.specialState.nextAttackIsHeavy = true;
        effects.push(this._logOnly(`${this.name} 天賦：下次普攻視為重擊（+50%傷害）`));
      }
      effects.push(this._chainEvent(this._heavyHitEvents(t)));
    } else if (skillType === SKILL_TYPE.CHAIN) {
      effects.push(this._logOnly(`${this.name} 連攜技：寒冷傷害 + 牽引 + 凍結❄️，終結技充能`));
      effects.push(this._spellAbnorm(SPELL_ABNORMALITY_TYPE.FROZEN, t));
      effects.push(this._ultCharge('伊馮', 40));
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      effects.push(this._logOnly(`${this.name} 大招：普攻強化（主幹員），爆擊層疊，最後重擊寒冷傷害${t.spellAbnormality.frozen ? '（目標凍結：額外傷害 + 消耗凍結）' : ''}`));
      if (t.spellAbnormality.frozen) {
        effects.push(this._spellAbnormClear(SPELL_ABNORMALITY_TYPE.FROZEN, t));
        effects.push(this._logOnly(`${this.name} 大招消耗凍結，額外寒冷傷害`));
      }
    }
    return effects;
  }
}


// ════════════════════════════════════════════════════════════════════════════
//  ROSTER
// ════════════════════════════════════════════════════════════════════════════
const ROSTER = [
  new GuanLiYuan(), new LiFeng(),    new ChenQianYu(), new JunWei(),
  new LuoXi(),      new PeiLiKa(),   new LangWei(),    new AiErDaiLa(),
  new JieErPeiTa(), new TangTang(),  new BieLi(),      new SaiXi(),
  new ZhuXue(),     new YuJin(),     new HuGuang(),    new AiWeiWenNa(),
  new DaPan(),      new ALieShi(),   new AnTaEr(),     new AiTeLa(),
  new QiuLi(),      new YingShi(),   new KaQiEr(),     new LaiWanTing(),
  new YiFan()
];
