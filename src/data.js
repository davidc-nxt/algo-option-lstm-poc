/**
 * Data Layer — fetches and caches HKEX options JSON data
 */

const cache = {};

export async function loadIndex() {
    if (cache._index) return cache._index;
    const res = await fetch('/data/index.json');
    cache._index = await res.json();
    return cache._index;
}

export async function loadStockData(code) {
    if (cache[code]) return cache[code];
    const res = await fetch(`/data/${code}.json`);
    if (!res.ok) throw new Error(`Failed to load ${code}`);
    cache[code] = await res.json();
    return cache[code];
}

export async function loadSummary() {
    if (cache._summary) return cache._summary;
    const res = await fetch('/data/summary.json');
    cache._summary = await res.json();
    return cache._summary;
}

export async function loadNewsData(code) {
    const key = `_news_${code}`;
    if (cache[key]) return cache[key];
    try {
        const res = await fetch(`/data/news/${code}.json`);
        if (!res.ok) return null;
        cache[key] = await res.json();
        return cache[key];
    } catch {
        return null;
    }
}

/**
 * Get options chain for a stock on a specific date and expiry
 * Returns array of { strike, call: {gross,net,to,deals,settle,priceChg}, put: {...} }
 */
export function getChain(stockData, date, expiry) {
    const dateData = stockData.dates[date];
    if (!dateData || !dateData[expiry]) return [];

    return dateData[expiry].map(row => ({
        strike: row.k,
        call: {
            gross: row.c[0],
            net: row.c[1],
            turnover: row.c[2],
            deals: row.c[3],
            settle: row.c[4],
            priceChg: row.c[5]
        },
        put: {
            gross: row.p[0],
            net: row.p[1],
            turnover: row.p[2],
            deals: row.p[3],
            settle: row.p[4],
            priceChg: row.p[5]
        }
    }));
}

/**
 * Get available expiries for a stock on a given date
 */
export function getExpiries(stockData, date) {
    const dateData = stockData.dates[date];
    if (!dateData) return [];
    return Object.keys(dateData).sort();
}

/**
 * Get available dates for a stock
 */
export function getDates(stockData) {
    return Object.keys(stockData.dates).sort();
}

/**
 * Get settlement price time series for a specific strike/expiry
 */
export function getSettlementHistory(stockData, expiry, strike, type = 'call') {
    const dates = getDates(stockData);
    const series = [];

    for (const date of dates) {
        const dateData = stockData.dates[date];
        if (!dateData || !dateData[expiry]) continue;

        const row = dateData[expiry].find(r => Math.abs(r.k - strike) < 0.001);
        if (!row) continue;

        const idx = type === 'call' ? 4 : 4; // settle index
        const data = type === 'call' ? row.c : row.p;
        series.push({ date, settle: data[4], priceChg: data[5], oi: data[1], volume: data[2] });
    }
    return series;
}

/**
 * Get OI time series aggregated per stock
 */
export function getOIHistory(stockData) {
    const dates = getDates(stockData);
    const series = [];

    for (const date of dates) {
        const dateData = stockData.dates[date];
        if (!dateData) continue;

        let callOI = 0, putOI = 0, callVol = 0, putVol = 0;
        for (const expiry of Object.keys(dateData)) {
            for (const row of dateData[expiry]) {
                callOI += row.c[1];
                putOI += row.p[1];
                callVol += row.c[2];
                putVol += row.p[2];
            }
        }
        series.push({ date, callOI, putOI, callVol, putVol, pcr: callOI > 0 ? putOI / callOI : 0 });
    }
    return series;
}
