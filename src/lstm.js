/**
 * LSTM Time Series Prediction Module
 * Uses TensorFlow.js to train and predict settlement prices
 */
import * as tf from '@tensorflow/tfjs';

/**
 * Normalize data to [0,1] range
 */
function normalize(data) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    return {
        normalized: data.map(v => (v - min) / range),
        min,
        max,
        range
    };
}

/**
 * Denormalize a value back to original scale
 */
function denormalize(value, min, range) {
    return value * range + min;
}

/**
 * Create sliding windows for LSTM input
 * @param {number[]} data - Normalized time series
 * @param {number} lookback - Number of past steps to use
 * @returns {{ X: number[][][], y: number[] }}
 */
function createWindows(data, lookback) {
    const X = [];
    const y = [];
    for (let i = lookback; i < data.length; i++) {
        X.push(data.slice(i - lookback, i).map(v => [v])); // shape: [lookback, 1]
        y.push(data[i]);
    }
    return { X, y };
}

/**
 * Build LSTM model
 */
function buildModel(lookback) {
    const model = tf.sequential();

    model.add(tf.layers.lstm({
        units: 32,
        inputShape: [lookback, 1],
        returnSequences: false
    }));

    model.add(tf.layers.dropout({ rate: 0.1 }));

    model.add(tf.layers.dense({
        units: 16,
        activation: 'relu'
    }));

    model.add(tf.layers.dense({
        units: 1
    }));

    model.compile({
        optimizer: tf.train.adam(0.01),
        loss: 'meanSquaredError'
    });

    return model;
}

/**
 * Train LSTM model and generate predictions
 * @param {number[]} prices - Raw settlement price array (chronological)
 * @param {object} options - Configuration
 * @param {function} onProgress - Callback for training progress
 * @returns {Promise<object>} - { predictions, signal, confidence, metrics }
 */
export async function trainAndPredict(prices, options = {}, onProgress = null) {
    const {
        lookback = 10,
        forecastDays = 5,
        epochs = 50,
        batchSize = 4
    } = options;

    if (prices.length < lookback + 5) {
        throw new Error(`Need at least ${lookback + 5} data points, got ${prices.length}`);
    }

    const startTime = Date.now();

    // 1. Normalize
    const { normalized, min, max, range } = normalize(prices);

    // 2. Create training windows
    const { X, y } = createWindows(normalized, lookback);

    // 3. Convert to tensors
    const xTensor = tf.tensor3d(X);
    const yTensor = tf.tensor2d(y, [y.length, 1]);

    // 4. Build model
    const model = buildModel(lookback);

    // 5. Train
    const history = await model.fit(xTensor, yTensor, {
        epochs,
        batchSize,
        shuffle: false,
        validationSplit: 0.1,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                if (onProgress) {
                    onProgress({
                        epoch: epoch + 1,
                        totalEpochs: epochs,
                        loss: logs.loss,
                        valLoss: logs.val_loss,
                        progress: (epoch + 1) / epochs
                    });
                }
            }
        }
    });

    // 6. Forecast future prices
    const forecasted = [];
    let lastWindow = normalized.slice(-lookback);

    for (let i = 0; i < forecastDays; i++) {
        const input = tf.tensor3d([lastWindow.map(v => [v])]);
        const pred = model.predict(input);
        const predValue = pred.dataSync()[0];
        forecasted.push(predValue);

        // Slide window
        lastWindow = [...lastWindow.slice(1), predValue];

        // Cleanup tensors
        input.dispose();
        pred.dispose();
    }

    // 7. Generate fitted values for the training period
    const fitted = [];
    for (let i = 0; i < X.length; i++) {
        const input = tf.tensor3d([X[i]]);
        const pred = model.predict(input);
        fitted.push(pred.dataSync()[0]);
        input.dispose();
        pred.dispose();
    }

    // 8. Denormalize
    const fittedPrices = fitted.map(v => denormalize(v, min, range));
    const forecastPrices = forecasted.map(v => denormalize(v, min, range));
    const actualPrices = prices.slice(lookback);

    // 9. Compute signal
    const currentPrice = prices[prices.length - 1];
    const avgForecast = forecastPrices.reduce((s, v) => s + v, 0) / forecastPrices.length;
    const pctChange = (avgForecast - currentPrice) / currentPrice;

    let signal, signalLabel, confidence;
    if (pctChange > 0.01) {
        signal = 'bullish';
        signalLabel = '📈 Bullish';
        confidence = Math.min(Math.abs(pctChange) * 100, 95);
    } else if (pctChange < -0.01) {
        signal = 'bearish';
        signalLabel = '📉 Bearish';
        confidence = Math.min(Math.abs(pctChange) * 100, 95);
    } else {
        signal = 'neutral';
        signalLabel = '➡️ Neutral';
        confidence = 100 - Math.abs(pctChange) * 1000;
    }

    // 10. Strategy recommendation
    let strategy;
    if (signal === 'bullish') {
        strategy = {
            type: 'protective-put',
            name: 'Protective Put',
            description: 'LSTM predicts upside — protect downside with a put while staying long.',
            action: 'Buy stock + Buy OTM put'
        };
    } else if (signal === 'bearish') {
        strategy = {
            type: 'covered-call',
            name: 'Covered Call',
            description: 'LSTM predicts decline — generate income by selling a call against your position.',
            action: 'Hold stock + Sell OTM call'
        };
    } else {
        strategy = {
            type: 'collar',
            name: 'Collar',
            description: 'LSTM predicts sideways — limit risk both directions with a collar.',
            action: 'Hold stock + Buy put + Sell call'
        };
    }

    // 11. Metrics
    const finalLoss = history.history.loss[history.history.loss.length - 1];
    const finalValLoss = history.history.val_loss[history.history.val_loss.length - 1];
    const trainingTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // RMSE on fitted
    let sumSqErr = 0;
    for (let i = 0; i < actualPrices.length && i < fittedPrices.length; i++) {
        sumSqErr += Math.pow(actualPrices[i] - fittedPrices[i], 2);
    }
    const rmse = Math.sqrt(sumSqErr / Math.min(actualPrices.length, fittedPrices.length));

    // Cleanup
    xTensor.dispose();
    yTensor.dispose();
    model.dispose();

    return {
        // Actual prices (aligned with fitted)
        actual: actualPrices,
        // Fitted model values
        fitted: fittedPrices,
        // Forecast values
        forecast: forecastPrices,
        // Signal
        signal,
        signalLabel,
        confidence: Math.round(confidence),
        pctChange: (pctChange * 100).toFixed(2),
        // Strategy
        strategy,
        // Current & predicted
        currentPrice,
        avgForecast: avgForecast.toFixed(2),
        // Metrics
        metrics: {
            lookback,
            epochs,
            forecastDays,
            finalLoss: finalLoss.toFixed(6),
            finalValLoss: finalValLoss.toFixed(6),
            rmse: rmse.toFixed(4),
            trainingTime
        },
        // For building chart labels
        lookback
    };
}
