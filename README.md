# Mosty

Przeglądarkowa gra o budowie stalowych mostów nad przepaściami.

## Zagraj online

https://szumickip.github.io/mosty/

## Uruchomienie

Otwórz `index.html` w przeglądarce. Nie trzeba niczego instalować ani budować.

## Sterowanie

| Akcja | Sterowanie |
|---|---|
| Nowy element | kliknij węzeł lub kotwę, potem punkt siatki (rysowanie łańcuchem) albo przeciągnij |
| Anuluj / usuń element | prawy przycisk myszy |
| Narzędzia | `1` jezdnia, `2` belka, `3` lina, `4` usuń |
| Test / powrót do budowy | `Spacja` |
| Cofnij | `Ctrl+Z` |
| Dynamit (wersja militarna) | `5`, potem kliknij belkę lub linę |
| Detonacja (w trakcie testu) | `D` albo przycisk „Detonuj” |
| Menu plansz | `M` |

## Gracze i tabela wyników

Przy starcie wybiera się gracza albo tworzy nowego (imię lub ksywka, do 20 znaków).
Każdy gracz ma własne postępy i zapisane mosty w obu wersjach gry, więc nie trzeba zaczynać od nowa.
Gracza można zmienić w każdej chwili przyciskiem 👤 w lewym górnym rogu.

**Tabela wyników** (🏆 na ekranie startowym, w menu plansz i na liście graczy) ma dwie części, osobno dla każdej wersji:
- ranking graczy – kolejność według gwiazdek, potem liczby zaliczonych plansz, potem niższego łącznego kosztu,
- zaliczone plansze – najlepszy wynik każdego gracza na każdej planszy; najtańszy most jest podświetlony.

Dane zapisują się w przeglądarce (localStorage). Gracze i tabela są wspólne dla wszystkich, którzy grają
na tym samym komputerze w tej samej przeglądarce. Postęp zapisany przed wprowadzeniem graczy
przechodzi automatycznie na pierwszego utworzonego gracza.

## Wersje gry

Na ekranie startowym wybiera się wersję. Każda ma osobne plansze i zapis postępów.

**Cywilna** – 45 plansz w czterech rozdziałach: **Podstawy**, **Wyzwania**, **Ciężki transport**
i **Mistrz inżynierii**. Pojazdy: auto, dostawczak, ciężarówka i cysterna. W ostatnim rozdziale
pojawiają się konwoje – kilka pojazdów jadących po kolei, które wszystkie muszą dojechać do flagi.

**Militarna** – 45 plansz w pięciu rozdziałach: **Szkolenie saperów**, **Linia frontu**, **Ofensywa**,
**Kampania górska** i **Ostatnia ofensywa**.
Most musi przenieść kolumnę sojuszników (łazik, transporter, czołg), a potem dać się wysadzić,
zanim przejedzie wróg. Na każdej planszy jest inna liczba ładunków dynamitu; zakłada się je
na belki i liny (nie na jezdnię). Misja jest zaliczona, gdy wszyscy sojusznicy dojadą do flagi,
a żaden wróg nie przejedzie – wróg może wpaść do przepaści razem z mostem albo zatrzymać się przed wyrwą.

W obu wersjach kolejna plansza odblokowuje się po przejściu poprzedniej.
Gwiazdki: 1 za przejście, 2 za koszt do 85% budżetu, 3 za koszt do 70% budżetu.

## Struktura

- `js/levels.js` – opisy plansz obu wersji (przepaść, brzegi, kotwy, filary, pojazdy, ładunki); teren tworzy się automatycznie
- `js/budgets.js` – budżety plansz (plik generowany, nie edytuj ręcznie)
- `js/physics.js` – fizyka (XPBD), materiały, pojazdy i reguły budowy; działa też w Node
- `js/game.js` – rysowanie, siatka techniczna, edytor, interfejs
- `css/style.css` – wygląd interfejsu
- `tools/budzety.js` – liczy budżety: dla każdej planszy projektuje i testuje mosty wzorcowe;
  w wersji militarnej sprawdza też, czy most da się wysadzić dostępnymi ładunkami

## Dodawanie lub zmiana planszy

1. Dopisz lub zmień wpis w tablicy `SPECS` (cywilne) albo `MIL_SPECS` (militarne) w `js/levels.js`.
2. Uruchom `node tools/budzety.js` – narzędzie sprawdzi, czy każdą planszę da się przejść,
   i zapisze nowe budżety do `js/budgets.js`. `node tools/budzety.js 12 m3` sprawdza tylko
   planszę cywilną 12 i militarną 3.
