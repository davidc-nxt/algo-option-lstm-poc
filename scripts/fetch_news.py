#!/usr/bin/env python3
"""
Fetch news data from Yahoo Finance for all mapped HK stocks.
Saves per-stock news JSON into public/data/news/ for the web app.
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
    out_dir = script_dir.parent / "public" / "data" / "news"
    out_dir.mkdir(parents=True, exist_ok=True)

    with open(tickers_path, "r") as f:
        ticker_map = json.load(f)

    print(f"📰 Fetching news for {len(ticker_map)} stocks...")
    news_index = {}
    success_count = 0
    error_count = 0

    for code, ticker in sorted(ticker_map.items()):
        try:
            stock = yf.Ticker(ticker)
            raw_news = stock.news
            
            # yfinance >= 0.2.31 returns a dict with 'news' key
            if isinstance(raw_news, dict) and 'news' in raw_news:
                articles = raw_news['news']
            elif isinstance(raw_news, list):
                articles = raw_news
            else:
                articles = []

            # Normalize article format
            processed = []
            for article in articles[:20]:  # max 20 articles per stock
                content = article.get('content', article) if isinstance(article, dict) else article
                if isinstance(content, dict):
                    processed.append({
                        "title": content.get("title", ""),
                        "publisher": content.get("provider", {}).get("displayName", "") if isinstance(content.get("provider"), dict) else content.get("publisher", ""),
                        "link": content.get("canonicalUrl", {}).get("url", "") if isinstance(content.get("canonicalUrl"), dict) else content.get("link", content.get("url", "")),
                        "publishedAt": content.get("pubDate", content.get("providerPublishTime", "")),
                        "thumbnail": content.get("thumbnail", {}).get("originalUrl", "") if isinstance(content.get("thumbnail"), dict) else "",
                        "relatedTickers": content.get("relatedTickers", content.get("finance", {}).get("relatedTickers", [])) if isinstance(content.get("finance", {}), dict) else []
                    })

            if processed:
                out_path = out_dir / f"{code}.json"
                with open(out_path, "w") as f:
                    json.dump({"ticker": ticker, "code": code, "articles": processed, "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ")}, f)
                news_index[code] = {"ticker": ticker, "count": len(processed)}
                success_count += 1
                print(f"  ✅ {code} ({ticker}): {len(processed)} articles")
            else:
                print(f"  ⚠️  {code} ({ticker}): no articles found")

        except Exception as e:
            error_count += 1
            print(f"  ❌ {code} ({ticker}): {e}")

    # Write index
    index_path = out_dir / "index.json"
    with open(index_path, "w") as f:
        json.dump({
            "stocks": news_index,
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "totalStocks": success_count
        }, f)

    print(f"\n📰 News fetch complete!")
    print(f"   ✅ {success_count} stocks with news")
    print(f"   ❌ {error_count} errors")
    print(f"   📁 Output: {out_dir}")

if __name__ == "__main__":
    main()
