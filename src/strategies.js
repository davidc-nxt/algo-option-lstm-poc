/**
 * Option Strategy Definitions and Payoff Calculator
 */
import { greeks as calcGreeks } from './blackscholes.js';

// Strategy definitions
export const STRATEGIES = {
    'covered-call': {
        name: 'Covered Call',
        description: 'Long stock + short call. Income strategy with capped upside.',
        legs: [
            { type: 'stock', direction: 'long', label: 'Long Stock' },
            { type: 'call', direction: 'short', label: 'Short Call (strike)' }
        ]
    },
    'protective-put': {
        name: 'Protective Put',
        description: 'Long stock + long put. Downside protection with unlimited upside.',
        legs: [
            { type: 'stock', direction: 'long', label: 'Long Stock' },
            { type: 'put', direction: 'long', label: 'Long Put (strike)' }
        ]
    },
    'collar': {
        name: 'Collar',
        description: 'Long stock + long put + short call. Limited risk and reward.',
        legs: [
            { type: 'stock', direction: 'long', label: 'Long Stock' },
            { type: 'put', direction: 'long', label: 'Long Put (lower strike)' },
            { type: 'call', direction: 'short', label: 'Short Call (upper strike)' }
        ]
    },
    'bull-spread': {
        name: 'Bull Call Spread',
        description: 'Long call at lower strike + short call at higher strike. Bullish with limited risk.',
        legs: [
            { type: 'call', direction: 'long', label: 'Long Call (lower strike)' },
            { type: 'call', direction: 'short', label: 'Short Call (upper strike)' }
        ]
    },
    'bear-spread': {
        name: 'Bear Put Spread',
        description: 'Long put at higher strike + short put at lower strike. Bearish with limited risk.',
        legs: [
            { type: 'put', direction: 'long', label: 'Long Put (upper strike)' },
            { type: 'put', direction: 'short', label: 'Short Put (lower strike)' }
        ]
    },
    'straddle': {
        name: 'Long Straddle',
        description: 'Long call + long put at same strike. Profits from large moves in either direction.',
        legs: [
            { type: 'call', direction: 'long', label: 'Long Call (strike)' },
            { type: 'put', direction: 'long', label: 'Long Put (same strike)' }
        ]
    },
    'strangle': {
        name: 'Long Strangle',
        description: 'Long OTM call + long OTM put. Cheaper than straddle, needs bigger move.',
        legs: [
            { type: 'put', direction: 'long', label: 'Long Put (lower strike)' },
            { type: 'call', direction: 'long', label: 'Long Call (upper strike)' }
        ]
    }
};

/**
 * Calculate payoff at expiration for a single leg
 */
function legPayoff(S, leg) {
    const { type, direction, strike, premium } = leg;
    const mult = direction === 'long' ? 1 : -1;

    if (type === 'stock') {
        return mult * (S - strike); // strike = entry price
    } else if (type === 'call') {
        const intrinsic = Math.max(0, S - strike);
        return mult * (intrinsic - premium);
    } else if (type === 'put') {
        const intrinsic = Math.max(0, strike - S);
        return mult * (intrinsic - premium);
    }
    return 0;
}

/**
 * Calculate full payoff curve
 * @param {Array} legs - [{type, direction, strike, premium}]
 * @param {number} spotPrice - Current stock price for range calculation
 * @param {number} [points=100] - Number of price points
 */
export function calculatePayoff(legs, spotPrice, points = 100) {
    const minPrice = spotPrice * 0.5;
    const maxPrice = spotPrice * 1.5;
    const step = (maxPrice - minPrice) / points;

    const data = [];
    for (let i = 0; i <= points; i++) {
        const price = minPrice + i * step;
        let totalPayoff = 0;
        for (const leg of legs) {
            totalPayoff += legPayoff(price, leg);
        }
        data.push({ price: Math.round(price * 100) / 100, payoff: Math.round(totalPayoff * 100) / 100 });
    }
    return data;
}

/**
 * Calculate strategy metrics
 */
export function strategyMetrics(legs, spotPrice) {
    const payoff = calculatePayoff(legs, spotPrice, 200);

    const maxProfit = Math.max(...payoff.map(p => p.payoff));
    const maxLoss = Math.min(...payoff.map(p => p.payoff));

    // Find breakeven points (where payoff crosses zero)
    const breakevens = [];
    for (let i = 1; i < payoff.length; i++) {
        if ((payoff[i - 1].payoff <= 0 && payoff[i].payoff > 0) ||
            (payoff[i - 1].payoff >= 0 && payoff[i].payoff < 0)) {
            // Linear interpolation
            const p1 = payoff[i - 1], p2 = payoff[i];
            const be = p1.price + (0 - p1.payoff) * (p2.price - p1.price) / (p2.payoff - p1.payoff);
            breakevens.push(Math.round(be * 100) / 100);
        }
    }

    // Net premium
    let netPremium = 0;
    for (const leg of legs) {
        if (leg.type !== 'stock') {
            netPremium += (leg.direction === 'long' ? -1 : 1) * leg.premium;
        }
    }

    return {
        maxProfit: maxProfit > 10000 ? 'Unlimited' : maxProfit.toFixed(2),
        maxLoss: maxLoss < -10000 ? 'Unlimited' : maxLoss.toFixed(2),
        breakevens,
        netPremium: netPremium.toFixed(2),
        riskReward: maxLoss !== 0 ? Math.abs(maxProfit / maxLoss).toFixed(2) : '∞'
    };
}

/**
 * Aggregate Greeks for a strategy
 */
export function strategyGreeks(legs, S, T, r, sigma) {
    let totalDelta = 0, totalGamma = 0, totalTheta = 0, totalVega = 0;

    for (const leg of legs) {
        const mult = leg.direction === 'long' ? 1 : -1;

        if (leg.type === 'stock') {
            totalDelta += mult;
        } else {
            const g = calcGreeks(S, leg.strike, T, r, sigma, leg.type);
            totalDelta += mult * g.delta;
            totalGamma += mult * g.gamma;
            totalTheta += mult * g.theta;
            totalVega += mult * g.vega;
        }
    }

    return {
        delta: totalDelta,
        gamma: totalGamma,
        theta: totalTheta,
        vega: totalVega
    };
}
