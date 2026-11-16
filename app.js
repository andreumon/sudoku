// Sudoku — versione HTML/CSS/JS autonoma (nessun server richiesto).
// Porta fedele dell'applicazione Blazor: Game/Solver.cs, Game/PuzzleLibrary.cs,
// Game/GameSession.cs, Components/Pages/Home.razor(.cs) e wwwroot/sudoku.js.
'use strict';

(() => {

    // =====================================================================
    // Geometria della griglia e risolutore (Solver.cs)
    // =====================================================================

    /** Mostrata in fondo alle impostazioni: serve a capire quale versione sta girando sul telefono. */
    const APP_VERSION = '16 nov 2026 · 7';

    const ALL_DIGITS = 0b11_1111_1110;
    const row = i => (i / 9) | 0;
    const col = i => i % 9;
    const box = i => ((i / 27) | 0) * 3 + ((i % 9 / 3) | 0);

    /** 27 unità: 9 righe, 9 colonne, 9 riquadri. */
    const UNITS = (() => {
        const units = [];
        for (let u = 0; u < 27; u++) units.push([]);
        for (let u = 0; u < 9; u++)
            for (let k = 0; k < 9; k++) {
                units[u].push(u * 9 + k);
                units[9 + u].push(k * 9 + u);
                units[18 + u].push(((u / 3 | 0) * 3 + (k / 3 | 0)) * 9 + u % 3 * 3 + k % 3);
            }
        return units;
    })();

    /** Per ogni casella, le 20 caselle che condividono riga, colonna o riquadro. */
    const PEERS = (() => {
        const peers = [];
        for (let i = 0; i < 81; i++) {
            const list = [];
            for (let j = 0; j < 81; j++)
                if (j !== i && (row(i) === row(j) || col(i) === col(j) || box(i) === box(j))) list.push(j);
            peers.push(list);
        }
        return peers;
    })();

    const popCount = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };

    function isConsistent(grid) {
        for (const unit of UNITS) {
            let seen = 0;
            for (const i of unit) {
                if (grid[i] === 0) continue;
                const bit = 1 << grid[i];
                if (seen & bit) return false;
                seen |= bit;
            }
        }
        return true;
    }

    /** Conta le soluzioni fino a `limit`; restituisce anche la prima trovata. */
    function countSolutions(givens, limit) {
        const solution = new Array(81).fill(0);
        if (givens.length !== 81 || !isConsistent(givens)) return { count: 0, solution };

        const grid = givens.slice();
        const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
        for (let i = 0; i < 81; i++) {
            if (grid[i] === 0) continue;
            const bit = 1 << grid[i];
            rows[row(i)] |= bit; cols[col(i)] |= bit; boxes[box(i)] |= bit;
        }

        let count = 0;
        (function search() {
            let best = -1, bestMask = 0, bestCount = 10;
            for (let i = 0; i < 81; i++) {
                if (grid[i] !== 0) continue;
                const mask = ALL_DIGITS & ~(rows[row(i)] | cols[col(i)] | boxes[box(i)]);
                const n = popCount(mask);
                if (n < bestCount) {
                    best = i; bestMask = mask; bestCount = n;
                    if (n <= 1) break;
                }
            }
            if (best < 0) {
                if (count === 0) for (let i = 0; i < 81; i++) solution[i] = grid[i];
                count++;
                return;
            }
            const r = row(best), c = col(best), b = box(best);
            for (let d = 1; d <= 9 && count < limit; d++) {
                const bit = 1 << d;
                if (!(bestMask & bit)) continue;
                grid[best] = d;
                rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
                search();
                rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
                grid[best] = 0;
            }
        })();
        return { count, solution };
    }

    // =====================================================================
    // Raccolta dei puzzle (PuzzleLibrary.cs)
    // =====================================================================

    const LEVELS = ['easy', 'medium', 'hard', 'expert'];
    const LEVEL_NAMES = { easy: 'Facile', medium: 'Medio', hard: 'Difficile', expert: 'Esperto' };
    const levelName = l => LEVEL_NAMES[l] || l;

    function hashId(text) {
        // FNV-1a a 32 bit: basta per dare un identificativo stabile ai puzzle senza "id".
        let h = 0x811c9dc5;
        for (let k = 0; k < text.length; k++) { h ^= text.charCodeAt(k); h = Math.imul(h, 0x01000193); }
        return 'p' + (h >>> 0).toString(16).padStart(8, '0');
    }

    function loadLibrary(raw) {
        const list = [];
        const seen = new Set();
        for (const p of Array.isArray(raw) ? raw : []) {
            const givens = String(p.givens || '').replace(/\s/g, '');
            if (givens.length !== 81 || /[^0-9.]/.test(givens)) {
                console.warn('Puzzle scartato (griglia non valida):', p.title);
                continue;
            }
            const grid = [...givens].map(c => c === '.' ? 0 : +c);
            const { count, solution } = countSolutions(grid, 2);
            if (count !== 1) {
                console.warn(`Puzzle scartato (${count === 0 ? 'nessuna' : 'più'} soluzioni): ${p.title} di ${p.author}`);
                continue;
            }
            const difficulty = String(p.difficulty || '').toLowerCase();
            const puzzle = {
                id: p.id && String(p.id).trim() ? String(p.id) : hashId(givens),
                title: p.title && String(p.title).trim() ? String(p.title) : 'Senza titolo',
                author: String(p.author || ''),
                sourceUrl: String(p.sourceUrl || ''),
                license: String(p.license || ''),
                difficulty: LEVELS.includes(difficulty) ? difficulty : 'medium',
                source: String(p.source || ''),
                idea: String(p.idea || ''),
                imported: !!p.imported,
                generated: !!p.generated,
                grid,
                solution,
                clueCount: grid.filter(v => v !== 0).length,
            };
            if (seen.has(puzzle.id)) continue;
            seen.add(puzzle.id);
            list.push(puzzle);
        }
        return {
            puzzles: list,
            levels: LEVELS.filter(l => list.some(p => p.difficulty === l)),
            find: id => list.find(p => p.id === id) || null,
            /** I puzzle d'autore di un livello (quelli importati stanno in una sezione a parte). */
            byLevel: level => list.filter(p => p.difficulty === level && !p.imported),
            imported: () => list.filter(p => p.imported && !p.generated),
            generated: () => list.filter(p => p.generated),
        };
    }

    // =====================================================================
    // Partita (GameSession.cs)
    // =====================================================================

    const MODE = { Digit: 0, Corner: 1, Center: 2, Color: 3 };
    const MODE_NAMES = ['Cifra', 'Matita', 'Centro', 'Colore'];
    const MODE_CLASS = ['digit', 'corner', 'center', 'color'];

    class BoardState {
        constructor() {
            this.values = new Array(81).fill(0);
            this.corner = new Array(81).fill(0); // note a matita: bit d acceso = cifra d annotata
            this.center = new Array(81).fill(0); // note centrali
            this.colors = new Array(81).fill(0); // colore della casella, 0 = nessuno
        }
        clone() {
            const b = new BoardState();
            b.values = this.values.slice(); b.corner = this.corner.slice();
            b.center = this.center.slice(); b.colors = this.colors.slice();
            return b;
        }
        sameAs(o) {
            for (let i = 0; i < 81; i++)
                if (this.values[i] !== o.values[i] || this.corner[i] !== o.corner[i] ||
                    this.center[i] !== o.center[i] || this.colors[i] !== o.colors[i]) return false;
            return true;
        }
    }

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    class Game {
        constructor(puzzle, saved) {
            this.puzzle = puzzle;
            this.board = new BoardState();
            this.given = new Array(81).fill(false);
            this.selected = new Array(81).fill(false);
            this.cursor = -1; // ultima casella toccata; -1 se non c'è selezione
            this.seconds = 0;
            this.hints = 0;
            this.ideas = 0; // quanti livelli di "idee del puzzle" sono stati aperti
            this.done = false;
            this.undoStack = [];
            this.redoStack = [];
            /** Suggerimento in corso: { steps, i, precise } — i passi logici fino alla prossima cifra. */
            this.plan = null;

            for (let i = 0; i < 81; i++) {
                this.given[i] = puzzle.grid[i] !== 0;
                this.board.values[i] = puzzle.grid[i];
            }

            if (saved && typeof saved.values === 'string' && saved.values.length === 81 &&
                typeof saved.colors === 'string' && saved.colors.length === 81 &&
                Array.isArray(saved.corner) && saved.corner.length === 81 &&
                Array.isArray(saved.center) && saved.center.length === 81) {
                for (let i = 0; i < 81; i++) {
                    if (!this.given[i]) this.board.values[i] = clamp(saved.values.charCodeAt(i) - 48, 0, 9);
                    this.board.corner[i] = (saved.corner[i] | 0) & ALL_DIGITS;
                    this.board.center[i] = (saved.center[i] | 0) & ALL_DIGITS;
                    this.board.colors[i] = clamp(saved.colors.charCodeAt(i) - 48, 0, 9);
                }
                this.seconds = Math.max(0, saved.seconds | 0);
                this.hints = Math.max(0, saved.hints | 0);
                this.ideas = clamp(saved.ideas | 0, 0, 3);
                this.checkDone();
            }
        }

        toSaved() {
            return {
                values: this.board.values.join(''),
                corner: this.board.corner.slice(),
                center: this.board.center.slice(),
                colors: this.board.colors.join(''),
                seconds: this.seconds,
                hints: this.hints,
                ideas: this.ideas,
                done: this.done,
            };
        }

        get canUndo() { return this.undoStack.length > 0 && !this.done; }
        get canRedo() { return this.redoStack.length > 0 && !this.done; }
        get hasProgress() {
            if (this.undoStack.length > 0) return true;
            const b = this.board;
            for (let i = 0; i < 81; i++)
                if ((!this.given[i] && b.values[i] !== 0) || b.corner[i] || b.center[i] || b.colors[i]) return true;
            return false;
        }

        // ---------- selezione ----------

        get selectedCount() { return this.selected.reduce((n, s) => n + (s ? 1 : 0), 0); }

        clearSelection() { this.selected.fill(false); this.cursor = -1; }

        selectOnly(i) { this.selected.fill(false); this.selected[i] = true; this.cursor = i; }

        setSelected(i, on) {
            this.selected[i] = on;
            if (on) this.cursor = i;
            else if (this.cursor === i) this.cursor = this.selected.indexOf(true);
        }

        selectAll() { this.selected.fill(true); if (this.cursor < 0) this.cursor = 0; }

        move(dRow, dCol, extend) {
            const from = this.cursor < 0 ? 40 - dRow * 9 - dCol : this.cursor;
            const r = (row(from) + dRow + 9) % 9;
            const c = (col(from) + dCol + 9) % 9;
            const to = r * 9 + c;
            if (extend) this.setSelected(to, true);
            else this.selectOnly(to);
        }

        // ---------- modifiche ----------

        mutate(change) {
            if (this.done) return false;
            const before = this.board.clone();
            change(this.board);
            if (before.sameAs(this.board)) return false;
            this.undoStack.push(before);
            this.redoStack.length = 0;
            // il suggerimento in corso resta valido finché cambiano solo note e colori
            if (before.values.some((v, i) => v !== this.board.values[i])) this.plan = null;
            this.checkDone();
            return true;
        }

        checkDone() {
            const v = this.board.values, s = this.puzzle.solution;
            this.done = v.every((x, i) => x === s[i]);
        }

        selectedCells(filter) {
            const out = [];
            for (let i = 0; i < 81; i++) if (this.selected[i] && filter(i)) out.push(i);
            return out;
        }

        /** Inserisce una cifra (o nota, o colore) nelle caselle selezionate; ripetere l'azione la rimuove. */
        enter(d, mode, autoClean) {
            if (d < 1 || d > 9) return false;
            const bit = 1 << d;
            return this.mutate(b => {
                if (mode === MODE.Digit) {
                    const cells = this.selectedCells(i => !this.given[i]);
                    const remove = cells.length > 0 && cells.every(i => b.values[i] === d);
                    for (const i of cells) {
                        b.values[i] = remove ? 0 : d;
                        if (remove || !autoClean) continue;
                        for (const p of PEERS[i]) { b.corner[p] &= ~bit; b.center[p] &= ~bit; }
                    }
                } else if (mode === MODE.Corner || mode === MODE.Center) {
                    // matita e centro non convivono: scrivere in un modo cancella l'altro nella casella
                    const marks = mode === MODE.Corner ? b.corner : b.center;
                    const other = mode === MODE.Corner ? b.center : b.corner;
                    const cells = this.selectedCells(i => b.values[i] === 0);
                    const remove = cells.length > 0 && cells.every(i => (marks[i] & bit) !== 0);
                    for (const i of cells) {
                        if (remove) marks[i] &= ~bit;
                        else { marks[i] |= bit; other[i] = 0; }
                    }
                } else {
                    const cells = this.selectedCells(() => true);
                    const remove = cells.length > 0 && cells.every(i => b.colors[i] === d);
                    for (const i of cells) b.colors[i] = remove ? 0 : d;
                }
            });
        }

        /** Cancella a strati: prima le cifre, poi le note, infine i colori. */
        erase() {
            return this.mutate(b => {
                const cells = this.selectedCells(() => true);
                if (cells.some(i => !this.given[i] && b.values[i] !== 0)) {
                    for (const i of cells) if (!this.given[i]) b.values[i] = 0;
                } else if (cells.some(i => b.corner[i] || b.center[i])) {
                    for (const i of cells) b.corner[i] = b.center[i] = 0;
                } else {
                    for (const i of cells) b.colors[i] = 0;
                }
            });
        }

        undo() {
            if (!this.canUndo) return false;
            this.redoStack.push(this.board);
            this.board = this.undoStack.pop();
            this.plan = null;
            return true;
        }

        redo() {
            if (!this.canRedo) return false;
            this.undoStack.push(this.board);
            this.board = this.redoStack.pop();
            this.plan = null;
            this.checkDone();
            return true;
        }

        restart() {
            this.board = new BoardState();
            for (let i = 0; i < 81; i++) this.board.values[i] = this.puzzle.grid[i];
            this.undoStack.length = 0;
            this.redoStack.length = 0;
            this.plan = null;
            this.seconds = 0;
            this.hints = 0;
            this.ideas = 0;
            this.done = false;
            this.clearSelection();
        }

        // ---------- analisi ----------

        /** Cifre ancora possibili in una casella, viste le cifre già scritte. */
        candidates(i) {
            let used = 0;
            for (const p of PEERS[i]) used |= 1 << this.board.values[p];
            return ALL_DIGITS & ~used;
        }

        /** Caselle che violano le regole (stessa cifra in riga, colonna o riquadro). */
        conflicts() {
            const result = new Array(81).fill(false);
            const firstAt = new Array(10);
            for (const unit of UNITS) {
                firstAt.fill(-1);
                for (const i of unit) {
                    const v = this.board.values[i];
                    if (v === 0) continue;
                    if (firstAt[v] < 0) { firstAt[v] = i; continue; }
                    result[i] = result[firstAt[v]] = true;
                }
            }
            return result;
        }

        /** Caselle compilate dal giocatore con una cifra diversa dalla soluzione. */
        wrongCells() {
            const out = [];
            for (let i = 0; i < 81; i++) {
                const v = this.board.values[i];
                if (!this.given[i] && v !== 0 && v !== this.puzzle.solution[i]) out.push(i);
            }
            return out;
        }

        digitCounts() {
            const counts = new Array(10).fill(0);
            for (const v of this.board.values) counts[v]++;
            return counts;
        }

        get emptyCount() { return this.board.values.filter(v => v === 0).length; }

        /** Riempie le note a matita di tutte le caselle vuote con le cifre possibili. */
        autoNotes() {
            return this.mutate(b => {
                for (let i = 0; i < 81; i++) if (b.values[i] === 0) { b.corner[i] = this.candidates(i); b.center[i] = 0; }
            });
        }

        /** Cancella tutte le note, a matita e al centro (cifre e colori restano). */
        clearNotes() {
            return this.mutate(b => { b.corner.fill(0); b.center.fill(0); });
        }

        /**
         * Suggerimento per tecnica, un passo per pressione: prima che cosa cercare e dove,
         * poi le caselle coinvolte e la conseguenza; solo alla fine, se richiesto, la cifra.
         * Restituisce { text, more } dove `more` dice se c'è ancora qualcosa da mostrare.
         */
        hint() {
            if (this.done) return { text: 'Il puzzle è già risolto.', more: false };

            const wrong = this.wrongCells();
            if (wrong.length > 0) {
                this.selectOnly(wrong[0]);
                this.plan = null;
                return {
                    text: wrong.length === 1
                        ? 'Questa cifra non è corretta: conviene sistemarla prima di proseguire.'
                        : `Ci sono ${wrong.length} cifre non corrette: questa è la prima.`,
                    more: false,
                };
            }

            const Logic = window.SudokuLogic;
            let intro = '';
            if (!this.plan) {
                this.plan = { steps: Logic.nextSteps(this.board.values, this.puzzle.solution), i: 0, precise: false, write: false };
                this.hints++;
                const extra = this.plan.steps.length - 1;
                if (extra > 0) intro = extra === 1
                    ? 'Prima della prossima cifra serve un\'osservazione sui candidati. '
                    : `Prima della prossima cifra servono ${extra} osservazioni sui candidati. `;
            }
            const p = this.plan, step = p.steps[p.i];
            const placing = step.cell != null;

            if (p.write) {
                this.selectOnly(step.cell);
                this.mutate(b => {
                    b.values[step.cell] = this.puzzle.solution[step.cell];
                    const bit = 1 << b.values[step.cell];
                    b.corner[step.cell] = b.center[step.cell] = 0;
                    for (const peer of PEERS[step.cell]) { b.corner[peer] &= ~bit; b.center[peer] &= ~bit; }
                });
                this.plan = null;
                return { text: 'Cifra scritta.', more: false, changed: true };
            }
            if (!p.precise) {
                p.precise = true;
                this.clearSelection();
                return { text: intro + Logic.describeStep(step, false), more: true, next: 'Mostra dove' };
            }
            // caselle coinvolte
            this.selected.fill(false);
            for (const i of (placing ? [step.cell] : step.cells)) this.selected[i] = true;
            this.cursor = placing ? step.cell : step.cells[0];
            const text = Logic.describeStep(step, true);
            if (placing) { p.write = true; return { text, more: true, next: 'Scrivi la cifra' }; }
            p.i++; p.precise = false;
            return { text, more: true, next: 'Passo successivo' };
        }
    }

    // =====================================================================
    // Salvataggi locali
    // =====================================================================

    const SETTINGS_KEY = 'sudoku.settings';
    const PROGRESS_KEY = 'sudoku.progress';
    const HISTORY_KEY = 'sudoku.history';
    const CURRENT_KEY = 'sudoku.current';
    const THEME_KEY = 'sudoku.theme';
    const IMPORTED_KEY = 'sudoku.imported';
    const LIKES_KEY = 'sudoku.likes';
    const CHALLENGES_KEY = 'sudoku.challenges';
    const gameKey = id => 'sudoku.game.' + id;

    const storage = {
        loadRaw(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
        load(key) {
            const raw = storage.loadRaw(key);
            if (!raw) return null;
            try { return JSON.parse(raw); } catch (e) { return null; }
        },
        saveRaw(key, value) { try { localStorage.setItem(key, value); } catch (e) { } },
        save(key, value) { storage.saveRaw(key, JSON.stringify(value)); },
        remove(key) { try { localStorage.removeItem(key); } catch (e) { } },
    };

    // =====================================================================
    // Icone (Icon.razor)
    // =====================================================================

    const ICONS = {
        undo: "<path d='M9 14 4 9l5-5'/><path d='M4 9h10a6 6 0 0 1 0 12h-3'/>",
        redo: "<path d='m15 14 5-5-5-5'/><path d='M20 9H10a6 6 0 0 0 0 12h3'/>",
        erase: "<path d='M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z'/><path d='m12 9.5 5 5M17 9.5l-5 5'/>",
        hint: "<path d='M9.5 18h5M10.5 21h3'/><path d='M12 3a6 6 0 0 0-4 10.5c.7.7 1.1 1.5 1.2 2.5h5.6c.1-1 .5-1.8 1.2-2.5A6 6 0 0 0 12 3z'/>",
        check: "<path d='m5 12.5 4.5 4.5L19 7'/>",
        notes: "<path d='M4 20h4L19 9l-4-4L4 16v4z'/><path d='m13 7 4 4'/>",
        sun: "<circle cx='12' cy='12' r='4'/><path d='M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4'/>",
        moon: "<path d='M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'/>",
        pause: "<path d='M9 6v12M15 6v12'/>",
        play: "<path d='M8 5.5v13l10-6.5z'/>",
        settings: "<path d='M4 7h9M19 7h1M4 17h1M11 17h9'/><circle cx='16' cy='7' r='2.5'/><circle cx='8' cy='17' r='2.5'/>",
        library: "<rect x='4' y='4' width='16' height='16' rx='2.5'/><path d='M4 9.33h16M4 14.67h16M9.33 4v16M14.67 4v16'/>",
        restart: "<path d='M4 12a8 8 0 1 0 2.6-5.9'/><path d='M4 4v5h5'/>",
        close: "<path d='M6 6l12 12M18 6 6 18'/>",
        link: "<path d='M8 16 16 8M9.5 8H16v6.5'/>",
        heart: "<path d='M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z'/>",
        help: "<circle cx='12' cy='12' r='8.5'/><path d='M9.7 9.6a2.4 2.4 0 1 1 3.5 2.2c-.8.4-1.2 1-1.2 1.8'/><path d='M12 16.6v.1'/>",
        target: "<circle cx='12' cy='12' r='8'/><circle cx='12' cy='12' r='3'/>",
        image: "<rect x='4' y='4' width='16' height='16' rx='2.5'/><circle cx='9' cy='9.5' r='1.5'/><path d='m5 17 4.5-4.5 3 3L15 13l4 4'/>",
        trash: "<path d='M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12'/>",
        share: "<circle cx='6.5' cy='12' r='2.3'/><circle cx='17' cy='6.5' r='2.3'/><circle cx='17' cy='17.5' r='2.3'/><path d='m8.6 11 6.3-3.4M8.6 13l6.3 3.4'/>",
        shuffle: "<path d='M4 7h3c5 0 5 10 10 10h3M4 17h3c1.6 0 2.7-1 3.6-2.3M20 7h-3c-1.6 0-2.7 1-3.6 2.3'/><path d='m17.5 4.5 2.5 2.5-2.5 2.5M17.5 14.5 20 17l-2.5 2.5'/>",
    };

    const icon = name =>
        `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ` +
        `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

    // =====================================================================
    // Utilità di presentazione
    // =====================================================================

    const esc = s => String(s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    function time(seconds) {
        const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
        const ss = String(s).padStart(2, '0');
        return h >= 1 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
    }

    function formatDate(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return '';
        const day = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
        const hm = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        return `${day}, ${hm}`;
    }

    function digitsOf(mask) {
        const out = [];
        for (let d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d);
        return out;
    }

    const h = (tag, cls, html) => {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (html != null) el.innerHTML = html;
        return el;
    };

    // =====================================================================
    // Stato dell'applicazione (Home.razor.cs)
    // =====================================================================

    const DEFAULT_SETTINGS = {
        showConflicts: true,
        showWrong: false,
        highlightSame: true,
        highlightPeers: true,
        autoClean: true,
        showTimer: true,
        level: '',
        name: '',
        source: 'authored', // authored | generated | both
        genCount: 0,
    };

    let imported = storage.load(IMPORTED_KEY) || [];
    if (!Array.isArray(imported)) imported = [];
    let likes = storage.load(LIKES_KEY) || {};
    if (typeof likes !== 'object' || Array.isArray(likes)) likes = {};

    /** Sfide ricevute: id del puzzle → { from, seconds (null se chi sfida non l'aveva finito), hints }. */
    let challenges = storage.load(CHALLENGES_KEY) || {};
    if (typeof challenges !== 'object' || Array.isArray(challenges)) challenges = {};

    let library = loadLibrary((window.SUDOKU_PUZZLES || []).concat(imported));
    const rebuildLibrary = () => { library = loadLibrary((window.SUDOKU_PUZZLES || []).concat(imported)); };
    const Logic = window.SudokuLogic;

    let game = null;
    let settings = Object.assign({}, DEFAULT_SETTINGS, storage.load(SETTINGS_KEY) || {});
    let progress = storage.load(PROGRESS_KEY) || {};
    let history = storage.load(HISTORY_KEY) || [];
    if (typeof progress !== 'object' || Array.isArray(progress)) progress = {};
    if (!Array.isArray(history)) history = [];

    let mode = MODE.Digit;
    let dialog = 'none'; // none | settings | library | done | restart | aids
    let theme = document.documentElement.dataset.theme || 'light';
    let paused = false;
    let dragAdd = true;
    /** Diventa vero alla prima interazione: una scheda rimasta intatta non fa avanzare il tempo né sovrascrive i salvataggi. */
    let active = false;
    let flagged = new Set();
    let showHistory = false;
    /** Cifra "armata" (modalità cifra-prima): toccando una casella la si scrive. 0 = nessuna. */
    let armed = 0;
    let toastTimer = 0;
    /** Bozza di un puzzle letto da screenshot, in attesa di conferma. */
    let draft = null;
    let pendingDelete = null;
    /** Righe, colonne, riquadri e cifre già completi: serve a capire cosa si è appena chiuso. */
    let completeBefore = new Set();
    const ideasCache = new Map();
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

    // ---------- salvataggi ----------

    function save() {
        if (!game || !active) return;
        const id = game.puzzle.id;
        if (game.hasProgress || id in progress) {
            progress[id] = { done: game.done, seconds: game.seconds, hints: game.hints };
            storage.save(PROGRESS_KEY, progress);
        }
        storage.save(gameKey(id), game.toSaved());
    }

    const saveSettings = () => storage.save(SETTINGS_KEY, settings);

    // ---------- scelta del puzzle ----------

    const isDone = p => !!(progress[p.id] && progress[p.id].done);

    function pickForLevel(level) {
        const list = library.byLevel(level);
        return list.find(p => !isDone(p)) || list[0];
    }

    function openPuzzle(puzzle, saveCurrent = true) {
        if (saveCurrent) { save(); active = true; }
        hideHint();
        game = new Game(puzzle, storage.load(gameKey(puzzle.id)));
        settings.level = puzzle.difficulty;
        flagged.clear();
        armed = 0;
        paused = false;
        completeBefore = completeSet(game);
        storage.saveRaw(CURRENT_KEY, puzzle.id);
        saveSettings();
        buildCaption();
        buildBoard();
        setDialog('none');
        render();
    }

    // ---------- puzzle generati ----------

    let generating = null; // livello in corso di generazione, se c'è

    /**
     * Genera un puzzle del livello chiesto e lo apre. Lavora a piccoli passi (un tentativo alla volta)
     * per non bloccare l'interfaccia: in media bastano pochi tentativi da qualche millisecondo.
     */
    function openGenerated(level) {
        if (generating) return;
        generating = level;
        const started = Date.now();
        let told = false;
        const tick = () => {
            const t0 = Date.now();
            let grid = null;
            while (!grid && Date.now() - t0 < 14) grid = Logic.generateAttempt(level);
            if (!grid) {
                if (!told && Date.now() - started > 350) { told = true; showToast('Genero un puzzle…'); }
                return setTimeout(tick, 0);
            }
            generating = null;
            const givens = grid.join('');
            const id = 'gen-' + hashId(givens).slice(1);
            settings.genCount = (settings.genCount | 0) + 1;
            // i generati mai toccati non si accumulano
            imported = imported.filter(p => !p.generated || p.id in progress || likes[p.id] || (game && p.id === game.puzzle.id && game.hasProgress));
            imported.push({
                id, title: 'Generato n. ' + settings.genCount, author: '', difficulty: level, givens,
                imported: true, generated: true, date: new Date().toISOString(),
            });
            storage.save(IMPORTED_KEY, imported);
            if (game && !imported.some(p => p.id === game.puzzle.id) && game.puzzle.generated) {
                storage.remove(gameKey(game.puzzle.id));
                game = null;
            }
            rebuildLibrary();
            openPuzzle(library.find(id));
        };
        setTimeout(tick, 0);
    }

    /** Un nuovo puzzle del livello, secondo la fonte scelta nelle impostazioni. */
    function newPuzzle(level, excludeId) {
        const src = settings.source;
        if (src === 'generated' || (src === 'both' && Math.random() < .5)) return openGenerated(level);
        const others = library.byLevel(level).filter(p => p.id !== excludeId);
        const fresh = others.filter(p => !isDone(p));
        const pool = fresh.length > 0 ? fresh : others;
        if (pool.length === 0) {
            setDialog('none');
            showToast("Per questo livello c'è un solo puzzle nella raccolta.");
            return;
        }
        openPuzzle(pool[Math.floor(Math.random() * pool.length)]);
    }

    function setLevel(level) {
        if (!game || level === game.puzzle.difficulty) return;
        if (settings.source === 'generated') {
            const open = library.generated().find(p => p.difficulty === level && !isDone(p));
            return open ? openPuzzle(open) : openGenerated(level);
        }
        openPuzzle(pickForLevel(level));
    }

    function randomPuzzle() {
        if (!game) return;
        newPuzzle(settings.level, game.puzzle.id);
    }

    function restart() {
        if (!game) return;
        active = true;
        game.restart();
        delete progress[game.puzzle.id];
        storage.save(PROGRESS_KEY, progress);
        flagged.clear();
        paused = false;
        completeBefore = completeSet(game);
        save();
        buildBoard();
        setDialog('none');
        render();
    }

    // ---------- comandi ----------

    /** Unità (u0..u26) e cifre (d1..d9) complete e senza ripetizioni. */
    function completeSet(g) {
        const set = new Set(), v = g.board.values;
        for (let u = 0; u < 27; u++) {
            let seen = 0;
            for (const i of UNITS[u]) seen |= 1 << v[i];
            if (seen === ALL_DIGITS) set.add('u' + u);
        }
        for (let d = 1; d <= 9; d++) {
            let rows = 0, cols = 0, n = 0;
            for (let i = 0; i < 81; i++) if (v[i] === d) { rows |= 1 << row(i); cols |= 1 << col(i); n++; }
            if (n === 9 && rows === 511 && cols === 511) set.add('d' + d);
        }
        return set;
    }

    /** Un'onda leggera parte dalla casella toccata e attraversa ciò che si è appena completato. */
    function playWave(keys, origin) {
        if (reducedMotion.matches || !cells.length) return;
        const v = game.board.values;
        const hit = new Set();
        for (const key of keys) {
            if (key[0] === 'u') for (const i of UNITS[+key.slice(1)]) hit.add(i);
            else for (let i = 0; i < 81; i++) if (v[i] === +key.slice(1)) hit.add(i);
        }
        const tint = getComputedStyle(document.documentElement).getPropertyValue('--sel').trim();
        for (const i of hit) {
            const c = cells[i];
            const delay = (Math.abs(row(i) - row(origin)) + Math.abs(col(i) - col(origin))) * 34;
            c.el.animate([{ offset: .35, backgroundColor: tint }], { duration: 640, delay, easing: 'ease-out' });
            if (c.valEl) c.valEl.animate([{ offset: .4, transform: 'translateY(-8%) scale(1.12)' }],
                { duration: 520, delay, easing: 'cubic-bezier(.3, .7, .2, 1)' });
        }
    }

    function afterAction(changed) {
        if (!game) return;
        active = true;
        let closed = [];
        if (changed) {
            flagged.clear();
            save();
            const now = completeSet(game);
            closed = [...now].filter(k => !completeBefore.has(k));
            completeBefore = now;
            if (game.done) completed();
        }
        if (!game.plan && els.app.querySelector('.hintbar:not(.updatebar) .primary')) hideHint();
        render();
        if (closed.length && !game.done)
            playWave(closed, game.cursor >= 0 ? game.cursor : lastCell >= 0 ? lastCell : 40);
    }

    function completed() {
        const g = game;
        g.clearSelection();
        armed = 0;
        history.push({
            id: g.puzzle.id,
            title: g.puzzle.title,
            author: g.puzzle.author,
            level: g.puzzle.difficulty,
            seconds: g.seconds,
            hints: g.hints,
            date: new Date().toISOString(),
        });
        storage.save(HISTORY_KEY, history);
        setTimeout(() => {
            if (game === g && g.done && dialog === 'none') setDialog('done');
        }, 1300);
    }

    const SOURCES = ['authored', 'generated', 'both'];
    const SOURCE_NAMES = ["D'autore", 'Generati', 'Entrambi'];
    const isLiked = p => !!likes[p.id];
    const byline = p => p.generated ? 'generato dal computer' : p.imported ? 'importato da screenshot' : 'di ' + esc(p.author);

    function toggleLike() {
        const id = game.puzzle.id;
        if (likes[id]) delete likes[id]; else likes[id] = true;
        storage.save(LIKES_KEY, likes);
        for (const b of els.app.querySelectorAll('[data-action="like"]')) {
            b.classList.toggle('on', !!likes[id]);
            b.setAttribute('aria-pressed', !!likes[id]);
        }
    }

    // ---------- sfida: un link porta il puzzle (e il tempo, se c'è) a un amico ----------

    function challengeLink() {
        const p = game.puzzle, q = new URLSearchParams();
        q.set('p', p.imported ? p.grid.join('') : p.id);
        if (p.imported) q.set('n', p.title);
        if (settings.name.trim()) q.set('da', settings.name.trim());
        if (game.done) { q.set('t', game.seconds); if (game.hints) q.set('a', game.hints); }
        return location.href.split('#')[0] + '#sfida?' + q.toString();
    }

    function challengeText() {
        const p = game.puzzle;
        let text = `Ti sfido a questo sudoku: «${p.title}» (${levelName(p.difficulty).toLowerCase()}).`;
        if (game.done) text += ` Il mio tempo: ${time(game.seconds)}${game.hints ? ` con ${game.hints} ${game.hints === 1 ? 'aiuto' : 'aiuti'}` : ''}.`;
        return text;
    }

    async function shareChallenge(useSheet) {
        const url = challengeLink(), text = challengeText();
        if (useSheet && navigator.share) {
            try { await navigator.share({ title: 'Sudoku', text, url }); } catch (e) { }
            return;
        }
        try {
            await navigator.clipboard.writeText(text + ' ' + url);
            showToast('Link copiato.');
        } catch (e) {
            const field = els.app.querySelector('.ch-link');
            if (field) { field.focus(); field.select(); }
            showToast('Copia il link dal riquadro.');
        }
    }

    /** Legge una sfida dall'indirizzo (#sfida?...), la registra e restituisce il puzzle da aprire. */
    function readChallenge() {
        const m = location.hash.match(/^#sfida\?(.*)$/);
        if (!m) return null;
        const q = new URLSearchParams(m[1]);
        try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { }
        const from = (q.get('da') || 'Un amico').slice(0, 30);
        const ref = q.get('p') || '';
        let puzzle = library.find(ref);
        if (!puzzle && /^[0-9]{81}$/.test(ref)) {
            puzzle = library.puzzles.find(p => p.grid.join('') === ref);
            if (!puzzle) {
                const graded = Logic.grade([...ref].map(Number));
                if (graded) {
                    const id = 'imp-' + hashId(ref).slice(1);
                    imported.push({
                        id, title: (q.get('n') || 'Sfida di ' + from).slice(0, 60), author: '', difficulty: graded.level,
                        givens: ref, imported: true, date: new Date().toISOString(),
                    });
                    storage.save(IMPORTED_KEY, imported);
                    rebuildLibrary();
                    puzzle = library.find(id);
                }
            }
        }
        if (!puzzle) return false;
        const t = parseInt(q.get('t'), 10);
        challenges[puzzle.id] = { from, seconds: t > 0 ? t : null, hints: Math.max(0, parseInt(q.get('a'), 10) || 0) };
        storage.save(CHALLENGES_KEY, challenges);
        return puzzle;
    }

    /** Esito di una sfida a puzzle risolto. */
    function challengeResult() {
        const ch = challenges[game.puzzle.id];
        if (!ch) return '';
        if (ch.seconds == null) return `<p class="versus">Sfida di <b>${esc(ch.from)}</b>: mandagli il tuo tempo.</p>`;
        const diff = ch.seconds - game.seconds;
        const verdict = diff > 0 ? `Hai vinto di ${time(diff)}.` : diff < 0 ? `${esc(ch.from)} vince di ${time(-diff)}.` : 'Pari esatto.';
        return `<p class="versus"><b>${esc(ch.from)}</b> ${time(ch.seconds)} · <b>tu</b> ${time(game.seconds)}<br>${verdict}</p>`;
    }

    function press(d) {
        // Nessuna casella selezionata: la cifra resta armata e si scrive toccando le caselle.
        if (game.selectedCount === 0) {
            armed = armed === d ? 0 : d;
            render();
            return;
        }
        afterAction(game.enter(d, mode, settings.autoClean));
    }

    function setMode(m) { mode = m; render(); }

    /** Il suggerimento resta visibile in una barra con il pulsante per il passo successivo. */
    function hint() {
        const r = game.hint();
        active = true;
        let bar = els.app.querySelector('.hintbar:not(.updatebar)');
        if (!bar) {
            bar = h('div', 'hintbar');
            bar.setAttribute('role', 'status');
            els.app.appendChild(bar);
        }
        bar.innerHTML = `<p>${esc(r.text)}</p><div class="hint-actions">` +
            (r.more ? `<button type="button" class="primary" data-action="hint">${esc(r.next)}</button>` : '') +
            `<button type="button" class="ghost" data-action="hint-close">Chiudi</button></div>`;
        if (!r.more) setTimeout(() => { if (!game.plan) hideHint(); }, 2600);
        save();
        afterAction(!!r.changed);
    }

    function hideHint() {
        const bar = els.app && els.app.querySelector('.hintbar:not(.updatebar)');
        if (bar) bar.remove();
        if (game) game.plan = null;
    }

    function verify() {
        const wrong = game.wrongCells();
        flagged = new Set(wrong);
        showToast(
            wrong.length === 0 && game.emptyCount === 0 ? 'Tutto corretto.' :
            wrong.length === 0 ? 'Nessun errore finora.' :
            wrong.length === 1 ? "C'è una cifra non corretta." :
            `Ci sono ${wrong.length} cifre non corrette.`);
        render();
    }

    function togglePause() {
        if (!game || game.done) return;
        paused = !paused;
        if (paused) save();
        render();
    }

    function toggleTheme() {
        theme = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = theme;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = theme === 'dark' ? '#111215' : '#f6f5f1';
        storage.saveRaw(THEME_KEY, theme);
        render();
    }

    function showToast(message) {
        const old = els.app.querySelector('.toast');
        if (old) old.remove();
        clearTimeout(toastTimer);
        const t = h('div', 'toast');
        t.setAttribute('role', 'status');
        t.textContent = message;
        els.app.appendChild(t);
        toastTimer = setTimeout(() => t.remove(), 4200);
    }

    function status(p) {
        const e = progress[p.id];
        if (!e) return '';
        return e.done ? `Risolto · ${time(e.seconds)}` : `In corso · ${time(e.seconds)}`;
    }

    // =====================================================================
    // Interfaccia: struttura (creata una volta) e aggiornamento mirato
    // =====================================================================

    const els = { app: document.getElementById('app') };
    let cells = [];       // { el, cls, style, v, valEl, cornerEl, centerEl }
    let padKeys = [];     // pulsanti 1..9
    let padShowsColor = null;

    function buildShell() {
        const levels = library.levels;
        els.app.innerHTML = `
            <header class="top">
                <div class="brand">Sudoku</div>
                <div class="seg levels" style="--n:${levels.length};--idx:0">
                    ${levels.map(l => `<button type="button" data-level="${l}">${levelName(l)}</button>`).join('')}
                </div>
                <select class="level-select" aria-label="Difficoltà">
                    ${levels.map(l => `<option value="${l}">${levelName(l)}</option>`).join('')}
                </select>
                <div class="tools">
                    <button type="button" class="timer" data-action="pause"></button>
                    <button type="button" class="icon-btn" title="Raccolta e cronologia" data-action="library">${icon('library')}</button>
                    <button type="button" class="icon-btn" title="Tema chiaro/scuro" data-action="theme"></button>
                    <button type="button" class="icon-btn" title="Impostazioni" data-action="settings">${icon('settings')}</button>
                </div>
            </header>
            <main class="stage">
                <section class="play">
                    <div class="caption"></div>
                    <div class="board"></div>
                </section>
                <aside class="panel">
                    <div class="seg modes" style="--n:4;--idx:0">
                        ${MODE_NAMES.map((n, m) => `<button type="button" data-mode="${m}">${n}</button>`).join('')}
                    </div>
                    <div class="pad">
                        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button type="button" class="key" data-digit="${d}" aria-label="${d}" style="--px:${(d - 1) % 3 - 1};--py:${((d - 1) / 3 | 0) - 1}"></button>`).join('')}
                        <button type="button" class="key erase only-mobile" data-action="erase" aria-label="Cancella">${icon('erase')}</button>
                    </div>
                    <div class="actions">
                        <button type="button" data-action="undo">${icon('undo')}<span>Annulla</span></button>
                        <button type="button" data-action="redo">${icon('redo')}<span>Ripeti</span></button>
                        <button type="button" class="only-desktop" data-action="erase">${icon('erase')}<span>Cancella</span></button>
                        <button type="button" data-action="pencil" aria-pressed="false">${icon('notes')}<span>Matita</span></button>
                        <button type="button" data-action="ideas">${icon('hint')}<span>Idee</span></button>
                        <button type="button" data-action="aids">${icon('help')}<span>Aiuti</span></button>
                    </div>
                    <div class="more">
                        <button type="button" class="ghost" data-action="ask-restart">${icon('restart')}Ricomincia</button>
                        <button type="button" class="ghost" data-action="random">${icon('shuffle')}Nuovo puzzle</button>
                    </div>
                </aside>
            </main>
            <input type="file" accept="image/*" class="file" hidden />`;

        const q = s => els.app.querySelector(s);
        els.levels = q('.levels');
        els.levelSelect = q('.level-select');
        els.timer = q('.timer');
        els.themeBtn = q('[data-action="theme"]');
        els.caption = q('.caption');
        els.board = q('.board');
        els.modes = q('.modes');
        els.pad = q('.pad');
        els.undo = q('[data-action="undo"]');
        els.redo = q('[data-action="redo"]');
        els.pencil = q('[data-action="pencil"]');
        els.gameButtons = [...els.app.querySelectorAll('.actions [data-action="erase"], [data-action="pencil"], [data-action="aids"]')];
        padKeys = [...els.pad.querySelectorAll('[data-digit]')];

        els.file = q('.file');
        els.file.addEventListener('change', onFile);

        els.app.addEventListener('click', onClick);
        els.levelSelect.addEventListener('change', e => setLevel(e.target.value));
    }

    /** Sostituisce un elemento con una copia nuova, così le animazioni d'ingresso ripartono. */
    function fresh(el) {
        const copy = el.cloneNode(false);
        el.replaceWith(copy);
        return copy;
    }

    function buildCaption() {
        const p = game.puzzle;
        els.caption = fresh(els.caption);
        const author = p.generated ? 'generato' : p.imported ? 'importato'
            : p.sourceUrl ? `di <a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.author)}${icon('link')}</a>`
            : 'di ' + esc(p.author);
        els.caption.innerHTML = `<span class="title">${esc(p.title)}</span><span class="by">${author}</span>` +
            `<button type="button" class="cap-btn" data-action="challenge" aria-label="Sfida un amico">${icon('share')}</button>` +
            `<button type="button" class="like ${isLiked(p) ? 'on' : ''}" data-action="like" aria-label="Mi piace" aria-pressed="${isLiked(p)}">${icon('heart')}</button>`;
        els.like = els.caption.querySelector('.like');
    }

    function buildBoard() {
        els.board = fresh(els.board);
        cells = [];
        for (let i = 0; i < 81; i++) {
            const el = h('div', 'cell');
            el.dataset.i = i;
            els.board.appendChild(el);
            cells.push({ el, cls: '', style: '', v: -1, valEl: null, cornerEl: null, centerEl: null });
        }
        els.resume = null;
    }

    /** Ogni nota è un elemento legato alla sua cifra: aggiungerne o toglierne una non ridisegna le altre. */
    function syncNotes(container, digits, sameDigit) {
        const want = new Set(digits);
        for (const el of [...container.children]) if (!want.has(+el.dataset.d)) el.remove();
        digits.forEach((d, k) => {
            let el = container.children[k];
            if (!el || +el.dataset.d !== d) {
                const made = document.createElement('i');
                made.dataset.d = d;
                made.textContent = d;
                container.insertBefore(made, el || null);
                el = made;
            }
            const cls = `d${d}` + (d === sameDigit ? ' hit' : '');
            if (el.className !== cls) el.className = cls;
        });
    }

    function updateCell(i, ctx) {
        const g = game, b = g.board, c = cells[i], el = c.el;
        const v = b.values[i];

        // classi
        let cls = 'cell';
        if (g.given[i]) cls += ' given';
        if (g.selected[i]) cls += ' sel';
        else if (v !== 0 && v === ctx.sameDigit) cls += ' same';
        else if (ctx.peers[i]) cls += ' peer';
        if (i % 9 % 3 === 2 && i % 9 !== 8) cls += ' br';
        if ((i / 9 | 0) % 3 === 2 && (i / 9 | 0) !== 8) cls += ' bb';
        const wrong = v !== 0 && !g.given[i] && v !== g.puzzle.solution[i];
        if (ctx.conflicts[i] || (wrong && (settings.showWrong || flagged.has(i)))) cls += ' err';
        if (cls !== c.cls) { el.className = cls; c.cls = cls; }

        // colore e ritardo dell'onda finale
        const color = b.colors[i];
        let style = `--d:${(i / 9 | 0) + i % 9};--k:${ctx.dist[i]}`;
        if (color) style += `;--fill:var(--c${color})`;
        if (style !== c.style) { el.setAttribute('style', style); c.style = style; }

        // contenuto
        if (v !== c.v) {
            if (c.valEl) { c.valEl.remove(); c.valEl = null; }
            if (v) {
                if (c.cornerEl) { c.cornerEl.remove(); c.cornerEl = null; }
                if (c.centerEl) { c.centerEl.remove(); c.centerEl = null; }
                c.valEl = h('span', 'val');
                c.valEl.textContent = v;
                el.appendChild(c.valEl);
            }
            c.v = v;
        }
        if (v) return;

        const corner = digitsOf(b.corner[i]);
        if (corner.length) {
            if (!c.cornerEl) { c.cornerEl = h('span', 'corner'); el.insertBefore(c.cornerEl, c.centerEl); }
            syncNotes(c.cornerEl, corner, ctx.sameDigit, true);
        } else if (c.cornerEl) { c.cornerEl.remove(); c.cornerEl = null; }

        const center = digitsOf(b.center[i]);
        if (center.length) {
            if (!c.centerEl) { c.centerEl = h('span', ''); el.appendChild(c.centerEl); }
            const ccls = `center n${center.length}`;
            if (c.centerEl.className !== ccls) c.centerEl.className = ccls;
            syncNotes(c.centerEl, center, ctx.sameDigit, false);
        } else if (c.centerEl) { c.centerEl.remove(); c.centerEl = null; }
    }

    function setSeg(seg, idx, isOn) {
        seg.style.setProperty('--idx', idx);
        [...seg.children].forEach((btn, k) => btn.classList.toggle('on', isOn(btn, k)));
    }

    function render() {
        if (!game) return;
        const g = game;

        // intestazione
        const levels = library.levels;
        setSeg(els.levels, Math.max(0, levels.indexOf(g.puzzle.difficulty)), btn => btn.dataset.level === g.puzzle.difficulty);
        if (els.levelSelect.value !== g.puzzle.difficulty) els.levelSelect.value = g.puzzle.difficulty;

        els.timer.style.display = settings.showTimer ? '' : 'none';
        els.timer.disabled = g.done;
        els.timer.title = paused ? 'Riprendi' : 'Pausa';
        renderTimer();
        const themeIcon = theme === 'dark' ? 'sun' : 'moon';
        if (els.themeBtn.dataset.icon !== themeIcon) {
            els.themeBtn.dataset.icon = themeIcon;
            els.themeBtn.innerHTML = icon(themeIcon);
        }

        // griglia
        const ctx = {
            conflicts: settings.showConflicts ? g.conflicts() : new Array(81).fill(false),
            peers: new Array(81).fill(false),
            sameDigit: mode === MODE.Color ? 0 : armed,
            dist: new Array(81).fill(0), // distanza dalla casella toccata: le evidenziazioni si propagano a onda
        };
        if (g.cursor >= 0 && !g.done && g.selectedCount === 1) {
            if (settings.highlightSame) ctx.sameDigit = g.board.values[g.cursor];
            if (settings.highlightPeers) for (const p of PEERS[g.cursor]) ctx.peers[p] = true;
            for (let i = 0; i < 81; i++)
                ctx.dist[i] = Math.max(Math.abs(row(i) - row(g.cursor)), Math.abs(col(i) - col(g.cursor)));
        }
        for (let i = 0; i < 81; i++) updateCell(i, ctx);

        els.like.classList.toggle('show', g.done);
        els.board.classList.toggle('done', g.done);
        els.board.classList.toggle('paused', paused);
        if (paused && !els.resume) {
            els.resume = h('button', 'resume', `${icon('play')}<span>Riprendi</span>`);
            els.resume.type = 'button';
            els.resume.dataset.action = 'pause';
            els.board.appendChild(els.resume);
        } else if (!paused && els.resume) {
            els.resume.remove();
            els.resume = null;
        }

        // pannello
        setSeg(els.modes, mode, (btn, k) => k === mode);
        els.pad.className = `pad ${mode === MODE.Color ? 'colors' : ''} m-${MODE_CLASS[mode]}`;
        const counts = g.digitCounts();
        const showColor = mode === MODE.Color;
        padKeys.forEach((key, k) => {
            const d = k + 1;
            if (padShowsColor !== showColor)
                key.innerHTML = showColor
                    ? `<span class="swatch" style="background:var(--c${d})"></span>`
                    : `<span class="num">${d}</span><small class="left"></small>`;
            key.classList.toggle('full', mode === MODE.Digit && counts[d] >= 9);
            key.classList.toggle('armed', armed === d);
            if (!showColor) {
                // quante copie di questa cifra mancano ancora sulla griglia
                const left = key.querySelector('.left'), text = String(Math.max(0, 9 - counts[d]));
                if (left.textContent !== text) left.textContent = text;
            }
        });
        padShowsColor = showColor;

        els.undo.disabled = !g.canUndo;
        els.redo.disabled = !g.canRedo;
        els.pencil.classList.toggle('on', mode === MODE.Corner);
        els.pencil.setAttribute('aria-pressed', mode === MODE.Corner);
        els.gameButtons.forEach(b => { b.disabled = g.done; });
    }

    function renderTimer() {
        if (!settings.showTimer) return;
        const html = `${icon(paused ? 'play' : 'pause')}<span>${time(game.seconds)}</span>`;
        if (els.timer.innerHTML !== html) els.timer.innerHTML = html;
    }

    // ---------- finestre ----------

    function setDialog(kind) {
        dialog = kind;
        for (const old of els.app.querySelectorAll('.backdrop')) {
            if (kind !== 'none') old.remove();
            else if (!old.classList.contains('out')) {
                // chiusura animata, simmetrica all'apertura
                old.classList.add('out');
                setTimeout(() => old.remove(), 200);
            }
        }
        if (kind === 'none') return;

        const backdrop = h('div', 'backdrop');
        const sheet = h('div', 'sheet' + (kind === 'library' ? ' wide' : ''));
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        backdrop.appendChild(sheet);
        backdrop.addEventListener('click', e => { if (e.target === backdrop && kind !== 'import') setDialog('none'); });
        sheet.addEventListener('change', onSettingChange);
        sheet.addEventListener('input', e => {
            if (draft && e.target.classList.contains('imp-name')) draft.title = e.target.value;
            if (e.target.classList.contains('ch-name')) {
                settings.name = e.target.value;
                saveSettings();
                sheet.querySelector('.ch-link').value = challengeLink();
            }
        });

        const closeBtn = `<button type="button" class="icon-btn" data-action="close" aria-label="Chiudi">${icon('close')}</button>`;
        const g = game;

        if (kind === 'settings') {
            const opt = (key, title, text) => `
                <label class="opt">
                    <span><b>${title}</b><small>${text}</small></span>
                    <input type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''} />
                </label>`;
            sheet.innerHTML = `
                <div class="sheet-head"><h2>Impostazioni</h2>${closeBtn}</div>
                <div class="source">
                    <span><b>Fonte dei puzzle</b><small>Da dove arrivano i nuovi puzzle.</small></span>
                    <div class="seg" style="--n:3;--idx:${Math.max(0, SOURCES.indexOf(settings.source))}">
                        ${SOURCES.map((s, k) => `<button type="button" class="${s === settings.source ? 'on' : ''}" data-source="${s}">${SOURCE_NAMES[k]}</button>`).join('')}
                    </div>
                </div>
                <div class="options">
                    ${opt('showConflicts', 'Segnala i conflitti', 'Evidenzia le cifre ripetute in riga, colonna o riquadro.')}
                    ${opt('showWrong', 'Segnala le cifre errate', 'Confronta subito ogni cifra con la soluzione.')}
                    ${opt('highlightSame', 'Evidenzia le cifre uguali', 'Mette in risalto la cifra della casella selezionata.')}
                    ${opt('highlightPeers', 'Evidenzia riga, colonna e riquadro', 'Ombreggia le caselle viste da quella selezionata.')}
                    ${opt('autoClean', 'Pulizia automatica delle note', 'Scrivendo una cifra, la toglie dalle note delle caselle collegate.')}
                    ${opt('showTimer', 'Mostra il cronometro', 'Il tempo viene comunque registrato nella cronologia.')}
                </div>
                <div class="keys">
                    <b>Tastiera</b>
                    <span><kbd>1</kbd>–<kbd>9</kbd> cifra · <kbd>Shift</kbd> matita · <kbd>Ctrl</kbd> centro</span>
                    <span><kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> <kbd>V</kbd> o <kbd>Spazio</kbd> cambiano modalità</span>
                    <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> annulla · <kbd>Ctrl</kbd>+<kbd>Y</kbd> ripete · <kbd>Canc</kbd> cancella</span>
                    <span>Trascina o usa <kbd>Ctrl</kbd>+clic per selezionare più caselle</span>
                </div>
                <p class="version">Versione ${APP_VERSION}</p>`;
        } else if (kind === 'library') {
            sheet.innerHTML = `
                <div class="sheet-head">
                    <div class="seg tabs" style="--n:2;--idx:0">
                        <button type="button" data-tab="0">Raccolta</button>
                        <button type="button" data-tab="1">Cronologia</button>
                    </div>
                    ${closeBtn}
                </div>
                <div class="scroll"></div>`;
            renderLibrary(sheet);
        } else if (kind === 'done') {
            sheet.innerHTML = `
                <div class="done-card">
                    <div class="tick">${icon('check')}</div>
                    <h2>Risolto</h2>
                    <p>${esc(g.puzzle.title)}, ${byline(g.puzzle)}</p>
                    <div class="stats">
                        <div><b>${time(g.seconds)}</b><small>tempo</small></div>
                        <div><b>${g.hints}</b><small>${g.hints === 1 ? 'aiuto' : 'aiuti'}</small></div>
                        <div><b>${levelName(g.puzzle.difficulty)}</b><small>livello</small></div>
                    </div>
                    ${challengeResult()}
                    <div class="pills">
                        <button type="button" class="like big ${isLiked(g.puzzle) ? 'on' : ''}" data-action="like" aria-pressed="${isLiked(g.puzzle)}">${icon('heart')}<span>Mi piace</span></button>
                        <button type="button" class="pill" data-action="challenge">${icon('share')}<span>${challenges[g.puzzle.id] ? 'Rispondi' : 'Sfida'}</span></button>
                    </div>
                    <div class="buttons">
                        <button type="button" class="ghost" data-action="history">Cronologia</button>
                        <button type="button" class="primary" data-action="random">Nuovo puzzle</button>
                    </div>
                </div>`;
        } else if (kind === 'aids') {
            const aid = (action, name, title, text) => `
                <button type="button" class="row aid" data-action="${action}">
                    ${icon(name)}
                    <span class="row-main"><b>${title}</b><small>${text}</small></span>
                </button>`;
            sheet.innerHTML = `
                <div class="sheet-head"><h2>Aiuti</h2>${closeBtn}</div>
                <div class="rows">
                    ${aid('hint', 'target', 'Suggerimento', 'Dice quale tecnica cercare e dove; la cifra solo se la chiedi.')}
                    ${aid('verify', 'check', 'Trova gli errori', 'Segnala le cifre diverse dalla soluzione.')}
                    ${aid('autonotes', 'notes', 'Note automatiche', 'Scrive a matita tutte le cifre possibili.')}
                    ${aid('clearnotes', 'erase', 'Azzera le note', 'Cancella tutte le note a matita e al centro.')}
                </div>`;
        } else if (kind === 'challenge') {
            sheet.innerHTML = `
                <div class="sheet-head"><h2>Sfida un amico</h2>${closeBtn}</div>
                <p class="lead">${g.done
                    ? `Mandi «${esc(g.puzzle.title)}» con il tuo tempo, ${time(g.seconds)}: chi apre il link deve batterlo.`
                    : `Mandi «${esc(g.puzzle.title)}» senza un tempo da battere, perché non l'hai ancora finito. A puzzle risolto potrai mandare il tuo risultato.`}</p>
                <input class="field ch-name" type="text" maxlength="30" placeholder="Il tuo nome" value="${esc(settings.name)}" aria-label="Il tuo nome" />
                <input class="field ch-link" type="text" readonly value="${esc(challengeLink())}" aria-label="Link della sfida" />
                <div class="buttons">
                    <button type="button" class="ghost" data-action="ch-copy">Copia il link</button>
                    <button type="button" class="primary" data-action="ch-share">Condividi</button>
                </div>`;
        } else if (kind === 'incoming') {
            const ch = challenges[g.puzzle.id] || { from: 'Un amico', seconds: null, hints: 0 };
            const target = ch.seconds == null
                ? 'Non ha ancora un tempo: vince chi lo finisce prima.'
                : `Tempo da battere: <b>${time(ch.seconds)}</b>${ch.hints ? ` (con ${ch.hints} ${ch.hints === 1 ? 'aiuto' : 'aiuti'})` : ''}.`;
            const started = g.done ? `<p>L'hai già risolto in ${time(g.seconds)}.</p>` : g.hasProgress ? '<p>L\'avevi già iniziato: puoi continuare o ripartire da zero.</p>' : '';
            sheet.innerHTML = `
                <div class="done-card">
                    <div class="tick">${icon('share')}</div>
                    <h2>Sfida di ${esc(ch.from)}</h2>
                    <p>«${esc(g.puzzle.title)}» · ${levelName(g.puzzle.difficulty).toLowerCase()}<br>${target}</p>
                    ${started}
                    <div class="buttons">
                        ${g.done ? '<button type="button" class="ghost" data-action="close">Chiudi</button><button type="button" class="primary" data-action="challenge">Rispondi</button>'
                        : g.hasProgress ? '<button type="button" class="ghost" data-action="ch-restart">Da zero</button><button type="button" class="primary" data-action="close">Continua</button>'
                        : '<button type="button" class="primary" data-action="close">Inizia</button>'}
                    </div>
                </div>`;
        } else if (kind === 'ideas') {
            sheet.innerHTML = `<div class="sheet-head"><h2>Idee del puzzle</h2>${closeBtn}</div><div class="ideas-body"></div>`;
            renderIdeas(sheet, false);
        } else if (kind === 'import') {
            renderImport(sheet);
        } else if (kind === 'delete') {
            const p = library.find(pendingDelete);
            sheet.innerHTML = `
                <div class="done-card">
                    <h2>Eliminare?</h2>
                    <p>«${esc(p ? p.title : '')}» verrà tolto dalla raccolta insieme ai suoi progressi.</p>
                    <div class="buttons">
                        <button type="button" class="ghost" data-action="library">Annulla</button>
                        <button type="button" class="primary" data-action="delete">Elimina</button>
                    </div>
                </div>`;
        } else if (kind === 'restart') {
            sheet.innerHTML = `
                <div class="done-card">
                    <h2>Ricominciare?</h2>
                    <p>Cifre, note e colori di questo puzzle verranno cancellati e il cronometro azzerato.</p>
                    <div class="buttons">
                        <button type="button" class="ghost" data-action="close">Annulla</button>
                        <button type="button" class="primary" data-action="restart">Ricomincia</button>
                    </div>
                </div>`;
        }

        els.app.appendChild(backdrop);
    }

    function renderLibrary(sheet) {
        const g = game;
        setSeg(sheet.querySelector('.tabs'), showHistory ? 1 : 0, (btn, k) => k === (showHistory ? 1 : 0));
        const scroll = sheet.querySelector('.scroll');
        let html = '';

        if (!showHistory) {
            html += `
                <div class="quick">
                    <button type="button" class="ghost" data-action="random">${icon('shuffle')}Casuale</button>
                    <button type="button" class="ghost" data-action="ask-restart">${icon('restart')}Ricomincia</button>
                    <button type="button" class="ghost" data-action="import">${icon('image')}Importa</button>
                </div>`;
            for (const [name, mine] of [['Importati', library.imported()], ['Generati', library.generated().reverse()]]) {
                if (!mine.length) continue;
                html += `<h3>${name}</h3><div class="rows">`;
                for (const p of mine) {
                    html += `
                        <div class="row-wrap">
                            <button type="button" class="row ${p.id === g.puzzle.id ? 'current' : ''}" data-open="${esc(p.id)}">
                                <span class="row-main">
                                    <b>${esc(p.title)}${isLiked(p) ? icon('heart') : ''}</b>
                                    <small>${levelName(p.difficulty)} · ${p.clueCount} numeri</small>
                                </span>
                                <span class="row-side ${isDone(p) ? 'ok' : ''}">${status(p)}</span>
                            </button>
                            <button type="button" class="icon-btn" data-del="${esc(p.id)}" aria-label="Elimina">${icon('trash')}</button>
                        </div>`;
                }
                html += '</div>';
            }
            for (const level of library.levels) {
                const inLevel = library.byLevel(level);
                html += `<h3>${levelName(level)} <span>${inLevel.filter(isDone).length}/${inLevel.length}</span></h3><div class="rows">`;
                for (const p of library.byLevel(level)) {
                    html += `
                        <button type="button" class="row ${p.id === g.puzzle.id ? 'current' : ''}" data-open="${esc(p.id)}">
                            <span class="row-main">
                                <b>${esc(p.title)}${isLiked(p) ? icon('heart') : ''}</b>
                                <small>${esc(p.author)} · ${p.clueCount} numeri${p.source ? ' · ' + esc(p.source) : ''}</small>
                            </span>
                            <span class="row-side ${isDone(p) ? 'ok' : ''}">${status(p)}</span>
                        </button>`;
                }
                html += '</div>';
            }
        } else if (history.length === 0) {
            html = '<p class="hollow">Qui compariranno i puzzle che risolvi, con data e tempo impiegato.</p>';
        } else {
            const line = (name, list) => {
                const secs = list.map(e => e.seconds | 0);
                const avg = Math.trunc(secs.reduce((x, y) => x + y, 0) / secs.length);
                return `<b>${name}</b><span>${secs.length}</span><span>${time(avg)}</span><span>${time(Math.min(...secs))}</span>`;
            };
            html += `
                <div class="lvl-stats">
                    <small></small><small>risolti</small><small>tempo medio</small><small>migliore</small>
                    ${LEVELS.map(l => [l, history.filter(e => e.level === l)]).filter(x => x[1].length).map(x => line(levelName(x[0]), x[1])).join('')}
                    ${line('Totale', history)}
                </div>
                <div class="rows">`;
            for (const e of history.slice().reverse()) {
                const p = library.find(e.id);
                html += `
                    <button type="button" class="row" ${p ? `data-open="${esc(p.id)}"` : 'disabled'}>
                        <span class="row-main">
                            <b>${esc(e.title)}${likes[e.id] ? icon('heart') : ''}</b>
                            <small>${[esc(e.author), levelName(e.level)].filter(Boolean).join(' · ')}</small>
                            <small>${formatDate(e.date)}</small>
                        </span>
                        <span class="row-side ok">
                            ${time(e.seconds | 0)}
                            ${e.hints > 0 ? `<small>${e.hints} ${e.hints === 1 ? 'aiuto' : 'aiuti'}</small>` : ''}
                        </span>
                    </button>`;
            }
            html += '</div>';
        }
        scroll.innerHTML = html;
        scroll.scrollTop = 0;
    }

    // ---------- idee del puzzle ----------

    function ideasFor(p) {
        if (!ideasCache.has(p.id)) ideasCache.set(p.id, Logic.ideas(p.grid, p.idea));
        return ideasCache.get(p.id);
    }

    function renderIdeas(sheet, fresh) {
        const levels = ideasFor(game.puzzle), n = Math.min(game.ideas, levels.length);
        let html = '<p class="lead">Osservazioni sul puzzle, dalla più vaga alla più precisa. Non dicono mai quale cifra scrivere.</p><div class="scroll">';
        levels.slice(0, n).forEach((lv, k) => {
            html += `<section class="idea ${fresh && k === n - 1 ? 'new' : ''}"><h3>${k + 1} · ${esc(lv.title)}</h3><ul>${lv.text.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>`;
        });
        html += '</div>';
        if (n < levels.length)
            html += `<button type="button" class="primary next" data-action="idea-next">${n === 0 ? 'Mostra la prima' : 'Mostra la successiva'} · ${esc(levels[n].title)}</button>`;
        const body = sheet.querySelector('.ideas-body');
        body.innerHTML = html;
        const scroll = body.querySelector('.scroll');
        scroll.scrollTop = scroll.scrollHeight;
    }

    function nextIdea() {
        if (game.ideas >= 3) return;
        game.ideas++;
        active = true;
        save();
        renderIdeas(els.app.querySelector('.backdrop:not(.out) .sheet'), true);
    }

    // ---------- importazione da screenshot ----------

    async function onFile(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        showToast('Leggo la griglia…');
        try {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.src = url;
            await img.decode();
            const r = window.SudokuOCR.read(img);
            URL.revokeObjectURL(url);
            draft = {
                grid: r.grid, doubt: new Set(r.doubt), crop: r.crop, found: r.found, sel: -1, compare: false,
                title: 'Importato ' + new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }),
            };
            const toast = els.app.querySelector('.toast');
            if (toast) toast.remove();
            setDialog('import');
        } catch (err) {
            console.warn(err);
            showToast('Non riesco a leggere questa immagine.');
        }
    }

    /** Stato della bozza: conflitti, unicità della soluzione, livello calcolato. */
    function checkDraft(grid) {
        const bad = new Set();
        for (const unit of UNITS) {
            const first = new Array(10).fill(-1);
            for (const i of unit) {
                const v = grid[i];
                if (!v) continue;
                if (first[v] < 0) first[v] = i; else { bad.add(i); bad.add(first[v]); }
            }
        }
        const n = grid.filter(Boolean).length;
        if (bad.size) return { bad, ok: false, text: 'Ci sono cifre ripetute: correggi quelle in rosso.' };
        if (n < 17) return { bad, ok: false, text: `${n} cifre: ne servono almeno 17.` };
        const count = countSolutions(grid, 2).count;
        if (count === 0) return { bad, ok: false, text: 'Così non ha soluzione: qualche cifra è sbagliata.' };
        if (count > 1) return { bad, ok: false, text: 'Così ha più soluzioni: manca qualche cifra.' };
        const level = Logic.grade(grid).level;
        return { bad, ok: true, level, text: `${n} cifre · soluzione unica · livello ${levelName(level).toLowerCase()}` };
    }

    function renderImport(sheet) {
        const d = draft;
        if (!sheet || !d) return;
        const check = checkDraft(d.grid);
        const cellsHtml = d.grid.map((v, i) =>
            `<button type="button" class="mc${i === d.sel ? ' sel' : ''}${check.bad.has(i) ? ' bad' : ''}${d.doubt.has(i) ? ' doubt' : ''}" data-imp="${i}">${v || ''}</button>`).join('');
        sheet.innerHTML = `
            <div class="sheet-head"><h2>Importa puzzle</h2><button type="button" class="icon-btn" data-action="close" aria-label="Chiudi">${icon('close')}</button></div>
            <p class="lead">${d.found ? 'Controlla le cifre lette: tocca una casella per correggerla.' : 'Non ho trovato una griglia nell\'immagine: puoi scrivere le cifre a mano.'}</p>
            <div class="mini${d.compare ? ' compare' : ''}"${d.compare ? ` style="background-image:url(${d.crop})"` : ''}>${cellsHtml}</div>
            <div class="imp-pad">
                ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-impdigit="${n}">${n}</button>`).join('')}
                <button type="button" data-impdigit="0" aria-label="Cancella">${icon('erase')}</button>
            </div>
            <p class="imp-status ${check.ok ? 'ok' : ''}">${check.text}</p>
            <input class="imp-name" type="text" maxlength="60" value="${esc(d.title)}" aria-label="Titolo" />
            <div class="buttons">
                <button type="button" class="ghost" data-action="imp-compare">${d.compare ? 'Vedi le cifre' : 'Vedi lo screenshot'}</button>
                <button type="button" class="primary" data-action="imp-save" ${check.ok ? '' : 'disabled'}>Aggiungi</button>
            </div>`;
    }

    const importSheet = () => els.app.querySelector('.backdrop:not(.out) .sheet');

    function importDigit(n) {
        if (!draft || draft.sel < 0) return;
        draft.grid[draft.sel] = n;
        draft.doubt.delete(draft.sel);
        draft.compare = false;
        renderImport(importSheet());
    }

    function saveImport() {
        const d = draft;
        if (!d || !checkDraft(d.grid).ok) return;
        const givens = d.grid.join('');
        draft = null;
        const twin = library.puzzles.find(p => p.grid.join('') === givens);
        if (twin) {
            openPuzzle(twin);
            showToast('Questo puzzle è già nella raccolta.');
            return;
        }
        const level = Logic.grade(d.grid).level;
        const id = 'imp-' + hashId(givens).slice(1);
        imported.push({
            id, title: d.title.trim() || 'Importato', author: '', difficulty: level, givens,
            imported: true, date: new Date().toISOString(),
        });
        storage.save(IMPORTED_KEY, imported);
        rebuildLibrary();
        openPuzzle(library.find(id));
        showToast(`Aggiunto agli importati · livello ${levelName(level).toLowerCase()}`);
    }

    function deleteImported() {
        const id = pendingDelete;
        pendingDelete = null;
        imported = imported.filter(p => p.id !== id);
        storage.save(IMPORTED_KEY, imported);
        storage.remove(gameKey(id));
        delete progress[id];
        storage.save(PROGRESS_KEY, progress);
        const wasCurrent = game.puzzle.id === id;
        if (wasCurrent) game = null; // niente salvataggio per il puzzle appena eliminato
        rebuildLibrary();
        if (wasCurrent) openPuzzle(pickForLevel(library.levels.includes(settings.level) ? settings.level : library.levels[0]), false);
        openLibrary(false);
    }

    function openLibrary(historyTab) {
        showHistory = historyTab;
        setDialog('library');
    }

    function onSettingChange(e) {
        const key = e.target.dataset && e.target.dataset.setting;
        if (!key) return;
        settings[key] = e.target.checked;
        saveSettings();
        render();
    }

    // =====================================================================
    // Eventi
    // =====================================================================

    function onClick(e) {
        if (!game) return;
        const t = e.target.closest('button');
        if (!t || t.disabled) return;
        const ds = t.dataset;

        if (ds.level) return setLevel(ds.level);
        if (ds.mode) return setMode(+ds.mode);
        if (ds.digit) return press(+ds.digit);
        if (ds.tab) {
            showHistory = ds.tab === '1';
            return renderLibrary(t.closest('.sheet'));
        }
        if (ds.open) {
            const p = library.find(ds.open);
            if (p) openPuzzle(p);
            return;
        }
        if (ds.del) { pendingDelete = ds.del; return setDialog('delete'); }
        if (ds.source) {
            settings.source = ds.source;
            saveSettings();
            return setSeg(t.parentElement, SOURCES.indexOf(ds.source), btn => btn.dataset.source === ds.source);
        }
        if (ds.imp) {
            draft.sel = draft.sel === +ds.imp ? -1 : +ds.imp;
            draft.compare = false;
            return renderImport(importSheet());
        }
        if (ds.impdigit) return importDigit(+ds.impdigit);

        switch (ds.action) {
            case 'pause': return togglePause();
            case 'library': return openLibrary(false);
            case 'history': return openLibrary(true);
            case 'theme': return toggleTheme();
            case 'settings': return setDialog('settings');
            case 'close': draft = null; return setDialog('none');
            case 'erase': return afterAction(game.erase());
            case 'undo': return afterAction(game.undo());
            case 'redo': return afterAction(game.redo());
            case 'pencil': return setMode(mode === MODE.Corner ? MODE.Digit : MODE.Corner);
            case 'ideas': return setDialog('ideas');
            case 'idea-next': return nextIdea();
            case 'like': return toggleLike();
            case 'import': return els.file.click();
            case 'imp-compare': draft.compare = !draft.compare; return renderImport(importSheet());
            case 'imp-save': return saveImport();
            case 'delete': return deleteImported();
            case 'aids': return setDialog('aids');
            case 'hint': setDialog('none'); return hint();
            case 'hint-close': return hideHint();
            case 'update': save(); return location.reload();
            case 'update-later': { const bar = els.app.querySelector('.updatebar'); if (bar) bar.remove(); return; }
            case 'autonotes': setDialog('none'); return afterAction(game.autoNotes());
            case 'verify': setDialog('none'); return verify();
            case 'clearnotes': setDialog('none'); return afterAction(game.clearNotes());
            case 'challenge': return setDialog('challenge');
            case 'ch-share': return shareChallenge(true);
            case 'ch-copy': return shareChallenge(false);
            case 'ch-restart': restart(); return;
            case 'ask-restart': return setDialog('restart');
            case 'restart': return restart();
            case 'random': return randomPuzzle();
        }
    }

    // ---------- tastiera ----------

    const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const EDIT_KEYS = ['Backspace', 'Delete', 'Escape'];
    const MODE_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV'];

    function onKeyDown(e) {
        if (!game || e.altKey) return;
        const tg = e.target;
        const tag = tg && tg.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            if (e.code === 'Escape' && dialog !== 'none') setDialog('none');
            return;
        }

        const ctrl = e.ctrlKey || e.metaKey;
        const code = e.code;
        let handled;
        if (/^(Digit|Numpad)[1-9]$/.test(code)) handled = true;
        else if (MOVE_KEYS.includes(code) || EDIT_KEYS.includes(code)) handled = true;
        else if (code === 'Space') handled = tag !== 'BUTTON' && tag !== 'A';
        else if (ctrl) handled = code === 'KeyZ' || code === 'KeyY' || code === 'KeyA';
        else handled = MODE_KEYS.includes(code);
        if (!handled) return;
        e.preventDefault();
        onKey(code, e.shiftKey, ctrl);
    }

    function onKey(code, shift, ctrl) {
        if (dialog === 'import' && draft) {
            if (code.startsWith('Digit') || code.startsWith('Numpad')) return importDigit(+code[code.length - 1]);
            if (code === 'Backspace' || code === 'Delete') return importDigit(0);
            const step = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[code];
            if (step) {
                draft.sel = draft.sel < 0 ? 0 : (draft.sel + step + 81) % 81;
                return renderImport(importSheet());
            }
        }
        if (dialog !== 'none') {
            if (code === 'Escape') { draft = null; setDialog('none'); }
            return;
        }
        if (paused) {
            if (code === 'Space' || code === 'Escape') { paused = false; render(); }
            return;
        }

        const g = game;
        let changed = false;
        if (code.startsWith('Digit') || code.startsWith('Numpad')) {
            const d = +code[code.length - 1];
            const target = ctrl ? MODE.Center : shift ? MODE.Corner : mode;
            if (g.selectedCount === 0) armed = armed === d ? 0 : d;
            else changed = g.enter(d, target, settings.autoClean);
        } else {
            switch (code) {
                case 'ArrowUp': g.move(-1, 0, shift || ctrl); break;
                case 'ArrowDown': g.move(1, 0, shift || ctrl); break;
                case 'ArrowLeft': g.move(0, -1, shift || ctrl); break;
                case 'ArrowRight': g.move(0, 1, shift || ctrl); break;
                case 'Backspace': case 'Delete': changed = g.erase(); break;
                case 'Escape': g.clearSelection(); armed = 0; break;
                case 'Space': mode = (mode + 1) % 4; break;
                case 'KeyZ': if (ctrl) changed = shift ? g.redo() : g.undo(); else mode = MODE.Digit; break;
                case 'KeyY': if (ctrl) changed = g.redo(); break;
                case 'KeyA': if (ctrl) g.selectAll(); break;
                case 'KeyX': mode = MODE.Corner; break;
                case 'KeyC': mode = MODE.Center; break;
                case 'KeyV': mode = MODE.Color; break;
            }
        }
        afterAction(changed);
    }

    // ---------- puntatore (mouse e tocco) ----------

    let dragging = false;
    let lastCell = -1;

    function cellAt(x, y) {
        const el = document.elementFromPoint(x, y);
        const cell = el && el.closest('[data-i]');
        return cell ? +cell.dataset.i : -1;
    }

    /** kind: 0 = pressione, 1 = trascinamento su una nuova casella. */
    function onPointer(i, kind, additive) {
        const g = game;
        if (!g || paused || dialog !== 'none' || i < 0 || i > 80) return;
        active = true;

        if (armed !== 0) {
            // cifra-prima: il tocco scrive la cifra armata, senza lasciare selezione
            if (kind !== 0) return;
            g.selectOnly(i);
            const changed = g.enter(armed, mode, settings.autoClean);
            g.clearSelection();
            afterAction(changed);
            return;
        }

        if (kind === 1) {
            g.setSelected(i, dragAdd);
        } else if (additive) {
            dragAdd = !g.selected[i];
            g.setSelected(i, dragAdd);
        } else {
            dragAdd = true;
            if (g.selectedCount === 1 && g.selected[i]) g.clearSelection();
            else g.selectOnly(i);
        }
        render();
    }

    function onPointerDown(e) {
        if (!game || e.button) return;
        const target = e.target;
        if (target.closest && target.closest('.board') && !target.closest('.resume')) {
            const i = cellAt(e.clientX, e.clientY);
            if (i < 0) return;
            e.preventDefault();
            dragging = true;
            lastCell = i;
            onPointer(i, 0, e.ctrlKey || e.metaKey || e.shiftKey);
        } else if (target.matches && target.matches('.app, .stage, .play, body, html')) {
            if (dialog !== 'none' || (game.selectedCount === 0 && armed === 0)) return;
            game.clearSelection();
            armed = 0;
            render();
        }
    }

    function onPointerMove(e) {
        if (!dragging) return;
        const i = cellAt(e.clientX, e.clientY);
        if (i < 0 || i === lastCell) return;
        lastCell = i;
        onPointer(i, 1, false);
    }

    function onPointerUp() { dragging = false; }

    /** Ogni pulsante risponde al tocco con la stessa breve animazione. */
    function onTap(e) {
        const b = e.target.closest && e.target.closest('button');
        if (!b || b.disabled) return;
        b.classList.remove('tap');
        void b.offsetWidth; // fa ripartire l'animazione anche su tocchi ravvicinati
        b.classList.add('tap');
    }

    function onVisibility() {
        if (!document.hidden || !game || game.done || paused || !active) return;
        paused = true;
        save();
        render();
    }

    // =====================================================================
    // Avvio
    // =====================================================================

    function start() {
        if (library.puzzles.length === 0) {
            els.app.innerHTML = `
                <div class="empty">
                    <h1>Sudoku</h1>
                    <p>La raccolta è vuota. Aggiungi dei puzzle al file <code>puzzles.js</code> e ricarica la pagina.</p>
                </div>`;
            return;
        }

        buildShell();

        let puzzle = library.find(storage.loadRaw(CURRENT_KEY));
        if (!puzzle) {
            if (!library.levels.includes(settings.level)) settings.level = library.levels[0];
            puzzle = pickForLevel(settings.level);
        }
        const challenged = readChallenge();
        openPuzzle(challenged || puzzle, false);
        if (challenged) setDialog('incoming');
        else if (challenged === false) showToast('Il puzzle di questa sfida non è leggibile.');

        // un link di sfida aperto mentre l'app è già in uso
        window.addEventListener('hashchange', () => {
            const p = readChallenge();
            if (p) { openPuzzle(p); setDialog('incoming'); }
            else if (p === false) showToast('Il puzzle di questa sfida non è leggibile.');
        });

        // il service worker avvisa quando sul server ci sono file più recenti
        if ('serviceWorker' in navigator) {
            let timer = 0;
            navigator.serviceWorker.addEventListener('message', e => {
                if (!e.data || e.data.type !== 'updated') return;
                clearTimeout(timer);
                // i file arrivano uno alla volta: si aspetta che abbiano finito
                timer = setTimeout(() => {
                    if (els.app.querySelector('.updatebar')) return;
                    const bar = h('div', 'hintbar updatebar',
                        '<p>È pronta una versione aggiornata dell\'app.</p><div class="hint-actions">' +
                        '<button type="button" class="primary" data-action="update">Aggiorna</button>' +
                        '<button type="button" class="ghost" data-action="update-later">Dopo</button></div>');
                    els.app.appendChild(bar);
                }, 1800);
            });
        }

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('pointerdown', onTap, true);
        document.addEventListener('animationend', e => { if (e.animationName === 'tap') e.target.classList.remove('tap'); }, true);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', save);

        setInterval(() => {
            if (!game || !active || paused || game.done || dialog !== 'none') return;
            game.seconds++;
            if (game.seconds % 15 === 0) save();
            renderTimer();
        }, 1000);
    }

    start();
})();
