/**
 * HK Options Explorer — Main Application
 */
import './index.css';
import { loadIndex, loadStockData, loadNewsData, getChain, getExpiries, getDates, getSettlementHistory, getOIHistory } from './data.js';
import { greeks, impliedVolatility, daysToExpiry } from './blackscholes.js';
import { STRATEGIES, calculatePayoff, strategyMetrics, strategyGreeks } from './strategies.js';
import { renderMarketChart, renderPayoffChart, renderSettlementChart, renderOIChart, renderPCRChart, renderVolumeChart, renderPredictionChart, renderCandlestickChart, renderSarimaxChart, renderHybridChart, renderSignalChart } from './charts.js';
import { trainAndPredict } from './lstm.js';
import { analyzeSentiment, combinedSignal } from './sentiment.js';
import { buildOHLC, detectPatterns, backtestPatterns } from './candlestick.js';
import { loadPriceData, runFullPipeline } from './sarimax.js';
import { runHybridPipeline } from './hybrid.js';
import { generateSignals } from './signals.js';

// ============ State ============
let state = {
  index: null,
  currentStock: null,
  currentStockData: null,
  currentDate: null,
  currentTab: 'stock-analysis'
};

// ============ Init ============
async function init() {
  console.log('🚀 Initializing HK Options Explorer...');

  // Load index
  state.index = await loadIndex();
  console.log(`📊 Loaded ${state.index.stocks.length} stocks, ${state.index.dates.length} dates`);

  // Populate stock selector
  const stockSel = document.getElementById('stockSelector');
  stockSel.innerHTML = '<option value="">— Select Stock —</option>' +
    state.index.stocks.map(s =>
      `<option value="${s.code}">${s.code} — ${s.name}${s.ticker ? ' (' + s.ticker + ')' : ''}</option>`
    ).join('');

  // Populate date selector
  const dateSel = document.getElementById('dateSelector');
  dateSel.innerHTML = state.index.dates.slice().reverse().map(d =>
    `<option value="${d}">${d}</option>`
  ).join('');
  state.currentDate = state.index.latestDate;

  // Event listeners
  stockSel.addEventListener('change', onStockChange);
  dateSel.addEventListener('change', onDateChange);
  document.getElementById('tabs').addEventListener('click', onTabClick);
  document.getElementById('expirySelector').addEventListener('change', onExpiryChange);
  document.getElementById('buildStrategyBtn').addEventListener('click', onBuildStrategy);
  document.getElementById('strategyType').addEventListener('change', onStrategyTypeChange);
  document.getElementById('strategyExpiry').addEventListener('change', onStrategyExpiryChange);
  document.getElementById('trendExpiry').addEventListener('change', onTrendExpiryChange);
  document.getElementById('trendStrike').addEventListener('change', onTrendStrikeChange);
  document.getElementById('trendType').addEventListener('change', onTrendStrikeChange);

  // Prediction tab
  document.getElementById('runLstmBtn').addEventListener('click', onRunLSTM);
  document.getElementById('predExpiry').addEventListener('change', onPredExpiryChange);

  // SARIMAX tab
  document.getElementById('btnRunSarimax').addEventListener('click', onRunSarimax);

  // Hybrid tab
  document.getElementById('btnRunHybrid').addEventListener('click', onRunHybrid);

  // Sub-tab switching (works for all sub-tab navs)
  document.querySelectorAll('.sub-tabs').forEach(nav => {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.sub-tab');
      if (!btn) return;
      // Deactivate siblings
      nav.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      // Show matching sub-panel
      const parentPanel = nav.closest('.tab-panel');
      parentPanel.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(btn.dataset.subtab).classList.add('active');
    });
  });

  // Candlestick scan patterns button  
  document.getElementById('btnScanPatterns').addEventListener('click', onScanPatterns);

  // Day Trading Signals — slider value displays
  const sigSliders = [
    { id: 'sigShortMA', valId: 'sigShortMAVal' },
    { id: 'sigLongMA', valId: 'sigLongMAVal' },
    { id: 'sigRSIPeriod', valId: 'sigRSIPeriodVal' },
    { id: 'sigVolSpike', valId: 'sigVolSpikeVal' },
    { id: 'sigLookback', valId: 'sigLookbackVal' },
    { id: 'sigWMA', valId: 'sigWMAVal' },
    { id: 'sigWVol', valId: 'sigWVolVal' },
    { id: 'sigWCandle', valId: 'sigWCandleVal' },
    { id: 'sigWNews', valId: 'sigWNewsVal' },
    { id: 'sigWRSI', valId: 'sigWRSIVal' },
  ];
  sigSliders.forEach(({ id, valId }) => {
    const slider = document.getElementById(id);
    const valEl = document.getElementById(valId);
    if (slider && valEl) {
      slider.addEventListener('input', () => { valEl.textContent = slider.value; });
    }
  });
  document.getElementById('btnGenerateSignals').addEventListener('click', onGenerateSignals);

  // Render dashboard
  renderDashboard();

  // Auto-select first stock
  if (state.index.stocks.length > 0) {
    stockSel.value = state.index.stocks[0].code;
    onStockChange();
  }
}

// ============ Tab Navigation ============
function onTabClick(e) {
  const tab = e.target.closest('.tab');
  if (!tab) return;

  const tabName = tab.dataset.tab;
  if (tabName === state.currentTab) return;

  // Update tabs
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');

  // Update panels
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${tabName}`).classList.add('active');

  state.currentTab = tabName;

  // Trigger re-render for the new tab
  if (tabName === 'options-explorer' && state.currentStockData) {
    renderTrends();
    updatePredSelectors();
  }
  if (tabName === 'stock-analysis' && state.currentStockData) {
    updateCandleSelectors();
  }
}

// ============ Stock Change ============
async function onStockChange() {
  const code = document.getElementById('stockSelector').value;
  if (!code) return;

  state.currentStock = code;
  state.currentStockData = await loadStockData(code);

  // Update expiry selectors
  updateExpirySelectors();

  // Render views for current tab
  if (state.currentTab === 'options-explorer') {
    renderChain();
    renderTrends();
    updatePredSelectors();
  }
  if (state.currentTab === 'strategy') {
    onStrategyTypeChange();
  }
  if (state.currentTab === 'stock-analysis') {
    updateCandleSelectors();
  }
}

function onDateChange() {
  state.currentDate = document.getElementById('dateSelector').value;
  updateExpirySelectors();
  if (state.currentTab === 'options-explorer') renderChain();
  if (state.currentTab === 'strategy') onStrategyTypeChange();
}

function updateExpirySelectors() {
  if (!state.currentStockData || !state.currentDate) return;

  const expiries = getExpiries(state.currentStockData, state.currentDate);

  // Chain tab expiry
  const expSel = document.getElementById('expirySelector');
  expSel.innerHTML = expiries.map(e => `<option value="${e}">${e}</option>`).join('');
  if (expiries.length > 0) {
    expSel.value = expiries[0];
    if (state.currentTab === 'chain') renderChain();
  }

  // Strategy tab expiry
  const stratExpSel = document.getElementById('strategyExpiry');
  stratExpSel.innerHTML = expiries.map(e => `<option value="${e}">${e}</option>`).join('');
  if (expiries.length > 0) stratExpSel.value = expiries[0];

  // Trends tab expiry
  const trendExpSel = document.getElementById('trendExpiry');
  trendExpSel.innerHTML = expiries.map(e => `<option value="${e}">${e}</option>`).join('');
  if (expiries.length > 0) {
    trendExpSel.value = expiries[0];
    updateTrendStrikes();
  }
}

// ============ Dashboard ============
function renderDashboard() {
  const { stocks, dates } = state.index;

  // Stats
  const totalCallOI = stocks.reduce((s, st) => s + st.latestCallOI, 0);
  const totalPutOI = stocks.reduce((s, st) => s + st.latestPutOI, 0);
  const totalVol = stocks.reduce((s, st) => s + st.latestCallVol + st.latestPutVol, 0);

  document.getElementById('dashboardStats').innerHTML = `
    <div class="stat-card cyan animate-in" style="animation-delay: 0s">
      <div class="stat-label">Total Stocks</div>
      <div class="stat-value">${stocks.length}</div>
      <div class="stat-sub">${dates.length} trading days</div>
    </div>
    <div class="stat-card purple animate-in" style="animation-delay: 0.1s">
      <div class="stat-label">Call Open Interest</div>
      <div class="stat-value">${(totalCallOI / 1000).toFixed(0)}K</div>
      <div class="stat-sub">Latest: ${state.index.latestDate}</div>
    </div>
    <div class="stat-card pink animate-in" style="animation-delay: 0.2s">
      <div class="stat-label">Put Open Interest</div>
      <div class="stat-value">${(totalPutOI / 1000).toFixed(0)}K</div>
      <div class="stat-sub">P/C Ratio: ${(totalPutOI / totalCallOI).toFixed(3)}</div>
    </div>
    <div class="stat-card orange animate-in" style="animation-delay: 0.3s">
      <div class="stat-label">Total Volume</div>
      <div class="stat-value">${(totalVol / 1000).toFixed(0)}K</div>
      <div class="stat-sub">Contracts traded</div>
    </div>
  `;

  // Top stocks table
  const top20 = stocks.slice(0, 20);
  document.getElementById('topStocksTable').innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Stock</th>
          <th>Call OI</th>
          <th>Put OI</th>
          <th>Total OI</th>
          <th>P/C Ratio</th>
        </tr>
      </thead>
      <tbody>
        ${top20.map(s => `
          <tr class="clickable" data-stock="${s.code}">
            <td><strong>${s.code}</strong> <span style="color:var(--text-muted);font-size:0.7rem">${s.name}</span></td>
            <td class="call-col">${s.latestCallOI.toLocaleString()}</td>
            <td class="put-col">${s.latestPutOI.toLocaleString()}</td>
            <td>${s.totalOI.toLocaleString()}</td>
            <td>${s.latestCallOI > 0 ? (s.latestPutOI / s.latestCallOI).toFixed(3) : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Click stock row to select
  document.querySelectorAll('#topStocksTable .clickable').forEach(row => {
    row.addEventListener('click', () => {
      const code = row.dataset.stock;
      document.getElementById('stockSelector').value = code;
      onStockChange();
    });
  });

  // Market chart
  renderMarketChart('marketChart', stocks);
}

// ============ Options Chain ============
function onExpiryChange() {
  renderChain();
}

function renderChain() {
  if (!state.currentStockData || !state.currentDate) return;

  const expiry = document.getElementById('expirySelector').value;
  if (!expiry) return;

  const chain = getChain(state.currentStockData, state.currentDate, expiry);
  if (chain.length === 0) {
    document.getElementById('chainTableContainer').innerHTML =
      '<p class="placeholder-text">No data for this expiry</p>';
    return;
  }

  // Find ATM (approximate — use middle of chain)
  const strikes = chain.map(r => r.strike);
  const midStrike = strikes[Math.floor(strikes.length / 2)];
  const dte = daysToExpiry(expiry, state.currentDate);

  document.getElementById('chainInfo').innerHTML = `
    <span><strong>Strikes:</strong> ${strikes.length}</span>
    <span><strong>DTE:</strong> ${dte} days</span>
    <span><strong>Expiry:</strong> ${expiry}</span>
  `;

  const table = `
    <table class="chain-table">
      <thead>
        <tr>
          <th class="call-header">OI</th>
          <th class="call-header">Volume</th>
          <th class="call-header">Settle</th>
          <th class="call-header">Chg</th>
          <th class="strike-header">STRIKE</th>
          <th class="put-header">Chg</th>
          <th class="put-header">Settle</th>
          <th class="put-header">Volume</th>
          <th class="put-header">OI</th>
        </tr>
      </thead>
      <tbody>
        ${chain.map(row => {
    const isCallITM = row.call.settle > row.put.settle;
    return `
          <tr class="${isCallITM ? 'itm-call' : 'itm-put'}">
            <td class="call-cell">${row.call.net.toLocaleString()}</td>
            <td class="call-cell">${row.call.turnover || '—'}</td>
            <td class="call-cell" style="font-weight:600">${row.call.settle.toFixed(2)}</td>
            <td class="call-cell ${row.call.priceChg >= 0 ? 'positive' : 'negative'}">${row.call.priceChg >= 0 ? '+' : ''}${row.call.priceChg.toFixed(2)}</td>
            <td class="strike-cell">${row.strike}</td>
            <td class="put-cell ${row.put.priceChg >= 0 ? 'positive' : 'negative'}">${row.put.priceChg >= 0 ? '+' : ''}${row.put.priceChg.toFixed(2)}</td>
            <td class="put-cell" style="font-weight:600">${row.put.settle.toFixed(2)}</td>
            <td class="put-cell">${row.put.turnover || '—'}</td>
            <td class="put-cell">${row.put.net.toLocaleString()}</td>
          </tr>`;
  }).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('chainTableContainer').innerHTML = table;
}

// ============ Strategy Builder ============
function onStrategyTypeChange() {
  const stratType = document.getElementById('strategyType').value;
  const strategy = STRATEGIES[stratType];
  if (!strategy) return;

  onStrategyExpiryChange();
}

function onStrategyExpiryChange() {
  const stratType = document.getElementById('strategyType').value;
  const strategy = STRATEGIES[stratType];
  const expiry = document.getElementById('strategyExpiry').value;

  if (!strategy || !expiry || !state.currentStockData || !state.currentDate) return;

  const chain = getChain(state.currentStockData, state.currentDate, expiry);
  if (chain.length === 0) return;

  const strikes = chain.map(r => r.strike);
  const midIdx = Math.floor(strikes.length / 2);

  // Build leg configuration UI
  const legsDiv = document.getElementById('strategyLegs');
  legsDiv.innerHTML = strategy.legs.map((leg, i) => {
    if (leg.type === 'stock') {
      // Use ATM call settle as proxy for stock price
      const approxPrice = chain[midIdx]?.strike || 0;
      return `
        <div class="leg-config">
          <div class="leg-title">${leg.label}</div>
          <div class="form-group">
            <label>Entry Price</label>
            <input type="number" class="leg-strike" data-leg="${i}" value="${approxPrice}" step="0.01">
          </div>
        </div>
      `;
    }
    // Determine default strike based on leg position
    let defaultIdx = midIdx;
    if (strategy.legs.length > 1) {
      if (leg.label.includes('lower')) defaultIdx = Math.max(0, midIdx - 3);
      if (leg.label.includes('upper')) defaultIdx = Math.min(strikes.length - 1, midIdx + 3);
    }

    return `
      <div class="leg-config">
        <div class="leg-title">${leg.label}</div>
        <div class="form-group">
          <label>Strike</label>
          <select class="leg-strike" data-leg="${i}">
            ${strikes.map((s, si) => `<option value="${s}" ${si === defaultIdx ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Premium (settle)</label>
          <input type="number" class="leg-premium" data-leg="${i}" value="${(leg.type === 'call' ? chain[defaultIdx]?.call.settle : chain[defaultIdx]?.put.settle)?.toFixed(2) || 0}" step="0.01" readonly>
        </div>
      </div>
    `;
  }).join('');

  // Update premium when strike changes
  legsDiv.querySelectorAll('.leg-strike').forEach(sel => {
    sel.addEventListener('change', e => {
      const legIdx = parseInt(e.target.dataset.leg);
      const legDef = strategy.legs[legIdx];
      if (legDef.type === 'stock') return;
      const strike = parseFloat(e.target.value);
      const row = chain.find(r => Math.abs(r.strike - strike) < 0.001);
      if (row) {
        const premiumInput = legsDiv.querySelector(`.leg-premium[data-leg="${legIdx}"]`);
        if (premiumInput) {
          premiumInput.value = (legDef.type === 'call' ? row.call.settle : row.put.settle).toFixed(2);
        }
      }
    });
  });
}

function onBuildStrategy() {
  const stratType = document.getElementById('strategyType').value;
  const strategy = STRATEGIES[stratType];
  const expiry = document.getElementById('strategyExpiry').value;

  if (!strategy || !expiry || !state.currentStockData) return;

  const legsDiv = document.getElementById('strategyLegs');
  const legs = [];
  let spotPrice = 0;

  strategy.legs.forEach((legDef, i) => {
    const strikeEl = legsDiv.querySelector(`.leg-strike[data-leg="${i}"]`);
    const strike = parseFloat(strikeEl?.value || 0);

    if (legDef.type === 'stock') {
      spotPrice = strike;
      legs.push({ type: 'stock', direction: legDef.direction, strike, premium: 0 });
    } else {
      const premiumEl = legsDiv.querySelector(`.leg-premium[data-leg="${i}"]`);
      const premium = parseFloat(premiumEl?.value || 0);
      if (!spotPrice) spotPrice = strike; // fallback
      legs.push({ type: legDef.type, direction: legDef.direction, strike, premium });
    }
  });

  if (legs.length === 0 || spotPrice <= 0) return;

  // Calculate payoff
  const payoffData = calculatePayoff(legs, spotPrice);
  const metrics = strategyMetrics(legs, spotPrice);

  // Render payoff chart
  renderPayoffChart('payoffChart', payoffData, metrics.breakevens);

  // Render metrics
  document.getElementById('strategySummary').innerHTML = `
    <div class="metric"><span class="metric-label">Strategy</span><span class="metric-value">${strategy.name}</span></div>
    <div class="metric"><span class="metric-label">Max Profit</span><span class="metric-value positive">${metrics.maxProfit}</span></div>
    <div class="metric"><span class="metric-label">Max Loss</span><span class="metric-value negative">${metrics.maxLoss}</span></div>
    <div class="metric"><span class="metric-label">Breakeven</span><span class="metric-value">${metrics.breakevens.join(', ') || '—'}</span></div>
    <div class="metric"><span class="metric-label">Net Premium</span><span class="metric-value">${metrics.netPremium}</span></div>
    <div class="metric"><span class="metric-label">Risk/Reward</span><span class="metric-value">${metrics.riskReward}</span></div>
    <div class="metric"><span class="metric-label">Expiry</span><span class="metric-value">${expiry}</span></div>
    <div class="metric"><span class="metric-label">DTE</span><span class="metric-value">${daysToExpiry(expiry, state.currentDate)} days</span></div>
  `;

  // Greeks
  const T = daysToExpiry(expiry, state.currentDate) / 365;
  const r = 0.04; // ~4% risk-free rate
  const sigma = 0.3; // approximate
  const g = strategyGreeks(legs, spotPrice, T, r, sigma);

  document.getElementById('greeksDisplay').innerHTML = `
    <div class="greek-card"><div class="greek-symbol">Δ</div><div class="greek-value">${g.delta.toFixed(4)}</div><div class="greek-name">Delta</div></div>
    <div class="greek-card"><div class="greek-symbol">Γ</div><div class="greek-value">${g.gamma.toFixed(4)}</div><div class="greek-name">Gamma</div></div>
    <div class="greek-card"><div class="greek-symbol">Θ</div><div class="greek-value">${g.theta.toFixed(4)}</div><div class="greek-name">Theta</div></div>
    <div class="greek-card"><div class="greek-symbol">ν</div><div class="greek-value">${g.vega.toFixed(4)}</div><div class="greek-name">Vega</div></div>
  `;
}

// ============ Trends ============
function updateTrendStrikes() {
  const expiry = document.getElementById('trendExpiry').value;
  if (!expiry || !state.currentStockData || !state.currentDate) return;

  const chain = getChain(state.currentStockData, state.currentDate, expiry);
  const strikeSel = document.getElementById('trendStrike');
  strikeSel.innerHTML = chain.map(r =>
    `<option value="${r.strike}">${r.strike}</option>`
  ).join('');

  // Default to mid-strike
  if (chain.length > 0) {
    const midIdx = Math.floor(chain.length / 2);
    strikeSel.value = chain[midIdx].strike;
  }
}

function onTrendExpiryChange() {
  updateTrendStrikes();
  renderTrends();
}

function onTrendStrikeChange() {
  renderSettlement();
}

function renderTrends() {
  if (!state.currentStockData) return;

  // OI History
  const oiHistory = getOIHistory(state.currentStockData);
  renderOIChart('oiChart', oiHistory);
  renderPCRChart('pcrChart', oiHistory);
  renderVolumeChart('volumeChart', oiHistory);

  // Settlement history
  renderSettlement();
}

function renderSettlement() {
  if (!state.currentStockData) return;

  const expiry = document.getElementById('trendExpiry').value;
  const strike = parseFloat(document.getElementById('trendStrike').value);
  const type = document.getElementById('trendType').value;

  if (!expiry || isNaN(strike)) return;

  const series = getSettlementHistory(state.currentStockData, expiry, strike, type);
  if (series.length > 0) {
    renderSettlementChart('settlementChart', series);
  }
}

// ============ AI Prediction ============
function updatePredSelectors() {
  if (!state.currentStockData || !state.currentDate) return;

  const expiries = getExpiries(state.currentStockData, state.currentDate);
  const predExpSel = document.getElementById('predExpiry');
  predExpSel.innerHTML = expiries.map(e => `<option value="${e}">${e}</option>`).join('');
  if (expiries.length > 0) {
    predExpSel.value = expiries[0];
    onPredExpiryChange();
  }
}

function onPredExpiryChange() {
  const expiry = document.getElementById('predExpiry').value;
  if (!expiry || !state.currentStockData || !state.currentDate) return;

  const chain = getChain(state.currentStockData, state.currentDate, expiry);
  const strikeSel = document.getElementById('predStrike');
  strikeSel.innerHTML = chain.map(r =>
    `<option value="${r.strike}">${r.strike}</option>`
  ).join('');

  // Default to mid-strike (ATM proxy)
  if (chain.length > 0) {
    const midIdx = Math.floor(chain.length / 2);
    strikeSel.value = chain[midIdx].strike;
  }
}

async function onRunLSTM() {
  if (!state.currentStockData) return;

  const expiry = document.getElementById('predExpiry').value;
  const strike = parseFloat(document.getElementById('predStrike').value);
  const type = document.getElementById('predType').value;
  const lookback = parseInt(document.getElementById('predLookback').value);
  const forecastDays = parseInt(document.getElementById('predForecast').value);
  const epochs = parseInt(document.getElementById('predEpochs').value);

  if (!expiry || isNaN(strike)) return;

  // Gather settlement prices across all dates
  const dates = getDates(state.currentStockData);
  const prices = [];
  const priceDates = [];

  for (const date of dates) {
    const dateData = state.currentStockData.dates[date];
    if (!dateData || !dateData[expiry]) continue;
    const row = dateData[expiry].find(r => Math.abs(r.k - strike) < 0.001);
    if (!row) continue;
    const settle = type === 'call' ? row.c[4] : row.p[4];
    if (settle > 0) {
      prices.push(settle);
      priceDates.push(date);
    }
  }

  if (prices.length < lookback + 5) {
    document.getElementById('signalContent').innerHTML =
      `<p class="placeholder-text">Not enough data points (${prices.length}). Need at least ${lookback + 5}. Try a different strike or expiry.</p>`;
    return;
  }

  // UI: disable button, show progress
  const btn = document.getElementById('runLstmBtn');
  const btnText = document.getElementById('runLstmBtnText');
  const progressWrap = document.getElementById('progressWrap');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');

  btn.disabled = true;
  btnText.textContent = '⏳ Running AI Prediction...';
  progressWrap.style.display = 'block';
  progressBar.style.width = '0%';

  // Reset news and combined panels
  document.getElementById('newsContent').innerHTML = '<p class="placeholder-text">Loading news sentiment...</p>';
  document.getElementById('combinedSignalCard').style.display = 'none';

  try {
    // Run LSTM and News sentiment in parallel
    const [result, newsData] = await Promise.all([
      trainAndPredict(prices, { lookback, forecastDays, epochs }, (info) => {
        const pct = Math.round(info.progress * 100);
        progressBar.style.width = `${pct}%`;
        progressText.textContent = `Epoch ${info.epoch}/${info.totalEpochs} — Loss: ${info.loss.toFixed(6)}`;
      }),
      loadNewsData(state.currentStock)
    ]);

    // Generate forecast date labels
    const lastDate = priceDates[priceDates.length - 1];
    const forecastDateLabels = [];
    const lastD = new Date(lastDate);
    for (let i = 1; i <= forecastDays; i++) {
      const d = new Date(lastD);
      d.setDate(d.getDate() + i);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      forecastDateLabels.push(d.toISOString().split('T')[0]);
    }

    const alignedDates = priceDates.slice(lookback);
    renderPredictionChart('predictionChart', alignedDates, result.actual, result.fitted, forecastDateLabels, result.forecast);

    // LSTM Signal card
    document.getElementById('signalContent').innerHTML = `
      <div class="signal-badge ${result.signal}">${result.signalLabel}</div>
      <div class="confidence-meter">
        <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-muted);margin-bottom:4px">
          <span>Confidence</span><span>${result.confidence}%</span>
        </div>
        <div class="confidence-bar-bg">
          <div class="confidence-bar-fill ${result.signal}" style="width:${result.confidence}%"></div>
        </div>
      </div>
      <div class="signal-stats">
        <div class="signal-stat"><div class="ss-label">Current</div><div class="ss-value">$${result.currentPrice.toFixed(2)}</div></div>
        <div class="signal-stat"><div class="ss-label">Avg Forecast</div><div class="ss-value">$${result.avgForecast}</div></div>
        <div class="signal-stat"><div class="ss-label">Direction</div><div class="ss-value">${result.pctChange > 0 ? '+' : ''}${result.pctChange}%</div></div>
        <div class="signal-stat"><div class="ss-label">Horizon</div><div class="ss-value">${forecastDays}d</div></div>
      </div>`;

    // ===== News Sentiment =====
    const articles = newsData ? newsData.articles : [];
    const newsResult = analyzeSentiment(articles);
    renderNewsSentiment(newsResult, newsData);

    // ===== Combined Signal =====
    if (articles.length > 0) {
      const combined = combinedSignal(result, newsResult);
      renderCombinedSignal(combined, result, newsResult);
    }

    // Strategy recommendation (use combined signal if available, else LSTM)
    const strat = result.strategy;
    document.getElementById('predStrategyContent').innerHTML = `
      <div class="pred-strategy-badge">🎯 ${strat.name}</div>
      <p class="pred-strategy-desc">${strat.description}</p>
      <div class="pred-strategy-action">${strat.action}</div>`;

    // Auto-build payoff for recommended strategy
    const chain = getChain(state.currentStockData, state.currentDate, expiry);
    if (chain.length > 0 && STRATEGIES[strat.type]) {
      const midIdx = chain.findIndex(r => Math.abs(r.strike - strike) < 0.001) || Math.floor(chain.length / 2);
      const stratDef = STRATEGIES[strat.type];
      const legs = stratDef.legs.map((legDef) => {
        if (legDef.type === 'stock') {
          return { type: 'stock', direction: legDef.direction, strike: chain[midIdx].strike, premium: 0 };
        }
        let strikeIdx = midIdx;
        if (legDef.direction === 'short' && legDef.type === 'call') strikeIdx = Math.min(chain.length - 1, midIdx + 3);
        if (legDef.direction === 'long' && legDef.type === 'put') strikeIdx = Math.max(0, midIdx - 3);
        if (legDef.direction === 'short' && legDef.type === 'put') strikeIdx = Math.max(0, midIdx - 3);
        if (legDef.direction === 'long' && legDef.type === 'call') strikeIdx = Math.min(chain.length - 1, midIdx + 3);
        const premium = legDef.type === 'call' ? chain[strikeIdx].call.settle : chain[strikeIdx].put.settle;
        return { type: legDef.type, direction: legDef.direction, strike: chain[strikeIdx].strike, premium };
      });
      const payoffData = calculatePayoff(legs, chain[midIdx].strike);
      const metrics = strategyMetrics(legs, chain[midIdx].strike);
      renderPayoffChart('predPayoffChart', payoffData, metrics.breakevens);
    }

    // Model metrics
    const m = result.metrics;
    document.getElementById('modelMetrics').innerHTML = `
      <div class="model-metrics-grid">
        <div class="metric-item"><div class="mi-label">Architecture</div><div class="mi-value">LSTM(32) → Dense(16) → Dense(1)</div></div>
        <div class="metric-item"><div class="mi-label">Training Time</div><div class="mi-value">${m.trainingTime}s</div></div>
        <div class="metric-item"><div class="mi-label">Lookback</div><div class="mi-value">${m.lookback} days</div></div>
        <div class="metric-item"><div class="mi-label">Forecast</div><div class="mi-value">${m.forecastDays} days</div></div>
        <div class="metric-item"><div class="mi-label">Epochs</div><div class="mi-value">${m.epochs}</div></div>
        <div class="metric-item"><div class="mi-label">Final Loss</div><div class="mi-value">${m.finalLoss}</div></div>
        <div class="metric-item"><div class="mi-label">Val Loss</div><div class="mi-value">${m.finalValLoss}</div></div>
        <div class="metric-item"><div class="mi-label">RMSE</div><div class="mi-value">${m.rmse}</div></div>
      </div>`;

    progressText.textContent = '✅ Complete!';
  } catch (err) {
    console.error('LSTM error:', err);
    document.getElementById('signalContent').innerHTML =
      `<p class="placeholder-text" style="color:var(--accent-red)">Error: ${err.message}</p>`;
    progressText.textContent = '❌ Failed';
  } finally {
    btn.disabled = false;
    btnText.textContent = '⚡ Run AI Prediction';
  }
}

// ============ News Sentiment Rendering ============
function renderNewsSentiment(newsResult, newsData) {
  const el = document.getElementById('newsContent');
  if (!newsData || newsResult.articles.length === 0) {
    el.innerHTML = '<p class="placeholder-text">No news available for this stock</p>';
    return;
  }

  const summaryBar = `
    <div class="news-summary-bar">
      <div class="news-summary-item"><div class="nsi-count" style="color:var(--accent-green)">${newsResult.bullishCount}</div><div class="nsi-label">Bullish</div></div>
      <div class="news-summary-item"><div class="nsi-count" style="color:var(--accent-orange)">${newsResult.neutralCount}</div><div class="nsi-label">Neutral</div></div>
      <div class="news-summary-item"><div class="nsi-count" style="color:var(--accent-red)">${newsResult.bearishCount}</div><div class="nsi-label">Bearish</div></div>
    </div>`;

  const signalBadge = `<div class="signal-badge ${newsResult.signal}" style="margin-bottom:12px;text-align:center">${newsResult.signalLabel} (${newsResult.confidence}%)</div>`;

  const articlesList = newsResult.articles.map(a => {
    const scoreClass = a.score > 0 ? 'positive' : a.score < 0 ? 'negative' : 'zero';
    const scoreLabel = a.score > 0 ? `+${a.score}` : `${a.score}`;
    const linkHtml = a.link ? `<a href="${a.link}" target="_blank" rel="noopener">${a.title}</a>` : a.title;
    const publisher = a.publisher || 'Unknown';
    return `
      <div class="news-article">
        <div class="news-sentiment-dot ${a.sentiment}"></div>
        <div class="news-article-body">
          <div class="news-title">${linkHtml}</div>
          <div class="news-meta">${publisher}</div>
        </div>
        <div class="news-score ${scoreClass}">${scoreLabel}</div>
      </div>`;
  }).join('');

  el.innerHTML = signalBadge + summaryBar + articlesList;
}

function renderCombinedSignal(combined, lstmResult, newsResult) {
  const card = document.getElementById('combinedSignalCard');
  card.style.display = 'block';
  document.getElementById('combinedSignalContent').innerHTML = `
    <div class="combined-signal-row">
      <div class="combined-badge ${combined.signal}">${combined.signalLabel} (${combined.confidence}%)</div>
      <div class="combined-details">
        <div class="combined-rationale">${combined.rationale}</div>
        <div class="combined-sources">
          <span>🧠 LSTM: ${lstmResult.signal} (${lstmResult.confidence}%)</span>
          <span>📰 News: ${newsResult.signal} (${newsResult.confidence}%)</span>
        </div>
      </div>
    </div>`;
}

// ============ Candlestick Tab ============
function updateCandleSelectors() {
  if (!state.currentStockData) return;
  const expiries = getExpiries(state.currentStockData, state.currentDate);
  const expSel = document.getElementById('candleExpiry');
  const strikeSel = document.getElementById('candleStrike');

  expSel.innerHTML = expiries.map(e => `<option value="${e}">${e}</option>`).join('');

  // Populate strikes for first expiry
  onCandleExpiryChange();

  // Wire up events
  expSel.onchange = onCandleExpiryChange;
  document.getElementById('candleType').onchange = onCandleExpiryChange;
  // Candlestick scan button already bound in init()
}

function onCandleExpiryChange() {
  const expiry = document.getElementById('candleExpiry').value;
  const type = document.getElementById('candleType').value;
  if (!expiry || !state.currentStockData) return;

  const chain = getChain(state.currentStockData, state.currentDate, expiry);
  const strikes = [...new Set(chain.filter(r => {
    const opt = r[type];
    return opt && opt.settle > 0;
  }).map(r => r.strike))].sort((a, b) => a - b);
  const strikeSel = document.getElementById('candleStrike');
  strikeSel.innerHTML = strikes.map(s => `<option value="${s}">${s}</option>`).join('');
}

function onScanPatterns() {
  const expiry = document.getElementById('candleExpiry').value;
  const strike = parseFloat(document.getElementById('candleStrike').value);
  const type = document.getElementById('candleType').value;

  if (!expiry || !strike || !state.currentStockData) return;

  // Build settlement series for this option
  const history = getSettlementHistory(state.currentStockData, expiry, strike, type);
  if (!history || history.length < 3) {
    document.getElementById('patternList').innerHTML = '<p class="placeholder-text">Not enough data points for pattern detection (need 3+)</p>';
    return;
  }

  // Build OHLC
  const ohlc = buildOHLC(history);
  if (ohlc.length < 2) {
    document.getElementById('patternList').innerHTML = '<p class="placeholder-text">Not enough OHLC data</p>';
    return;
  }

  // Detect patterns
  const patterns = detectPatterns(ohlc);

  // Render chart
  document.getElementById('candlePlaceholder').style.display = 'none';
  renderCandlestickChart('candlestickChart', ohlc, patterns);

  // Render pattern list
  const listEl = document.getElementById('patternList');
  if (patterns.length === 0) {
    listEl.innerHTML = '<p class="placeholder-text">No patterns detected in this price series</p>';
  } else {
    const signalColors = { bullish: 'var(--accent-green)', bearish: 'var(--accent-red)', reversal: 'var(--accent-orange)' };
    listEl.innerHTML = `
      <div class="pattern-count">${patterns.length} pattern${patterns.length > 1 ? 's' : ''} detected</div>
      <div class="pattern-items">
        ${patterns.map(p => `
          <div class="pattern-item">
            <span class="pattern-emoji">${p.emoji}</span>
            <span class="pattern-name">${p.name}</span>
            <span class="pattern-signal" style="color:${signalColors[p.signal]}">${p.signal.toUpperCase()}</span>
            <span class="pattern-date">${p.date}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Backtest
  const backtest = backtestPatterns(ohlc, patterns, 3);
  const btEl = document.getElementById('backtestResults');

  if (backtest.summary.total === 0) {
    btEl.innerHTML = '<p class="placeholder-text">No tradable signals to backtest</p>';
  } else {
    const winColor = backtest.summary.winRate >= 50 ? 'var(--accent-green)' : 'var(--accent-red)';
    const returnColor = backtest.summary.avgReturn >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    let patTable = '';
    for (const [name, info] of Object.entries(backtest.byPattern)) {
      const wr = info.total ? ((info.wins / info.total) * 100).toFixed(0) : 0;
      const wrColor = wr >= 50 ? 'var(--accent-green)' : 'var(--accent-red)';
      patTable += `<tr>
        <td>${info.emoji} ${name}</td>
        <td style="color:${info.signal === 'bullish' ? 'var(--accent-green)' : 'var(--accent-red)'}">${info.signal}</td>
        <td>${info.total}</td>
        <td style="color:${wrColor}">${wr}%</td>
        <td style="color:${info.totalReturn >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${info.totalReturn.toFixed(2)}%</td>
      </tr>`;
    }

    btEl.innerHTML = `
      <div class="backtest-summary">
        <div class="bt-stat">
          <span class="bt-label">Signals</span>
          <span class="bt-value">${backtest.summary.total}</span>
        </div>
        <div class="bt-stat">
          <span class="bt-label">Win Rate</span>
          <span class="bt-value" style="color:${winColor}">${backtest.summary.winRate}%</span>
        </div>
        <div class="bt-stat">
          <span class="bt-label">Avg Return</span>
          <span class="bt-value" style="color:${returnColor}">${backtest.summary.avgReturn}%</span>
        </div>
        <div class="bt-stat">
          <span class="bt-label">Hold Period</span>
          <span class="bt-value">3 days</span>
        </div>
      </div>
      <table class="bt-table">
        <thead><tr><th>Pattern</th><th>Signal</th><th>Count</th><th>Win Rate</th><th>Total Return</th></tr></thead>
        <tbody>${patTable}</tbody>
      </table>
    `;
  }
}

// ============ SARIMAX Tab ============
async function onRunSarimax() {
  const btn = document.getElementById('btnRunSarimax');
  const noteEl = document.getElementById('sarimaxChartNote');
  const compEl = document.getElementById('sarimaxComparison');
  const sentEl = document.getElementById('sarimaxSentiment');
  const horizon = parseInt(document.getElementById('sarimaxHorizon').value) || 10;

  if (!state.currentStock) {
    noteEl.textContent = 'Please select a stock first.';
    return;
  }

  // Show loading state
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border:2px solid rgba(99,102,241,0.3);border-top-color:var(--accent-primary);border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block"></div> Running...';
  noteEl.innerHTML = '<div class="sarimax-loading"><div class="spinner"></div>Loading price data and running SARIMAX models... This may take a moment.</div>';
  compEl.style.display = 'none';
  sentEl.style.display = 'none';

  try {
    // Load price data
    const priceData = await loadPriceData(state.currentStock);
    if (!priceData || !priceData.prices || priceData.prices.length < 30) {
      noteEl.textContent = `No price data available for ${state.currentStock}. Please run fetch_prices.py first.`;
      return;
    }

    // Load news (may be null)
    const newsData = await loadNewsData(state.currentStock);
    const articles = newsData?.articles || [];

    noteEl.innerHTML = '<div class="sarimax-loading"><div class="spinner"></div>Training SARIMAX models and generating forecasts...</div>';

    // Small delay to let UI update
    await new Promise(r => setTimeout(r, 50));

    // Run full pipeline
    const result = await runFullPipeline(priceData, articles, horizon);

    // Render chart
    renderSarimaxChart('sarimaxChart', result);

    // Update note
    const lastDate = result.priceDates[result.priceDates.length - 1];
    const ticker = priceData.ticker || state.currentStock;
    noteEl.textContent = `${state.currentStock} (${ticker}) — ${result.closePrices.length} days of history. Last: $${result.closePrices[result.closePrices.length - 1].toFixed(2)} on ${lastDate}. Forecasting ${horizon} days ahead.`;

    // Update comparison metrics (null values displayed as N/A)
    const fmtMetric = (v, prefix, suffix) => v !== null ? `${prefix}${v}${suffix}` : 'N/A';
    document.getElementById('enhMAE').textContent = fmtMetric(result.enhanced.mae, '$', '');
    document.getElementById('enhRMSE').textContent = fmtMetric(result.enhanced.rmse, '$', '');
    document.getElementById('enhMAPE').textContent = fmtMetric(result.enhanced.mape, '', '%');
    document.getElementById('tradMAE').textContent = fmtMetric(result.traditional.mae, '$', '');
    document.getElementById('tradRMSE').textContent = fmtMetric(result.traditional.rmse, '$', '');
    document.getElementById('tradMAPE').textContent = fmtMetric(result.traditional.mape, '', '%');
    compEl.style.display = '';

    // Highlight winner (only if both have valid MAE)
    const enhBetter = result.enhanced.mae !== null && result.traditional.mae !== null && result.enhanced.mae <= result.traditional.mae;
    const tradBetter = result.enhanced.mae !== null && result.traditional.mae !== null && result.traditional.mae < result.enhanced.mae;
    document.getElementById('enhMAE').style.color = enhBetter ? 'var(--accent-green)' : '';
    document.getElementById('tradMAE').style.color = tradBetter ? 'var(--accent-green)' : '';

    // Update sentiment summary
    document.getElementById('sentBull').textContent = result.sentiment.bullDays;
    document.getElementById('sentBear').textContent = result.sentiment.bearDays;
    document.getElementById('sentNeut').textContent = result.sentiment.neutralDays;
    document.getElementById('sentTotal').textContent = result.sentiment.total;
    sentEl.style.display = '';

  } catch (err) {
    console.error('SARIMAX error:', err);
    noteEl.textContent = `Error: ${err.message}. Check console for details.`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="tab-icon">⚡</span> Run Prediction';
  }
}

// ============ Hybrid SARIMAX+LSTM ============

async function onRunHybrid() {
  const btn = document.getElementById('btnRunHybrid');
  const noteEl = document.getElementById('hybridChartNote');
  const compEl = document.getElementById('hybridComparison');
  const horizon = parseInt(document.getElementById('hybridHorizon').value) || 10;

  if (!state.currentStock) {
    noteEl.textContent = 'Please select a stock first.';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border:2px solid rgba(78,121,167,0.25);border-top-color:#4E79A7;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block"></div> Running...';
  noteEl.innerHTML = '<div class="eq-loading"><div class="spinner"></div>Loading data and training Hybrid SARIMAX+LSTM model... This includes LSTM training and may take a moment.</div>';
  compEl.style.display = 'none';

  try {
    const priceData = await loadPriceData(state.currentStock);
    if (!priceData || !priceData.prices || priceData.prices.length < 30) {
      noteEl.textContent = `No price data available for ${state.currentStock}. Run fetch_prices.py first.`;
      return;
    }

    const newsData = await loadNewsData(state.currentStock);
    const articles = newsData?.articles || [];

    noteEl.innerHTML = '<div class="eq-loading"><div class="spinner"></div>Training SARIMAX + LSTM residual model...</div>';
    await new Promise(r => setTimeout(r, 50));

    const result = await runHybridPipeline(priceData, articles, horizon);

    // Render chart
    renderHybridChart('hybridChart', result);

    // Update note
    const lastDate = result.priceDates[result.priceDates.length - 1];
    noteEl.textContent = `${state.currentStock} — ${result.closePrices.length} days of history. Last: $${result.closePrices[result.closePrices.length - 1].toFixed(2)} on ${lastDate}. Forecasting ${horizon} days.`;

    // Display three-model metrics
    const fmt = (v, pre, suf) => v !== null ? `${pre}${v}${suf}` : 'N/A';
    document.getElementById('hybMAE').textContent = fmt(result.hybrid.mae, '$', '');
    document.getElementById('hybRMSE').textContent = fmt(result.hybrid.rmse, '$', '');
    document.getElementById('hybMAPE').textContent = fmt(result.hybrid.mape, '', '%');
    document.getElementById('hybSarMAE').textContent = fmt(result.sarimax.mae, '$', '');
    document.getElementById('hybSarRMSE').textContent = fmt(result.sarimax.rmse, '$', '');
    document.getElementById('hybSarMAPE').textContent = fmt(result.sarimax.mape, '', '%');
    document.getElementById('hybTradMAE').textContent = fmt(result.traditional.mae, '$', '');
    document.getElementById('hybTradRMSE').textContent = fmt(result.traditional.rmse, '$', '');
    document.getElementById('hybTradMAPE').textContent = fmt(result.traditional.mape, '', '%');
    compEl.style.display = '';

  } catch (err) {
    console.error('Hybrid model error:', err);
    noteEl.textContent = `Error: ${err.message}. Check console for details.`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '⚡ Run Hybrid Model';
  }
}

// ============ Day Trading Signals ============
async function onGenerateSignals() {
  const btn = document.getElementById('btnGenerateSignals');
  btn.disabled = true;
  btn.innerHTML = '⏳ Analyzing...';

  try {
    // 1. Load price data
    const priceData = await loadPriceData(state.currentStock);
    if (!priceData || !priceData.prices || priceData.prices.length < 10) {
      document.getElementById('signalOutput').style.display = 'block';
      document.getElementById('signalBadge').innerHTML = '<p class="placeholder-text">No price data available for this stock</p>';
      return;
    }

    // 2. Read config from sliders
    const lookback = parseInt(document.getElementById('sigLookback').value) || 90;
    const prices = priceData.prices.slice(-lookback);

    const config = {
      maType: document.getElementById('sigMAType').value,
      shortMAPeriod: parseInt(document.getElementById('sigShortMA').value) || 10,
      longMAPeriod: parseInt(document.getElementById('sigLongMA').value) || 30,
      rsiPeriod: parseInt(document.getElementById('sigRSIPeriod').value) || 14,
      volumeSpikeThreshold: parseFloat(document.getElementById('sigVolSpike').value) || 1.5,
      weights: {
        ma: parseInt(document.getElementById('sigWMA').value) || 0,
        volume: parseInt(document.getElementById('sigWVol').value) || 0,
        candle: parseInt(document.getElementById('sigWCandle').value) || 0,
        news: parseInt(document.getElementById('sigWNews').value) || 0,
        rsi: parseInt(document.getElementById('sigWRSI').value) || 0,
      },
    };

    // 3. Load news data for sentiment
    const newsData = await loadNewsData(state.currentStock);
    const sentimentResult = analyzeSentiment(newsData ? newsData.articles || [] : []);

    // 4. Generate signals
    const result = generateSignals(prices, sentimentResult, config);

    // 5. Render output
    document.getElementById('signalOutput').style.display = 'block';

    // Badge
    const badgeCard = document.getElementById('signalBadgeCard');
    badgeCard.className = 'card card-' + result.composite.signal.replace('_', '-');
    document.getElementById('signalBadge').innerHTML = `
      <div class="${result.composite.cssClass}">
        <div class="signal-badge-label">${result.composite.label}</div>
        <div class="signal-badge-score">Composite Score: ${result.composite.score.toFixed(3)}</div>
        <div class="signal-badge-confidence">Confidence: ${result.composite.confidence}% — ${prices.length} trading days analyzed</div>
      </div>
    `;

    // Chart
    renderSignalChart('signalChartCanvas', result);

    // Indicator breakdown
    const indEl = document.getElementById('signalIndicators');
    const indicatorMeta = [
      { key: 'ma', icon: '📊', name: 'Moving Average Crossover' },
      { key: 'volume', icon: '📦', name: 'Volume Analysis' },
      { key: 'candle', icon: '🕯️', name: 'Candlestick Patterns' },
      { key: 'news', icon: '📰', name: 'News Sentiment' },
      { key: 'rsi', icon: '📈', name: 'RSI' },
    ];
    indEl.innerHTML = indicatorMeta.map(({ key, icon, name }) => {
      const ind = result.indicators[key];
      const scoreClass = ind.score > 0.15 ? 'score-bullish' : ind.score < -0.15 ? 'score-bearish' : 'score-neutral';
      const scoreLabel = ind.score > 0.15 ? 'BULLISH' : ind.score < -0.15 ? 'BEARISH' : 'NEUTRAL';
      const barWidth = Math.min(Math.abs(ind.score) * 50, 50);
      const barClass = ind.score >= 0 ? 'positive' : 'negative';
      return `
        <div class="signal-indicator-card">
          <div class="signal-indicator-header">
            <span class="signal-indicator-name">${icon} ${name}</span>
            <span class="signal-indicator-score ${scoreClass}">${scoreLabel} (${ind.score.toFixed(2)})</span>
          </div>
          <div class="signal-indicator-detail">${ind.detail}</div>
          <div class="signal-indicator-weight">Weight: ${ind.weight}%</div>
          <div class="signal-score-bar">
            <div class="signal-score-fill ${barClass}" style="width:${barWidth}%"></div>
          </div>
        </div>
      `;
    }).join('');

    // Signal log (crossovers)
    const logEl = document.getElementById('signalLog');
    const crossovers = result.indicators.ma.crossovers || [];
    if (crossovers.length === 0) {
      logEl.innerHTML = '<div class="signal-log-empty">No MA crossover signals detected in the lookback period</div>';
    } else {
      logEl.innerHTML = crossovers.slice().reverse().map(c => {
        const isGolden = c.type === 'golden_cross';
        const d = result.ohlc[c.index];
        return `
          <div class="signal-log-item">
            <span class="signal-log-type ${isGolden ? 'log-golden' : 'log-death'}">${isGolden ? '🟡 Golden' : '💀 Death'}</span>
            <span class="signal-log-date">${d ? d.date : '—'}</span>
            <span class="signal-log-price">${d ? 'HKD ' + d.close.toFixed(1) : ''}</span>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('Signal generation error:', err);
    document.getElementById('signalOutput').style.display = 'block';
    document.getElementById('signalBadge').innerHTML = `<p class="placeholder-text">Error: ${err.message}</p>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔍 Generate Signals';
  }
}

// ============ Boot ============
init().catch(err => {
  console.error('Failed to initialize:', err);
  document.getElementById('app').innerHTML = `
    <div style="text-align:center;padding:4rem">
      <h2>Failed to load data</h2>
      <p style="color:var(--text-muted)">${err.message}</p>
    </div>
  `;
});
