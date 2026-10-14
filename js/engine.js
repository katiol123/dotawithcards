/* DOTA: Card Wars — rules engine. Pure logic, runs in the browser and in Node (for balance simulation). */
(function (G) {
  'use strict';
  const D = G.DWC;
  const C = D.C;
  const E = D.E = {};

  /* ---------- RNG ---------- */
  E.rng = s => {
    let t = (s.seed = (s.seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // In AI look-ahead (s.sim) random events resolve to their most likely outcome.
  E.chance = (s, p) => s.sim ? p >= 0.5 : E.rng(s) < p;
  E.shuffle = (s, a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(E.rng(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- Map ---------- */
  const DIST = {};
  for (const a of Object.keys(D.ZONES)) {
    DIST[a] = { [a]: 0 };
    const q = [a];
    while (q.length) { const z = q.shift(); for (const n of D.ADJ[z]) if (DIST[a][n] === undefined) { DIST[a][n] = DIST[a][z] + 1; q.push(n); } }
  }
  E.dist = (a, b) => (DIST[a] && DIST[a][b] !== undefined) ? DIST[a][b] : 9;
  E.enemyBase = team => D.TEAMS[1 - team].base;
  E.canEnter = (h, z) => z !== E.enemyBase(h.team);
  E.zonesWithin = (h, from, n) => Object.keys(D.ZONES).filter(z => z !== from && E.canEnter(h, z) && E.dist(from, z) <= n);

  /* ---------- Setup ---------- */
  E.newGame = (radiant, dire, opts = {}) => {
    const s = {
      seed: (opts.seed !== undefined ? opts.seed : Math.floor(Math.random() * 2 ** 31)) | 0,
      round: 1, turnIdx: -1, order: [], over: false, winner: null,
      heroes: [], score: [0, 0], firstBlood: false,
      towers: {}, ancient: [C.ANCIENT_HP, C.ANCIENT_HP],
      rosh: { alive: true, hp: 0, max: 0, respawn: 0, kills: 0 },
      log: [], events: [], turn: null, nextCid: 1, sim: false,
    };
    for (const l of D.LANES) s.towers[l] = [C.TOWER_HP.slice(), C.TOWER_HP.slice()];
    E.spawnRosh(s);
    [radiant, dire].forEach((ids, team) => ids.forEach((id, i) => s.heroes.push(E.makeHero(s, id, team, team * 5 + i))));
    for (const h of s.heroes) { const st = E.st(s, h); h.hp = st.maxHp; h.mana = st.maxMana; }
    E.log(s, '⚔️ Битва за Древних начинается!', 'big');
    E.newRound(s, true);
    return s;
  };
  E.makeHero = (s, id, team, uid) => {
    const h = {
      uid, id, team, level: 1, xp: 0, gold: C.START_GOLD, hp: 1, mana: 0, zone: D.TEAMS[team].base,
      deck: [], hand: [], discard: [], skills: { q: 0, w: 0, e: 0, r: 0 }, sp: 1, talents: [], talentPending: [],
      items: [], st: [], dead: false, respawn: 0, k: 0, d: 0, a: 0, perm: { str: 0, dmg: 0 }, aegis: 0, reincCd: 0,
      streak: 0, dmgDealt: 0, towerDmg: 0, healDone: 0, spent: 0,
    };
    h.deck = D.BASIC_DECK.map(c => ({ c, n: s.nextCid++ }));
    E.shuffle(s, h.deck);
    return h;
  };
  E.spawnRosh = s => { s.rosh.alive = true; s.rosh.max = 1300 + 95 * s.round; s.rosh.hp = s.rosh.max; };

  /* ---------- Helpers ---------- */
  E.H = (s, uid) => s.heroes[uid];
  E.cur = s => s.turn ? s.heroes[s.turn.uid] : null;
  E.nm = h => D.HEROES[h.id].name;
  E.log = (s, msg, cls) => { if (s.sim) return; s.log.push({ r: s.round, msg, cls: cls || '' }); if (s.log.length > 400) s.log.shift(); };
  E.fx = (s, ev) => { if (!s.sim) s.events.push(ev); };
  E.alive = h => !h.dead;
  E.visible = h => !E.has(h, 'invis') && !E.has(h, 'untarget');
  E.foes = (s, h, zone, visibleOnly) => { zone = zone || h.zone; return s.heroes.filter(x => x.team !== h.team && !x.dead && x.zone === zone && (!visibleOnly || E.visible(x))); };
  E.friends = (s, h, zone) => { zone = zone || h.zone; return s.heroes.filter(x => x.team === h.team && !x.dead && x.zone === zone); };
  E.allFoes = (s, h) => s.heroes.filter(x => x.team !== h.team && !x.dead);
  E.allFriends = (s, h) => s.heroes.filter(x => x.team === h.team && !x.dead);
  E.weakest = (s, arr) => arr.reduce((b, x) => (!b || x.hp < b.hp) ? x : b, null);
  E.skillLevel = (h, k) => h.skills[k];

  /* ---------- Statuses ---------- */
  E.has = (h, t) => { for (const x of h.st) if (x.t === t) return true; return false; };
  E.stv = (h, t) => { let v = 0; for (const x of h.st) if (x.t === t) v += x.v || 0; return v; };
  E.rmSt = (h, t) => { h.st = h.st.filter(x => x.t !== t); };
  E.cleanse = (s, h) => { h.st = h.st.filter(x => !D.STATUS[x.t].debuff); };
  E.addSt = (s, src, t, type, turns, v, o) => {
    if (!t || t === 'rosh' || t.dead) return false;
    const debuff = D.STATUS[type].debuff;
    if (debuff && src && src.team !== t.team && E.has(t, 'immune')) { E.fx(s, { type: 'proc', uid: t.uid, text: 'Иммунитет' }); return false; }
    const cur = s.turn && s.turn.uid === t.uid;
    if (['stun', 'hex', 'root', 'silence', 'invis', 'immune', 'untarget', 'grave', 'evasion'].includes(type)) {
      const ex = t.st.find(x => x.t === type);
      if (ex) { ex.n = Math.max(ex.n, turns); ex.v = Math.max(ex.v || 0, v || 0); ex.f = ex.f || cur; return true; }
    }
    t.st.push({ t: type, n: turns, v: v || 0, src: src ? src.uid : -1, f: cur });
    if (debuff && !s.sim && ['stun', 'hex', 'root', 'silence'].includes(type)) E.fx(s, { type: 'status', uid: t.uid, text: D.STATUS[type].name });
    return true;
  };

  /* ---------- Stats ---------- */
  function addInto(b, add) {
    for (const k in add) {
      const v = add[k];
      if (Array.isArray(v)) b[k] = b[k].concat(v);
      else if (typeof v === 'boolean') b[k] = b[k] || v;
      else b[k] = (b[k] || 0) + v;
    }
  }
  E.st = (s, h) => {
    const d = D.HEROES[h.id];
    const L1 = h.level - 1;
    const b = { str: 0, agi: 0, int: 0, all: 0, dmg: 0, armor: 0, mres: 0, evasion: [], amp: 0, ls: 0, as: 0, hp: 0, mp: 0, crits: [], cleave: 0, farm: d.farm || 0, moves: 0, trueStrike: false, manaBreak: 0, desoArmor: 0, regen: 0, regenPct: 0, ultBoost: 0, primary: 0, agiPct: 0, dmgPct: 0, pierce: 0, staticField: 0 };
    for (const it of h.items) addInto(b, D.ITEMS[it].add);
    if (b.cleaveMax) { b.cleave = Math.max(b.cleave, b.cleaveMax); b.cleaveMax = 0; }
    for (const tid of h.talents) for (const lvl in D.TALENTS) for (const t of D.TALENTS[lvl]) if (t.id === tid) addInto(b, t.add);
    for (const k of ['q', 'w', 'e', 'r']) { const sk = d.skills[k]; if (h.skills[k] > 0 && sk.passive && sk.passive.stats) sk.passive.stats(b, h.skills[k], h); }
    for (const x of h.st) {
      if (x.t === 'armor' || x.t === 'armorRed') b.armor += x.v;
      else if (x.t === 'dmgPct') b.dmgPct += x.v;
      else if (x.t === 'evasion') b.evasion.push(x.v);
      else if (x.t === 'mres') b.mres += x.v;
      else if (x.t === 'ls') b.ls += x.v;
    }
    let str = d.str + d.gs * L1 + h.perm.str + b.str + b.all;
    let agi = d.agi + d.ga * L1 + b.agi + b.all;
    let int = d.int + d.gi * L1 + b.int + b.all;
    if (b.primary) { if (d.attr === 'str') str += b.primary; else if (d.attr === 'agi') agi += b.primary; else if (d.attr === 'int') int += b.primary; else { str += b.primary / 3; agi += b.primary / 3; int += b.primary / 3; } }
    agi *= 1 + b.agiPct;
    if (h.level > 15) { const extra = (h.level - 15) * 2; str += extra; agi += extra; int += extra; }
    const prim = d.attr === 'uni' ? 0.45 * (str + agi + int) : d.attr === 'str' ? str : d.attr === 'agi' ? agi : int;
    let ev = 1; for (const e of b.evasion) ev *= (1 - e);
    const hexed = E.has(h, 'hex');
    return {
      str, agi, int, prim,
      maxHp: Math.round(100 + str * 18 + b.hp),
      maxMana: Math.round(75 + int * 12 + b.mp),
      armor: hexed ? Math.min(0, d.armor + b.armor) : d.armor + agi / 5 + b.armor,
      atk: (d.dmg + h.perm.dmg + prim + b.dmg) * (1 + b.dmgPct),
      asMult: 1 + (agi * 1.2 + b.as) * 0.01,
      mres: Math.min(0.85, 0.25 + b.mres),
      evasion: 1 - ev,
      amp: int * 0.0015 + b.amp,
      ls: b.ls, crits: b.crits, cleave: Math.min(1, b.cleave), farm: b.farm, moves: 1 + Math.min(1, b.moves),
      trueStrike: b.trueStrike, pierce: b.pierce, manaBreak: b.manaBreak, desoArmor: b.desoArmor,
      hpRegen: b.regen + str * 0.35 + 6, regenPct: 0.02 + b.regenPct, mpRegen: int * 0.45 + 6, mpRegenPct: 0.05,
      ultBoost: b.ultBoost, staticField: b.staticField,
    };
  };
  E.physMult = a => 1 - (0.06 * a) / (1 + 0.06 * Math.abs(a));
  E.netWorth = h => h.gold + h.spent;

  /* ---------- Damage ---------- */
  E.dmg = (s, src, t, amt, type, o = {}) => {
    if (t === 'rosh') return E.dmgRosh(s, src, amt, type);
    if (!t || t.dead || amt <= 0) return 0;
    const ts = E.st(s, t);
    if (type === 'magic') {
      if (E.has(t, 'immune') && src && src.team !== t.team) { E.fx(s, { type: 'proc', uid: t.uid, text: 'Иммунитет' }); return 0; }
      amt *= 1 - ts.mres;
    } else if (type === 'phys') amt *= E.physMult(ts.armor);
    if (src && !o.attack && type !== 'phys') {
      const ss = E.st(s, src);
      amt *= 1 + ss.amp;
      if (ss.staticField && !o.culling) amt += t.hp * ss.staticField * (1 - ts.mres);
    }
    for (const x of t.st) if (x.t === 'shield' && x.v > 0 && amt > 0) { const a = Math.min(x.v, amt); x.v -= a; amt -= a; }
    t.st = t.st.filter(x => x.t !== 'shield' || x.v > 0);
    amt = Math.max(0, Math.round(amt));
    if (amt <= 0) return 0;
    const before = t.hp;
    t.hp -= amt;
    if (E.has(t, 'grave') && t.hp < 1) t.hp = 1;
    const dealt = before - Math.max(0, t.hp);
    if (src) src.dmgDealt += dealt;
    E.fx(s, { type: 'dmg', uid: t.uid, amount: amt, dtype: type });
    if (t.hp <= 0) E.die(s, t, src);
    return dealt;
  };
  E.dmgRosh = (s, src, amt, type) => {
    const r = s.rosh;
    if (!r.alive) return 0;
    if (type === 'phys') amt *= E.physMult(8); else if (type === 'magic') amt *= 0.5;
    amt = Math.round(amt);
    r.hp -= amt;
    E.fx(s, { type: 'dmg', uid: 'rosh', amount: amt, dtype: type });
    if (r.hp <= 0) E.killRosh(s, src);
    return amt;
  };
  E.heal = (s, t, amt, src) => {
    if (!t || t === 'rosh' || t.dead) return 0;
    const mx = E.st(s, t).maxHp;
    const v = Math.max(0, Math.min(mx - t.hp, Math.round(amt)));
    t.hp += v;
    if (src && src !== t) src.healDone += v;
    if (v > 0) E.fx(s, { type: 'heal', uid: t.uid, amount: v });
    return v;
  };
  E.mana = (s, h, amt) => { const mx = E.st(s, h).maxMana; h.mana = Math.max(0, Math.min(mx, h.mana + amt)); };

  // Physical attack with crit, evasion, lifesteal, cleave, mana break, desolator.
  E.atk = (s, h, t, mult = 1, o = {}) => {
    if (!t) return 0;
    const st = E.st(s, h);
    let base = st.atk * (o.noAS ? 1 : st.asMult) * mult + (o.flat || 0);
    // invisibility breaks on attack
    if (E.has(h, 'invis')) E.rmSt(h, 'invis');
    if (t !== 'rosh' && t.dead) return 0;
    if (t !== 'rosh') {
      let ev = E.st(s, t).evasion;
      if (st.trueStrike) ev = 0; else ev *= (1 - st.pierce);
      if (s.sim) base *= (1 - ev);
      else if (ev > 0 && E.rng(s) < ev) { E.fx(s, { type: 'miss', uid: t.uid }); return 0; }
    }
    // crits
    const crits = st.crits.slice();
    if (o.critBonus) crits.push([o.critBonus, 1.8]);
    let critMult = 1;
    if (o.forceCrit) critMult = Math.max(...crits.map(c => c[1]), 1.5);
    else if (s.sim) { let exp = 1; for (const [p, m] of crits) exp = Math.max(exp, 1 + p * (m - 1)); critMult = exp; }
    else for (const [p, m] of crits) if (E.rng(s) < p) critMult = Math.max(critMult, m);
    if (critMult > 1.01 && !s.sim) E.fx(s, { type: 'crit', uid: t === 'rosh' ? 'rosh' : t.uid, mult: critMult });
    const dmg = base * critMult;
    let dealt;
    if (t === 'rosh') {
      dealt = E.dmgRosh(s, h, dmg, 'phys');
      if (s.rosh.alive || dealt) { // Roshan strikes back
        const back = 40 + 4 * s.round;
        E.dmg(s, null, h, back, 'phys');
      }
    } else {
      dealt = E.dmg(s, h, t, dmg, 'phys', { attack: true });
      if (st.manaBreak && !t.dead) { const burn = Math.min(t.mana, st.manaBreak * (o.noAS ? 1 : 1.5)); t.mana -= burn; if (burn > 0) E.dmg(s, h, t, burn * 0.6, 'phys', { attack: true }); }
      if (st.desoArmor && !t.dead) { E.rmSt(t, 'armorRed'); E.addSt(s, h, t, 'armorRed', 2, -st.desoArmor); }
      // passive reaction (Axe helix etc.)
      if (!t.dead) E.hook(s, t, 'onAttacked', { attacker: h });
    }
    const ls = st.ls + (o.lsBonus || 0);
    if (ls > 0 && dealt > 0 && !h.dead) E.heal(s, h, dealt * ls);
    if (st.cleave > 0 && !o.noCleave && t !== 'rosh') for (const f of E.foes(s, h)) if (f !== t) E.dmg(s, h, f, base * st.cleave, 'phys', { attack: true });
    return dealt;
  };

  E.hook = (s, h, name, extra) => {
    const d = D.HEROES[h.id];
    let res = false;
    for (const k of ['q', 'w', 'e', 'r']) {
      const sk = d.skills[k];
      if (h.skills[k] > 0 && sk.passive && sk.passive[name]) res = sk.passive[name](Object.assign({ s, self: h, l: h.skills[k], E }, extra)) || res;
    }
    return res;
  };

  /* ---------- Death ---------- */
  E.die = (s, t, killer) => {
    if (t.dead) return;
    if (t.aegis > 0) {
      t.aegis = 0; t.hp = E.st(s, t).maxHp; t.mana = E.st(s, t).maxMana; t.st = [];
      E.fx(s, { type: 'proc', uid: t.uid, text: 'ЭГИДА!' });
      E.log(s, `🛡️ ${E.nm(t)} возрождается благодаря Эгиде Бессмертного!`, 'big');
      return;
    }
    if (E.hook(s, t, 'onDeath', { killer })) return;
    t.dead = true; t.hp = 0; t.st = []; t.d++;
    t.respawn = 1 + Math.floor(t.level / 7);
    const lost = Math.min(t.gold, 30 * t.level);
    t.gold -= lost;
    const kTeam = 1 - t.team;
    s.score[kTeam]++;
    const bounty = 140 + 14 * t.level + (t.streak >= 3 ? 60 * (t.streak - 2) : 0);
    const xpTotal = 90 + 45 * t.level;
    const helpers = s.heroes.filter(x => x.team === kTeam && !x.dead && E.dist(x.zone, t.zone) <= 1 && x !== killer);
    let msg;
    if (killer && killer.team === kTeam) {
      killer.k++; killer.streak++;
      E.gold(s, killer, bounty);
      helpers.forEach(a => { a.a++; E.gold(s, a, Math.round(bounty * 0.35)); });
      const share = [killer, ...helpers];
      share.forEach(a => E.xp(s, a, xpTotal / share.length + 20));
      msg = `☠️ ${E.nm(killer)} убивает ${E.nm(t)} (+${bounty} зол.)`;
      if (killer.streak === 3) E.log(s, `🔥 ${E.nm(killer)}: ЛУДОМАНИЯ! Серия из 3 убийств!`, 'big');
      if (killer.streak === 5) E.log(s, `🔥 ${E.nm(killer)}: НЕУДЕРЖИМ!`, 'big');
      if (killer.streak === 8) E.log(s, `🔥 ${E.nm(killer)}: БОЖЕСТВЕННО!`, 'big');
    } else {
      const share = helpers.length ? helpers : s.heroes.filter(x => x.team === kTeam && !x.dead);
      share.forEach(a => { E.gold(s, a, Math.round(bounty / Math.max(1, share.length))); E.xp(s, a, xpTotal / Math.max(1, share.length)); });
      msg = `☠️ ${E.nm(t)} погибает${killer === null ? '' : ''}.`;
    }
    t.streak = 0;
    E.log(s, msg, 'kill t' + kTeam);
    if (!s.firstBlood) { s.firstBlood = true; E.log(s, '🩸 ПЕРВАЯ КРОВЬ!', 'big'); E.fx(s, { type: 'banner', text: 'ПЕРВАЯ КРОВЬ', team: kTeam }); }
    E.fx(s, { type: 'death', uid: t.uid, killer: killer ? killer.uid : -1 });
    for (const x of s.heroes) if (!x.dead) E.hook(s, x, 'onDeathNear', { victim: t, killer });
  };

  E.killRosh = (s, h) => {
    const r = s.rosh;
    r.alive = false; r.hp = 0; r.kills++; r.respawn = s.round + C.ROSH_RESPAWN;
    if (!h) return;
    h.aegis = C.AEGIS_ROUNDS;
    for (const a of s.heroes.filter(x => x.team === h.team)) { E.gold(s, a, 225); E.xp(s, a, 250); }
    E.log(s, `🐲 ${D.TEAMS[h.team].name} убивают Рошана! ${E.nm(h)} забирает Эгиду.`, 'big t' + h.team);
    E.fx(s, { type: 'banner', text: 'РОШАН ПОВЕРЖЕН', team: h.team });
  };

  /* ---------- Economy & levels ---------- */
  E.gold = (s, h, v) => { h.gold += Math.round(v); };
  E.xp = (s, h, v) => {
    if (h.level >= C.MAX_LEVEL) return;
    h.xp += Math.round(v);
    while (h.level < C.MAX_LEVEL && h.xp >= D.XP[h.level]) {
      const before = E.st(s, h);
      h.level++;
      if (h.level <= 15 || true) h.sp++;
      if ([10, 15, 20].includes(h.level)) h.talentPending.push(h.level);
      const after = E.st(s, h);
      if (!h.dead) { h.hp += after.maxHp - before.maxHp; h.mana += after.maxMana - before.maxMana; }
      E.fx(s, { type: 'level', uid: h.uid, level: h.level });
      if (!s.sim && h.level % 5 === 0) E.log(s, `⬆️ ${E.nm(h)} достигает ${h.level} уровня.`);
    }
  };
  E.canLearn = (h, k) => {
    if (h.sp <= 0) return false;
    const sk = D.HEROES[h.id].skills[k];
    const lvl = h.skills[k];
    if (lvl >= sk.max) return false;
    if (sk.ult) return h.level >= [6, 12, 18][lvl];
    return lvl < Math.ceil(h.level / 2);
  };
  E.learnable = h => ['q', 'w', 'e', 'r'].filter(k => E.canLearn(h, k));
  E.learn = (s, h, k) => {
    if (!E.canLearn(h, k)) return false;
    const sk = D.HEROES[h.id].skills[k];
    h.sp--; h.skills[k]++;
    if (h.skills[k] === 1 && sk.cardId) {
      const n = sk.ult ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const c = { c: sk.cardId, n: s.nextCid++ };
        // fresh skill: put one copy straight into the deck's top half so it shows up soon
        const pos = Math.floor(E.rng(s) * Math.max(1, Math.ceil(h.deck.length / 2)));
        h.deck.splice(pos, 0, c);
      }
    }
    E.log(s, `📘 ${E.nm(h)} изучает «${sk.name}» (ур. ${h.skills[k]}).`);
    return true;
  };
  E.chooseTalent = (s, h, tid) => {
    const lvl = h.talentPending[0];
    if (!lvl) return false;
    const t = D.TALENTS[lvl].find(x => x.id === tid);
    if (!t) return false;
    h.talentPending.shift(); h.talents.push(tid);
    const st = E.st(s, h); h.hp = Math.min(h.hp + (t.add.hp || 0), st.maxHp);
    E.log(s, `🌟 ${E.nm(h)} выбирает талант: ${t.name}.`);
    return true;
  };
  E.itemCost = (h, id) => { const it = D.ITEMS[id]; return it.upgrade && h.items.includes(it.upgrade) ? it.cost - D.ITEMS[it.upgrade].cost : it.cost; };
  E.canBuy = (s, h, id) => {
    const it = D.ITEMS[id];
    if (h.items.includes(id)) return false;
    if (it.upgrade === undefined && id === 'boots' && h.items.includes('treads')) return false;
    const slots = h.items.length - (it.upgrade && h.items.includes(it.upgrade) ? 1 : 0);
    if (slots >= C.MAX_ITEMS) return false;
    return h.gold >= E.itemCost(h, id);
  };
  E.buy = (s, h, id) => {
    if (!E.canBuy(s, h, id)) return false;
    const it = D.ITEMS[id];
    const cost = E.itemCost(h, id);
    const before = E.st(s, h);
    h.gold -= cost; h.spent += cost;
    if (it.upgrade && h.items.includes(it.upgrade)) h.items.splice(h.items.indexOf(it.upgrade), 1);
    h.items.push(id);
    if (it.cardId) { const c = { c: it.cardId, n: s.nextCid++ }; const pos = Math.floor(E.rng(s) * (h.deck.length + 1)); h.deck.splice(pos, 0, c); }
    const after = E.st(s, h);
    if (!h.dead) { h.hp += Math.max(0, after.maxHp - before.maxHp); h.mana += Math.max(0, after.maxMana - before.maxMana); }
    E.log(s, `🛒 ${E.nm(h)} покупает «${it.name}».`);
    E.fx(s, { type: 'buy', uid: h.uid, item: id });
    return true;
  };

  /* ---------- Lanes, farm, towers ---------- */
  E.front = (s, lane, team) => { const t = s.towers[lane][team]; for (let i = 0; i < 3; i++) if (t[i] > 0) return i; return 3; };
  E.canFarm = (s, h) => { const z = D.ZONES[h.zone]; return z.type === 'lane' || z.type === 'jungle'; };
  E.farmValue = (s, h) => {
    const z = D.ZONES[h.zone];
    const st = E.st(s, h);
    let gold = 160 + 14 * s.round, xp = 190 + 22 * s.round;
    let m = 1;
    if (z.type === 'jungle') m = z.team === h.team ? 0.9 : 1.15;
    const foes = E.foes(s, h).length;
    if (foes) m *= 0.75;
    const allies = E.friends(s, h).length - 1; // sharing creeps
    m *= 1 / (1 + allies * 0.3);
    return { gold: Math.round(gold * m * (1 + st.farm)), xp: Math.round(xp * m) };
  };
  E.farm = (s, h) => {
    const v = E.farmValue(s, h);
    E.gold(s, h, v.gold); E.xp(s, h, v.xp);
    E.fx(s, { type: 'gold', uid: h.uid, amount: v.gold });
    E.log(s, `💰 ${E.nm(h)} фармит: +${v.gold} зол., +${v.xp} опыта.`, 'farm');
    // clearing the enemy wave lets allied creeps hit the tower
    if (D.ZONES[h.zone].type === 'lane' && !E.foes(s, h).length) E.push(s, h, 70 + 5 * s.round, { noRet: true, quiet: true });
  };
  E.canPush = (s, h) => D.ZONES[h.zone].type === 'lane' && !s.over;
  E.push = (s, h, amt, o = {}) => {
    const lane = h.zone, en = 1 - h.team;
    const idx = E.front(s, lane, en);
    if (E.foes(s, h).length && !o.noRet) amt *= 0.6;
    if (idx < 3) {
      const d = Math.round(amt * E.physMult(C.TOWER_ARMOR));
      s.towers[lane][en][idx] = Math.max(0, s.towers[lane][en][idx] - d);
      h.towerDmg += d;
      E.fx(s, { type: 'tower', lane, team: en, tier: idx, amount: d });
      if (s.towers[lane][en][idx] <= 0) E.towerDown(s, lane, en, idx, h);
      else if (!o.noRet) E.dmg(s, null, h, C.TOWER_DMG[idx], 'phys');
    } else {
      const d = Math.round(amt * E.physMult(C.ANCIENT_ARMOR));
      s.ancient[en] = Math.max(0, s.ancient[en] - d);
      h.towerDmg += d;
      E.fx(s, { type: 'ancient', team: en, amount: d });
      if (s.ancient[en] <= 0) E.win(s, h.team);
    }
  };
  E.towerDown = (s, lane, team, idx, h) => {
    const g = C.TOWER_GOLD[idx];
    for (const a of s.heroes.filter(x => x.team !== team)) E.gold(s, a, g);
    if (h) E.gold(s, h, 100);
    const names = ['первую', 'вторую', 'третью'];
    E.log(s, `🏰 ${D.TEAMS[1 - team].name} разрушают ${names[idx]} башню на линии «${D.ZONES[lane].short}» (+${g} зол. каждому).`, 'big t' + (1 - team));
    if (idx === 2) E.log(s, `💥 Казармы разрушены — на линии «${D.ZONES[lane].short}» идут мега-крипы!`, 'big');
    E.fx(s, { type: 'towerDown', lane, team, tier: idx });
  };
  E.win = (s, team) => {
    if (s.over) return;
    s.over = true; s.winner = team;
    E.log(s, `🏆 ${D.TEAMS[team].name} уничтожают Древнего! ПОБЕДА!`, 'big t' + team);
    E.fx(s, { type: 'win', team });
  };

  /* ---------- Movement ---------- */
  E.moveTo = (s, h, zone, free) => {
    if (!zone || h.zone === zone) return;
    const from = h.zone;
    h.zone = zone;
    E.fx(s, { type: 'move', uid: h.uid, from, to: zone });
  };
  E.moveOptions = (s, h) => {
    if (!s.turn || s.turn.uid !== h.uid || s.turn.moves <= 0 || E.has(h, 'root')) return [];
    return D.ADJ[h.zone].filter(z => E.canEnter(h, z));
  };
  E.move = (s, zone) => {
    const h = E.cur(s);
    if (!E.moveOptions(s, h).includes(zone)) return false;
    s.turn.moves--;
    E.moveTo(s, h, zone);
    return true;
  };

  /* ---------- Cards ---------- */
  E.cardDef = c => D.CARDS[c.c];
  E.cardLevel = (h, def) => def.kind === 'skill' || def.kind === 'ult' ? h.skills[def.skill] : 1;
  E.cardMana = (h, def) => D.L(def.mana, E.cardLevel(h, def)) || 0;
  E.draw = (s, h, n) => {
    for (let i = 0; i < n; i++) {
      if (!h.deck.length) { if (!h.discard.length) return; h.deck = E.shuffle(s, h.discard); h.discard = []; }
      h.hand.push(h.deck.shift());
    }
  };
  E.targets = (s, h, def) => {
    const zone = h.zone;
    const vis = x => E.visible(x);
    switch (def.tg) {
      case 'none': return [null];
      case 'enemy': return E.foes(s, h, zone).filter(vis).map(x => x.uid);
      case 'enemyOrRosh': { const r = E.foes(s, h, zone).filter(vis).map(x => x.uid); if (zone === 'roshan' && s.rosh.alive) r.push('rosh'); return r; }
      case 'enemyNear': return s.heroes.filter(x => x.team !== h.team && !x.dead && vis(x) && E.dist(zone, x.zone) <= 1 && E.canEnter(h, x.zone)).map(x => x.uid);
      case 'enemyAny': return E.allFoes(s, h).filter(vis).map(x => x.uid);
      case 'ally': return E.friends(s, h, zone).map(x => x.uid);
      case 'allyNear': return s.heroes.filter(x => x.team === h.team && !x.dead && E.dist(zone, x.zone) <= 1).map(x => x.uid);
      case 'zoneAdj': return D.ADJ[zone].filter(z => E.canEnter(h, z));
      case 'zoneAdjOrSame': return [zone, ...D.ADJ[zone].filter(z => E.canEnter(h, z))];
      case 'zone2': return E.zonesWithin(h, zone, 2);
      case 'zoneTP': {
        const team = h.team, r = [];
        if (zone !== D.TEAMS[team].base) r.push(D.TEAMS[team].base);
        for (const l of D.LANES) if (l !== zone && s.towers[l][team].some(x => x > 0)) r.push(l);
        return r;
      }
    }
    return [];
  };
  E.whyNot = (s, h, card) => {
    const def = E.cardDef(card);
    if (!s.turn || s.turn.uid !== h.uid) return 'Не ваш ход';
    if (s.turn.cards <= 0) return 'Карта уже сыграна в этот ход';
    if ((def.kind === 'skill' || def.kind === 'ult' || def.kind === 'item') && E.has(h, 'silence')) return 'Безмолвие';
    if (h.mana < E.cardMana(h, def)) return 'Недостаточно маны';
    const ctx = { s, h, l: E.cardLevel(h, def), E };
    if (def.req && !def.req(ctx)) return 'Условие не выполнено';
    if (!E.targets(s, h, def).length) return 'Нет доступных целей';
    return null;
  };
  E.canPlay = (s, h, card) => !E.whyNot(s, h, card);
  E.resolveTarget = (s, t) => (t === null || t === undefined) ? null : (t === 'rosh' ? 'rosh' : (typeof t === 'number' ? s.heroes[t] : t));
  E.play = (s, n, target) => {
    const h = E.cur(s);
    const i = h.hand.findIndex(c => c.n === n);
    if (i < 0) return false;
    const card = h.hand[i];
    const def = E.cardDef(card);
    if (!E.canPlay(s, h, card)) return false;
    const tl = E.targets(s, h, def);
    if (def.tg !== 'none' && !tl.includes(target)) return false;
    h.mana -= E.cardMana(h, def);
    h.hand.splice(i, 1);
    s.turn.cards--;
    const lvl = E.cardLevel(h, def);
    const ctx = { s, h, t: E.resolveTarget(s, target), l: lvl, E, card: def };
    if (!s.sim) {
      const tt = ctx.t && ctx.t !== 'rosh' && typeof ctx.t === 'object' ? ' → ' + E.nm(ctx.t) : ctx.t === 'rosh' ? ' → Рошан' : (typeof ctx.t === 'string' ? ' → ' + D.ZONES[ctx.t].short : '');
      E.log(s, `${def.icon} ${E.nm(h)}: «${def.name}»${tt}`, 'play t' + h.team);
      E.fx(s, { type: 'card', uid: h.uid, card: card.c, target, lvl });
    }
    if (def.kind !== 'basic' && E.has(h, 'invis') && def.tg !== 'none' && def.tg.startsWith('enemy')) E.rmSt(h, 'invis');
    def.play(ctx);
    if (ctx.returnToHand && !h.dead) h.hand.push(card); else h.discard.push(card);
    if ((def.kind === 'skill' || def.kind === 'ult') && !h.dead) E.hook(s, h, 'onSpell', {});
    s.turn.played = true;
    return true;
  };
  E.discard = (s, n) => {
    const h = E.cur(s);
    if (s.turn.discards <= 0) return false;
    const i = h.hand.findIndex(c => c.n === n);
    if (i < 0) return false;
    h.discard.push(h.hand.splice(i, 1)[0]);
    s.turn.discards--;
    E.draw(s, h, 1);
    return true;
  };

  /* ---------- Turn flow ---------- */
  E.newRound = (s, first) => {
    if (!first) {
      s.round++;
      for (const h of s.heroes) {
        E.gold(s, h, C.PASSIVE_GOLD);
        E.xp(s, h, C.PASSIVE_XP);
        // experience from nearby creep deaths
        if (!h.dead) { const zt = D.ZONES[h.zone].type; if (zt === 'lane') E.xp(s, h, 100 + 8 * s.round); else if (zt === 'jungle') E.xp(s, h, 60 + 6 * s.round); }
        if (h.reincCd > 0) h.reincCd--;
        if (h.aegis > 0) { h.aegis--; if (h.aegis === 0) E.log(s, `🛡️ Эгида ${E.nm(h)} исчезает.`); }
        if (h.dead) {
          h.respawn--;
          if (h.respawn <= 0) {
            h.dead = false; h.zone = D.TEAMS[h.team].base;
            const st = E.st(s, h); h.hp = st.maxHp; h.mana = st.maxMana;
            E.log(s, `✨ ${E.nm(h)} возрождается на базе.`);
            E.fx(s, { type: 'respawn', uid: h.uid });
          }
        }
      }
      // creep waves
      for (const lane of D.LANES) {
        for (const team of [0, 1]) {
          const mine = s.heroes.filter(x => x.team === team && !x.dead && x.zone === lane).length;
          const theirs = s.heroes.filter(x => x.team !== team && !x.dead && x.zone === lane).length;
          const mega = E.front(s, lane, 1 - team) === 3 || s.towers[lane][1 - team][2] <= 0;
          let pressure = 0;
          if (mine > 0 && theirs === 0) pressure = 60 * mine * (1 + s.round / 20);
          if (mega) pressure += 120 + 4 * s.round;
          if (s.round > 40) pressure += 3 * (s.round - 40);
          if (pressure > 0) {
            const en = 1 - team, idx = E.front(s, lane, en);
            if (idx < 3) {
              s.towers[lane][en][idx] = Math.max(0, s.towers[lane][en][idx] - Math.round(pressure * 0.6));
              if (s.towers[lane][en][idx] <= 0) E.towerDown(s, lane, en, idx, null);
            } else if (theirs === 0) {
              s.ancient[en] = Math.max(0, s.ancient[en] - Math.round(pressure * 0.4));
              if (s.ancient[en] <= 0) E.win(s, team);
            }
          }
        }
      }
      // Roshan
      if (!s.rosh.alive && s.round >= s.rosh.respawn) { E.spawnRosh(s); E.log(s, '🐲 Рошан возродился в своём логове.'); }
      else if (s.rosh.alive && !s.heroes.some(x => !x.dead && x.zone === 'roshan')) s.rosh.hp = s.rosh.max;
      if (s.round > C.ROUND_CAP && !s.over) {
        const sc = t => s.ancient[t] + D.LANES.reduce((a, l) => a + s.towers[l][t].reduce((x, y) => x + y, 0), 0) * 0.5;
        E.win(s, sc(0) >= sc(1) ? 0 : 1);
      }
    }
    // initiative: interleave teams, each sorted by agility
    const byTeam = [0, 1].map(t => s.heroes.filter(h => h.team === t).map(h => ({ h, i: E.st(s, h).agi + E.rng(s) * 6 })).sort((a, b) => b.i - a.i).map(x => x.h.uid));
    const firstTeam = s.round % 2 === 1 ? 0 : 1;
    s.order = [];
    for (let i = 0; i < 5; i++) { s.order.push(byTeam[firstTeam][i]); s.order.push(byTeam[1 - firstTeam][i]); }
    s.turnIdx = -1;
    if (!first) E.fx(s, { type: 'round', round: s.round });
  };

  // Advances to the next hero able to act. Returns the hero (or null when the game is over).
  E.nextTurn = (s) => {
    if (s.over) return null;
    for (;;) {
      s.turnIdx++;
      if (s.turnIdx >= s.order.length) { E.newRound(s, false); if (s.over) return null; continue; }
      const h = s.heroes[s.order[s.turnIdx]];
      if (h.dead) continue;
      E.startTurn(s, h);
      if (h.dead) { E.endTurnCleanup(s, h); continue; }
      if (s.turn.skip) { E.log(s, `💫 ${E.nm(h)} пропускает ход (${E.has(h, 'hex') ? 'сглаз' : 'оглушение'}).`); E.fx(s, { type: 'skip', uid: h.uid }); E.endTurnCleanup(s, h); continue; }
      return h;
    }
  };
  E.startTurn = (s, h) => {
    const st = E.st(s, h);
    s.turn = { uid: h.uid, moves: st.moves, cards: 1, discards: 1, played: false, skip: false };
    // damage over time
    for (const x of h.st.filter(x => x.t === 'dot')) { E.dmg(s, s.heroes[x.src] || null, h, x.v, 'magic'); if (h.dead) return; }
    for (const x of h.st.filter(x => x.t === 'regen')) E.heal(s, h, st.maxHp * x.v);
    // regeneration
    E.heal(s, h, st.hpRegen + st.maxHp * st.regenPct);
    let aura = 0;
    for (const a of s.heroes) if (a.team === h.team && a.skills.e > 0 && a.id === 'cm') aura += D.HEROES.cm.skills.e.passive.aura(a.skills.e) * (a === h ? 3 : 1);
    E.mana(s, h, st.mpRegen + st.maxMana * st.mpRegenPct + aura);
    if (h.zone === D.TEAMS[h.team].base) { E.heal(s, h, st.maxHp * 0.35); E.mana(s, h, st.maxMana * 0.35); }
    E.draw(s, h, Math.max(0, C.HAND - h.hand.length));
    if (E.has(h, 'stun') || E.has(h, 'hex')) s.turn.skip = true;
    if (E.has(h, 'root')) s.turn.moves = 0;
  };
  E.endTurnCleanup = (s, h) => {
    for (const x of h.st) { if (x.f) x.f = false; else x.n--; }
    h.st = h.st.filter(x => x.n > 0);
    s.turn = null;
  };
  E.endTurn = (s) => { const h = E.cur(s); if (h) E.endTurnCleanup(s, h); };

  /* ---------- Clone for AI look-ahead ---------- */
  // Hero objects are rebuilt explicitly (much faster than Object.assign). Card piles are only
  // mutated for the acting hero, so the other heroes share them with the original state.
  function cloneHero(h, own) {
    return {
      uid: h.uid, id: h.id, team: h.team, level: h.level, xp: h.xp, gold: h.gold, hp: h.hp, mana: h.mana, zone: h.zone,
      deck: own ? h.deck.slice() : h.deck, hand: own ? h.hand.slice() : h.hand, discard: own ? h.discard.slice() : h.discard,
      skills: { q: h.skills.q, w: h.skills.w, e: h.skills.e, r: h.skills.r }, sp: h.sp, talents: h.talents.slice(), talentPending: h.talentPending.slice(),
      items: h.items.slice(), st: h.st.map(x => ({ t: x.t, n: x.n, v: x.v, src: x.src, f: x.f })), dead: h.dead, respawn: h.respawn,
      k: h.k, d: h.d, a: h.a, perm: { str: h.perm.str, dmg: h.perm.dmg }, aegis: h.aegis, reincCd: h.reincCd, streak: h.streak,
      dmgDealt: h.dmgDealt, towerDmg: h.towerDmg, healDone: h.healDone, spent: h.spent,
    };
  }
  E.clone = (s) => {
    const c = Object.assign({}, s);
    const cu = s.turn ? s.turn.uid : -1;
    c.heroes = s.heroes.map(h => cloneHero(h, h.uid === cu));
    c.towers = {}; for (const l of D.LANES) c.towers[l] = [s.towers[l][0].slice(), s.towers[l][1].slice()];
    c.ancient = s.ancient.slice(); c.rosh = Object.assign({}, s.rosh); c.turn = s.turn ? Object.assign({}, s.turn) : null;
    c.score = s.score.slice(); c.events = []; c.log = []; c.sim = true;
    return c;
  };
})(typeof window !== 'undefined' ? window : globalThis);
