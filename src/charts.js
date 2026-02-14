/**
 * Chart.js wrappers for all visualizations
 */
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// Shared chart defaults — Tableau light theme
Chart.defaults.color = '#555555';
Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.08)';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyle = 'circle';

const chartInstances = {};

function destroyIfExists(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
    }
}

/**
 * Market Overview — Bar chart of top stocks by OI
 */
export function renderMarketChart(canvasId, stocks) {
    destroyIfExists(canvasId);
    const top = stocks.slice(0, 15);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: top.map(s => s.code),
            datasets: [
                {
                    label: 'Call OI',
                    data: top.map(s => s.latestCallOI),
                    backgroundColor: 'rgba(6, 182, 212, 0.6)',
                    borderColor: 'rgba(6, 182, 212, 1)',
                    borderWidth: 1,
                    borderRadius: 4,
                },
                {
                    label: 'Put OI',
                    data: top.map(s => s.latestPutOI),
                    backgroundColor: 'rgba(236, 72, 153, 0.6)',
                    borderColor: 'rgba(236, 72, 153, 1)',
                    borderWidth: 1,
                    borderRadius: 4,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.8,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v }
                }
            }
        }
    });
}

/**
 * Payoff Diagram
 */
export function renderPayoffChart(canvasId, payoffData, breakevens = []) {
    destroyIfExists(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Split into profit/loss segments for coloring
    const labels = payoffData.map(p => p.price);
    const values = payoffData.map(p => p.payoff);

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'P/L at Expiry',
                data: values,
                borderColor: ctx => {
                    const v = ctx.raw;
                    return v >= 0 ? '#10b981' : '#ef4444';
                },
                segment: {
                    borderColor: ctx => {
                        const y0 = ctx.p0.parsed.y;
                        const y1 = ctx.p1.parsed.y;
                        if (y0 >= 0 && y1 >= 0) return '#10b981';
                        if (y0 < 0 && y1 < 0) return '#ef4444';
                        return '#f59e0b';
                    }
                },
                backgroundColor: 'rgba(99, 102, 241, 0.05)',
                fill: true,
                borderWidth: 2.5,
                pointRadius: 0,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: ctx => `Stock Price: $${ctx[0].label}`,
                        label: ctx => `P/L: $${ctx.raw.toFixed(2)}`
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Stock Price at Expiry' },
                    ticks: {
                        maxTicksLimit: 10,
                        callback: function (val) { return '$' + this.getLabelForValue(val); }
                    }
                },
                y: {
                    title: { display: true, text: 'Profit / Loss' },
                    ticks: { callback: v => '$' + v.toFixed(0) },
                    grid: {
                        color: ctx => ctx.tick.value === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(99,102,241,0.06)'
                    }
                }
            }
        }
    });
}

/**
 * Settlement Price History — Line chart
 */
export function renderSettlementChart(canvasId, series) {
    destroyIfExists(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'line',
        data: {
            labels: series.map(s => s.date),
            datasets: [{
                label: 'Settlement Price',
                data: series.map(s => s.settle),
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.08)',
                fill: true,
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: '#06b6d4',
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: ctx => `Settle: $${ctx.raw.toFixed(2)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { maxTicksLimit: 8, maxRotation: 45 }
                },
                y: {
                    ticks: { callback: v => '$' + v.toFixed(2) }
                }
            }
        }
    });
}

/**
 * OI History — Area chart
 */
export function renderOIChart(canvasId, series) {
    destroyIfExists(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'line',
        data: {
            labels: series.map(s => s.date),
            datasets: [
                {
                    label: 'Call OI',
                    data: series.map(s => s.callOI),
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.12)',
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.3
                },
                {
                    label: 'Put OI',
                    data: series.map(s => s.putOI),
                    borderColor: '#ec4899',
                    backgroundColor: 'rgba(236, 72, 153, 0.12)',
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()}`
                    }
                }
            },
            scales: {
                x: { ticks: { maxTicksLimit: 8, maxRotation: 45 } },
                y: { ticks: { callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v } }
            }
        }
    });
}

/**
 * Put/Call Ratio — Line chart
 */
export function renderPCRChart(canvasId, series) {
    destroyIfExists(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'line',
        data: {
            labels: series.map(s => s.date),
            datasets: [{
                label: 'Put/Call Ratio',
                data: series.map(s => s.pcr),
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                fill: true,
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: '#8b5cf6',
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: ctx => `P/C Ratio: ${ctx.raw.toFixed(3)}`
                    }
                }
            },
            scales: {
                x: { ticks: { maxTicksLimit: 8, maxRotation: 45 } },
                y: { ticks: { callback: v => v.toFixed(2) } }
            }
        }
    });
}

/**
 * Volume Chart — Bar chart
 */
export function renderVolumeChart(canvasId, series) {
    destroyIfExists(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: series.map(s => s.date),
            datasets: [
                {
                    label: 'Call Volume',
                    data: series.map(s => s.callVol),
                    backgroundColor: 'rgba(6, 182, 212, 0.5)',
                    borderRadius: 3,
                },
                {
                    label: 'Put Volume',
                    data: series.map(s => s.putVol),
                    backgroundColor: 'rgba(236, 72, 153, 0.5)',
                    borderRadius: 3,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()}` }
                }
            },
            scales: {
                x: { stacked: true, ticks: { maxTicksLimit: 8, maxRotation: 45 } },
                y: { stacked: true, ticks: { callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v } }
            }
        }
    });
}

/**
 * Prediction Chart — Actual + Fitted + Forecast
 */
export function renderPredictionChart(canvasId, dates, actual, fitted, forecastDates, forecast) {
    destroyIfExists(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const allLabels = [...dates, ...forecastDates];
    const actualFull = [...actual, ...Array(forecastDates.length).fill(null)];
    const fittedFull = [...fitted, ...Array(forecastDates.length).fill(null)];
    const forecastFull = [...Array(dates.length - 1).fill(null), actual[actual.length - 1], ...forecast];

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: 'Actual Price',
                    data: actualFull,
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.08)',
                    fill: false,
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointBackgroundColor: '#06b6d4',
                    tension: 0.3,
                    spanGaps: false
                },
                {
                    label: 'Model Fit',
                    data: fittedFull,
                    borderColor: 'rgba(139, 92, 246, 0.6)',
                    borderDash: [4, 4],
                    fill: false,
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0.3,
                    spanGaps: false
                },
                {
                    label: 'Forecast',
                    data: forecastFull,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    borderDash: [6, 3],
                    fill: true,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#f59e0b',
                    pointHoverRadius: 7,
                    tension: 0.3,
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.2,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: ctx => ctx.raw !== null ? `${ctx.dataset.label}: $${ctx.raw.toFixed(2)}` : null
                    }
                }
            },
            scales: {
                x: {
                    ticks: { maxTicksLimit: 12, maxRotation: 45 },
                    grid: {
                        color: (ctx) => {
                            if (ctx.index === dates.length - 1) return 'rgba(245, 158, 11, 0.4)';
                            return 'rgba(99, 102, 241, 0.06)';
                        },
                        lineWidth: (ctx) => ctx.index === dates.length - 1 ? 2 : 1
                    }
                },
                y: {
                    ticks: { callback: v => '$' + v.toFixed(2) }
                }
            }
        }
    });
}


// Candlestick Chart — Custom bars for OHLC data with pattern markers
export function renderCandlestickChart(canvasId, ohlcData, patterns = []) {
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const labels = ohlcData.map(d => d.date);

    // Build floating bars: [low of body, high of body]
    const bodyData = ohlcData.map(d => [
        Math.min(d.open, d.close),
        Math.max(d.open, d.close)
    ]);

    const colors = ohlcData.map(d =>
        d.close >= d.open ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.85)'
    );
    const borderColors = ohlcData.map(d =>
        d.close >= d.open ? 'rgba(34,197,94,1)' : 'rgba(239,68,68,1)'
    );

    // Pattern markers as scatter points
    const bullishMarkers = [];
    const bearishMarkers = [];
    const neutralMarkers = [];

    for (const p of patterns) {
        const wick = ohlcData[p.index].high - ohlcData[p.index].low;
        if (p.signal === 'bullish') {
            bullishMarkers.push({ x: p.date, y: ohlcData[p.index].low - wick * 0.2 });
        } else if (p.signal === 'bearish') {
            bearishMarkers.push({ x: p.date, y: ohlcData[p.index].high + wick * 0.2 });
        } else {
            neutralMarkers.push({ x: p.date, y: ohlcData[p.index].high + wick * 0.2 });
        }
    }

    // Plugin to draw wicks
    const wickPlugin = {
        id: 'candlestickWicks',
        afterDatasetsDraw(chart) {
            const { ctx: c, scales: { y } } = chart;
            const meta = chart.getDatasetMeta(0);

            ohlcData.forEach((d, i) => {
                const bar = meta.data[i];
                if (!bar) return;
                c.save();
                c.strokeStyle = borderColors[i];
                c.lineWidth = 1.5;
                c.beginPath();
                c.moveTo(bar.x, y.getPixelForValue(d.high));
                c.lineTo(bar.x, y.getPixelForValue(d.low));
                c.stroke();
                c.restore();
            });
        }
    };

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        plugins: [wickPlugin],
        data: {
            labels,
            datasets: [
                {
                    label: 'OHLC',
                    data: bodyData,
                    backgroundColor: colors,
                    borderColor: borderColors,
                    borderWidth: 1,
                    borderSkipped: false,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8,
                },
                {
                    type: 'scatter',
                    label: '↑ Bullish',
                    data: bullishMarkers,
                    pointStyle: 'triangle',
                    pointRadius: 8,
                    backgroundColor: 'rgba(34,197,94,0.9)',
                    borderColor: '#22c55e',
                    borderWidth: 1,
                },
                {
                    type: 'scatter',
                    label: '↓ Bearish',
                    data: bearishMarkers,
                    pointStyle: 'triangle',
                    rotation: 180,
                    pointRadius: 8,
                    backgroundColor: 'rgba(239,68,68,0.9)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                },
                {
                    type: 'scatter',
                    label: '◆ Reversal',
                    data: neutralMarkers,
                    pointStyle: 'rectRot',
                    pointRadius: 6,
                    backgroundColor: 'rgba(250,204,21,0.9)',
                    borderColor: '#facc15',
                    borderWidth: 1,
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label(context) {
                            if (context.datasetIndex === 0) {
                                const d = ohlcData[context.dataIndex];
                                return `O:${d.open} H:${d.high} L:${d.low} C:${d.close}`;
                            }
                            return context.dataset.label;
                        }
                    }
                },
                legend: {
                    display: true,
                    labels: { filter: item => item.datasetIndex > 0 }
                }
            },
            scales: {
                x: {
                    ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 20 }
                },
                y: {
                    ticks: { callback: v => '$' + v.toFixed(2) }
                }
            }
        }
    });
}

// ============ SARIMAX Prediction Chart ============

export function renderSarimaxChart(canvasId, result) {
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    // Show last 60 days of history + forecast
    const showDays = 60;
    const n = result.closePrices.length;
    const histStart = Math.max(0, n - showDays);
    const histDates = result.priceDates.slice(histStart);
    const histPrices = result.closePrices.slice(histStart);

    // Labels = historic dates + future dates
    const labels = [...histDates, ...result.futureDates];

    // Historical line data (with nulls for future)
    const histData = [...histPrices, ...Array(result.forecastDays).fill(null)];

    // Enhanced forecast (nulls for history, then predictions)
    const enhData = [...Array(histPrices.length - 1).fill(null), histPrices[histPrices.length - 1], ...result.enhanced.pred];

    // Traditional forecast
    const tradData = [...Array(histPrices.length - 1).fill(null), histPrices[histPrices.length - 1], ...result.traditional.pred];

    // Confidence bands for enhanced
    const enhUpper = enhData.map((v, i) => {
        if (v === null) return null;
        const errIdx = i - histPrices.length;
        if (errIdx < 0) return null;
        return v + (result.enhanced.errors[errIdx] || 0) * 1.96;
    });
    const enhLower = enhData.map((v, i) => {
        if (v === null) return null;
        const errIdx = i - histPrices.length;
        if (errIdx < 0) return null;
        return v - (result.enhanced.errors[errIdx] || 0) * 1.96;
    });

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Historical Close',
                    data: histData,
                    borderColor: 'rgba(99, 102, 241, 1)',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1,
                },
                {
                    label: '🟢 Enhanced SARIMAX',
                    data: enhData,
                    borderColor: 'rgba(34, 197, 94, 1)',
                    borderWidth: 2.5,
                    borderDash: [6, 3],
                    pointRadius: 3,
                    pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                    fill: false,
                    tension: 0.1,
                },
                {
                    label: '🟠 Traditional SARIMAX',
                    data: tradData,
                    borderColor: 'rgba(249, 115, 22, 1)',
                    borderWidth: 2,
                    borderDash: [4, 4],
                    pointRadius: 3,
                    pointBackgroundColor: 'rgba(249, 115, 22, 1)',
                    fill: false,
                    tension: 0.1,
                },
                {
                    label: 'Confidence Band (95%)',
                    data: enhUpper,
                    borderColor: 'rgba(34, 197, 94, 0.3)',
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: '+1',
                    backgroundColor: 'rgba(34, 197, 94, 0.08)',
                },
                {
                    label: '_lower',
                    data: enhLower,
                    borderColor: 'rgba(34, 197, 94, 0.3)',
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false,
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        filter: item => !item.text.startsWith('_'),
                        usePointStyle: true,
                        padding: 16,
                    },
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label(ctx) {
                            if (ctx.dataset.label.startsWith('_')) return null;
                            return `${ctx.dataset.label}: $${ctx.parsed.y?.toFixed(2) ?? '—'}`;
                        }
                    }
                },
                annotation: undefined, // No annotation plugin needed
            },
            scales: {
                x: {
                    ticks: {
                        maxTicksLimit: 12,
                        maxRotation: 45,
                    },
                    grid: { display: false },
                },
                y: {
                    title: { display: true, text: 'Price (HKD)' },
                    ticks: {
                        callback: v => `$${v.toFixed(0)}`,
                    },
                },
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false,
            },
        },
    });
}

// ============ Hybrid SARIMAX+LSTM Chart (Tableau Light Theme) ============

const hybridChartInstances = {};

export function renderHybridChart(canvasId, result) {
    if (hybridChartInstances[canvasId]) {
        hybridChartInstances[canvasId].destroy();
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Tableau palette
    const blue = '#4E79A7';
    const green = '#59A14F';
    const orange = '#F28E2B';
    const purple = '#B07AA1';

    const n = result.closePrices.length;
    const showLast = Math.min(60, n);

    const histDates = result.priceDates.slice(-showLast);
    const histPrices = result.closePrices.slice(-showLast);

    const allLabels = [...histDates, ...result.futureDates];

    // Historical data (show only last N days)
    const histData = histPrices.map((p, i) => ({ x: histDates[i], y: p }));

    // Forecast lines — bridge from last historical price
    const lastPrice = histPrices[histPrices.length - 1];
    const lastDate = histDates[histDates.length - 1];

    const hybridData = [{ x: lastDate, y: lastPrice }].concat(
        result.futureDates.map((d, i) => ({ x: d, y: result.hybrid.pred[i] }))
    );
    const sarimaxData = [{ x: lastDate, y: lastPrice }].concat(
        result.futureDates.map((d, i) => ({ x: d, y: result.sarimax.pred[i] }))
    );
    const tradData = [{ x: lastDate, y: lastPrice }].concat(
        result.futureDates.map((d, i) => ({ x: d, y: result.traditional.pred[i] }))
    );

    // Confidence band for hybrid
    const errors = result.hybrid.errors || result.sarimax.errors;
    const hybridUpper = [null].concat(
        result.futureDates.map((d, i) => ({
            x: d,
            y: result.hybrid.pred[i] + 1.96 * (errors[i] || 0)
        }))
    );
    const hybridLower = [null].concat(
        result.futureDates.map((d, i) => ({
            x: d,
            y: result.hybrid.pred[i] - 1.96 * (errors[i] || 0)
        }))
    );

    hybridChartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: 'Historical Close',
                    data: histData,
                    borderColor: blue,
                    backgroundColor: blue + '18',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.2,
                },
                {
                    label: '🟢 Hybrid (SARIMAX+LSTM)',
                    data: hybridData,
                    borderColor: green,
                    borderWidth: 2.5,
                    borderDash: [6, 3],
                    pointRadius: 3,
                    pointBackgroundColor: green,
                    fill: false,
                    tension: 0.1,
                },
                {
                    label: '🟠 SARIMAX Only',
                    data: sarimaxData,
                    borderColor: orange,
                    borderWidth: 2,
                    borderDash: [4, 4],
                    pointRadius: 3,
                    pointBackgroundColor: orange,
                    fill: false,
                    tension: 0.1,
                },
                {
                    label: '🟣 Traditional',
                    data: tradData,
                    borderColor: purple,
                    borderWidth: 1.5,
                    borderDash: [2, 3],
                    pointRadius: 2,
                    pointBackgroundColor: purple,
                    fill: false,
                    tension: 0.1,
                },
                {
                    label: 'Confidence Band (95%)',
                    data: hybridUpper,
                    borderColor: green + '40',
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: '+1',
                    backgroundColor: green + '12',
                },
                {
                    label: '_lower',
                    data: hybridLower,
                    borderColor: green + '40',
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false,
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        filter: item => !item.text.startsWith('_'),
                        usePointStyle: true,
                        padding: 16,
                        color: '#333',
                        font: { size: 11 },
                    },
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label(ctx) {
                            if (ctx.dataset.label.startsWith('_')) return null;
                            return `${ctx.dataset.label}: $${ctx.parsed.y?.toFixed(2) ?? '—'}`;
                        }
                    }
                },
            },
            scales: {
                x: {
                    ticks: { maxTicksLimit: 12, maxRotation: 45, color: '#666' },
                    grid: { display: false },
                },
                y: {
                    title: { display: true, text: 'Price (HKD)', color: '#333' },
                    ticks: { callback: v => `$${v.toFixed(0)}`, color: '#666' },
                    grid: { color: '#E5E5E5' },
                },
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
        },
    });
}

