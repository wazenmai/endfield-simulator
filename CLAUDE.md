# Workflow
- Run `node --check js/<file>.js` on every JS file you touched before considering a task done.
- No test framework is set up — write a `tests/<CharName>.test.js` stub using plain `node` assertions whenever you add a new character or helper function. Run it with `node tests/<CharName>.test.js`.
- When adding a character, follow `.claude/skills/add_character.md` exactly.

# Architecture (read before editing)

```
js/
  constants.js   — enums and tuning constants only; no logic
  enemy.js       — Enemy class; state mutation + chip generation; no game flow
  characters.js  — Character base class + 25 subclasses + ROSTER array
  battle.js      — BattleState engine: skill execution, timers, chain events
  ui.js          — All DOM rendering; no game state mutation
  main.js        — Entry point; page routing; attaches UI instance
```

Dependencies flow: `constants → enemy → characters → battle → ui → main`.
**Never import upward** (e.g., ui.js must not be referenced from battle.js).

# Coding rules

## General
- `'use strict';` at the top of every JS file.
- No `var`; use `const` for values that don't change, `let` otherwise.
- No magic numbers — every duration/threshold must be a named constant in `constants.js`.
- Prefer small, focused methods. If `useSkill()` exceeds ~40 lines, extract helpers.
- Never mutate enemy state directly inside `Character.useSkill()` — return effect objects; let `BattleState._executeEffect()` apply them.

## Effect objects
All skill outcomes must be returned as effect objects from `useSkill()`. Use the base-class helper methods:

| Helper | Effect produced |
|--------|----------------|
| `_logOnly(msg)` | Log message, no state change |
| `_physAbnorm(type, target)` | Physical abnormality |
| `_armorBreak(delta, target)` | Armor break ±delta |
| `_spellAttach(el, n, target)` | Spell attachment +n layers |
| `_spellAttachClear(el, target)` | Clear one element's layers |
| `_spellAttachClearAll(target)` | Clear all spell attachments |
| `_spellAbnorm(type, target)` | Apply spell abnormality |
| `_spellAbnormClear(type, target)` | Clear spell abnormality |
| `_vulnerable(type, target, val?)` | Vulnerable flag/value |
| `_debuff(type, target)` | Debuff (weak / slow) |
| `_specialState(key, val, target, label)` | Special state on enemy |
| `_techRestore(amt)` | Restore shared 技力 |
| `_ultCharge(charName, amt)` | Charge a character's ultimate |
| `_chainEvent(evts[])` | Emit chain events |

Never call `battle.log.add(...)` or mutate `battle.*` directly inside `useSkill()` — those belong in `BattleState`.

## State timing rules
- **armorBreak** and **spellAttachment** have no timeout.
- **vulnerable**, **debuff**, **spellAbnormality**, **specialStates** default to 40 s (`TIMED_EFFECT_DURATIONS.DEFAULT_STATE`).
- Exceptions with specific durations must be named constants in `TIMED_EFFECT_DURATIONS`.
- Character-level timed buffs (e.g. 塞西 支援晶體) use `EFFECT_TYPE.TIMED_CHAR_STATE`; the timer is registered by `BattleState._executeEffect`, not inside `useSkill()`.

## Chain system rules
- Chain condition logic lives exclusively in `BattleState.fireChainEvent()` — add a `case` for the new character there.
- `chainConditionText` must be human-readable Chinese matching what `fireChainEvent()` actually checks.
- AoE chain skills: add character name to `UI._isChainAoE()`.
- AoE ultimates: add character name to `UI._isUltAoE()`.

## Naming conventions
- Class name: PascalCase from full pinyin of Chinese name (e.g. `管理員` → `GuanLiYuan`).
- `specialState` keys: camelCase English describing the mechanic (e.g. `moltenFire`, `crystalCharges`).
- Constants: `SCREAMING_SNAKE_CASE`.

## Backward compatibility
- Adding a new `EFFECT_TYPE` or `CHAIN_EVENT_TYPE` must not break existing `switch` blocks — existing cases are fall-through by default so new unknowns are silently ignored.
- Adding a new `specialState` key to an existing character must default to a value that preserves previous behavior when the key is absent.
- The `ROSTER` array order may change but every class must appear exactly once.
