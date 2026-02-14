#!/usr/bin/env python3
"""
Fetch historical daily stock prices from Yahoo Finance for all mapped HK stocks.
Saves per-stock price JSON into public/data/prices/ for the web app.
Run at build time before vite build.
"""
import json
import os
import sys
import time
from pathlib import Path

def main():
    try:
        import yfinance as yf
    except ImportError:
        print("⚠️  yfinance not installed, installing...")
        os.system(f"{sys.executable} -m pip install yfinance -q")
        import yfinance as yf

    script_dir = Path(__file__).parent
    tickers_path = script_dir / "tickers.json"
    out_dir = script_dir.parent / "public" / "data" / "prices"
    out_dir.mkdir(parents=True, exist_ok=True)

    with open(tickers_path, "r") as f:
        ticker_map = json.load(f)

    print(f"📈 Fetching 1-year daily prices for {len(ticker_map)} stocks...")
    price_index = {}
    success_count = 0
    error_count = 0

    # Deduplicate tickers (some codes map to same ticker)
    seen_tickers = {}
    for code, ticker in sorted(ticker_map.items()):
        if ticker in seen_tickers:
            # Reuse already-fetched data
            src_code = seen_tickers[ticker]
            src_path = out_dir / f"{src_code}.json"
            if src_path.exists():
                with open(src_path, "r") as f:
                    data = json.load(f)
                # Save with new code
                data["code"] = code
                out_path = out_dir / f"{code}.json"
                with open(out_path, "w") as f:
                    json.dump(data, f)
                price_index[code] = {"ticker": ticker, "days": data.get("days", 0)}
                success_count += 1
                print(f"  ♻️  {code} ({ticker}): reused from {src_code}")
            continue
        seen_tickers[ticker] = code

        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period="1y", interval="1d")

            if hist.empty:
                print(f"  ⚠️  {code} ({ticker}): no price data")
                continue

            prices = []
            for date, row in hist.iterrows():
                prices.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "open": round(float(row["Open"]), 3),
                    "high": round(float(row["High"]), 3),
                    "low": round(float(row["Low"]), 3),
                    "close": round(float(row["Close"]), 3),
                    "volume": int(row["Volume"]),
                })

            out_path = out_dir / f"{code}.json"
            with open(out_path, "w") as f:
                json.dump({
                    "ticker": ticker,
                    "code": code,
                    "days": len(prices),
                    "prices": prices,
                    "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                }, f)

            price_index[code] = {"ticker": ticker, "days": len(prices)}
            success_count += 1
            print(f"  ✅ {code} ({ticker}): {len(prices)} days")

        except Exception as e:
            error_count += 1
            print(f"  ❌ {code} ({ticker}): {e}")

    # Write index
    index_path = out_dir / "index.json"
    with open(index_path, "w") as f:
        json.dump({
            "stocks": price_index,
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "totalStocks": success_count,
        }, f)

    print(f"\n📈 Price fetch complete!")
    print(f"   ✅ {success_count} stocks with prices")
    print(f"   ❌ {error_count} errors")
    print(f"   📁 Output: {out_dir}")

if __name__ == "__main__":
    main()
