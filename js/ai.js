/* DOTA: Card Wars — AI. One-ply look-ahead over (moves × card × target) with a strategic evaluation. */
(function (G) {
  'use strict';
  const D = G.DWC;
  const E = D.E;
  const AI = D.AI = {};

  /* ---------- Draft helpers ---------- */
  // Positions 1..5 assigned greedily from each hero's preferred positions.
  AI.assignPositions = (ids) => {
    const res = {};
    const taken = new Set();
    for (let pass = 0; pass < 3; pass++) {
      for (const id of ids) {
        if (res[id]) continue;
        const p = D.HEROES[id].pos[pass];
        if (p && !taken.has(p)) { res[id] = p; taken.add(p); }
      }
    }
    for (const id of ids) if (!res[id]) { for (let p = 1; p <= 5; p++) if (!taken.has(p)) { res[id] = p; taken.add(p); break; } }
    return res;
  };
  AI.laneFor = (team, pos) => {
    const T = D.TEAMS[team];
    return { 1: T.safe, 2: 'mid', 3: T.off, 4: T.off, 5: T.safe }[pos];
  };
  AI.ensurePositions = (s) => {
    if (s.pos) return;
    s.pos = {};
    for (const team of [0, 1]) {
      const hs = s.heroes.filter(h => h.team === team);
      const p = AI.assignPositions(hs.map(h => h.id));
      for (const h of hs) s.pos[h.uid] = p[h.id];
    }
  };

  /* ---------- Power estimates ---------- */
  function burst(s, h, st) {
    st = st || E.st(s, h);
    const atk = st.atk * st.asMult * 1.9 * (1 + (st.crits.length ? 0.25 : 0));
    const sk = h.skills;
    const spell = (35 * (sk.q + sk.w + sk.e) + 140 * sk.r) * Math.min(1, h.mana / 150) * (1 + st.amp);
    return atk * 0.7 + spell * 0.75;
  }
  AI.burst = burst;
  AI.teamPower = (s, team) => {
    let p = 0;
    for (const h of s.heroes) if (h.team === team && !h.dead) {
      const st = E.st(s, h);
      p += (burst(s, h, st) * 3 + st.maxHp * 0.5) * (0.4 + 0.6 * h.hp / st.maxHp);
    }
    return p;
  };

  /* ---------- Team strategy (recomputed per round) ---------- */
  AI.plan = (s, team) => {
    s.plans = s.plans || {};
    const key = team + ':' + s.round;
    if (s.plans[key]) return s.plans[key];
    AI.ensurePositions(s);
    const en = 1 - team;
    const us = AI.teamPower(s, team), them = AI.teamPower(s, en);
    const ratio = us / Math.max(1, them);
    const aliveUs = s.heroes.filter(h => h.team === team && !h.dead).length;
    const aliveThem = s.heroes.filter(h => h.team === en && !h.dead).length;
    let plan = { type: 'farm' };
    // defend lanes under siege
    let threat = null, threatScore = 0;
    for (const lane of D.LANES) {
      const n = s.heroes.filter(h => h.team === en && !h.dead && h.zone === lane).length;
      const tier = E.front(s, lane, team);
      const sc = n * (1 + tier);
      if (n >= 2 && tier >= 1 && sc > threatScore) { threat = lane; threatScore = sc; }
      if (n >= 1 && tier === 3 && sc + 2 > threatScore) { threat = lane; threatScore = sc + 2; }
    }
    const lateness = Math.min(1, Math.max(0, (s.round - 8) / 20));
    const pushThr = 1.35 - 0.3 * lateness;
    if (threat && ratio > 0.55) plan = { type: 'defend', zone: threat };
    else if (s.round >= 8 && aliveUs >= 3 && ratio > pushThr && aliveUs >= aliveThem) {
      const aegis = s.heroes.some(h => h.team === team && h.aegis > 0);
      if (s.rosh.alive && s.round >= 14 && !aegis && ratio > 1.25 && (s.round % 6 < 3)) plan = { type: 'rosh', zone: 'roshan' };
      else {
        let best = null, bs = -1;
        for (const lane of D.LANES) {
          const tier = E.front(s, lane, en);
          const hp = tier < 3 ? s.towers[lane][en][tier] / D.C.TOWER_HP[tier] : s.ancient[en] / D.C.ANCIENT_HP;
          const sc = tier * 2 + (1 - hp) * 1.5 - (tier === 3 ? 0 : 0) + (lane === 'mid' ? 0.3 : 0);
          if (sc > bs) { bs = sc; best = lane; }
        }
        plan = { type: 'push', zone: best };
      }
    } else if (s.round >= 22 && ratio > 0.9 && aliveUs >= aliveThem) {
      plan = { type: 'push', zone: D.LANES.slice().sort((a, b) => E.front(s, b, en) - E.front(s, a, en))[0] };
    }
    s.plans[key] = plan;
    return plan;
  };

  AI.desired = (s, h) => {
    AI.ensurePositions(s);
    const st = E.st(s, h);
    const base = D.TEAMS[h.team].base;
    if (h.hp < st.maxHp * 0.3 || (h.hp < st.maxHp * 0.5 && h.mana < st.maxMana * 0.15)) return base;
    const pos = s.pos[h.uid];
    if (s.round <= 7) return AI.laneFor(h.team, pos);
    const plan = AI.plan(s, h.team);
    if (plan.type === 'defend' || plan.type === 'push' || plan.type === 'rosh') {
      // cores keep farming a bit if very poor compared to the game stage
      return plan.zone;
    }
    // farming phase
    const lane = AI.laneFor(h.team, pos);
    if (pos === 1 || pos === 2 || pos === 3) {
      const lanes = [lane, ...D.LANES.filter(l => l !== lane), D.TEAMS[h.team].jungle];
      for (const z of lanes) { const foes = s.heroes.filter(x => x.team !== h.team && !x.dead && x.zone === z).length; if (foes === 0) return z; }
      return D.TEAMS[h.team].jungle;
    }
    // supports roam: go where the enemy is most vulnerable or stay with cores
    let best = 'mid', bs = -1e9;
    for (const z of ['top', 'mid', 'bot', D.TEAMS[h.team].jungle]) {
      const foes = s.heroes.filter(x => x.team !== h.team && !x.dead && x.zone === z);
      const fr = s.heroes.filter(x => x.team === h.team && !x.dead && x.zone === z && x !== h).length;
      const sc = foes.length ? (fr * 2 - foes.length + 1) : (fr ? 0.5 : -0.5);
      if (sc > bs) { bs = sc; best = z; }
    }
    return best;
  };

  /* ---------- Evaluation ---------- */
  const TW = [1000, 1300, 1700];
  AI.evaluate = (s, team, me) => {
    if (s.over) return s.winner === team ? 1e7 : -1e7;
    let v = 0;
    const stats = s.heroes.map(h => E.st(s, h));
    const bursts = s.heroes.map((h, i) => h.dead ? 0 : burst(s, h, stats[i]));
    for (const h of s.heroes) {
      const st = stats[h.uid];
      const sign = h.team === team ? 1 : -1;
      const lw = 1 + h.level * 0.13;
      let hv = (h.gold + h.spent) * 0.22 + h.xp * 0.15;
      if (h.dead) {
        hv -= 380 * lw + 160 * h.respawn;
      } else {
        hv += (h.hp / st.maxHp) * 520 * lw + (h.mana / st.maxMana) * 90 * lw;
        for (const x of h.st) {
          const n = x.n + (x.f ? 1 : 0);
          switch (x.t) {
            case 'stun': case 'hex': hv -= 110 * lw * Math.min(2, n); break;
            case 'root': hv -= 35 * lw; break;
            case 'silence': hv -= 45 * lw * n; break;
            case 'dot': hv -= x.v * n * 0.6; break;
            case 'shield': hv += x.v * 0.5; break;
            case 'immune': hv += 70 * lw; break;
            case 'invis': hv += 50 * lw; break;
            case 'grave': hv += 140 * lw; break;
            case 'armor': case 'armorRed': hv += x.v * 12 * lw; break;
            case 'dmgPct': hv += x.v * 150 * lw; break;
            case 'evasion': hv += x.v * 120 * lw; break;
          }
        }
        if (h.aegis > 0) hv += 600 * lw;
        // threat: enemies that can reach this hero before it acts again
        let threat = 0, help = 0;
        for (const o of s.heroes) {
          if (o.dead || o === h) continue;
          const d = E.dist(o.zone, h.zone);
          if (o.team !== h.team) {
            if (d === 0) threat += bursts[o.uid] * (E.has(o, 'stun') || E.has(o, 'hex') ? 0.2 : 1);
            else if (d === 1 && E.canEnter(o, h.zone)) threat += bursts[o.uid] * 0.55 * (E.has(o, 'root') ? 0.2 : 1);
          } else if (d === 0) help += bursts[o.uid];
        }
        if (h.zone === D.TEAMS[h.team].base) threat *= 0.15;
        if (!E.visible(h)) threat *= 0.3;
        const mitig = (E.physMult(st.armor) + (1 - st.mres)) / 2;
        threat *= mitig * Math.max(0.35, 1 - help / Math.max(1, threat + help) * 0.6);
        // standing in an enemy lane next to a live tower is a bit dangerous
        if (D.ZONES[h.zone].type === 'lane') { const idx = E.front(s, h.zone, 1 - h.team); if (idx < 3 && E.front(s, h.zone, h.team) < 3) threat += 0; }
        const ratio = threat / Math.max(1, h.hp);
        const pDeath = Math.max(0, Math.min(1, (ratio - 0.55) / 0.8));
        const dv = 380 * lw + 160 * (1 + Math.floor(h.level / 7)) + (h.hp / st.maxHp) * 520 * lw;
        hv -= pDeath * dv * (sign > 0 ? 0.65 : 0.55);
        hv -= Math.min(threat, h.hp) / st.maxHp * 120 * lw * (sign > 0 ? 0.6 : 0.3);
        // strategy positioning (own team only)
        if (sign > 0) {
          const want = AI.desired(s, h);
          const dz = E.dist(h.zone, want);
          const laning = s.round <= 7 && want !== D.TEAMS[h.team].base;
          hv += laning ? (dz === 0 ? 300 : dz === 1 ? 90 : 0) : (dz === 0 ? 140 : dz === 1 ? 60 : 0);
          if (h.zone === D.TEAMS[h.team].base && want !== h.zone && h.hp > st.maxHp * 0.85) hv -= 60;
        }
      }
      v += sign * hv;
    }
    for (const lane of D.LANES) for (const t of [0, 1]) {
      const sign = t === team ? 1 : -1;
      for (let i = 0; i < 3; i++) v += sign * (s.towers[lane][t][i] / D.C.TOWER_HP[i]) * TW[i];
    }
    for (const t of [0, 1]) v += (t === team ? 1 : -1) * (s.ancient[t] / D.C.ANCIENT_HP) * 8000;
    if (s.rosh.alive && s.rosh.hp < s.rosh.max) {
      const near = s.heroes.filter(h => !h.dead && h.zone === 'roshan');
      const ours = near.filter(h => h.team === team).length, theirs = near.length - ours;
      v += (1 - s.rosh.hp / s.rosh.max) * 1200 * (ours > theirs ? 1 : ours === theirs ? 0 : -1);
    }
    return v;
  };

  /* ---------- Turn planning ---------- */
  function paths(s, h) {
    const res = [[]];
    if (E.has(h, 'root') || s.turn.moves <= 0) return res;
    const seen = new Set([h.zone]);
    let frontier = [[h.zone, []]];
    for (let step = 0; step < s.turn.moves; step++) {
      const nf = [];
      for (const [z, p] of frontier) for (const n of D.ADJ[z]) {
        if (!E.canEnter(h, n) || seen.has(n)) continue;
        seen.add(n); const np = p.concat([n]); res.push(np); nf.push([n, np]);
      }
      frontier = nf;
    }
    return res;
  }

  function applyMoves(c, path) { for (const z of path) E.move(c, z); }

  AI.thinkTurn = (s, opts = {}) => {
    const h = E.cur(s);
    const team = h.team;
    let best = { score: -Infinity, actions: [] };
    const consider = (score, actions) => { if (score > best.score) best = { score, actions }; };
    const noise = () => (opts.noise ? (Math.random() - 0.5) * opts.noise : 0);
    for (const path of paths(s, h)) {
      const c1 = E.clone(s);
      applyMoves(c1, path);
      const h1 = E.cur(c1);
      const moveActs = path.map(z => ({ type: 'move', zone: z }));
      consider(AI.evaluate(c1, team, h1) - 15 + noise(), moveActs);
      const stepCost = path.length * 12;
      const seenCards = new Set();
      for (const card of h1.hand) {
        if (seenCards.has(card.c)) continue;
        seenCards.add(card.c);
        if (!E.canPlay(c1, h1, card)) continue;
        const def = E.cardDef(card);
        for (const tg of E.targets(c1, h1, def)) {
          const c2 = E.clone(c1);
          E.play(c2, card.n, tg);
          const acts = moveActs.concat([{ type: 'play', n: card.n, target: tg }]);
          let sc = AI.evaluate(c2, team, E.cur(c2));
          // extra plays granted (Blink): greedily take the best follow-up
          const h2 = E.cur(c2);
          if (!c2.over && h2 && !h2.dead && c2.turn.cards > 0) {
            let bb = null, bsc = sc;
            for (const c of h2.hand) {
              if (!E.canPlay(c2, h2, c)) continue;
              for (const t2 of E.targets(c2, h2, E.cardDef(c))) {
                const c3 = E.clone(c2); E.play(c3, c.n, t2);
                const v3 = AI.evaluate(c3, team, E.cur(c3));
                if (v3 > bsc) { bsc = v3; bb = { type: 'play', n: c.n, target: t2 }; }
              }
            }
            if (bb) { sc = bsc; acts.push(bb); }
          }
          consider(sc - stepCost + noise(), acts);
          // hit and run: one step after the card when movement remains
          if (!c2.over && h2 && !h2.dead && path.length === 0 && c2.turn.moves > 0 && !E.has(h2, 'root')) {
            for (const z of D.ADJ[h2.zone]) {
              if (!E.canEnter(h2, z)) continue;
              const c3 = E.clone(c2); E.move(c3, z);
              consider(AI.evaluate(c3, team, E.cur(c3)) + noise(), acts.concat([{ type: 'move', zone: z }]));
            }
          }
        }
      }
    }
    return best.actions;
  };

  // Picks a card to throw away (one per turn) when the hand is clogged.
  AI.discardChoice = (s, h) => {
    const bad = h.hand.filter(c => !E.canPlay(s, h, c) || (s.turn && s.turn.cards <= 0 && false));
    const scoreCard = c => {
      const d = E.cardDef(c);
      let v = d.kind === 'ult' ? 100 : d.kind === 'skill' ? 50 : d.kind === 'item' ? 60 : 10;
      if (c.c === 'farm' && s.round > 25) v -= 5;
      if (c.c === 'push' && !D.LANES.includes(AI.desired(s, h))) v -= 3;
      if (E.cardMana(h, d) > E.st(s, h).maxMana) v -= 80;
      return v;
    };
    const unplayable = h.hand.filter(c => {
      const d = E.cardDef(c);
      if (E.cardMana(h, d) > h.mana + 40) return true;
      if (c.c === 'salve' && h.hp > E.st(s, h).maxHp * 0.9) return true;
      if (c.c === 'tp' && s.round > 3) return false;
      return false;
    });
    if (unplayable.length < 1 || (unplayable.length < 2 && h.hand.length < D.C.HAND)) return null;
    unplayable.sort((a, b) => scoreCard(a) - scoreCard(b));
    return unplayable[0].n;
  };

  AI.chooseSkill = (s, h) => {
    const opts = E.learnable(h);
    if (!opts.length) return null;
    if (opts.includes('r')) return 'r';
    const order = D.HEROES[h.id].skillOrder;
    const counts = { q: 0, w: 0, e: 0, r: 0 };
    for (const k of order) { counts[k]++; if (counts[k] > h.skills[k] && opts.includes(k)) return k; }
    return opts[0];
  };
  AI.chooseTalent = (s, h) => {
    const lvl = h.talentPending[0];
    const t = D.TALENTS[lvl];
    const d = D.HEROES[h.id];
    const caster = d.attr === 'int' || (d.attr === 'uni' && d.pos[0] >= 4);
    if (lvl === 10) return d.attr === 'str' || caster ? t[0].id : t[1].id;
    if (lvl === 15) return caster ? t[0].id : t[1].id;
    return d.attr === 'agi' || d.pos[0] === 1 ? t[1].id : t[0].id;
  };
  AI.chooseBuy = (s, h) => {
    const build = D.HEROES[h.id].build;
    for (const id of build) {
      if (h.items.includes(id)) continue;
      if (id === 'boots' && h.items.includes('treads')) continue;
      if (E.canBuy(s, h, id)) return id;
      return null; // save for the next item in order
    }
    return null;
  };

  // Full action list for the current hero (used by both the simulator and the UI).
  AI.decide = (s, opts = {}) => {
    const h = E.cur(s);
    const pre = [];
    const c = E.clone(s);
    const hc = E.cur(c);
    while (hc.sp > 0) { const k = AI.chooseSkill(c, hc); if (!k) break; E.learn(c, hc, k); pre.push({ type: 'learn', skill: k }); }
    while (hc.talentPending.length) { const t = AI.chooseTalent(c, hc); E.chooseTalent(c, hc, t); pre.push({ type: 'talent', id: t }); }
    for (let i = 0; i < 3; i++) { const it = AI.chooseBuy(c, hc); if (!it) break; E.buy(c, hc, it); pre.push({ type: 'buy', item: it }); }
    const dn = AI.discardChoice(c, hc);
    if (dn !== null) { E.discard(c, dn); pre.push({ type: 'discard', n: dn }); }
    const acts = AI.thinkTurn(c, opts);
    return pre.concat(acts, [{ type: 'end' }]);
  };

  AI.apply = (s, a) => {
    const h = E.cur(s);
    if (!h) return false;
    switch (a.type) {
      case 'learn': return E.learn(s, h, a.skill);
      case 'talent': return E.chooseTalent(s, h, a.id);
      case 'buy': return E.buy(s, h, a.item);
      case 'discard': return E.discard(s, a.n);
      case 'move': return E.move(s, a.zone);
      case 'play': return E.play(s, a.n, a.target);
      case 'end': E.endTurn(s); return true;
    }
    return false;
  };

  // Headless full game (for balance testing).
  AI.simulate = (radiant, dire, seed, opts = {}) => {
    const s = E.newGame(radiant, dire, { seed });
    s.log = []; // keep logs small
    let guard = 0;
    while (!s.over && guard++ < 5000) {
      const h = E.nextTurn(s);
      if (!h) break;
      const acts = AI.decide(s, opts);
      for (const a of acts) { if (s.over) break; if (E.cur(s) !== h) break; if (h.dead && a.type !== 'end') continue; AI.apply(s, a); }
      if (s.turn) E.endTurn(s);
      if (s.log.length > 50) s.log.length = 0;
    }
    return s;
  };
})(typeof window !== 'undefined' ? window : globalThis);
