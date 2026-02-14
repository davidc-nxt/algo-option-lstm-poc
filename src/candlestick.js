/**
 * candlestick.js — Synthetic OHLC builder, 12 candlestick pattern detectors, and backtester
 *
 * DTOP data provides settlement prices (≈ Close). We construct synthetic OHLC:
 *   Open  = previous day's Close
 *   Close = current settlement price
 *   High  = max(O,C) + |change| × noise
 *   Low   = min(O,C) - |change| × noise
 */

/**
 * Build synthetic OHLC array from settlement price series
 * @param {Array<{date: string, settle: number}>} prices - sorted by date ascending
 * @returns {Array<{date: string, open: number, high: number, low: number, close: number}>}
 */
export function buildOHLC(prices) {
    if (!prices || prices.length < 2) return [];

    const ohlc = [];
    for (let i = 1; i < prices.length; i++) {
        const prev = prices[i - 1];
        const curr = prices[i];
        const open = prev.settle;
        const close = curr.settle;
        const change = Math.abs(close - open);
        const wick = change * 0.3 + 0.01; // small minimum wick

        ohlc.push({
            date: curr.date,
            open: round(open),
            high: round(Math.max(open, close) + wick),
            low: round(Math.min(open, close) - wick),
            close: round(close),
        });
    }
    return ohlc;
}

function round(v) {
    return Math.round(v * 1000) / 1000;
}

/* ── Helper metrics for a single candle ── */
function body(c) { return Math.abs(c.close - c.open); }
function range(c) { return c.high - c.low || 0.001; }
function upperShadow(c) { return c.high - Math.max(c.open, c.close); }
function lowerShadow(c) { return Math.min(c.open, c.close) - c.low; }
function isBullish(c) { return c.close > c.open; }
function isBearish(c) { return c.close < c.open; }

/* ── Trend helpers (simple: look back N candles) ── */
function avgBody(data, end, n) {
    let sum = 0, count = 0;
    for (let i = Math.max(0, end - n); i < end; i++) {
        sum += body(data[i]);
        count++;
    }
    return count ? sum / count : 0.001;
}

function isUptrend(data, idx, n = 5) {
    if (idx < n) return false;
    return data[idx].close > data[idx - n].close;
}

function isDowntrend(data, idx, n = 5) {
    if (idx < n) return false;
    return data[idx].close < data[idx - n].close;
}

/* ═══════════════════════════════════════════════
   12 CANDLESTICK PATTERN DETECTORS
   ═══════════════════════════════════════════════ */

const PATTERNS = [
    // ── Single-candle patterns ──
    {
        name: 'Doji',
        type: 'single',
        signal: 'reversal',
        emoji: '✚',
        detect(data, i) {
            const c = data[i];
            return body(c) < range(c) * 0.1;
        },
        desc: 'Open ≈ Close — market indecision, potential reversal'
    },
    {
        name: 'Hammer',
        type: 'single',
        signal: 'bullish',
        emoji: '🔨',
        detect(data, i) {
            if (i < 5) return false;
            const c = data[i];
            return isDowntrend(data, i) &&
                lowerShadow(c) >= body(c) * 2 &&
                upperShadow(c) < body(c) * 0.5 &&
                body(c) > 0;
        },
        desc: 'Long lower shadow in downtrend — buyers fought back'
    },
    {
        name: 'Shooting Star',
        type: 'single',
        signal: 'bearish',
        emoji: '🌠',
        detect(data, i) {
            if (i < 5) return false;
            const c = data[i];
            return isUptrend(data, i) &&
                upperShadow(c) >= body(c) * 2 &&
                lowerShadow(c) < body(c) * 0.5 &&
                body(c) > 0;
        },
        desc: 'Long upper shadow in uptrend — sellers pushed back'
    },
    {
        name: 'Hanging Man',
        type: 'single',
        signal: 'bearish',
        emoji: '🪢',
        detect(data, i) {
            if (i < 5) return false;
            const c = data[i];
            return isUptrend(data, i) &&
                lowerShadow(c) >= body(c) * 2 &&
                upperShadow(c) < body(c) * 0.5 &&
                body(c) > 0;
        },
        desc: 'Hammer shape at top of uptrend — warning of reversal'
    },

    // ── Two-candle patterns ──
    {
        name: 'Bullish Engulfing',
        type: 'two-candle',
        signal: 'bullish',
        emoji: '🟢',
        detect(data, i) {
            if (i < 1) return false;
            const prev = data[i - 1], curr = data[i];
            return isBearish(prev) && isBullish(curr) &&
                curr.open <= prev.close && curr.close >= prev.open &&
                body(curr) > body(prev);
        },
        desc: 'Green candle fully engulfs prior red — strong buying pressure'
    },
    {
        name: 'Bearish Engulfing',
        type: 'two-candle',
        signal: 'bearish',
        emoji: '🔴',
        detect(data, i) {
            if (i < 1) return false;
            const prev = data[i - 1], curr = data[i];
            return isBullish(prev) && isBearish(curr) &&
                curr.open >= prev.close && curr.close <= prev.open &&
                body(curr) > body(prev);
        },
        desc: 'Red candle fully engulfs prior green — strong selling pressure'
    },
    {
        name: 'Bullish Harami',
        type: 'two-candle',
        signal: 'bullish',
        emoji: '🤰',
        detect(data, i) {
            if (i < 1) return false;
            const prev = data[i - 1], curr = data[i];
            return isBearish(prev) && isBullish(curr) &&
                body(prev) > avgBody(data, i, 5) * 0.8 &&
                curr.close <= prev.open && curr.open >= prev.close;
        },
        desc: 'Small green inside large red — selling pressure fading'
    },
    {
        name: 'Bearish Harami',
        type: 'two-candle',
        signal: 'bearish',
        emoji: '🫄',
        detect(data, i) {
            if (i < 1) return false;
            const prev = data[i - 1], curr = data[i];
            return isBullish(prev) && isBearish(curr) &&
                body(prev) > avgBody(data, i, 5) * 0.8 &&
                curr.open <= prev.close && curr.close >= prev.open;
        },
        desc: 'Small red inside large green — buying pressure fading'
    },

    // ── Three-candle patterns ──
    {
        name: 'Morning Star',
        type: 'three-candle',
        signal: 'bullish',
        emoji: '🌅',
        detect(data, i) {
            if (i < 2) return false;
            const first = data[i - 2], second = data[i - 1], third = data[i];
            return isBearish(first) &&
                body(second) < body(first) * 0.3 &&
                isBullish(third) &&
                third.close > (first.open + first.close) / 2;
        },
        desc: 'Red → small body → green — dawn of a bullish reversal'
    },
    {
        name: 'Evening Star',
        type: 'three-candle',
        signal: 'bearish',
        emoji: '🌆',
        detect(data, i) {
            if (i < 2) return false;
            const first = data[i - 2], second = data[i - 1], third = data[i];
            return isBullish(first) &&
                body(second) < body(first) * 0.3 &&
                isBearish(third) &&
                third.close < (first.open + first.close) / 2;
        },
        desc: 'Green → small body → red — dusk of a bearish reversal'
    },
    {
        name: 'Three White Soldiers',
        type: 'three-candle',
        signal: 'bullish',
        emoji: '⬆️',
        detect(data, i) {
            if (i < 2) return false;
            const a = data[i - 2], b = data[i - 1], c = data[i];
            const avg = avgBody(data, i - 2, 5);
            return isBullish(a) && isBullish(b) && isBullish(c) &&
                body(a) > avg * 0.6 && body(b) > avg * 0.6 && body(c) > avg * 0.6 &&
                b.close > a.close && c.close > b.close;
        },
        desc: '3 consecutive strong green candles — powerful bullish momentum'
    },
    {
        name: 'Three Black Crows',
        type: 'three-candle',
        signal: 'bearish',
        emoji: '⬇️',
        detect(data, i) {
            if (i < 2) return false;
            const a = data[i - 2], b = data[i - 1], c = data[i];
            const avg = avgBody(data, i - 2, 5);
            return isBearish(a) && isBearish(b) && isBearish(c) &&
                body(a) > avg * 0.6 && body(b) > avg * 0.6 && body(c) > avg * 0.6 &&
                b.close < a.close && c.close < b.close;
        },
        desc: '3 consecutive strong red candles — powerful bearish momentum'
    },
];

/**
 * Detect all patterns across the OHLC dataset
 * @returns {Array<{index, date, name, type, signal, emoji, desc}>}
 */
export function detectPatterns(ohlcData) {
    if (!ohlcData || ohlcData.length < 3) return [];
    const results = [];

    for (let i = 0; i < ohlcData.length; i++) {
        for (const pat of PATTERNS) {
            if (pat.detect(ohlcData, i)) {
                results.push({
                    index: i,
                    date: ohlcData[i].date,
                    name: pat.name,
                    type: pat.type,
                    signal: pat.signal,
                    emoji: pat.emoji,
                    desc: pat.desc,
                });
            }
        }
    }
    return results;
}

/**
 * Backtest pattern signals against subsequent price movement
 * Hold for `holdDays` after signal, measure outcome
 * @returns {{ summary: {total, wins, losses, winRate, avgReturn}, byPattern: {...} }}
 */
export function backtestPatterns(ohlcData, patterns, holdDays = 3) {
    const results = [];
    const byPattern = {};

    for (const p of patterns) {
        if (p.signal === 'reversal') continue; // Skip Doji (ambiguous), or treat separately
        const entryIdx = p.index;
        const exitIdx = Math.min(entryIdx + holdDays, ohlcData.length - 1);
        if (exitIdx <= entryIdx) continue;

        const entry = ohlcData[entryIdx].close;
        const exit = ohlcData[exitIdx].close;
        const returnPct = ((exit - entry) / entry) * 100;

        // For bullish signal, positive return = win; for bearish, negative return = win
        const isWin = p.signal === 'bullish' ? returnPct > 0 : returnPct < 0;

        const result = {
            ...p,
            entryPrice: entry,
            exitPrice: exit,
            returnPct: round(returnPct),
            holdDays,
            isWin,
        };
        results.push(result);

        // Aggregate by pattern name
        if (!byPattern[p.name]) {
            byPattern[p.name] = { total: 0, wins: 0, totalReturn: 0, signal: p.signal, emoji: p.emoji };
        }
        byPattern[p.name].total++;
        if (isWin) byPattern[p.name].wins++;
        byPattern[p.name].totalReturn += returnPct;
    }

    const total = results.length;
    const wins = results.filter(r => r.isWin).length;

    return {
        summary: {
            total,
            wins,
            losses: total - wins,
            winRate: total ? round((wins / total) * 100) : 0,
            avgReturn: total ? round(results.reduce((s, r) => s + r.returnPct, 0) / total) : 0,
        },
        byPattern,
        results,
    };
}

export { PATTERNS };
