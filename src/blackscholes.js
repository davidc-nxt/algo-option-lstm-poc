/**
 * Black-Scholes pricing model and Greeks calculator
 */

// Standard normal CDF (Abramowitz & Stegun approximation)
function normcdf(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
}

// Standard normal PDF
function normpdf(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Black-Scholes option price
 * @param {number} S - Current stock price
 * @param {number} K - Strike price
 * @param {number} T - Time to expiry in years
 * @param {number} r - Risk-free rate
 * @param {number} sigma - Volatility
 * @param {string} type - 'call' or 'put'
 */
export function blackScholes(S, K, T, r, sigma, type = 'call') {
    if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;

    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    if (type === 'call') {
        return S * normcdf(d1) - K * Math.exp(-r * T) * normcdf(d2);
    } else {
        return K * Math.exp(-r * T) * normcdf(-d2) - S * normcdf(-d1);
    }
}

/**
 * Calculate Greeks
 */
export function greeks(S, K, T, r, sigma, type = 'call') {
    if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
        return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    }

    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const nd1 = normpdf(d1);

    let delta, theta, rho;

    if (type === 'call') {
        delta = normcdf(d1);
        theta = (-S * nd1 * sigma / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normcdf(d2)) / 365;
        rho = K * T * Math.exp(-r * T) * normcdf(d2) / 100;
    } else {
        delta = normcdf(d1) - 1;
        theta = (-S * nd1 * sigma / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normcdf(-d2)) / 365;
        rho = -K * T * Math.exp(-r * T) * normcdf(-d2) / 100;
    }

    const gamma = nd1 / (S * sigma * Math.sqrt(T));
    const vega = S * nd1 * Math.sqrt(T) / 100;

    return { delta, gamma, theta, vega, rho };
}

/**
 * Implied volatility solver (Newton-Raphson)
 */
export function impliedVolatility(marketPrice, S, K, T, r, type = 'call') {
    if (T <= 0 || marketPrice <= 0) return NaN;

    let sigma = 0.3; // Initial guess

    for (let i = 0; i < 100; i++) {
        const price = blackScholes(S, K, T, r, sigma, type);
        const diff = price - marketPrice;

        if (Math.abs(diff) < 0.0001) return sigma;

        // Vega
        const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        const vega = S * normpdf(d1) * Math.sqrt(T);

        if (vega < 0.0001) break; // avoid division by near-zero

        sigma -= diff / vega;
        if (sigma <= 0.001) sigma = 0.001;
        if (sigma > 5) sigma = 5;
    }

    return sigma;
}

/**
 * Calculate days until expiry
 */
export function daysToExpiry(expiryStr, fromDate) {
    const exp = new Date(expiryStr);
    const from = fromDate ? new Date(fromDate) : new Date();
    const diffMs = exp - from;
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
