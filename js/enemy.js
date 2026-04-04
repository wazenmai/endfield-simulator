'use strict';

class Enemy {
  constructor(id) {
    this.id = id;
    this._reset();
  }

  _reset() {
    this.armorBreak = 0;
    this.spellAttachment = { fire: 0, electric: 0, nature: 0, cold: 0 };
    this._stateTimers = {}; // { timerKey: timerId } — managed by BattleState
    this.spellAbnormality = { burning: false, conducting: false, corrosion: false, frozen: false };
    // Only one physical abnormality active at a time (except 倒地/擊飛 which stack with 破防)
    this.physicalAbnormality = null; // 'crush' | 'armorCrush' | 'knockdown' | 'launched'
    this.vulnerable = { physical: false, spell: false, cold: 0, electric: false, fire: false, nature: false };
    this.debuffs = { weak: false, slow: false };
    this.specialStates = {
      focused: false,        // 安塔爾
      crystalAttached: false, // 管理員
      clawMark: false,       // 洛茜
      snowfield: false,      // 晝雪
      bomb: false            // 螢石
    };
    this.imbalanceValue = 0;
  }

  reset(log) {
    this._reset();
    if (log) log.addSystem(`敵人 ${this.id} 狀態已重置`);
  }

  // ── Armor Break ──────────────────────────────────────────────────
  /**
   * Apply armor break change. Returns { prevBreak, newBreak, consumed }
   * consumed = true if break was used up (猛擊/碎甲 triggering full effect)
   */
  applyArmorBreak(delta, log, consumed = false) {
    const prev = this.armorBreak;
    this.armorBreak = Math.max(0, Math.min(MAX_ARMOR_BREAK, this.armorBreak + delta));
    if (log) {
      if (delta > 0 && !consumed) {
        log.addEffect(`敵人 ${this.id} 破防 ${prev} → ${this.armorBreak}`);
      }
    }
    return { prev, newBreak: this.armorBreak };
  }

  // ── Physical Abnormality ─────────────────────────────────────────
  /**
   * Returns an object describing what happened:
   * { hadBreak, consumedBreak, appliedAbnormality, chainEvents }
   */
  applyPhysicalAbnormality(type, log) {
    const chainEvents = [];
    const hadBreak = this.armorBreak > 0;

    // Check if frozen — physical attack breaks ice
    if (this.spellAbnormality.frozen) {
      this.applyIceShatter(log);
      chainEvents.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_FROZEN });
    }

    if (!hadBreak) {
      // No 破防 — just add +1
      this.applyArmorBreak(1, log);
      if (log) log.addEffect(`敵人 ${this.id} 無破防，${this._physName(type)} 施加破防 +1（現 ${this.armorBreak}）`);
      if (this.armorBreak >= MAX_ARMOR_BREAK) chainEvents.push({ type: CHAIN_EVENT_TYPE.ARMOR_BREAK_4, enemy: this });
      chainEvents.push({ type: CHAIN_EVENT_TYPE.ARMOR_BREAK_GAINED, enemy: this });
      return { hadBreak: false, consumedBreak: false, appliedAbnormality: false, chainEvents };
    }

    // Has 破防 — apply full effect
    if (type === PHYSICAL_ABNORMALITY_TYPE.CRUSH) {
      // 猛擊: 破防=0, 大量物理傷害
      const consumed = this.armorBreak;
      this.armorBreak = 0;
      this.physicalAbnormality = null;
      if (log) log.addEffect(`敵人 ${this.id} 猛擊！破防 ${consumed} 層消耗，造成大量物理傷害`);
      chainEvents.push({ type: CHAIN_EVENT_TYPE.PHYSICAL_ABNORMALITY_CONSUMED, abnormalType: type, enemy: this });

    } else if (type === PHYSICAL_ABNORMALITY_TYPE.ARMOR_CRUSH) {
      // 碎甲: 破防=0, 物理傷害, 施加物理易傷
      const consumed = this.armorBreak;
      this.armorBreak = 0;
      this.physicalAbnormality = PHYSICAL_ABNORMALITY_TYPE.ARMOR_CRUSH;
      this.vulnerable.physical = true;
      if (log) log.addEffect(`敵人 ${this.id} 碎甲！破防 ${consumed} 層消耗，物理傷害，施加【物理易傷】`);
      chainEvents.push({ type: CHAIN_EVENT_TYPE.PHYSICAL_ABNORMALITY_CONSUMED, abnormalType: type, enemy: this });
      chainEvents.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_PHYSICAL_VULN, enemy: this });

    } else if (type === PHYSICAL_ABNORMALITY_TYPE.KNOCKDOWN) {
      // 倒地: 破防+1, 物理傷害, 失衡++, 倒地狀態
      this.applyArmorBreak(1, log);
      this.physicalAbnormality = PHYSICAL_ABNORMALITY_TYPE.KNOCKDOWN;
      this.imbalanceValue++;
      if (log) log.addEffect(`敵人 ${this.id} 倒地！破防 +1（${this.armorBreak}），物理傷害，失衡值 +1（${this.imbalanceValue}），敵人【倒地】`);
      chainEvents.push({ type: CHAIN_EVENT_TYPE.ARMOR_BREAK_GAINED, enemy: this });
      chainEvents.push({ type: CHAIN_EVENT_TYPE.ENEMY_IMBALANCE, enemy: this });
      if (this.armorBreak >= MAX_ARMOR_BREAK) chainEvents.push({ type: CHAIN_EVENT_TYPE.ARMOR_BREAK_4, enemy: this });

    } else if (type === PHYSICAL_ABNORMALITY_TYPE.LAUNCHED) {
      // 擊飛: 破防+1, 物理傷害, 失衡++, 懸浮狀態
      this.applyArmorBreak(1, log);
      this.physicalAbnormality = PHYSICAL_ABNORMALITY_TYPE.LAUNCHED;
      this.imbalanceValue++;
      if (log) log.addEffect(`敵人 ${this.id} 擊飛！破防 +1（${this.armorBreak}），物理傷害，失衡值 +1（${this.imbalanceValue}），敵人【懸浮】`);
      chainEvents.push({ type: CHAIN_EVENT_TYPE.ARMOR_BREAK_GAINED, enemy: this });
      chainEvents.push({ type: CHAIN_EVENT_TYPE.ENEMY_IMBALANCE, enemy: this });
      if (this.armorBreak >= MAX_ARMOR_BREAK) chainEvents.push({ type: CHAIN_EVENT_TYPE.ARMOR_BREAK_4, enemy: this });
    }

    chainEvents.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_ANY, enemy: this });
    if (this.vulnerable.physical || this.physicalAbnormality === PHYSICAL_ABNORMALITY_TYPE.ARMOR_CRUSH) {
      chainEvents.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_PHYSICAL_VULN, enemy: this });
    }

    return { hadBreak, consumedBreak: true, appliedAbnormality: true, chainEvents };
  }

  _physName(type) {
    const names = {
      [PHYSICAL_ABNORMALITY_TYPE.CRUSH]: '猛擊',
      [PHYSICAL_ABNORMALITY_TYPE.ARMOR_CRUSH]: '碎甲',
      [PHYSICAL_ABNORMALITY_TYPE.KNOCKDOWN]: '倒地',
      [PHYSICAL_ABNORMALITY_TYPE.LAUNCHED]: '擊飛'
    };
    return names[type] || type;
  }

  // ── Spell Attachment ─────────────────────────────────────────────
  /**
   * Apply spell attachment layers. Returns { chainEvents, triggered }
   */
  applySpellAttachment(element, layers, log) {
    const chainEvents = [];
    const prev = this.spellAttachment[element];
    this.spellAttachment[element] = Math.min(MAX_ATTACHMENT_LAYERS, prev + layers);
    const curr = this.spellAttachment[element];

    if (log) log.addEffect(`敵人 ${this.id} ${this._elemName(element)}附著 ${prev} → ${curr}`);

    // Check for 法術爆發 (spell burst): ≥2 same-element layers
    if (curr >= 2) {
      if (log) log.addEffect(`敵人 ${this.id} 觸發【${this._elemName(element)}爆發】！`);
    }

    // Check for 法術異常 (cross-type combo)
    const abnormTriggered = this._checkAndApplySpellAbnormality(element, log);
    if (abnormTriggered) {
      chainEvents.push({ type: CHAIN_EVENT_TYPE.SPELL_ABNORMALITY_APPLIED, abnormalType: abnormTriggered, enemy: this });
      if (abnormTriggered === SPELL_ABNORMALITY_TYPE.CONDUCTING) {
        chainEvents.push({ type: CHAIN_EVENT_TYPE.CONDUCTING_CHANGED, enemy: this });
      }
      if (abnormTriggered === SPELL_ABNORMALITY_TYPE.FROZEN) {
        chainEvents.push({ type: CHAIN_EVENT_TYPE.FROZEN_APPLIED, enemy: this });
      }
      if (abnormTriggered === SPELL_ABNORMALITY_TYPE.BURNING) {
        chainEvents.push({ type: CHAIN_EVENT_TYPE.BURNING_APPLIED, enemy: this });
      }
      if (abnormTriggered === SPELL_ABNORMALITY_TYPE.CORROSION) {
        chainEvents.push({ type: CHAIN_EVENT_TYPE.CORROSION_APPLIED, enemy: this });
      }
    }

    chainEvents.push({ type: CHAIN_EVENT_TYPE.SPELL_ATTACHMENT_APPLIED, element, layers: curr, enemy: this });

    // Check if enemy now has both 破防 and spell attachment
    if (this.armorBreak > 0 && this._totalSpellAttachment() > 0) {
      chainEvents.push({ type: CHAIN_EVENT_TYPE.ENEMY_HAS_BREAK_AND_ATTACHMENT, enemy: this });
    }

    return { chainEvents };
  }

  _checkAndApplySpellAbnormality(newElement, log) {
    // Trigger logic: any OTHER element is present + newElement → abnormality for newElement
    const others = ['fire', 'electric', 'nature', 'cold'].filter(e => e !== newElement);
    const hasOther = others.some(e => this.spellAttachment[e] > 0);

    if (!hasOther) return null;

    let abnormType = null;
    if (newElement === SPELL_ELEMENT.FIRE)     abnormType = SPELL_ABNORMALITY_TYPE.BURNING;
    if (newElement === SPELL_ELEMENT.ELECTRIC) abnormType = SPELL_ABNORMALITY_TYPE.CONDUCTING;
    if (newElement === SPELL_ELEMENT.NATURE)   abnormType = SPELL_ABNORMALITY_TYPE.CORROSION;
    if (newElement === SPELL_ELEMENT.COLD)     abnormType = SPELL_ABNORMALITY_TYPE.FROZEN;

    if (abnormType && !this.spellAbnormality[abnormType]) {
      this.spellAbnormality[abnormType] = true;
      if (log) log.addEffect(`敵人 ${this.id} 觸發【${this._abnormName(abnormType)}】！`);
      return abnormType;
    }
    return null;
  }

  // ── Clear Spell Attachment ───────────────────────────────────────
  clearSpellAttachment(element, log) {
    const consumed = this.spellAttachment[element];
    if (consumed === 0) return { consumed: 0, chainEvents: [] };
    this.spellAttachment[element] = 0;
    if (log) log.addEffect(`敵人 ${this.id} ${this._elemName(element)}附著（${consumed}層）消耗`);
    return { consumed, chainEvents: [] };
  }

  clearAllSpellAttachments(log) {
    let total = 0;
    const consumed = {};
    for (const el of ['fire', 'electric', 'nature', 'cold']) {
      consumed[el] = this.spellAttachment[el];
      total += this.spellAttachment[el];
      this.spellAttachment[el] = 0;
    }
    if (log && total > 0) log.addEffect(`敵人 ${this.id} 所有法術附著消耗（共 ${total} 層）`);
    return { consumed, total };
  }

  _totalSpellAttachment() {
    return Object.values(this.spellAttachment).reduce((a, b) => a + b, 0);
  }

  // ── Spell Abnormality ────────────────────────────────────────────
  applySpellAbnormality(type, log) {
    if (!this.spellAbnormality[type]) {
      this.spellAbnormality[type] = true;
      if (log) log.addEffect(`敵人 ${this.id} 進入【${this._abnormName(type)}】狀態`);
    }
    const chainEvents = [{ type: CHAIN_EVENT_TYPE.SPELL_ABNORMALITY_APPLIED, abnormalType: type, enemy: this }];
    if (type === SPELL_ABNORMALITY_TYPE.CONDUCTING) chainEvents.push({ type: CHAIN_EVENT_TYPE.CONDUCTING_CHANGED, enemy: this });
    if (type === SPELL_ABNORMALITY_TYPE.FROZEN) chainEvents.push({ type: CHAIN_EVENT_TYPE.FROZEN_APPLIED, enemy: this });
    if (type === SPELL_ABNORMALITY_TYPE.BURNING) chainEvents.push({ type: CHAIN_EVENT_TYPE.BURNING_APPLIED, enemy: this });
    if (type === SPELL_ABNORMALITY_TYPE.CORROSION) chainEvents.push({ type: CHAIN_EVENT_TYPE.CORROSION_APPLIED, enemy: this });
    return { chainEvents };
  }

  clearSpellAbnormality(type, log) {
    if (this.spellAbnormality[type]) {
      this.spellAbnormality[type] = false;
      if (log) log.addEffect(`敵人 ${this.id} ${this._abnormName(type)}狀態解除`);
      if (type === SPELL_ABNORMALITY_TYPE.CONDUCTING) return [{ type: CHAIN_EVENT_TYPE.CONDUCTING_CHANGED, enemy: this }];
    }
    return [];
  }

  // ── Ice Shatter ──────────────────────────────────────────────────
  applyIceShatter(log) {
    this.spellAbnormality.frozen = false;
    if (log) log.addEffect(`敵人 ${this.id} 觸發【碎冰 🧊】！凍結狀態解除，造成額外傷害`);
  }

  // ── Vulnerable ──────────────────────────────────────────────────
  applyVulnerable(type, log, value = true) {
    this.vulnerable[type] = value;
    const names = { physical:'物理脆弱', spell:'法術脆弱', cold:'寒冷脆弱', electric:'電磁脆弱', fire:'灼熱脆弱', nature:'自然脆弱' };
    if (log) log.addEffect(`敵人 ${this.id} 獲得【${names[type] || type}】`);
  }

  // ── Debuffs ──────────────────────────────────────────────────────
  applyDebuff(type, log) {
    this.debuffs[type] = true;
    const names = { weak:'虛弱', slow:'緩速' };
    if (log) log.addEffect(`敵人 ${this.id} 獲得【${names[type] || type}】`);
  }

  // ── Special States ───────────────────────────────────────────────
  setSpecialState(key, value, log, label) {
    this.specialStates[key] = value;
    if (log && label) log.addEffect(`敵人 ${this.id} ${label}`);
  }

  // ── Helpers ──────────────────────────────────────────────────────
  _elemName(el) {
    return { fire:'灼熱', electric:'電磁', nature:'自然', cold:'寒冷' }[el] || el;
  }
  _abnormName(t) {
    return { burning:'燃燒 🔥', conducting:'導電 ⚡', corrosion:'腐蝕 🤢', frozen:'凍結 ❄️' }[t] || t;
  }

  hasAnySpellAttachment() {
    return this._totalSpellAttachment() > 0;
  }
  hasAnySpellAbnormality() {
    return Object.values(this.spellAbnormality).some(Boolean);
  }
  hasAnyPhysicalAbnormality() {
    return this.physicalAbnormality !== null;
  }

  // ── State Chips for UI ───────────────────────────────────────────
  getStateChips() {
    const chips = [];

    // 破防 shown separately in UI as pips, but also add chip if > 0
    // (handled by enemy card render)

    // Spell Attachments
    const elemLabels = { fire:'灼熱附著', electric:'電磁附著', nature:'自然附著', cold:'寒冷附著' };
    for (const [el, count] of Object.entries(this.spellAttachment)) {
      if (count > 0) chips.push({ label: elemLabels[el], layer: count, colorClass: el });
    }

    // Spell Abnormalities
    if (this.spellAbnormality.burning)    chips.push({ label: '燃燒 🔥', colorClass: 'fire',     timerKey: 'spellAbnormality_burning' });
    if (this.spellAbnormality.conducting) chips.push({ label: '導電 ⚡', colorClass: 'electric', timerKey: 'spellAbnormality_conducting' });
    if (this.spellAbnormality.corrosion)  chips.push({ label: '腐蝕 🤢', colorClass: 'nature',   timerKey: 'spellAbnormality_corrosion' });
    if (this.spellAbnormality.frozen)     chips.push({ label: '凍結 ❄️', colorClass: 'cold',     timerKey: 'spellAbnormality_frozen' });

    // Physical Abnormality
    const physNames = {
      [PHYSICAL_ABNORMALITY_TYPE.CRUSH]: '猛擊狀態',
      [PHYSICAL_ABNORMALITY_TYPE.ARMOR_CRUSH]: '碎甲（物理易傷）',
      [PHYSICAL_ABNORMALITY_TYPE.KNOCKDOWN]: '倒地 ⬇',
      [PHYSICAL_ABNORMALITY_TYPE.LAUNCHED]: '擊飛 ⬆'
    };
    if (this.physicalAbnormality) chips.push({ label: physNames[this.physicalAbnormality], colorClass: 'physical' });

    // Vulnerable
    if (this.vulnerable.physical) chips.push({ label: '物理脆弱', colorClass: 'physical', timerKey: 'vulnerable_physical' });
    if (this.vulnerable.spell)    chips.push({ label: '法術脆弱', colorClass: 'special',   timerKey: 'vulnerable_spell' });
    if (this.vulnerable.cold > 0) chips.push({ label: `寒冷脆弱 ${this.vulnerable.cold}%`, colorClass: 'cold', timerKey: 'vulnerable_cold' });
    if (this.vulnerable.electric) chips.push({ label: '電磁脆弱', colorClass: 'electric',  timerKey: 'vulnerable_electric' });
    if (this.vulnerable.fire)     chips.push({ label: '灼熱脆弱', colorClass: 'fire',       timerKey: 'vulnerable_fire' });
    if (this.vulnerable.nature)   chips.push({ label: '自然脆弱', colorClass: 'nature',     timerKey: 'vulnerable_nature' });

    // Debuffs
    if (this.debuffs.weak) chips.push({ label: '虛弱', colorClass: 'debuff', timerKey: 'debuffs_weak' });
    if (this.debuffs.slow) chips.push({ label: '緩速', colorClass: 'debuff', timerKey: 'debuffs_slow' });

    // Special States
    if (this.specialStates.focused)         chips.push({ label: '聚焦（電磁+灼熱脆弱）', colorClass: 'special', timerKey: 'specialStates_focused' });
    if (this.specialStates.crystalAttached) chips.push({ label: '源石結晶 💎',           colorClass: 'special', timerKey: 'specialStates_crystalAttached' });
    if (this.specialStates.clawMark)        chips.push({ label: '爪印斫痕',               colorClass: 'fire',    timerKey: 'specialStates_clawMark' });
    if (this.specialStates.snowfield)       chips.push({ label: '冰雪地帶',               colorClass: 'cold',    timerKey: 'specialStates_snowfield' });
    if (this.specialStates.bomb)            chips.push({ label: '自製炸彈 💣',            colorClass: 'nature',  timerKey: 'specialStates_bomb' });

    return chips;
  }
}
