// Sudoku — risolutore "umano": risolve per tecniche, misura la difficoltà
// e ricava le idee del puzzle (osservazioni sui pattern, non mosse).
// Usato dall'app (window.SudokuLogic) e dagli script di raccolta (node).
'use strict';

(function (root) {

    const ALL = 0x3FE;
    const ROW = i => (i / 9) | 0;
    const COL = i => i % 9;
    const BOX = i => ((i / 27) | 0) * 3 + ((i % 9 / 3) | 0);

    /** 27 unità: 0-8 righe, 9-17 colonne, 18-26 riquadri. */
    const UNITS = [];
    for (let u = 0; u < 9; u++) {
        const r = [], c = [], b = [];
        for (let k = 0; k < 9; k++) {
            r.push(u * 9 + k);
            c.push(k * 9 + u);
            b.push(((u / 3 | 0) * 3 + (k / 3 | 0)) * 9 + u % 3 * 3 + k % 3);
        }
        UNITS[u] = r; UNITS[9 + u] = c; UNITS[18 + u] = b;
    }
    const sees = (a, b) => a !== b && (ROW(a) === ROW(b) || COL(a) === COL(b) || BOX(a) === BOX(b));
    const PEERS = [];
    for (let i = 0; i < 81; i++) {
        PEERS.push([]);
        for (let j = 0; j < 81; j++) if (sees(i, j)) PEERS[i].push(j);
    }

    const count = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
    const digitsOf = m => { const o = []; for (let d = 1; d <= 9; d++) if (m & (1 << d)) o.push(d); return o; };
    const lowest = m => { for (let d = 1; d <= 9; d++) if (m & (1 << d)) return d; return 0; };

    function combos(list, n, visit) {
        const pick = [];
        (function rec(start) {
            if (pick.length === n) return visit(pick);
            for (let k = start; k <= list.length - (n - pick.length); k++) {
                pick.push(list[k]);
                if (rec(k + 1)) { pick.pop(); return true; }
                pick.pop();
            }
            return false;
        })(0);
    }

    // ------------------------------------------------------------------
    // Soluzione per forza bruta (serve come riferimento)
    // ------------------------------------------------------------------

    function bruteForce(givens, limit) {
        const g = givens.slice();
        const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
        for (let i = 0; i < 81; i++) {
            if (!g[i]) continue;
            const bit = 1 << g[i];
            if ((rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & bit) return { count: 0, solution: null };
            rows[ROW(i)] |= bit; cols[COL(i)] |= bit; boxes[BOX(i)] |= bit;
        }
        let n = 0, solution = null;
        (function search() {
            let best = -1, bestMask = 0, bestN = 10;
            for (let i = 0; i < 81; i++) {
                if (g[i]) continue;
                const m = ALL & ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]);
                const k = count(m);
                if (k < bestN) { best = i; bestMask = m; bestN = k; if (k <= 1) break; }
            }
            if (best < 0) { if (!solution) solution = g.slice(); n++; return; }
            const r = ROW(best), c = COL(best), b = BOX(best);
            for (let d = 1; d <= 9 && n < limit; d++) {
                const bit = 1 << d;
                if (!(bestMask & bit)) continue;
                g[best] = d; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
                search();
                rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit; g[best] = 0;
            }
        })();
        return { count: n, solution };
    }

    // ------------------------------------------------------------------
    // Tecniche
    // ------------------------------------------------------------------

    /** tier: 0 singoli evidenti · 1 singoli nudi · 2 candidati bloccati · 3 coppie/terne · 4 schemi · 5 schemi rari · 6 ipotesi */
    const TECH = {
        full:    { tier: 0, cost: 1 },
        hiddenB: { tier: 0, cost: 1 },
        hiddenL: { tier: 0, cost: 1.5 },
        naked:   { tier: 1, cost: 2.5 },
        point:   { tier: 2, cost: 6 },
        claim:   { tier: 2, cost: 8 },
        nPair:   { tier: 3, cost: 10 },
        hPair:   { tier: 3, cost: 14 },
        nTriple: { tier: 3, cost: 16 },
        hTriple: { tier: 3, cost: 22 },
        xwing:   { tier: 4, cost: 30 },
        turbot:  { tier: 4, cost: 32 },
        xywing:  { tier: 4, cost: 34 },
        rect:    { tier: 4, cost: 30 },
        nQuad:   { tier: 4, cost: 30 },
        hQuad:   { tier: 4, cost: 40 },
        sword:   { tier: 5, cost: 46 },
        xyzwing: { tier: 5, cost: 44 },
        wwing:   { tier: 5, cost: 44 },
        jelly:   { tier: 5, cost: 60 },
        trial:   { tier: 6, cost: 90 },
    };

    function makeState(givens) {
        const v = givens.slice(), c = new Array(81).fill(0);
        for (let i = 0; i < 81; i++) {
            if (v[i]) continue;
            let used = 0;
            for (const p of PEERS[i]) used |= 1 << v[p];
            c[i] = ALL & ~used;
        }
        return { v, c };
    }

    function place(s, i, d) {
        s.v[i] = d; s.c[i] = 0;
        const bit = 1 << d;
        for (const p of PEERS[i]) s.c[p] &= ~bit;
    }

    /** Toglie `mask` dalle caselle indicate; vero se qualcosa è cambiato. */
    function strike(s, cells, mask) {
        let hit = false;
        for (const i of cells) if (s.c[i] & mask) { s.c[i] &= ~mask; hit = true; }
        return hit;
    }

    const positions = (s, u, d) => UNITS[u].filter(i => s.c[i] & (1 << d));

    function fullHouse(s) {
        for (let u = 0; u < 27; u++) {
            const empty = UNITS[u].filter(i => !s.v[i]);
            if (empty.length === 1 && count(s.c[empty[0]]) === 1)
                return { tech: 'full', unit: u, cell: empty[0], digit: lowest(s.c[empty[0]]) };
        }
        return null;
    }

    function hiddenSingle(s, from, to, tech) {
        for (let u = from; u < to; u++)
            for (let d = 1; d <= 9; d++) {
                const pos = positions(s, u, d);
                if (pos.length === 1) return { tech, unit: u, cell: pos[0], digit: d };
            }
        return null;
    }

    function nakedSingle(s) {
        for (let i = 0; i < 81; i++)
            if (!s.v[i] && count(s.c[i]) === 1) return { tech: 'naked', unit: 18 + BOX(i), cell: i, digit: lowest(s.c[i]) };
        return null;
    }

    function locked(s) {
        // puntamento: nel riquadro la cifra sta tutta su una linea
        for (let b = 0; b < 9; b++)
            for (let d = 1; d <= 9; d++) {
                const pos = positions(s, 18 + b, d);
                if (pos.length < 2) continue;
                for (const [f, base] of [[ROW, 0], [COL, 9]]) {
                    if (!pos.every(i => f(i) === f(pos[0]))) continue;
                    const line = base + f(pos[0]);
                    if (strike(s, UNITS[line].filter(i => BOX(i) !== b), 1 << d))
                        return { tech: 'point', unit: 18 + b, unit2: line, digits: [d], cells: pos };
                }
            }
        // rivendicazione: nella linea la cifra sta tutta in un riquadro
        for (let u = 0; u < 18; u++)
            for (let d = 1; d <= 9; d++) {
                const pos = positions(s, u, d);
                if (pos.length < 2 || !pos.every(i => BOX(i) === BOX(pos[0]))) continue;
                const b = BOX(pos[0]);
                if (strike(s, UNITS[18 + b].filter(i => !pos.includes(i)), 1 << d))
                    return { tech: 'claim', unit: u, unit2: 18 + b, digits: [d], cells: pos };
            }
        return null;
    }

    function nakedSubset(s, n, tech) {
        for (let u = 0; u < 27; u++) {
            const empty = UNITS[u].filter(i => !s.v[i]);
            if (empty.length <= n) continue;
            const pool = empty.filter(i => count(s.c[i]) <= n);
            let found = null;
            combos(pool, n, pick => {
                let m = 0;
                for (const i of pick) m |= s.c[i];
                if (count(m) !== n) return false;
                if (!strike(s, empty.filter(i => !pick.includes(i)), m)) return false;
                found = { tech, unit: u, digits: digitsOf(m), cells: pick.slice() };
                return true;
            });
            if (found) return found;
        }
        return null;
    }

    function hiddenSubset(s, n, tech) {
        for (let u = 0; u < 27; u++) {
            const empty = UNITS[u].filter(i => !s.v[i]);
            if (empty.length <= n) continue;
            const ds = [];
            for (let d = 1; d <= 9; d++) {
                const k = positions(s, u, d).length;
                if (k >= 1 && k <= n) ds.push(d);
            }
            let found = null;
            combos(ds, n, pick => {
                let m = 0;
                for (const d of pick) m |= 1 << d;
                const cells = empty.filter(i => s.c[i] & m);
                if (cells.length !== n) return false;
                if (!strike(s, cells, ALL & ~m)) return false;
                found = { tech, unit: u, digits: pick.slice(), cells };
                return true;
            });
            if (found) return found;
        }
        return null;
    }

    function fish(s, n, tech) {
        for (let d = 1; d <= 9; d++)
            for (const [base, cover] of [[0, 9], [9, 0]]) {
                const lines = [];
                for (let u = 0; u < 9; u++) {
                    const pos = positions(s, base + u, d);
                    if (pos.length >= 2 && pos.length <= n) lines.push(u);
                }
                let found = null;
                combos(lines, n, pick => {
                    const across = new Set(), cells = [];
                    for (const u of pick)
                        for (const i of positions(s, base + u, d)) { across.add(base === 0 ? COL(i) : ROW(i)); cells.push(i); }
                    if (across.size !== n) return false;
                    const targets = [];
                    for (const a of across) for (const i of UNITS[cover + a]) if (!cells.includes(i)) targets.push(i);
                    if (!strike(s, targets, 1 << d)) return false;
                    found = { tech, unit: base + pick[0], digits: [d], cells };
                    return true;
                });
                if (found) return found;
            }
        return null;
    }

    /** Catena breve su una cifra: due coppie obbligate collegate (grattacielo, aquilone, ecc.). */
    function turbot(s) {
        for (let d = 1; d <= 9; d++) {
            const links = [];
            for (let u = 0; u < 27; u++) {
                const pos = positions(s, u, d);
                if (pos.length === 2) links.push([pos[0], pos[1], u]);
            }
            for (const [a1, a2, ua] of links)
                for (const [b1, b2, ub] of links) {
                    if (ua >= ub) continue;
                    for (const [a, b] of [[a1, a2], [a2, a1]])
                        for (const [c, e] of [[b1, b2], [b2, b1]]) {
                            if (new Set([a, b, c, e]).size < 4 || !sees(b, c) || sees(a, e)) continue;
                            const targets = PEERS[a].filter(i => i !== b && i !== c && sees(i, e));
                            if (strike(s, targets, 1 << d))
                                return { tech: 'turbot', unit: ua, unit2: ub, digits: [d], cells: [a, b, c, e] };
                        }
                }
        }
        return null;
    }

    function xyWing(s) {
        const bi = [];
        for (let i = 0; i < 81; i++) if (count(s.c[i]) === 2) bi.push(i);
        for (const p of bi)
            for (const a of bi) {
                if (!sees(p, a) || count(s.c[p] & s.c[a]) !== 1) continue;
                for (const b of bi) {
                    if (b <= a || !sees(p, b) || count(s.c[p] & s.c[b]) !== 1) continue;
                    const z = s.c[a] & s.c[b];
                    if (count(z) !== 1 || (z & s.c[p]) || (s.c[a] | s.c[b] | s.c[p]) === s.c[p]) continue;
                    if (count(s.c[a] | s.c[b] | s.c[p]) !== 3) continue;
                    const targets = PEERS[a].filter(i => i !== p && sees(i, b));
                    if (strike(s, targets, z))
                        return { tech: 'xywing', unit: 18 + BOX(p), digits: digitsOf(z), cells: [p, a, b] };
                }
            }
        return null;
    }

    function xyzWing(s) {
        for (let p = 0; p < 81; p++) {
            if (count(s.c[p]) !== 3) continue;
            const wings = PEERS[p].filter(i => count(s.c[i]) === 2 && (s.c[i] & ~s.c[p]) === 0);
            for (const a of wings)
                for (const b of wings) {
                    if (b <= a || s.c[a] === s.c[b]) continue;
                    const z = s.c[a] & s.c[b];
                    if (count(z) !== 1) continue;
                    const targets = PEERS[p].filter(i => sees(i, a) && sees(i, b));
                    if (strike(s, targets, z))
                        return { tech: 'xyzwing', unit: 18 + BOX(p), digits: digitsOf(z), cells: [p, a, b] };
                }
        }
        return null;
    }

    function wWing(s) {
        const bi = [];
        for (let i = 0; i < 81; i++) if (count(s.c[i]) === 2) bi.push(i);
        for (const a of bi)
            for (const b of bi) {
                if (b <= a || s.c[a] !== s.c[b] || sees(a, b)) continue;
                for (const x of digitsOf(s.c[a])) {
                    const y = s.c[a] & ~(1 << x);
                    for (let u = 0; u < 27; u++) {
                        const pos = positions(s, u, x);
                        if (pos.length !== 2 || pos.includes(a) || pos.includes(b)) continue;
                        const ok = (sees(pos[0], a) && sees(pos[1], b)) || (sees(pos[0], b) && sees(pos[1], a));
                        if (!ok) continue;
                        const targets = PEERS[a].filter(i => sees(i, b));
                        if (strike(s, targets, y))
                            return { tech: 'wwing', unit: u, digits: digitsOf(y), cells: [a, b, pos[0], pos[1]] };
                    }
                }
            }
        return null;
    }

    /** Rettangolo di unicità (tipo 1): tre angoli con la stessa coppia, il quarto deve usare altro. */
    function uniqueRect(s) {
        for (let r1 = 0; r1 < 9; r1++)
            for (let r2 = r1 + 1; r2 < 9; r2++)
                for (let c1 = 0; c1 < 9; c1++)
                    for (let c2 = c1 + 1; c2 < 9; c2++) {
                        const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
                        if (new Set(cells.map(BOX)).size !== 2) continue;
                        if (cells.some(i => s.v[i])) continue;
                        const pairCells = cells.filter(i => count(s.c[i]) === 2);
                        if (pairCells.length !== 3) continue;
                        const m = s.c[pairCells[0]];
                        if (!pairCells.every(i => s.c[i] === m)) continue;
                        const odd = cells.find(i => !pairCells.includes(i));
                        if ((s.c[odd] & m) !== m) continue;
                        s.c[odd] &= ~m;
                        return { tech: 'rect', unit: 18 + BOX(odd), digits: digitsOf(m), cells };
                    }
        return null;
    }

    const ORDER = [
        fullHouse,
        s => hiddenSingle(s, 18, 27, 'hiddenB'),
        s => hiddenSingle(s, 0, 18, 'hiddenL'),
        nakedSingle,
        locked,
        s => nakedSubset(s, 2, 'nPair'),
        s => hiddenSubset(s, 2, 'hPair'),
        s => nakedSubset(s, 3, 'nTriple'),
        s => hiddenSubset(s, 3, 'hTriple'),
        s => fish(s, 2, 'xwing'),
        turbot,
        xyWing,
        uniqueRect,
        s => nakedSubset(s, 4, 'nQuad'),
        s => hiddenSubset(s, 4, 'hQuad'),
        s => fish(s, 3, 'sword'),
        xyzWing,
        wWing,
        s => fish(s, 4, 'jelly'),
    ];

    /** Quanti singoli (caselle distinte) sono piazzabili in questo momento. */
    function openMoves(s) {
        const cells = new Set();
        for (let i = 0; i < 81; i++) if (!s.v[i] && count(s.c[i]) === 1) cells.add(i);
        for (let u = 0; u < 27; u++)
            for (let d = 1; d <= 9; d++) {
                const pos = positions(s, u, d);
                if (pos.length === 1) cells.add(pos[0]);
            }
        return cells.size;
    }

    /**
     * Risolve come farebbe una persona, sempre con la tecnica più semplice disponibile.
     * Restituisce il percorso e una misura di difficoltà.
     */
    function analyze(givens) {
        const brute = bruteForce(givens, 2);
        if (brute.count !== 1) return { valid: false, solutions: brute.count };

        const s = makeState(givens);
        const steps = [];
        let placed = 0, guard = 0;
        while (s.v.includes(0) && guard++ < 2000) {
            let step = null;
            for (const find of ORDER) { step = find(s); if (step) break; }
            if (!step) {
                // nessuna tecnica nota: si procede con la cifra della soluzione (ipotesi ragionata)
                let best = -1, bestN = 10;
                for (let i = 0; i < 81; i++) {
                    if (s.v[i]) continue;
                    const n = count(s.c[i]);
                    if (n < bestN) { bestN = n; best = i; }
                }
                step = { tech: 'trial', unit: 18 + BOX(best), cell: best, digit: brute.solution[best] };
            }
            step.tier = TECH[step.tech].tier;
            step.at = placed;
            if (step.cell != null) {
                step.open = openMoves(s);
                place(s, step.cell, step.digit);
                placed++;
            }
            steps.push(step);
        }

        const counts = {};
        let cost = 0, maxTier = 0;
        for (const st of steps) {
            counts[st.tech] = (counts[st.tech] || 0) + 1;
            cost += TECH[st.tech].cost;
            if (st.tier > maxTier) maxTier = st.tier;
        }
        const advanced = steps.filter(st => st.tier >= 2).length;
        const clues = givens.filter(Boolean).length;

        // Singoli: conta quanto è stretta la strada (mosse disponibili), non solo quali singoli servono.
        // Le ultime 15 cifre sono escluse: lì la griglia si chiude comunque da sola.
        const naked = counts.naked || 0;
        const placements = steps.filter(st => st.cell != null);
        const head = placements.slice(0, Math.max(1, placements.length - 15));
        const meanOpen = head.reduce((x, st) => x + st.open, 0) / head.length;
        const narrow = head.filter(st => st.open <= 2).length;

        // livello continuo: 0 facile · 1 medio · 2 difficile · 3 esperto
        let level;
        if (maxTier >= 5) level = 3;
        else if (maxTier === 4) level = 2.6 + Math.min(.4, advanced * .04);
        else if (maxTier === 3) level = 2 + Math.min(.8, advanced * .08);
        else if (maxTier === 2) level = 1.5 + Math.min(.6, advanced * .12);
        else level = Math.min(1.4, .45 * (.25 * (counts.hiddenL || 0) + .5 * naked + .15 * narrow + .12 * Math.max(0, 9 - meanOpen)));
        level = Math.round(level * 100) / 100;

        return {
            valid: true, solution: brute.solution, steps, counts, cost: Math.round(cost),
            maxTier, advanced, clues, naked, narrow, meanOpen, level,
        };
    }

    const LEVELS = ['easy', 'medium', 'hard', 'expert'];

    /** Livello finale: la misura calcolata, corretta indicativamente da quello dichiarato dalla fonte. */
    function grade(givens, declared) {
        const a = analyze(givens);
        if (!a.valid) return null;
        // `declared` può essere il nome di un livello oppure un numero continuo tra 0 e 3
        const d = typeof declared === 'number' ? declared : LEVELS.indexOf(String(declared || '').toLowerCase());
        const blended = d < 0 || Number.isNaN(d) ? a.level : 0.6 * a.level + 0.4 * d;
        return { level: LEVELS[Math.max(0, Math.min(3, Math.round(blended)))], computed: a.level, cost: a.cost, maxTier: a.maxTier, analysis: a };
    }

    // ------------------------------------------------------------------
    // Idee del puzzle
    // ------------------------------------------------------------------

    const BOX_NAMES = [
        'in alto a sinistra', 'in alto al centro', 'in alto a destra',
        'a sinistra', 'centrale', 'a destra',
        'in basso a sinistra', 'in basso al centro', 'in basso a destra',
    ];
    const unitName = u => u < 9 ? `riga ${u + 1}` : u < 18 ? `colonna ${u - 8}` : `riquadro ${BOX_NAMES[u - 18]}`;
    const inUnit = u => u < 9 ? `nella riga ${u + 1}` : u < 18 ? `nella colonna ${u - 8}` : `nel riquadro ${BOX_NAMES[u - 18]}`;
    const kindOf = u => u < 9 ? 'riga' : u < 18 ? 'colonna' : 'riquadro';
    const list = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1];

    function lookIdeas(g) {
        const out = [];
        const has = i => g[i] !== 0;
        const clues = g.filter(Boolean).length;

        // simmetria della disposizione
        const map = f => { for (let i = 0; i < 81; i++) if (has(i) !== has(f(i))) return false; return true; };
        const rot180 = map(i => 80 - i);
        const rot90 = map(i => COL(i) * 9 + (8 - ROW(i)));
        const mirV = map(i => ROW(i) * 9 + (8 - COL(i)));
        const mirH = map(i => (8 - ROW(i)) * 9 + COL(i));
        const diag = map(i => COL(i) * 9 + ROW(i));
        const anti = map(i => (8 - COL(i)) * 9 + (8 - ROW(i)));
        if (rot90 && mirV) out.push('La disposizione dei numeri ha simmetria completa: resta uguale ruotando o specchiando la griglia in qualunque modo.');
        else if (rot90) out.push('La disposizione dei numeri è una girandola: resta uguale a ogni quarto di giro.');
        else if (mirV && mirH) out.push('La disposizione dei numeri è specchiata sia in orizzontale sia in verticale.');
        else if (diag && anti) out.push('La disposizione dei numeri è specchiata rispetto a entrambe le diagonali.');
        else if (mirV) out.push('La disposizione dei numeri è specchiata tra metà sinistra e metà destra.');
        else if (mirH) out.push('La disposizione dei numeri è specchiata tra metà alta e metà bassa.');
        else if (diag || anti) out.push('La disposizione dei numeri è specchiata rispetto a una diagonale.');
        else if (rot180) out.push('La disposizione dei numeri resta uguale capovolgendo la griglia (mezzo giro).');
        else out.push('La disposizione dei numeri non è simmetrica: la forma è stata scelta per un altro motivo, cerca un disegno.');

        // simmetria dei valori
        let same = true, comp = true, pairs = 0;
        for (let i = 0; i < 40; i++) {
            if (!has(i) || !has(80 - i)) continue;
            pairs++;
            if (g[i] !== g[80 - i]) same = false;
            if (g[i] + g[80 - i] !== 10) comp = false;
        }
        if (pairs >= 6 && same) out.push('Anche i valori sono simmetrici: ogni numero ha un gemello uguale nella posizione opposta rispetto al centro.');
        if (pairs >= 6 && comp) out.push('Ogni numero e il suo opposto rispetto al centro sommano 10: la simmetria riguarda anche i valori.');

        // conteggi
        const perDigit = new Array(10).fill(0);
        for (const v of g) perDigit[v]++;
        const missing = [], heavy = [];
        for (let d = 1; d <= 9; d++) {
            if (perDigit[d] === 0) missing.push(d);
            else if (perDigit[d] >= 6) heavy.push(d);
        }
        const used = 9 - missing.length;
        if (missing.length === 1) out.push(`Tra i numeri di partenza il ${missing[0]} non compare mai: tutte e nove le copie vanno dedotte.`);
        else if (missing.length > 1) out.push(`I numeri di partenza usano solo ${used} cifre diverse: ${list(missing)} non compaiono mai.`);
        if (heavy.length === 1) out.push(`Il ${heavy[0]} è già quasi tutto sulla griglia: è il filo più corto da tirare.`);
        else if (heavy.length) out.push(`Le cifre ${list(heavy)} sono già quasi tutte sulla griglia: sono i fili più corti da tirare.`);

        const per = (from) => { const n = []; for (let u = 0; u < 9; u++) n.push(UNITS[from + u].filter(has).length); return n; };
        const rows = per(0), cols = per(9), boxes = per(18);
        const uniform = a => a.every(x => x === a[0]);
        if (uniform(rows) && uniform(cols) && uniform(boxes))
            out.push(`Ogni riga, colonna e riquadro contiene esattamente ${rows[0]} numeri: nessuna zona parte avvantaggiata.`);
        else {
            const emptyB = [], fullB = [];
            boxes.forEach((n, b) => { if (n === 0) emptyB.push(BOX_NAMES[b]); else if (n >= 6) fullB.push(BOX_NAMES[b]); });
            if (emptyB.length) out.push(`${emptyB.length === 1 ? 'Il riquadro ' + emptyB[0] + ' è' : 'I riquadri ' + list(emptyB) + ' sono'} del tutto vuot${emptyB.length === 1 ? 'o' : 'i'}: lì si arriva solo dall'esterno.`);
            if (fullB.length) out.push(`${fullB.length === 1 ? 'Il riquadro ' + fullB[0] + ' è' : 'I riquadri ' + list(fullB) + ' sono'} molto pien${fullB.length === 1 ? 'o' : 'i'}.`);
            const emptyL = [];
            rows.forEach((n, r) => { if (n === 0) emptyL.push(`la riga ${r + 1}`); });
            cols.forEach((n, c) => { if (n === 0) emptyL.push(`la colonna ${c + 1}`); });
            if (emptyL.length) out.push(`Non c'è alcun numero lungo ${list(emptyL)}.`);
        }

        // sequenze ordinate lungo righe e colonne
        const runs = [];
        for (let u = 0; u < 18; u++) {
            const vals = UNITS[u].map(i => g[i]).filter(Boolean);
            let best = 1, cur = 1, dir = 0;
            for (let k = 1; k < vals.length; k++) {
                const step = vals[k] - vals[k - 1];
                if (Math.abs(step) === 1 && (cur === 1 || step === dir)) { cur++; dir = step; }
                else { cur = Math.abs(step) === 1 ? 2 : 1; dir = step; }
                if (cur > best) best = cur;
            }
            if (best >= 4) runs.push(unitName(u));
        }
        if (runs.length) out.push(`Ci sono cifre consecutive in fila (${list(runs.slice(0, 3))}${runs.length > 3 ? '…' : ''}): l'autore ha scritto sequenze, non numeri a caso.`);

        // diagonali
        const dA = [], dB = [];
        for (let k = 0; k < 9; k++) { if (has(k * 10)) dA.push(g[k * 10]); if (has(k * 8 + 8)) dB.push(g[k * 8 + 8]); }
        for (const [d, name] of [[dA, 'principale'], [dB, 'secondaria']])
            if (d.length >= 6 && new Set(d).size <= 2) out.push(`Sulla diagonale ${name} i numeri ripetono ${new Set(d).size === 1 ? 'sempre la stessa cifra' : 'due sole cifre'}.`);

        out.unshift(clues <= 22 ? `Solo ${clues} numeri di partenza: pochissimi, ognuno pesa.` :
            clues >= 32 ? `${clues} numeri di partenza: molti, quindi la difficoltà non sta nella scarsità di informazioni.` : `${clues} numeri di partenza.`);
        return out;
    }

    function startIdeas(a) {
        const out = [];
        const placements = a.steps.filter(s => s.cell != null);
        const early = placements.slice(0, 10);
        const firstAdv = a.steps.findIndex(s => s.tier >= 2);
        const firstPlace = a.steps.findIndex(s => s.cell != null);

        if (firstAdv >= 0 && firstAdv < firstPlace)
            out.push('Non c\'è nessuna cifra da scrivere subito: la prima mossa è un\'osservazione sui candidati, non un numero.');
        else if (early.length && early[0].open <= 2)
            out.push(`L'ingresso è stretto: all'inizio ${early[0].open === 1 ? 'c\'è una sola cifra piazzabile' : 'ci sono solo due cifre piazzabili'} in tutta la griglia.`);
        else if (early.length && early[0].open >= 8)
            out.push('L\'ingresso è largo: all\'inizio si può partire da molti punti diversi.');

        const byDigit = new Array(10).fill(0);
        const byBand = [0, 0, 0], byStack = [0, 0, 0];
        for (const s of early) {
            byDigit[s.digit]++;
            byBand[(ROW(s.cell) / 3) | 0]++;
            byStack[(COL(s.cell) / 3) | 0]++;
        }
        const top = byDigit.indexOf(Math.max(...byDigit));
        if (byDigit[top] >= 3)
            out.push(`Le prime deduzioni ruotano attorno al ${top}: segui dove può stare, riquadro per riquadro.`);
        const bandNames = ['nella fascia alta', 'nella fascia centrale', 'nella fascia bassa'];
        const stackNames = ['nelle tre colonne di sinistra', 'nelle tre colonne centrali', 'nelle tre colonne di destra'];
        const bMax = byBand.indexOf(Math.max(...byBand)), sMax = byStack.indexOf(Math.max(...byStack));
        if (early.length >= 6 && byBand[bMax] >= early.length * .6) out.push(`Il puzzle si apre ${bandNames[bMax]}.`);
        else if (early.length >= 6 && byStack[sMax] >= early.length * .6) out.push(`Il puzzle si apre ${stackNames[sMax]}.`);

        const nakedEarly = early.filter(s => s.tech === 'naked').length;
        if (nakedEarly >= 3 || (early[0] && early[0].tech === 'naked'))
            out.push('In apertura la domanda utile non è "dove va questa cifra?" ma "cosa manca a questa casella?": cerca le caselle che vedono già otto cifre diverse.');
        else if (early.length && early.every(s => s.tech === 'hiddenB' || s.tech === 'full'))
            out.push('In apertura basta incrociare righe e colonne dentro i riquadri: per ogni cifra chiediti in quale casella del riquadro può ancora stare.');
        else if (early.filter(s => s.tech === 'hiddenL').length >= 3)
            out.push('In apertura conviene ragionare per righe e colonne intere, non per riquadri: una cifra ha un solo posto lungo una linea.');

        if (!out.length) out.push('L\'apertura è regolare: nessuna cifra o zona domina le prime mosse.');
        return out;
    }

    const KNOT = {
        point: s => `Dentro un riquadro, tutti i posti possibili di una cifra finiscono sulla stessa ${kindOf(s.unit2)}: quella cifra allora sparisce dal resto della ${kindOf(s.unit2)}. Guarda il ${unitName(s.unit)}.`,
        claim: s => `Lungo una ${kindOf(s.unit)}, una cifra può stare solo dentro un unico riquadro: quel riquadro non può ospitarla altrove. Guarda la ${unitName(s.unit)}.`,
        nPair: s => `Due caselle ${inUnit(s.unit)} ammettono le stesse due cifre e nient'altro: cosa resta alle loro vicine?`,
        hPair: s => `Due cifre, ${inUnit(s.unit)}, hanno gli stessi due soli posti: quelle due caselle sono prenotate, anche se sembrano avere altri candidati.`,
        nTriple: s => `Tre caselle ${inUnit(s.unit)} si spartiscono tre sole cifre: insieme le esauriscono.`,
        hTriple: s => `Tre cifre, ${inUnit(s.unit)}, possono stare solo in tre caselle: è una terna nascosta in mezzo ad altri candidati.`,
        nQuad: s => `Quattro caselle ${inUnit(s.unit)} si spartiscono quattro sole cifre.`,
        hQuad: s => `Quattro cifre, ${inUnit(s.unit)}, hanno solo quattro caselle a disposizione.`,
        xwing: s => `Segui il ${s.digits[0]}: in due ${s.unit < 9 ? 'righe' : 'colonne'} ha due soli posti, allineati sulle stesse due ${s.unit < 9 ? 'colonne' : 'righe'}. I quattro angoli formano un rettangolo: cosa implica per quelle ${s.unit < 9 ? 'colonne' : 'righe'}?`,
        sword: s => `Segui il ${s.digits[0]}: tre ${s.unit < 9 ? 'righe' : 'colonne'} lo confinano nelle stesse tre ${s.unit < 9 ? 'colonne' : 'righe'}. È lo stesso ragionamento del rettangolo, allargato a tre linee.`,
        jelly: s => `Segui il ${s.digits[0]}: quattro ${s.unit < 9 ? 'righe' : 'colonne'} lo confinano nelle stesse quattro ${s.unit < 9 ? 'colonne' : 'righe'}.`,
        turbot: s => `Segui solo il ${s.digits[0]}: ci sono due punti in cui ha due soli posti. Se le due coppie si toccano, le estremità lontane non possono essere entrambe sbagliate.`,
        xywing: s => `Tre caselle con due candidati ciascuna: una fa da perno ${inUnit(s.unit)}, le altre due da ali. Qualunque cifra prenda il perno, una delle ali ne prende una certa: chi vede entrambe le ali?`,
        xyzwing: s => `Un perno con tre candidati ${inUnit(s.unit)} e due ali con due candidati presi tra quei tre: una cifra comune finisce per forza in una delle tre caselle.`,
        wwing: () => 'Due caselle lontane con la stessa coppia di candidati, collegate da una cifra che in una linea ha due soli posti: le due caselle non possono avere entrambe quella cifra.',
        rect: s => `Quattro caselle agli angoli di un rettangolo, su due soli riquadri, rischiano di ammettere due cifre scambiabili: la soluzione è unica, quindi uno degli angoli deve rompere lo schema. Guarda il ${unitName(s.unit)}.`,
        trial: () => 'Qui gli schemi fissi non bastano: serve una catena lunga. Parti da una casella con due soli candidati e segui le conseguenze di entrambe le scelte: ciò che accade in tutti e due i casi è vero.',
    };

    function knotIdeas(a) {
        const out = [];
        const adv = a.steps.filter(s => s.tier >= 2);
        if (!adv.length) {
            const placements = a.steps.filter(s => s.cell != null);
            const tight = placements.slice(0, Math.max(1, placements.length - 15)).filter(s => s.open === 1);
            out.push((a.counts.naked || 0) === 0
                ? 'Dall\'inizio alla fine basta chiedersi dove può stare ogni cifra: nessuna tecnica sui candidati.'
                : 'Bastano le cifre singole dall\'inizio alla fine, ma non tutte si vedono chiedendosi "dove va questa cifra?".');
            if (tight.length) {
                const t = tight[Math.floor(tight.length / 2)];
                out.push(`Il passaggio più stretto arriva dopo circa ${t.at} cifre scritte: lì la mossa disponibile è una sola, ${t.tech === 'naked' ? 'una casella a cui manca un\'unica cifra' : 'una cifra con un solo posto'} ${inUnit(t.unit)}.`);
            } else out.push('Non ci sono strettoie: in ogni momento c\'è più di una mossa possibile.');
            return out;
        }
        const top = Math.max(...adv.map(s => s.tier));
        const key = adv.find(s => s.tier === top);
        out.push(adv[0].at === 0
            ? 'Fin dalla prima mossa serve guardare i candidati, non le cifre.'
            : `Le cifre singole si esauriscono dopo circa ${adv[0].at} cifre scritte: da lì serve guardare i candidati.`);
        out.push(KNOT[key.tech](key));
        const sameKind = adv.filter(s => s.tech === key.tech).length;
        const kinds = new Set(adv.map(s => s.tech)).size;
        if (sameKind > 1) out.push(`Un ragionamento di questo tipo serve ${sameKind} volte.`);
        if (kinds > 1) out.push(`In tutto il percorso richiede ${adv.length} osservazioni sui candidati, di ${kinds} tipi diversi.`);
        return out;
    }

    /** Tre livelli di indizi, da leggere uno alla volta. `note` è un commento d'autore facoltativo. */
    function ideas(givens, note) {
        const a = analyze(givens);
        if (!a.valid) return [];
        const look = lookIdeas(givens);
        if (note) look.push(note);
        return [
            { title: 'Colpo d\'occhio', text: look },
            { title: 'Da dove partire', text: startIdeas(a) },
            { title: 'Il nodo', text: knotIdeas(a) },
        ];
    }

    const api = { analyze, grade, ideas, bruteForce, LEVELS, TECH };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SudokuLogic = api;

})(typeof window !== 'undefined' ? window : globalThis);
