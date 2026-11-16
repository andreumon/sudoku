# Sudoku

Web app statica (HTML, CSS, JS, nessuna dipendenza): si apre `index.html` nel browser,
oppure si pubblica la cartella su un hosting statico per installarla sul telefono.

| File | Contenuto |
| --- | --- |
| `index.html` | struttura della pagina, tema applicato prima del disegno, registrazione del service worker |
| `style.css` | aspetto e animazioni |
| `app.js` | logica di gioco, interfaccia, tastiera e tocco, salvataggi |
| `logic.js` | risolutore per tecniche: misura la difficoltà e ricava le "idee del puzzle" |
| `ocr.js` | lettura della griglia da uno screenshot |
| `puzzles.js` | la raccolta dei puzzle d'autore |
| `sw.js`, `manifest.webmanifest`, `icons/` | installazione come app e funzionamento senza rete |

Salvataggi, cronologia, preferiti e puzzle importati stanno nel `localStorage` del browser:
sono legati all'indirizzo da cui l'app viene aperta.

## Installarla su Android (GitHub Pages)

1. Su github.com: **New repository**, nome a piacere (es. `sudoku`), visibilità **Public**, poi **Create repository**.
2. Nella pagina del repository: **uploading an existing file**, trascina dentro tutto il contenuto di questa cartella
   (compresa la cartella `icons`, esclusi gli `.zip`), poi **Commit changes**.
3. **Settings → Pages**: in *Build and deployment* scegli *Deploy from a branch*, ramo `main`, cartella `/ (root)`, **Save**.
4. Dopo un minuto l'app è su `https://NOMEUTENTE.github.io/sudoku/`.
5. Sul telefono apri quell'indirizzo con Chrome: menu ⋮ → **Aggiungi a schermata Home** → **Installa**.

Per aggiornare l'app basta ricaricare i file modificati nel repository (**Add file → Upload files**).
La nuova versione compare alla seconda apertura dell'app. Se cambi i file, aumenta anche il numero
in `const CACHE = 'sudoku-v1'` dentro `sw.js`.

## Aggiungere puzzle a mano

Ogni puzzle in `puzzles.js` è un oggetto con `id`, `title`, `author`, `sourceUrl`, `source`, `license`,
`difficulty` (`easy`, `medium`, `hard`, `expert`) e `givens` (81 cifre, 0 per le caselle vuote).
Il campo facoltativo `idea` è un commento sul tema, mostrato tra le idee del puzzle.
All'avvio i puzzle senza soluzione unica vengono scartati (avviso nella console).
