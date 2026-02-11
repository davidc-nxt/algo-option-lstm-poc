/**
 * Lexicon-based financial sentiment analysis
 * Runs in the browser on pre-fetched news data
 */

// Financial sentiment lexicon with weighted keywords
const BULLISH_WORDS = {
    // Strong bullish
    'surge': 3, 'soar': 3, 'rally': 3, 'breakout': 3, 'record high': 3,
    'skyrocket': 3, 'boom': 3, 'outperform': 3, 'beat expectations': 3,
    // Medium bullish
    'gain': 2, 'rise': 2, 'climb': 2, 'jump': 2, 'upgrade': 2,
    'profit': 2, 'growth': 2, 'recovery': 2, 'strong': 2, 'bullish': 2,
    'optimistic': 2, 'exceeds': 2, 'positive': 2, 'dividend': 2,
    'buyback': 2, 'buy': 2, 'accumulate': 2, 'outperform': 2,
    // Mild bullish
    'up': 1, 'higher': 1, 'improve': 1, 'advance': 1, 'recover': 1,
    'expansion': 1, 'opportunity': 1, 'momentum': 1, 'demand': 1,
    'upbeat': 1, 'robust': 1, 'resilient': 1, 'innovation': 1,
};

const BEARISH_WORDS = {
    // Strong bearish
    'crash': -3, 'plunge': -3, 'collapse': -3, 'crisis': -3, 'bankrupt': -3,
    'default': -3, 'fraud': -3, 'scandal': -3, 'lawsuit': -3,
    // Medium bearish
    'fall': -2, 'drop': -2, 'decline': -2, 'loss': -2, 'downgrade': -2,
    'bearish': -2, 'weak': -2, 'miss expectations': -2, 'warning': -2,
    'risk': -2, 'selloff': -2, 'sell': -2, 'cut': -2, 'slash': -2,
    'negative': -2, 'concern': -2, 'debt': -2, 'tariff': -2,
    // Mild bearish
    'down': -1, 'lower': -1, 'slow': -1, 'uncertain': -1, 'volatile': -1,
    'pressure': -1, 'headwind': -1, 'challenge': -1, 'delay': -1,
    'caution': -1, 'underperform': -1, 'struggle': -1,
};

/**
 * Score a single text string
 */
function scoreText(text) {
    if (!text) return 0;
    const lower = text.toLowerCase();
    let score = 0;

    for (const [word, weight] of Object.entries(BULLISH_WORDS)) {
        if (lower.includes(word)) score += weight;
    }
    for (const [word, weight] of Object.entries(BEARISH_WORDS)) {
        if (lower.includes(word)) score += weight; // weight is already negative
    }

    return score;
}

/**
 * Analyze sentiment of news articles
 * @param {Array} articles - Array of { title, publisher, publishedAt, link }
 * @returns {{ signal, signalLabel, confidence, avgScore, articles, bullishCount, bearishCount, neutralCount }}
 */
export function analyzeSentiment(articles) {
    if (!articles || articles.length === 0) {
        return {
            signal: 'neutral',
            signalLabel: '⚖️ No News Data',
            confidence: 0,
            avgScore: 0,
            articles: [],
            bullishCount: 0,
            bearishCount: 0,
            neutralCount: 0,
        };
    }

    const scored = articles.map(article => {
        const titleScore = scoreText(article.title);
        const sentiment = titleScore > 0 ? 'bullish' : titleScore < 0 ? 'bearish' : 'neutral';
        return {
            ...article,
            score: titleScore,
            sentiment,
        };
    });

    const totalScore = scored.reduce((sum, a) => sum + a.score, 0);
    const avgScore = totalScore / scored.length;
    const bullishCount = scored.filter(a => a.sentiment === 'bullish').length;
    const bearishCount = scored.filter(a => a.sentiment === 'bearish').length;
    const neutralCount = scored.filter(a => a.sentiment === 'neutral').length;

    // Determine signal
    let signal, signalLabel;
    if (avgScore > 0.5) {
        signal = 'bullish';
        signalLabel = '📈 Bullish Sentiment';
    } else if (avgScore < -0.5) {
        signal = 'bearish';
        signalLabel = '📉 Bearish Sentiment';
    } else {
        signal = 'neutral';
        signalLabel = '⚖️ Neutral Sentiment';
    }

    // Confidence: based on agreement among articles and magnitude
    const dominantPct = Math.max(bullishCount, bearishCount, neutralCount) / scored.length;
    const magnitude = Math.min(Math.abs(avgScore) / 3, 1); // normalize to 0-1
    const confidence = Math.round((dominantPct * 0.6 + magnitude * 0.4) * 100);

    return {
        signal,
        signalLabel,
        confidence: Math.min(confidence, 99),
        avgScore: parseFloat(avgScore.toFixed(2)),
        articles: scored,
        bullishCount,
        bearishCount,
        neutralCount,
    };
}

/**
 * Combine LSTM and News signals into a unified prediction
 * @param {Object} lstmResult - LSTM prediction result
 * @param {Object} newsResult - News sentiment result
 * @param {number} lstmWeight - Weight for LSTM signal (default 0.6)
 * @returns {{ signal, signalLabel, confidence, rationale }}
 */
export function combinedSignal(lstmResult, newsResult, lstmWeight = 0.6) {
    const newsWeight = 1 - lstmWeight;

    // Convert signals to numeric: bullish=1, neutral=0, bearish=-1
    const signalToNum = s => s === 'bullish' ? 1 : s === 'bearish' ? -1 : 0;

    const lstmNum = signalToNum(lstmResult.signal);
    const newsNum = signalToNum(newsResult.signal);

    const combined = lstmNum * lstmWeight + newsNum * newsWeight;
    const lstmConf = (lstmResult.confidence || 50) / 100;
    const newsConf = (newsResult.confidence || 50) / 100;
    const weightedConf = Math.round((lstmConf * lstmWeight + newsConf * newsWeight) * 100);

    let signal, signalLabel;
    if (combined > 0.2) {
        signal = 'bullish';
        signalLabel = '📈 Combined: Bullish';
    } else if (combined < -0.2) {
        signal = 'bearish';
        signalLabel = '📉 Combined: Bearish';
    } else {
        signal = 'neutral';
        signalLabel = '⚖️ Combined: Neutral';
    }

    // Build rationale
    const agree = lstmResult.signal === newsResult.signal;
    let rationale;
    if (agree) {
        rationale = `Both LSTM and news sentiment agree: ${signal}. High-conviction signal.`;
    } else if (lstmResult.signal === 'neutral' || newsResult.signal === 'neutral') {
        rationale = `Mixed signals — one model is neutral. Moderate conviction.`;
    } else {
        rationale = `LSTM says ${lstmResult.signal}, news says ${newsResult.signal}. Signals conflict — use caution.`;
    }

    return {
        signal,
        signalLabel,
        confidence: Math.min(weightedConf, 99),
        rationale,
        agreement: agree,
    };
}
