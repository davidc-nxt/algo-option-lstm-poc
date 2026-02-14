/**
 * SARIMAX Prediction Module
 * Implements Li Zhaohang's LLM-Sentiment-Enhanced SARIMAX methodology
 * for HK stock price prediction.
 *
 * Method: SARIMAX(0,1,2) with news sentiment + volume as exogenous variables.
 * Reference: Li, Z.H. (2026). Price prediction of Nasdaq 100 Index Fund.
 */

// ── Price data loader ──

const priceCache = {};

export async function loadPriceData(code) {
    if (priceCache[code]) return priceCache[code];
    try {
        const res = await fetch(`/data/prices/${code}.json`);
        if (!res.ok) return null;
        const data = await res.json();
        priceCache[code] = data;
        return data;
    } catch {
        return null;
    }
}

// ── Sentiment scoring (aligned with poster: +1 / 0 / -1) ──

const BULLISH = [
    'surge', 'soar', 'rally', 'breakout', 'record high', 'boom', 'outperform',
    'beat expectations', 'gain', 'rise', 'climb', 'jump', 'upgrade', 'profit',
    'growth', 'recovery', 'strong', 'bullish', 'optimistic', 'positive',
    'dividend', 'buyback', 'buy', 'accumulate', 'up', 'higher', 'improve',
    'advance', 'momentum', 'demand', 'robust', 'resilient',
];

const BEARISH = [
    'crash', 'plunge', 'collapse', 'crisis', 'bankrupt', 'default', 'fraud',
    'scandal', 'fall', 'drop', 'decline', 'loss', 'downgrade', 'bearish',
    'weak', 'miss expectations', 'warning', 'risk', 'selloff', 'sell', 'cut',
    'negative', 'concern', 'debt', 'tariff', 'down', 'lower', 'slow',
    'uncertain', 'volatile', 'pressure', 'headwind',
];

function scoreSentiment(title) {
    if (!title) return 0;
    const lower = title.toLowerCase();
    let bull = 0, bear = 0;
    for (const w of BULLISH) if (lower.includes(w)) bull++;
    for (const w of BEARISH) if (lower.includes(w)) bear++;
    if (bull > bear) return 1;   // positive
    if (bear > bull) return -1;  // negative
    return 0;                    // neutral
}

/**
 * Map news articles to daily sentiment aligned to price dates.
 * Each date gets +1, 0, or −1 based on aggregate news that day.
 * Dates with no news default to 0 (neutral).
 */
export function buildDailySentiment(articles, priceDates) {
    // Score each article
    const byDate = {};
    for (const art of articles) {
        const pub = art.publishedAt;
        if (!pub) continue;
        const date = typeof pub === 'string'
            ? pub.slice(0, 10)
            : new Date(pub * 1000).toISOString().slice(0, 10);
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(scoreSentiment(art.title));
    }

    // Aggregate per-date: average → snap to +1/0/−1
    const dateSentiment = {};
    for (const [date, scores] of Object.entries(byDate)) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        dateSentiment[date] = avg > 0.2 ? 1 : avg < -0.2 ? -1 : 0;
    }

    // Align to price dates
    return priceDates.map(d => dateSentiment[d] ?? 0);
}

// ── Normalize helpers ──

function normalizeVolume(volumes) {
    const max = Math.max(...volumes);
    const min = Math.min(...volumes);
    const range = max - min || 1;
    return volumes.map(v => (v - min) / range);
}

// ── SARIMAX runner (uses arima npm package async for Chrome) ──

let arimaModule = null;

async function getARIMA() {
    if (arimaModule) return arimaModule;
    // Dynamic import for the arima package (async for Chrome WASM compat)
    const mod = await import('arima/async');
    arimaModule = await (mod.default || mod);
    return arimaModule;
}

/**
 * Run SARIMAX(0,1,2) with exogenous variables.
 * @param {number[]} closePrices - Historical close prices
 * @param {number[][]} exog - Exogenous array [[vol, sent], ...]
 * @param {number} forecastDays - Steps to predict
 * @param {number[][]} exogNew - Future exogenous (filled with last-known values)
 * @returns {{ pred: number[], errors: number[] }}
 */
export async function runSARIMAX(closePrices, exog, forecastDays = 5, exogNew = null) {
    const ARIMA = await getARIMA();

    // Generate future exogenous if not provided (carry forward last values)
    if (!exogNew) {
        const lastExog = exog[exog.length - 1];
        exogNew = Array(forecastDays).fill(lastExog);
    }

    const arima = new ARIMA({
        p: 0, d: 1, q: 2,
        P: 0, D: 0, Q: 0, s: 0,
        transpose: true,
        verbose: false,
    }).fit(closePrices, exog);

    const [rawPred, rawErrors] = arima.predict(forecastDays, exogNew);

    // Sanitize NaN values (SARIMAX can produce NaN with near-constant exog)
    const lastPrice = closePrices[closePrices.length - 1];
    const pred = rawPred.map(v => (isNaN(v) || !isFinite(v)) ? lastPrice : v);
    const errors = rawErrors.map(v => (isNaN(v) || !isFinite(v)) ? 0 : v);
    const hadNaN = rawPred.some(v => isNaN(v) || !isFinite(v));

    return { pred, errors, hadNaN };
}

/**
 * Run traditional SARIMAX(0,1,2) WITHOUT exogenous variables.
 */
export async function runTraditionalSARIMAX(closePrices, forecastDays = 5) {
    const ARIMA = await getARIMA();

    const arima = new ARIMA({
        p: 0, d: 1, q: 2,
        P: 0, D: 0, Q: 0, s: 0,
        verbose: false,
    }).fit(closePrices);

    const [pred, errors] = arima.predict(forecastDays);
    return { pred, errors };
}

// ── Model comparison metrics ──

function mae(actual, predicted) {
    let s = 0;
    for (let i = 0; i < actual.length; i++) s += Math.abs(actual[i] - predicted[i]);
    return s / actual.length;
}

function rmse(actual, predicted) {
    let s = 0;
    for (let i = 0; i < actual.length; i++) s += (actual[i] - predicted[i]) ** 2;
    return Math.sqrt(s / actual.length);
}

function mape(actual, predicted) {
    let s = 0;
    for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== 0) s += Math.abs((actual[i] - predicted[i]) / actual[i]);
    }
    return (s / actual.length) * 100;
}

const round2 = v => Math.round(v * 100) / 100;
const round3 = v => Math.round(v * 1000) / 1000;

/**
 * Backtest both models using walk-forward on the last `testDays`.
 * For each step, we train on data up to that point, predict 1 step.
 */
export async function compareModels(closePrices, exog, testDays = 20) {
    const n = closePrices.length;
    if (n < testDays + 30) {
        testDays = Math.max(5, Math.floor(n * 0.15));
    }

    const trainEnd = n - testDays;
    const actual = closePrices.slice(trainEnd);

    // Train on first portion, predict testDays
    const trainPrices = closePrices.slice(0, trainEnd);
    const trainExog = exog.slice(0, trainEnd);

    // Enhanced model (with exog)
    let enhanced;
    let enhancedFailed = false;
    try {
        enhanced = await runSARIMAX(trainPrices, trainExog, testDays);
        if (enhanced.hadNaN) enhancedFailed = true;
    } catch (e) {
        enhanced = { pred: Array(testDays).fill(trainPrices[trainPrices.length - 1]), errors: Array(testDays).fill(0), hadNaN: true };
        enhancedFailed = true;
    }

    // Traditional model (no exog)
    let traditional;
    try {
        traditional = await runTraditionalSARIMAX(trainPrices, testDays);
    } catch (e) {
        traditional = { pred: Array(testDays).fill(trainPrices[trainPrices.length - 1]), errors: Array(testDays).fill(0) };
    }

    // Safe metric calculation
    const safeMetric = (fn, act, pred) => {
        const val = fn(act, pred);
        return (isNaN(val) || !isFinite(val)) ? null : round2(val);
    };

    return {
        actual,
        enhanced: {
            pred: enhanced.pred,
            errors: enhanced.errors,
            hadNaN: enhancedFailed,
            mae: safeMetric(mae, actual, enhanced.pred),
            rmse: safeMetric(rmse, actual, enhanced.pred),
            mape: safeMetric(mape, actual, enhanced.pred),
        },
        traditional: {
            pred: traditional.pred,
            errors: traditional.errors,
            mae: safeMetric(mae, actual, traditional.pred),
            rmse: safeMetric(rmse, actual, traditional.pred),
            mape: safeMetric(mape, actual, traditional.pred),
        },
        testDays,
        trainDays: trainEnd,
    };
}

/**
 * Full pipeline: load data, build exogenous, compare models, forecast.
 */
export async function runFullPipeline(priceData, newsArticles, forecastDays = 5) {
    const prices = priceData.prices;
    const closePrices = prices.map(p => p.close);
    const priceDates = prices.map(p => p.date);
    const volumes = normalizeVolume(prices.map(p => p.volume));

    // Build sentiment aligned to price dates
    const dailySent = buildDailySentiment(newsArticles || [], priceDates);

    // Build exogenous: [normalizedVolume, sentiment]
    const exog = volumes.map((v, i) => [v, dailySent[i]]);

    // Compare models on held-out data
    const comparison = await compareModels(closePrices, exog);

    // Forecast future days using full dataset
    let enhancedForecast;
    try {
        enhancedForecast = await runSARIMAX(closePrices, exog, forecastDays);
    } catch {
        // Fallback: use traditional forecast if enhanced fails
        const fallback = await runTraditionalSARIMAX(closePrices, forecastDays);
        enhancedForecast = { ...fallback, hadNaN: true };
    }
    const traditionalForecast = await runTraditionalSARIMAX(closePrices, forecastDays);

    // Build future dates (skip weekends)
    const lastDate = new Date(priceDates[priceDates.length - 1]);
    const futureDates = [];
    let d = new Date(lastDate);
    while (futureDates.length < forecastDays) {
        d.setDate(d.getDate() + 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) {
            futureDates.push(d.toISOString().slice(0, 10));
        }
    }

    // Sentiment summary
    const sentArr = dailySent;
    const bullDays = sentArr.filter(s => s > 0).length;
    const bearDays = sentArr.filter(s => s < 0).length;
    const neutralDays = sentArr.filter(s => s === 0).length;

    return {
        prices,
        priceDates,
        closePrices,
        futureDates,
        enhanced: { ...enhancedForecast, ...comparison.enhanced },
        traditional: { ...traditionalForecast, ...comparison.traditional },
        comparison,
        sentiment: { bullDays, bearDays, neutralDays, total: sentArr.length, dailySent },
        forecastDays,
    };
}
