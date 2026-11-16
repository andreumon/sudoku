// Sudoku — lettura della griglia da uno screenshot.
// Tutto avviene sul dispositivo, senza librerie: si trova il quadrato della griglia,
// lo si divide in 81 caselle e si riconoscono le cifre grandi confrontandole con
// le cifre disegnate dal browser in vari caratteri. Le note piccole vengono ignorate.
'use strict';

(function (root) {

    const NW = 20, NH = 28; // dimensione normalizzata di una cifra

    /** Ridimensiona una maschera (ritagliata sul suo contorno) a NW×NH, centrata e senza deformarla. */
    function normalize(mask, w, x0, y0, x1, y1) {
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
        const scale = Math.min(NW / bw, NH / bh);
        const tw = bw * scale, th = bh * scale;
        const ox = (NW - tw) / 2, oy = (NH - th) / 2;
        const out = new Float32Array(NW * NH);
        for (let y = 0; y < NH; y++)
            for (let x = 0; x < NW; x++) {
                // media dei pixel sorgente coperti da questo pixel di destinazione
                const sx0 = (x - ox) / scale, sx1 = (x + 1 - ox) / scale;
                const sy0 = (y - oy) / scale, sy1 = (y + 1 - oy) / scale;
                if (sx1 <= 0 || sy1 <= 0 || sx0 >= bw || sy0 >= bh) continue;
                let sum = 0, n = 0;
                const ax = Math.max(0, Math.floor(sx0)), bx = Math.min(bw, Math.max(Math.ceil(sx1), Math.floor(sx0) + 1));
                const ay = Math.max(0, Math.floor(sy0)), by = Math.min(bh, Math.max(Math.ceil(sy1), Math.floor(sy0) + 1));
                for (let yy = ay; yy < by; yy++)
                    for (let xx = ax; xx < bx; xx++) { sum += mask[(y0 + yy) * w + x0 + xx]; n++; }
                out[y * NW + x] = n ? sum / n : 0;
            }
        // leggera sfocatura: rende il confronto tollerante a spessori e allineamenti diversi
        const soft = new Float32Array(NW * NH);
        for (let y = 0; y < NH; y++)
            for (let x = 0; x < NW; x++) {
                let sum = 0;
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++) {
                        const xx = x + dx, yy = y + dy;
                        if (xx >= 0 && yy >= 0 && xx < NW && yy < NH) sum += out[yy * NW + xx] * (dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1);
                    }
                soft[y * NW + x] = sum / 16;
            }
        out.set(soft);
        let norm = 0;
        for (const v of out) norm += v * v;
        norm = Math.sqrt(norm) || 1;
        for (let k = 0; k < out.length; k++) out[k] /= norm;
        return out;
    }

    let templates = null;

    /** Cifre 1-9 disegnate in più caratteri e pesi: il riferimento per il confronto. */
    function buildTemplates() {
        if (templates) return templates;
        const fonts = [
            'system-ui, sans-serif', 'sans-serif', 'Roboto, sans-serif', 'Arial, Helvetica, sans-serif', '"Segoe UI", sans-serif',
            'Inter, sans-serif', 'Verdana, sans-serif', 'Tahoma, sans-serif', '"Trebuchet MS", sans-serif',
            'serif', 'Georgia, serif', 'monospace', '"Courier New", monospace',
        ];
        const weights = [300, 400, 600, 700];
        const S = 96;
        const cv = document.createElement('canvas');
        cv.width = cv.height = S;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        templates = [];
        const seen = new Set();
        for (const font of fonts)
            for (const weight of weights)
                for (let d = 1; d <= 9; d++) {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, S, S);
                    ctx.fillStyle = '#000';
                    ctx.font = `${weight} 64px ${font}`;
                    ctx.fillText(String(d), S / 2, S / 2);
                    const data = ctx.getImageData(0, 0, S, S).data;
                    const mask = new Uint8Array(S * S);
                    let x0 = S, y0 = S, x1 = -1, y1 = -1;
                    for (let y = 0; y < S; y++)
                        for (let x = 0; x < S; x++)
                            if (data[(y * S + x) * 4] < 128) {
                                mask[y * S + x] = 1;
                                if (x < x0) x0 = x; if (x > x1) x1 = x;
                                if (y < y0) y0 = y; if (y > y1) y1 = y;
                            }
                    if (x1 < 0) continue;
                    const vec = normalize(mask, S, x0, y0, x1, y1);
                    const key = d + ':' + Array.from(vec, v => (v * 9) | 0).join('');
                    if (seen.has(key)) continue; // carattere non installato: stesso disegno di un altro
                    seen.add(key);
                    templates.push({ digit: d, vec });
                }
        // l'1 "con il piede" (DejaVu, Verdana, molti giornali) spesso manca tra i caratteri del telefono: lo si disegna a mano
        for (const lw of [5, 8, 11])
            for (const foot of [11, 15])
                for (const flag of [9, 14]) {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, S, S);
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = lw;
                    ctx.lineCap = 'butt';
                    ctx.lineJoin = 'miter';
                    ctx.beginPath();
                    ctx.moveTo(48 - flag, 25 + flag * .75); ctx.lineTo(48, 25); ctx.lineTo(48, 71);
                    ctx.moveTo(48 - foot, 71 - lw / 2); ctx.lineTo(48 + foot, 71 - lw / 2);
                    ctx.stroke();
                    const data = ctx.getImageData(0, 0, S, S).data;
                    const mask = new Uint8Array(S * S);
                    let x0 = S, y0 = S, x1 = -1, y1 = -1;
                    for (let y = 0; y < S; y++)
                        for (let x = 0; x < S; x++)
                            if (data[(y * S + x) * 4] < 128) {
                                mask[y * S + x] = 1;
                                if (x < x0) x0 = x; if (x > x1) x1 = x;
                                if (y < y0) y0 = y; if (y > y1) y1 = y;
                            }
                    templates.push({ digit: 1, vec: normalize(mask, S, x0, y0, x1, y1) });
                }
        return templates;
    }

    function classify(vec) {
        let best = 0, bestScore = 0, second = 0;
        const perDigit = new Float32Array(10);
        for (const t of buildTemplates()) {
            let dot = 0;
            for (let k = 0; k < vec.length; k++) dot += vec[k] * t.vec[k];
            if (dot > perDigit[t.digit]) perDigit[t.digit] = dot;
        }
        for (let d = 1; d <= 9; d++) {
            if (perDigit[d] > bestScore) { second = bestScore; bestScore = perDigit[d]; best = d; }
            else if (perDigit[d] > second) second = perDigit[d];
        }
        return { digit: best, score: bestScore, margin: bestScore - second };
    }

    // ------------------------------------------------------------------
    // Ricerca della griglia
    // ------------------------------------------------------------------

    /** Tratti lunghi e sottili lungo una direzione: [{pos, from, to}], già fusi per posizioni adiacenti. */
    function longLines(gray, W, H, horizontal) {
        const A = horizontal ? H : W, B = horizontal ? W : H;
        const at = horizontal ? (a, b) => gray[a * W + b] : (a, b) => gray[b * W + a];
        const T = 14, GAP = Math.max(3, Math.round(B * .006)), MIN = B * .42;
        const raw = [];
        for (let a = 2; a < A - 2; a++) {
            let start = -1, last = -1, best = null;
            for (let b = 0; b <= B; b++) {
                const edge = b < B && (Math.abs(at(a, b) - at(a - 2, b)) > T || Math.abs(at(a, b) - at(a + 2, b)) > T);
                if (edge) { if (start < 0) start = b; last = b; }
                if (start >= 0 && (b === B || b - last > GAP)) {
                    if (last - start >= MIN && (!best || last - start > best.to - best.from)) best = { pos: a, from: start, to: last };
                    start = -1;
                }
            }
            if (best) raw.push(best);
        }
        // fonde le posizioni contigue (una linea spessa occupa più pixel)
        const lines = [];
        for (const l of raw) {
            const prev = lines[lines.length - 1];
            if (prev && l.pos - prev.end <= 3 && Math.abs(l.from - prev.from) < B * .03 && Math.abs(l.to - prev.to) < B * .03) {
                prev.end = l.pos; prev.from = Math.min(prev.from, l.from); prev.to = Math.max(prev.to, l.to);
            } else lines.push({ pos: l.pos, end: l.pos, from: l.from, to: l.to });
        }
        return lines;
    }

    /** Il gruppo di linee parallele, con gli stessi estremi, che disegna un quadrato. */
    function squareFrom(lines, B) {
        const tol = B * .025;
        let best = null, third = null;
        for (const seed of lines) {
            const group = lines.filter(l => Math.abs(l.from - seed.from) < tol && Math.abs(l.to - seed.to) < tol);
            if (group.length < 2) continue;
            const from = median(group.map(l => l.from)), to = median(group.map(l => l.to));
            const side = to - from;
            // tra le linee del gruppo, la coppia più distante che dista circa quanto il lato
            for (const a of group)
                for (const b of group) {
                    const span = b.end - a.pos;
                    // griglie disegnate con le sole quattro linee dei riquadri: due linee distanti un terzo del lato
                    if (span > 0 && Math.abs(span - side / 3) < side * .03) {
                        const mid = (a.pos + a.end + b.pos + b.end) / 4;
                        if (!third || side > third.side) third = { inside: 2, side, from, to, start: Math.round(mid - side / 2), end: Math.round(mid + side / 2) };
                    }
                    if (span <= 0 || Math.abs(span - side) > side * .06) continue;
                    const inside = group.filter(l => l.pos >= a.pos && l.end <= b.end).length;
                    if (!best || inside > best.inside || (inside === best.inside && side > best.side))
                        best = { inside, side, from, to, start: a.pos, end: b.end };
                }
        }
        // un quadrato completo vince se ha molte linee; altrimenti si accetta lo schema a quattro linee
        if (best && (best.inside >= 4 || !third || best.side >= third.side * .95)) return best;
        return third;
    }

    const median = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

    function findGrid(gray, W, H) {
        const h = squareFrom(longLines(gray, W, H, true), W);   // linee orizzontali: from/to = x, start/end = y
        const v = squareFrom(longLines(gray, W, H, false), H);  // linee verticali: from/to = y, start/end = x
        if (h && v && Math.abs(h.from - v.start) < W * .04 && Math.abs(h.start - v.from) < W * .04)
            return { x: v.start, y: h.start, w: v.end - v.start, h: h.end - h.start, found: true };
        if (h) return { x: h.from, y: h.start, w: h.to - h.from, h: h.end - h.start, found: true };
        if (v) return { x: v.start, y: v.from, w: v.end - v.start, h: v.to - v.from, found: true };
        // nessuna griglia riconosciuta: il quadrato centrale, da correggere a mano
        const side = Math.min(W, H);
        return { x: (W - side) >> 1, y: (H - side) >> 1, w: side, h: side, found: false };
    }

    // ------------------------------------------------------------------
    // Lettura delle caselle
    // ------------------------------------------------------------------

    function readCell(data, W, cx, cy, cw, ch) {
        const pad = .07;
        const x0 = Math.round(cx + cw * pad), y0 = Math.round(cy + ch * pad);
        const w = Math.round(cw * (1 - 2 * pad)), h = Math.round(ch * (1 - 2 * pad));
        if (w < 8 || h < 8) return { digit: 0, score: 0 };

        // colore di fondo: il più frequente nella casella (regge caselle evidenziate o colorate)
        const hist = new Map();
        for (let y = 0; y < h; y += 2)
            for (let x = 0; x < w; x += 2) {
                const p = ((y0 + y) * W + x0 + x) * 4;
                const key = (data[p] >> 4) << 8 | (data[p + 1] >> 4) << 4 | (data[p + 2] >> 4);
                hist.set(key, (hist.get(key) || 0) + 1);
            }
        let bgKey = 0, bgN = 0;
        for (const [k, n] of hist) if (n > bgN) { bgN = n; bgKey = k; }
        const br = (bgKey >> 8 & 15) * 16 + 8, bg = (bgKey >> 4 & 15) * 16 + 8, bb = (bgKey & 15) * 16 + 8;

        const mask = new Uint8Array(w * h);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const p = ((y0 + y) * W + x0 + x) * 4;
                const dist = Math.max(Math.abs(data[p] - br), Math.abs(data[p + 1] - bg), Math.abs(data[p + 2] - bb));
                if (dist > 64) mask[y * w + x] = 1;
            }

        // componenti connesse: la cifra è la macchia più alta
        const label = new Int32Array(w * h);
        let best = null, id = 0;
        const stack = [];
        for (let s = 0; s < w * h; s++) {
            if (!mask[s] || label[s]) continue;
            id++;
            let minX = w, minY = h, maxX = 0, maxY = 0, area = 0;
            stack.push(s); label[s] = id;
            while (stack.length) {
                const q = stack.pop(), qx = q % w, qy = (q / w) | 0;
                area++;
                if (qx < minX) minX = qx; if (qx > maxX) maxX = qx;
                if (qy < minY) minY = qy; if (qy > maxY) maxY = qy;
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = qx + dx, ny = qy + dy;
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                        const n = ny * w + nx;
                        if (mask[n] && !label[n]) { label[n] = id; stack.push(n); }
                    }
            }
            // ciò che tocca il bordo del ritaglio è un resto di linea o un'evidenziazione, non una cifra
            if (minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1) continue;
            const c = { id, minX, minY, maxX, maxY, area, bw: maxX - minX + 1, bh: maxY - minY + 1 };
            if (!best || c.bh > best.bh) best = c;
        }
        if (!best) return { digit: 0, score: 0 };

        const fill = best.area / (best.bw * best.bh);
        // una cifra grande è alta almeno un terzo della casella; le note a matita sono molto più piccole
        if (best.bh < ch * .3 || best.bh > ch * .8 || best.bw > cw * .7 || fill < .1) return { digit: 0, score: 0 };

        // una cifra è fatta di tratti sottili: una macchia piena (un'evidenziazione a mano) no
        const rad = Math.max(2, Math.round(best.bh * .13));
        let core = 0;
        for (let y = best.minY + rad; y <= best.maxY - rad; y += 2)
            for (let x = best.minX + rad; x <= best.maxX - rad; x += 2) {
                if (label[y * w + x] !== best.id) continue;
                let full = true;
                for (let dy = -rad; dy <= rad && full; dy += rad)
                    for (let dx = -rad; dx <= rad; dx += rad)
                        if (label[(y + dy) * w + x + dx] !== best.id) { full = false; break; }
                if (full) core++;
            }
        if (core * 4 > best.area * .12) return { digit: 0, score: 0 };

        const only = new Uint8Array(w * h);
        for (let k = 0; k < w * h; k++) if (label[k] === best.id) only[k] = 1;
        const r = classify(normalize(only, w, best.minX, best.minY, best.maxX, best.maxY));
        // l'1 è l'unica cifra così stretta, ma il suo disegno cambia molto tra i caratteri (con o senza piede)
        if (best.bw / best.bh < .46 && fill > .3 && (r.digit !== 1 || r.score < .8)) return { digit: 1, score: .85, margin: .1 };
        return r.score >= .7 ? r : { digit: 0, score: r.score };
    }

    /**
     * Legge una griglia da un'immagine (HTMLImageElement, ImageBitmap o canvas).
     * Restituisce { grid: 81 cifre (0 = vuota), doubt: caselle incerte, crop: dataURL del ritaglio, found }.
     */
    function read(image) {
        const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
        const scale = Math.min(1, 1000 / iw);
        const W = Math.round(iw * scale), H = Math.round(ih * scale);
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, W, H);
        const data = ctx.getImageData(0, 0, W, H).data;
        const gray = new Uint8Array(W * H);
        for (let k = 0; k < W * H; k++) gray[k] = (data[k * 4] * 77 + data[k * 4 + 1] * 150 + data[k * 4 + 2] * 29) >> 8;

        const g = findGrid(gray, W, H);
        const grid = new Array(81).fill(0), doubt = [];
        const cw = g.w / 9, ch = g.h / 9;
        for (let r = 0; r < 9; r++)
            for (let c = 0; c < 9; c++) {
                const res = readCell(data, W, g.x + c * cw, g.y + r * ch, cw, ch);
                grid[r * 9 + c] = res.digit;
                if (res.digit && (res.score < .78 || res.margin < .02)) doubt.push(r * 9 + c);
            }

        const out = document.createElement('canvas');
        const side = Math.min(540, Math.round(Math.max(g.w, g.h)));
        out.width = out.height = side;
        out.getContext('2d').drawImage(cv, g.x, g.y, g.w, g.h, 0, 0, side, side);
        return { grid, doubt, crop: out.toDataURL('image/jpeg', .82), found: g.found };
    }

    root.SudokuOCR = { read };

})(window);
