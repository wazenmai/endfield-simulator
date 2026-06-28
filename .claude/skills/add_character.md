# Add a New Operator / Character

Follow every step in order. Do not skip steps even if the character seems simple.

---

## Step 0 — Parse user input

The user may provide data as CSV or Markdown. Extract these fields:

| Field | Required | Notes |
|-------|----------|-------|
| Chinese name | ✅ | e.g. `湯湯` |
| Stars | ✅ | `5` or `6` |
| 職業 (job class) | ✅ | 近衛 / 先鋒 / 突擊 / 術師 / 重裝 / 輔助 |
| 傷害類型 (damage type) | ✅ | 物理 / 灼熱 / 電磁 / 自然 / 寒冷 |
| 戰技 description | ✅ | |
| 連攜技 description | ✅ | |
| 大招 description | ✅ | |
| 連攜技 trigger condition | ✅ | Chinese, human-readable |
| 天賦1 | optional | |
| 天賦2 | optional | |
| 特殊機制 / specialMechanic | optional | |
| specialState keys | optional | any per-character counters / flags |
| 連攜技 is AoE? | optional | default: single target |
| 大招 is AoE? | optional | default: single target |

**If any required field is missing, ask the user before proceeding.**

---

## Step 1 — Derive identifiers

```
className  = PascalCase of full pinyin (e.g. 湯湯 → TangTang, 艾爾黛拉 → AiErDaiLa)
damageType = DAMAGE_TYPE.<KEY>   (物理→PHYSICAL, 灼熱→FIRE, 電磁→ELECTRIC, 自然→NATURE, 寒冷→COLD)
jobClass   = JOB_CLASS.<KEY>     (近衛→GUARD, 先鋒→VANGUARD, 突擊→ASSAULT, 術師→CASTER, 重裝→DEFENDER, 輔助→SUPPORT)
```

---

## Step 2 — Add the class to `js/characters.js`

Insert the new class **before** the `// ════ ROSTER ════` separator at the bottom.
Follow the template exactly — do not omit any constructor field even if its value is `''`.

```js
// ── N. <Chinese name> ──────────────────────────────────────────────────────
class <ClassName> extends Character {
  constructor() {
    super({
      name: '<Chinese name>', stars: <5|6>,
      jobClass: JOB_CLASS.<KEY>, damageType: DAMAGE_TYPE.<KEY>,
      skillDesc:         '<戰技 one-line description>',
      chainDesc:         '<連攜技 one-line description>',
      ultimateDesc:      '<大招 one-line description>',
      chainConditionText:'<Chinese, matches fireChainEvent logic>',
      talent1:           '<talent text or empty string>',
      talent2:           '<talent text or empty string>',
      specialMechanic:   '<special mechanic text or empty string>'
    });
    // Only include if character has per-instance state:
    // this.specialState = { key1: defaultValue, ... };
  }

  useSkill(skillType, targets, battle) {
    const effects = [];
    const t = targets[0]; // single-target skills use targets[0]
    if (skillType === SKILL_TYPE.BATTLE) {
      // --- 戰技 ---
      effects.push(this._logOnly(`${this.name} 戰技：<summary>`));
      // push effect helpers as needed
    } else if (skillType === SKILL_TYPE.CHAIN) {
      // --- 連攜技 ---
      effects.push(this._logOnly(`${this.name} 連攜技：<summary>`));
      // push effect helpers as needed
      effects.push(this._chainEvent([{ type: CHAIN_EVENT_TYPE.CHAIN_SKILL_USED }]));
    } else if (skillType === SKILL_TYPE.ULTIMATE) {
      // --- 大招 ---
      // AoE ultimates iterate `targets` instead of using `t`
      effects.push(this._logOnly(`${this.name} 大招：<summary>`));
      // push effect helpers as needed
    }
    return effects;
  }
}
```

### Effect helper cheatsheet (from Character base class)

```js
this._logOnly(msg)                         // log text, no state change
this._physAbnorm(PHYSICAL_ABNORMALITY_TYPE.<X>, target)
this._armorBreak(delta, target)            // positive = add, negative = remove
this._spellAttach(SPELL_ELEMENT.<X>, layers, target)
this._spellAttachClear(SPELL_ELEMENT.<X>, target)
this._spellAttachClearAll(target)
this._spellAbnorm(SPELL_ABNORMALITY_TYPE.<X>, target, { level?, duration? })  // level = 異常等級; duration overrides 40s default
this._spellAbnormClear(SPELL_ABNORMALITY_TYPE.<X>, target)
this._vulnerable(VULNERABLE_TYPE.<X>, target, val?, duration?)   // val defaults to true; duration overrides 40s default
this._debuff('weak'|'slow', target, duration?)
this._specialState('key', true|false, target, 'display label', duration?)
this._techRestore(amount)                  // restores shared 技力
this._ultCharge('charName', amount)        // charges one character's ultimate
this._chainEvent([{ type: CHAIN_EVENT_TYPE.<X>, enemy: target }])
this._heavyHitEvents(target)              // returns standard heavy-hit chain events array
```

### Character-level timed buffs

If the character applies a timed buff to **itself** (not an enemy), emit a `TIMED_CHAR_STATE` effect:

```js
// In useSkill BATTLE/CHAIN:
effects.push({
  type:     EFFECT_TYPE.TIMED_CHAR_STATE,
  char:     this,
  key:      'myStateKey',           // must exist in this.specialState
  label:    '顯示名稱 emoji',
  duration: TIMED_EFFECT_DURATIONS.CRYSTAL_CHARGES  // or add a new named constant
});
```

**Do not** add a new duration constant inline — add it to `TIMED_EFFECT_DURATIONS` in `constants.js` with a descriptive comment.

---

## Step 3 — Register chain condition in `js/battle.js`

Inside `fireChainEvent()`, add a `case` in the `switch (char.name)` block:

```js
case '<Chinese name>':
  unlock = evtType === CHAIN_EVENT_TYPE.<MATCHING_EVENT>;
  // For compound conditions:
  // unlock = (evtType === CHAIN_EVENT_TYPE.A) || (evtType === CHAIN_EVENT_TYPE.B && someCheck);
  break;
```

Match the condition exactly to `chainConditionText`. Common events:

| Condition | CHAIN_EVENT_TYPE |
|-----------|-----------------|
| 敵人進入破防 | `ARMOR_BREAK_GAINED` |
| 破防達4層 | `ARMOR_BREAK_4` |
| 猛擊/碎甲消耗破防 | `PHYSICAL_ABNORMALITY_CONSUMED` |
| 施加法術附著 | `SPELL_ATTACHMENT_APPLIED` |
| 觸發法術異常 | `SPELL_ABNORMALITY_APPLIED` |
| 觸發凍結 | `FROZEN_APPLIED` |
| 觸發燃燒 | `BURNING_APPLIED` |
| 觸發腐蝕 | `CORROSION_APPLIED` |
| 觸發/退出導電 | `CONDUCTING_CHANGED` |
| 對敵人重擊 | `HEAVY_HIT_ANY` |
| 重擊物理脆弱/碎甲敵人 | `HEAVY_HIT_PHYSICAL_VULN` |
| 重擊無破防無附著敵人 | `HEAVY_HIT_NO_BREAK_NO_ATTACH` |
| 重擊電磁附著/導電敵人 | `HEAVY_HIT_ELECTRIC` |
| 重擊凍結敵人 | `HEAVY_HIT_FROZEN` |
| 連攜技造成傷害 | `CHAIN_SKILL_USED` |
| 敵人失衡 | `ENEMY_IMBALANCE` |
| 晶體耗盡 | `CRYSTAL_CHARGES_DEPLETED` |
| 主幹員受攻擊 | `MAIN_UNIT_ATTACKED` |
| 主幹員血量低 | `MAIN_UNIT_HP_LOW` |
| 聚焦敵人觸發法術異常 | `FOCUSED_ENEMY_ABNORMALITY` |
| 法術異常被消耗 | `SPELL_ABNORMALITY_CONSUMED` |
| 灼熱附著被消耗/吸收 | `FIRE_ATTACHMENT_CONSUMED` |
| 處決失衡敵人 | `EXECUTE_ATTACK` |

If no existing event matches, add a new `CHAIN_EVENT_TYPE` constant to `constants.js` and emit it from the relevant place in `battle.js` or `enemy.js`.

---

## Step 4 — Add to ROSTER in `js/characters.js`

Append the new instance to the `ROSTER` array at the bottom of the file:

```js
const ROSTER = [
  // ... existing entries ...
  new <ClassName>(),
];
```

---

## Step 5 — Register AoE in `js/ui.js` (if applicable)

- **AoE 連攜技**: add the Chinese name to `UI._isChainAoE()`:
  ```js
  _isChainAoE(char) {
    return ['黎風', '艾爾黛拉', '萊萬汀', '<新幹員>'].includes(char.name);
  }
  ```
- **AoE 大招**: add the Chinese name to `UI._isUltAoE()`:
  ```js
  _isUltAoE(char) {
    return ['黎風', '管理員', '艾爾黛拉', '湯湯', '餘燼', '弧光', '萊萬汀', '<新幹員>'].includes(char.name);
  }
  ```

---

## Step 6 — Add specialState label in `js/ui.js` (if applicable)

If the character has `specialState` keys, add display labels to the `labels` map in `_buildCharBlock`:

```js
const labels = {
  ironVow:    `鐵誓:${v}`,
  moltenFire: `熔火:${v}/4`,
  // Add your key:
  myStateKey: v > 0 ? `顯示名稱:${v}` : null,
  // For boolean flags:
  myFlag: v ? '旗幟名稱' : null,
};
```

If the character has a team-wide special mechanic (e.g. 湯湯's 渦流), also update `UI._renderTeamStatus()`.

---

## Step 7 — Syntax check

```bash
node --check js/constants.js
node --check js/enemy.js
node --check js/characters.js
node --check js/battle.js
node --check js/ui.js
```

Fix any errors before proceeding.

---

## Step 8 — Write a test

Create `tests/<ClassName>.test.js`. Minimum coverage:

```js
'use strict';
// Load dependencies manually (no module system)
// Tip: eval or require each file in dependency order if needed.
// For quick smoke tests, just verify the class can be instantiated
// and useSkill returns the expected effect types.

// Example pattern:
const char = new <ClassName>();
console.assert(char.name === '<Chinese name>', 'name');
console.assert(char.stars === <5|6>, 'stars');
console.assert(char.jobClass === JOB_CLASS.<KEY>, 'jobClass');
console.assert(char.damageType === DAMAGE_TYPE.<KEY>, 'damageType');

// Smoke-test useSkill (requires a mock enemy and battle)
// See existing tests/ files for mock setup patterns.
console.log('<ClassName> tests passed');
```

---

## Checklist before declaring done

- [ ] Class defined in `js/characters.js` with all constructor fields
- [ ] `useSkill()` handles all three of `SKILL_TYPE.BATTLE`, `SKILL_TYPE.CHAIN`, `SKILL_TYPE.ULTIMATE`
- [ ] Chain condition added to `fireChainEvent()` in `js/battle.js`
- [ ] Class added to `ROSTER` in `js/characters.js`
- [ ] AoE lists updated in `js/ui.js` if needed
- [ ] `specialState` labels added to `_buildCharBlock` in `js/ui.js` if needed
- [ ] Team status updated in `_renderTeamStatus` if character has team-wide mechanic
- [ ] New duration constants added to `TIMED_EFFECT_DURATIONS` in `constants.js` if needed
- [ ] `node --check` passes on all 5 JS files
- [ ] Test file written and passes
