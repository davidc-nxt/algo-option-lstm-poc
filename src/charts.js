/**
 * Chart.js wrappers for all visualizations
 */
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// Shared chart defaults
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(99, 102, 241, 0.1)';
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

