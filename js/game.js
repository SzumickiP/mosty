(function () {
  'use strict';

  const { Sim, MATERIALS, VEHICLES, key, Geo } = window.Physics;

  // Dwie wersje gry: każda ma własne plansze, rozdziały i zapis postępów
  const VARIANTS = {
    civil: {
      name: 'Cywilna', levels: window.LEVELS, chapters: window.CHAPTERS, prefix: 'civil.',
    },
    military: {
      name: 'Militarna', levels: window.MIL_LEVELS, chapters: window.MIL_CHAPTERS, prefix: 'mil.',
    },
  };

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');

  // ---------- Zapis postępów ----------
  // Klucz null oznacza brak wybranego gracza – wtedy nic nie jest zapisywane.
  const store = {
    get(k, def) { if (!k) return def; try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set(k, v) { if (!k) return; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* brak dostępu */ } },
    keys() { try { return Object.keys(localStorage); } catch (e) { return []; } },
    remove(k) { try { localStorage.removeItem(k); } catch (e) { /* brak dostępu */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Gracze ----------
  // Każdy gracz ma własne klucze: mosty2.u.<id>.<wersja>.progress / design.<n> / lastLevel
  let users = store.get('mosty2.users', []);
  let currentUser = null;
  let progressByVariant = {};
  const userPrefix = (uid) => `mosty2.u.${uid}.`;
  const readProgress = (uid, variant) =>
    Object.assign({ unlocked: 1, best: {} }, store.get(userPrefix(uid) + VARIANTS[variant].prefix + 'progress', {}));

  function setUser(uid) {
    currentUser = users.find(u => u.id === uid) || null;
    store.set('mosty2.currentUser', currentUser ? currentUser.id : null);
    progressByVariant = {};
    for (const id of Object.keys(VARIANTS)) {
      progressByVariant[id] = currentUser ? readProgress(currentUser.id, id) : { unlocked: 1, best: {} };
    }
    $('user-name').textContent = currentUser ? currentUser.name : 'Wybierz gracza';
  }

  function createUser(rawName) {
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (!name) return 'Wpisz imię lub ksywkę';
    if (name.length > 20) return 'Najwyżej 20 znaków';
    if (users.some(u => u.name.toLowerCase() === name.toLowerCase())) return 'Taki gracz już istnieje';
    const user = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, created: Date.now() };
    users.push(user);
    store.set('mosty2.users', users);
    if (users.length === 1) migrateLegacy(user.id);
    return user;
  }

  function deleteUser(uid) {
    const prefix = userPrefix(uid);
    for (const k of store.keys()) if (k.startsWith(prefix)) store.remove(k);
    users = users.filter(u => u.id !== uid);
    store.set('mosty2.users', users);
    if (currentUser && currentUser.id === uid) setUser(null);
  }

  // Postęp z wersji gry sprzed profili graczy przechodzi na pierwszego utworzonego gracza
  function migrateLegacy(uid) {
    const p = userPrefix(uid);
    for (const k of store.keys()) {
      let m = k.match(/^mosty2\.mil\.(progress|lastLevel|design\.\d+)$/);
      let target = m && p + 'mil.' + m[1];
      if (!m) {
        m = k.match(/^mosty2\.(progress|lastLevel|design\.\d+)$/);
        target = m && p + 'civil.' + m[1];
      }
      if (!target) continue;
      try { localStorage.setItem(target, localStorage.getItem(k)); } catch (e) { /* brak dostępu */ }
      store.remove(k);
    }
    if (store.get('mosty2.variant')) store.set(p + 'variant', store.get('mosty2.variant'));
  }

  // ---------- Stan gry ----------
  const S = {
    variant: 'civil',
    li: 0,
    level: null,
    beams: [],          // { a:[x,y], b:[x,y], type, charge? }
    history: [],
    mode: 'build',      // 'build' | 'test'
    tool: 'road',
    pending: null,      // węzeł, od którego rysujemy element
    dragStart: null,
    hover: null,        // najbliższy punkt siatki
    mouse: null,        // pozycja w świecie
    sim: null,
    result: null,
    resultShown: false,
    panel: null,        // rodzaj otwartego panelu
    view: { s: 30, ox: 0, oy: 0 },
  };
  const V = () => VARIANTS[S.variant];
  const LV = () => V().levels;
  const progress = () => progressByVariant[S.variant];
  // Klucz zapisu bieżącego gracza w bieżącej wersji gry
  const ukey = (suffix) => (currentUser ? userPrefix(currentUser.id) + V().prefix + suffix : null);
  const saveProgress = () => store.set(ukey('progress'), progress());
  const military = () => S.variant === 'military';

  // ---------- Geometria ----------
  const W2S = (x, y) => [S.view.ox + x * S.view.s, S.view.oy - y * S.view.s];
  const S2W = (sx, sy) => [(sx - S.view.ox) / S.view.s, (S.view.oy - sy) / S.view.s];
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  const { pointInPoly, distToSeg } = Geo;
  const insideTerrain = (x, y) => Geo.insideTerrain(S.level, x, y);
  function groundY(x) {
    let best = -Infinity;
    for (const poly of S.level.terrain) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) {
          const y = a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
          if (y > best) best = y;
        }
      }
    }
    return best;
  }

  const isAnchor = (p) => Geo.isAnchor(S.level, p);
  const validPoint = (p) => Geo.validPoint(S.level, p);
  const totalCost = () => Geo.designCost(S.beams);
  const chargeCount = () => S.beams.filter(b => b.charge).length;
  function nodeExists(p) {
    return isAnchor(p) || S.beams.some(b => same(b.a, p) || same(b.b, p));
  }

  // ---------- Edycja mostu ----------
  const checkBeam = (a, b, type) => Geo.checkBeam(S.level, a, b, type);

  function addBeam(a, b, type) {
    const err = checkBeam(a, b, type);
    if (err) { toast(err); return false; }
    const existing = S.beams.findIndex(x => (same(x.a, a) && same(x.b, b)) || (same(x.a, b) && same(x.b, a)));
    if (existing >= 0 && S.beams[existing].type === type) return true;
    pushHistory();
    if (existing >= 0) S.beams.splice(existing, 1);
    S.beams.push({ a: [a[0], a[1]], b: [b[0], b[1]], type });
    onDesignChanged();
    return true;
  }

  function beamAt(wx, wy) {
    let best = -1, bestD = 0.35;
    S.beams.forEach((b, i) => {
      const d = distToSeg(wx, wy, b.a[0], b.a[1], b.b[0], b.b[1]);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function removeBeamAt(wx, wy) {
    const i = beamAt(wx, wy);
    if (i < 0) return false;
    pushHistory();
    S.beams.splice(i, 1);
    onDesignChanged();
    return true;
  }

  // Dynamit: zakładanie / zdejmowanie ładunku z belki lub liny
  function toggleChargeAt(wx, wy) {
    const i = beamAt(wx, wy);
    if (i < 0) return;
    const b = S.beams[i];
    if (b.type === 'road') { toast('Ładunek można założyć tylko na belkę lub linę'); return; }
    if (!b.charge && chargeCount() >= S.level.charges) {
      toast(`Masz tylko ${S.level.charges} ${plural(S.level.charges, 'ładunek', 'ładunki', 'ładunków')}`);
      return;
    }
    pushHistory();
    b.charge = !b.charge;
    if (!b.charge) delete b.charge;
    onDesignChanged();
  }

  function plural(n, one, few, many) {
    if (n === 1) return one;
    const d = n % 10, t = n % 100;
    return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
  }

  function pushHistory() {
    S.history.push(JSON.stringify(S.beams));
    if (S.history.length > 200) S.history.shift();
  }
  function undo() {
    if (S.mode !== 'build' || !S.history.length) return;
    S.beams = JSON.parse(S.history.pop());
    S.pending = null;
    onDesignChanged();
  }
  function clearDesign() {
    if (S.mode !== 'build' || !S.beams.length) return;
    pushHistory();
    S.beams = [];
    S.pending = null;
    onDesignChanged();
  }
  function onDesignChanged() {
    store.set(ukey('design.' + S.li), S.beams);
    updateHud();
  }

  // ---------- Plansze ----------
  function setVariant(id) {
    S.variant = id;
    if (currentUser) store.set(userPrefix(currentUser.id) + 'variant', id);
    document.body.classList.toggle('military', id === 'military');
    if (!military() && S.tool === 'charge') S.tool = 'road';
  }

  function loadLevel(i) {
    S.li = i;
    S.level = LV()[i];
    S.beams = store.get(ukey('design.' + i), []);
    if (!military()) S.beams.forEach(b => delete b.charge);
    S.history = [];
    S.pending = null;
    S.dragStart = null;
    store.set(ukey('lastLevel'), i);
    stopTest();
    $('level-num').textContent = i + 1;
    $('level-name').textContent = S.level.name;
    $('budget-max').textContent = S.level.budget.toLocaleString('pl-PL');
    setHint();
    fitView();
    updateHud();
  }

  const vehicleList = (types) => {
    const counts = {};
    for (const t of types) counts[t] = (counts[t] || 0) + 1;
    return Object.entries(counts).map(([t, n]) => (n > 1 ? `${n}× ` : '') + VEHICLES[t].name.toLowerCase()).join(', ');
  };

  function setHint() {
    const lv = S.level;
    if (S.mode === 'build') {
      if (lv.military) {
        $('hint').innerHTML =
          `<b>Misja:</b> przeprowadź sojuszników (${vehicleList(lv.spec.allies)}) do flagi, potem wysadź most, ` +
          `zanim przejedzie wróg (${vehicleList(lv.spec.enemies)}). ${lv.hint}<br>` +
          `<b>🧨 Dynamit</b> (${lv.charges}): kliknij belkę lub linę. W trakcie testu: <b>Detonuj</b> albo klawisz D.`;
      } else {
        $('hint').innerHTML =
          `<b>Cel:</b> przeprowadź pojazd (${VEHICLES[lv.vehicle].name.toLowerCase()}) na drugą stronę, do flagi. ${lv.hint}<br>` +
          `Kliknij węzeł lub <b>czerwoną kotwę</b>, potem punkt siatki. Prawy przycisk – anuluj / usuń.`;
      }
    } else if (!lv.military) {
      $('hint').innerHTML = `<b>Test:</b> kolory pokazują naprężenie elementów. Spacja – powrót do budowy.`;
    } else {
      updateMissionStatus(true);
    }
  }

  let lastStatus = '';
  function updateMissionStatus(force) {
    const sim = S.sim;
    if (!sim || !S.level.military) return;
    const allies = sim.vehicles.filter(v => v.team === 'ally');
    const enemies = sim.vehicles.filter(v => v.team === 'enemy');
    const crossed = allies.filter(v => v.crossed).length;
    const enemyState = enemies.every(v => v.state === 'waiting') ? 'czeka'
      : enemies.every(v => v.fell) ? 'zniszczony'
      : enemies.some(v => v.state === 'active' && !v.fell) ? '<span class="warn">nadjeżdża!</span>' : '—';
    const html = `<b>Sojusznicy:</b> ${crossed} / ${allies.length} po drugiej stronie · <b>Wróg:</b> ${enemyState} · ` +
      (sim.detonated ? '<b>Ładunki zdetonowane</b>' : `<b>Ładunki:</b> ${chargeCount()} – naciśnij D, aby zdetonować`);
    if (force || html !== lastStatus) { $('hint').innerHTML = html; lastStatus = html; }
  }

  // ---------- Test ----------
  function startTest() {
    if (S.mode === 'test') return;
    if (totalCost() > S.level.budget) { toast('Przekroczony budżet – usuń część elementów'); return; }
    if (military() && !chargeCount()) toast('Nie założyłeś żadnego ładunku – mostu nie da się wysadzić', true);
    S.mode = 'test';
    S.pending = null;
    S.sim = new Sim(S.level, { beams: S.beams });
    S.result = null;
    S.resultShown = false;
    S.acc = 0;
    updateHud();
    setHint();
  }
  function stopTest() {
    S.mode = 'build';
    S.sim = null;
    S.result = null;
    hideOverlay();
    updateHud();
    if (S.level) setHint();
  }
  function detonate() {
    if (S.mode !== 'test' || !S.sim || S.sim.detonated) return;
    if (!S.sim.constraints.some(c => c.charge && !c.broken)) { toast('Brak ładunków na moście'); return; }
    S.sim.detonate();
    S.shakeUntil = performance.now() + 450;
    updateHud();
  }

  function stars(cost, budget) {
    const r = cost / budget;
    return r <= 0.7 ? 3 : r <= 0.85 ? 2 : 1;
  }

  function checkResult() {
    if (S.result) return;
    S.result = S.sim.result();
    if (S.result) S.resultAt = S.sim.time;
  }

  function showResult() {
    S.resultShown = true;
    const r = S.result;
    const sim = S.sim;
    const levels = LV();
    if (r.win) {
      const cost = totalCost();
      const st = stars(cost, S.level.budget);
      const p = progress();
      const best = p.best[S.li];
      if (!best || cost < best.cost) p.best[S.li] = { cost, stars: st, date: Date.now() };
      p.unlocked = Math.max(p.unlocked, Math.min(levels.length, S.li + 2));
      saveProgress();
      const last = S.li === levels.length - 1;
      const costLine = `Koszt: <b>${cost.toLocaleString('pl-PL')} zł</b> z ${S.level.budget.toLocaleString('pl-PL')} zł.
        ${st < 3 ? `Trzy gwiazdki za koszt do ${Math.floor(S.level.budget * 0.7).toLocaleString('pl-PL')} zł.` : 'Wzorowa, oszczędna konstrukcja.'}`;
      const body = S.level.military
        ? `<h2>Misja wykonana!</h2>
           <div class="big-stars">${starsHtml(st)}</div>
           <p>Sojusznicy przejechali, a wróg został zatrzymany.
           ${r.enemiesFell ? `Do przepaści wpadło wrogich pojazdów: <b>${r.enemiesFell} / ${r.enemies}</b>.` : ''}<br>${costLine}</p>`
        : `<h2>Most wytrzymał!</h2>
           <div class="big-stars">${starsHtml(st)}</div>
           <p>${costLine}${sim.brokenCount ? `<br>Uwaga: pękło elementów: ${sim.brokenCount}.` : ''}</p>`;
      showPanel('result', `${body}
        <div class="actions">
          <button class="btn" data-act="build">Popraw most</button>
          <button class="btn" data-act="menu">Plansze</button>
          ${last ? '' : '<button class="btn btn-primary" data-act="next">Następna plansza ▶</button>'}
        </div>`);
    } else {
      let tip = 'Spójrz, które elementy świecą na czerwono – to one były najbardziej przeciążone. Pamiętaj: trójkąty są sztywne, prostokąty się składają.';
      if (S.level.military) {
        const enemyCrossed = sim.vehicles.some(v => v.team === 'enemy' && v.crossed);
        if (enemyCrossed && !sim.detonated) tip = 'Nie zdetonowałeś ładunków. Gdy ostatni sojusznik zjedzie z mostu, naciśnij „Detonuj” albo klawisz D.';
        else if (enemyCrossed) tip = 'Most nie zawalił się wystarczająco. Załóż ładunki na belki, bez których konstrukcja się nie utrzyma.';
        else if (sim.detonated && sim.vehicles.some(v => v.team === 'ally' && v.fell)) tip = 'Wysadziłeś most za wcześnie albo nie wytrzymał przejazdu. Poczekaj, aż wszyscy sojusznicy zjadą z mostu.';
      }
      showPanel('result', `
        <h2>${S.level.military ? 'Misja nieudana' : 'Most nie wytrzymał'}</h2>
        <p>${r.msg} ${tip}</p>
        <div class="actions">
          <button class="btn" data-act="watch">Oglądaj dalej</button>
          <button class="btn btn-primary" data-act="build">Wróć do budowy</button>
        </div>`);
    }
  }

  // ---------- Panele ----------
  function starsHtml(n) {
    return '<span class="stars">' + [0, 1, 2].map(i => i < n ? '★' : '<span class="off">★</span>').join('') + '</span>';
  }
  function showPanel(kind, html, wide) {
    S.panel = kind;
    $('panel').innerHTML = html;
    $('panel').classList.toggle('wide', !!wide);
    $('overlay').classList.remove('hidden');
  }
  function hideOverlay() { $('overlay').classList.add('hidden'); S.panel = null; }

  const starsOf = (id) => Object.values(progressByVariant[id].best).reduce((s, b) => s + b.stars, 0);

  // Pasek z nazwą gracza na górze ekranu startowego i menu
  const userBar = () => `
    <div class="user-bar">
      <span>Grasz jako <b>${esc(currentUser.name)}</b></span>
      <span class="user-bar-actions">
        <button class="btn btn-small" data-act="users">👤 Zmień gracza</button>
        <button class="btn btn-small" data-act="scores">🏆 Tabela wyników</button>
      </span>
    </div>`;

  function showStart() {
    if (!currentUser) { showUsers(); return; }
    const card = (id, icon, desc) => {
      const v = VARIANTS[id];
      return `<button class="mode-card mode-${id}" data-variant="${id}">
        <div class="mode-icon">${icon}</div>
        <div class="mode-name">Wersja ${v.name.toLowerCase()}</div>
        <div class="mode-desc">${desc}</div>
        <div class="mode-meta"><span class="stars">★ ${starsOf(id)} / ${v.levels.length * 3}</span> · ${v.levels.length} plansz</div>
      </button>`;
    };
    showPanel('start', `
      <div class="start-title">
        <h1>Mosty</h1>
        <p>Projektuj stalowe mosty na siatce technicznej i sprawdzaj je pod obciążeniem.</p>
      </div>
      ${userBar()}
      <div class="modes">
        ${card('civil', '🌉', 'Buduj mosty nad przepaściami dla aut, ciężarówek i cystern. Zmieść się w budżecie i przeprowadź pojazd na drugą stronę.')}
        ${card('military', '🧨', 'Zbuduj przeprawę dla kolumny wojska. Gdy sojusznicy przejadą, wysadź most dynamitem, zanim przejedzie wróg.')}
      </div>`, true);
  }

  // Podsumowanie gracza: gwiazdki i zaliczone plansze w obu wersjach
  function userSummary(uid) {
    let stars = 0, done = 0, total = 0;
    for (const id of Object.keys(VARIANTS)) {
      const best = readProgress(uid, id).best;
      for (const b of Object.values(best)) { stars += b.stars; done++; }
      total += VARIANTS[id].levels.length;
    }
    return { stars, done, total };
  }

  function showUsers(error, typed) {
    const list = users.map(u => {
      const sum = userSummary(u.id);
      const cur = currentUser && currentUser.id === u.id;
      return `<div class="user-row${cur ? ' current' : ''}">
        <button class="user-pick" data-user="${u.id}">
          <span class="user-avatar">${esc(u.name.charAt(0).toUpperCase())}</span>
          <span class="user-info"><b>${esc(u.name)}</b>
            <small>★ ${sum.stars} · zaliczone plansze: ${sum.done} / ${sum.total}${cur ? ' · gra teraz' : ''}</small></span>
        </button>
        <button class="btn btn-small btn-ghost" data-del-user="${u.id}" title="Usuń gracza">🗑</button>
      </div>`;
    }).join('');
    showPanel('users', `
      <div class="start-title">
        <h1>Mosty</h1>
        <p>${users.length ? 'Wybierz, kto gra, albo dodaj nowego gracza.' : 'Witaj! Utwórz gracza, żeby gra zapamiętywała Twoje postępy.'}</p>
      </div>
      ${users.length ? `<div class="user-list">${list}</div>` : ''}
      <form class="user-form" id="user-form" autocomplete="off">
        <input id="user-input" maxlength="20" placeholder="Imię lub ksywka nowego gracza" value="${esc(typed || '')}">
        <button class="btn btn-primary" type="submit">＋ Utwórz gracza</button>
      </form>
      <div class="form-error">${error ? esc(error) : ''}</div>
      ${users.length ? `<div class="actions">
        ${currentUser ? '<button class="btn" data-act="start">← Wróć</button>' : ''}
        <button class="btn" data-act="scores">🏆 Tabela wyników</button>
      </div>` : ''}`);
    const input = $('user-input');
    if (input && (!users.length || error)) input.focus();
  }

  function chooseUser(uid) {
    setUser(uid);
    const saved = store.get(userPrefix(uid) + 'variant', 'civil');
    setVariant(saved === 'military' ? 'military' : 'civil');
    loadLevel(Math.min(progress().unlocked - 1, store.get(ukey('lastLevel'), 0)));
    showStart();
  }

  function confirmDelete(uid) {
    const u = users.find(x => x.id === uid);
    if (!u) return;
    showPanel('confirm', `
      <h2>Usunąć gracza ${esc(u.name)}?</h2>
      <p>Wszystkie postępy i zapisane mosty tego gracza zostaną skasowane. Tego nie da się cofnąć.</p>
      <div class="actions">
        <button class="btn" data-act="users">Anuluj</button>
        <button class="btn btn-danger" data-confirm-del="${u.id}">Usuń gracza</button>
      </div>`);
  }

  // Tabela wyników: ranking graczy i najlepsze wyniki na każdej planszy
  function showScores(variant) {
    variant = variant || S.variant;
    const levels = VARIANTS[variant].levels;
    const rows = users.map(u => {
      const best = readProgress(u.id, variant).best;
      const list = Object.values(best);
      return {
        u, best,
        stars: list.reduce((s, b) => s + b.stars, 0),
        done: list.length,
        cost: list.reduce((s, b) => s + b.cost, 0),
      };
    }).sort((a, b) => b.stars - a.stars || b.done - a.done || a.cost - b.cost);

    const money = (n) => n.toLocaleString('pl-PL') + ' zł';
    const isMe = (r) => currentUser && r.u.id === currentUser.id;
    const ranking = rows.length ? `
      <div class="table-wrap"><table class="scores">
        <thead><tr><th>#</th><th>Gracz</th><th>Zaliczone</th><th>Gwiazdki</th><th>Łączny koszt</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr class="${isMe(r) ? 'me' : ''}">
          <td>${['🥇', '🥈', '🥉'][i] || i + 1}</td>
          <td>${esc(r.u.name)}</td>
          <td>${r.done} / ${levels.length}</td>
          <td><span class="stars">★ ${r.stars}</span></td>
          <td>${r.done ? money(r.cost) : '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : '<p>Nie ma jeszcze żadnych graczy.</p>';

    const perLevel = rows.length ? `
      <div class="table-wrap"><table class="scores levels-table">
        <thead><tr><th>Plansza</th>${rows.map(r => `<th class="${isMe(r) ? 'me' : ''}">${esc(r.u.name)}</th>`).join('')}</tr></thead>
        <tbody>${levels.map((lv, i) => {
          const costs = rows.map(r => r.best[i] ? r.best[i].cost : Infinity);
          const top = Math.min(...costs);
          return `<tr><td class="lv"><b>${i + 1}.</b> ${lv.name}</td>${rows.map((r, k) => {
            const b = r.best[i];
            if (!b) return '<td class="none">—</td>';
            const date = b.date ? new Date(b.date).toLocaleDateString('pl-PL') : '';
            return `<td class="${costs[k] === top && rows.length > 1 ? 'top' : ''}" title="${date ? 'Zaliczona ' + date : ''}">
              ${starsHtml(b.stars)}<small>${money(b.cost)}</small></td>`;
          }).join('')}</tr>`;
        }).join('')}</tbody>
      </table></div>` : '';

    showPanel('scores', `
      <div class="menu-head"><h1>🏆 Tabela wyników</h1></div>
      <div class="tabs">
        ${Object.entries(VARIANTS).map(([id, v]) =>
          `<button class="tab${id === variant ? ' active' : ''}" data-score-variant="${id}">Wersja ${v.name.toLowerCase()}</button>`).join('')}
      </div>
      <h3 class="section-title">Ranking graczy</h3>
      <p class="section-desc">Kolejność: gwiazdki, potem liczba zaliczonych plansz, potem niższy łączny koszt mostów.</p>
      ${ranking}
      ${perLevel ? `<h3 class="section-title">Zaliczone plansze</h3>
      <p class="section-desc">Najlepszy wynik każdego gracza. Podświetlony jest najtańszy most na planszy.</p>${perLevel}` : ''}
      <div class="actions">
        ${currentUser ? '<button class="btn" data-act="start">← Ekran startowy</button>' : '<button class="btn" data-act="users">← Gracze</button>'}
        ${currentUser && S.level ? '<button class="btn" data-act="close">Zamknij</button>' : ''}
      </div>`, true);
  }

  function showMenu() {
    if (!currentUser) { showUsers(); return; }
    const p = progress();
    const levels = LV();
    const card = (lv, i) => {
      const locked = i >= p.unlocked;
      const best = p.best[i];
      const status = locked ? '🔒 zablokowana'
        : best ? starsHtml(best.stars) + ' ' + best.cost.toLocaleString('pl-PL') + ' zł'
        : 'budżet ' + lv.budget.toLocaleString('pl-PL') + ' zł';
      const sub = lv.military
        ? `${vehicleList(lv.spec.allies)} · 🧨 ${lv.charges}`
        : VEHICLES[lv.vehicle].name;
      return `<button class="level-card${i === S.li ? ' current' : ''}" data-level="${i}" ${locked ? 'disabled' : ''}>
        <div class="n">${i + 1}</div>
        <div class="t">${lv.name}</div>
        <div class="v">${sub}</div>
        <div class="s">${status}</div>
      </button>`;
    };
    const chapters = V().chapters.map((ch, c) => {
      const items = levels.map((lv, i) => [lv, i]).filter(([lv]) => lv.chapter === c);
      const st = items.reduce((s, [, i]) => s + (p.best[i] ? p.best[i].stars : 0), 0);
      return `<section class="chapter">
        <div class="chapter-head"><h3>Rozdział ${c + 1}: ${ch.name}</h3><span class="stars">★ ${st} / ${items.length * 3}</span></div>
        <p class="chapter-desc">${ch.desc}</p>
        <div class="levels">${items.map(([lv, i]) => card(lv, i)).join('')}</div>
      </section>`;
    }).join('');
    showPanel('menu', `
      <div class="menu-head">
        <h1>Mosty <small>· wersja ${V().name.toLowerCase()}</small></h1>
        <span class="stars">★ ${starsOf(S.variant)} / ${levels.length * 3}</span>
      </div>
      ${userBar()}
      ${chapters}
      <div class="actions">
        <button class="btn" data-act="start">← Zmień wersję</button>
        <button class="btn" data-act="close">Zamknij</button>
      </div>`, true);
    const cur = $('panel').querySelector('.level-card.current');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }

  function chooseVariant(id) {
    const changed = id !== S.variant || !S.level;
    setVariant(id);
    if (changed) {
      const p = progress();
      loadLevel(Math.min(p.unlocked - 1, store.get(ukey('lastLevel'), 0)));
    }
    showMenu();
  }

  $('overlay').addEventListener('submit', (e) => {
    if (e.target.id !== 'user-form') return;
    e.preventDefault();
    const typed = $('user-input').value;
    const res = createUser(typed);
    if (typeof res === 'string') { showUsers(res, typed); return; }
    chooseUser(res.id);
  });

  $('overlay').addEventListener('click', (e) => {
    const t = (sel) => e.target.closest(sel);
    let el;
    if ((el = t('[data-variant]'))) { chooseVariant(el.dataset.variant); return; }
    if ((el = t('[data-user]'))) { chooseUser(el.dataset.user); return; }
    if ((el = t('[data-del-user]'))) { confirmDelete(el.dataset.delUser); return; }
    if ((el = t('[data-confirm-del]'))) {
      deleteUser(el.dataset.confirmDel);
      if (!currentUser) stopTest();
      showUsers();
      return;
    }
    if ((el = t('[data-score-variant]'))) { showScores(el.dataset.scoreVariant); return; }
    const lvl = t('[data-level]');
    if (lvl && !lvl.disabled) { hideOverlay(); loadLevel(+lvl.dataset.level); return; }
    const act = t('[data-act]');
    if (!act) {
      if (e.target.id === 'overlay' && (S.panel === 'menu' || (S.panel === 'scores' && currentUser))) hideOverlay();
      return;
    }
    switch (act.dataset.act) {
      case 'build': stopTest(); break;
      case 'next': hideOverlay(); loadLevel(S.li + 1); break;
      case 'menu': showMenu(); break;
      case 'start': showStart(); break;
      case 'users': showUsers(); break;
      case 'scores': showScores(); break;
      case 'close': hideOverlay(); break;
      case 'watch': hideOverlay(); break;
    }
  });

  // ---------- HUD ----------
  function updateHud() {
    if (!S.level) return;
    const cost = totalCost();
    $('cost').textContent = cost.toLocaleString('pl-PL');
    $('budget').classList.toggle('over', cost > S.level.budget);
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === S.tool));
    $('tools').classList.toggle('disabled', S.mode === 'test');
    document.body.classList.toggle('testing', S.mode === 'test');
    $('tool-charge').classList.toggle('hidden', !military());
    if (military()) $('info-charge').textContent = `${chargeCount()} / ${S.level.charges}`;
    const t = $('btn-test');
    t.textContent = S.mode === 'test' ? '■ Stop' : '▶ Testuj';
    t.classList.toggle('stop', S.mode === 'test');
    const det = $('btn-detonate');
    det.classList.toggle('hidden', !(military() && S.mode === 'test'));
    det.disabled = !S.sim || S.sim.detonated;
    $('btn-undo').disabled = !S.history.length;
    $('btn-clear').disabled = !S.beams.length;
    $('btn-undo').classList.toggle('hidden', S.mode === 'test');
    $('btn-clear').classList.toggle('hidden', S.mode === 'test');
    $('legend').classList.toggle('hidden', S.mode !== 'test');
  }
  for (const t of ['road', 'steel', 'cable']) {
    const m = MATERIALS[t];
    $('info-' + t).textContent = `${m.cost} zł/m · ≤${m.maxLen} m`;
    const btn = document.querySelector(`.tool[data-tool="${t}"]`);
    btn.title += ` – ${m.cost} zł/m, maks. ${m.maxLen} m`;
  }

  let toastTimer = 0;
  function toast(msg, info) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.toggle('info', !!info);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function setTool(t) {
    if (S.mode !== 'build') return;
    if (t === 'charge' && !military()) return;
    S.tool = t;
    if (t === 'delete' || t === 'charge') S.pending = null;
    updateHud();
  }

  // ---------- Wejście ----------
  document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('btn-test').addEventListener('click', () => (S.mode === 'test' ? stopTest() : startTest()));
  $('btn-detonate').addEventListener('click', detonate);
  $('btn-undo').addEventListener('click', undo);
  $('btn-clear').addEventListener('click', clearDesign);
  $('btn-menu').addEventListener('click', showMenu);

  function pointerWorld(e) {
    const r = canvas.getBoundingClientRect();
    return S2W(e.clientX - r.left, e.clientY - r.top);
  }
  function updateHover(e) {
    const [wx, wy] = pointerWorld(e);
    S.mouse = [wx, wy];
    S.hover = [Math.round(wx), Math.round(wy)];
  }

  canvas.addEventListener('pointermove', (e) => { updateHover(e); });
  canvas.addEventListener('pointerleave', () => { S.mouse = null; S.hover = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    if (S.mode !== 'build') return;
    updateHover(e);
    canvas.setPointerCapture(e.pointerId);
    const h = S.hover;

    if (e.button === 2) {
      if (S.pending) S.pending = null;
      else removeBeamAt(S.mouse[0], S.mouse[1]);
      return;
    }
    if (e.button !== 0) return;

    if (S.tool === 'delete') { removeBeamAt(S.mouse[0], S.mouse[1]); return; }
    if (S.tool === 'charge') { toggleChargeAt(S.mouse[0], S.mouse[1]); return; }

    if (S.pending) {
      if (same(S.pending, h)) { S.pending = null; return; }
      if (addBeam(S.pending, h, S.tool)) S.pending = h; // rysowanie łańcuchem
      return;
    }
    if (nodeExists(h)) {
      S.pending = h;
      S.dragStart = h;
    } else if (validPoint(h)) {
      toast('Zacznij od istniejącego węzła lub kotwy', true);
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (S.mode !== 'build' || !S.dragStart) return;
    updateHover(e);
    const start = S.dragStart;
    S.dragStart = null;
    if (!same(start, S.hover)) {
      // przeciągnięcie: jeden element i koniec rysowania
      addBeam(start, S.hover, S.tool);
      S.pending = null;
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (S.panel === 'start' || S.panel === 'users' || S.panel === 'confirm') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    switch (e.key) {
      case '1': setTool('road'); break;
      case '2': setTool('steel'); break;
      case '3': setTool('cable'); break;
      case '4': case 'Delete': setTool('delete'); break;
      case '5': setTool('charge'); break;
      case 'd': case 'D': detonate(); break;
      case ' ': e.preventDefault(); S.mode === 'test' ? stopTest() : startTest(); break;
      case 'Escape':
        if (S.panel === 'menu' || S.panel === 'result' || (S.panel === 'scores' && currentUser)) hideOverlay();
        else S.pending = null;
        break;
      case 'm': case 'M': showMenu(); break;
    }
  });

  // ---------- Widok ----------
  function resize() {
    const hud = $('hud').getBoundingClientRect().height;
    $('stage').style.top = hud + 'px';
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fitView();
  }
  function fitView() {
    if (!S.level) return;
    const v = S.level.view;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const pad = 16;
    const s = Math.min((w - pad * 2) / (v.x1 - v.x0), (h - pad * 2) / (v.y1 - v.y0));
    S.view.s = s;
    S.view.ox = (w - s * (v.x1 - v.x0)) / 2 - v.x0 * s;
    S.view.oy = (h + s * (v.y1 - v.y0)) / 2 + v.y0 * s;
  }
  window.addEventListener('resize', resize);

  // ---------- Rysowanie ----------
  const THEME = {
    civil:    { sky: ['#7fb8e6', '#d6ecf7'], rock: '#7a6551', rockLine: '#4b3b2e', grass: '#5d9a3c', hills: 'rgba(90,120,150,0.25)' },
    military: { sky: ['#8c9aa3', '#d8d0b4'], rock: '#6e6650', rockLine: '#443e2f', grass: '#6b7d3a', hills: 'rgba(80,90,80,0.3)' },
  };
  const theme = () => THEME[S.variant];

  function stressColor(r) {
    r = Math.max(0, Math.min(1, r));
    const c1 = [63, 191, 111], c2 = [242, 210, 60], c3 = [229, 83, 75];
    const [a, b, t] = r < 0.5 ? [c1, c2, r * 2] : [c2, c3, (r - 0.5) * 2];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
  }

  function drawBackground(w, h) {
    const build = S.mode === 'build';
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (build) { g.addColorStop(0, '#16324f'); g.addColorStop(1, '#1f4468'); }
    else { g.addColorStop(0, theme().sky[0]); g.addColorStop(1, theme().sky[1]); }
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, w + 40, h + 40);

    // odległe góry
    ctx.fillStyle = build ? 'rgba(120,170,220,0.08)' : theme().hills;
    ctx.beginPath();
    ctx.moveTo(-20, h + 20);
    for (let x = -20; x <= w + 20; x += 8) {
      const t = x / w;
      const y = h * 0.55 - Math.sin(t * 7 + S.li) * h * 0.08 - Math.sin(t * 17 + 1) * h * 0.035;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w + 20, h + 20);
    ctx.fill();
  }

  function drawWater(w, h) {
    const [, wy] = W2S(0, S.level.water);
    const g = ctx.createLinearGradient(0, wy, 0, h);
    g.addColorStop(0, S.mode === 'build' ? '#1d5b80' : '#3a8fc0');
    g.addColorStop(1, S.mode === 'build' ? '#0f3550' : '#1d5b80');
    ctx.fillStyle = g;
    ctx.fillRect(-20, wy, w + 40, h - wy + 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    const t = performance.now() / 1000;
    ctx.beginPath();
    for (let x = -20; x <= w + 20; x += 6) {
      const y = wy + Math.sin(x / 18 + t * 2) * 2;
      x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawTerrain() {
    const build = S.mode === 'build';
    const s = S.view.s;
    for (const poly of S.level.terrain) {
      ctx.beginPath();
      poly.forEach(([x, y], i) => { const [sx, sy] = W2S(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
      ctx.closePath();
      ctx.fillStyle = build ? '#3b4a57' : theme().rock;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // warstwy skalne
      ctx.strokeStyle = build ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      ctx.lineWidth = Math.max(1, s * 0.12);
      for (let y = -40; y < 30; y += 1.6) {
        ctx.beginPath();
        for (let x = -60; x <= 120; x += 2) {
          const [sx, sy] = W2S(x, y + Math.sin(x * 0.7 + y) * 0.25);
          x === -60 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = build ? '#5d7184' : theme().rockLine;
      ctx.lineWidth = 2;
      ctx.stroke();

      // trawa na poziomych krawędziach od góry
      ctx.strokeStyle = build ? '#4f7a5a' : theme().grass;
      ctx.lineWidth = Math.max(3, s * 0.22);
      ctx.lineCap = 'round';
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if (Math.abs(b[1] - a[1]) > 0.01 * Math.abs(b[0] - a[0]) + 0.001) continue;
        const mx = (a[0] + b[0]) / 2, my = a[1];
        if (pointInPoly(mx, my + 0.1, poly)) continue;
        const [x1, y1] = W2S(a[0], a[1]), [x2, y2] = W2S(b[0], b[1]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
  }

  function drawGrid(w, h) {
    const s = S.view.s;
    const [wx0, wy1] = S2W(0, 0), [wx1, wy0] = S2W(w, h);
    const b = S.level.build;

    // przyciemnienie poza obszarem budowy
    const [bx0, by1] = W2S(b.x0, b.y1), [bx1, by0] = W2S(b.x1, b.y0);
    ctx.fillStyle = 'rgba(5,15,30,0.35)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(bx0, by1, bx1 - bx0, by0 - by1);
    ctx.fill('evenodd');

    ctx.lineWidth = 1;
    for (let x = Math.ceil(wx0); x <= wx1; x++) {
      const inside = x >= b.x0 && x <= b.x1;
      ctx.strokeStyle = x % 5 === 0 ? (inside ? 'rgba(140,200,255,0.45)' : 'rgba(140,200,255,0.12)')
                                    : (inside ? 'rgba(140,200,255,0.18)' : 'rgba(140,200,255,0.05)');
      const [sx] = W2S(x, 0);
      ctx.beginPath(); ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, h); ctx.stroke();
    }
    for (let y = Math.ceil(wy0); y <= wy1; y++) {
      const inside = y >= b.y0 && y <= b.y1;
      ctx.strokeStyle = y % 5 === 0 ? (inside ? 'rgba(140,200,255,0.45)' : 'rgba(140,200,255,0.12)')
                                    : (inside ? 'rgba(140,200,255,0.18)' : 'rgba(140,200,255,0.05)');
      const [, sy] = W2S(0, y);
      ctx.beginPath(); ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(w, Math.round(sy) + 0.5); ctx.stroke();
    }

    // ramka obszaru budowy
    ctx.strokeStyle = 'rgba(140,200,255,0.6)';
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(bx0, by1, bx1 - bx0, by0 - by1);
    ctx.setLineDash([]);

    // punkty łączenia (węzły siatki)
    const r = Math.max(1.2, s * 0.05);
    ctx.fillStyle = 'rgba(170,215,255,0.55)';
    for (let x = b.x0; x <= b.x1; x++) {
      for (let y = b.y0; y <= b.y1; y++) {
        if (insideTerrain(x, y)) continue;
        const [sx, sy] = W2S(x, y);
        ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      }
    }

    // podziałka w metrach
    ctx.fillStyle = 'rgba(170,215,255,0.75)';
    ctx.font = `${Math.max(10, Math.min(12, s * 0.4))}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = Math.ceil(b.x0 / 5) * 5; x <= b.x1; x += 5) {
      const [sx] = W2S(x, b.y1);
      ctx.fillText(x + ' m', sx, by1 + 3);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let y = Math.ceil(b.y0 / 5) * 5; y <= b.y1; y += 5) {
      const [, sy] = W2S(b.x0, y);
      ctx.fillText(y + ' m', bx0 + 4, sy - 7);
    }
  }

  function beamPath(ax, ay, bx, by) {
    const [x1, y1] = W2S(ax, ay), [x2, y2] = W2S(bx, by);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  }

  // stress: null w trybie budowy, liczba 0..1 w teście
  function drawBeam(ax, ay, bx, by, type, stress, alpha) {
    const s = S.view.s;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.lineCap = 'round';
    if (type === 'road') {
      beamPath(ax, ay, bx, by);
      ctx.strokeStyle = '#2a2e33'; ctx.lineWidth = s * 0.42; ctx.stroke();
      ctx.strokeStyle = '#4a4f57'; ctx.lineWidth = s * 0.32; ctx.stroke();
      if (stress != null) { ctx.strokeStyle = stressColor(stress); ctx.lineWidth = s * 0.12; ctx.stroke(); }
      else {
        ctx.strokeStyle = '#d9b44a'; ctx.lineWidth = Math.max(1, s * 0.04);
        ctx.setLineDash([s * 0.3, s * 0.3]); ctx.stroke(); ctx.setLineDash([]);
      }
    } else if (type === 'steel') {
      beamPath(ax, ay, bx, by);
      ctx.strokeStyle = '#5a2412'; ctx.lineWidth = s * 0.24; ctx.stroke();
      ctx.strokeStyle = stress != null ? stressColor(stress) : '#c8562e'; ctx.lineWidth = s * 0.17; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = Math.max(1, s * 0.04); ctx.stroke();
    } else if (type === 'cable') {
      beamPath(ax, ay, bx, by);
      ctx.strokeStyle = stress != null ? stressColor(stress) : (S.mode === 'build' ? '#d0d7de' : '#2b2d31');
      ctx.lineWidth = Math.max(1.5, s * 0.07); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  // Pęk laski dynamitu z lontem, przyklejony do środka elementu
  function drawCharge(ax, ay, bx, by) {
    const s = S.view.s;
    const [x1, y1] = W2S(ax, ay), [x2, y2] = W2S(bx, by);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(ang);
    const L = s * 0.55, W = s * 0.13;
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = '#c62828';
      ctx.fillRect(-L / 2, i * W - W / 2, L, W);
      ctx.strokeStyle = '#5c0f0f'; ctx.lineWidth = 1;
      ctx.strokeRect(-L / 2, i * W - W / 2, L, W);
    }
    ctx.fillStyle = '#222';
    ctx.fillRect(-s * 0.05, -W * 1.6, s * 0.1, W * 3.2);
    ctx.restore();
    // lont z iskrą
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath(); ctx.moveTo(mx, my - s * 0.2); ctx.quadraticCurveTo(mx + s * 0.25, my - s * 0.45, mx + s * 0.15, my - s * 0.6); ctx.stroke();
    if (Math.floor(performance.now() / 150) % 2) {
      ctx.fillStyle = '#ffd54a';
      ctx.beginPath(); ctx.arc(mx + s * 0.15, my - s * 0.6, Math.max(2, s * 0.07), 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawExplosions() {
    const sim = S.sim;
    const s = S.view.s;
    for (const e of sim.explosions) {
      const age = sim.time - e.t;
      if (age > 2.5) continue;
      const [sx, sy] = W2S(e.x, e.y);
      // dym
      for (let k = 0; k < 6; k++) {
        const a = k * 1.05 + e.x;
        const r = s * (0.6 + age * 1.2);
        const dx = Math.cos(a) * s * age * 1.4, dy = -s * age * 1.6 + Math.sin(a) * s * age * 0.6;
        ctx.fillStyle = `rgba(70,70,70,${Math.max(0, 0.45 * (1 - age / 2.5))})`;
        ctx.beginPath(); ctx.arc(sx + dx, sy + dy, r, 0, Math.PI * 2); ctx.fill();
      }
      // kula ognia
      if (age < 0.7) {
        const t = age / 0.7;
        const r = s * (0.8 + t * 3.2);
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, `rgba(255,250,210,${1 - t})`);
        g.addColorStop(0.35, `rgba(255,190,60,${0.9 * (1 - t)})`);
        g.addColorStop(0.7, `rgba(230,80,20,${0.6 * (1 - t)})`);
        g.addColorStop(1, 'rgba(230,80,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawNode(x, y, anchor, highlight) {
    const s = S.view.s;
    const [sx, sy] = W2S(x, y);
    if (anchor) {
      ctx.fillStyle = '#b8322a';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - s * 0.35, sy + s * 0.45);
      ctx.lineTo(sx + s * 0.35, sy + s * 0.45);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(sx, sy, s * (anchor ? 0.2 : 0.16), 0, Math.PI * 2);
    ctx.fillStyle = anchor ? '#e5534b' : '#d6dde4';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = highlight ? '#ffbf5a' : '#1b232c';
    ctx.stroke();
  }

  function drawFlag() {
    const x = S.level.finish;
    const gy = groundY(x);
    const s = S.view.s;
    const [sx, sy] = W2S(x, gy);
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - s * 3); ctx.stroke();
    const t = performance.now() / 300;
    ctx.fillStyle = military() ? '#6b7d3a' : '#4cc38a';
    ctx.beginPath();
    ctx.moveTo(sx, sy - s * 3);
    ctx.quadraticCurveTo(sx + s * 0.8, sy - s * (2.75 + Math.sin(t) * 0.1), sx + s * 1.5, sy - s * 2.6);
    ctx.lineTo(sx, sy - s * 2.2);
    ctx.fill();
  }

  const TEAM_COLORS = {
    ally:  { body: '#5d6b34', dark: '#3f4a22', mark: '#f2d23c' },
    enemy: { body: '#4b4f57', dark: '#2e3136', mark: '#d63c3c' },
  };

  // Pojazd rysowany w układzie lokalnym: oś X wzdłuż kół, oś Y prostopadle w górę
  function drawVehicle(w1, w2, rot1, rot2, spec, ghost, team) {
    const s = S.view.s;
    const ux = (w2.x - w1.x), uy = (w2.y - w1.y);
    const L = Math.hypot(ux, uy) || 1;
    const ex = ux / L, ey = uy / L, nx = -ey, ny = ex;
    const P = (lx, ly) => W2S(w1.x + ex * lx + nx * ly, w1.y + ey * lx + ny * ly);
    const wb = spec.wheelbase, r = spec.r, H = spec.height;
    const style = spec.style;
    const tc = TEAM_COLORS[team] || TEAM_COLORS.ally;

    ctx.globalAlpha = ghost ? 0.45 : 1;
    const poly = (pts, fill) => {
      ctx.beginPath();
      pts.forEach(([lx, ly], i) => { const [sx, sy] = P(lx, ly); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    };
    const line = (pts, color, width) => {
      ctx.beginPath();
      pts.forEach(([lx, ly], i) => { const [sx, sy] = P(lx, ly); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    };
    const mark = (lx, ly, size) => poly([[lx - size, ly - size * 0.6], [lx, ly + size * 0.6], [lx + size, ly - size * 0.6]], tc.mark);
    const wheel = (lx, rot, rr) => {
      const [sx, sy] = P(lx, 0);
      ctx.beginPath(); ctx.arc(sx, sy, rr * s, 0, Math.PI * 2);
      ctx.fillStyle = '#1b1d20'; ctx.fill();
      ctx.beginPath(); ctx.arc(sx, sy, rr * s * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#9aa3ad'; ctx.fill();
      ctx.strokeStyle = '#1b1d20'; ctx.lineWidth = Math.max(1, s * 0.05);
      for (let k = 0; k < 3; k++) {
        const a = -rot + (k * Math.PI * 2) / 3;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a) * rr * s * 0.5, sy + Math.sin(a) * rr * s * 0.5); ctx.stroke();
      }
    };

    if (style === 'tank') {
      // gąsienica
      const tr = [];
      for (let a = 0; a <= 12; a++) { const t = Math.PI / 2 + (a / 12) * Math.PI; tr.push([Math.cos(t) * r, Math.sin(t) * r]); }
      for (let a = 0; a <= 12; a++) { const t = -Math.PI / 2 + (a / 12) * Math.PI; tr.push([wb + Math.cos(t) * r, Math.sin(t) * r]); }
      poly(tr, '#26282b');
      for (let k = 0; k <= 4; k++) wheel((wb * k) / 4, k % 2 ? rot1 : rot2, r * 0.62);
      poly([[-r - 0.1, r * 0.7], [wb + r + 0.3, r * 0.7], [wb + r - 0.1, H], [-r + 0.1, H]], tc.body);
      poly([[0.4, H], [wb - 0.6, H], [wb - 0.9, H + 0.55], [0.6, H + 0.55]], tc.dark);
      poly([[wb - 0.8, H + 0.22], [wb + 1.6, H + 0.27], [wb + 1.6, H + 0.37], [wb - 0.8, H + 0.38]], tc.dark);
      mark(0.9 + (wb - 1.5) / 2, H + 0.27, 0.16);
    } else {
      if (style === 'apc') {
        poly([[-0.6, 0.15], [wb + 0.5, 0.15], [wb + 0.9, 0.7], [wb + 0.3, H + 0.3], [-0.6, H + 0.3]], tc.body);
        poly([[0.4, H + 0.3], [1.4, H + 0.3], [1.3, H + 0.55], [0.5, H + 0.55]], tc.dark);
        line([[0.9, H + 0.55], [0.9, H + 1.3]], '#222', Math.max(1, s * 0.03));
        poly([[wb - 0.1, 0.85], [wb + 0.45, 0.85], [wb + 0.25, H + 0.15], [wb - 0.1, H + 0.15]], '#2a2e33');
        mark(wb / 2 - 0.2, 0.75, 0.2);
        wheel(wb / 2, rot1, r);
      } else if (style === 'jeep') {
        poly([[-0.55, 0.15], [wb + 0.6, 0.15], [wb + 0.6, 0.6], [wb - 0.2, 0.7], [-0.55, 0.7]], tc.body);
        poly([[0.1, 0.7], [wb - 0.3, 0.7], [wb - 0.3, 0.8], [0.1, 0.8]], tc.dark);
        line([[wb - 0.25, 0.7], [wb - 0.45, H + 0.35]], '#2a2e33', Math.max(1.5, s * 0.06));
        line([[0.1, 0.7], [0.1, H + 0.2], [wb - 0.45, H + 0.35]], tc.dark, Math.max(1.5, s * 0.05));
        line([[-0.3, 0.7], [-0.4, H + 0.9]], '#222', Math.max(1, s * 0.025));
        const [sx, sy] = P(-0.62, 0.5);
        ctx.beginPath(); ctx.arc(sx, sy, s * 0.28, 0, Math.PI * 2); ctx.fillStyle = '#1b1d20'; ctx.fill();
        mark(wb / 2, 0.42, 0.14);
      } else if (style === 'truck') {
        poly([[-0.7, 0.15], [wb - 1.3, 0.15], [wb - 1.3, H + 0.6], [-0.7, H + 0.6]], '#d8dee4');
        poly([[wb - 1.2, 0.15], [wb + 0.8, 0.15], [wb + 0.8, H - 0.1], [wb + 0.3, H + 0.4], [wb - 1.2, H + 0.4]], '#e0902a');
        poly([[wb - 0.4, H - 0.5], [wb + 0.6, H - 0.5], [wb + 0.3, H + 0.2], [wb - 0.4, H + 0.2]], '#9fd3f0');
      } else if (style === 'tanker') {
        poly([[-0.8, 0.15], [wb - 1.2, 0.15], [wb - 1.2, 0.45], [-0.8, 0.45]], '#3b4148');
        const tank = [];
        for (let a = 0; a <= 20; a++) {
          const t = (a / 20) * Math.PI;
          tank.push([-0.7 + 0.55 - Math.sin(t) * 0.55, 0.45 + 0.55 + Math.cos(t) * 0.55]);
        }
        for (let a = 0; a <= 20; a++) {
          const t = (a / 20) * Math.PI;
          tank.push([wb - 1.4 - 0.55 + Math.sin(t) * 0.55, 0.45 + 0.55 - Math.cos(t) * 0.55]);
        }
        poly(tank, '#c9ced4');
        poly([[0.2, 1.0], [wb - 2.2, 1.0], [wb - 2.2, 1.12], [0.2, 1.12]], '#d64545');
        poly([[wb - 1.1, 0.15], [wb + 0.8, 0.15], [wb + 0.8, H - 0.1], [wb + 0.3, H + 0.3], [wb - 1.1, H + 0.3]], '#2e8b57');
        poly([[wb - 0.4, H - 0.5], [wb + 0.6, H - 0.5], [wb + 0.3, H + 0.15], [wb - 0.4, H + 0.15]], '#9fd3f0');
      } else if (style === 'van') {
        poly([[-0.6, 0.12], [wb + 0.8, 0.12], [wb + 0.8, 0.7], [wb + 0.3, H + 0.2], [-0.6, H + 0.2]], '#e8e8e8');
        poly([[wb - 0.3, 0.8], [wb + 0.55, 0.8], [wb + 0.2, H + 0.05], [wb - 0.3, H + 0.05]], '#a9daf5');
        poly([[-0.5, 0.5], [wb - 0.6, 0.5], [wb - 0.6, 0.62], [-0.5, 0.62]], '#f0a030');
      } else {
        poly([[-0.6, 0.1], [wb + 0.7, 0.1], [wb + 0.7, 0.55], [wb + 0.2, 0.7], [wb - 0.3, H + 0.15],
              [0.2, H + 0.15], [-0.3, 0.75], [-0.6, 0.7]], '#2f7fd0');
        poly([[wb - 0.45, 0.75], [wb - 0.4, 0.75], [wb - 0.6, H + 0.05], [1.2, H + 0.05], [1.2, 0.75]], '#a9daf5');
        poly([[1.0, 0.75], [1.0, H + 0.05], [0.3, H + 0.05], [0.0, 0.75]], '#a9daf5');
      }
      wheel(0, rot1, r);
      wheel(wb, rot2, r);
    }
    ctx.globalAlpha = 1;
  }

  function drawBuild() {
    const s = S.view.s;
    for (const b of S.beams) if (b.type === 'cable') drawBeam(b.a[0], b.a[1], b.b[0], b.b[1], b.type, null);
    for (const b of S.beams) if (b.type === 'steel') drawBeam(b.a[0], b.a[1], b.b[0], b.b[1], b.type, null);
    for (const b of S.beams) if (b.type === 'road') drawBeam(b.a[0], b.a[1], b.b[0], b.b[1], b.type, null);

    // podświetlenie elementu pod kursorem (usuwanie / dynamit)
    if (S.mouse && (S.tool === 'delete' || S.tool === 'charge')) {
      const i = beamAt(S.mouse[0], S.mouse[1]);
      if (i >= 0) {
        const b = S.beams[i];
        const ok = S.tool === 'delete' || b.type !== 'road';
        beamPath(b.a[0], b.a[1], b.b[0], b.b[1]);
        ctx.strokeStyle = S.tool === 'delete' ? 'rgba(229,83,75,0.8)' : ok ? 'rgba(255,191,90,0.7)' : 'rgba(229,83,75,0.5)';
        ctx.lineWidth = s * 0.5; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
      }
    }

    const nodes = new Map();
    for (const b of S.beams) { nodes.set(key(...b.a), b.a); nodes.set(key(...b.b), b.b); }
    for (const a of S.level.anchors) nodes.delete(key(...a));
    for (const n of nodes.values()) drawNode(n[0], n[1], false, same(n, S.pending));
    for (const a of S.level.anchors) drawNode(a[0], a[1], true, same(a, S.pending));
    for (const b of S.beams) if (b.charge) drawCharge(b.a[0], b.a[1], b.b[0], b.b[1]);

    // podgląd rysowanego elementu
    if (S.pending) {
      const mat = MATERIALS[S.tool];
      const [px, py] = W2S(S.pending[0], S.pending[1]);
      ctx.strokeStyle = 'rgba(255,191,90,0.55)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, mat.maxLen * s, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      if (S.hover && !same(S.hover, S.pending)) {
        const err = checkBeam(S.pending, S.hover, S.tool);
        drawBeam(S.pending[0], S.pending[1], S.hover[0], S.hover[1], S.tool, null, 0.6);
        beamPath(S.pending[0], S.pending[1], S.hover[0], S.hover[1]);
        ctx.strokeStyle = err ? 'rgba(229,83,75,0.9)' : 'rgba(76,195,138,0.9)';
        ctx.lineWidth = 2; ctx.stroke();
        const l = len(S.pending, S.hover);
        const cost = Math.round(l * mat.cost);
        const [hx, hy] = W2S(S.hover[0], S.hover[1]);
        const label = `${l.toFixed(2)} m · ${cost} zł`;
        ctx.font = '600 12px system-ui, sans-serif';
        const tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = err ? 'rgba(120,30,25,0.9)' : 'rgba(15,26,38,0.9)';
        ctx.fillRect(hx + 12, hy - 28, tw, 20);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, hx + 18, hy - 18);
      }
    }

    // kursor na węźle siatki
    if (S.hover && S.tool !== 'delete' && S.tool !== 'charge') {
      const ok = validPoint(S.hover);
      const [hx, hy] = W2S(S.hover[0], S.hover[1]);
      ctx.strokeStyle = ok ? (nodeExists(S.hover) || S.pending ? '#ffbf5a' : 'rgba(255,255,255,0.6)') : 'rgba(229,83,75,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx, hy, Math.max(6, s * 0.3), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.5, hy); ctx.lineTo(hx - s * 0.32, hy);
      ctx.moveTo(hx + s * 0.32, hy); ctx.lineTo(hx + s * 0.5, hy);
      ctx.moveTo(hx, hy - s * 0.5); ctx.lineTo(hx, hy - s * 0.32);
      ctx.moveTo(hx, hy + s * 0.32); ctx.lineTo(hx, hy + s * 0.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(170,215,255,0.9)';
      ctx.font = '11px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      if (!S.pending) ctx.fillText(`(${S.hover[0]}, ${S.hover[1]})`, hx + 10, hy + 8);
    }

    // pojazd-duch na starcie
    const spec = VEHICLES[S.level.vehicle];
    const st = S.level.start;
    drawVehicle({ x: st.x, y: st.y + spec.r }, { x: st.x + spec.wheelbase, y: st.y + spec.r }, 0, 0, spec, true, S.level.military ? 'ally' : 'civil');
  }

  function drawSim() {
    const sim = S.sim, P = sim.particles;
    const order = { cable: 0, steel: 1, road: 2 };
    const list = sim.constraints.filter(c => c.type !== 'car' && !c.broken).sort((a, b) => order[a.type] - order[b.type]);
    for (const c of list) {
      const a = P[c.a], b = P[c.b];
      let stress = 0;
      if (c.beam) stress = c.fs > 0 ? c.fs / c.mat.maxT : (c.mat.maxC ? -c.fs / c.mat.maxC : 0);
      drawBeam(a.x, a.y, b.x, b.y, c.type, c.half ? 1 : stress);
    }
    for (const p of P) if (p.key) drawNode(p.x, p.y, p.fixed, false);
    const used = new Set(P.filter(p => p.key).map(p => p.key));
    for (const a of S.level.anchors) if (!used.has(key(...a))) drawNode(a[0], a[1], true, false);
    for (const c of sim.constraints) if (c.charge && !c.broken) drawCharge(P[c.a].x, P[c.a].y, P[c.b].x, P[c.b].y);
    for (const v of sim.vehicles) {
      if (v.state === 'waiting') continue;
      drawVehicle(v.w1, v.w2, v.rot1, v.rot2, v.spec, false, v.team);
    }
    drawExplosions();
  }

  function render() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.save();
    const shake = (S.shakeUntil || 0) - performance.now();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 0.03, (Math.random() - 0.5) * shake * 0.03);
    drawBackground(w, h);
    if (S.level) {
      drawWater(w, h);
      drawTerrain();
      if (S.mode === 'build') {
        ctx.fillStyle = 'rgba(20,60,120,0.18)';
        ctx.fillRect(0, 0, w, h);
        drawGrid(w, h);
      }
      drawFlag();
      if (S.mode === 'build') drawBuild();
      else drawSim();
    }
    ctx.restore();
  }

  // ---------- Pętla ----------
  let last = performance.now();
  const DT = 1 / 60;
  function frame(now) {
    const elapsed = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (S.mode === 'test' && S.sim) {
      S.acc += elapsed;
      while (S.acc >= DT) {
        S.sim.step(DT);
        S.acc -= DT;
        checkResult();
      }
      updateMissionStatus();
      if (S.result && !S.resultShown && S.sim.time - S.resultAt > (S.result.win ? 0.8 : 1.2)) showResult();
    }
    render();
    requestAnimationFrame(frame);
  }

  // ---------- Start ----------
  $('btn-user').addEventListener('click', () => showUsers());
  setUser(store.get('mosty2.currentUser', null));
  const savedVariant = currentUser ? store.get(userPrefix(currentUser.id) + 'variant', 'civil') : 'civil';
  setVariant(savedVariant === 'military' ? 'military' : 'civil');
  resize();
  loadLevel(Math.min(progress().unlocked - 1, store.get(ukey('lastLevel'), 0)));
  showStart();
  requestAnimationFrame(frame);
})();
