'use strict';

// ── GameLog ──────────────────────────────────────────────────────────────────
class GameLog {
  constructor() {
    this.entries = [];
  }

  _now() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  }

  add(charName, skillName, message, colorClass = 'physical') {
    this.entries.unshift({ time: this._now(), charName, skillName, message, colorClass });
    if (this.entries.length > 200) this.entries.pop();
  }

  addEffect(message) {
    this.entries.unshift({ time: this._now(), charName: '系統', skillName: '', message, colorClass: 'system' });
    if (this.entries.length > 200) this.entries.pop();
  }

  addSystem(message) {
    this.entries.unshift({ time: this._now(), charName: '系統', skillName: '', message, colorClass: 'system' });
  }

  clear() { this.entries = []; }
}

// ── BattleState ──────────────────────────────────────────────────────────────
class BattleState {
  constructor(party, enemyCount) {
    this.party = party;
    this.enemies = Array.from({ length: enemyCount }, (_, i) => new Enemy(i + 1));
    this.log = new GameLog();

    this.sharedTechPower = TECH_POWER_MAX;
    this.techPowerMax = TECH_POWER_MAX;

    // Per-character ultimate energy
    this.ultimateEnergy = new Map();
    for (const char of party) {
      const max = ULTIMATE_MAX[char.jobClass] || ULTIMATE_MAX.default;
      this.ultimateEnergy.set(char.name, { current: max, max });
    }

    // Chain availability and cooldown
    this.chainAvailable = new Set();
    this.chainCooldownUntil = new Map(); // charName → timestamp (ms)
    this.chainWindowTimers = new Map();  // charName → timedEffect id

    // Ultimate active window (10s after using 大招; blocks 戰技/連攜技)
    this.ultimateActiveUntil = new Map(); // charName → timestamp (ms)

    // Main unit: index into party (the character currently controlled)
    this.mainUnitIdx = 0;

    // Normal attack counter for main unit (0–4; 4 = heavy ready)
    this.normalAttackCombo = 0;

    // 湯湯 vortex count
    this.vortexCount = 0;

    // Team-wide buffs
    this.teamBuffs = { combo: false };

    // Timed effects: [{ id, label, enemyId|null, charName|null, expiresAt, onExpire }]
    this.timedEffects = [];
    this._timedEffectCounter = 0;

    this._regenTimer = null;
    this._timedTimer = null;
    this._onChange = null;
  }

  startRegen() {
    this._regenTimer = setInterval(() => {
      if (this.sharedTechPower < this.techPowerMax) {
        this.sharedTechPower = Math.min(this.techPowerMax, this.sharedTechPower + TECH_POWER_REGEN_AMOUNT);
        if (this._onChange) this._onChange('all');
      }
    }, TECH_POWER_REGEN_INTERVAL_MS);
    this._timedTimer = setInterval(() => this._tickTimedEffects(), 1000);
  }

  stopRegen() {
    if (this._regenTimer) { clearInterval(this._regenTimer); this._regenTimer = null; }
    if (this._timedTimer) { clearInterval(this._timedTimer); this._timedTimer = null; }
  }

  // ── Timed Effects ─────────────────────────────────────────────────────────
  // tag: 'enemyState' | 'charState' | 'chainWindow' | 'ultimate'
  addTimedEffect(label, durationMs, onExpire, { enemyId = null, charName = null, tag = 'state' } = {}) {
    const id = ++this._timedEffectCounter;
    this.timedEffects.push({ id, label, enemyId, charName, tag, expiresAt: Date.now() + durationMs, onExpire });
    return id;
  }

  removeTimedEffect(id) {
    this.timedEffects = this.timedEffects.filter(e => e.id !== id);
  }

  _registerEnemyStateTimer(enemy, timerKey, label, durationMs, clearFn) {
    const prevId = enemy._stateTimers[timerKey];
    if (prevId) this.removeTimedEffect(prevId);
    enemy._stateTimers[timerKey] = this.addTimedEffect(
      label, durationMs,
      () => { clearFn(); enemy._stateTimers[timerKey] = null; },
      { enemyId: enemy.id, tag: 'enemyState' }
    );
  }

  // ── Ultimate Active Window ─────────────────────────────────────────────────
  isUltimateActive(charName) {
    const until = this.ultimateActiveUntil.get(charName);
    return !!(until && Date.now() < until);
  }

  getUltimateCountdown(charName) {
    const until = this.ultimateActiveUntil.get(charName);
    if (!until) return 0;
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  }

  _onUltimateEnd(char) {
    this.ultimateActiveUntil.delete(char.name);
    this.log.addSystem(`${char.name} 大招效果結束`);
    // 湯湯: all vortexes → 水龍捲
    if (char.name === '湯湯' && this.vortexCount > 0) {
      this.log.addSystem(`湯湯 大招結束：${this.vortexCount} 個渦流轉化為【水龍捲 🌀】，造成大量寒冷傷害！`);
      this.vortexCount = 0;
    }
    if (this._onChange) this._onChange('all');
  }

  // ── Chain Window ───────────────────────────────────────────────────────────
  getChainWindowRemaining(charName) {
    const timerId = this.chainWindowTimers.get(charName);
    if (!timerId) return 0;
    const te = this.timedEffects.find(e => e.id === timerId);
    if (!te) return 0;
    return Math.max(0, Math.ceil((te.expiresAt - Date.now()) / 1000));
  }

  _cancelStateTimer(enemy, timerKey) {
    const prevId = enemy._stateTimers[timerKey];
    if (prevId) { this.removeTimedEffect(prevId); enemy._stateTimers[timerKey] = null; }
  }

  _tickTimedEffects() {
    const now = Date.now();
    const expired = this.timedEffects.filter(e => now >= e.expiresAt);
    if (expired.length === 0) return;
    this.timedEffects = this.timedEffects.filter(e => now < e.expiresAt);
    for (const e of expired) {
      e.onExpire();
      this.log.addSystem(`⏱ 【${e.label}】效果到期`);
    }
    if (this._onChange) this._onChange('all');
  }

  setMainUnit(idx) {
    this.mainUnitIdx = idx;
    this.normalAttackCombo = 0; // reset combo on switch
    this.log.addSystem(`主幹員切換為 ${this.party[idx].name}`);
    if (this._onChange) this._onChange('all');
  }

  // ── Normal / Plunge / Heavy Attacks (main unit only) ──────────────────────
  doNormalAttack(targets) {
    const char = this.party[this.mainUnitIdx];
    // Check if 伊馮 has nextAttackIsHeavy flag
    if (char.specialState && char.specialState.nextAttackIsHeavy) {
      char.specialState.nextAttackIsHeavy = false;
      this.log.add(char.name, '重擊', `${char.name} 普攻→重擊！（伊馮天賦：凍結後下次普攻為重擊 +50%傷害）`, char.colorClass());
      this._executeHeavyHitOnTargets(char, targets);
      if (this._onChange) this._onChange('all');
      return;
    }

    this.normalAttackCombo = Math.min(4, this.normalAttackCombo + 1);
    this.log.add(char.name, '普攻', `${char.name} 普攻 ${this.normalAttackCombo}/4`, char.colorClass());
    if (this._onChange) this._onChange('all');
  }

  doHeavyAttack(targets) {
    const char = this.party[this.mainUnitIdx];
    if (this.normalAttackCombo < 4 && !(char.specialState && char.specialState.nextAttackIsHeavy)) {
      this.log.addSystem('重擊需要先完成 4 次普攻');
      if (this._onChange) this._onChange('all');
      return;
    }
    this.normalAttackCombo = 0;
    if (char.specialState) char.specialState.nextAttackIsHeavy = false;
    this.log.add(char.name, '重擊', `${char.name} 重擊！`, char.colorClass());
    this._executeHeavyHitOnTargets(char, targets);
    if (this._onChange) this._onChange('all');
  }

  doPlungeAttack(targets) {
    const char = this.party[this.mainUnitIdx];
    this.log.add(char.name, '下墜攻擊', `${char.name} 下墜攻擊！`, char.colorClass());
    const chainEvents = [];
    for (const target of targets) {
      if (target.spellAbnormality.frozen) {
        target.applyIceShatter(this.log);
        this._cancelStateTimer(target, 'spellAbnormality_frozen');
        chainEvents.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_FROZEN, enemy: target });
      }
      chainEvents.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_ANY, enemy: target });
    }
    // 湯湯 talent: plunge during ultimate → extra vortex
    const tangTang = this.party.find(c => c.name === '湯湯');
    if (tangTang && this.isUltimateActive('湯湯')) {
      this.vortexCount = Math.min(2, this.vortexCount + 1);
      this.log.addSystem(`湯湯天賦：下落攻擊形成額外渦流（現 ${this.vortexCount}）`);
    }
    for (const evt of chainEvents) this.fireChainEvent(evt);
    this._checkStandingConditions();
    if (this._onChange) this._onChange('all');
  }

  // 處決攻擊: normal attack on an imbalanced enemy (倒地/擊飛 or 失衡值 > 0)
  canExecute(targets) {
    return targets.some(t => t.imbalanceValue > 0 ||
      t.physicalAbnormality === PHYSICAL_ABNORMALITY_TYPE.KNOCKDOWN ||
      t.physicalAbnormality === PHYSICAL_ABNORMALITY_TYPE.LAUNCHED);
  }

  doExecuteAttack(targets) {
    const char = this.party[this.mainUnitIdx];
    const executable = targets.filter(t => t.imbalanceValue > 0 ||
      t.physicalAbnormality === PHYSICAL_ABNORMALITY_TYPE.KNOCKDOWN ||
      t.physicalAbnormality === PHYSICAL_ABNORMALITY_TYPE.LAUNCHED);
    if (executable.length === 0) {
      this.log.addSystem('處決攻擊需要目標處於失衡狀態（倒地/擊飛/失衡值>0）');
      if (this._onChange) this._onChange('all');
      return;
    }
    this.log.add(char.name, '處決攻擊', `${char.name} 對失衡敵人發動處決攻擊！`, char.colorClass());
    const chainEvents = [];
    for (const target of executable) {
      chainEvents.push({ type: CHAIN_EVENT_TYPE.EXECUTE_ATTACK, enemy: target });
      chainEvents.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_ANY, enemy: target });
      if (target.spellAttachment.electric > 0 || target.spellAbnormality.conducting)
        chainEvents.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_ELECTRIC, enemy: target });
      for (const partyChar of this.party) {
        if (typeof partyChar.onHeavyAttack === 'function')
          chainEvents.push(...partyChar.onHeavyAttack(target, this));
      }
    }
    for (const evt of chainEvents) this.fireChainEvent(evt);
    this._checkStandingConditions();
    if (this._onChange) this._onChange('all');
  }

  _executeHeavyHitOnTargets(_char, targets) {
    const chainEvents = [];
    for (const target of targets) {
      // Ice shatter on frozen
      if (target.spellAbnormality.frozen) {
        target.applyIceShatter(this.log);
        this._cancelStateTimer(target, 'spellAbnormality_frozen');
        chainEvents.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_FROZEN, enemy: target });
      }
      // 重擊 raises 失衡值 (per 動作 mechanics doc)
      target.imbalanceValue++;
      this.log.addEffect(`敵人 ${target.id} 受到重擊，失衡值 +1（${target.imbalanceValue}）`);
      chainEvents.push({ type: CHAIN_EVENT_TYPE.ENEMY_IMBALANCE, enemy: target });
      chainEvents.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_ANY, enemy: target });
      if (target.vulnerable.physical || target.physicalAbnormality === PHYSICAL_ABNORMALITY_TYPE.ARMOR_CRUSH)
        chainEvents.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_PHYSICAL_VULN, enemy: target });
      if (target.spellAttachment.electric > 0 || target.spellAbnormality.conducting)
        chainEvents.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_ELECTRIC, enemy: target });
      if (!target.armorBreak && !target.hasAnySpellAttachment())
        chainEvents.push({ type: CHAIN_EVENT_TYPE.HEAVY_HIT_NO_BREAK_NO_ATTACH, enemy: target });

      // Per-party-member reactions to heavy hit
      for (const partyChar of this.party) {
        if (typeof partyChar.onHeavyAttack === 'function') {
          const evts = partyChar.onHeavyAttack(target, this);
          chainEvents.push(...evts);
        }
      }
    }
    for (const evt of chainEvents) this.fireChainEvent(evt);
    this._checkStandingConditions();
  }

  // ── Skill Execution ────────────────────────────────────────────────────────
  executeSkill(charIdx, skillType, targets) {
    const char = this.party[charIdx];
    if (!char) return;

    // Block 戰技/連攜技 while this character's ultimate is active
    if ((skillType === SKILL_TYPE.BATTLE || skillType === SKILL_TYPE.CHAIN) && this.isUltimateActive(char.name)) {
      const cd = this.getUltimateCountdown(char.name);
      this.log.addSystem(`${char.name} 大招施放中（剩餘 ${cd}s），無法使用戰技/連攜技`);
      if (this._onChange) this._onChange('all');
      return;
    }

    if (skillType === SKILL_TYPE.BATTLE) {
      const cost = char.battleTechCost(this);
      if (this.sharedTechPower < cost) {
        this.log.addSystem(`技力不足（${this.sharedTechPower}/${cost}）`);
        if (this._onChange) this._onChange('all');
        return;
      }
      this.sharedTechPower -= cost;
    }

    if (skillType === SKILL_TYPE.ULTIMATE) {
      const energy = this.ultimateEnergy.get(char.name);
      if (!energy || energy.current < energy.max) {
        this.log.addSystem(`${char.name} 大招能量不足`);
        if (this._onChange) this._onChange('all');
        return;
      }
      energy.current = 0;
    }

    if (skillType === SKILL_TYPE.CHAIN) {
      if (!this.isChainReady(char.name)) {
        const cd = this.getChainCooldown(char.name);
        if (cd > 0) {
          this.log.addSystem(`${char.name} 連攜技冷卻中（剩餘 ${cd}s）`);
        } else {
          this.log.addSystem(`${char.name} 連攜技條件未達成`);
        }
        if (this._onChange) this._onChange('all');
        return;
      }
      // Cancel chain window timer and start 30s cooldown
      const winId = this.chainWindowTimers.get(char.name);
      if (winId) { this.removeTimedEffect(winId); this.chainWindowTimers.delete(char.name); }
      this.chainAvailable.delete(char.name);
      this.chainCooldownUntil.set(char.name, Date.now() + 30000);
    }

    const effects = char.useSkill(skillType, targets, this);

    const skillNames = { [SKILL_TYPE.BATTLE]: '戰技', [SKILL_TYPE.CHAIN]: '連攜技', [SKILL_TYPE.ULTIMATE]: '大招' };
    this.log.add(char.name, skillNames[skillType], '', char.colorClass());

    const chainEvents = [];
    for (const effect of effects) {
      const evts = this._executeEffect(effect, char);
      chainEvents.push(...evts);
    }

    // Register 10s ultimate active window
    if (skillType === SKILL_TYPE.ULTIMATE) {
      this.ultimateActiveUntil.set(char.name, Date.now() + 10000);
      const capturedChar = char;
      this.addTimedEffect(`${char.name} 大招`, 10000,
        () => this._onUltimateEnd(capturedChar),
        { charName: char.name, tag: 'ultimate' });
    }

    // Charge ultimate energy (別禮 only from own skills)
    if (skillType === SKILL_TYPE.BATTLE || skillType === SKILL_TYPE.CHAIN) {
      for (const partyChar of this.party) {
        if (partyChar.name === '別禮' && char.name !== '別禮') continue;
        const energy = this.ultimateEnergy.get(partyChar.name);
        if (energy) energy.current = Math.min(energy.max, energy.current + ULTIMATE_CHARGE_PER_SKILL);
      }
    }

    for (const evt of chainEvents) this.fireChainEvent(evt);
    this._checkStandingConditions();

    if (this._onChange) this._onChange('all');
  }

  _executeEffect(effect, char) {
    const chainEvents = [];

    switch (effect.type) {
      case EFFECT_TYPE.LOG_ONLY:
        this.log.add(char.name, '', effect.message, char.colorClass());
        break;

      case EFFECT_TYPE.ARMOR_BREAK: {
        const t = effect.target;
        const prevBreak = t.armorBreak;
        t.applyArmorBreak(effect.delta, this.log);
        if (t.armorBreak > prevBreak) {
          chainEvents.push({ type: CHAIN_EVENT_TYPE.ARMOR_BREAK_GAINED, enemy: t });
          if (t.armorBreak >= MAX_ARMOR_BREAK)
            chainEvents.push({ type: CHAIN_EVENT_TYPE.ARMOR_BREAK_4, enemy: t });
        }
        break;
      }

      case EFFECT_TYPE.PHYSICAL_ABNORMALITY: {
        const t = effect.target;
        const result = t.applyPhysicalAbnormality(effect.abnormalType, this.log);
        chainEvents.push(...result.chainEvents);
        if (result.hadBreak && (effect.abnormalType === PHYSICAL_ABNORMALITY_TYPE.CRUSH ||
                                 effect.abnormalType === PHYSICAL_ABNORMALITY_TYPE.ARMOR_CRUSH))
          chainEvents.push({ type: CHAIN_EVENT_TYPE.PHYSICAL_ABNORMALITY_CONSUMED, abnormalType: effect.abnormalType, enemy: t });
        if (t.specialStates.focused)
          chainEvents.push({ type: CHAIN_EVENT_TYPE.FOCUSED_ENEMY_ABNORMALITY, enemy: t });
        break;
      }

      case EFFECT_TYPE.SPELL_ATTACH: {
        const t = effect.target;
        const result = t.applySpellAttachment(effect.element, effect.layers, this.log);
        chainEvents.push(...result.chainEvents);
        // Register timers for any spell abnormalities triggered by cross-element combo
        const abnormNames = { burning:'燃燒 🔥', conducting:'導電 ⚡', corrosion:'腐蝕 🤢', frozen:'凍結 ❄️' };
        for (const evt of result.chainEvents) {
          if (evt.type === CHAIN_EVENT_TYPE.SPELL_ABNORMALITY_APPLIED) {
            const aType = evt.abnormalType;
            this._registerEnemyStateTimer(t, `spellAbnormality_${aType}`, abnormNames[aType] || aType,
              TIMED_EFFECT_DURATIONS.DEFAULT_STATE, () => { t.spellAbnormality[aType] = false; t.spellAbnormalityLevel[aType] = 0; });
          }
        }
        if (t.specialStates.focused)
          chainEvents.push({ type: CHAIN_EVENT_TYPE.FOCUSED_ENEMY_ABNORMALITY, enemy: t });
        break;
      }

      case EFFECT_TYPE.SPELL_ATTACH_CLEAR: {
        const result = effect.target.clearSpellAttachment(effect.element, this.log);
        chainEvents.push(...result.chainEvents);
        break;
      }

      case EFFECT_TYPE.SPELL_ATTACH_CLEAR_ALL: {
        const result = effect.target.clearAllSpellAttachments(this.log);
        chainEvents.push(...result.chainEvents);
        chainEvents.push({ type: CHAIN_EVENT_TYPE.SPELL_ABNORMALITY_CONSUMED, enemy: effect.target });
        break;
      }

      case EFFECT_TYPE.SPELL_ABNORMALITY: {
        const t = effect.target;
        const result = t.applySpellAbnormality(effect.abnormalType, this.log, effect.level);
        chainEvents.push(...result.chainEvents);
        const saNames = { burning:'燃燒 🔥', conducting:'導電 ⚡', corrosion:'腐蝕 🤢', frozen:'凍結 ❄️' };
        this._registerEnemyStateTimer(t, `spellAbnormality_${effect.abnormalType}`,
          saNames[effect.abnormalType] || effect.abnormalType,
          effect.duration || TIMED_EFFECT_DURATIONS.DEFAULT_STATE,
          () => { t.spellAbnormality[effect.abnormalType] = false; t.spellAbnormalityLevel[effect.abnormalType] = 0; });
        break;
      }

      case EFFECT_TYPE.SPELL_ABNORMALITY_CLEAR: {
        const evts = effect.target.clearSpellAbnormality(effect.abnormalType, this.log);
        chainEvents.push(...evts);
        this._cancelStateTimer(effect.target, `spellAbnormality_${effect.abnormalType}`);
        break;
      }

      case EFFECT_TYPE.VULNERABLE: {
        const t = effect.target;
        t.applyVulnerable(effect.vulnType, this.log, effect.value);
        const timerKey = `vulnerable_${effect.vulnType}`;
        if (effect.value === false || effect.value === 0) {
          this._cancelStateTimer(t, timerKey);
        } else {
          const defaultClear = (effect.vulnType === 'cold') ? 0 : false;
          const vulnNames = { physical:'物理脆弱', spell:'法術脆弱', cold:'寒冷脆弱', electric:'電磁脆弱', fire:'灼熱脆弱', nature:'自然脆弱' };
          this._registerEnemyStateTimer(t, timerKey, vulnNames[effect.vulnType] || effect.vulnType,
            effect.duration || TIMED_EFFECT_DURATIONS.DEFAULT_STATE,
            () => { t.vulnerable[effect.vulnType] = defaultClear; });
        }
        break;
      }

      case EFFECT_TYPE.DEBUFF: {
        const t = effect.target;
        t.applyDebuff(effect.debuffType, this.log);
        const debuffNames = { weak:'虛弱', slow:'緩速' };
        this._registerEnemyStateTimer(t, `debuffs_${effect.debuffType}`,
          debuffNames[effect.debuffType] || effect.debuffType,
          effect.duration || TIMED_EFFECT_DURATIONS.DEFAULT_STATE,
          () => { t.debuffs[effect.debuffType] = false; });
        break;
      }

      case EFFECT_TYPE.SPECIAL_STATE: {
        const t = effect.target;
        t.setSpecialState(effect.key, effect.value, this.log, effect.label);
        const timerKey = `specialStates_${effect.key}`;
        if (effect.value === true) {
          const specialLabels = {
            crystalAttached: '源石結晶 💎', focused: '聚焦',
            clawMark: '爪印斫痕', snowfield: '冰雪地帶', bomb: '自製炸彈 💣',
            fireWings: '銜火血翼 🔥🪽'
          };
          const duration = effect.duration
            || (effect.key === 'crystalAttached'
              ? TIMED_EFFECT_DURATIONS.CRYSTAL_ATTACHED
              : TIMED_EFFECT_DURATIONS.DEFAULT_STATE);
          this._registerEnemyStateTimer(t, timerKey, specialLabels[effect.key] || effect.key,
            duration, () => { t.specialStates[effect.key] = false; });
        } else if (effect.value === false) {
          this._cancelStateTimer(t, timerKey);
        }
        break;
      }

      case EFFECT_TYPE.TIMED_CHAR_STATE: {
        // effect: { char, key, label, duration }
        const cs = effect.char.specialState;
        const prevId = cs[`_timerId_${effect.key}`];
        if (prevId) this.removeTimedEffect(prevId);
        cs[`_timerId_${effect.key}`] = this.addTimedEffect(
          effect.label, effect.duration,
          () => { cs[effect.key] = 0; cs[`_timerId_${effect.key}`] = null; },
          { charName: effect.char.name, tag: 'charState' }
        );
        break;
      }

      case EFFECT_TYPE.TECH_RESTORE:
        this.sharedTechPower = Math.min(this.techPowerMax, this.sharedTechPower + effect.amount);
        this.log.addSystem(`技力回復 +${effect.amount}（現 ${this.sharedTechPower}）`);
        break;

      case EFFECT_TYPE.ULTIMATE_CHARGE: {
        const energy = this.ultimateEnergy.get(effect.charName);
        if (energy) {
          energy.current = Math.min(energy.max, energy.current + effect.amount);
          this.log.addSystem(`${effect.charName} 終結技能量 +${effect.amount}（現 ${energy.current}/${energy.max}）`);
        }
        break;
      }

      case EFFECT_TYPE.CHAIN_EVENT:
        chainEvents.push(...(effect.events || []));
        break;
    }

    return chainEvents;
  }

  // ── Chain Condition System ─────────────────────────────────────────────────
  isChainReady(charName) {
    const until = this.chainCooldownUntil.get(charName);
    if (until && Date.now() < until) return false; // on cooldown
    return this.chainAvailable.has(charName);
  }

  getChainCooldown(charName) {
    const until = this.chainCooldownUntil.get(charName);
    if (!until) return 0;
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  }

  fireChainEvent(evt) {
    const t = evt.enemy;
    const evtType = evt.type;

    for (const char of this.party) {
      let unlock = false;
      switch (char.name) {
        case '管理員':  unlock = evtType === CHAIN_EVENT_TYPE.CHAIN_SKILL_USED; break;
        case '黎風':    unlock = evtType === CHAIN_EVENT_TYPE.HEAVY_HIT_PHYSICAL_VULN; break;
        case '陳千語':  unlock = evtType === CHAIN_EVENT_TYPE.ARMOR_BREAK_GAINED; break;
        case '駿尉':    unlock = evtType === CHAIN_EVENT_TYPE.PHYSICAL_ABNORMALITY_CONSUMED; break;
        case '洛茜':    unlock = evtType === CHAIN_EVENT_TYPE.ENEMY_HAS_BREAK_AND_ATTACHMENT; break;
        case '佩麗卡':  unlock = evtType === CHAIN_EVENT_TYPE.HEAVY_HIT_ANY; break;
        case '狼衛':    unlock = evtType === CHAIN_EVENT_TYPE.SPELL_ATTACHMENT_APPLIED; break;
        case '艾爾黛拉': unlock = evtType === CHAIN_EVENT_TYPE.HEAVY_HIT_NO_BREAK_NO_ATTACH; break;
        case '潔爾佩塔': unlock = evtType === CHAIN_EVENT_TYPE.SPELL_ABNORMALITY_APPLIED; break;
        case '湯湯':
          unlock = (evtType === CHAIN_EVENT_TYPE.SPELL_ATTACHMENT_APPLIED && evt.element === 'cold') ||
                   evtType === CHAIN_EVENT_TYPE.SPELL_ABNORMALITY_APPLIED;
          break;
        case '別禮':
          unlock = evtType === CHAIN_EVENT_TYPE.SPELL_ATTACHMENT_APPLIED &&
                   evt.element === 'cold' && t && t.spellAttachment.cold >= 3;
          break;
        case '塞希':    unlock = evtType === CHAIN_EVENT_TYPE.CRYSTAL_CHARGES_DEPLETED; break;
        case '晝雪':    unlock = evtType === CHAIN_EVENT_TYPE.MAIN_UNIT_ATTACKED; break;
        case '餘燼':    unlock = evtType === CHAIN_EVENT_TYPE.MAIN_UNIT_ATTACKED; break;
        case '弧光':    unlock = evtType === CHAIN_EVENT_TYPE.CONDUCTING_CHANGED; break;
        case '艾維文娜': unlock = evtType === CHAIN_EVENT_TYPE.HEAVY_HIT_ELECTRIC; break;
        case '大潘':    unlock = evtType === CHAIN_EVENT_TYPE.ARMOR_BREAK_4; break;
        case '阿列什':
          unlock = evtType === CHAIN_EVENT_TYPE.SPELL_ABNORMALITY_CONSUMED ||
                   evtType === CHAIN_EVENT_TYPE.SPELL_ABNORMALITY_APPLIED;
          break;
        case '安塔爾':  unlock = evtType === CHAIN_EVENT_TYPE.FOCUSED_ENEMY_ABNORMALITY; break;
        case '埃特拉':  unlock = evtType === CHAIN_EVENT_TYPE.FROZEN_APPLIED; break;
        case '秋栗':    unlock = evtType === CHAIN_EVENT_TYPE.ENEMY_IMBALANCE; break;
        case '螢石':
          unlock = evtType === CHAIN_EVENT_TYPE.SPELL_ATTACHMENT_APPLIED &&
                   t && (t.spellAttachment.cold >= 2 || t.spellAttachment.nature >= 2);
          break;
        case '卡契爾':
          unlock = evtType === CHAIN_EVENT_TYPE.MAIN_UNIT_HP_LOW ||
                   evtType === CHAIN_EVENT_TYPE.MAIN_UNIT_ATTACKED;
          break;
        case '萊萬汀':
          unlock = evtType === CHAIN_EVENT_TYPE.BURNING_APPLIED ||
                   evtType === CHAIN_EVENT_TYPE.CORROSION_APPLIED;
          break;
        case '伊馮':
          unlock = evtType === CHAIN_EVENT_TYPE.HEAVY_HIT_FROZEN ||
                   evtType === CHAIN_EVENT_TYPE.FROZEN_APPLIED;
          break;
        case '莊芳宜':
          // 對電磁附著 or 導電⚡的敵人重擊 or 處決
          unlock = (evtType === CHAIN_EVENT_TYPE.HEAVY_HIT_ELECTRIC) ||
                   (evtType === CHAIN_EVENT_TYPE.EXECUTE_ATTACK && t &&
                    (t.spellAttachment.electric > 0 || t.spellAbnormality.conducting));
          break;
        case '弭芙':
          // 有敵人達到破防 ≥ 3
          unlock = evtType === CHAIN_EVENT_TYPE.ARMOR_BREAK_GAINED && t && t.armorBreak >= 3;
          break;
        case '卡繆':
          unlock = evtType === CHAIN_EVENT_TYPE.FIRE_ATTACHMENT_CONSUMED;
          break;
      }

      if (unlock && this.party.includes(char) && !this.chainAvailable.has(char.name)) {
        this.chainAvailable.add(char.name);
        this.log.addSystem(`【連攜技】${char.name} 的連攜技條件達成！`);
        // 20s window to use the chain skill; if unused, it locks again
        const capturedChar = char;
        const winId = this.addTimedEffect(`${char.name} 連攜技`, 20000,
          () => {
            if (this.chainAvailable.has(capturedChar.name)) {
              this.chainAvailable.delete(capturedChar.name);
              this.chainWindowTimers.delete(capturedChar.name);
              this.log.addSystem(`${capturedChar.name} 連攜技視窗關閉`);
            }
          },
          { charName: char.name, tag: 'chainWindow' }
        );
        // Cancel previous window timer if re-triggered
        const prevWinId = this.chainWindowTimers.get(char.name);
        if (prevWinId) this.removeTimedEffect(prevWinId);
        this.chainWindowTimers.set(char.name, winId);
      }
    }
  }

  _checkStandingConditions() {
    for (const char of this.party) {
      if (char.name === '洛茜') {
        for (const enemy of this.enemies)
          if (enemy.armorBreak > 0 && enemy.hasAnySpellAttachment()) this.chainAvailable.add('洛茜');
      }
      if (char.name === '別禮') {
        for (const enemy of this.enemies)
          if (enemy.spellAttachment.cold >= 3) this.chainAvailable.add('別禮');
      }
      if (char.name === '螢石') {
        for (const enemy of this.enemies)
          if (enemy.spellAttachment.cold >= 2 || enemy.spellAttachment.nature >= 2) this.chainAvailable.add('螢石');
      }
      if (char.name === '弭芙') {
        for (const enemy of this.enemies)
          if (enemy.armorBreak >= 3) this.chainAvailable.add('弭芙');
      }
    }
  }

  simulateEnemyAttack() {
    this.log.addSystem('⚔ 模擬主控幹員受到攻擊');
    this.fireChainEvent({ type: CHAIN_EVENT_TYPE.MAIN_UNIT_ATTACKED });
    this.fireChainEvent({ type: CHAIN_EVENT_TYPE.MAIN_UNIT_HP_LOW });
    if (this._onChange) this._onChange('all');
  }

  detonateBomb(enemy) {
    if (!enemy.specialStates.bomb) return;
    enemy.specialStates.bomb = false;
    this._cancelStateTimer(enemy, 'specialStates_bomb');
    this.log.addSystem(`💥 螢石炸彈在 敵人${enemy.id} 上爆炸！自然傷害 + 自然附著`);
    const result = enemy.applySpellAttachment(SPELL_ELEMENT.NATURE, 1, this.log);
    for (const evt of result.chainEvents) this.fireChainEvent(evt);
    this._checkStandingConditions();
    if (this._onChange) this._onChange('all');
  }

  getTechPowerPercent() { return (this.sharedTechPower / this.techPowerMax) * 100; }
  getUltimatePercent(charName) {
    const e = this.ultimateEnergy.get(charName);
    return e ? (e.current / e.max) * 100 : 0;
  }
  isUltimateReady(charName) {
    const e = this.ultimateEnergy.get(charName);
    return e ? e.current >= e.max : false;
  }
  canUseBattle() { return this.sharedTechPower >= TECH_POWER_COST; }

  resetEnemy(enemyId) {
    const enemy = this.enemies.find(e => e.id === enemyId);
    if (enemy) {
      // Cancel all timed effects associated with this enemy
      this.timedEffects = this.timedEffects.filter(e => e.enemyId !== enemyId);
      enemy._stateTimers = {};
      enemy.reset(this.log);
      this._checkStandingConditions();
      if (this._onChange) this._onChange('all');
    }
  }
}
