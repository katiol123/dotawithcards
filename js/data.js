/* DOTA: Card Wars — game data: zones, heroes, cards, items, talents.
   Card play functions receive ctx = { s, h, t, l, E, card } where
   s — state, h — caster, t — target (hero | 'rosh' | zone id | null), l — skill level, E — engine API. */
(function (G) {
  'use strict';
  const D = G.DWC = G.DWC || {};
  const L = (a, l) => Array.isArray(a) ? a[Math.max(0, Math.min(a.length - 1, (l || 1) - 1))] : a;
  D.L = L;

  D.C = {
    HAND: 5,
    START_GOLD: 600,
    MAX_LEVEL: 20,
    ROUND_CAP: 70,
    PASSIVE_GOLD: 100,
    PASSIVE_XP: 60,
    TOWER_HP: [900, 1300, 1600],
    TOWER_DMG: [70, 90, 110],
    TOWER_ARMOR: 10,
    TOWER_GOLD: [160, 220, 280],
    ANCIENT_HP: 4000,
    ANCIENT_ARMOR: 12,
    ROSH_RESPAWN: 8,
    AEGIS_ROUNDS: 6,
    MAX_ITEMS: 6,
  };

  D.XP = [0, 230, 600, 1080, 1660, 2260, 2980, 3730, 4510, 5320, 6160, 7030, 7930, 9155, 10405, 11680, 12980, 14305, 15805, 17395];

  D.TEAMS = [
    { id: 0, name: 'Силы Света', short: 'Свет', base: 'baseR', jungle: 'jungleR', safe: 'bot', off: 'top', color: '#5fd38a' },
    { id: 1, name: 'Силы Тьмы', short: 'Тьма', base: 'baseD', jungle: 'jungleD', safe: 'top', off: 'bot', color: '#e0524a' },
  ];

  D.ZONES = {
    baseR:   { name: 'База Света',        short: 'База Света', type: 'base',   team: 0, x: 10, y: 90 },
    baseD:   { name: 'База Тьмы',         short: 'База Тьмы',  type: 'base',   team: 1, x: 90, y: 10 },
    top:     { name: 'Верхняя линия',     short: 'Топ',        type: 'lane',   x: 12, y: 12 },
    mid:     { name: 'Центральная линия', short: 'Мид',        type: 'lane',   x: 50, y: 50 },
    bot:     { name: 'Нижняя линия',      short: 'Бот',        type: 'lane',   x: 88, y: 88 },
    jungleR: { name: 'Лес Света',         short: 'Лес Света',  type: 'jungle', team: 0, x: 58, y: 73 },
    jungleD: { name: 'Лес Тьмы',          short: 'Лес Тьмы',   type: 'jungle', team: 1, x: 42, y: 27 },
    roshan:  { name: 'Логово Рошана',     short: 'Рошан',      type: 'roshan', x: 31, y: 36 },
  };
  D.ADJ = {
    baseR: ['top', 'mid', 'bot', 'jungleR'],
    baseD: ['top', 'mid', 'bot', 'jungleD'],
    top: ['baseR', 'baseD', 'jungleD'],
    mid: ['baseR', 'baseD', 'jungleR', 'jungleD', 'roshan'],
    bot: ['baseR', 'baseD', 'jungleR'],
    jungleR: ['baseR', 'mid', 'bot', 'roshan'],
    jungleD: ['baseD', 'mid', 'top', 'roshan'],
    roshan: ['mid', 'jungleR', 'jungleD'],
  };
  D.LANES = ['top', 'mid', 'bot'];
  // tower map positions [team][tier] in % of the map box
  D.TOWER_POS = {
    top: [[[12, 40], [12, 57], [12, 73]], [[40, 12], [57, 12], [73, 12]]],
    mid: [[[41, 59], [32, 68], [23, 77]], [[59, 41], [68, 32], [77, 23]]],
    bot: [[[60, 88], [43, 88], [27, 88]], [[88, 60], [88, 43], [88, 27]]],
  };

  D.ATTR = {
    str: { name: 'Сила', short: 'СИЛ', color: '#e2483d', icon: '✊' },
    agi: { name: 'Ловкость', short: 'ЛОВ', color: '#38c25a', icon: '🏹' },
    int: { name: 'Интеллект', short: 'ИНТ', color: '#3fa2f2', icon: '🔮' },
    uni: { name: 'Универсальный', short: 'УНИ', color: '#d6a43a', icon: '✦' },
  };
  D.ROLES = { carry: 'Керри', mid: 'Мидер', off: 'Хардлейнер', support: 'Поддержка', initiator: 'Инициатор', nuker: 'Нюкер', disabler: 'Контроль', escape: 'Мобильность', pusher: 'Пушер' };

  D.STATUS = {
    stun:   { name: 'Оглушение', icon: '💫', debuff: true },
    hex:    { name: 'Сглаз', icon: '🐸', debuff: true },
    root:   { name: 'Обездвиживание', icon: '⛓️', debuff: true },
    silence:{ name: 'Безмолвие', icon: '🤐', debuff: true },
    dot:    { name: 'Урон со временем', icon: '🔥', debuff: true },
    armorRed:{ name: 'Снижение брони', icon: '🛡️', debuff: true },
    armor:  { name: 'Броня', icon: '🛡️' },
    dmgPct: { name: 'Усиление атаки', icon: '💪' },
    evasion:{ name: 'Уклонение', icon: '💨' },
    immune: { name: 'Невосприимчивость к магии', icon: '✨' },
    shield: { name: 'Щит', icon: '🔰' },
    invis:  { name: 'Невидимость', icon: '👻' },
    untarget:{ name: 'Неуязвимость к выбору цели', icon: '🌀' },
    grave:  { name: 'Неглубокая могила', icon: '⚰️' },
    regen:  { name: 'Регенерация', icon: '💚' },
    ls:     { name: 'Вампиризм', icon: '🩸' },
    mres:   { name: 'Сопротивление магии', icon: '🔮' },
  };

  /* ---------------- Cards registry ---------------- */
  D.CARDS = {};
  function card(id, def) { def.id = id; D.CARDS[id] = def; return def; }

  // Basic cards — every hero has them.
  card('strike', {
    name: 'Удар', kind: 'basic', icon: '⚔️', mana: 0, tg: 'enemyOrRosh', attack: true,
    desc: () => 'Атака врага в вашей зоне: <b>190%</b> урона атаки × скорость атаки. Можно атаковать Рошана.',
    play: ({ s, h, t, E }) => E.atk(s, h, t, 1.9),
  });
  card('farm', {
    name: 'Фарм', kind: 'basic', icon: '💰', mana: 0, tg: 'none',
    desc: (l, s) => 'Добивайте крипов на линии или в лесу: золото и опыт растут со временем. Враги рядом мешают (−25%). На линии без врагов ваши крипы заодно бьют башню.',
    req: ({ s, h, E }) => E.canFarm(s, h),
    play: ({ s, h, E }) => E.farm(s, h, 1),
  });
  card('push', {
    name: 'Натиск', kind: 'basic', icon: '🏰', mana: 0, tg: 'none',
    desc: () => 'Вместе с крипами атакуйте ближайшую вражескую башню (или Древнего) на этой линии. Башня бьёт в ответ.',
    req: ({ s, h, E }) => E.canPush(s, h),
    play: ({ s, h, E }) => { const st = E.st(s, h); E.push(s, h, st.atk * st.asMult * 1.3 + 90 + 6 * s.round); },
  });
  card('tp', {
    name: 'Свиток телепорта', kind: 'basic', icon: '🌀', mana: 0, tg: 'zoneTP',
    desc: () => 'Телепортируйтесь на свою базу или на любую линию, где стоит союзная башня.',
    play: ({ s, h, t, E }) => E.moveTo(s, h, t, true),
  });
  card('salve', {
    name: 'Лечебная мазь', kind: 'basic', icon: '🧪', mana: 0, tg: 'none',
    desc: () => 'Восстанавливает <b>120 + 18%</b> здоровья и <b>60</b> маны.',
    play: ({ s, h, E }) => { const st = E.st(s, h); E.heal(s, h, 120 + st.maxHp * 0.18); E.mana(s, h, 60); },
  });
  card('gank', {
    name: 'Засада', kind: 'basic', icon: '🗡️', mana: 0, tg: 'enemyNear', attack: true, moves: true,
    desc: () => 'Переместитесь к врагу в соседней зоне (или в своей) и атакуйте: <b>180%</b> урона атаки.',
    play: ({ s, h, t, E }) => { if (t.zone !== h.zone) E.moveTo(s, h, t.zone, true); E.atk(s, h, t, 1.8); },
  });
  D.BASIC_DECK = ['strike', 'strike', 'strike', 'farm', 'farm', 'farm', 'push', 'push', 'tp', 'salve', 'gank'];

  /* ---------------- Heroes ---------------- */
  D.HEROES = {};
  D.HERO_LIST = [];
  function hero(id, def) {
    def.id = id;
    for (const k of ['q', 'w', 'e', 'r']) {
      const sk = def.skills[k];
      sk.key = k;
      sk.ult = k === 'r';
      sk.max = sk.ult ? 3 : 4;
      if (sk.card) {
        const cd = sk.card;
        cd.name = cd.name || sk.name;
        cd.icon = cd.icon || sk.icon;
        cd.kind = sk.ult ? 'ult' : 'skill';
        cd.hero = id;
        cd.skill = k;
        card(id + '_' + k, cd);
        sk.cardId = id + '_' + k;
      }
    }
    D.HEROES[id] = def;
    D.HERO_LIST.push(id);
  }
  const foesOrAll = (E, s, h) => E.foes(s, h);

  // ============ STRENGTH ============
  hero('axe', {
    name: 'Axe', title: 'Могучий Акс', attr: 'str', roles: ['off', 'initiator'], pos: [3, 4, 2],
    str: 25, agi: 20, int: 18, gs: 2.8, ga: 1.7, gi: 1.6, dmg: 29, armor: 1, ranged: false, hue: 0,
    lore: 'Неудержимый воин с секирой. Врывается в толпу врагов и казнит ослабевших.',
    build: ['boots', 'wand', 'blink', 'bkb', 'heart', 'ac', 'aghs'],
    skillOrder: ['e', 'q', 'e', 'w', 'e', 'r', 'e', 'q', 'q', 'q', 'r', 'w', 'w', 'w', 'r'],
    skills: {
      q: { name: 'Зов берсерка', icon: '📯', card: {
        mana: [80, 90, 100, 110], tg: 'none',
        req: ({ s, h, E }) => E.foes(s, h).length > 0,
        desc: l => `Провоцирует всех врагов в зоне — они <b>оглушены на 1 ход</b>. Акс получает <b>+${L([10, 13, 16, 19], l)}</b> брони на 2 хода.`,
        play: ({ s, h, l, E }) => { for (const f of E.foes(s, h)) E.addSt(s, h, f, 'stun', 1); E.addSt(s, h, h, 'armor', 2, L([10, 13, 16, 19], l)); },
      } },
      w: { name: 'Жажда битвы', icon: '🩸', card: {
        mana: [50, 60, 70, 80], tg: 'enemy',
        desc: l => `Проклятие: <b>${L([30, 45, 60, 75], l)}</b> магического урона в начале каждого хода цели (3 хода). Акс получает +15% к атаке на 2 хода.`,
        play: ({ s, h, t, l, E }) => { E.addSt(s, h, t, 'dot', 3, L([30, 45, 60, 75], l)); E.addSt(s, h, h, 'dmgPct', 2, 0.15); },
      } },
      e: { name: 'Вращение', icon: '🌪️', card: {
        mana: 30, tg: 'none',
        req: ({ s, h, E }) => E.foes(s, h).length > 0,
        desc: l => `Наносит <b>${L([75, 105, 135, 165], l)}</b> чистого урона всем врагам в зоне.<br><i>Пассивно: 20% шанс ответить вращением на атаку.</i>`,
        play: ({ s, h, l, E }) => { for (const f of E.foes(s, h)) E.dmg(s, h, f, L([75, 105, 135, 165], l), 'pure'); },
      }, passive: {
        onAttacked: ({ s, self, attacker, l, E }) => { if (attacker && attacker.team !== undefined && attacker.zone === self.zone && E.chance(s, 0.2)) { E.fx(s, { type: 'proc', uid: self.uid, text: 'Вращение!' }); E.dmg(s, self, attacker, L([75, 105, 135, 165], l), 'pure'); } },
      } },
      r: { name: 'Казнь', icon: '🪓', card: {
        mana: [60, 120, 180], tg: 'enemy',
        desc: l => `Если у цели меньше <b>${L([250, 350, 450], l)}</b> здоровья — мгновенно убивает её и карта возвращается в руку. Иначе наносит <b>${L([150, 250, 300], l)}</b> магического урона.`,
        play: (c) => { const { s, h, t, l, E } = c; const thr = L([250, 350, 450], l) * (1 + E.st(s, h).ultBoost);
          if (t.hp <= thr && !E.has(t, 'grave')) { E.fx(s, { type: 'proc', uid: t.uid, text: 'КАЗНЬ!' }); E.dmg(s, h, t, t.hp + 9999, 'pure', { culling: true }); c.returnToHand = t.dead; }
          else E.dmg(s, h, t, L([150, 250, 300], l), 'magic'); },
      } },
    },
  });

  hero('pudge', {
    name: 'Pudge', title: 'Мясник', attr: 'str', roles: ['support', 'disabler'], pos: [4, 3, 5],
    str: 25, agi: 14, int: 16, gs: 3.2, ga: 1.4, gi: 1.5, dmg: 32, armor: 0, ranged: false, hue: 300,
    lore: 'Мясник с крюком. Вытаскивает врагов из соседних зон и разделывает на месте.',
    build: ['boots', 'wand', 'blink', 'heart', 'aghs', 'bkb', 'ac'],
    skillOrder: ['q', 'w', 'q', 'e', 'q', 'r', 'q', 'w', 'w', 'w', 'r', 'e', 'e', 'e', 'r'],
    skills: {
      q: { name: 'Мясной крюк', icon: '🪝', card: {
        mana: [110, 120, 130, 140], tg: 'enemyNear',
        desc: l => `Бросает крюк в врага в своей или соседней зоне. <b>75%</b> шанс попадания: притягивает цель к Паджу и наносит <b>${L([100, 190, 280, 370], l)}</b> чистого урона.`,
        play: ({ s, h, t, l, E }) => {
          if (E.chance(s, 0.75)) { E.fx(s, { type: 'proc', uid: t.uid, text: 'Крюк!' }); if (t.zone !== h.zone) E.moveTo(s, t, h.zone, true); E.dmg(s, h, t, L([100, 190, 280, 370], l), 'pure'); }
          else { E.fx(s, { type: 'miss', uid: t.uid }); E.log(s, `${E.nm(h)} промахивается крюком.`); }
        },
      } },
      w: { name: 'Гниль', icon: '🦠', card: {
        mana: 0, tg: 'none',
        req: ({ s, h, E }) => E.foes(s, h).length > 0,
        desc: l => `Ядовитое облако: <b>${L([90, 130, 170, 210], l)}</b> магического урона всем врагам в зоне и <b>обездвиживание</b> на 1 ход. Пудж теряет ${L([35, 50, 65, 80], l)} здоровья.`,
        play: ({ s, h, l, E }) => { for (const f of E.foes(s, h)) { E.dmg(s, h, f, L([90, 130, 170, 210], l), 'magic'); E.addSt(s, h, f, 'root', 1); } h.hp = Math.max(1, h.hp - L([35, 50, 65, 80], l)); },
      } },
      e: { name: 'Груда плоти', icon: '🥩', card: {
        mana: 50, tg: 'none',
        desc: l => `Щит, поглощающий <b>${L([120, 180, 240, 300], l)}</b> урона (2 хода).<br><i>Пассивно: +${L([1.5, 2, 2.5, 3], l)} к силе за каждого врага, погибшего рядом.</i>`,
        play: ({ s, h, l, E }) => E.addSt(s, h, h, 'shield', 2, L([120, 180, 240, 300], l)),
      }, passive: {
        onDeathNear: ({ s, self, victim, l, E }) => { if (victim.team !== self.team && E.dist(victim.zone, self.zone) <= 1) { self.perm.str += L([1.5, 2, 2.5, 3], l); E.fx(s, { type: 'proc', uid: self.uid, text: '+сила' }); } },
      } },
      r: { name: 'Расчленение', icon: '🔪', card: {
        mana: [100, 130, 170], tg: 'enemy',
        desc: l => `Оглушает цель на <b>1 ход</b> и наносит <b>${L([220, 320, 420], l)} + 60% силы</b> магического урона, исцеляя Паджа на эту величину.`,
        play: ({ s, h, t, l, E }) => { E.addSt(s, h, t, 'stun', 1); const d = E.dmg(s, h, t, L([220, 320, 420], l) * (1 + E.st(s, h).ultBoost) + E.st(s, h).str * 0.6, 'magic'); E.heal(s, h, d); },
      } },
    },
  });

  hero('sven', {
    name: 'Sven', title: 'Изгнанный рыцарь', attr: 'str', roles: ['carry', 'disabler'], pos: [1, 2, 3],
    str: 22, agi: 21, int: 16, gs: 2.4, ga: 2.0, gi: 1.3, dmg: 31, armor: 0, ranged: false, hue: 200,
    lore: 'Рыцарь-изгой, раскалывающий целые армии одним взмахом меча.',
    build: ['boots', 'treads', 'bfury', 'bkb', 'daedalus', 'satanic', 'ac'],
    skillOrder: ['q', 'w', 'w', 'e', 'w', 'r', 'w', 'q', 'q', 'q', 'r', 'e', 'e', 'e', 'r'],
    skills: {
      q: { name: 'Штормовой молот', icon: '🔨', card: {
        mana: [130, 140, 150, 160], tg: 'enemy',
        desc: l => `Молот наносит цели <b>${L([70, 140, 210, 280], l)}</b> магического урона и <b>оглушает</b> её на 1 ход. Остальные враги в зоне получают половину урона и оглушаются с шансом 40%.`,
        play: ({ s, h, t, l, E }) => { const v = L([70, 140, 210, 280], l); for (const f of E.foes(s, h)) { E.dmg(s, h, f, f === t ? v : v / 2, 'magic'); if (f === t || E.chance(s, 0.4)) E.addSt(s, h, f, 'stun', 1); } },
      } },
      w: { name: 'Великий раскол', icon: '🗡️', card: {
        mana: 25, tg: 'enemyOrRosh', attack: true,
        desc: l => `Атака <b>130%</b> урона по цели. <i>Пассивно: атаки задевают остальных врагов в зоне на ${L([20, 28, 36, 44], l)}% урона (не суммируется с Боевой яростью).</i>`,
        play: ({ s, h, t, E }) => E.atk(s, h, t, 1.3),
      }, passive: { stats: (b, l) => { b.cleave = Math.max(b.cleave, L([0.2, 0.28, 0.36, 0.44], l)); } } },
      e: { name: 'Боевой клич', icon: '📢', card: {
        mana: [40, 45, 50, 55], tg: 'none',
        desc: l => `Союзники в зоне получают <b>+${L([3, 5, 7, 9], l)}</b> брони и <b>+${L([8, 12, 16, 20], l)}%</b> урона атаки на 2 хода.`,
        play: ({ s, h, l, E }) => { for (const a of E.friends(s, h)) { E.addSt(s, h, a, 'armor', 2, L([3, 5, 7, 9], l)); E.addSt(s, h, a, 'dmgPct', 2, L([0.08, 0.12, 0.16, 0.2], l)); } },
      } },
      r: { name: 'Сила богов', icon: '⚡', card: {
        mana: [100, 150, 200], tg: 'none',
        desc: l => `Свен получает <b>+${L([60, 90, 120], l)}%</b> урона атаки на 3 хода и сразу атакует (если рядом есть враг).`,
        play: ({ s, h, l, E }) => { E.addSt(s, h, h, 'dmgPct', 3, L([0.6, 0.9, 1.2], l) * (1 + E.st(s, h).ultBoost)); const f = E.foes(s, h, h.zone, true); if (f.length) E.atk(s, h, E.weakest(s, f), 1.0); },
      } },
    },
  });

  hero('wk', {
    name: 'Wraith King', title: 'Король-призрак', attr: 'str', roles: ['carry', 'disabler'], pos: [1, 3, 2],
    str: 21, agi: 18, int: 18, gs: 2.4, ga: 1.7, gi: 1.5, dmg: 32, armor: 1, ranged: false, hue: 120,
    lore: 'Бессмертный король, восстающий из мёртвых и ведущий за собой армию скелетов.',
    build: ['boots', 'treads', 'bfury', 'deso', 'bkb', 'daedalus', 'ac'],
    skillOrder: ['q', 'e', 'e', 'w', 'e', 'r', 'e', 'w', 'w', 'w', 'r', 'q', 'q', 'q', 'r'],
    skills: {
      q: { name: 'Адский удар', icon: '💀', card: {
        mana: [95, 110, 125, 140], tg: 'enemy',
        desc: l => `Оглушает цель на <b>1 ход</b>, наносит <b>${L([80, 115, 150, 185], l)}</b> магического урона и ещё по <b>${L([20, 30, 40, 50], l)}</b> в начале её следующих 2 ходов.`,
        play: ({ s, h, t, l, E }) => { E.addSt(s, h, t, 'stun', 1); E.dmg(s, h, t, L([80, 115, 150, 185], l), 'magic'); E.addSt(s, h, t, 'dot', 2, L([20, 30, 40, 50], l)); },
      } },
      w: { name: 'Армия скелетов', icon: '☠️', card: {
        mana: 50, tg: 'none',
        desc: l => `Скелеты наносят <b>${L([50, 80, 110, 140], l)}</b> физ. урона каждому врагу в зоне; на линии — бьют вражескую башню на <b>${L([110, 170, 230, 290], l)}</b> без ответного удара.<br><i>Пассивно: ${L([10, 15, 20, 25], l)}% вампиризма.</i>`,
        req: ({ s, h, E }) => E.foes(s, h).length > 0 || E.canPush(s, h),
        play: ({ s, h, l, E }) => { for (const f of E.foes(s, h)) E.dmg(s, h, f, L([50, 80, 110, 140], l), 'phys'); if (E.canPush(s, h)) E.push(s, h, L([110, 170, 230, 290], l), { noRet: true }); },
      }, passive: { stats: (b, l) => { b.ls += L([0.1, 0.15, 0.2, 0.25], l); } } },
      e: { name: 'Смертельный удар', icon: '🗡️', card: {
        mana: 40, tg: 'enemyOrRosh', attack: true,
        desc: l => `Атака <b>100%</b> урона с гарантированным критом ×${L([1.6, 2.0, 2.4, 2.8], l)}.<br><i>Пассивно: 15% шанс крита.</i>`,
        play: ({ s, h, t, E }) => E.atk(s, h, t, 1.0, { forceCrit: true }),
      }, passive: { stats: (b, l) => { b.crits.push([0.15, L([1.6, 2.0, 2.4, 2.8], l)]); } } },
      r: { name: 'Перерождение', icon: '👑', passive: {
        onDeath: ({ s, self, l, E }) => {
          const cost = 200;
          if (self.reincCd > 0 || self.mana < cost) return false;
          self.mana -= cost; self.reincCd = L([16, 13, 10], l);
          const st = E.st(s, self); self.hp = st.maxHp; self.st = [];
          E.fx(s, { type: 'proc', uid: self.uid, text: 'ПЕРЕРОЖДЕНИЕ!' }); E.log(s, `👑 ${E.nm(self)} восстаёт из мёртвых!`, 'big');
          for (const f of E.foes(s, self)) E.addSt(s, self, f, 'root', 1);
          return true;
        },
      }, desc: l => `<i>Пассивно:</i> при смерти воскресает с полным здоровьем (стоит 200 маны), обездвиживая врагов рядом. Перезарядка ${L([16, 13, 10], l)} раундов.` },
    },
  });

  // ============ AGILITY ============
  hero('jugg', {
    name: 'Juggernaut', title: 'Джаггернаут', attr: 'agi', roles: ['carry', 'pusher'], pos: [1, 2],
    str: 20, agi: 29, int: 14, gs: 2.2, ga: 2.7, gi: 1.4, dmg: 24, armor: 0, ranged: false, hue: 30,
    lore: 'Мастер клинка в маске. Его вихрь неуязвим для магии, а Омнислэш режет всё живое.',
    build: ['boots', 'treads', 'bfury', 'mkb', 'bkb', 'butterfly', 'daedalus'],
    skillOrder: ['q', 'e', 'q', 'e', 'q', 'r', 'q', 'e', 'e', 'w', 'r', 'w', 'w', 'w', 'r'],
    skills: {
      q: { name: 'Вихрь клинков', icon: '🌀', card: {
        mana: [110, 100, 90, 80], tg: 'none',
        desc: l => `Невосприимчивость к магии на 1 ход и <b>${L([80, 120, 160, 200], l)}</b> магического урона всем врагам в зоне.`,
        play: ({ s, h, l, E }) => { E.addSt(s, h, h, 'immune', 1); E.cleanse(s, h); for (const f of E.foes(s, h)) E.dmg(s, h, f, L([80, 120, 160, 200], l), 'magic'); },
      } },
      w: { name: 'Лечебный тотем', icon: '🗿', card: {
        mana: [120, 125, 130, 135], tg: 'none',
        desc: l => `Союзники в зоне сразу восстанавливают <b>${L([10, 14, 18, 22], l)}%</b> здоровья и ещё столько же в начале следующего хода.`,
        play: ({ s, h, l, E }) => { for (const a of E.friends(s, h)) { E.heal(s, a, E.st(s, a).maxHp * L([0.1, 0.14, 0.18, 0.22], l), h); E.addSt(s, h, a, 'regen', 1, L([0.1, 0.14, 0.18, 0.22], l)); } },
      } },
      e: { name: 'Танец клинков', icon: '💃', card: {
        mana: 25, tg: 'enemyOrRosh', attack: true,
        desc: l => `Атака <b>140%</b> урона с +25% шансом крита.<br><i>Пассивно: ${L([15, 20, 25, 30], l)}% шанс крита ×1.8.</i>`,
        play: ({ s, h, t, E }) => E.atk(s, h, t, 1.4, { critBonus: 0.25 }),
      }, passive: { stats: (b, l) => { b.crits.push([L([0.15, 0.2, 0.25, 0.3], l), 1.8]); } } },
      r: { name: 'Омнислэш', icon: '⚔️', card: {
        mana: [200, 275, 350], tg: 'enemy', attack: true,
        desc: l => `Джаггернаут становится неуязвим к выбору цели и наносит <b>${L([3, 5, 7], l)}</b> ударов по 70% урона атаки случайным врагам в зоне.`,
        play: ({ s, h, t, l, E }) => { E.addSt(s, h, h, 'untarget', 1); E.addSt(s, h, h, 'immune', 1);
          const n = Math.round(L([3, 5, 7], l) * (1 + E.st(s, h).ultBoost)); let tgt = t;
          for (let i = 0; i < n; i++) { if (!tgt || tgt.dead) { const f = E.foes(s, h, h.zone, false); if (!f.length) break; tgt = f[Math.floor(E.rng(s) * f.length)]; } E.atk(s, h, tgt, 0.7, { noCleave: true }); if (i < n - 1) { const f = E.foes(s, h, h.zone, false); if (f.length) tgt = f[Math.floor(E.rng(s) * f.length)]; } } },
      } },
    },
  });

  hero('pa', {
    name: 'Phantom Assassin', title: 'Фантомная убийца', attr: 'agi', roles: ['carry', 'escape'], pos: [1, 2],
    str: 21, agi: 25, int: 15, gs: 2.2, ga: 3.4, gi: 1.7, dmg: 30, armor: 2, ranged: false, hue: 260,
    lore: 'Безмолвная убийца в вуали. Её клинок находит уязвимость в любой броне.',
    build: ['boots', 'treads', 'bfury', 'deso', 'bkb', 'satanic', 'butterfly'],
    skillOrder: ['q', 'w', 'q', 'e', 'q', 'r', 'q', 'w', 'w', 'w', 'r', 'e', 'e', 'e', 'r'],
    skills: {
      q: { name: 'Удушающий кинжал', icon: '🔪', card: {
        mana: [30, 25, 20, 15], tg: 'enemyNear', attack: true,
        desc: l => `Бросок в цель в своей или соседней зоне: <b>65 + ${L([45, 60, 75, 90], l)}%</b> урона атаки (может критовать) и <b>обездвиживание</b> на 1 ход.`,
        play: ({ s, h, t, l, E }) => { E.atk(s, h, t, L([0.45, 0.6, 0.75, 0.9], l), { noAS: true, flat: 65, noCleave: true }); E.addSt(s, h, t, 'root', 1); },
      } },
      w: { name: 'Призрачный удар', icon: '👤', card: {
        mana: [35, 40, 45, 50], tg: 'enemyNear', attack: true, moves: true,
        desc: l => `Мгновенно переносится к цели (своя или соседняя зона) и атакует <b>дважды</b> по ${L([85, 95, 105, 115], l)}% урона.`,
        play: ({ s, h, t, l, E }) => { if (t.zone !== h.zone) E.moveTo(s, h, t.zone, true); E.atk(s, h, t, L([0.85, 0.95, 1.05, 1.15], l)); if (!t.dead) E.atk(s, h, t, L([0.85, 0.95, 1.05, 1.15], l)); },
      } },
      e: { name: 'Размытие', icon: '🌫️', card: {
        mana: 50, tg: 'none',
        desc: l => `Становится <b>невидимой</b> на 1 ход и восстанавливает 10% здоровья.<br><i>Пассивно: ${L([25, 30, 35, 40], l)}% уклонения.</i>`,
        play: ({ s, h, E }) => { E.addSt(s, h, h, 'invis', 1); E.heal(s, h, E.st(s, h).maxHp * 0.1); },
      }, passive: { stats: (b, l) => { b.evasion.push(L([0.25, 0.3, 0.35, 0.4], l)); } } },
      r: { name: 'Удар милосердия', icon: '🩸', card: {
        mana: 50, tg: 'enemyOrRosh', attack: true,
        desc: l => `Атака <b>110%</b> урона с гарантированным критом ×${L([2.0, 2.5, 3.0], l)}.<br><i>Пассивно: 18% шанс такого крита.</i>`,
        play: ({ s, h, t, E }) => E.atk(s, h, t, 1.1, { forceCrit: true }),
      }, passive: { stats: (b, l) => { b.crits.push([0.18, L([2.0, 2.5, 3.0], l)]); } } },
    },
  });

  hero('drow', {
    name: 'Drow Ranger', title: 'Лучница-дроу', attr: 'agi', roles: ['carry', 'pusher'], pos: [1, 2],
    str: 21, agi: 24, int: 15, gs: 2.2, ga: 3.0, gi: 1.4, dmg: 27, armor: 0, ranged: true, hue: 180,
    lore: 'Ледяная лучница. Её стрелы замедляют, а залпы накрывают целые отряды.',
    build: ['boots', 'treads', 'deso', 'mkb', 'bkb', 'daedalus', 'butterfly'],
    skillOrder: ['q', 'e', 'q', 'w', 'e', 'r', 'e', 'e', 'q', 'q', 'r', 'w', 'w', 'w', 'r'],
    skills: {
      q: { name: 'Ледяные стрелы', icon: '❄️', card: {
        mana: 12, tg: 'enemyOrRosh', attack: true,
        desc: l => `Атака <b>120%</b> урона + <b>${L([20, 35, 50, 65], l)}</b> магического урона холодом и <b>обездвиживание</b> на 1 ход.`,
        play: ({ s, h, t, l, E }) => { E.atk(s, h, t, 1.2); if (t !== 'rosh' && !t.dead) { E.dmg(s, h, t, L([20, 35, 50, 65], l), 'magic'); E.addSt(s, h, t, 'root', 1); } },
      } },
      w: { name: 'Порыв', icon: '🌬️', card: {
        mana: [70, 80, 90, 100], tg: 'none',
        req: ({ s, h, E }) => E.foes(s, h).length > 0,
        desc: l => `Все враги в зоне получают <b>безмолвие</b> на ${L([1, 1, 2, 2], l)} ход(а) и <b>${L([40, 60, 80, 100], l)}</b> магического урона.`,
        play: ({ s, h, l, E }) => { for (const f of E.foes(s, h)) { E.addSt(s, h, f, 'silence', L([1, 1, 2, 2], l)); E.dmg(s, h, f, L([40, 60, 80, 100], l), 'magic'); } },
      } },
      e: { name: 'Мультивыстрел', icon: '🏹', card: {
        mana: [50, 70, 90, 110], tg: 'none', attack: true,
        req: ({ s, h, E }) => E.foes(s, h, h.zone, true).length > 0,
        desc: l => `Залп по каждому врагу в зоне: <b>${L([75, 90, 105, 120], l)}%</b> урона атаки.`,
        play: ({ s, h, l, E }) => { for (const f of E.foes(s, h)) E.atk(s, h, f, L([0.75, 0.9, 1.05, 1.2], l), { noCleave: true }); },
      } },
      r: { name: 'Меткость', icon: '🎯', passive: {
        stats: (b, l) => { b.agiPct += L([0.2, 0.32, 0.44], l); b.pierce = Math.max(b.pierce || 0, 0.3); },
      }, desc: l => `<i>Пассивно:</i> +${L([20, 32, 44], l)}% к ловкости; 30% атак игнорируют уклонение.` },
    },
  });

  hero('am', {
    name: 'Anti-Mage', title: 'Антимаг', attr: 'agi', roles: ['carry', 'escape'], pos: [1],
    str: 23, agi: 24, int: 12, gs: 2.0, ga: 3.0, gi: 1.8, dmg: 35, armor: 3, ranged: false, hue: 230, farm: 0.35,
    lore: 'Монах-воин, выжигающий ману магов. Лучший фармер — и худший кошмар для заклинателей.',
    build: ['boots', 'bfury', 'treads', 'mkb', 'butterfly', 'satanic', 'heart'],
    skillOrder: ['w', 'q', 'q', 'e', 'q', 'r', 'q', 'w', 'w', 'w', 'r', 'e', 'e', 'e', 'r'],
    skills: {
      q: { name: 'Выжигание маны', icon: '🔥', passive: {
        stats: (b, l) => { b.manaBreak += L([25, 32, 39, 46], l); },
      }, desc: l => `<i>Пассивно:</i> каждая атака сжигает <b>${L([25, 32, 39, 46], l)}</b> маны и наносит 60% сожжённого физическим уроном.` },
      w: { name: 'Скачок', icon: '✴️', card: {
        mana: [60, 55, 50, 45], tg: 'zone2', moves: true,
        desc: l => `Переносится в любую зону на расстоянии до 2 шагов и берёт <b>1 карту</b>.`,
        play: ({ s, h, t, E }) => { E.moveTo(s, h, t, true); E.draw(s, h, 1); },
      } },
      e: { name: 'Контрзаклинание', icon: '🛡️', card: {
        mana: 50, tg: 'none',
        desc: l => `Невосприимчивость к магии на 1 ход и снятие негативных эффектов.<br><i>Пассивно: +${L([15, 22, 29, 36], l)}% сопротивления магии.</i>`,
        play: ({ s, h, E }) => { E.cleanse(s, h); E.addSt(s, h, h, 'immune', 1); },
      }, passive: { stats: (b, l) => { b.mres += L([0.15, 0.22, 0.29, 0.36], l); } } },
      r: { name: 'Пустота маны', icon: '🌑', card: {
        mana: [100, 150, 200], tg: 'enemy',
        desc: l => `Урон = <b>${L([0.8, 0.95, 1.1], l)}</b> × недостающая мана цели (+ 100 базово), остальным врагам в зоне — половина. Цель оглушена на 1 ход.`,
        play: ({ s, h, t, l, E }) => { const miss = E.st(s, t).maxMana - t.mana; const v = (100 + miss * L([0.8, 0.95, 1.1], l)) * (1 + E.st(s, h).ultBoost); E.addSt(s, h, t, 'stun', 1); for (const f of E.foes(s, h)) E.dmg(s, h, f, f === t ? v : v / 2, 'magic'); },
      } },
    },
  });

  // ============ INTELLIGENCE ============
  hero('lina', {
    name: 'Lina', title: 'Повелительница огня', attr: 'int', roles: ['mid', 'nuker'], pos: [2, 4, 1],
    str: 18, agi: 23, int: 28, gs: 2.2, ga: 2.1, gi: 3.1, dmg: 24, armor: 0, ranged: true, hue: 340,
    lore: 'Огненная волшебница. Её Клинок Лагуны испепеляет героев одним ударом.',
    build: ['boots', 'kaya', 'blink', 'aghs', 'dagon', 'bkb', 'vyse'],
    skillOrder: ['q', 'w', 'q', 'e', 'q', 'r', 'q', 'w', 'w', 'w', 'r', 'e', 'e', 'e', 'r'],
    skills: {
      q: { name: 'Драконий язык', icon: '🐉', card: {
        mana: [90, 105, 120, 135], tg: 'none',
        req: ({ s, h, E }) => E.foes(s, h).length > 0,
        desc: l => `Волна огня: <b>${L([85, 155, 225, 295], l)}</b> магического урона всем врагам в зоне.`,
        play: ({ s, h, l, E }) => { for (const f of E.foes(s, h)) E.dmg(s, h, f, L([85, 155, 225, 295], l), 'magic'); },
      } },
      w: { name: 'Огненный столп', icon: '🔥', card: {
        mana: [110, 120, 130, 140], tg: 'enemy',
        desc: l => `<b>${L([80, 125, 170, 215], l)}</b> магического урона всем врагам в зоне. Цель оглушена на 1 ход, остальные — с шансом 35%.`,
        play: ({ s, h, t, l, E }) => { for (const f of E.foes(s, h)) { E.dmg(s, h, f, L([80, 125, 170, 215], l), 'magic'); if (f === t || E.chance(s, 0.35)) E.addSt(s, h, f, 'stun', 1); } },
      } },
      e: { name: 'Пылающая душа', icon: '♨️', passive: {
        onSpell: ({ s, self, l, E }) => { E.addSt(s, self, self, 'dmgPct', 2, L([0.15, 0.22, 0.29, 0.36], l)); E.mana(s, self, L([10, 20, 30, 40], l)); },
      }, desc: l => `<i>Пассивно:</i> после каждой способности Лина получает +${L([15, 22, 29, 36], l)}% урона атаки на 2 хода и возвращает ${L([10, 20, 30, 40], l)} маны.` },
      r: { name: 'Клинок Лагуны', icon: '⚡', card: {
        mana: [200, 280, 360], tg: 'enemy',
        desc: l => `Сокрушительная молния: <b>${L([400, 575, 750], l)}</b> магического урона по одной цели.`,
        play: ({ s, h, t, l, E }) => E.dmg(s, h, t, L([400, 575, 750], l) * (1 + E.st(s, h).ultBoost), 'magic'),
      } },
    },
  });

  hero('cm', {
    name: 'Crystal Maiden', title: 'Ледяная дева', attr: 'int', roles: ['support', 'disabler'], pos: [5, 4],
    str: 20, agi: 16, int: 16, gs: 2.6, ga: 1.6, gi: 3.3, dmg: 30, armor: 0, ranged: true, hue: 190,
    lore: 'Хранительница севера. Сковывает врагов льдом и питает союзников маной.',
    build: ['boots', 'wand', 'glimmer', 'meka', 'blink', 'aghs', 'vyse'],
    skillOrder: ['q', 'w', 'e', 'w', 'q', 'r', 'w', 'w', 'q', 'q', 'r', 'e', 'e', 'e', 'r'],
    skills: {
      q: { name: 'Кристальная вспышка', icon: '💠', card: {
        mana: [110, 130, 150, 170], tg: 'none',
        req: ({ s, h, E }) => E.foes(s, h).length > 0,
        desc: l => `<b>${L([120, 170, 220, 270], l)}</b> магического урона всем врагам в зоне и <b>обездвиживание</b> на 1 ход.`,
        play: ({ s, h, l, E }) => { for (const f of E.foes(s, h)) { E.dmg(s, h, f, L([120, 170, 220, 270], l), 'magic'); E.addSt(s, h, f, 'root', 1); } },
      } },
      w: { name: 'Обморожение', icon: '🧊', card: {
        mana: [115, 125, 135, 145], tg: 'enemyNear',
        desc: l => `Цель в своей или соседней зоне вмерзает в лёд: <b>оглушение</b> на 1 ход и <b>${L([110, 160, 210, 260], l)}</b> магического урона.`,
        play: ({ s, h, t, l, E }) => { E.addSt(s, h, t, 'stun', 1); E.dmg(s, h, t, L([110, 160, 210, 260], l), 'magic'); },
      } },
      e: { name: 'Магическая аура', icon: '🔷', card: {
        mana: 0, tg: 'none',
        desc: l => `Все союзники в зоне восстанавливают <b>${L([60, 90, 120, 150], l)}</b> маны.<br><i>Пассивно: все союзники получают +${L([4, 6, 8, 10], l)} маны в начале хода (Дева — втрое больше).</i>`,
        play: ({ s, h, l, E }) => { for (const a of E.friends(s, h)) E.mana(s, a, L([60, 90, 120, 150], l)); },
      }, passive: { aura: (l) => L([4, 6, 8, 10], l) } },
      r: { name: 'Ледяное поле', icon: '🌨️', card: {
        mana: [200, 300, 400], tg: 'none',
        req: ({ s, h, E }) => E.foes(s, h).length > 0,
        desc: l => `Ледяная буря: 4 волны по <b>${L([75, 115, 155], l)}</b> магического урона всем врагам в зоне; враги обездвижены, Дева получает +15 брони на 1 ход.`,
        play: ({ s, h, l, E }) => { E.addSt(s, h, h, 'armor', 1, 15); const v = L([75, 115, 155], l) * (1 + E.st(s, h).ultBoost);
          for (let i = 0; i < 4; i++) for (const f of E.foes(s, h)) E.dmg(s, h, f, v, 'magic');
          for (const f of E.foes(s, h)) E.addSt(s, h, f, 'root', 1); },
      } },
    },
  });

  hero('zeus', {
    name: 'Zeus', title: 'Владыка небес', attr: 'int', roles: ['mid', 'nuker'], pos: [2, 4, 5],
    str: 23, agi: 11, int: 22, gs: 2.5, ga: 1.2, gi: 3.3, dmg: 30, armor: 3, ranged: true, hue: 50,
    lore: 'Громовержец, способный поразить врага в любой точке карты.',
    build: ['boots', 'kaya', 'aghs', 'blink', 'dagon', 'bkb', 'vyse'],
    skillOrder: ['q', 'w', 'q', 'e', 'q', 'r', 'q', 'w', 'w', 'w', 'r', 'e', 'e', 'e', 'r'],
    skills: {
      q: { name: 'Дуговая молния', icon: '⚡', card: {
        mana: [65, 70, 75, 80], tg: 'enemy',
        desc: l => `<b>${L([95, 125, 155, 185], l)}</b> магического урона цели, молния перескакивает на остальных врагов в зоне (70%).`,
        play: ({ s, h, t, l, E }) => { const v = L([95, 125, 155, 185], l); for (const f of E.foes(s, h)) E.dmg(s, h, f, f === t ? v : v * 0.7, 'magic'); },
      } },
      w: { name: 'Удар молнии', icon: '🌩️', card: {
        mana: [110, 115, 120, 125], tg: 'enemyNear',
        desc: l => `Молния бьёт врага в своей или соседней зоне: <b>${L([110, 185, 260, 335], l)}</b> магического урона, снимает невидимость, 60% шанс оглушения на 1 ход.`,
        play: ({ s, h, t, l, E }) => { E.rmSt(t, 'invis'); E.dmg(s, h, t, L([110, 185, 260, 335], l), 'magic'); if (E.chance(s, 0.6)) E.addSt(s, h, t, 'stun', 1); },
      } },
      e: { name: 'Прыжок в небеса', icon: '☁️', card: {
        mana: 75, tg: 'zoneAdj', moves: true,
        desc: l => `Зевс перелетает в соседнюю зону и бьёт всех врагов там на <b>${L([60, 90, 120, 150], l)}</b> магического урона.<br><i>Пассивно (Статическое поле): способности наносят ещё ${L([4, 6, 8, 10], l)}% текущего здоровья цели.</i>`,
        play: ({ s, h, t, l, E }) => { E.moveTo(s, h, t, true); for (const f of E.foes(s, h)) E.dmg(s, h, f, L([60, 90, 120, 150], l), 'magic'); },
      }, passive: { stats: (b, l) => { b.staticField = L([0.04, 0.06, 0.08, 0.1], l); } } },
      r: { name: 'Гнев громовержца', icon: '🌪️', card: {
        mana: [220, 300, 380], tg: 'none',
        desc: l => `Молнии поражают <b>всех вражеских героев на карте</b>: <b>${L([250, 350, 450], l)}</b> магического урона, снимая невидимость.`,
        play: ({ s, h, l, E }) => { for (const f of E.allFoes(s, h)) { E.rmSt(f, 'invis'); E.dmg(s, h, f, L([250, 350, 450], l) * (1 + E.st(s, h).ultBoost), 'magic'); } },
      } },
    },
  });

  hero('lion', {
    name: 'Lion', title: 'Демонический колдун', attr: 'int', roles: ['support', 'disabler', 'nuker'], pos: [4, 5],
    str: 18, agi: 15, int: 18, gs: 2.3, ga: 1.5, gi: 3.4, dmg: 30, armor: 0, ranged: true, hue: 15,
    lore: 'Колдун, продавший душу демонам. Превращает врагов в лягушек и убивает пальцем.',
    build: ['boots', 'wand', 'blink', 'glimmer', 'aghs', 'kaya', 'vyse'],
    skillOrder: ['q', 'e', 'w', 'q', 'q', 'r', 'q', 'w', 'w', 'w', 'r', 'e', 'e', 'e', 'r'],
    skills: {
      q: { name: 'Шип земли', icon: '⛰️', card: {
        mana: [100, 120, 140, 160], tg: 'enemy',
        desc: l => `Шипы пронзают цель и врагов позади: <b>${L([80, 140, 200, 260], l)}</b> магического урона. Цель оглушена на 1 ход, остальные в зоне — с шансом 35%.`,
        play: ({ s, h, t, l, E }) => { for (const f of E.foes(s, h)) { E.dmg(s, h, f, L([80, 140, 200, 260], l), 'magic'); if (f === t || E.chance(s, 0.35)) E.addSt(s, h, f, 'stun', 1); } },
      } },
      w: { name: 'Сглаз', icon: '🐸', card: {
        mana: [120, 140, 160, 180], tg: 'enemy',
        desc: l => `Превращает цель в лягушку на <b>${L([1, 1, 2, 2], l)}</b> ход(а): она пропускает ходы.`,
        play: ({ s, h, t, l, E }) => E.addSt(s, h, t, 'hex', L([1, 1, 2, 2], l)),
      } },
      e: { name: 'Похищение маны', icon: '🌀', card: {
        mana: 10, tg: 'enemyNear',
        desc: l => `Высасывает до <b>${L([90, 140, 190, 240], l)}</b> маны у врага (своя или соседняя зона) и обездвиживает его на 1 ход.`,
        play: ({ s, h, t, l, E }) => { const v = Math.min(t.mana, L([90, 140, 190, 240], l)); t.mana -= v; E.mana(s, h, v + 30); E.addSt(s, h, t, 'root', 1); },
      } },
      r: { name: 'Палец смерти', icon: '☝️', card: {
        mana: [200, 280, 360], tg: 'enemy',
        desc: l => `<b>${L([475, 625, 775], l)}</b> магического урона. Убийство навсегда даёт Лиону +40 урона атаки.`,
        play: ({ s, h, t, l, E }) => { E.dmg(s, h, t, L([475, 625, 775], l) * (1 + E.st(s, h).ultBoost), 'magic'); if (t.dead) h.perm.dmg += 40; },
      } },
    },
  });

  // ============ UNIVERSAL ============
  hero('wr', {
    name: 'Windranger', title: 'Ветреная лучница', attr: 'uni', roles: ['support', 'disabler', 'nuker'], pos: [4, 2, 3],
    str: 20, agi: 17, int: 18, gs: 3.0, ga: 1.6, gi: 2.6, dmg: 27, armor: 1, ranged: true, hue: 90,
    lore: 'Дитя ветра. Пригвождает врагов путами и обрушивает на них шквал стрел.',
    build: ['boots', 'wand', 'blink', 'mkb', 'aghs', 'bkb', 'daedalus'],
    skillOrder: ['q', 'w', 'w', 'e', 'w', 'r', 'w', 'q', 'q', 'q', 'r', 'e', 'e', 'e', 'r'],
    skills: {
      q: { name: 'Путы', icon: '🪢', card: {
        mana: [70, 80, 90, 100], tg: 'enemy',
        desc: l => `Привязывает цель: <b>оглушение</b> на ${L([1, 1, 2, 2], l)} ход(а) и 60 магического урона. Если в зоне есть ещё враг — он тоже связан на 1 ход.`,
        play: ({ s, h, t, l, E }) => { E.addSt(s, h, t, 'stun', L([1, 1, 2, 2], l)); E.dmg(s, h, t, 60, 'magic'); const o = E.foes(s, h).filter(f => f !== t); if (o.length) { E.addSt(s, h, o[0], 'stun', 1); E.dmg(s, h, o[0], 60, 'magic'); } },
      } },
      w: { name: 'Мощный выстрел', icon: '🎯', card: {
        mana: [90, 100, 110, 120], tg: 'enemyNear',
        desc: l => `Выстрел через зону: <b>${L([160, 260, 360, 460], l)}</b> магического урона цели в своей или соседней зоне, остальным врагам там — половина.`,
        play: ({ s, h, t, l, E }) => { const v = L([160, 260, 360, 460], l); for (const f of E.foes(s, h, t.zone)) E.dmg(s, h, f, f === t ? v : v / 2, 'magic'); },
      } },
      e: { name: 'Бег ветра', icon: '🍃', card: {
        mana: 50, tg: 'none',
        desc: l => `Уклонение от <b>${L([60, 75, 90, 100], l)}%</b> атак на 1 ход и <b>+1 перемещение</b> в этот ход.`,
        play: ({ s, h, l, E }) => { E.addSt(s, h, h, 'evasion', 1, L([0.6, 0.75, 0.9, 1.0], l)); s.turn.moves += 1; },
      } },
      r: { name: 'Сосредоточенный огонь', icon: '🏹', card: {
        mana: [75, 100, 125], tg: 'enemyOrRosh', attack: true,
        desc: l => `Шквал стрел: <b>${L([4, 5, 6], l)}</b> атак по ${L([60, 70, 80], l)}% урона в одну цель.`,
        play: ({ s, h, t, l, E }) => { const n = L([4, 5, 6], l) + (E.st(s, h).ultBoost ? 1 : 0); for (let i = 0; i < n; i++) { if (t !== 'rosh' && t.dead) break; if (t === 'rosh' && !s.rosh.alive) break; E.atk(s, h, t, L([0.6, 0.7, 0.8], l), { noCleave: true }); } },
      } },
    },
  });

  hero('mirana', {
    name: 'Mirana', title: 'Принцесса Луны', attr: 'uni', roles: ['support', 'escape', 'nuker'], pos: [4, 5, 2],
    str: 20, agi: 20, int: 22, gs: 2.4, ga: 3.2, gi: 1.9, dmg: 26, armor: 2, ranged: true, hue: 210,
    lore: 'Принцесса на огромной кошке. Её стрела оглушает издалека, а Лунная тень прячет всю команду.',
    build: ['boots', 'wand', 'glimmer', 'blink', 'aghs', 'mkb', 'bkb'],
    skillOrder: ['q', 'w', 'q', 'e', 'q', 'r', 'q', 'w', 'w', 'w', 'r', 'e', 'e', 'e', 'r'],
    skills: {
      q: { name: 'Звездопад', icon: '🌠', card: {
        mana: [80, 95, 110, 125], tg: 'none',
        req: ({ s, h, E }) => E.foes(s, h).length > 0,
        desc: l => `Звёзды бьют всех врагов в зоне на <b>${L([100, 175, 250, 325], l)}</b> магического урона; самый раненый получает ещё 50%.`,
        play: ({ s, h, l, E }) => { const v = L([100, 175, 250, 325], l); const f = E.foes(s, h); for (const x of f) E.dmg(s, h, x, v, 'magic'); const w = E.weakest(s, f.filter(x => !x.dead)); if (w) E.dmg(s, h, w, v / 2, 'magic'); },
      } },
      w: { name: 'Священная стрела', icon: '🏹', card: {
        mana: 100, tg: 'enemyNear',
        desc: l => `Стрела в цель (своя или соседняя зона): <b>85%</b> шанс попасть, оглушить на ${L([1, 1, 2, 2], l)} ход(а) и нанести <b>${L([90, 180, 270, 360], l)}</b> магического урона.`,
        play: ({ s, h, t, l, E }) => { if (E.chance(s, 0.85)) { E.addSt(s, h, t, 'stun', L([1, 1, 2, 2], l)); E.dmg(s, h, t, L([90, 180, 270, 360], l), 'magic'); } else { E.fx(s, { type: 'miss', uid: t.uid }); E.log(s, `${E.nm(h)}: стрела пролетела мимо.`); } },
      } },
      e: { name: 'Прыжок', icon: '🐆', card: {
        mana: 40, tg: 'zoneAdjOrSame', moves: true,
        desc: l => `Прыжок в соседнюю зону (или на месте): <b>+${L([20, 30, 40, 50], l)}%</b> урона атаки на 2 хода и +1 перемещение.`,
        play: ({ s, h, t, l, E }) => { if (t !== h.zone) E.moveTo(s, h, t, true); E.addSt(s, h, h, 'dmgPct', 2, L([0.2, 0.3, 0.4, 0.5], l)); s.turn.moves += 1; },
      } },
      r: { name: 'Лунная тень', icon: '🌙', card: {
        mana: [125, 150, 175], tg: 'none',
        desc: l => `<b>Все союзники</b> становятся невидимыми на ${L([1, 2, 2], l)} ход(а) и получают +${L([15, 20, 25], l)}% урона атаки.`,
        play: ({ s, h, l, E }) => { for (const a of E.allFriends(s, h)) { E.addSt(s, h, a, 'invis', L([1, 2, 2], l)); E.addSt(s, h, a, 'dmgPct', 2, L([0.15, 0.2, 0.25], l)); } },
      } },
    },
  });

  hero('dazzle', {
    name: 'Dazzle', title: 'Теневой жрец', attr: 'uni', roles: ['support'], pos: [5, 4],
    str: 20, agi: 20, int: 25, gs: 2.6, ga: 1.7, gi: 3.2, dmg: 24, armor: 3, ranged: true, hue: 280,
    lore: 'Жрец культа теней. Не даёт союзникам умереть и лечит их волной тьмы.',
    build: ['boots', 'wand', 'meka', 'glimmer', 'aghs', 'heart', 'vyse'],
    skillOrder: ['e', 'w', 'e', 'q', 'e', 'r', 'e', 'w', 'w', 'w', 'r', 'q', 'q', 'q', 'r'],
    skills: {
      q: { name: 'Ядовитое касание', icon: '🐍', card: {
        mana: [100, 110, 120, 130], tg: 'enemy',
        desc: l => `<b>${L([50, 70, 90, 110], l)}</b> магического урона сейчас и столько же в начале 3 следующих ходов цели; цель <b>оглушена</b> на 1 ход.`,
        play: ({ s, h, t, l, E }) => { E.dmg(s, h, t, L([50, 70, 90, 110], l), 'magic'); E.addSt(s, h, t, 'dot', 3, L([50, 70, 90, 110], l)); E.addSt(s, h, t, 'stun', 1); },
      } },
      w: { name: 'Неглубокая могила', icon: '⚰️', card: {
        mana: [120, 130, 140, 150], tg: 'allyNear',
        desc: l => `Союзник (своя или соседняя зона) <b>не может умереть</b> ${L([1, 1, 2, 2], l)} ход(а) и восстанавливает 10% здоровья.`,
        play: ({ s, h, t, l, E }) => { E.addSt(s, h, t, 'grave', L([1, 1, 2, 2], l)); E.heal(s, t, E.st(s, t).maxHp * 0.1, h); },
      } },
      e: { name: 'Теневая волна', icon: '🌊', card: {
        mana: [70, 80, 90, 100], tg: 'none',
        desc: l => `Исцеляет всех союзников в зоне на <b>${L([120, 170, 220, 270], l)}</b> и наносит столько же магического урона всем врагам в зоне.`,
        play: ({ s, h, l, E }) => { const v = L([120, 170, 220, 270], l); for (const a of E.friends(s, h)) E.heal(s, a, v, h); for (const f of E.foes(s, h)) E.dmg(s, h, f, v, 'magic'); },
      } },
      r: { name: 'Переплетение', icon: '🕸️', card: {
        mana: [100, 150, 200], tg: 'none',
        desc: l => `Союзники в зоне получают <b>+${L([8, 12, 16], l)}</b> брони, враги в зоне — <b>−${L([8, 12, 16], l)}</b> брони на 3 хода.`,
        play: ({ s, h, l, E }) => { const v = L([8, 12, 16], l) * (1 + E.st(s, h).ultBoost); for (const a of E.friends(s, h)) E.addSt(s, h, a, 'armor', 3, v); for (const f of E.foes(s, h)) E.addSt(s, h, f, 'armorRed', 3, -v); },
      } },
    },
  });

  hero('void', {
    name: 'Void Spirit', title: 'Дух пустоты', attr: 'uni', roles: ['mid', 'escape', 'nuker'], pos: [2, 3],
    str: 23, agi: 19, int: 24, gs: 2.8, ga: 2.2, gi: 3.1, dmg: 32, armor: 3, ranged: false, hue: 245,
    lore: 'Неуловимый дух, шагающий сквозь пространство и оставляющий за собой эфирные следы.',
    build: ['boots', 'kaya', 'blink', 'bkb', 'aghs', 'dagon', 'butterfly'],
    skillOrder: ['e', 'w', 'e', 'q', 'e', 'r', 'e', 'w', 'w', 'w', 'r', 'q', 'q', 'q', 'r'],
    skills: {
      q: { name: 'Эфирный след', icon: '👣', card: {
        mana: [110, 115, 120, 125], tg: 'enemyNear',
        desc: l => `След притягивает врага из соседней зоны к Духу, наносит <b>${L([80, 140, 200, 260], l)}</b> магического урона и <b>оглушает</b> на 1 ход.`,
        play: ({ s, h, t, l, E }) => { if (t.zone !== h.zone) E.moveTo(s, t, h.zone, true); E.dmg(s, h, t, L([80, 140, 200, 260], l), 'magic'); E.addSt(s, h, t, 'stun', 1); },
      } },
      w: { name: 'Растворение', icon: '🌫️', card: {
        mana: [120, 120, 120, 120], tg: 'zoneAdjOrSame', moves: true,
        desc: l => `Дух растворяется и возникает в своей или соседней зоне, нанося там всем врагам <b>${L([120, 190, 260, 330], l)}</b> магического урона.`,
        play: ({ s, h, t, l, E }) => { if (t !== h.zone) E.moveTo(s, h, t, true); for (const f of E.foes(s, h)) E.dmg(s, h, f, L([120, 190, 260, 330], l), 'magic'); },
      } },
      e: { name: 'Резонансный импульс', icon: '🔊', card: {
        mana: [100, 110, 120, 130], tg: 'none',
        desc: l => `Щит на <b>${L([80, 130, 180, 230], l)}</b> урона (2 хода) и <b>${L([70, 120, 170, 220], l)}</b> магического урона всем врагам в зоне.`,
        play: ({ s, h, l, E }) => { E.addSt(s, h, h, 'shield', 2, L([80, 130, 180, 230], l)); for (const f of E.foes(s, h)) E.dmg(s, h, f, L([70, 120, 170, 220], l), 'magic'); },
      } },
      r: { name: 'Астральный шаг', icon: '✨', card: {
        mana: [75, 75, 75], tg: 'enemyNear', attack: true, moves: true,
        desc: l => `Шаг сквозь пространство к цели: атака 100% и <b>${L([150, 250, 350], l)}</b> магического урона, цель обездвижена на 1 ход.`,
        play: ({ s, h, t, l, E }) => { if (t.zone !== h.zone) E.moveTo(s, h, t.zone, true); E.atk(s, h, t, 1.0); if (!t.dead) { E.dmg(s, h, t, L([150, 250, 350], l) * (1 + E.st(s, h).ultBoost), 'magic'); E.addSt(s, h, t, 'root', 1); } },
      } },
    },
  });

  /* ---------------- Items ---------------- */
  D.ITEMS = {};
  function item(id, def) { def.id = id; D.ITEMS[id] = def; if (def.card) { def.card.kind = 'item'; def.card.item = id; def.card.name = def.card.name || def.name; def.card.icon = def.card.icon || def.icon; card('item_' + id, def.card); def.cardId = 'item_' + id; } }
  item('boots', { name: 'Сапоги скорости', icon: '👢', cost: 500, add: { moves: 1 }, desc: '+1 перемещение за ход.' });
  item('wand', { name: 'Волшебная палочка', icon: '🪄', cost: 450, add: { all: 4 }, desc: '+4 ко всем атрибутам.' });
  item('treads', { name: 'Силовые ботинки', icon: '🥾', cost: 1400, upgrade: 'boots', add: { moves: 1, primary: 12, as: 10 }, desc: '+1 перемещение, +12 к основному атрибуту, +10 скорости атаки. Улучшает Сапоги скорости.' });
  item('kaya', { name: 'Кайя', icon: '📿', cost: 2100, add: { int: 16, amp: 0.12 }, desc: '+16 к интеллекту, +12% усиления заклинаний.' });
  item('glimmer', { name: 'Мерцающий плащ', icon: '🧥', cost: 1950, add: { mres: 0.15, armor: 3 }, desc: '+15% сопр. магии, +3 брони.', card: {
    mana: 50, tg: 'allyNear', desc: () => 'Союзник (своя или соседняя зона) становится <b>невидимым</b> на 1 ход и получает +45% сопр. магии.',
    play: ({ s, h, t, E }) => { E.addSt(s, h, t, 'invis', 1); E.addSt(s, h, t, 'mres', 1, 0.45); } } });
  item('meka', { name: 'Механизм', icon: '⚙️', cost: 1775, add: { armor: 4, all: 4 }, desc: '+4 брони, +4 ко всем атрибутам.', card: {
    mana: 100, tg: 'none', desc: () => 'Союзники в зоне восстанавливают <b>250</b> здоровья и получают +5 брони на 2 хода.',
    play: ({ s, h, E }) => { for (const a of E.friends(s, h)) { E.heal(s, a, 250, h); E.addSt(s, h, a, 'armor', 2, 5); } } } });
  item('blink', { name: 'Блинк-кинжал', icon: '🗡️', cost: 2250, add: {}, desc: 'Даёт карту «Блинк».', card: {
    name: 'Блинк', mana: 0, tg: 'zone2', moves: true, desc: () => 'Мгновенный перенос в зону на расстоянии до 2 шагов. Можно <b>сыграть ещё одну карту</b> в этот ход.',
    play: ({ s, h, t, E }) => { E.moveTo(s, h, t, true); s.turn.cards += 1; } } });
  item('dagon', { name: 'Дагон', icon: '🔴', cost: 2700, add: { int: 15, all: 3 }, desc: '+15 к интеллекту, +3 ко всем атрибутам.', card: {
    mana: 120, tg: 'enemyNear', desc: () => 'Луч энергии: <b>400</b> магического урона врагу в своей или соседней зоне.',
    play: ({ s, h, t, E }) => E.dmg(s, h, t, 400, 'magic') } });
  item('bkb', { name: 'Black King Bar', icon: '🟨', cost: 4050, add: { str: 10, dmg: 24 }, desc: '+10 к силе, +24 урона.', card: {
    name: 'Аватар (BKB)', mana: 0, tg: 'none', desc: () => '<b>Невосприимчивость к магии</b> на 2 хода и снятие всех негативных эффектов.',
    play: ({ s, h, E }) => { E.cleanse(s, h); E.addSt(s, h, h, 'immune', 2); } } });
  item('bfury', { name: 'Боевая ярость', icon: '🪓', cost: 4100, add: { dmg: 55, farm: 0.35, cleaveMax: 0.3, regen: 6 }, desc: '+55 урона, +35% золота с фарма, рассекающие атаки 30%.' });
  item('deso', { name: 'Дезолятор', icon: '🔻', cost: 3500, add: { dmg: 50, desoArmor: 6 }, desc: '+50 урона, атаки снижают броню цели на 6 (2 хода).' });
  item('mkb', { name: 'Monkey King Bar', icon: '🐒', cost: 4975, add: { dmg: 40, as: 45, trueStrike: true }, desc: '+40 урона, +45 скорости атаки, атаки не промахиваются.' });
  item('daedalus', { name: 'Дедал', icon: '🎯', cost: 5100, add: { dmg: 88, crits: [[0.3, 2.25]] }, desc: '+88 урона, 30% шанс крита ×2.25.' });
  item('butterfly', { name: 'Бабочка', icon: '🦋', cost: 4975, add: { agi: 35, dmg: 25, evasion: [0.35] }, desc: '+35 к ловкости, +25 урона, 35% уклонения.' });
  item('satanic', { name: 'Сатаник', icon: '😈', cost: 5050, add: { str: 25, dmg: 38, ls: 0.25 }, desc: '+25 к силе, +38 урона, 25% вампиризма.', card: {
    name: 'Нечестивая ярость', mana: 0, tg: 'enemyOrRosh', attack: true, desc: () => 'Атака 150% урона со <b>175% вампиризма</b>.',
    play: ({ s, h, t, E }) => E.atk(s, h, t, 1.5, { lsBonus: 1.75 }) } });
  item('heart', { name: 'Сердце Тарраска', icon: '❤️', cost: 5000, add: { str: 40, hp: 250, regenPct: 0.06 }, desc: '+40 к силе, +250 здоровья, +6% регенерации здоровья за ход.' });
  item('ac', { name: 'Кираса', icon: '🛡️', cost: 5125, add: { armor: 12, as: 35, all: 4 }, desc: '+12 брони, +35 скорости атаки, +4 ко всем атрибутам.' });
  item('aghs', { name: 'Скипетр Аганима', icon: '🔱', cost: 4200, add: { all: 10, hp: 175, mp: 175, ultBoost: 0.3 }, desc: '+10 ко всем атрибутам, +175 здоровья и маны. Ультимейт сильнее на 30%.' });
  item('vyse', { name: 'Сфера Вайса', icon: '🐷', cost: 5675, add: { int: 35, all: 6 }, desc: '+35 к интеллекту, +6 ко всем атрибутам.', card: {
    name: 'Превращение', mana: 150, tg: 'enemyNear', desc: () => 'Превращает врага (своя или соседняя зона) в поросёнка на <b>2 хода</b>.',
    play: ({ s, h, t, E }) => E.addSt(s, h, t, 'hex', 2) } });
  D.ITEM_ORDER = ['boots', 'wand', 'treads', 'meka', 'glimmer', 'kaya', 'blink', 'dagon', 'deso', 'bkb', 'bfury', 'aghs', 'mkb', 'butterfly', 'heart', 'satanic', 'daedalus', 'ac', 'vyse'];

  /* ---------------- Talents ---------------- */
  D.TALENTS = {
    10: [{ id: 't10a', name: '+275 к здоровью', add: { hp: 275 } }, { id: 't10b', name: '+30 к урону атаки', add: { dmg: 30 } }],
    15: [{ id: 't15a', name: '+14% усиления заклинаний', add: { amp: 0.14 } }, { id: 't15b', name: '+12 ко всем атрибутам', add: { all: 12 } }],
    20: [{ id: 't20a', name: '+12 брони', add: { armor: 12 } }, { id: 't20b', name: '+20% вампиризма', add: { ls: 0.2 } }],
  };
})(typeof window !== 'undefined' ? window : globalThis);
