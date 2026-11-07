// Definicje plansz. Układ współrzędnych w metrach, oś Y w górę.
// Siatka budowy ma oczko 1 m – węzły mostu leżą zawsze na całkowitych współrzędnych.
//
// Każda plansza to krótki opis, z którego build() tworzy teren, kotwy i widok:
//   gap    – szerokość przepaści (parzysta), lewa krawędź zawsze na x = 8
//   yL, yR – wysokość lewego / prawego brzegu (domyślnie 10)
//   wallL, wallR – głębokości kotew na ścianach skał, liczone od krawędzi w dół
//   pillars – skalne filary: x (parzyste, odległość od lewej krawędzi), top – wysokość szczytu
//   vehicle – car | van | truck | tanker
// Budżety liczy narzędzie tools/budzety.js i zapisuje w js/budgets.js.
(function (global) {
  'use strict';

  const FAR_L = -60, FAR_R = 120, BOTTOM = -40, X_LEFT = 8;

  const CHAPTERS = [
    { name: 'Podstawy', desc: 'Pierwsze przeprawy. Naucz się, że trójkąt to najlepszy przyjaciel inżyniera.' },
    { name: 'Wyzwania', desc: 'Szersze przepaście, filary i strome zjazdy.' },
    { name: 'Ciężki transport', desc: 'Ciężarówki i cysterny. Każda złotówka i każda belka się liczy.' },
  ];

  const SPECS = [
    // ---------- Rozdział 1: Podstawy ----------
    { name: 'Pierwsza przepaść', gap: 6, wallL: [3], wallR: [3], vehicle: 'car',
      hint: 'Sama jezdnia się nie utrzyma. Podeprzyj ją belkami z kotew na ścianach skał.' },
    { name: 'Strumień', gap: 8, wallL: [3], wallR: [3], vehicle: 'car',
      hint: 'Belka od kotwy na ścianie do węzła jezdni tworzy sztywny trójkąt.' },
    { name: 'Bez podpór', gap: 8, vehicle: 'car',
      hint: 'Brak kotew na ścianach. Zbuduj kratownicę z trójkątów nad jezdnią.' },
    { name: 'Dwie półki', gap: 10, wallL: [4], wallR: [4], vehicle: 'car',
      hint: 'Dłuższe przęsło – przyda się więcej trójkątów.' },
    { name: 'Uskok', gap: 10, yL: 12, yR: 9, wallL: [3], wallR: [3], vehicle: 'car',
      hint: 'Brzegi są na różnych wysokościach. Jezdnia może opadać.' },
    { name: 'Skalny ząb', gap: 12, pillars: [{ x: 6, top: 6 }], vehicle: 'car',
      hint: 'Filar w przepaści to darmowa podpora. Postaw na nim słupy.' },
    { name: 'Głęboki wąwóz', gap: 12, wallL: [5], wallR: [5], vehicle: 'car',
      hint: 'Kotwy są nisko – długie zastrzały muszą mieć węzły pośrednie.' },
    { name: 'Filar', gap: 14, pillars: [{ x: 6, top: 7 }], wallL: [3], wallR: [3], vehicle: 'car',
      hint: 'Połącz kotwy na ścianach i na filarze w jedną konstrukcję.' },
    { name: 'W dół', gap: 12, yL: 13, yR: 9, wallL: [4], wallR: [3], vehicle: 'car',
      hint: 'Spory spadek. Uważaj, by jezdnia nie była zbyt stroma w jednym miejscu.' },
    { name: 'Dostawa', gap: 14, wallL: [4], wallR: [4], vehicle: 'van',
      hint: 'Dostawczak jest cięższy od auta. Sprawdź, które elementy świecą na czerwono.' },

    // ---------- Rozdział 2: Wyzwania ----------
    { name: 'Pod górę', gap: 12, yL: 9, yR: 12, wallL: [3], wallR: [4], vehicle: 'van',
      hint: 'Tym razem trzeba wjechać wyżej.' },
    { name: 'Dwa filary', gap: 18, pillars: [{ x: 6, top: 6 }, { x: 12, top: 6 }], vehicle: 'car',
      hint: 'Trzy krótkie przęsła są łatwiejsze niż jedno długie.' },
    { name: 'Bez ścian', gap: 14, vehicle: 'van',
      hint: 'Tylko dwie kotwy. Wysoka kratownica przenosi większe obciążenie.' },
    { name: 'Wysoki filar', gap: 16, yL: 11, pillars: [{ x: 8, top: 3 }], vehicle: 'van',
      hint: 'Filar jest głęboko. Zbuduj na nim stalową wieżę usztywnioną przekątnymi.' },
    { name: 'Głębokie kotwy', gap: 14, wallL: [6], wallR: [6], vehicle: 'van',
      hint: 'Liny dobrze znoszą rozciąganie, a są tanie.' },
    { name: 'Szeroko', gap: 20, pillars: [{ x: 10, top: 6 }], wallL: [3], wallR: [3], vehicle: 'van',
      hint: 'Dwa przęsła po 10 metrów – każde potrzebuje własnej kratownicy.' },
    { name: 'Stromizna', gap: 12, yL: 9, yR: 13, wallL: [3], wallR: [3], vehicle: 'car',
      hint: 'Stromy podjazd. Rozłóż wzniesienie równo na całą długość.' },
    { name: 'Krzywy filar', gap: 18, pillars: [{ x: 4, top: 7 }], wallL: [4], wallR: [4], vehicle: 'van',
      hint: 'Filar nie stoi na środku. Dłuższe przęsło wymaga mocniejszej kratownicy.' },
    { name: 'Trzy przęsła', gap: 22, pillars: [{ x: 6, top: 6 }, { x: 14, top: 6 }], vehicle: 'van',
      hint: 'Dwa filary, trzy przęsła i dużo stali.' },
    { name: 'Ciężki ładunek', gap: 14, wallL: [4], wallR: [4], vehicle: 'truck',
      hint: 'Pierwsza ciężarówka. Jest prawie dwa razy cięższa od auta.' },

    // ---------- Rozdział 3: Ciężki transport ----------
    { name: 'Konwój', gap: 12, wallL: [3], wallR: [3], vehicle: 'truck',
      hint: 'Krótko, ale ciężko. Zastrzały muszą być mocne.' },
    { name: 'Filar dla ciężarówki', gap: 16, pillars: [{ x: 8, top: 6 }], vehicle: 'truck',
      hint: 'Słupy na filarze przenoszą największe obciążenie.' },
    { name: 'Zjazd', gap: 16, yL: 13, yR: 10, wallL: [4], wallR: [3], pillars: [{ x: 8, top: 5 }], vehicle: 'truck',
      hint: 'Ciężarówka zjeżdża w dół. Jezdnia musi wytrzymać hamowanie.' },
    { name: 'Dwa filary II', gap: 20, pillars: [{ x: 6, top: 6 }, { x: 12, top: 6 }], vehicle: 'truck',
      hint: 'Wykorzystaj oba filary.' },
    { name: 'Nad rwącą rzeką', gap: 14, wallL: [5], wallR: [5], vehicle: 'truck',
      hint: 'Nisko położone kotwy. Połącz je z kratownicą jak najkrótszymi belkami.' },
    { name: 'Wysoka wieża', gap: 22, yL: 11, pillars: [{ x: 10, top: 2 }], vehicle: 'truck',
      hint: 'Wieża na filarze musi mieć przekątne na każdym piętrze.' },
    { name: 'Kanion', gap: 24, pillars: [{ x: 6, top: 5 }, { x: 16, top: 5 }], wallL: [4], wallR: [4], vehicle: 'truck',
      hint: 'Długie środkowe przęsło to najtrudniejsza część.' },
    { name: 'Cysterna', gap: 18, pillars: [{ x: 8, top: 6 }], wallL: [4], wallR: [4], vehicle: 'tanker',
      hint: 'Cysterna to najcięższy pojazd w grze.' },
    { name: 'Wielki kanion', gap: 26, pillars: [{ x: 6, top: 5 }, { x: 16, top: 5 }], vehicle: 'tanker',
      hint: 'Trzy przęsła, najcięższy ładunek.' },
    { name: 'Most stulecia', gap: 30, yL: 12, yR: 12, pillars: [{ x: 6, top: 4 }, { x: 14, top: 4 }, { x: 22, top: 4 }], wallL: [4], wallR: [4], vehicle: 'tanker',
      hint: 'Ostatnie wyzwanie. Pokaż wszystko, czego się nauczyłeś.' },
  ];

  // Lekko nieregularne ściany poniżej kotew, zależnie od numeru planszy
  const jitter = (i, k) => (((i * 37 + k * 17) % 7) - 3) / 10;

  function build(spec, i, opts) {
    const xL = X_LEFT, xR = X_LEFT + spec.gap;
    const yL = spec.yL != null ? spec.yL : 10;
    const yR = spec.yR != null ? spec.yR : 10;
    const wallL = spec.wallL || [], wallR = spec.wallR || [];
    const dL = Math.max(2, ...wallL) + 1, dR = Math.max(2, ...wallR) + 1;
    const midL = Math.min(2.5, yL - dL - 0.5), midR = Math.min(2.5, yR - dR - 0.5);

    const terrain = [
      [[FAR_L, BOTTOM], [xL - 0.4 + jitter(i, 1), BOTTOM], [xL - 0.5 + jitter(i, 2) / 2, midL], [xL, yL - dL], [xL, yL], [FAR_L, yL]],
      [[xR, yR], [xR, yR - dR], [xR + 0.5 + jitter(i, 3) / 2, midR], [xR + 0.4 + jitter(i, 4), BOTTOM], [FAR_R, BOTTOM], [FAR_R, yR]],
    ];
    const anchors = [[xL, yL], [xR, yR]];
    for (const d of wallL) anchors.push([xL, yL - d]);
    for (const d of wallR) anchors.push([xR, yR - d]);

    for (const p of spec.pillars || []) {
      const px = xL + p.x, t = p.top;
      terrain.push([[px - 0.8, BOTTOM], [px - 0.3, t - 2.5], [px, t - 1], [px, t], [px + 2, t], [px + 2, t - 1], [px + 2.3, t - 2.5], [px + 2.8, BOTTOM]]);
      anchors.push([px, t], [px + 2, t]);
    }

    const top = Math.max(yL, yR) + 8;
    const budgets = opts.budgets || [];
    const level = {
      name: spec.name,
      hint: spec.hint,
      chapter: Math.floor(i / opts.chapterSize),
      view: { x0: 0, x1: xR + 8, y0: 0, y1: top },
      build: { x0: 1, x1: xR + 7, y0: 1, y1: top - 1 },
      terrain,
      water: spec.water != null ? spec.water : 1.2,
      anchors,
      start: { x: xL - 6, y: yL },
      finish: xR + 4,
      budget: spec.budget || budgets[i] || 99999,
      vehicle: spec.vehicle || (spec.allies ? spec.allies[0] : 'car'),
      spec,
    };
    if (opts.military) {
      level.military = true;
      level.charges = spec.charges;
      level.convoy = [
        ...spec.allies.map(type => ({ type, team: 'ally' })),
        ...spec.enemies.map(type => ({ type, team: 'enemy' })),
      ];
      level.enemyTrigger = xR;      // wróg rusza, gdy ostatni sojusznik dojeżdża do końca przepaści
      level.enemyStart = xL - 9;    // wróg nadjeżdża zza lewej krawędzi ekranu
    }
    return level;
  }

  // ---------- Wersja militarna ----------
  // allies / enemies – kolejność pojazdów w kolumnie (jeep | apc | tank)
  // charges – liczba ładunków wybuchowych do rozmieszczenia na belkach i linach
  const MIL_CHAPTERS = [
    { name: 'Szkolenie saperów', desc: 'Zbuduj, przeprowadź swoich, wysadź. W tej kolejności.' },
    { name: 'Linia frontu', desc: 'Dłuższe kolumny, mniej ładunków, cięższy sprzęt.' },
    { name: 'Ofensywa', desc: 'Czołgi po obu stronach. Most musi je unieść – i runąć na rozkaz.' },
  ];

  const MIL_SPECS = [
    // ---------- Rozdział 1 ----------
    { name: 'Most saperów', gap: 8, wallL: [3], wallR: [3], allies: ['jeep'], enemies: ['jeep'], charges: 2,
      hint: 'Załóż dynamit na belkę nośną. Gdy łazik przejedzie, kliknij „Detonuj”.' },
    { name: 'Przeprawa', gap: 10, wallL: [3], wallR: [3], allies: ['jeep', 'jeep'], enemies: ['jeep'], charges: 2,
      hint: 'Poczekaj, aż oba łaziki zjadą z mostu.' },
    { name: 'Jeden ładunek', gap: 8, allies: ['jeep'], enemies: ['jeep'], charges: 1,
      hint: 'Tylko jeden ładunek. Most musi mieć słaby punkt, którego zniszczenie go zawali.' },
    { name: 'Transporter', gap: 10, wallL: [4], wallR: [4], allies: ['apc'], enemies: ['jeep', 'jeep'], charges: 2,
      hint: 'Transporter jest cięższy od łazika.' },
    { name: 'Filar', gap: 12, pillars: [{ x: 6, top: 6 }], allies: ['jeep', 'apc'], enemies: ['apc'], charges: 2,
      hint: 'Wysadzenie słupa na filarze może zawalić oba przęsła.' },

    // ---------- Rozdział 2 ----------
    { name: 'Kolumna', gap: 12, wallL: [3], wallR: [3], allies: ['jeep', 'apc', 'jeep'], enemies: ['apc'], charges: 2,
      hint: 'Trzy pojazdy. Licz, ile już przejechało.' },
    { name: 'Uskok', gap: 10, yL: 12, yR: 9, wallL: [3], wallR: [3], allies: ['apc'], enemies: ['apc', 'apc'], charges: 1,
      hint: 'Jeden ładunek i dwa wrogie transportery.' },
    { name: 'Wąwóz', gap: 14, wallL: [5], wallR: [5], allies: ['apc', 'apc'], enemies: ['jeep', 'apc'], charges: 2,
      hint: 'Wróg na łaziku jest szybki – nie zwlekaj z detonacją.' },
    { name: 'Dwa filary', gap: 18, pillars: [{ x: 6, top: 6 }, { x: 12, top: 6 }], allies: ['jeep', 'apc'], enemies: ['apc'], charges: 3,
      hint: 'Wystarczy zawalić jedno przęsło.' },
    { name: 'Pierwszy czołg', gap: 12, wallL: [4], wallR: [4], allies: ['tank'], enemies: ['jeep'], charges: 2,
      hint: 'Czołg jest ciężki. Most musi go unieść, a potem runąć.' },

    // ---------- Rozdział 3 ----------
    { name: 'Pancerna kolumna', gap: 14, wallL: [4], wallR: [4], allies: ['tank', 'apc'], enemies: ['apc', 'apc'], charges: 2,
      hint: 'Ciężki czołg na przedzie kolumny.' },
    { name: 'Wysoka wieża', gap: 16, yL: 11, pillars: [{ x: 8, top: 3 }], allies: ['apc', 'tank'], enemies: ['tank'], charges: 2,
      hint: 'Wieża na filarze to dobre miejsce na ładunki.' },
    { name: 'Pościg', gap: 16, pillars: [{ x: 8, top: 6 }], wallL: [3], wallR: [3], allies: ['jeep', 'jeep', 'apc'], enemies: ['jeep', 'jeep'], charges: 2,
      hint: 'Wrogie łaziki są tuż za twoją kolumną.' },
    { name: 'Kanion', gap: 20, pillars: [{ x: 6, top: 5 }, { x: 12, top: 5 }], allies: ['tank', 'tank'], enemies: ['tank'], charges: 3,
      hint: 'Dwa czołgi muszą przejechać, wrogi czołg – nie.' },
    { name: 'Ostatni most', gap: 24, pillars: [{ x: 6, top: 5 }, { x: 16, top: 5 }], wallL: [4], wallR: [4], allies: ['apc', 'tank', 'apc'], enemies: ['tank', 'apc'], charges: 3,
      hint: 'Ostatnia misja. Zbuduj, przeprowadź, wysadź.' },
  ];

  global.LEVELS = SPECS.map((s, i) => build(s, i, { budgets: global.LEVEL_BUDGETS, chapterSize: 10 }));
  global.CHAPTERS = CHAPTERS;
  global.MIL_LEVELS = MIL_SPECS.map((s, i) => build(s, i, { budgets: global.MIL_BUDGETS, chapterSize: 5, military: true }));
  global.MIL_CHAPTERS = MIL_CHAPTERS;
})(typeof window !== 'undefined' ? window : globalThis);
