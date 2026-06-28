'use strict';

class UI {
  constructor() {
    this.selectedChars = [];
    this.enemyCount = 1;
    this.battle = null;
    this._pendingSkill = null;
    this._cooldownTimer = null;
    this._logViewMode = 'log'; // 'log' | 'table'
    this._filter = { stars: null, damageType: null, jobClass: null };

    this._bindSelectionPage();
    this._bindModal();
  }

  // ── SELECTION PAGE ──────────────────────────────────────────────────────────
  _bindSelectionPage() {
    document.getElementById('enemy-minus').addEventListener('click', () => {
      if (this.enemyCount > 1) { this.enemyCount--; this._renderEnemyCount(); }
    });
    document.getElementById('enemy-plus').addEventListener('click', () => {
      if (this.enemyCount < 4) { this.enemyCount++; this._renderEnemyCount(); }
    });
    document.getElementById('start-battle-btn').addEventListener('click', () => this._startBattle());
    document.getElementById('clear-party-btn').addEventListener('click', () => {
      this.selectedChars = [];
      document.querySelectorAll('.char-card.selected').forEach(c => c.classList.remove('selected'));
      this._renderPartySlots();
      this._updateStartButton();
      this._updateCardDisabled();
    });
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.filter;
        const rawVal = btn.dataset.value;
        const val = key === 'stars' ? Number(rawVal) : rawVal;
        if (this._filter[key] === val) {
          this._filter[key] = null;
          btn.classList.remove('active');
        } else {
          document.querySelectorAll(`.filter-btn[data-filter="${key}"]`).forEach(b => b.classList.remove('active'));
          this._filter[key] = val;
          btn.classList.add('active');
        }
        this._renderCharGrid();
      });
    });
    this._renderCharGrid();
  }

  _renderCharGrid() {
    let list = [...ROSTER];
    if (this._filter.stars)      list = list.filter(c => c.stars === this._filter.stars);
    if (this._filter.damageType) list = list.filter(c => c.damageType === this._filter.damageType);
    if (this._filter.jobClass)   list = list.filter(c => c.jobClass === this._filter.jobClass);
    list.sort((a, b) => b.stars - a.stars || a.damageType.localeCompare(b.damageType) || a.jobClass.localeCompare(b.jobClass));

    const grid = document.getElementById('char-grid');
    grid.innerHTML = '';
    for (const char of list) {
      const card = document.createElement('div');
      card.className = 'char-card';
      card.dataset.name = char.name;
      if (this.selectedChars.some(c => c.name === char.name)) card.classList.add('selected');
      const colorCls = char.colorClass();
      card.innerHTML = `
        <div class="char-name">${char.name}</div>
        <div class="char-stars">${'★'.repeat(char.stars)}</div>
        <span class="badge badge-class">${char.jobClass}</span>
        <span class="badge badge-${colorCls}">${this._damageLabel(char.damageType)}</span>
      `;
      card.addEventListener('click', () => this._toggleCharSelect(char, card));
      grid.appendChild(card);
    }
    this._updateCardDisabled();
  }

  _damageLabel(dt) {
    return { [DAMAGE_TYPE.PHYSICAL]:'物理', [DAMAGE_TYPE.FIRE]:'灼熱',
             [DAMAGE_TYPE.ELECTRIC]:'電磁', [DAMAGE_TYPE.NATURE]:'自然',
             [DAMAGE_TYPE.COLD]:'寒冷' }[dt] || dt;
  }

  _toggleCharSelect(char, card) {
    const idx = this.selectedChars.findIndex(c => c.name === char.name);
    if (idx >= 0) {
      this.selectedChars.splice(idx, 1);
      card.classList.remove('selected');
    } else {
      if (this.selectedChars.length >= 4) return;
      this.selectedChars.push(char);
      card.classList.add('selected');
    }
    this._renderPartySlots();
    this._updateStartButton();
    this._updateCardDisabled();
  }

  _updateCardDisabled() {
    const full = this.selectedChars.length >= 4;
    document.querySelectorAll('.char-card').forEach(card => {
      const sel = this.selectedChars.some(c => c.name === card.dataset.name);
      card.classList.toggle('disabled', full && !sel);
    });
  }

  _renderPartySlots() {
    document.querySelectorAll('.party-slot').forEach((slot, i) => {
      const char = this.selectedChars[i];
      if (char) {
        slot.className = 'party-slot filled';
        slot.textContent = char.name;
        const btn = document.createElement('button');
        btn.className = 'slot-remove';
        btn.textContent = '×';
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const cardEl = document.querySelector(`.char-card[data-name="${char.name}"]`);
          if (cardEl) this._toggleCharSelect(char, cardEl);
        });
        slot.appendChild(btn);
      } else {
        slot.className = 'party-slot empty';
        slot.textContent = '';
      }
    });
    document.getElementById('party-count').textContent = this.selectedChars.length;
  }

  _renderEnemyCount() {
    document.getElementById('enemy-count-display').textContent = this.enemyCount;
  }

  _updateStartButton() {
    document.getElementById('start-battle-btn').disabled = this.selectedChars.length === 0;
  }

  // ── BATTLE START ────────────────────────────────────────────────────────────
  _startBattle() {
    this.battle = new BattleState(this.selectedChars, this.enemyCount);
    this.battle._onChange = () => this.renderBattle();
    this.battle.startRegen();

    document.getElementById('page-selection').classList.remove('active');
    document.getElementById('page-battle').classList.add('active');

    this._bindBattlePage();
    this.renderBattle();
  }

  _bindBattlePage() {
    document.getElementById('back-btn').addEventListener('click', () => {
      this.battle.stopRegen();
      this._stopCooldownTimer();
      document.getElementById('page-battle').classList.remove('active');
      document.getElementById('page-selection').classList.add('active');
    });
    document.getElementById('sim-attack-btn').addEventListener('click', () => {
      this.battle.simulateEnemyAttack();
    });
    document.getElementById('clear-log-btn').addEventListener('click', () => {
      this.battle.log.clear();
      this.renderBattle();
    });
    document.getElementById('log-view-toggle').addEventListener('click', (e) => {
      this._logViewMode = this._logViewMode === 'log' ? 'table' : 'log';
      e.target.textContent = this._logViewMode === 'table' ? '📜 記錄' : '📋 表格';
      this._renderLog();
    });
    document.getElementById('export-csv-btn').addEventListener('click', () => this._exportLogCsv());

    // Collapsible enemy panel
    document.getElementById('enemy-toggle-bar').addEventListener('click', () => {
      const br = document.querySelector('.battle-right');
      br.classList.toggle('collapsed');
    });

    // Collapsible log
    document.getElementById('log-collapse-btn').addEventListener('click', () => {
      document.querySelector('.log-section').classList.toggle('collapsed');
    });

    // On mobile, collapse log by default
    if (window.innerWidth <= 600) {
      document.querySelector('.log-section').classList.add('collapsed');
    }
  }

  // ── COOLDOWN TIMER ─────────────────────────────────────────────────────────
  _startCooldownTimer() {
    if (this._cooldownTimer) return;
    this._cooldownTimer = setInterval(() => {
      const anyActive = this.battle && this.battle.party.some(c =>
        this.battle.getChainCooldown(c.name) > 0 ||
        this.battle.isUltimateActive(c.name) ||
        this.battle.getChainWindowRemaining(c.name) > 0
      );
      if (anyActive) {
        this._renderPartyPanel();
        this._renderTeamStatus();
      } else {
        this._stopCooldownTimer();
      }
    }, 1000);
  }

  _stopCooldownTimer() {
    if (this._cooldownTimer) { clearInterval(this._cooldownTimer); this._cooldownTimer = null; }
  }

  // ── BATTLE RENDER ───────────────────────────────────────────────────────────
  renderBattle() {
    this._renderTechPower();
    this._renderTeamStatus();
    this._renderPartyPanel();
    this._renderEnemyPanel();
    this._renderLog();
  }

  _renderTeamStatus() {
    const el = document.getElementById('team-status');
    if (!el) return;
    el.innerHTML = '';
    const party = this.battle.party;

    // 湯湯 渦流
    const tangTang = party.find(c => c.name === '湯湯');
    if (tangTang) {
      const v = this.battle.vortexCount;
      const chip = document.createElement('span');
      chip.className = `team-status-chip cold`;
      chip.textContent = `渦流 💧 ${v}/2`;
      el.appendChild(chip);
    }

    // 艾爾黛拉 多利影子
    const aiEr = party.find(c => c.name === '艾爾黛拉');
    if (aiEr && aiEr.specialState.shadowCount > 0) {
      const chip = document.createElement('span');
      chip.className = `team-status-chip nature`;
      chip.textContent = `多利影子 🌿 ${aiEr.specialState.shadowCount}`;
      chip.title = '點擊消耗一個影子，主幹員回復生命';
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', () => { aiEr.consumeShadow(this.battle); this.renderBattle(); });
      el.appendChild(chip);
    }

    // 萊萬汀 熔火 (mirrors party panel)
    const lwt = party.find(c => c.name === '萊萬汀');
    if (lwt && lwt.specialState.moltenFire > 0) {
      const chip = document.createElement('span');
      chip.className = `team-status-chip fire`;
      chip.textContent = `熔火 🔥 ${lwt.specialState.moltenFire}/4`;
      el.appendChild(chip);
    }

    // Character-level timed effects (e.g. 支援晶體) — exclude enemy states, chain windows, ultimate timers
    const now = Date.now();
    for (const te of this.battle.timedEffects) {
      if (te.tag !== 'charState') continue;
      const remaining = Math.max(0, Math.ceil((te.expiresAt - now) / 1000));
      const chip = document.createElement('span');
      chip.className = 'team-status-chip timed';
      chip.textContent = `${te.label} ⏱${remaining}s`;
      el.appendChild(chip);
    }
  }

  _renderTechPower() {
    const tp = this.battle.sharedTechPower;
    const max = this.battle.techPowerMax;
    document.getElementById('tp-value').textContent = `${tp}/${max}`;
    document.getElementById('tp-bar').style.width = `${(tp / max) * 100}%`;
  }

  _renderPartyPanel() {
    const panel = document.getElementById('party-panel');
    panel.innerHTML = '';
    this.battle.party.forEach((char, idx) => panel.appendChild(this._buildCharBlock(char, idx)));
  }

  _buildCharBlock(char, charIdx) {
    const colorCls = char.colorClass();
    const energy = this.battle.ultimateEnergy.get(char.name);
    const ultPct = energy ? (energy.current / energy.max) * 100 : 0;
    const ultReady = this.battle.isUltimateReady(char.name);
    const canBattle = this.battle.canUseBattle();
    const isMain = this.battle.mainUnitIdx === charIdx;
    const chainReady = this.battle.isChainReady(char.name);
    const chainCD = this.battle.getChainCooldown(char.name);

    const ultActive = this.battle.isUltimateActive(char.name);
    const ultCD = this.battle.getUltimateCountdown(char.name);
    const chainWindowRemaining = this.battle.getChainWindowRemaining(char.name);

    const block = document.createElement('div');
    block.className = `char-block${isMain ? ' is-main-unit' : ''}${ultActive ? ' ult-active' : ''}`;

    // Header row
    const headerDiv = document.createElement('div');
    headerDiv.className = 'char-block-header';
    headerDiv.innerHTML = `
      <span class="char-block-name">${char.name}</span>
      <span class="badge badge-class">${char.jobClass}</span>
      <span class="char-block-stars">${'★'.repeat(char.stars)}</span>
    `;
    // Book icon
    const bookBtn = document.createElement('button');
    bookBtn.className = 'book-icon-btn';
    bookBtn.title = '查看幹員詳細資訊';
    bookBtn.textContent = '📖';
    bookBtn.addEventListener('click', () => this._openCharModal(char));
    headerDiv.appendChild(bookBtn);
    // Main unit badge
    const mainBadge = document.createElement('span');
    mainBadge.className = `main-unit-badge${isMain ? ' active' : ''}`;
    mainBadge.textContent = isMain ? '★主幹員' : '設主幹員';
    mainBadge.title = isMain ? '目前主幹員' : '點擊設為主幹員';
    mainBadge.addEventListener('click', () => {
      if (!isMain) this.battle.setMainUnit(charIdx);
    });
    headerDiv.appendChild(mainBadge);
    block.appendChild(headerDiv);

    // Ultimate active badge
    if (ultActive) {
      const ultActiveBadge = document.createElement('div');
      ultActiveBadge.className = 'ult-active-badge';
      ultActiveBadge.textContent = `⚡ 大招施放中 ${ultCD}s（戰技/連攜技鎖定）`;
      block.appendChild(ultActiveBadge);
      this._startCooldownTimer();
    }

    // Ultimate energy bar
    const ultBarWrap = document.createElement('div');
    ultBarWrap.className = 'ult-bar-wrap';
    ultBarWrap.innerHTML = `
      <div class="ult-bar-label">
        <span>終結技</span>
        <span>${energy ? energy.current : 0}/${energy ? energy.max : 180}</span>
      </div>
      <div class="ult-bar-bg">
        <div class="ult-bar-fill ${colorCls}" style="width:${ultPct}%"></div>
      </div>
    `;
    block.appendChild(ultBarWrap);

    // Special state display (with crystal charges button for 塞希)
    if (char.specialState && Object.keys(char.specialState).length > 0) {
      const stateDiv = document.createElement('div');
      stateDiv.className = 'char-special-state';
      for (const [k, v] of Object.entries(char.specialState)) {
        const stageNames = { duanyun:'斷雲', zhuixing:'追形', kaitian:'開天' };
        const labels = { ironVow:`鐵誓:${v}`, moltenFire:`熔火:${v}/4`,
                         crystalCharges:`晶體:${v}`, guns:`雷槍:${v}`,
                         shadowCount: v > 0 ? `多利影子:${v}` : null,
                         nextAttackIsHeavy: v ? '★下次普攻=重擊' : null,
                         azureSwords: v > 0 ? `青霆劍:${v}/3` : null,
                         tianliState: v ? '★天理合真' : null,
                         electricAmp: v ? '電磁增幅⚡' : null,
                         skillStage: `招式:${stageNames[v] || v}`,
                         huntMode: v ? '★追獵待命' : null };
        const label = labels[k];
        if (label) {
          const span = document.createElement('span');
          span.textContent = label;
          if (['nextAttackIsHeavy', 'tianliState', 'huntMode'].includes(k) && v) span.style.color = '#fcd34d';
          stateDiv.appendChild(span);
          if (k === 'crystalCharges' && v > 0) {
            const btn = document.createElement('button');
            btn.style.cssText = 'margin-left:6px;padding:1px 6px;font-size:0.7rem;border-radius:4px;border:1px solid #4ade80;background:#14532d;color:#bbf7d0;cursor:pointer;';
            btn.textContent = '使用晶體';
            btn.addEventListener('click', () => {
              char.triggerCrystalCharge(this.battle);
              this.renderBattle();
            });
            stateDiv.appendChild(btn);
          }
        }
      }
      if (stateDiv.children.length > 0) block.appendChild(stateDiv);
    }

    // ── Attack row (only for main unit) ──────────────────────────────────────
    if (isMain) {
      const combo = this.battle.normalAttackCombo;
      const heavyReady = combo >= 4 || (char.specialState && char.specialState.nextAttackIsHeavy);

      const attackRow = document.createElement('div');
      attackRow.className = 'attack-row';

      // 普攻 button
      const normalBtn = document.createElement('button');
      normalBtn.className = 'attack-btn normal-atk';
      normalBtn.textContent = '普攻';
      normalBtn.addEventListener('click', () => this._triggerAttack('normal'));
      attackRow.appendChild(normalBtn);

      // Combo counter
      const counter = document.createElement('span');
      counter.className = 'combo-counter';
      counter.textContent = `${combo}/4`;
      attackRow.appendChild(counter);

      // 下墜攻擊 button
      const plungeBtn = document.createElement('button');
      plungeBtn.className = 'attack-btn plunge-atk';
      plungeBtn.textContent = '下墜';
      plungeBtn.addEventListener('click', () => this._triggerAttack('plunge'));
      attackRow.appendChild(plungeBtn);

      // 重擊 button
      const heavyBtn = document.createElement('button');
      heavyBtn.className = `attack-btn heavy-atk${heavyReady ? ' heavy-ready' : ''}`;
      heavyBtn.textContent = '重擊';
      heavyBtn.disabled = !heavyReady;
      heavyBtn.addEventListener('click', () => this._triggerAttack('heavy'));
      attackRow.appendChild(heavyBtn);

      // 處決攻擊 button (enabled when any enemy is imbalanced)
      const canExec = this.battle.canExecute(this.battle.enemies);
      const execBtn = document.createElement('button');
      execBtn.className = `attack-btn execute-atk${canExec ? ' heavy-ready' : ''}`;
      execBtn.textContent = '處決';
      execBtn.disabled = !canExec;
      execBtn.addEventListener('click', () => this._triggerAttack('execute'));
      attackRow.appendChild(execBtn);

      block.appendChild(attackRow);
    }

    // ── Skill buttons ─────────────────────────────────────────────────────────
    const skillRow = document.createElement('div');
    skillRow.className = 'skill-row';

    // 戰技 (disabled during ultimate); label may be dynamic (skill-replacement chars)
    const battleLabel = char.currentSkillLabel(this.battle) || '戰技';
    const battleBtn = this._makeSkillBtn(battleLabel, 'battle-skill', !canBattle || ultActive,
      char.skillDesc, () => this._triggerSkillWithTarget(charIdx, SKILL_TYPE.BATTLE, this._isBattleAoE(char)));
    if (battleLabel.includes('\n')) battleBtn.style.whiteSpace = 'pre';
    skillRow.appendChild(battleBtn);

    // 連攜技 (with cooldown or window countdown)
    let chainLabel, chainDisabled, chainExtraCls;
    if (chainCD > 0) {
      chainLabel = `連攜技\n${chainCD}s`;
      chainDisabled = true;
      chainExtraCls = '';
      this._startCooldownTimer();
    } else if (chainReady && chainWindowRemaining > 0) {
      chainLabel = `連攜技\n⏳${chainWindowRemaining}s`;
      chainDisabled = false;
      chainExtraCls = ' chain-ready';
      this._startCooldownTimer();
    } else {
      chainLabel = '連攜技';
      chainDisabled = !chainReady;
      chainExtraCls = chainReady ? ' chain-ready' : '';
    }
    const chainBtn = this._makeSkillBtn(chainLabel, `chain-skill${chainExtraCls}`, chainDisabled || ultActive,
      `${char.chainDesc}\n\n觸發條件：${char.chainConditionText}`,
      () => this._triggerSkillWithTarget(charIdx, SKILL_TYPE.CHAIN, this._isChainAoE(char)));
    if (chainLabel.includes('\n')) chainBtn.style.whiteSpace = 'pre';
    skillRow.appendChild(chainBtn);

    // 大招
    const ultBtn = this._makeSkillBtn('大招', `ultimate-skill${ultReady ? ' ult-ready' : ''}`, !ultReady,
      char.ultimateDesc, () => this._triggerSkillWithTarget(charIdx, SKILL_TYPE.ULTIMATE, this._isUltAoE(char)));
    skillRow.appendChild(ultBtn);

    block.appendChild(skillRow);
    return block;
  }

  _makeSkillBtn(label, className, disabled, tooltip, onClick) {
    const btn = document.createElement('button');
    btn.className = `skill-btn ${className}`;
    btn.textContent = label;
    btn.disabled = disabled;
    if (tooltip) btn.setAttribute('data-tooltip', tooltip);
    if (!disabled) btn.addEventListener('click', onClick);
    return btn;
  }

  _isBattleAoE(char) {
    // 弭芙 斷雲 hits target + nearby; only AoE while on the 斷雲 stage
    return char.name === '弭芙' && char.specialState.skillStage === 'duanyun';
  }
  _isChainAoE(char) {
    return ['黎風', '艾爾黛拉', '萊萬汀'].includes(char.name);
  }
  _isUltAoE(char) {
    return ['黎風', '管理員', '艾爾黛拉', '湯湯', '餘燼', '弧光', '萊萬汀', '卡繆'].includes(char.name);
  }

  // ── Attack Targeting ───────────────────────────────────────────────────────
  _triggerAttack(attackType) {
    if (this.battle.enemies.length === 1) {
      this._executeAttack(attackType, [this.battle.enemies[0]]);
      return;
    }
    this._pendingSkill = { attackType };
    this._enterTargetingMode();
  }

  _executeAttack(attackType, targets) {
    if (attackType === 'normal')  this.battle.doNormalAttack(targets);
    if (attackType === 'plunge')  this.battle.doPlungeAttack(targets);
    if (attackType === 'heavy')   this.battle.doHeavyAttack(targets);
    if (attackType === 'execute') this.battle.doExecuteAttack(targets);
  }

  // ── Skill Targeting ────────────────────────────────────────────────────────
  _triggerSkillWithTarget(charIdx, skillType, isAoE) {
    if (isAoE) { this.battle.executeSkill(charIdx, skillType, this.battle.enemies); return; }
    if (this.battle.enemies.length === 1) { this.battle.executeSkill(charIdx, skillType, [this.battle.enemies[0]]); return; }
    this._pendingSkill = { charIdx, skillType };
    this._enterTargetingMode();
  }

  _enterTargetingMode() {
    document.getElementById('targeting-overlay').classList.remove('hidden');
    document.querySelectorAll('.enemy-card').forEach(c => c.classList.add('selecting'));
  }

  _exitTargetingMode() {
    document.getElementById('targeting-overlay').classList.add('hidden');
    document.querySelectorAll('.enemy-card').forEach(c => c.classList.remove('selecting', 'targeted'));
    this._pendingSkill = null;
  }

  _onEnemyCardClick(enemyId) {
    if (!this._pendingSkill) return;
    const enemy = this.battle.enemies.find(e => e.id === enemyId);
    if (!enemy) return;

    const pending = this._pendingSkill;
    this._exitTargetingMode();

    if (pending.attackType) {
      this._executeAttack(pending.attackType, [enemy]);
    } else {
      this.battle.executeSkill(pending.charIdx, pending.skillType, [enemy]);
    }
  }

  // ── Enemy Panel ─────────────────────────────────────────────────────────────
  _renderEnemyPanel() {
    const panel = document.getElementById('enemy-panel');
    panel.className = `enemy-panel enemies-${this.battle.enemies.length}`;
    panel.innerHTML = '';
    for (const enemy of this.battle.enemies)
      panel.appendChild(this._buildEnemyCard(enemy));
  }

  _buildEnemyCard(enemy) {
    const card = document.createElement('div');
    card.className = 'enemy-card';
    card.dataset.enemyId = enemy.id;

    const header = document.createElement('div');
    header.className = 'enemy-header';
    header.innerHTML = `<span class="enemy-title">敵人 ${enemy.id}</span>`;
    const resetBtn = document.createElement('button');
    resetBtn.className = 'enemy-reset-btn';
    resetBtn.textContent = '重置';
    resetBtn.addEventListener('click', () => this.battle.resetEnemy(enemy.id));
    header.appendChild(resetBtn);
    card.appendChild(header);

    // Armor Break pips
    const armorSection = document.createElement('div');
    armorSection.className = 'armor-break-section';
    armorSection.innerHTML = `<div class="armor-break-label">破防 ${enemy.armorBreak}/${MAX_ARMOR_BREAK}</div>`;
    const pips = document.createElement('div');
    pips.className = 'armor-break-pips';
    for (let i = 0; i < MAX_ARMOR_BREAK; i++) {
      const pip = document.createElement('div');
      pip.className = `armor-pip${i < enemy.armorBreak ? ' active' : ''}`;
      pips.appendChild(pip);
    }
    armorSection.appendChild(pips);
    card.appendChild(armorSection);

    // State chips
    const chips = enemy.getStateChips();
    const now = Date.now();
    if (chips.length > 0) {
      const group = document.createElement('div');
      group.className = 'state-group';
      for (const chip of chips) {
        const el = document.createElement('span');
        el.className = `state-chip ${chip.colorClass}`;
        el.textContent = chip.label;
        if (chip.layer !== undefined) {
          const ls = document.createElement('span');
          ls.className = 'layer-count';
          ls.textContent = chip.layer;
          el.appendChild(ls);
        }
        // Attach countdown via timerKey
        if (chip.timerKey) {
          const timerId = enemy._stateTimers[chip.timerKey];
          if (timerId) {
            const te = this.battle.timedEffects.find(e => e.id === timerId);
            if (te) {
              const sec = Math.max(0, Math.ceil((te.expiresAt - now) / 1000));
              const cd = document.createElement('span');
              cd.className = 'timed-countdown';
              cd.textContent = ` ⏱${sec}s`;
              el.appendChild(cd);
            }
          }
        }
        group.appendChild(el);
      }
      card.appendChild(group);
    } else {
      const empty = document.createElement('div');
      empty.className = 'enemy-empty';
      empty.textContent = '無異常狀態';
      card.appendChild(empty);
    }

    if (enemy.imbalanceValue > 0) {
      const imb = document.createElement('div');
      imb.className = 'imbalance-section';
      imb.innerHTML = `<span class="imbalance-label">失衡值</span><span class="imbalance-value">${enemy.imbalanceValue}</span>`;
      card.appendChild(imb);
    }

    card.addEventListener('click', () => { if (this._pendingSkill) this._onEnemyCardClick(enemy.id); });
    return card;
  }

  // ── Log ─────────────────────────────────────────────────────────────────────
  _renderLog() {
    if (this._logViewMode === 'table') { this._renderLogTable(); return; }
    const logEl = document.getElementById('battle-log');
    logEl.innerHTML = '';
    for (const entry of this.battle.log.entries) {
      const div = document.createElement('div');
      div.className = `log-entry log-${entry.colorClass}`;
      div.innerHTML = `<span class="log-time">${entry.time}</span>${
        entry.charName ? `<span class="log-char">${entry.charName}${entry.skillName ? ` [${entry.skillName}]` : ''}</span>` : ''
      }${this._escapeHtml(entry.message)}`;
      logEl.appendChild(div);
    }
  }

  _renderLogTable() {
    const logEl = document.getElementById('battle-log');
    const rows = this.battle.log.entries.map(e =>
      `<tr class="log-${e.colorClass}">
        <td class="lt-time">${e.time}</td>
        <td class="lt-char">${this._escapeHtml(e.charName || '')}</td>
        <td class="lt-skill">${this._escapeHtml(e.skillName || '')}</td>
        <td class="lt-msg">${this._escapeHtml(e.message || '')}</td>
      </tr>`
    ).join('');
    logEl.innerHTML = `<table class="log-table">
      <thead><tr><th>時間</th><th>幹員</th><th>技能</th><th>效果</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  _exportLogCsv() {
    const header = '時間,幹員,技能,效果\n';
    const rows = this.battle.log.entries.map(e =>
      [e.time, e.charName, e.skillName, e.message]
        .map(v => `"${(v || '').replace(/"/g, '""')}"`)
        .join(',')
    ).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'battle_log.csv';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  _escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Character Detail Modal ──────────────────────────────────────────────────
  _bindModal() {
    document.getElementById('char-modal-close').addEventListener('click', () => this._closeCharModal());
    document.getElementById('char-modal-backdrop').addEventListener('click', () => this._closeCharModal());
  }

  _openCharModal(char) {
    const body = document.getElementById('char-modal-body');
    const colorCls = char.colorClass();
    const dmgLabel = this._damageLabel(char.damageType);

    body.innerHTML = `
      <div class="modal-title">
        <span class="badge badge-${colorCls}">${dmgLabel}</span>
        ${char.name}
        <span style="color:#ffd700;font-size:0.9rem;">${'★'.repeat(char.stars)}</span>
      </div>
      <div class="modal-meta">${char.jobClass} · ${dmgLabel}傷害</div>

      ${char.talent1 || char.talent2 ? `
      <div class="modal-section">
        <div class="modal-section-title">天賦</div>
        ${char.talent1 ? `<div class="modal-section-body">【天賦1】${char.talent1}</div>` : ''}
        ${char.talent2 ? `<div class="modal-section-body">【天賦2】${char.talent2}</div>` : ''}
      </div>` : ''}

      ${char.specialMechanic ? `
      <div class="modal-section">
        <div class="modal-section-title">特殊機制</div>
        <div class="modal-section-body">${char.specialMechanic}</div>
      </div>` : ''}

      <div class="modal-section">
        <div class="modal-section-title">技能</div>
        <div class="modal-skill-block">
          <div class="modal-skill-label">戰技</div>
          <div class="modal-skill-text">${char.skillDesc}</div>
        </div>
        <div class="modal-skill-block">
          <div class="modal-skill-label">連攜技</div>
          <div class="modal-skill-text">${char.chainDesc}</div>
          <div class="modal-condition">觸發條件：${char.chainConditionText}</div>
        </div>
        <div class="modal-skill-block">
          <div class="modal-skill-label">大招（終結技）</div>
          <div class="modal-skill-text">${char.ultimateDesc}</div>
        </div>
      </div>
    `;

    document.getElementById('char-modal').classList.remove('hidden');
  }

  _closeCharModal() {
    document.getElementById('char-modal').classList.add('hidden');
  }
}
