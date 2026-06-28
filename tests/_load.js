'use strict';
// Shared test loader. The project has no module system (files are loaded via
// <script> tags), so we concatenate the engine files and eval them inside a
// function scope, then return the symbols the tests need.
const fs = require('fs');
const path = require('path');

function loadEngine() {
  const root = path.join(__dirname, '..', 'js');
  const files = ['constants.js', 'enemy.js', 'characters.js', 'battle.js'];
  const src = files.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  const factory = new Function(src + `
    ; return {
      SKILL_TYPE, JOB_CLASS, DAMAGE_TYPE, SPELL_ELEMENT, EFFECT_TYPE,
      CHAIN_EVENT_TYPE, SPELL_ABNORMALITY_TYPE, PHYSICAL_ABNORMALITY_TYPE,
      TIMED_EFFECT_DURATIONS, Enemy, Character, BattleState, ROSTER,
      ZhuangFangYi, MiFu, KaMiu
    };`);
  return factory();
}

module.exports = { loadEngine };
