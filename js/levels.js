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
  // sides  – 1: skrzydło podnoszone z lewego brzegu, 2: dwa skrzydła z obu brzegów
  // gap    – szerokość kanału (przy dwóch skrzydłach nieparzysta: między końcami skrzydeł zostaje 1 m)
  // yB     – wysokość nabrzeży (domyślnie 6)
  // ship   – statek, który musi przepłynąć (Physics.SHIPS)
  // before – pojazdy jadące przed statkiem, after – pojazdy jadące po nim (most trzeba opuścić)
  const DRAW_CHAPTERS = [
    { name: 'Pierwsze skrzydła', count: 5, desc: 'Przepuść auto, podnieś most, przepuść statek.' },
    { name: 'Port rzeczny', count: 5, desc: 'Dwa skrzydła, większe statki i ruch w obie strony.' },
    { name: 'Wielkie statki', count: 5, desc: 'Żaglowce i kontenerowce. Skrzydła muszą być mocne i smukłe.' },
  ];

  const DRAW_SPECS = [
    // ---------- Rozdział 1 ----------
    { name: 'Kładka nad kanałem', sides: 1, gap: 6, ship: 'jacht', before: ['car'], after: ['car'],
      hint: 'Skrzydło mocuj tylko do zawiasu z napędem. Gdy auto przejedzie, podnieś most.' },
    { name: 'Przystań', sides: 1, gap: 7, ship: 'barka', before: ['car'], after: ['car'],
      hint: 'Skrzydło trzyma się tylko zawiasu – zbuduj je z trójkątów, by się nie ugięło.' },
    { name: 'Dwa skrzydła', sides: 2, gap: 11, ship: 'jacht', before: ['car'], after: ['car'],
      hint: 'Dwa skrzydła, każde na własnym zawiasie. Nie łącz ich ze sobą.' },
    { name: 'Barka węglowa', sides: 2, gap: 11, ship: 'barka', before: ['van'], after: ['van'],
      hint: 'Dostawczak jest cięższy – skrzydła potrzebują głębszej kratownicy.' },
    { name: 'Tam i z powrotem', sides: 1, gap: 7, ship: 'jacht', before: ['car'], after: ['car'],
      hint: 'Po statku jedzie drugie auto. Pamiętaj, by opuścić most.' },

    // ---------- Rozdział 2 ----------
    { name: 'Port rzeczny', sides: 2, gap: 13, ship: 'statek', before: ['car', 'car'], after: ['car'],
      hint: 'Statek pasażerski jest szeroki. Zostaw mu miejsce między skrzydłami.' },
    { name: 'Wąski kanał', sides: 1, gap: 8, yB: 7, ship: 'zaglowiec', before: ['van'], after: ['van'],
      hint: 'Żaglowiec ma maszt wysoki na 10 metrów.' },
    { name: 'Nabrzeże', sides: 2, gap: 13, yB: 7, ship: 'barka', before: ['van'], after: ['car'],
      hint: 'Dostawczak przed barką, auto po niej.' },
    { name: 'Ciężki ładunek', sides: 2, gap: 11, ship: 'jacht', before: ['truck'], after: ['truck'],
      hint: 'Ciężarówka na wspornikach. Skrzydła muszą być bardzo sztywne.' },
    { name: 'Godziny szczytu', sides: 2, gap: 13, ship: 'statek', before: ['car', 'van'], after: ['car'],
      hint: 'Trzy pojazdy i statek. Licz, kto już przejechał.' },

    // ---------- Rozdział 3 ----------
    { name: 'Żaglowiec', sides: 2, gap: 13, yB: 7, ship: 'zaglowiec', before: ['van'], after: ['van'],
      hint: 'Wysoki maszt – skrzydła muszą stanąć prawie pionowo.' },
    { name: 'Most portowy', sides: 2, gap: 15, ship: 'statek', before: ['van'], after: ['car'],
      hint: 'Dłuższe skrzydła to większy moment na zawiasach.' },
    { name: 'Jedno skrzydło', sides: 1, gap: 8, yB: 7, ship: 'statek', before: ['van'], after: ['van'],
      hint: 'Szeroki statek i tylko jedno skrzydło.' },
    { name: 'Kontenerowiec', sides: 2, gap: 15, ship: 'kontenerowiec', before: ['truck'], after: ['truck'],
      hint: 'Największy statek w porcie. Skrzydła nie mogą być grube.' },
    { name: 'Wielkie otwarcie', sides: 2, gap: 17, yB: 8, ship: 'zaglowiec', before: ['car', 'van', 'truck'], after: ['van'],
      hint: 'Finał: trzy pojazdy, żaglowiec i jeszcze jeden pojazd na koniec.' },
  ];

  function buildDraw(spec, i, opts) {
    const xL = X_LEFT, gap = spec.gap, xR = xL + gap;
    const yB = spec.yB != null ? spec.yB : 6;
    const water = 1.2;
    const two = spec.sides === 2;
    const leaf = two ? (gap - 1) / 2 : gap - 1;
    const ship = global.Physics.SHIPS[spec.ship];
    const shipTop = Math.max(...ship.parts.map(pt => pt[1]));
    const top = Math.ceil(Math.max(yB + 8, water + shipTop + 2, yB + leaf + 2));
    const motors = [{ x: xL, y: yB, dir: 1 }];
    if (two) motors.push({ x: xR, y: yB, dir: -1 });
    const budgets = opts.budgets || [];
    return {
      name: spec.name,
      hint: spec.hint,
      chapter: chapterOf(i, opts.chapters),
      view: { x0: 0, x1: xR + 8, y0: 0, y1: top },
      build: { x0: 1, x1: xR + 7, y0: 1, y1: top - 1 },
      terrain: [
        [[FAR_L, BOTTOM], [xL, BOTTOM], [xL, yB], [FAR_L, yB]],
        [[xR, yB], [xR, BOTTOM], [FAR_R, BOTTOM], [FAR_R, yB]],
      ],
      water,
      anchors: motors.map(m => [m.x, m.y]),
      motors,
      seamPoints: two ? [] : [[xR, yB]],
      ship: spec.ship,
      shipX: two ? (xL + xR) / 2 : (xL + xR) / 2 + 1,
      start: { x: xL - 6, y: yB },
      finish: xR + 4,
      startR: { x: xR + 6, y: yB },   // start pojazdu jadącego w lewo
      finishL: xL - 4,                // meta pojazdu jadącego w lewo
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

  global.LEVELS = SPECS.map((s, i) => build(s, i, { budgets: global.LEVEL_BUDGETS, chapters: CHAPTERS }));
  global.CHAPTERS = CHAPTERS;
  global.MIL_LEVELS = MIL_SPECS.map((s, i) => build(s, i, { budgets: global.MIL_BUDGETS, chapters: MIL_CHAPTERS, military: true }));
  global.MIL_CHAPTERS = MIL_CHAPTERS;
  global.DRAW_LEVELS = DRAW_SPECS.map((s, i) => buildDraw(s, i, { budgets: global.DRAW_BUDGETS, chapters: DRAW_CHAPTERS }));
  global.DRAW_CHAPTERS = DRAW_CHAPTERS;
})(typeof window !== 'undefined' ? window : globalThis);
