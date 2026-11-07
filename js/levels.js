// Definicje plansz. Układ współrzędnych w metrach, oś Y w górę.
// Siatka budowy ma oczko 1 m – węzły mostu leżą zawsze na całkowitych współrzędnych.
//
// Każda plansza to krótki opis, z którego build() tworzy teren, kotwy i widok:
//   gap    – szerokość przepaści (parzysta), lewa krawędź zawsze na x = 8
//   yL, yR – wysokość lewego / prawego brzegu (domyślnie 10)
//   wallL, wallR – głębokości kotew na ścianach skał, liczone od krawędzi w dół
//   pillars – skalne filary: x (parzyste, odległość od lewej krawędzi), top – wysokość szczytu
//   vehicle – car | van | truck | tanker
//   vehicles – zamiast vehicle: konwój kilku pojazdów jadących po kolei
// Budżety liczy narzędzie tools/budzety.js i zapisuje w js/budgets.js.
(function (global) {
  'use strict';

  const FAR_L = -60, FAR_R = 120, BOTTOM = -40, X_LEFT = 8;

  const CHAPTERS = [
    { name: 'Podstawy', count: 10, desc: 'Pierwsze przeprawy. Naucz się, że trójkąt to najlepszy przyjaciel inżyniera.' },
    { name: 'Wyzwania', count: 10, desc: 'Szersze przepaście, filary i strome zjazdy.' },
    { name: 'Ciężki transport', count: 10, desc: 'Ciężarówki i cysterny. Każda złotówka i każda belka się liczy.' },
    { name: 'Mistrz inżynierii', count: 15, desc: 'Konwoje kilku pojazdów, wysokie wieże i najdłuższe mosty w grze.' },
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
      hint: 'Ostatnie wyzwanie rozdziału. Pokaż wszystko, czego się nauczyłeś.' },

    // ---------- Rozdział 4: Mistrz inżynierii ----------
    { name: 'Konwój aut', gap: 14, wallL: [3], wallR: [3], vehicles: ['car', 'car', 'car'],
      hint: 'Trzy auta jadą jedno za drugim. Most musi unieść kilka pojazdów naraz.' },
    { name: 'Rozpadlina', gap: 16, wallL: [2, 6], wallR: [2, 6], vehicle: 'van',
      hint: 'Po dwie kotwy na każdej ścianie – wykorzystaj obie.' },
    { name: 'Schody', gap: 14, yL: 14, yR: 9, wallL: [3], wallR: [3], pillars: [{ x: 6, top: 6 }], vehicle: 'truck',
      hint: 'Duży spadek. Ciężarówka nie może zjechać zbyt gwałtownie.' },
    { name: 'Pod prąd', gap: 16, yL: 9, yR: 13, pillars: [{ x: 8, top: 5 }], vehicle: 'van',
      hint: 'Długi podjazd z podporą w środku.' },
    { name: 'Trzy filary', gap: 26, pillars: [{ x: 6, top: 6 }, { x: 12, top: 6 }, { x: 18, top: 6 }], vehicle: 'car',
      hint: 'Cztery krótkie przęsła zamiast jednego długiego.' },
    { name: 'Dostawa hurtowa', gap: 18, wallL: [4], wallR: [4], vehicles: ['van', 'van'],
      hint: 'Dwa dostawczaki naraz na długim przęśle.' },
    { name: 'Bliźniacze wieże', gap: 22, pillars: [{ x: 6, top: 2 }, { x: 14, top: 2 }], vehicle: 'truck',
      hint: 'Dwie wysokie wieże. Każde piętro wymaga przekątnych.' },
    { name: 'Długie przęsło', gap: 18, wallL: [5], wallR: [5], vehicle: 'van',
      hint: 'Żadnego filaru. Tylko kotwy nisko na ścianach.' },
    { name: 'Wąska półka', gap: 20, wallL: [2], wallR: [2], pillars: [{ x: 10, top: 7 }], vehicle: 'truck',
      hint: 'Kotwy tuż pod krawędzią i niski filar.' },
    { name: 'Dwie cysterny', gap: 16, pillars: [{ x: 8, top: 6 }], vehicles: ['tanker', 'tanker'],
      hint: 'Dwie najcięższe maszyny w grze, jedna za drugą.' },
    { name: 'Kręty kanion', gap: 24, yL: 13, yR: 10, wallL: [3], wallR: [3], pillars: [{ x: 6, top: 5 }, { x: 16, top: 4 }], vehicle: 'truck',
      hint: 'Filary na różnych wysokościach i opadająca jezdnia.' },
    { name: 'Nad wodospadem', gap: 28, pillars: [{ x: 8, top: 3 }, { x: 18, top: 3 }], vehicle: 'van',
      hint: 'Długie przęsła między głęboko posadowionymi filarami.' },
    { name: 'Ciężki konwój', gap: 20, wallL: [4], wallR: [4], pillars: [{ x: 10, top: 6 }], vehicles: ['truck', 'tanker'],
      hint: 'Ciężarówka i cysterna. Zaplanuj zapas wytrzymałości.' },
    { name: 'Wysoki most', gap: 26, yL: 14, yR: 14, pillars: [{ x: 8, top: 3 }, { x: 16, top: 3 }], vehicle: 'tanker',
      hint: 'Jezdnia wysoko nad wodą, a wieże sięgają 11 metrów.' },
    { name: 'Most tysiąclecia', gap: 34, yL: 12, yR: 12, wallL: [4], wallR: [4], pillars: [{ x: 6, top: 4 }, { x: 14, top: 4 }, { x: 22, top: 4 }],
      vehicles: ['tanker', 'truck', 'tanker'],
      hint: 'Wielki finał: 34 metry i trzy ciężkie pojazdy.' },
  ];

  // Numer rozdziału planszy na podstawie liczby plansz w kolejnych rozdziałach
  function chapterOf(i, chapters) {
    let end = 0;
    for (let c = 0; c < chapters.length; c++) {
      end += chapters[c].count;
      if (i < end) return c;
    }
    return chapters.length - 1;
  }

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
      chapter: chapterOf(i, opts.chapters),
      view: { x0: 0, x1: xR + 8, y0: 0, y1: top },
      build: { x0: 1, x1: xR + 7, y0: 1, y1: top - 1 },
      terrain,
      water: spec.water != null ? spec.water : 1.2,
      anchors,
      start: { x: xL - 6, y: yL },
      finish: xR + 4,
      budget: spec.budget || budgets[i] || 99999,
      vehicle: spec.vehicle || (spec.vehicles || spec.allies || ['car'])[0],
      spec,
    };
    if (spec.vehicles) level.convoy = spec.vehicles.map(type => ({ type, team: 'civil' }));
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
    { name: 'Szkolenie saperów', count: 5, desc: 'Zbuduj, przeprowadź swoich, wysadź. W tej kolejności.' },
    { name: 'Linia frontu', count: 5, desc: 'Dłuższe kolumny, mniej ładunków, cięższy sprzęt.' },
    { name: 'Ofensywa', count: 5, desc: 'Czołgi po obu stronach. Most musi je unieść – i runąć na rozkaz.' },
    { name: 'Kampania górska', count: 15, desc: 'Uskoki, głębokie filary i wrogie pościgi w górach.' },
    { name: 'Ostatnia ofensywa', count: 15, desc: 'Najdłuższe kolumny i najdłuższe mosty. Jeden błąd i wróg przejdzie.' },
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
      hint: 'Ostatnia misja rozdziału. Zbuduj, przeprowadź, wysadź.' },

    // ---------- Rozdział 4: Kampania górska ----------
    { name: 'Zwiad', gap: 10, wallL: [3], wallR: [3], allies: ['jeep'], enemies: ['jeep', 'jeep', 'jeep'], charges: 1,
      hint: 'Trzy wrogie łaziki. Jeden ładunek musi zatrzymać wszystkie.' },
    { name: 'Konwój zaopatrzenia', gap: 12, wallL: [4], wallR: [4], allies: ['apc', 'apc', 'apc'], enemies: ['jeep'], charges: 2,
      hint: 'Trzy transportery z zaopatrzeniem – wszystkie muszą przejechać.' },
    { name: 'Rozpadlina', gap: 14, wallL: [2, 6], wallR: [2, 6], allies: ['jeep', 'apc'], enemies: ['apc'], charges: 1,
      hint: 'Dwie kotwy na każdej ścianie dają wiele możliwości.' },
    { name: 'Uskok II', gap: 12, yL: 13, yR: 10, wallL: [3], wallR: [3], allies: ['apc', 'jeep'], enemies: ['jeep', 'jeep'], charges: 2,
      hint: 'Kolumna zjeżdża w dół. Wróg jest szybki.' },
    { name: 'Pod górę', gap: 12, yL: 9, yR: 12, wallL: [3], wallR: [4], allies: ['apc'], enemies: ['apc'], charges: 1,
      hint: 'Podjazd pod górę i tylko jeden ładunek.' },
    { name: 'Filar strażniczy', gap: 16, pillars: [{ x: 8, top: 6 }], allies: ['jeep', 'jeep', 'apc'], enemies: ['apc', 'jeep'], charges: 2,
      hint: 'Filar pośrodku. Zawalenie jednego przęsła wystarczy.' },
    { name: 'Głęboki filar', gap: 16, yL: 11, pillars: [{ x: 6, top: 3 }], allies: ['apc', 'apc'], enemies: ['tank'], charges: 2,
      hint: 'Wrogi czołg. Wieża na filarze to dobry cel.' },
    { name: 'Ciężka przeprawa', gap: 12, wallL: [4], wallR: [4], allies: ['tank', 'tank'], enemies: ['apc'], charges: 2,
      hint: 'Dwa czołgi jeden po drugim.' },
    { name: 'Dwa przęsła', gap: 18, wallL: [3], wallR: [3], pillars: [{ x: 8, top: 6 }], allies: ['tank', 'apc'], enemies: ['tank'], charges: 2,
      hint: 'Czołg na czele kolumny i czołg w pościgu.' },
    { name: 'Pościg II', gap: 14, wallL: [4], wallR: [4], allies: ['jeep', 'jeep', 'jeep'], enemies: ['jeep', 'jeep', 'jeep'], charges: 1,
      hint: 'Sześć łazików i jeden ładunek. Licz do trzech.' },
    { name: 'Przełęcz', gap: 20, yL: 12, yR: 10, wallL: [3], wallR: [3], pillars: [{ x: 10, top: 5 }], allies: ['apc', 'tank'], enemies: ['apc', 'apc'], charges: 2,
      hint: 'Opadająca przełęcz z filarem pośrodku.' },
    { name: 'Wąwóz czołgów', gap: 14, wallL: [5], wallR: [5], allies: ['tank'], enemies: ['tank', 'tank'], charges: 1,
      hint: 'Dwa wrogie czołgi, jeden ładunek.' },
    { name: 'Trzy filary', gap: 24, pillars: [{ x: 6, top: 6 }, { x: 12, top: 6 }, { x: 18, top: 6 }], allies: ['jeep', 'apc', 'apc'], enemies: ['apc'], charges: 3,
      hint: 'Długi most na trzech filarach.' },
    { name: 'Wysoka wieża II', gap: 18, yL: 12, wallL: [4], wallR: [4], pillars: [{ x: 8, top: 3 }], allies: ['apc', 'tank'], enemies: ['tank'], charges: 2,
      hint: 'Dziewięciometrowa wieża. Wysadź jej podstawę.' },
    { name: 'Przeprawa górska', gap: 22, yL: 12, yR: 12, wallL: [4], wallR: [4], pillars: [{ x: 6, top: 5 }, { x: 14, top: 5 }],
      allies: ['tank', 'apc', 'tank'], enemies: ['tank', 'apc'], charges: 2,
      hint: 'Finał kampanii górskiej. Ciężka kolumna i ciężki pościg.' },

    // ---------- Rozdział 5: Ostatnia ofensywa ----------
    { name: 'Długa kolumna', gap: 16, wallL: [3], wallR: [3], allies: ['jeep', 'apc', 'jeep', 'apc'], enemies: ['apc'], charges: 2,
      hint: 'Cztery pojazdy. Detonuj dopiero po ostatnim.' },
    { name: 'Jeden strzał', gap: 18, pillars: [{ x: 8, top: 6 }], allies: ['tank', 'tank'], enemies: ['tank'], charges: 1,
      hint: 'Jeden ładunek na moście dla czołgów.' },
    { name: 'Stromy zjazd', gap: 16, yL: 14, yR: 10, wallL: [4], wallR: [3], pillars: [{ x: 8, top: 5 }], allies: ['apc', 'tank'], enemies: ['apc', 'apc'], charges: 2,
      hint: 'Czterometrowy spadek i ciężki czołg.' },
    { name: 'Nad rzeką', gap: 20, wallL: [5], wallR: [5], pillars: [{ x: 10, top: 4 }], allies: ['tank', 'apc'], enemies: ['tank'], charges: 2,
      hint: 'Niskie kotwy i filar w nurcie rzeki.' },
    { name: 'Most na filarach', gap: 26, pillars: [{ x: 6, top: 5 }, { x: 12, top: 5 }, { x: 18, top: 5 }], allies: ['apc', 'apc', 'tank'], enemies: ['tank', 'tank'], charges: 3,
      hint: 'Trzy filary i dwa wrogie czołgi.' },
    { name: 'Kanion II', gap: 22, wallL: [2, 6], wallR: [2, 6], pillars: [{ x: 10, top: 6 }], allies: ['tank', 'tank'], enemies: ['apc', 'apc', 'apc'], charges: 2,
      hint: 'Trzy wrogie transportery tuż za twoimi czołgami.' },
    { name: 'Odwrót', gap: 18, yL: 10, yR: 12, wallL: [3], wallR: [4], pillars: [{ x: 8, top: 6 }], allies: ['jeep', 'apc', 'tank'], enemies: ['jeep', 'jeep'], charges: 2,
      hint: 'Kolumna wycofuje się pod górę.' },
    { name: 'Wysokie wieże', gap: 24, yL: 12, yR: 12, pillars: [{ x: 6, top: 2 }, { x: 16, top: 2 }], allies: ['apc', 'tank'], enemies: ['tank'], charges: 2,
      hint: 'Dwie wysokie wieże. Wystarczy obalić jedną.' },
    { name: 'Ciężki pościg', gap: 20, wallL: [4], wallR: [4], pillars: [{ x: 8, top: 6 }], allies: ['tank', 'tank', 'tank'], enemies: ['tank', 'tank'], charges: 2,
      hint: 'Trzy czołgi przejeżdżają, dwa nie mogą.' },
    { name: 'Przełom', gap: 28, wallL: [4], wallR: [4], pillars: [{ x: 6, top: 5 }, { x: 14, top: 5 }, { x: 20, top: 5 }], allies: ['apc', 'tank', 'apc'], enemies: ['tank', 'apc'], charges: 3,
      hint: 'Długi most i trzy ładunki.' },
    { name: 'Ostatnia kotwa', gap: 12, allies: ['tank'], enemies: ['tank', 'tank', 'tank'], charges: 1,
      hint: 'Tylko kotwy na krawędziach i jeden ładunek na trzy czołgi.' },
    { name: 'Wielka przeprawa', gap: 30, pillars: [{ x: 6, top: 4 }, { x: 14, top: 4 }, { x: 22, top: 4 }], allies: ['apc', 'tank', 'apc', 'tank'], enemies: ['tank'], charges: 3,
      hint: 'Cztery pojazdy na trzydziestometrowym moście.' },
    { name: 'Zjazd do doliny', gap: 24, yL: 14, yR: 10, wallL: [4], wallR: [3], pillars: [{ x: 8, top: 4 }, { x: 16, top: 4 }], allies: ['tank', 'apc'], enemies: ['tank', 'apc'], charges: 2,
      hint: 'Długi zjazd przez dwa filary.' },
    { name: 'Twierdza', gap: 32, yL: 12, yR: 12, wallL: [4], wallR: [4], pillars: [{ x: 6, top: 3 }, { x: 14, top: 3 }, { x: 22, top: 3 }],
      allies: ['tank', 'tank', 'apc', 'apc'], enemies: ['tank', 'tank'], charges: 3,
      hint: 'Ciężka kolumna i ciężki pościg nad szeroką doliną.' },
    { name: 'Most zwycięstwa', gap: 34, yL: 12, yR: 12, wallL: [4], wallR: [4], pillars: [{ x: 6, top: 4 }, { x: 14, top: 4 }, { x: 22, top: 4 }, { x: 28, top: 4 }],
      allies: ['jeep', 'apc', 'tank', 'apc', 'tank'], enemies: ['tank', 'tank', 'apc'], charges: 3,
      hint: 'Ostatnia misja. Pięć pojazdów musi przejść – trzy nie mogą.' },
  ];

  // ---------- Wersja z mostami zwodzonymi ----------
  // sides    – 1: skrzydło z lewego zawiasu, 2: dwa skrzydła spotykające się na środku
  // gap      – odległość między zawiasami (przy dwóch skrzydłach nieparzysta: między końcami zostaje 1 m)
  // yL, yR   – wysokość lewego i prawego nabrzeża (domyślnie yB lub 6)
  // ship     – statek (Physics.SHIPS); before / after – pojazdy przed statkiem i jeden po nim
  // torque   – moment napędu zawiasu [kN·m] (domyślnie 600); słaby napęd wymaga przeciwwagi
  // pit      – studnia przeciwwagi za zawiasem na brzegu: w – szerokość, d – głębokość
  // pylon    – pylon za zawiasem z kotwą na szczycie (do lin): dx – odległość od zawiasu, h – wysokość
  // approach – długość przęsła dojazdowego do filaru, na którym stoi zawias (0 – zawias na brzegu)
  const DRAW_CHAPTERS = [
    { name: 'Pierwsze skrzydła', count: 5, desc: 'Przepuść pojazd, podnieś most dla statku i opuść go dla kolejnego pojazdu.' },
    { name: 'Przeciwwagi', count: 5, desc: 'Słabe napędy. Zbuduj ogon skrzydła nad studnią i obciąż go przeciwwagą.' },
    { name: 'Pylony i liny', count: 5, desc: 'Ciężkie pojazdy na długich skrzydłach. Liny z pylonu luzują się przy podnoszeniu.' },
    { name: 'Filary i skarpy', count: 15, desc: 'Zawiasy na filarach w nurcie, mosty dojazdowe i brzegi na różnych wysokościach.' },
    { name: 'Wielki port', count: 15, desc: 'Wszystko naraz: przeciwwagi, pylony, filary i najcięższe statki.' },
  ];

  const DRAW_SPECS = [
    // ---------- Rozdział 1: Pierwsze skrzydła ----------
    { name: 'Kładka nad kanałem', sides: 1, gap: 6, ship: 'jacht', before: ['car'], after: ['car'],
      hint: 'Skrzydło mocuj tylko do zawiasu z napędem. Gdy auto przejedzie, podnieś most.' },
    { name: 'Przystań', sides: 1, gap: 7, ship: 'barka', before: ['car'], after: ['car'],
      hint: 'Skrzydło trzyma się tylko zawiasu – zbuduj je z trójkątów, by się nie ugięło.' },
    { name: 'Dwa skrzydła', sides: 2, gap: 11, ship: 'jacht', before: ['car'], after: ['car'],
      hint: 'Dwa skrzydła, każde na własnym zawiasie. Nie łącz ich ze sobą.' },
    { name: 'Barka węglowa', sides: 2, gap: 11, ship: 'barka', before: ['van'], after: ['van'],
      hint: 'Dostawczak jest cięższy – skrzydła potrzebują głębszej kratownicy.' },
    { name: 'Tam i z powrotem', sides: 1, gap: 7, ship: 'jacht', before: ['car'], after: ['car'],
      hint: 'Po statku jedzie drugie auto – z lewej albo z prawej. Pamiętaj, by opuścić most.' },

    // ---------- Rozdział 2: Przeciwwagi ----------
    { name: 'Pierwsza przeciwwaga', sides: 1, gap: 6, ship: 'jacht', torque: 20, pit: { w: 3, d: 4 }, before: ['car'], after: ['car'],
      hint: 'Napęd jest za słaby. Przedłuż skrzydło nad studnię za zawiasem i obciąż ogon przeciwwagą.' },
    { name: 'Słaby silnik', sides: 2, gap: 11, ship: 'barka', torque: 20, pit: { w: 3, d: 4 }, before: ['car'], after: ['car'],
      hint: 'Oba skrzydła potrzebują przeciwwag – jezdnia nad studnią też musi utrzymać auto.' },
    { name: 'Ciężkie skrzydło', sides: 1, gap: 7, yB: 7, ship: 'zaglowiec', torque: 75, pit: { w: 4, d: 5 }, before: ['car'], after: ['car'],
      hint: 'Długie skrzydło i wysoki maszt. Równowaga jest ważniejsza niż siła napędu.' },
    { name: 'Wywrotka', sides: 2, gap: 11, ship: 'statek', torque: 30, pit: { w: 3, d: 4 }, before: ['van'], after: ['car'],
      hint: 'Za ciężka przeciwwaga szarpnie skrzydłem w górę, za lekka – nie pozwoli go podnieść.' },
    { name: 'Równowaga', sides: 2, gap: 13, ship: 'prom', torque: 75, pit: { w: 4, d: 5 }, before: ['van', 'car'], after: ['van'],
      hint: 'Długie skrzydła – rozłóż przeciwwagę na całym ogonie.' },

    // ---------- Rozdział 3: Pylony i liny ----------
    { name: 'Liny', sides: 1, gap: 10, ship: 'holownik', pylon: { dx: 2, h: 6 }, before: ['truck'], after: ['van'],
      hint: 'Ciężarówka na długim skrzydle. Podwieś skrzydło liną do pylonu – przy podnoszeniu lina się poluzuje.' },
    { name: 'Most wantowy', sides: 2, gap: 15, ship: 'statek', pylon: { dx: 2, h: 7 }, before: ['truck'], after: ['truck'],
      hint: 'Liny z obu pylonów odciążają skrzydła.' },
    { name: 'Wysoki pylon', sides: 1, gap: 9, yB: 7, ship: 'zaglowiec', pylon: { dx: 2, h: 8 }, before: ['van'], after: ['van'],
      hint: 'Jedno długie skrzydło i wysoki maszt.' },
    { name: 'Ciężki port', sides: 2, gap: 17, ship: 'kontenerowiec', pylon: { dx: 2, h: 8 }, before: ['tanker'], after: ['truck'],
      hint: 'Cysterna na ośmiometrowych skrzydłach. Bez lin się nie obejdzie.' },
    { name: 'Wanty i przeciwwagi', sides: 2, gap: 13, ship: 'prom', torque: 60, pit: { w: 3, d: 4 }, pylon: { dx: 5, h: 7 }, before: ['van'], after: ['van'],
      hint: 'Słaby napęd i ciężarówka: połącz liny z przeciwwagą.' },

    // ---------- Rozdział 4: Filary i skarpy ----------
    { name: 'Filar zwodzony', sides: 1, approach: 6, gap: 7, ship: 'jacht', before: ['car'], after: ['car'],
      hint: 'Zawias stoi na filarze. Od brzegu do filaru zbuduj zwykły, nieruchomy most.' },
    { name: 'Dwa filary', sides: 2, approach: 6, gap: 11, ship: 'barka', before: ['van'], after: ['car'],
      hint: 'Dwa mosty dojazdowe i dwa skrzydła.' },
    { name: 'Różne brzegi', sides: 2, gap: 13, yL: 6, yR: 8, ship: 'statek', before: ['car', 'van'], after: ['car'],
      hint: 'Brzegi mają różną wysokość – skrzydła muszą spotkać się pośrodku, więc będą pochylone.' },
    { name: 'Most na filarze', sides: 1, approach: 8, gap: 9, ship: 'holownik', before: ['truck'], after: ['car'],
      hint: 'Długi most dojazdowy dla ciężarówki i skrzydło na filarze.' },
    { name: 'Pod górę', sides: 1, gap: 9, yL: 6, yR: 8, ship: 'jacht', before: ['van'], after: ['van'],
      hint: 'Skrzydło musi wznosić się do wyższego brzegu.' },
    { name: 'Długi dojazd', sides: 2, approach: 10, gap: 11, ship: 'prom', before: ['car'], after: ['van'],
      hint: 'Dziesięciometrowe mosty dojazdowe potrzebują solidnych kratownic.' },
    { name: 'Schodki', sides: 2, gap: 13, yL: 7, yR: 5, ship: 'barka', before: ['van'], after: ['van'],
      hint: 'Prawy brzeg niżej. Skrzydła spotkają się na wysokości 6 m.' },
    { name: 'Ciężarówki na filarach', sides: 2, approach: 6, gap: 11, ship: 'jacht', before: ['truck', 'truck'], after: ['truck'],
      hint: 'Trzy ciężarówki na mostach dojazdowych i skrzydłach.' },
    { name: 'Wanty na skarpie', sides: 1, gap: 10, yL: 6, yR: 7, ship: 'zaglowiec', pylon: { dx: 2, h: 6 }, before: ['van'], after: ['van'],
      hint: 'Wznoszące się skrzydło podwieszone do pylonu.' },
    { name: 'Przeciwwaga pod górę', sides: 1, gap: 7, yL: 6, yR: 7, ship: 'jacht', torque: 35, pit: { w: 3, d: 4 }, before: ['car'], after: ['car'],
      hint: 'Słaby napęd i skrzydło wznoszące się do wyższego brzegu.' },
    { name: 'Szeroki dojazd', sides: 1, approach: 10, gap: 8, ship: 'statek', before: ['van'], after: ['van'],
      hint: 'Długi most dojazdowy i krótkie, mocne skrzydło.' },
    { name: 'Wieczorny ruch', sides: 2, gap: 15, yB: 7, ship: 'prom', pylon: { dx: 2, h: 7 }, before: ['car', 'car', 'van'], after: ['van'],
      hint: 'Trzy pojazdy na skrzydłach podwieszonych do pylonów.' },
    { name: 'Most nad zatoką', sides: 2, approach: 8, gap: 13, yB: 8, ship: 'zaglowiec', before: ['van'], after: ['car'],
      hint: 'Wysokie filary i długie mosty dojazdowe.' },
    { name: 'Ciężki most', sides: 2, gap: 13, ship: 'statek', torque: 70, pit: { w: 4, d: 5 }, before: ['van'], after: ['van'],
      hint: 'Dostawczaki i słaby napęd – przeciwwaga musi być ciężka.' },
    { name: 'Festiwal', sides: 2, approach: 6, gap: 15, yL: 6, yR: 7, ship: 'zaglowiec', before: ['car', 'van'], after: ['car'],
      hint: 'Finał rozdziału: filary, różne brzegi i wysoki maszt.' },

    // ---------- Rozdział 5: Wielki port ----------
    { name: 'Port przeładunkowy', sides: 2, gap: 17, ship: 'kontenerowiec', pylon: { dx: 2, h: 8 }, before: ['truck'], after: ['truck'],
      hint: 'Ciężarówki na ośmiometrowych skrzydłach.' },
    { name: 'Jedno długie skrzydło', sides: 1, gap: 10, ship: 'statek', pylon: { dx: 2, h: 9 }, before: ['van'], after: ['van'],
      hint: 'Dziewięciometrowe skrzydło – liny są niezbędne.' },
    { name: 'Godzina zero', sides: 2, approach: 6, gap: 15, ship: 'prom', before: ['car', 'van', 'truck'], after: ['car'],
      hint: 'Trzy różne pojazdy na filarach i skrzydłach.' },
    { name: 'Nocny transport', sides: 2, gap: 19, ship: 'statek', pylon: { dx: 2, h: 9 }, before: ['truck'], after: ['van'],
      hint: 'Dziewięciometrowe skrzydła podwieszone do pylonów.' },
    { name: 'Cysterna', sides: 2, gap: 11, ship: 'barka', torque: 80, pit: { w: 4, d: 5 }, before: ['tanker'], after: ['car'],
      hint: 'Najcięższy pojazd, słaby napęd i krótkie skrzydła.' },
    { name: 'Rzeka w mieście', sides: 1, gap: 8, yL: 7, yR: 8, ship: 'zaglowiec', torque: 70, pit: { w: 3, d: 4 }, before: ['car'], after: ['car'],
      hint: 'Wznoszące się skrzydło z przeciwwagą.' },
    { name: 'Pod prąd', sides: 2, approach: 8, gap: 13, yL: 6, yR: 8, ship: 'holownik', before: ['van', 'van'], after: ['van'],
      hint: 'Filary i różne wysokości brzegów.' },
    { name: 'Szeroki kanał', sides: 2, gap: 21, ship: 'kontenerowiec', pylon: { dx: 2, h: 10 }, before: ['car'], after: ['car'],
      hint: 'Dziesięciometrowe skrzydła z każdej strony.' },
    { name: 'Ciężki ruch', sides: 2, gap: 13, ship: 'prom', torque: 80, pit: { w: 4, d: 5 }, before: ['truck'], after: ['truck'],
      hint: 'Trzy ciężarówki i przeciwwagi.' },
    { name: 'Latarnia', sides: 1, approach: 8, gap: 8, ship: 'holownik', before: ['van'], after: ['van'],
      hint: 'Długi most dojazdowy i siedmiometrowe skrzydło na filarze.' },
    { name: 'Regaty', sides: 2, gap: 19, yB: 8, ship: 'zaglowiec', pylon: { dx: 3, h: 9 }, before: ['van', 'car', 'van'], after: ['car'],
      hint: 'Długie skrzydła, wysokie pylony i wysoki maszt.' },
    { name: 'Paliwo', sides: 2, gap: 15, ship: 'barka', pylon: { dx: 2, h: 7 }, before: ['tanker'], after: ['tanker'],
      hint: 'Dwie cysterny: przed barką i po niej.' },
    { name: 'Wielki prom', sides: 2, approach: 8, gap: 17, ship: 'prom', before: ['van', 'van'], after: ['truck'],
      hint: 'Najszerszy kanał z filarami.' },
    { name: 'Nabrzeże portowe', sides: 2, gap: 17, ship: 'kontenerowiec', torque: 100, pit: { w: 3, d: 4 }, pylon: { dx: 4, h: 9 }, before: ['truck', 'van'], after: ['truck'],
      hint: 'Słaby napęd, długie skrzydła i ciężarówki – wszystko naraz.' },
    { name: 'Wielki port', sides: 2, approach: 6, gap: 17, yL: 8, yR: 9, ship: 'zaglowiec', before: ['car', 'van', 'truck', 'van'], after: ['truck'],
      hint: 'Wielki finał: filary, różne brzegi, cztery pojazdy i żaglowiec.' },
  ];

  function buildDraw(spec, i, opts) {
    const two = spec.sides === 2;
    const yL = spec.yL != null ? spec.yL : spec.yB != null ? spec.yB : 6;
    const yR = spec.yR != null ? spec.yR : spec.yB != null ? spec.yB : 6;
    const water = 1.2;
    const aL = spec.approach || 0;
    const aR = two ? aL : 0;
    const pit = spec.pit && !aL ? spec.pit : null;
    const bankL = X_LEFT + (pit ? pit.w : 0);
    const hL = bankL + (aL ? aL + 2 : 0);        // lewy zawias (na brzegu albo na filarze)
    const hR = hL + spec.gap;                    // prawy zawias albo krawędź prawego brzegu
    const bankR = hR + (aR ? aR + 2 : 0);        // krawędź prawego brzegu

    const terrain = [];
    const notchBank = (edge, y, dir, p) => {
      // brzeg ze studnią przeciwwagi tuż za zawiasem; ściana pod zawiasem kończy się 2,6 m niżej,
      // żeby zmieściła się kratownica ogona
      const far = dir > 0 ? FAR_L : FAR_R;
      if (!p) return dir > 0 ? [[far, BOTTOM], [edge, BOTTOM], [edge, y], [far, y]] : [[edge, y], [edge, BOTTOM], [far, BOTTOM], [far, y]];
      const t = edge - dir * 0.6, b = edge - dir * p.w, wy = y - 2.6;
      return dir > 0
        ? [[far, BOTTOM], [edge, BOTTOM], [edge, wy], [t, wy], [t, y - p.d], [b, y - p.d], [b, y], [far, y]]
        : [[edge, wy], [edge, BOTTOM], [far, BOTTOM], [far, y], [b, y], [b, y - p.d], [t, y - p.d], [t, wy]];
    };
    terrain.push(notchBank(bankL, yL, 1, pit));
    terrain.push(notchBank(bankR, yR, -1, two && pit ? pit : null));
    const pier = (x0, y) => [[x0, BOTTOM], [x0, y], [x0 + 2, y], [x0 + 2, BOTTOM]];
    if (aL) terrain.push(pier(bankL + aL, yL));
    if (aR) terrain.push(pier(hR, yR));

    const motors = [{ x: hL, y: yL, dir: 1 }];
    if (two) motors.push({ x: hR, y: yR, dir: -1 });
    const anchors = motors.map(m => [m.x, m.y]);
    const spans = [];
    if (aL) { anchors.push([bankL, yL], [bankL + aL, yL]); spans.push({ a: [bankL, yL], b: [bankL + aL, yL] }); }
    if (aR) { anchors.push([hR + 2, yR], [bankR, yR]); spans.push({ a: [hR + 2, yR], b: [bankR, yR] }); }
    const pylons = [];
    if (spec.pylon) {
      for (const m of motors) {
        const px = m.x - m.dir * spec.pylon.dx, top = m.y + spec.pylon.h;
        pylons.push({ x: px, y0: m.y, y1: top });
        anchors.push([px, top]);
      }
    }
    const tipY = two ? Math.round((yL + yR) / 2) : yR;
    const leaves = two
      ? [{ m: 0, tipX: hL + (spec.gap - 1) / 2, tipY }, { m: 1, tipX: hR - (spec.gap - 1) / 2, tipY }]
      : [{ m: 0, tipX: hR - 1, tipY }];
    for (const lf of leaves) {
      const m = motors[lf.m];
      if (pit && (lf.m === 0 || two)) lf.pit = pit;
      if (spec.pylon) lf.pylon = [m.x - m.dir * spec.pylon.dx, m.y + spec.pylon.h];
    }
    const seamPoints = [];
    if (!two) seamPoints.push([hR, yR]);
    if (pit) {
      seamPoints.push([bankL - pit.w, yL]);
      if (two) seamPoints.push([bankR + pit.w, yR]);
    }

    const ship = global.Physics.SHIPS[spec.ship];
    const shipTop = Math.max(...ship.parts.map(pt => pt[1]));
    const leafLen = two ? (spec.gap - 1) / 2 : spec.gap - 1;
    const yMax = Math.max(yL, yR);
    const top = Math.ceil(Math.max(yMax + 8, water + shipTop + 2, yMax + leafLen + 2, spec.pylon ? yMax + spec.pylon.h + 2 : 0));
    const leftEnd = X_LEFT, rightEnd = bankR + (two && pit ? pit.w : 0);
    const budgets = opts.budgets || [];
    return {
      name: spec.name,
      hint: spec.hint,
      chapter: chapterOf(i, opts.chapters),
      view: { x0: 0, x1: rightEnd + 8, y0: 0, y1: top },
      build: { x0: 1, x1: rightEnd + 7, y0: 1, y1: top - 1 },
      terrain,
      water,
      anchors,
      motors,
      leaves,
      spans,
      pylons,
      torque: spec.torque || 600,
      seamPoints,
      ship: spec.ship,
      shipX: two ? (hL + hR) / 2 : (hL + hR) / 2 + 1,
      start: { x: leftEnd - 6, y: yL },
      finish: rightEnd + 4,
      startR: { x: rightEnd + 6, y: yR },
      finishL: leftEnd - 4,
      budget: spec.budget || budgets[i] || 99999,
      vehicle: spec.before[0],
      convoy: [
        ...spec.before.map(type => ({ type, team: 'civil' })),
        ...(spec.after || []).map(type => ({ type, team: 'civil', after: true })),
      ],
      drawbridge: true,
      spec,
    };
  }

  // ---------- Wersja ze skocznią ----------
  // gap      – szerokość przepaści, lewa krawędź na x = 16 (przed nią rozbieg)
  // yL, yR   – wysokość brzegu startowego i brzegu lądowania
  // speed    – prędkość motocyklisty [m/s]
  // anchorsL – kotwy po stronie startu: [dx, dy] względem krawędzi (dx ≤ 0 to podłoże, [0, -d] to ściana)
  // anchorsR – kotwy po stronie lądowania: [dx, dy] względem krawędzi drugiego brzegu
  // ditch    – rów na rozbiegu: x0, x1 (względem krawędzi, ujemne), d – głębokość
  // rocks    – skały w przepaści: x, w, top; anchors: true – kotwy na szczycie skały
  const JUMP_CHAPTERS = [
    { name: 'Pierwsze skoki', count: 5, desc: 'Rampa na kilku kotwach, rozpęd i przelot nad przepaścią.' },
    { name: 'Kaskaderzy', count: 5, desc: 'Rowy, nawisy i skały. Każda plansza wymaga innej rampy.' },
    { name: 'Mistrzowie przestworzy', count: 5, desc: 'Najdłuższe skoki. Rampy lądowania podparte na skałach i ścianach.' },
  ];

  const JUMP_SPECS = [
    // ---------- Rozdział 1 ----------
    { name: 'Pierwszy skok', gap: 8, speed: 14, anchorsL: [[-6, 0], [-3, 0], [0, 0]],
      hint: 'Rampa zaczyna się na ziemi i wznosi do krawędzi. Oprzyj ją na trzech kotwach.' },
    { name: 'Daleko od krawędzi', gap: 12, speed: 15, anchorsL: [[-9, 0], [-5, 0], [0, -3]],
      hint: 'Kotwy są daleko od krawędzi – ostatni fragment rampy podeprzyj z kotwy na ścianie.' },
    { name: 'W dół', gap: 12, yL: 9, yR: 6, speed: 15, anchorsL: [[-6, 0], [0, 0]], anchorsR: [[0, 0], [4, 0], [8, 0]],
      hint: 'Drugi brzeg jest niżej. Rampa do lądowania pozwoli uniknąć wywrotki.' },
    { name: 'Rów', gap: 10, speed: 15, ditch: { x0: -7, x1: -3, d: 3 }, anchorsL: [[-10, 0], [-7, 0], [-3, 0], [0, 0]],
      hint: 'Na rozbiegu jest rów. Rampa musi go przekryć.' },
    { name: 'Skała w przepaści', gap: 14, speed: 16, rocks: [{ x: 6, w: 2, top: 9.5 }], anchorsL: [[-6, 0], [-3, 0], [0, -2]],
      hint: 'Przeskocz nad skałą. Jeśli kierowca jej dotknie, będzie wywrotka.' },

    // ---------- Rozdział 2 ----------
    { name: 'Nawis', gap: 16, speed: 16, anchorsL: [[-7, 0], [-4, 0], [0, -2], [0, -5]],
      hint: 'Rampę trzeba wysunąć nad przepaść, podpierając ją z kotew na ścianie.' },
    { name: 'Miękkie lądowanie', gap: 14, yL: 10, yR: 6, speed: 15, anchorsL: [[-6, 0], [-2, 0]], anchorsR: [[2, 0], [6, 0], [0, -3]],
      hint: 'Duży spadek. Bez rampy lądowania kierowca się wywróci.' },
    { name: 'Półka', gap: 20, speed: 15, anchorsL: [[-8, 0], [-4, 0], [0, 0]], anchorsR: [[0, -2], [0, -5], [3, 0]],
      hint: 'Za daleko na zwykły skok. Wysuń rampę lądowania nad przepaść z kotew na ścianie.' },
    { name: 'Dwie skały', gap: 18, speed: 17, rocks: [{ x: 5, w: 2, top: 10 }, { x: 11, w: 2, top: 11 }], anchorsL: [[-4, 0], [0, 0]], anchorsR: [[0, 0], [4, 0], [8, 0]],
      hint: 'Dwie skały na drodze. Skok musi być wysoki.' },
    { name: 'Wysoki brzeg', gap: 12, yR: 11, speed: 16, ditch: { x0: -5, x1: -2, d: 2 }, anchorsL: [[-9, 0], [-5, 0], [-2, 0], [0, 0]], anchorsR: [[0, 0]],
      hint: 'Brzeg lądowania jest 3 metry wyżej, a przed krawędzią jest rów.' },

    // ---------- Rozdział 3 ----------
    { name: 'Wielki kanion', gap: 24, speed: 18, anchorsL: [[-10, 0], [-6, 0], [-2, 0]], anchorsR: [[0, -2], [0, 0], [4, 0], [8, 0]],
      hint: 'Pełna prędkość i idealny kąt. Ostatnie dwa metry rampy bez kotwy.' },
    { name: 'Przez wieżę', gap: 18, speed: 17, rocks: [{ x: 8, w: 2, top: 11.5 }], anchorsL: [[-8, 0], [-4, 0], [0, -2]], anchorsR: [[0, 0], [5, 0]],
      hint: 'Wysoka skała na środku. Leć wysoko.' },
    { name: 'Ratunkowa rampa', gap: 24, speed: 15, rocks: [{ x: 16, w: 2, top: 4, anchors: true }], anchorsL: [[-8, 0], [-4, 0], [0, 0]], anchorsR: [[0, -2], [0, 0]],
      hint: 'Motocykl nie doleci do brzegu – rampa lądowania musi go złapać nad przepaścią. Podeprzyj ją na skale.' },
    { name: 'Zjazd w dolinę', gap: 18, yL: 11, yR: 7, speed: 15, anchorsL: [[-4, 0], [0, -3]], anchorsR: [[0, -2], [0, -5], [3, 0], [7, 0]],
      hint: 'Cztery metry w dół. Rampa lądowania zaczyna się nad przepaścią.' },
    { name: 'Skok życia', gap: 28, yL: 10, yR: 9, speed: 18, rocks: [{ x: 20, w: 2, top: 4, anchors: true }], anchorsL: [[-10, 0], [-5, 0], [0, 0]], anchorsR: [[0, -2], [0, 0], [6, 0]],
      hint: 'Najdłuższy skok w grze. Obie rampy muszą być perfekcyjne.' },
  ];

  function buildJump(spec, i, opts) {
    const xL = 16, gap = spec.gap, xR = xL + gap;
    const yL = spec.yL != null ? spec.yL : 8;
    const yR = spec.yR != null ? spec.yR : 8;
    const aL = spec.anchorsL || [], aR = spec.anchorsR || [];
    const depthL = Math.max(3, ...aL.filter(a => a[1] < 0).map(a => -a[1])) + 1;
    const depthR = Math.max(3, ...aR.filter(a => a[1] < 0).map(a => -a[1])) + 1;
    const left = [[FAR_L, BOTTOM], [xL - 0.3, BOTTOM], [xL - 0.4, 2.5], [xL, yL - depthL], [xL, yL]];
    if (spec.ditch) {
      const dt = spec.ditch;
      left.push([xL + dt.x1, yL], [xL + dt.x1, yL - dt.d], [xL + dt.x0, yL - dt.d], [xL + dt.x0, yL]);
    }
    left.push([FAR_L, yL]);
    const terrain = [left, [[xR, yR], [xR, yR - depthR], [xR + 0.4, 2.5], [xR + 0.3, BOTTOM], [FAR_R, BOTTOM], [FAR_R, yR]]];
    const anchors = [...aL.map(a => [xL + a[0], yL + a[1]]), ...aR.map(a => [xR + a[0], yR + a[1]])];
    for (const r of spec.rocks || []) {
      const x0 = xL + r.x, x1 = x0 + r.w, t = r.top;
      if (r.anchors) {
        terrain.push([[x0 - 0.5, BOTTOM], [x0, t - 1], [x0, t], [x1, t], [x1, t - 1], [x1 + 0.5, BOTTOM]]);
        anchors.push([x0, t], [x1, t]);
      } else {
        terrain.push([[x0 - 0.6, BOTTOM], [x0 - 0.2, t - 2], [x0 + 0.3, t], [x1 - 0.3, t], [x1 + 0.2, t - 2], [x1 + 0.6, BOTTOM]]);
      }
    }
    const top = Math.max(yL, yR) + 10;
    const budgets = opts.budgets || [];
    return {
      name: spec.name,
      hint: spec.hint,
      chapter: chapterOf(i, opts.chapters),
      view: { x0: 0, x1: xR + 16, y0: 0, y1: top },
      build: { x0: 1, x1: xR + 15, y0: 1, y1: top - 1 },
      terrain,
      water: 1.2,
      anchors,
      edgeL: [xL, yL],
      edgeR: [xR, yR],
      start: { x: 2, y: yL },
      finish: xR + 13,
      landX: xR,
      budget: spec.budget || budgets[i] || 99999,
      vehicle: 'moto',
      motoSpeed: spec.speed || 15,
      jump: true,
      spec,
    };
  }

  global.LEVELS = SPECS.map((s, i) => build(s, i, { budgets: global.LEVEL_BUDGETS, chapters: CHAPTERS }));
  global.CHAPTERS = CHAPTERS;
  global.MIL_LEVELS = MIL_SPECS.map((s, i) => build(s, i, { budgets: global.MIL_BUDGETS, chapters: MIL_CHAPTERS, military: true }));
  global.MIL_CHAPTERS = MIL_CHAPTERS;
  global.DRAW_LEVELS = DRAW_SPECS.map((s, i) => buildDraw(s, i, { budgets: global.DRAW_BUDGETS, chapters: DRAW_CHAPTERS }));
  global.DRAW_CHAPTERS = DRAW_CHAPTERS;
  global.JUMP_LEVELS = JUMP_SPECS.map((s, i) => buildJump(s, i, { budgets: global.JUMP_BUDGETS, chapters: JUMP_CHAPTERS }));
  global.JUMP_CHAPTERS = JUMP_CHAPTERS;
})(typeof window !== 'undefined' ? window : globalThis);
