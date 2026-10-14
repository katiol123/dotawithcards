/* DOTA: Card Wars — user interface. */
(function () {
  'use strict';
  const D = window.DWC, E = D.E, AI = D.AI, L = D.L;
  const PLACEHOLDER = 'assets/hero-placeholder.jpg';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtK = v => v >= 10000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v));

  const UI = {
    s: null, mode: 'radiant', speed: 1, prevSpeed: 1, busy: false, targeting: null,
    draft: { picks: [[], []], sel: null, active: 0 },
    endTurnResolve: null, logLen: 0, lastTeams: null, gameId: 0,
  };
  window.DWC_UI = UI;

  /* ================= Generic helpers ================= */
  const delay = ms => new Promise(r => setTimeout(r, ms));
  async function wait(ms) {
    // honours the speed setting and pause
    while (UI.speed === 0) await delay(120);
    await delay(ms / UI.speed);
  }
  function setScreen(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + id));
  }
  function portrait(id, cls = '') {
    const d = D.HEROES[id];
    const src = d.img || PLACEHOLDER;
    return `<div class="portrait ${d.img ? 'custom' : ''} ${cls}" style="--hue:${d.hue}deg"><div class="pimg" style="background-image:url('${src}')"></div></div>`;
  }
  function attrDot(attr) { return `<span class="attr-dot attr-${attr}" title="${D.ATTR[attr].name}">${D.ATTR[attr].short[0]}</span>`; }

  /* ---------- tooltip ---------- */
  const tip = $('#tooltip');
  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tip.classList.remove('show'); return; }
    tip.innerHTML = t.getAttribute('data-tip');
    tip.classList.add('show');
  });
  document.addEventListener('mousemove', e => {
    if (!tip.classList.contains('show')) return;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });

  /* ---------- modal ---------- */
  function modal(html, opts = {}) {
    const root = $('#modal-root');
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${opts.cls || ''}" role="dialog">${opts.noClose ? '' : '<button class="close" aria-label="Закрыть">×</button>'}${html}</div>`;
    root.appendChild(back);
    const close = () => { back.remove(); opts.onClose && opts.onClose(); };
    if (!opts.noClose) {
      back.querySelector('.close').onclick = close;
      back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    }
    back.close = close;
    return back;
  }
  function closeModals() { $$('#modal-root .modal-back').forEach(m => m.remove()); }

  /* ================= Cards ================= */
  const KIND_LABEL = { basic: 'Базовая карта', skill: 'Способность', ult: 'Ультимейт', item: 'Предмет' };
  function cardHTML(cardId, o = {}) {
    const def = D.CARDS[cardId];
    const heroId = def.hero || (o.h ? o.h.id : null);
    const attr = def.hero ? D.HEROES[def.hero].attr : 'uni';
    let lvl = o.lvl !== undefined ? o.lvl : (o.h ? E.cardLevel(o.h, def) : 1);
    const dl = Math.max(1, lvl);
    const mana = D.L(def.mana, dl) || 0;
    let art;
    if (def.kind === 'skill' || def.kind === 'ult') art = `<div class="card-art">${portrait(def.hero)}<div class="card-icon">${def.icon}</div></div>`;
    else art = `<div class="card-art ${def.kind}"><div class="card-icon">${def.icon}</div></div>`;
    let pips = '';
    if (def.kind === 'skill' || def.kind === 'ult') {
      const max = def.kind === 'ult' ? 3 : 4;
      pips = '<div class="card-lvl">' + Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('') + '</div>';
    }
    let type = KIND_LABEL[def.kind];
    if (def.kind === 'skill' || def.kind === 'ult') type += ' · ' + D.HEROES[def.hero].name;
    const desc = def.desc(dl, UI.s, o.h);
    return `<div class="card kind-${def.kind} attr-${attr} ${o.cls || ''}" data-card="${cardId}" ${o.n !== undefined ? `data-n="${o.n}"` : ''}>
      <div class="card-cost ${mana ? '' : 'free'}">${mana}</div>${pips}
      <div class="card-inner">${art}
        <div class="card-name">${esc(def.name)}</div>
        <div class="card-type">${type}</div>
        <div class="card-text">${desc}</div>
      </div>
      ${o.discard ? '<button class="discard-btn" title="Сбросить карту и взять новую (1 раз за ход)">♻</button>' : ''}
    </div>`;
  }
  // passive-only ability shown as a card
  function passiveCardHTML(heroId, k, lvl, cls = '') {
    const sk = D.HEROES[heroId].skills[k];
    const attr = D.HEROES[heroId].attr;
    const max = sk.ult ? 3 : 4;
    const dl = Math.max(1, lvl);
    const pips = '<div class="card-lvl">' + Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('') + '</div>';
    return `<div class="card kind-${sk.ult ? 'ult' : 'skill'} attr-${attr} passive ${cls}">${pips}
      <div class="card-inner"><div class="card-art">${portrait(heroId)}<div class="card-icon">${sk.icon}</div></div>
      <div class="card-name">${esc(sk.name)}</div><div class="card-type">Пассивная${sk.ult ? ' · ультимейт' : ''}</div>
      <div class="card-text">${sk.desc(dl)}<br><i>Не входит в колоду — действует всегда.</i></div></div></div>`;
  }
  function skillCardHTML(heroId, k, lvl, cls) {
    const sk = D.HEROES[heroId].skills[k];
    if (sk.cardId) return cardHTML(sk.cardId, { lvl, cls });
    return passiveCardHTML(heroId, k, lvl, cls);
  }

  /* ================= Menu ================= */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'new-game') openDraft();
    else if (a === 'rules') openRules();
    else if (a === 'heroes') openGallery();
    else if (a === 'to-menu') setScreen('menu');
    else if (a === 'draft-random') draftRandom();
    else if (a === 'draft-reset') { UI.draft.picks = [[], []]; renderDraft(); }
    else if (a === 'start') startGame(UI.draft.picks[0].slice(), UI.draft.picks[1].slice());
    else if (a === 'quit') confirmQuit();
  });

  function openRules() {
    modal(`<h2>Правила игры</h2>
      <p><b>Цель</b> — разрушить Древнего противника. Чтобы добраться до него, нужно снести все три башни хотя бы на одной линии, а затем бить Древнего картами «Натиск» на этой линии.</p>
      <h3>Карта</h3>
      <p>Поле разделено на зоны: три линии (топ, мид, бот), леса обеих сторон, логово Рошана и две базы. Пунктиром показаны связи между зонами. За ход герой может <b>переместиться на 1 соседнюю зону</b> (с сапогами — на 2) и <b>сыграть 1 карту</b>. Порядок любой: можно ударить и отступить. Во вражескую базу войти нельзя.</p>
      <h3>Раунды и ходы</h3>
      <p>Раунд — это «минута» игры. Каждый раунд все живые герои ходят по очереди, чередуя стороны (раньше ходит тот, у кого выше ловкость). В начале хода герой восстанавливает здоровье и ману и добирает руку до <b>5 карт</b> из своей колоды. Раз в ход можно <b>сбросить</b> одну карту (♻) и взять новую.</p>
      <h3>Колода героя</h3>
      <p>У каждого героя есть <b>базовые карты</b> (Удар ×3, Фарм ×3, Натиск ×2, Свиток телепорта, Лечебная мазь, Засада) и <b>уникальные карты способностей</b>. Изучив способность, герой добавляет в колоду 2 её копии (ультимейт — 1). Повышение уровня способности усиливает все её копии. Пассивные способности действуют всегда. Предметы с активным эффектом (Блинк, BKB, Вайс и др.) тоже добавляют карту.</p>
      <h3>Атрибуты</h3>
      <ul>
        <li><b style="color:var(--str)">Сила</b> — здоровье и его восстановление.</li>
        <li><b style="color:var(--agi)">Ловкость</b> — броня и скорость атаки (множитель урона карт атаки).</li>
        <li><b style="color:var(--int)">Интеллект</b> — мана, её восстановление и усиление заклинаний.</li>
        <li>Основной атрибут добавляется к урону атаки. Универсальные герои получают 45% от суммы всех атрибутов.</li>
      </ul>
      <h3>Развитие</h3>
      <p>Опыт даёт фарм, нахождение на линии (крипы гибнут рядом), убийства и Рошан. Каждый уровень — очко способности (ультимейт на 6/12/18, обычные — не выше половины уровня героя). На 10, 15 и 20 уровне выбирается талант. Золото тратится в <b>магазине</b> в любой момент своего хода.</p>
      <h3>Бой</h3>
      <p>Физический урон снижается бронёй, магический — сопротивлением магии (25% базово). <b>Оглушение</b> и <b>сглаз</b> заставляют пропустить ход, <b>обездвиживание</b> запрещает перемещаться, <b>безмолвие</b> — играть способности и предметы. Невидимых героев нельзя выбрать целью, но по площади они получают урон. Смерть: потеря золота и возрождение на базе через 1–3 раунда.</p>
      <h3>Объекты</h3>
      <p>Башни бьют в ответ тех, кто их атакует. Фарм на линии без врагов позволяет вашим крипам бить башню. Разрушенные казармы (третья башня) дают мега-крипов. <b>Рошан</b> в своём логове: атакуйте его картами атаки, он отвечает ударом. Убийца получает <b>Эгиду</b> (одно воскрешение), вся команда — золото и опыт.</p>
      <h3>Управление</h3>
      <p>Кликните подсвеченную зону, чтобы переместиться. Кликните карту, чтобы сыграть её; если нужна цель — выберите героя на карте, его плитку сбоку или зону. ПКМ / Esc — отмена. Наведите на элементы для подсказок.</p>
      <div class="modal-actions"><button class="btn btn-gold" onclick="this.closest('.modal-back').remove()">Понятно</button></div>`);
  }

  function openGallery() {
    let html = '<h2>Герои и карты</h2>';
    html += '<h3>Базовые карты (у каждого героя)</h3><div class="gallery-cards">' + [...new Set(D.BASIC_DECK)].map(c => cardHTML(c, { cls: 'mini' })).join('') + '</div>';
    for (const id of D.HERO_LIST) {
      const d = D.HEROES[id];
      html += `<div class="gallery-hero"><div>${heroDetailHTML(id, true)}</div><div class="gallery-cards">${['q', 'w', 'e', 'r'].map(k => skillCardHTML(id, k, 1, 'mini')).join('')}</div></div>`;
    }
    html += '<h3>Карты предметов</h3><div class="gallery-cards">' + Object.values(D.ITEMS).filter(i => i.cardId).map(i => cardHTML(i.cardId, { cls: 'mini' })).join('') + '</div>';
    modal(html, { cls: 'wide' }).querySelector('.modal').style.width = 'min(1200px, 96vw)';
  }

  /* ================= Draft ================= */
  const PICK_ORDER = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
  function draftNextTeam() {
    const p = UI.draft.picks;
    const n = p[0].length + p[1].length;
    if (n >= 10) return -1;
    let t = PICK_ORDER[n];
    if (p[t].length >= 5) t = 1 - t;
    return t;
  }
  function openDraft() {
    setScreen('draft');
    if (!UI.draft.sel) UI.draft.sel = D.HERO_LIST[0];
    renderDraft();
  }
  function draftRandom() {
    const pool = D.HERO_LIST.slice().sort(() => Math.random() - 0.5);
    const p = UI.draft.picks;
    const taken = new Set([...p[0], ...p[1]]);
    const free = pool.filter(x => !taken.has(x));
    while (p[0].length < 5) p[0].push(free.shift());
    while (p[1].length < 5) p[1].push(free.shift());
    renderDraft();
  }
  function renderDraft() {
    const p = UI.draft.picks;
    const taken = {};
    p.forEach((arr, t) => arr.forEach(id => taken[id] = t));
    const next = draftNextTeam();
    // pool
    const groups = ['str', 'agi', 'int', 'uni'];
    $('#draft-pool').innerHTML = groups.map(g => `<div class="pool-row"><div class="pool-attr" style="color:${D.ATTR[g].color}">${D.ATTR[g].name}</div><div class="pool-heroes">` +
      D.HERO_LIST.filter(id => D.HEROES[id].attr === g).map(id => {
        const d = D.HEROES[id];
        const tk = taken[id];
        return `<div class="hcard ${tk !== undefined ? 'picked' : ''} ${UI.draft.sel === id ? 'sel' : ''}" data-hero="${id}">${portrait(id)}${attrDot(d.attr)}
          <div class="hname">${d.name}<small>${d.roles.map(r => D.ROLES[r]).join(' · ')}</small></div>
          <div class="pick-tag t${tk}">${tk === 0 ? 'СВЕТ' : tk === 1 ? 'ТЬМА' : ''}</div></div>`;
      }).join('') + '</div></div>').join('');
    // teams
    [0, 1].forEach(t => {
      const box = $('#draft-team-' + t);
      box.classList.toggle('active', next === t);
      box.innerHTML = `<h3>${D.TEAMS[t].name}</h3>` + Array.from({ length: 5 }, (_, i) => {
        const id = p[t][i];
        if (!id) return `<div class="slot"><div class="slot-empty">${next === t && i === p[t].length ? '▸ выбирается…' : 'пусто'}</div></div>`;
        const d = D.HEROES[id];
        const pos = AI.assignPositions(p[t])[id];
        return `<div class="slot filled" data-hero="${id}">${portrait(id)}<div><div class="sname">${d.name}</div><div class="srole">${attrDot(d.attr)} позиция ${pos} · ${['', 'керри', 'мид', 'оффлейн', 'роумер', 'саппорт'][pos]}</div></div><button class="x" data-remove="${t}:${i}" title="Убрать">✕</button></div>`;
      }).join('');
    });
    const dt = $('#draft-turn');
    dt.className = 'draft-turn' + (next >= 0 ? ' t' + next : '');
    dt.textContent = next >= 0 ? `Выбирают: ${D.TEAMS[next].name}` : 'Составы готовы';
    $('#draft-detail').innerHTML = UI.draft.sel ? heroDetailHTML(UI.draft.sel) + `<div class="dd-section">Уникальные карты</div><div class="dd-skills">${['q', 'w', 'e', 'r'].map(k => skillCardHTML(UI.draft.sel, k, 1, 'mini')).join('')}</div>` : '';
    $$('#mode-select .mode').forEach(m => m.classList.toggle('on', m.dataset.mode === UI.mode));
    $('#btn-start').disabled = !(p[0].length === 5 && p[1].length === 5);
  }
  function heroDetailHTML(id, compact) {
    const d = D.HEROES[id];
    const st = (k, g, name) => `<div class="stat ${k} ${d.attr === k ? 'prim' : ''}"><div class="sv">${d[k]}</div><div class="sg">${name} +${g}</div></div>`;
    const hp = Math.round(100 + d.str * 18), mp = Math.round(75 + d.int * 12);
    return `<div class="dd-head">${portrait(id)}<div><div class="dd-name">${d.name}</div><div class="dd-title">${d.title} · ${attrDot(d.attr)} ${D.ATTR[d.attr].name}</div>
      <div class="dd-roles">${d.roles.map(r => `<span class="chip">${D.ROLES[r]}</span>`).join('')}<span class="chip">${d.ranged ? 'Дальний бой' : 'Ближний бой'}</span></div>
      <div class="statgrid">${st('str', d.gs, 'СИЛ')}${st('agi', d.ga, 'ЛОВ')}${st('int', d.gi, 'ИНТ')}</div>
      <div style="font-size:12px;color:var(--muted)">❤ ${hp} · 💧 ${mp} · ⚔ ${Math.round(d.dmg + (d.attr === 'uni' ? 0.45 * (d.str + d.agi + d.int) : d[d.attr]))} · 🛡 ${(d.armor + d.agi / 5).toFixed(1)}</div></div></div>
      ${compact ? '' : `<div class="dd-lore">${d.lore}</div>`}`;
  }
  $('#screen-draft').addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { const [t, i] = rm.dataset.remove.split(':').map(Number); UI.draft.picks[t].splice(i, 1); renderDraft(); return; }
    const m = e.target.closest('.mode');
    if (m) { UI.mode = m.dataset.mode; renderDraft(); return; }
    const hc = e.target.closest('.hcard');
    if (hc) {
      const id = hc.dataset.hero;
      const p = UI.draft.picks;
      UI.draft.sel = id;
      if (!p[0].includes(id) && !p[1].includes(id)) { const t = draftNextTeam(); if (t >= 0) p[t].push(id); }
      renderDraft();
      return;
    }
    const sl = e.target.closest('.slot.filled');
    if (sl) { UI.draft.sel = sl.dataset.hero; renderDraft(); }
  });
  $('#screen-draft').addEventListener('mouseover', e => {
    const hc = e.target.closest('.hcard,.slot.filled');
    if (hc && hc.dataset.hero && hc.dataset.hero !== UI.draft.hover) {
      UI.draft.hover = hc.dataset.hero;
      $('#draft-detail').innerHTML = heroDetailHTML(hc.dataset.hero) + `<div class="dd-section">Уникальные карты</div><div class="dd-skills">${['q', 'w', 'e', 'r'].map(k => skillCardHTML(hc.dataset.hero, k, 1, 'mini')).join('')}</div>`;
    }
  });

  /* ================= Game ================= */
  function humanTeam(team) {
    return UI.mode === 'hotseat' || (UI.mode === 'radiant' && team === 0) || (UI.mode === 'dire' && team === 1);
  }
  function startGame(r, d) {
    UI.lastTeams = [r, d];
    UI.s = E.newGame(r, d, {});
    AI.ensurePositions(UI.s);
    UI.logLen = 0; UI.targeting = null; UI.gameId++;
    closeModals();
    setScreen('game');
    buildMap();
    $('#log').innerHTML = '';
    setSpeed(UI.speed || 1);
    renderAll();
    gameLoop(UI.gameId);
  }
  function confirmQuit() {
    const m = modal(`<h2>Покинуть битву?</h2><p>Текущая игра будет потеряна.</p><div class="modal-actions"><button class="btn btn-dark" data-x="no">Остаться</button><button class="btn btn-gold" data-x="yes">Выйти в меню</button></div>`);
    m.querySelector('[data-x=no]').onclick = () => m.close();
    m.querySelector('[data-x=yes]').onclick = () => { m.close(); UI.gameId++; if (UI.endTurnResolve) UI.endTurnResolve(); UI.s = null; setScreen('menu'); };
  }
  function setSpeed(v) {
    UI.speed = v;
    document.documentElement.style.setProperty('--speed', Math.max(1, v));
    $$('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === v));
  }
  $('#speed').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSpeed(+b.dataset.speed); });

  async function gameLoop(gid) {
    const s = UI.s;
    await wait(400);
    while (!s.over && gid === UI.gameId) {
      const h = E.nextTurn(s);
      renderAll();
      await playEvents(gid);
      if (!h || gid !== UI.gameId) break;
      if (humanTeam(h.team)) await humanTurn(h, gid);
      else await aiTurn(h, gid);
      if (gid !== UI.gameId) return;
      if (s.turn) E.endTurn(s);
      UI.targeting = null;
      renderAll();
      await playEvents(gid);
    }
    if (gid === UI.gameId && s.over) { renderAll(); await wait(1200); showGameOver(); }
  }

  /* ---------- AI turn ---------- */
  async function aiTurn(h, gid) {
    const s = UI.s;
    renderAll();
    await wait(450);
    const acts = AI.decide(s, { noise: 8 });
    for (const a of acts) {
      if (gid !== UI.gameId || s.over || E.cur(s) !== h) break;
      if (h.dead && a.type !== 'end') continue;
      if (a.type === 'end') break;
      if (a.type === 'play') {
        const card = h.hand.find(c => c.n === a.n);
        if (!card) continue;
        markChosen(a.n);
        await wait(380);
        await showStage(h, card.c, a.target, gid);
        AI.apply(s, a);
        renderAll();
        await playEvents(gid);
        await wait(300);
      } else if (a.type === 'move') {
        AI.apply(s, a);
        renderAll();
        await wait(520);
      } else {
        AI.apply(s, a);
        renderAll();
        await playEvents(gid);
        if (a.type === 'discard') await wait(250);
      }
    }
    await wait(250);
  }
  function markChosen(n) { const c = $(`#ab-hand .card[data-n="${n}"]`); if (c) c.classList.add('chosen'); }

  /* ---------- Human turn ---------- */
  function humanTurn(h, gid) {
    return new Promise(res => {
      UI.endTurnResolve = () => { UI.endTurnResolve = null; res(); };
      UI.targeting = null;
      renderAll();
      if (h.sp > 0 && E.learnable(h).length || h.talentPending.length) openSkills(h);
    });
  }
  function isHumanTurn() { const s = UI.s; const h = s && E.cur(s); return !!(h && humanTeam(h.team) && UI.endTurnResolve && !UI.busy); }
  function endHumanTurn() { if (UI.endTurnResolve) { UI.targeting = null; UI.endTurnResolve(); } }
  async function afterHumanAction() {
    const s = UI.s;
    renderAll();
    await playEvents(UI.gameId);
    const h = E.cur(s);
    if (!h || s.over) { endHumanTurn(); return; }
    if (h.dead) { await wait(400); endHumanTurn(); return; }
    renderAll();
    if (s.turn.cards <= 0 && E.moveOptions(s, h).length === 0) { await wait(500); if (E.cur(s) === h) endHumanTurn(); }
  }
  async function humanPlay(n, target) {
    const s = UI.s, h = E.cur(s);
    const card = h.hand.find(c => c.n === n);
    if (!card) return;
    UI.busy = true; UI.targeting = null; renderAll();
    await showStage(h, card.c, target, UI.gameId, 0.65);
    const ok = E.play(s, n, target);
    UI.busy = false;
    if (!ok) toast('Нельзя сыграть эту карту');
    await afterHumanAction();
  }
  function onCardClick(n, el) {
    if (!isHumanTurn()) return;
    const s = UI.s, h = E.cur(s);
    const card = h.hand.find(c => c.n === n);
    if (!card) return;
    if (UI.targeting && UI.targeting.n === n) { UI.targeting = null; renderAll(); return; }
    const why = E.whyNot(s, h, card);
    if (why) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); toast(why); return; }
    const def = E.cardDef(card);
    const targets = E.targets(s, h, def);
    if (def.tg === 'none') { humanPlay(n, null); return; }
    if (targets.length === 1 && (def.tg.startsWith('enemy') || def.tg.startsWith('ally'))) { humanPlay(n, targets[0]); return; }
    UI.targeting = { n, def, targets };
    renderAll();
  }
  function tryTarget(t) {
    if (!UI.targeting || !isHumanTurn()) return false;
    if (!UI.targeting.targets.includes(t)) return false;
    humanPlay(UI.targeting.n, t);
    return true;
  }
  async function onZoneClick(z) {
    if (!isHumanTurn()) return;
    if (UI.targeting) { tryTarget(z); return; }
    const s = UI.s;
    if (E.move(s, z)) { renderAll(); await wait(300); await afterHumanAction(); }
  }
  function onHeroClick(uid) {
    if (UI.targeting) { if (tryTarget(uid)) return; }
    openInspector(UI.s.heroes[uid]);
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const top = $$('#modal-root .modal-back').pop();
    if (top && top.querySelector('.close')) { top.close(); return; }
    if (UI.targeting) { UI.targeting = null; renderAll(); }
  });
  document.addEventListener('contextmenu', e => { if (UI.targeting && e.target.closest('#screen-game')) { e.preventDefault(); UI.targeting = null; renderAll(); } });

  let toastTimer;
  function toast(msg) {
    const hnt = $('#target-hint');
    hnt.textContent = msg; hnt.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (!UI.targeting) hnt.classList.remove('show'); }, 1600);
  }

  /* ================= Map ================= */
  function buildMap() {
    const svg = $('#map-svg');
    const Z = D.ZONES;
    const lanePaths = {
      top: `M10,90 L12,12 L90,10`,
      mid: `M10,90 L90,10`,
      bot: `M10,90 L88,88 L90,10`,
    };
    let h = `<defs>
      <linearGradient id="river" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a6c8a"/><stop offset="1" stop-color="#1e4f6a"/></linearGradient>
      <radialGradient id="forest"><stop offset="0" stop-color="#173a17" stop-opacity=".95"/><stop offset="1" stop-color="#173a17" stop-opacity="0"/></radialGradient>
      <radialGradient id="forestD"><stop offset="0" stop-color="#2e1f1a" stop-opacity=".95"/><stop offset="1" stop-color="#2e1f1a" stop-opacity="0"/></radialGradient>
      <pattern id="trees" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".9" fill="#0f2b12" opacity=".8"/></pattern>
      <pattern id="treesD" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".9" fill="#2b120e" opacity=".8"/></pattern>
    </defs>`;
    // forests
    const forest = (x, y, r, dire) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${dire ? 'forestD' : 'forest'})"/><circle cx="${x}" cy="${y}" r="${r * 0.7}" fill="url(#${dire ? 'treesD' : 'trees'})" opacity=".6"/>`;
    h += forest(30, 62, 13, 0) + forest(70, 80, 10, 0) + forest(58, 73, 12, 0) + forest(22, 45, 9, 0) + forest(48, 90, 7, 0);
    h += forest(70, 38, 13, 1) + forest(30, 20, 10, 1) + forest(42, 27, 12, 1) + forest(78, 55, 9, 1) + forest(52, 10, 7, 1);
    // river
    h += `<path d="M-2,4 C10,14 18,22 30,32 S45,48 52,54 S70,70 80,82 S95,98 102,96" stroke="url(#river)" stroke-width="5.5" fill="none" opacity=".85" stroke-linecap="round"/>`;
    h += `<path d="M-2,4 C10,14 18,22 30,32 S45,48 52,54 S70,70 80,82 S95,98 102,96" stroke="#7fc6e6" stroke-width=".4" fill="none" opacity=".5" stroke-dasharray="2 3"/>`;
    // lanes
    for (const l of D.LANES) {
      h += `<path d="${lanePaths[l]}" stroke="#1c1712" stroke-width="4.2" fill="none" opacity=".55" stroke-linejoin="round"/>`;
      h += `<path d="${lanePaths[l]}" stroke="#8a7350" stroke-width="2.6" fill="none" opacity=".75" stroke-linejoin="round"/>`;
      h += `<path d="${lanePaths[l]}" stroke="#c8b087" stroke-width=".35" fill="none" opacity=".5" stroke-dasharray="1 1.5"/>`;
    }
    // bases
    h += `<rect x="0" y="76" width="24" height="24" rx="4" fill="#4fd38a" opacity=".13"/><rect x="76" y="0" width="24" height="24" rx="4" fill="#e3534a" opacity=".15"/>`;
    // adjacency
    const seen = new Set();
    for (const a in D.ADJ) for (const b of D.ADJ[a]) {
      const k = [a, b].sort().join('-');
      if (seen.has(k)) continue; seen.add(k);
      h += `<line x1="${Z[a].x}" y1="${Z[a].y}" x2="${Z[b].x}" y2="${Z[b].y}" stroke="#f3e2b0" stroke-width=".28" stroke-dasharray=".9 1.1" opacity=".55"/>`;
    }
    svg.innerHTML = h;
    // zones
    $('#map-zones').innerHTML = Object.entries(Z).map(([id, z]) =>
      `<div class="zone ${z.type === 'base' ? 'base' + z.team : ''}" data-zone="${id}" style="left:${z.x}%;top:${z.y}%" data-tip="<div class='tt-t'>${z.name}</div>${zoneTip(id)}"><div class="zlabel">${z.short}</div></div>`).join('');
    // tokens
    $('#map-tokens').innerHTML = UI.s.heroes.map(h => `<div class="token t${h.team}" data-uid="${h.uid}">${portrait(h.id)}<div class="thp"><div></div></div><div class="tlvl">1</div><div class="tst"></div></div>`).join('');
  }
  function zoneTip(id) {
    const z = D.ZONES[id];
    if (z.type === 'base') return 'Фонтан: +35% здоровья и маны в начале хода. Враги сюда не войдут.';
    if (z.type === 'lane') return 'Линия: фарм крипов, натиск на башни, опыт в конце раунда.';
    if (z.type === 'jungle') return 'Лес: безопасный фарм (во вражеском лесу — богаче, но опаснее).';
    return 'Логово Рошана: атакуйте его, чтобы получить Эгиду.';
  }
  function tokenPositions() {
    const s = UI.s;
    const pos = {};
    for (const zid in D.ZONES) {
      const z = D.ZONES[zid];
      const here = s.heroes.filter(h => !h.dead && h.zone === zid);
      const t0 = here.filter(h => h.team === 0), t1 = here.filter(h => h.team === 1);
      const place = (arr, side) => arr.forEach((h, k) => {
        if (side === 0) { // centered grid of 3
          const n = arr.length, cols = Math.min(3, n), rows = Math.ceil(n / 3);
          const c = k % 3, r = Math.floor(k / 3);
          const inRow = r === rows - 1 ? n - r * 3 : cols;
          pos[h.uid] = [z.x + (c - (inRow - 1) / 2) * 5.2, z.y - 1.5 + (r - (rows - 1) / 2) * 5.6];
        } else {
          const c = k % 2, r = Math.floor(k / 2), rows = Math.ceil(arr.length / 2);
          pos[h.uid] = [z.x + side * (3.2 + c * 5), z.y - 1.5 + (r - (rows - 1) / 2) * 5.4];
        }
      });
      if (t0.length && t1.length) { place(t0, -1); place(t1, 1); }
      else place(t0.length ? t0 : t1, 0);
    }
    return pos;
  }

  function renderMap() {
    const s = UI.s;
    const cur = E.cur(s);
    const human = isHumanTurn();
    const tg = UI.targeting;
    // zones
    const movable = human && !tg ? E.moveOptions(s, cur) : [];
    $$('#map-zones .zone').forEach(z => {
      const id = z.dataset.zone;
      z.classList.toggle('movable', movable.includes(id));
      z.classList.toggle('ztarget', !!(tg && tg.targets.includes(id)));
      z.classList.toggle('cur', !!(cur && cur.zone === id));
    });
    // structures
    let h = '';
    for (const lane of D.LANES) for (const t of [0, 1]) for (let i = 0; i < 3; i++) {
      const [x, y] = D.TOWER_POS[lane][t][i];
      const hp = s.towers[lane][t][i], max = D.C.TOWER_HP[i];
      h += `<div class="struct t${t} ${hp <= 0 ? 'down' : ''}" id="tw-${lane}-${t}-${i}" style="left:${x}%;top:${y}%" data-tip="<div class='tt-t'>Башня ${['I', 'II', 'III'][i]} · ${D.TEAMS[t].short}</div>${hp > 0 ? `${hp} / ${max} прочности<br>Ответный удар: ${D.C.TOWER_DMG[i]}` : 'Разрушена'}"><div class="ico">${hp > 0 ? '🗼' : '🪨'}</div><div class="shp"><div style="width:${hp / max * 100}%"></div></div></div>`;
    }
    for (const t of [0, 1]) {
      const z = D.ZONES[D.TEAMS[t].base];
      const hp = s.ancient[t];
      h += `<div class="struct ancient t${t}" id="anc-${t}" style="left:${z.x + (t ? 3 : -3)}%;top:${z.y + (t ? -2 : 2)}%" data-tip="<div class='tt-t'>Древний · ${D.TEAMS[t].name}</div>${hp} / ${D.C.ANCIENT_HP}"><div class="ico">${t ? '🔥' : '🌳'}</div><div class="shp"><div style="width:${hp / D.C.ANCIENT_HP * 100}%"></div></div></div>`;
    }
    const rz = D.ZONES.roshan, r = s.rosh;
    const roshT = !!(tg && tg.targets.includes('rosh'));
    h += `<div class="struct rosh ${r.alive ? '' : 'down'} ${roshT ? 'targetable' : ''}" id="rosh" style="left:${rz.x}%;top:${rz.y - 7}%" data-tip="<div class='tt-t'>Рошан</div>${r.alive ? `${Math.max(0, r.hp)} / ${r.max} здоровья. Каждая атака по нему вызывает ответный удар (${40 + 4 * s.round}).` : `Возродится на раунде ${r.respawn}`}"><div class="ico">🐲</div>${r.alive ? `<div class="shp"><div style="width:${Math.max(0, r.hp) / r.max * 100}%"></div></div>` : `<div class="timer">⏳${r.respawn - s.round}</div>`}</div>`;
    $('#map-structs').innerHTML = h;
    // tokens
    const pos = tokenPositions();
    for (const hero of s.heroes) {
      const el = $(`#map-tokens .token[data-uid="${hero.uid}"]`);
      if (!el) continue;
      const p = pos[hero.uid];
      if (p) { el.style.left = p[0] + '%'; el.style.top = p[1] + '%'; }
      const st = E.st(s, hero);
      el.classList.toggle('dead', hero.dead);
      el.classList.toggle('active', !!(cur && cur.uid === hero.uid));
      el.classList.toggle('invis', E.has(hero, 'invis'));
      el.classList.toggle('stunned', E.has(hero, 'stun') || E.has(hero, 'hex'));
      const isT = !!(tg && tg.targets.includes(hero.uid));
      el.classList.toggle('targetable', isT);
      el.classList.toggle('ally', isT && hero.team === cur.team);
      el.querySelector('.thp div').style.width = (hero.hp / st.maxHp * 100) + '%';
      el.querySelector('.tlvl').textContent = hero.level;
      el.querySelector('.tst').textContent = hero.aegis ? '🛡️' : (E.has(hero, 'stun') ? '💫' : E.has(hero, 'hex') ? '🐸' : E.has(hero, 'root') ? '⛓️' : '');
      el.setAttribute('data-tip', heroTip(hero));
    }
  }
  function heroTip(h) {
    const s = UI.s, st = E.st(s, h);
    const sts = h.st.map(x => `${D.STATUS[x.t].icon} ${D.STATUS[x.t].name}${x.v && x.t !== 'stun' ? ` (${x.t === 'dmgPct' || x.t === 'evasion' || x.t === 'mres' ? Math.round(x.v * 100) + '%' : Math.round(x.v)})` : ''} · ${x.n + (x.f ? 1 : 0)} х.`).join('<br>');
    return `<div class='tt-t'>${D.HEROES[h.id].name} · ур. ${h.level}</div>❤ ${Math.round(h.hp)}/${st.maxHp} · 💧 ${Math.round(h.mana)}/${st.maxMana}<br>⚔ ${Math.round(st.atk)} ×${st.asMult.toFixed(2)} · 🛡 ${st.armor.toFixed(1)} · 🔮 ${Math.round(st.mres * 100)}%${sts ? '<br>' + sts : ''}`;
  }

  /* ================= Panels ================= */
  function renderTiles() {
    const s = UI.s, cur = E.cur(s), tg = UI.targeting;
    for (const t of [0, 1]) {
      $('#tiles-' + t).innerHTML = s.heroes.filter(h => h.team === t).map(h => {
        const st = E.st(s, h);
        const hpP = h.hp / st.maxHp * 100;
        const isT = !!(tg && tg.targets.includes(h.uid));
        const sts = h.st.filter(x => ['stun', 'hex', 'root', 'silence', 'dot', 'immune', 'invis', 'grave', 'shield'].includes(x.t)).map(x => `<span title="${D.STATUS[x.t].name}">${D.STATUS[x.t].icon}</span>`).join('');
        return `<div class="tile t${t} ${h.dead ? 'dead' : ''} ${cur && cur.uid === h.uid ? 'active' : ''} ${isT ? 'targetable' + (h.team === cur.team ? ' ally' : '') : ''}" data-uid="${h.uid}" data-tip="${heroTip(h)}">
          ${portrait(h.id)}<div class="lvl">${h.level}</div>${h.aegis ? '<div class="aegis" title="Эгида">🛡️</div>' : ''}<div class="dead-tag">${h.dead ? h.respawn : ''}</div>
          <div><div class="tname"><b>${D.HEROES[h.id].name}</b><span class="kda">${h.k}/${h.d}/${h.a}</span></div>
          <div class="bar hp ${hpP < 30 ? 'low' : ''}"><div style="width:${hpP}%"></div><span>${Math.round(h.hp)}</span></div>
          <div class="bar mp"><div style="width:${h.mana / st.maxMana * 100}%"></div></div>
          <div class="row2"><span class="gold">${h.gold}</span><span class="items-mini">${h.items.map(i => `<span title="${D.ITEMS[i].name}">${D.ITEMS[i].icon}</span>`).join('')}</span></div></div>
          <div class="sts">${sts}</div></div>`;
      }).join('');
    }
  }
  function renderTop() {
    const s = UI.s;
    $('#score-0').textContent = s.score[0];
    $('#score-1').textContent = s.score[1];
    $('#tb-round').textContent = `Раунд ${s.round}`;
    const nw = [0, 1].map(t => s.heroes.filter(h => h.team === t).reduce((a, h) => a + E.netWorth(h), 0));
    const diff = nw[0] - nw[1];
    $('#tb-nw').innerHTML = diff === 0 ? 'Равенство по золоту' : `Преимущество <span class="up${diff > 0 ? 0 : 1}">${D.TEAMS[diff > 0 ? 0 : 1].short}: +${fmtK(Math.abs(diff))}</span> золота`;
  }
  function renderObjectives() {
    const s = UI.s;
    const r = s.rosh;
    let h = `<div class="obj-row"><span class="lab">🐲 Рошан</span><span>${r.alive ? `${Math.max(0, r.hp)} / ${r.max}` : `возрождение: раунд ${r.respawn}`}</span></div>`;
    for (const lane of D.LANES) {
      h += `<div class="obj-row"><span class="tw-dots">${[2, 1, 0].map(i => `<i class="t0 ${s.towers[lane][0][i] <= 0 ? 'down' : ''}"></i>`).join('')}</span><span class="lab">${D.ZONES[lane].short}</span><span class="tw-dots">${[0, 1, 2].map(i => `<i class="t1 ${s.towers[lane][1][i] <= 0 ? 'down' : ''}"></i>`).join('')}</span></div>`;
    }
    h += `<div class="obj-row"><span style="color:var(--rad)">🌳 ${s.ancient[0]}</span><span class="lab">Древние</span><span style="color:var(--dire)">${s.ancient[1]} 🔥</span></div>`;
    $('#objectives').innerHTML = `<div class="panel-title" style="margin:-8px -10px 2px">Объекты</div>` + h;
  }
  function renderLog() {
    const s = UI.s, box = $('#log');
    if (s.log.length < UI.logLen) UI.logLen = 0;
    const add = s.log.slice(UI.logLen);
    UI.logLen = s.log.length;
    if (!add.length) return;
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    for (const l of add) {
      const d = document.createElement('div');
      d.className = l.cls;
      d.innerHTML = `<span class="rd">${l.r}</span>${esc(l.msg)}`;
      box.appendChild(d);
    }
    while (box.children.length > 250) box.firstChild.remove();
    if (atBottom || add.length) box.scrollTop = box.scrollHeight;
  }

  function renderAction() {
    const s = UI.s;
    const h = E.cur(s);
    const heroBox = $('#ab-hero'), hand = $('#ab-hand'), btns = $('#ab-buttons');
    if (!h) { heroBox.innerHTML = ''; hand.innerHTML = ''; btns.innerHTML = ''; return; }
    const st = E.st(s, h), d = D.HEROES[h.id];
    const human = humanTeam(h.team);
    const nextXp = D.XP[h.level] || D.XP[D.XP.length - 1], prevXp = D.XP[h.level - 1] || 0;
    const xpP = h.level >= D.C.MAX_LEVEL ? 100 : (h.xp - prevXp) / (nextXp - prevXp) * 100;
    heroBox.innerHTML = `${portrait(h.id, 't' + h.team)}
      <div><div class="abh-who t${h.team}">${D.TEAMS[h.team].name} · ${human ? 'ваш ход' : 'ход ИИ'}</div>
      <div class="abh-name">${d.name}</div><div class="abh-sub">Уровень ${h.level} · ${D.ZONES[h.zone].name}</div>
      <div class="bar hp"><div style="width:${h.hp / st.maxHp * 100}%"></div><span>${Math.round(h.hp)} / ${st.maxHp}</span></div>
      <div class="bar mp"><div style="width:${h.mana / st.maxMana * 100}%"></div><span>${Math.round(h.mana)} / ${st.maxMana}</span></div>
      <div class="bar xp" title="Опыт: ${h.xp} / ${nextXp}"><div style="width:${xpP}%"></div></div>
      <div class="abh-stats"><span>⚔ <b>${Math.round(st.atk)}</b></span><span>🛡 <b>${st.armor.toFixed(1)}</b></span><span class="gold">${h.gold}</span>
      <span style="color:var(--str)">СИЛ <b>${Math.round(st.str)}</b></span><span style="color:var(--agi)">ЛОВ <b>${Math.round(st.agi)}</b></span><span style="color:var(--int)">ИНТ <b>${Math.round(st.int)}</b></span></div></div>
      <div class="abh-turn">${s.turn ? `<span class="pill ${s.turn.moves > 0 && !E.has(h, 'root') ? 'on' : 'off'}">👣 ход ${E.has(h, 'root') ? '⛓️' : s.turn.moves}</span><span class="pill ${s.turn.cards > 0 ? 'on' : 'off'}">🃏 карт ${s.turn.cards}</span><span class="pill ${s.turn.discards > 0 ? 'on' : 'off'}">♻ ${s.turn.discards}</span>` : ''}</div>
      <div class="abh-items">${Array.from({ length: 6 }, (_, i) => h.items[i] ? `<span data-tip="<div class='tt-t'>${D.ITEMS[h.items[i]].name}</div>${D.ITEMS[h.items[i]].desc}">${D.ITEMS[h.items[i]].icon}</span>` : '<span class="empty">·</span>').join('')}</div>`;
    // hand
    const showFace = human || UI.mode === 'watch' || UI.mode === 'hotseat';
    hand.classList.toggle('readonly', !human);
    const canAct = human && isHumanTurn();
    if (!showFace) {
      hand.innerHTML = h.hand.map(() => `<div class="card kind-basic"><div class="card-inner" style="display:grid;place-items:center;background:repeating-linear-gradient(45deg,#1a1f27,#1a1f27 6px,#141820 6px,#141820 12px)"><div style="font-family:var(--f-title);font-size:28px;color:var(--gold)">D</div></div></div>`).join('');
    } else {
      hand.innerHTML = h.hand.length ? h.hand.map(c => {
        let cls = '';
        if (canAct) cls = E.canPlay(s, h, c) ? 'playable' : 'unplayable';
        if (UI.targeting && UI.targeting.n === c.n) cls += ' selected';
        if (UI.prevHand && !UI.prevHand.has(c.n)) cls += ' drawn';
        return cardHTML(c.c, { h, n: c.n, cls, discard: canAct && s.turn && s.turn.discards > 0 });
      }).join('') : '<div class="hand-empty">Рука пуста</div>';
    }
    UI.prevHand = new Set(h.hand.map(c => c.n));
    // buttons
    if (human) {
      const sp = h.sp > 0 && E.learnable(h).length ? h.sp : 0;
      const tal = h.talentPending.length;
      btns.innerHTML = `<button class="btn btn-gold" id="b-end" ${canAct ? '' : 'disabled'}>Завершить ход</button>
        <button class="btn btn-dark" id="b-shop" ${canAct ? '' : 'disabled'}>🛒 Магазин</button>
        <button class="btn btn-dark" id="b-skills" ${canAct ? '' : 'disabled'}>⬆ Способности${sp + tal ? `<span class="badge">${sp + tal}</span>` : ''}</button>
        <button class="btn btn-dark" id="b-auto" ${canAct ? '' : 'disabled'} title="Пусть ИИ сходит за этого героя">🤖 Автоход</button>
        <div class="ab-deck" id="b-deck">Колода: ${h.deck.length} · Сброс: ${h.discard.length}</div>`;
      $('#b-end').onclick = () => { if (isHumanTurn()) endHumanTurn(); };
      $('#b-shop').onclick = () => isHumanTurn() && openShop(h);
      $('#b-skills').onclick = () => isHumanTurn() && openSkills(h);
      $('#b-auto').onclick = () => isHumanTurn() && autoTurn(h);
    } else {
      btns.innerHTML = `<div class="ab-wait">ИИ обдумывает ход…</div><div class="ab-deck" id="b-deck">Колода: ${h.deck.length} · Сброс: ${h.discard.length}</div>`;
    }
    $('#b-deck').onclick = () => openDeck(h);
    // targeting hint
    const hint = $('#target-hint');
    if (UI.targeting) {
      const tgName = { enemy: 'врага в своей зоне', enemyOrRosh: 'врага (или Рошана)', enemyNear: 'врага рядом', enemyAny: 'врага', ally: 'союзника', allyNear: 'союзника рядом', zoneAdj: 'соседнюю зону', zoneAdjOrSame: 'зону', zone2: 'зону (до 2 шагов)', zoneTP: 'место телепорта' }[UI.targeting.def.tg] || 'цель';
      hint.textContent = `«${UI.targeting.def.name}»: выберите ${tgName} · ПКМ/Esc — отмена`;
      hint.classList.add('show');
    } else if (!toastTimer || true) { if (hint.dataset.keep !== '1') hint.classList.remove('show'); }
  }
  async function autoTurn(h) {
    UI.busy = true;
    const s = UI.s;
    const acts = AI.decide(s, {});
    for (const a of acts) {
      if (s.over || E.cur(s) !== h || a.type === 'end') break;
      if (h.dead) break;
      if (a.type === 'play') { const card = h.hand.find(c => c.n === a.n); if (card) await showStage(h, card.c, a.target, UI.gameId, 0.7); }
      AI.apply(s, a);
      renderAll();
      await playEvents(UI.gameId);
      await wait(250);
    }
    UI.busy = false;
    endHumanTurn();
  }

  function renderAll() {
    if (!UI.s) return;
    renderTop();
    renderTiles();
    renderMap();
    renderObjectives();
    renderAction();
    renderLog();
  }

  // delegated game clicks
  $('#screen-game').addEventListener('click', e => {
    if (!UI.s) return;
    const dbtn = e.target.closest('.discard-btn');
    if (dbtn) {
      e.stopPropagation();
      if (!isHumanTurn()) return;
      const n = +dbtn.closest('.card').dataset.n;
      if (E.discard(UI.s, n)) { UI.targeting = null; renderAll(); }
      return;
    }
    const card = e.target.closest('#ab-hand .card[data-n]');
    if (card) { onCardClick(+card.dataset.n, card); return; }
    const tok = e.target.closest('.token, .tile');
    if (tok) { onHeroClick(+tok.dataset.uid); return; }
    if (e.target.closest('#rosh')) { tryTarget('rosh'); return; }
    const z = e.target.closest('.zone');
    if (z) { onZoneClick(z.dataset.zone); return; }
  });

  /* ================= Effects ================= */
  function posOf(uid) {
    if (uid === 'rosh') { const z = D.ZONES.roshan; return [z.x, z.y - 7]; }
    const el = $(`#map-tokens .token[data-uid="${uid}"]`);
    if (!el || !el.style.left) return null;
    return [parseFloat(el.style.left), parseFloat(el.style.top)];
  }
  function floatText(uid, text, cls, jitter = true) {
    const p = posOf(uid);
    if (!p) return;
    const f = document.createElement('div');
    f.className = 'float ' + cls;
    f.textContent = text;
    f.style.left = (p[0] + (jitter ? (Math.random() - 0.5) * 4 : 0)) + '%';
    f.style.top = (p[1] - 3) + '%';
    $('#map-fx').appendChild(f);
    setTimeout(() => f.remove(), 1500 / Math.max(1, UI.speed) + 100);
  }
  function burst(uid, cls) {
    const p = posOf(uid);
    if (!p) return;
    const b = document.createElement('div');
    b.className = 'burst ' + cls;
    b.style.left = p[0] + '%'; b.style.top = p[1] + '%';
    $('#map-fx').appendChild(b);
    setTimeout(() => b.remove(), 700 / Math.max(1, UI.speed) + 100);
  }
  function banner(text, team) {
    const b = $('#banner');
    b.className = 'banner';
    b.innerHTML = `<span>${esc(text)}</span>`;
    void b.offsetWidth;
    b.className = 'banner show' + (team !== undefined ? ' t' + team : '');
  }
  async function playEvents(gid) {
    const s = UI.s;
    if (!s) return;
    const evs = s.events.splice(0);
    let bannerWait = 0;
    for (const ev of evs) {
      if (gid !== UI.gameId) return;
      switch (ev.type) {
        case 'dmg': floatText(ev.uid, '-' + ev.amount, ev.dtype); burst(ev.uid, ev.dtype); await wait(70); break;
        case 'heal': floatText(ev.uid, '+' + ev.amount, 'heal'); burst(ev.uid, 'heal'); break;
        case 'gold': floatText(ev.uid, '+' + ev.amount + ' ◉', 'gold', false); break;
        case 'miss': floatText(ev.uid, 'промах', 'miss'); break;
        case 'crit': floatText(ev.uid, 'КРИТ ×' + ev.mult.toFixed(1), 'crit'); break;
        case 'proc': floatText(ev.uid, ev.text, 'proc', false); await wait(120); break;
        case 'status': floatText(ev.uid, ev.text, 'status'); break;
        case 'level': floatText(ev.uid, '★ ' + ev.level + ' ур.', 'level', false); break;
        case 'death': burst(ev.uid, 'death'); floatText(ev.uid, '☠', 'crit', false); await wait(250); break;
        case 'buy': floatText(ev.uid, D.ITEMS[ev.item].icon, 'proc', false); break;
        case 'skip': floatText(ev.uid, 'пропуск хода', 'status', false); await wait(300); break;
        case 'tower': case 'towerDown': {
          const el = $(`#tw-${ev.lane}-${ev.team}-${ev.tier}`);
          if (el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
          if (ev.type === 'towerDown') { banner('Башня разрушена', 1 - ev.team); bannerWait = 900; }
          break;
        }
        case 'ancient': { const el = $('#anc-' + ev.team); if (el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); } break; }
        case 'banner': banner(ev.text, ev.team); bannerWait = 1100; break;
        case 'round': banner(`Раунд ${ev.round}`); bannerWait = 700; break;
        case 'win': banner(D.TEAMS[ev.team].name + ' побеждают!', ev.team); bannerWait = 1600; break;
      }
    }
    renderAll();
    if (bannerWait) await wait(bannerWait);
  }

  async function showStage(h, cardId, target, gid, mult = 1) {
    const st = $('#stage');
    let tgt = '';
    if (target === 'rosh') tgt = `<div class="stage-arrow">➜</div><div class="stage-caster"><div style="font-size:70px">🐲</div><div class="sn">Рошан</div></div>`;
    else if (typeof target === 'number') { const t = UI.s.heroes[target]; tgt = `<div class="stage-arrow">➜</div><div class="stage-caster">${portrait(t.id)}<div class="sn" style="color:${t.team ? 'var(--dire)' : 'var(--rad)'}">${D.HEROES[t.id].name}</div></div>`; }
    else if (typeof target === 'string') tgt = `<div class="stage-arrow">➜</div><div class="stage-caster"><div style="font-size:54px">📍</div><div class="sn">${D.ZONES[target].short}</div></div>`;
    st.innerHTML = `<div class="stage-inner"><div class="stage-caster">${portrait(h.id)}<div class="sn" style="color:${h.team ? 'var(--dire)' : 'var(--rad)'}">${D.HEROES[h.id].name}</div></div>${cardHTML(cardId, { h, cls: 'big' })}${tgt}</div>`;
    await wait(1000 * mult);
    if (gid !== UI.gameId) { st.innerHTML = ''; return; }
    const inner = st.querySelector('.stage-inner');
    if (inner) inner.classList.add('out');
    await wait(260);
    st.innerHTML = '';
  }

  /* ================= Modals ================= */
  function openShop(h) {
    const s = UI.s;
    const render = () => {
      const build = D.HEROES[h.id].build;
      return `<div class="shop-head"><h2 style="margin:0">Магазин · ${D.HEROES[h.id].name}</h2><span class="gold" style="font-size:20px">${h.gold}</span></div>
        <p style="margin:0 0 10px;color:var(--muted);font-size:13px">Предметы со значком 🃏 добавляют в колоду карту. Слотов: ${h.items.length} / ${D.C.MAX_ITEMS}. ★ — рекомендовано для героя.</p>
        <div class="shop-grid">${D.ITEM_ORDER.map(id => {
          const it = D.ITEMS[id];
          const owned = h.items.includes(id);
          const can = E.canBuy(s, h, id);
          const cost = E.itemCost(h, id);
          return `<div class="shop-item ${owned ? 'owned' : can ? '' : 'cant'}" data-item="${id}"><div class="si-ico">${it.icon}</div>
            <div><div class="si-name">${build.includes(id) ? '★ ' : ''}${it.name}</div><div class="si-cost">${owned ? 'куплено' : cost + ' золота'}</div>
            <div class="si-desc">${it.desc}</div>${it.cardId ? `<div class="si-card" data-tip="${esc(cardHTML(it.cardId, { cls: 'mini' }))}">🃏 карта «${D.CARDS[it.cardId].name}»</div>` : ''}</div></div>`;
        }).join('')}</div>`;
    };
    const m = modal(render());
    const mod = m.querySelector('.modal');
    mod.addEventListener('click', e => {
      const it = e.target.closest('.shop-item');
      if (!it || !isHumanTurn()) return;
      if (E.buy(s, h, it.dataset.item)) {
        mod.innerHTML = '<button class="close">×</button>' + render();
        mod.querySelector('.close').onclick = () => m.close();
        renderAll(); playEvents(UI.gameId);
      }
    });
  }
  function openSkills(h) {
    const s = UI.s;
    const m = modal('', { cls: 'skills' });
    const mod = m.querySelector('.modal');
    const render = () => {
      const tal = h.talentPending[0];
      mod.innerHTML = `<button class="close">×</button><h2>Способности · ${D.HEROES[h.id].name}</h2>
        <p style="color:var(--muted);margin-top:0">Очков способностей: <b>${h.sp}</b>. Ультимейт открывается на 6, 12 и 18 уровне; обычная способность — не выше половины уровня героя.</p>
        <div class="skills-grid">${['q', 'w', 'e', 'r'].map(k => `<div class="skill-pick">${skillCardHTML(h.id, k, h.skills[k], '')}<button class="btn ${E.canLearn(h, k) ? 'btn-gold' : 'btn-dark'}" data-learn="${k}" ${E.canLearn(h, k) ? '' : 'disabled'}>${h.skills[k] ? 'Улучшить' : 'Изучить'} (${h.skills[k]}/${D.HEROES[h.id].skills[k].max})</button></div>`).join('')}</div>
        ${tal ? `<h3 style="text-align:center">Талант ${tal} уровня</h3><div class="talents">${D.TALENTS[tal].map(t => `<button class="btn btn-dark" data-talent="${t.id}">🌟 ${t.name}</button>`).join('')}</div>` : ''}
        ${h.talents.length ? `<p style="text-align:center;color:var(--muted)">Таланты: ${h.talents.map(id => Object.values(D.TALENTS).flat().find(t => t.id === id).name).join(', ')}</p>` : ''}`;
      mod.querySelector('.close').onclick = () => m.close();
    };
    render();
    mod.addEventListener('click', e => {
      const b = e.target.closest('[data-learn]');
      const t = e.target.closest('[data-talent]');
      if (b && E.learn(s, h, b.dataset.learn)) { render(); renderAll(); if (!h.sp && !h.talentPending.length) setTimeout(() => m.close(), 350); }
      if (t && E.chooseTalent(s, h, t.dataset.talent)) { render(); renderAll(); if (!h.sp && !h.talentPending.length) setTimeout(() => m.close(), 350); }
    });
  }
  function openDeck(h) {
    const group = arr => { const m = {}; arr.forEach(c => m[c.c] = (m[c.c] || 0) + 1); return m; };
    const show = (title, arr) => {
      const g = group(arr);
      return `<h3>${title} (${arr.length})</h3><div class="deck-list">${Object.entries(g).map(([c, n]) => `<div style="position:relative">${cardHTML(c, { h, cls: 'mini' })}<div style="position:absolute;right:-4px;top:-6px" class="attr-dot attr-uni">×${n}</div></div>`).join('') || '<i>пусто</i>'}</div>`;
    };
    const showHand = humanTeam(h.team) || UI.mode === 'watch';
    modal(`<h2>Колода · ${D.HEROES[h.id].name}</h2>${showHand ? show('В руке', h.hand) : ''}${show('Колода (порядок скрыт)', h.deck)}${show('Сброс', h.discard)}`);
  }
  function openInspector(h) {
    const s = UI.s, st = E.st(s, h), d = D.HEROES[h.id];
    const learned = ['q', 'w', 'e', 'r'];
    modal(`<div class="insp-head">${portrait(h.id)}<div style="flex:1"><div class="dd-name">${d.name} <span style="font-size:16px;color:var(--muted)">ур. ${h.level}</span></div>
      <div class="dd-title" style="color:${h.team ? 'var(--dire)' : 'var(--rad)'}">${D.TEAMS[h.team].name} · ${d.title}${h.dead ? ' · ☠ мёртв (' + h.respawn + ' р.)' : ' · ' + D.ZONES[h.zone].name}</div>
      <div class="insp-stats">
        <div><span>Здоровье</span>${Math.round(h.hp)} / ${st.maxHp}</div><div><span>Мана</span>${Math.round(h.mana)} / ${st.maxMana}</div>
        <div><span>Урон атаки</span>${Math.round(st.atk)} ×${st.asMult.toFixed(2)}</div><div><span>Броня</span>${st.armor.toFixed(1)}</div>
        <div><span style="color:var(--str)">Сила</span>${Math.round(st.str)}</div><div><span style="color:var(--agi)">Ловкость</span>${Math.round(st.agi)}</div>
        <div><span style="color:var(--int)">Интеллект</span>${Math.round(st.int)}</div><div><span>Сопр. магии</span>${Math.round(st.mres * 100)}%</div>
        <div><span>Уклонение</span>${Math.round(st.evasion * 100)}%</div><div><span>Усил. заклинаний</span>${(st.amp * 100).toFixed(1)}%</div>
        <div><span>Золото / ценность</span>${h.gold} / ${E.netWorth(h)}</div><div><span>У/С/П</span>${h.k} / ${h.d} / ${h.a}</div>
      </div>
      <div class="abh-items" style="margin-top:8px">${h.items.map(i => `<span data-tip="<div class='tt-t'>${D.ITEMS[i].name}</div>${D.ITEMS[i].desc}">${D.ITEMS[i].icon}</span>`).join('') || '<i>Нет предметов</i>'}</div>
      </div></div>
      <div class="dd-section">Способности</div><div class="skills-grid">${learned.map(k => skillCardHTML(h.id, k, h.skills[k], 'mini')).join('')}</div>`);
  }
  function showGameOver() {
    const s = UI.s;
    const w = s.winner;
    const mvp = s.heroes.slice().sort((a, b) => (b.k * 3 + b.a + b.dmgDealt / 1500 + b.towerDmg / 800 - b.d) - (a.k * 3 + a.a + a.dmgDealt / 1500 + a.towerDmg / 800 - a.d))[0];
    const table = t => `<div class="team-h t${t}">${D.TEAMS[t].name}${t === w ? ' — победа' : ''}</div><table class="result-table"><tr><th>Герой</th><th>Ур.</th><th>У/С/П</th><th>Ценность</th><th>Урон героям</th><th>Урон строениям</th><th>Лечение</th><th>Предметы</th></tr>` +
      s.heroes.filter(h => h.team === t).map(h => `<tr><td class="hn">${portrait(h.id)}${D.HEROES[h.id].name}${h === mvp ? ' <span title="Лучший игрок" style="color:var(--gold-2)">★ MVP</span>' : ''}</td><td>${h.level}</td><td>${h.k}/${h.d}/${h.a}</td><td class="gold">${E.netWorth(h)}</td><td>${h.dmgDealt}</td><td>${h.towerDmg}</td><td>${h.healDone}</td><td>${h.items.map(i => D.ITEMS[i].icon).join(' ')}</td></tr>`).join('') + '</table>';
    const youWon = UI.mode === 'radiant' ? w === 0 : UI.mode === 'dire' ? w === 1 : null;
    const m = modal(`<div class="win-title t${w}">${D.TEAMS[w].name} побеждают!</div>
      ${youWon === null ? '' : `<p style="text-align:center;font-size:18px;margin-top:-6px">${youWon ? '🏆 Ваша команда одержала победу!' : '💀 Ваш Древний пал. Попробуйте ещё раз!'}</p>`}
      <p style="text-align:center;color:var(--muted)">Раундов: ${s.round} · Счёт ${s.score[0]} : ${s.score[1]} · Рошан убит ${s.rosh.kills} раз(а)</p>
      ${table(0)}${table(1)}
      <div class="modal-actions"><button class="btn btn-dark" data-x="menu">Меню</button><button class="btn btn-dark" data-x="draft">Новый выбор героев</button><button class="btn btn-gold" data-x="again">Реванш</button></div>`, { noClose: true });
    m.querySelector('.modal').style.width = 'min(1000px, 96vw)';
    m.querySelector('[data-x=menu]').onclick = () => { m.close(); setScreen('menu'); };
    m.querySelector('[data-x=draft]').onclick = () => { m.close(); openDraft(); };
    m.querySelector('[data-x=again]').onclick = () => { m.close(); startGame(UI.lastTeams[0], UI.lastTeams[1]); };
  }

  // Start on the menu; preselect a random draft for convenience.
  UI.draft.sel = D.HERO_LIST[0];
})();
