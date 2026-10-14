#!/usr/bin/env node
/* Balance simulator: runs AI-vs-AI games with random drafts and reports per-hero win rates.
   Usage: node tools/sim.js [games=200] [seed=1] [workers=4] */
'use strict';
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

function load() {
  for (const f of ['data.js', 'engine.js', 'ai.js']) require(path.join(__dirname, '..', 'js', f));
  return globalThis.DWC;
}

function runBatch(from, to, seed0) {
  const D = load();
  const out = [];
  for (let g = from; g < to; g++) {
    let seed = (seed0 * 7919 + g * 104729) | 0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pool = D.HERO_LIST.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const r = pool.slice(0, 5), d = pool.slice(5, 10);
    const t0 = Date.now();
    const s = D.AI.simulate(r, d, seed);
    out.push({
      r, d, winner: s.winner, rounds: s.round, ms: Date.now() - t0, score: s.score.slice(),
      rosh: s.rosh.kills,
      heroes: s.heroes.map(h => ({ id: h.id, team: h.team, k: h.k, d: h.d, a: h.a, lvl: h.level, nw: h.gold + h.spent, dmg: h.dmgDealt, items: h.items.length })),
    });
  }
  return out;
}

if (!isMainThread) {
  parentPort.postMessage(runBatch(workerData.from, workerData.to, workerData.seed));
} else {
  const games = +process.argv[2] || 200;
  const seed = +process.argv[3] || 1;
  const workers = +process.argv[4] || 4;
  const per = Math.ceil(games / workers);
  const t0 = Date.now();
  const jobs = [];
  for (let w = 0; w < workers; w++) {
    const from = w * per, to = Math.min(games, from + per);
    if (from >= to) continue;
    jobs.push(new Promise((res, rej) => { const wk = new Worker(__filename, { workerData: { from, to, seed } }); wk.on('message', res); wk.on('error', rej); }));
  }
  Promise.all(jobs).then(parts => {
    const D = load();
    const res = parts.flat();
    const stat = {};
    for (const id of D.HERO_LIST) stat[id] = { g: 0, w: 0, k: 0, d: 0, a: 0, nw: 0, lvl: 0, dmg: 0 };
    let rw = 0, rounds = 0, kills = 0, capped = 0, rosh = 0, ms = 0;
    for (const g of res) {
      if (g.winner === 0) rw++;
      rounds += g.rounds; kills += g.score[0] + g.score[1]; rosh += g.rosh; ms += g.ms;
      if (g.rounds > D.C.ROUND_CAP) capped++;
      for (const h of g.heroes) {
        const x = stat[h.id]; x.g++; if (h.team === g.winner) x.w++;
        x.k += h.k; x.d += h.d; x.a += h.a; x.nw += h.nw; x.lvl += h.lvl; x.dmg += h.dmg;
      }
    }
    const n = res.length;
    console.log(`games ${n}  radiant WR ${(rw / n * 100).toFixed(1)}%  avg rounds ${(rounds / n).toFixed(1)}  capped ${capped}  kills/game ${(kills / n).toFixed(1)}  rosh/game ${(rosh / n).toFixed(2)}  ms/game ${(ms / n).toFixed(0)}  total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    const rows = Object.entries(stat).sort((a, b) => b[1].w / b[1].g - a[1].w / a[1].g);
    console.log('hero        games  WR%    K     D     A     lvl   NW     dmg');
    for (const [id, x] of rows) {
      const g = Math.max(1, x.g);
      console.log(`${id.padEnd(10)} ${String(x.g).padStart(5)}  ${(x.w / g * 100).toFixed(1).padStart(5)}  ${(x.k / g).toFixed(1).padStart(4)}  ${(x.d / g).toFixed(1).padStart(4)}  ${(x.a / g).toFixed(1).padStart(4)}  ${(x.lvl / g).toFixed(1).padStart(4)}  ${(x.nw / g).toFixed(0).padStart(6)}  ${(x.dmg / g).toFixed(0).padStart(6)}`);
    }
  }).catch(e => { console.error(e); process.exit(1); });
}
