/**
 * signals.js — Day Trading Signal Engine
 *
 * Combines 5 indicator categories from real OHLC + volume data
 * into a composite trading signal with user-configurable weights.
 *
 * Indicators:
 *   1. Moving Average Crossover (SMA / EMA)
 *   2. Volume Analysis (spikes, volume-price divergence)
 *   3. Candlestick Patterns (reuses candlestick.js)
 *   4. News Sentiment (reuses sentiment.js)
 *   5. RSI (Relative Strength Index)
 */

import { buildOHLC as buildSyntheticOHLC, detectPatterns } from './candlestick.js';

// ════════════════════════════════════════════════
// 1. MOVING AVERAGES
// ════════════════════════════════════════════════

/**
 * Simple Moving Average
 * @param {number[]} data - close prices
 * @param {number} period
 * @returns {(number|null)[]} - SMA values (null where insufficient data)
 */
export function computeSMA(data, period) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else {
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) sum += data[j];
            result.push(sum / period);
        }
    }
    return result;
}

/**
 * Exponential Moving Average
 * @param {number[]} data - close prices
 * @param {number} period
 * @returns {(number|null)[]} - EMA values
 */
export function computeEMA(data, period) {
    const result = [];
    const k = 2 / (period + 1);
    let ema = null;

    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else if (i === period - 1) {
            // Seed with SMA
            let sum = 0;
            for (let j = 0; j < period; j++) sum += data[j];
            ema = sum / period;
            result.push(ema);
        } else {
            ema = data[i] * k + ema * (1 - k);
            result.push(ema);
        }
    }
    return result;
}

/**
 * Compute moving average (SMA or EMA)
 */
export function computeMA(data, period, type = 'SMA') {
    return type === 'EMA' ? computeEMA(data, period) : computeSMA(data, period);
}

/**
 * Detect MA crossover signals
 * @returns {{ signal: string, score: number, detail: string, crossovers: Array }}
 *   score: -1 (bearish) to +1 (bullish)
 */
export function detectMACrossover(closes, shortPeriod, longPeriod, maType = 'SMA') {
    const shortMA = computeMA(closes, shortPeriod, maType);
    const longMA = computeMA(closes, longPeriod, maType);

    const crossovers = [];
    const n = closes.length;

    // Scan for crossovers
    for (let i = 1; i < n; i++) {
        if (shortMA[i] === null || longMA[i] === null || shortMA[i - 1] === null || longMA[i - 1] === null) continue;

        const prevDiff = shortMA[i - 1] - longMA[i - 1];
        const currDiff = shortMA[i] - longMA[i];

        if (prevDiff <= 0 && currDiff > 0) {
            crossovers.push({ index: i, type: 'golden_cross', label: '🟡 Golden Cross' });
        } else if (prevDiff >= 0 && currDiff < 0) {
            crossovers.push({ index: i, type: 'death_cross', label: '💀 Death Cross' });
        }
    }

    // Current position
    const lastShort = shortMA[n - 1];
    const lastLong = longMA[n - 1];

    if (lastShort === null || lastLong === null) {
        return { signal: 'neutral', score: 0, detail: 'Insufficient data for MA', crossovers, shortMA, longMA };
    }

    const diff = (lastShort - lastLong) / lastLong; // normalized difference
    const recentCross = crossovers.length > 0 ? crossovers[crossovers.length - 1] : null;
    const recentCrossRecency = recentCross ? (n - 1 - recentCross.index) : Infinity;

    let score = 0;
    let detail = '';

    if (diff > 0.01) {
        score = Math.min(diff * 20, 1); // scale to 0–1
        detail = `Short MA above Long MA by ${(diff * 100).toFixed(2)}%`;
        if (recentCross && recentCross.type === 'golden_cross' && recentCrossRecency <= 5) {
            score = Math.min(score + 0.3, 1);
            detail += ` — recent Golden Cross (${recentCrossRecency}d ago)`;
        }
    } else if (diff < -0.01) {
        score = Math.max(diff * 20, -1);
        detail = `Short MA below Long MA by ${(Math.abs(diff) * 100).toFixed(2)}%`;
        if (recentCross && recentCross.type === 'death_cross' && recentCrossRecency <= 5) {
            score = Math.max(score - 0.3, -1);
            detail += ` — recent Death Cross (${recentCrossRecency}d ago)`;
        }
    } else {
        detail = `MAs converging (diff: ${(diff * 100).toFixed(2)}%)`;
    }

    const signal = score > 0.15 ? 'bullish' : score < -0.15 ? 'bearish' : 'neutral';

    return { signal, score, detail, crossovers, shortMA, longMA };
}


// ════════════════════════════════════════════════
// 2. VOLUME ANALYSIS
// ════════════════════════════════════════════════

/**
 * Analyze volume patterns
 * @param {Array<{close: number, volume: number}>} priceData
 * @param {number} avgPeriod - lookback for volume average
 * @param {number} spikeThreshold - multiplier above avg to flag spike
 * @returns {{ signal, score, detail, avgVolume, lastVolume, isSpike, volumeTrend }}
 */
export function analyzeVolume(priceData, avgPeriod = 20, spikeThreshold = 1.5) {
    if (priceData.length < avgPeriod + 1) {
        return { signal: 'neutral', score: 0, detail: 'Insufficient volume data', avgVolume: 0, lastVolume: 0, isSpike: false, volumeTrend: 'flat' };
    }

    const n = priceData.length;
    const volumes = priceData.map(d => d.volume);
    const closes = priceData.map(d => d.close);

    // Average volume over lookback
    let sumVol = 0;
    for (let i = n - avgPeriod - 1; i < n - 1; i++) sumVol += volumes[i];
    const avgVolume = sumVol / avgPeriod;

    const lastVolume = volumes[n - 1];
    const isSpike = lastVolume > avgVolume * spikeThreshold;

    // Volume trend: compare recent 5-day avg vs prior 5-day avg
    const recent5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const prior5 = volumes.slice(-10, -5).reduce((a, b) => a + b, 0) / Math.min(5, volumes.slice(-10, -5).length || 1);
    const volumeTrend = recent5 > prior5 * 1.1 ? 'expanding' : recent5 < prior5 * 0.9 ? 'contracting' : 'stable';

    // Price direction
    const priceChange = closes[n - 1] - closes[n - 2];
    const priceDirection = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'flat';

    let score = 0;
    let detail = '';

    if (isSpike && priceDirection === 'up') {
        // High volume + rising price = strong bullish
        score = 0.8;
        detail = `Volume spike (${(lastVolume / avgVolume).toFixed(1)}× avg) with rising price — strong buying`;
    } else if (isSpike && priceDirection === 'down') {
        // High volume + falling price = strong bearish (capitulation or distribution)
        score = -0.8;
        detail = `Volume spike (${(lastVolume / avgVolume).toFixed(1)}× avg) with falling price — heavy selling`;
    } else if (volumeTrend === 'expanding' && priceDirection === 'up') {
        score = 0.4;
        detail = `Expanding volume supports uptrend`;
    } else if (volumeTrend === 'expanding' && priceDirection === 'down') {
        score = -0.4;
        detail = `Expanding volume confirms downtrend`;
    } else if (volumeTrend === 'contracting' && priceDirection === 'up') {
        // Rising price on falling volume = weak rally
        score = -0.2;
        detail = `Contracting volume on rising price — rally may be weakening`;
    } else if (volumeTrend === 'contracting' && priceDirection === 'down') {
        score = 0.2;
        detail = `Contracting volume on falling price — selling pressure easing`;
    } else {
        detail = `Volume stable at ${(lastVolume / avgVolume).toFixed(1)}× average`;
    }

    const signal = score > 0.15 ? 'bullish' : score < -0.15 ? 'bearish' : 'neutral';

    return { signal, score, detail, avgVolume: Math.round(avgVolume), lastVolume, isSpike, volumeTrend };
}


// ════════════════════════════════════════════════
// 3. CANDLESTICK PATTERNS (wraps existing detector)
// ════════════════════════════════════════════════

/**
 * Scan price data for candlestick patterns and score
 * @param {Array<{date, open, high, low, close}>} ohlc - real OHLC data
 * @param {number} lookback - how many recent candles to check
 * @returns {{ signal, score, detail, patterns }}
 */
export function scoreCandlePatterns(ohlc, lookback = 10) {
    if (ohlc.length < 3) {
        return { signal: 'neutral', score: 0, detail: 'Not enough candles', patterns: [] };
    }

    // Use the existing pattern detector
    const allPatterns = detectPatterns(ohlc);

    // Filter to recent lookback window
    const cutoffIdx = Math.max(0, ohlc.length - lookback);
    const recentPatterns = allPatterns.filter(p => {
        const idx = ohlc.findIndex(c => c.date === p.date);
        return idx >= cutoffIdx;
    });

    let bullishCount = 0, bearishCount = 0;
    for (const p of recentPatterns) {
        if (p.signal === 'bullish') bullishCount++;
        else if (p.signal === 'bearish') bearishCount++;
        // 'reversal' patterns: context-dependent, skip for scoring
    }

    const total = bullishCount + bearishCount;
    let score = 0;
    let detail = '';

    if (total === 0) {
        detail = `No clear candlestick patterns in last ${lookback} candles`;
    } else {
        score = (bullishCount - bearishCount) / Math.max(total, 1);
        score = Math.max(-1, Math.min(1, score * 0.8)); // dampen
        const names = recentPatterns.map(p => `${p.emoji} ${p.name}`).join(', ');
        detail = `${bullishCount} bullish, ${bearishCount} bearish patterns: ${names}`;
    }

    const signal = score > 0.15 ? 'bullish' : score < -0.15 ? 'bearish' : 'neutral';

    return { signal, score, detail, patterns: recentPatterns, allPatterns };
}


// ════════════════════════════════════════════════
// 4. NEWS SENTIMENT (wraps existing analyzer)
// ════════════════════════════════════════════════

/**
 * Convert sentiment result to normalized score
 * @param {object} sentimentResult - from analyzeSentiment()
 * @returns {{ signal, score, detail }}
 */
export function scoreNewsSentiment(sentimentResult) {
    if (!sentimentResult || sentimentResult.confidence === 0) {
        return { signal: 'neutral', score: 0, detail: 'No news data available' };
    }

    // Normalize avgScore to -1...+1
    const rawScore = sentimentResult.avgScore;
    const score = Math.max(-1, Math.min(1, rawScore / 3)); // /3 to normalize

    const detail = `${sentimentResult.signalLabel} — ${sentimentResult.bullishCount} bullish, ${sentimentResult.bearishCount} bearish, ${sentimentResult.neutralCount} neutral articles (confidence: ${sentimentResult.confidence}%)`;

    return { signal: sentimentResult.signal, score, detail };
}


// ════════════════════════════════════════════════
// 5. RSI (Relative Strength Index)
// ════════════════════════════════════════════════

/**
 * Compute RSI
 * @param {number[]} closes
 * @param {number} period
 * @returns {(number|null)[]} RSI values
 */
export function computeRSI(closes, period = 14) {
    const rsi = [];
    if (closes.length < period + 1) {
        return closes.map(() => null);
    }

    // Calculate gains and losses
    const changes = [];
    for (let i = 1; i < closes.length; i++) {
        changes.push(closes[i] - closes[i - 1]);
    }

    // First RSI: simple average of gains/losses
    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < period; i++) {
        if (changes[i] > 0) avgGain += changes[i];
        else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;

    rsi.push(null); // index 0 has no change
    for (let i = 0; i < period - 1; i++) rsi.push(null);

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));

    // Smoothed RSI
    for (let i = period; i < changes.length; i++) {
        const gain = changes[i] > 0 ? changes[i] : 0;
        const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        const rs2 = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs2));
    }

    return rsi;
}

/**
 * Score RSI signal
 * @param {number[]} closes
 * @param {number} period
 * @param {number} overbought - default 70
 * @param {number} oversold - default 30
 * @returns {{ signal, score, detail, rsiValues, currentRSI }}
 */
export function scoreRSI(closes, period = 14, overbought = 70, oversold = 30) {
    const rsiValues = computeRSI(closes, period);
    const currentRSI = rsiValues[rsiValues.length - 1];

    if (currentRSI === null) {
        return { signal: 'neutral', score: 0, detail: 'Insufficient data for RSI', rsiValues, currentRSI: null };
    }

    let score = 0;
    let detail = '';

    if (currentRSI >= overbought) {
        // Overbought → bearish (potential reversal down)
        score = -((currentRSI - overbought) / (100 - overbought)); // -0 to -1
        detail = `RSI ${currentRSI.toFixed(1)} — Overbought (above ${overbought}), potential reversal`;
    } else if (currentRSI <= oversold) {
        // Oversold → bullish (potential reversal up)
        score = (oversold - currentRSI) / oversold; // 0 to +1
        detail = `RSI ${currentRSI.toFixed(1)} — Oversold (below ${oversold}), potential bounce`;
    } else if (currentRSI > 50) {
        score = (currentRSI - 50) / (overbought - 50) * 0.3; // mild bullish
        detail = `RSI ${currentRSI.toFixed(1)} — Bullish momentum`;
    } else {
        score = (currentRSI - 50) / (50 - oversold) * 0.3; // mild bearish
        detail = `RSI ${currentRSI.toFixed(1)} — Bearish momentum`;
    }

    score = Math.max(-1, Math.min(1, score));
    const signal = score > 0.15 ? 'bullish' : score < -0.15 ? 'bearish' : 'neutral';

    return { signal, score, detail, rsiValues, currentRSI };
}


// ════════════════════════════════════════════════
// COMPOSITE SIGNAL
// ════════════════════════════════════════════════

/**
 * Default weights for signal categories
 */
export const DEFAULT_WEIGHTS = {
    ma: 25,
    volume: 20,
    candle: 20,
    news: 15,
    rsi: 20
};

/**
 * Normalize weights to sum to 1.0
 */
function normalizeWeights(weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (total === 0) return { ma: 0.2, volume: 0.2, candle: 0.2, news: 0.2, rsi: 0.2 };
    const normalized = {};
    for (const [k, v] of Object.entries(weights)) normalized[k] = v / total;
    return normalized;
}

/**
 * Generate composite day trading signal
 * @param {object} params
 * @param {Array} params.priceData - Yahoo Finance OHLC+volume data [{date, open, high, low, close, volume}]
 * @param {object} params.sentimentResult - from analyzeSentiment()
 * @param {object} params.config - user-configurable parameters
 * @returns {object} Full signal dashboard data
 */
export function generateSignals(priceData, sentimentResult, config = {}) {
    const {
        maType = 'SMA',
        shortMAPeriod = 10,
        longMAPeriod = 30,
        rsiPeriod = 14,
        rsiOverbought = 70,
        rsiOversold = 30,
        volumeAvgPeriod = 20,
        volumeSpikeThreshold = 1.5,
        candleLookback = 10,
        weights = DEFAULT_WEIGHTS,
    } = config;

    const closes = priceData.map(d => d.close);

    // 1. MA Crossover
    const maResult = detectMACrossover(closes, shortMAPeriod, longMAPeriod, maType);

    // 2. Volume Analysis
    const volumeResult = analyzeVolume(priceData, volumeAvgPeriod, volumeSpikeThreshold);

    // 3. Candlestick Patterns (use real OHLC from Yahoo Finance)
    const ohlc = priceData.map(d => ({
        date: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
    }));
    const candleResult = scoreCandlePatterns(ohlc, candleLookback);

    // 4. News Sentiment
    const newsResult = scoreNewsSentiment(sentimentResult);

    // 5. RSI
    const rsiResult = scoreRSI(closes, rsiPeriod, rsiOverbought, rsiOversold);

    // Composite scoring
    const w = normalizeWeights(weights);
    const compositeScore =
        maResult.score * w.ma +
        volumeResult.score * w.volume +
        candleResult.score * w.candle +
        newsResult.score * w.news +
        rsiResult.score * w.rsi;

    // Map composite score to signal label
    let compositeSignal, compositeLabel, compositeClass;
    if (compositeScore > 0.5) {
        compositeSignal = 'strong_buy';
        compositeLabel = '🟢 STRONG BUY';
        compositeClass = 'signal-strong-buy';
    } else if (compositeScore > 0.15) {
        compositeSignal = 'buy';
        compositeLabel = '🟢 BUY';
        compositeClass = 'signal-buy';
    } else if (compositeScore > -0.15) {
        compositeSignal = 'neutral';
        compositeLabel = '⚖️ NEUTRAL';
        compositeClass = 'signal-neutral';
    } else if (compositeScore > -0.5) {
        compositeSignal = 'sell';
        compositeLabel = '🔴 SELL';
        compositeClass = 'signal-sell';
    } else {
        compositeSignal = 'strong_sell';
        compositeLabel = '🔴 STRONG SELL';
        compositeClass = 'signal-strong-sell';
    }

    // Confidence: how much the indicators agree
    const scores = [maResult.score, volumeResult.score, candleResult.score, newsResult.score, rsiResult.score];
    const allSameSign = scores.every(s => s >= 0) || scores.every(s => s <= 0);
    const avgMagnitude = scores.reduce((a, b) => a + Math.abs(b), 0) / scores.length;
    const confidence = Math.round(Math.min(avgMagnitude * 100 * (allSameSign ? 1.2 : 0.7), 99));

    return {
        composite: {
            signal: compositeSignal,
            label: compositeLabel,
            cssClass: compositeClass,
            score: parseFloat(compositeScore.toFixed(3)),
            confidence,
        },
        indicators: {
            ma: { ...maResult, weight: weights.ma },
            volume: { ...volumeResult, weight: weights.volume },
            candle: { ...candleResult, weight: weights.candle },
            news: { ...newsResult, weight: weights.news },
            rsi: { ...rsiResult, weight: weights.rsi },
        },
        config: { maType, shortMAPeriod, longMAPeriod, rsiPeriod, rsiOverbought, rsiOversold, volumeAvgPeriod, volumeSpikeThreshold, candleLookback, weights },
        priceData,
        ohlc,
    };
}
