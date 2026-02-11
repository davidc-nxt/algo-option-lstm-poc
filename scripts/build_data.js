#!/usr/bin/env node
/**
 * Build Data Pipeline
 * Parses HKEX DTOP .raw files into optimized JSON for the web app.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'data');

// Stock code → display name mapping
const STOCK_NAMES = {
  'A50': { name: 'CSOP A50 ETF', ticker: '2823.HK' },
  'AAC': { name: 'AAC Technologies', ticker: '2018.HK' },
  'ACC': { name: 'ACC', ticker: '' },
  'AIA': { name: 'AIA Group', ticker: '1299.HK' },
  'AIR': { name: 'Air China', ticker: '0753.HK' },
  'AKS': { name: 'Akeso Inc', ticker: '9926.HK' },
  'ALB': { name: 'Alibaba Group', ticker: '9988.HK' },
  'ALC': { name: 'CNOOC', ticker: '0883.HK' },
  'ALH': { name: 'Ali Health', ticker: '0241.HK' },
  'AMC': { name: 'AMC Entertainment', ticker: '' },
  'ANA': { name: 'Anta Sports', ticker: '2020.HK' },
  'BCM': { name: 'Bank of Communications', ticker: '3328.HK' },
  'BEA': { name: 'Bank of East Asia', ticker: '0023.HK' },
  'BIU': { name: 'BYD Company', ticker: '1211.HK' },
  'BLI': { name: 'Bilibili Inc', ticker: '9626.HK' },
  'BOC': { name: 'BOC Hong Kong', ticker: '2388.HK' },
  'BOM': { name: 'Bank of China', ticker: '3988.HK' },
  'BUD': { name: 'Budweiser APAC', ticker: '1876.HK' },
  'BYA': { name: 'BYD Electronic', ticker: '0285.HK' },
  'BYD': { name: 'BYD Company', ticker: '1211.HK' },
  'BYE': { name: 'BYD Electronic', ticker: '0285.HK' },
  'CAT': { name: 'CATL', ticker: '' },
  'CCC': { name: 'China Communications Construction', ticker: '1800.HK' },
  'CCE': { name: 'CITIC Securities', ticker: '6030.HK' },
  'CDA': { name: 'ChinaAMC CSI 300 ETF', ticker: '3188.HK' },
  'CGN': { name: 'CGN Power', ticker: '1816.HK' },
  'CHQ': { name: 'Chongqing Rural Commercial Bank', ticker: '3618.HK' },
  'CHT': { name: 'China Telecom', ticker: '0728.HK' },
  'CLI': { name: 'China Life Insurance', ticker: '2628.HK' },
  'CNC': { name: 'China Unicom', ticker: '0762.HK' },
  'COS': { name: 'COSCO Shipping', ticker: '1919.HK' },
  'CPC': { name: 'China Pacific Insurance', ticker: '2601.HK' },
  'CPI': { name: 'China Power International', ticker: '2380.HK' },
  'CRC': { name: 'China Resources Cement', ticker: '1313.HK' },
  'CRL': { name: 'China Resources Land', ticker: '1109.HK' },
  'CSA': { name: 'China Southern Airlines', ticker: '1055.HK' },
  'CTB': { name: 'China Tower', ticker: '0788.HK' },
  'DFI': { name: 'Dongfeng Motor', ticker: '0489.HK' },
  'EAC': { name: 'Eastern Air Logistics', ticker: '' },
  'FIH': { name: 'FIH Mobile', ticker: '2038.HK' },
  'GAH': { name: 'Guangzhou Auto', ticker: '2238.HK' },
  'GLX': { name: 'Galaxy Entertainment', ticker: '0027.HK' },
  'GOL': { name: 'SEHK Gold ETF', ticker: '' },
  'HEI': { name: 'Hengan International', ticker: '1044.HK' },
  'HEX': { name: 'Hang Seng China Enterprises ETF', ticker: '2828.HK' },
  'HKB': { name: 'HSBC Holdings', ticker: '0005.HK' },
  'HLD': { name: 'Henderson Land', ticker: '0012.HK' },
  'HSI': { name: 'Tracker Fund of HK', ticker: '2800.HK' },
  'ICB': { name: 'ICBC', ticker: '1398.HK' },
  'JDC': { name: 'JD.com', ticker: '9618.HK' },
  'KDR': { name: 'Kuaishou Technology', ticker: '1024.HK' },
  'KST': { name: 'Kingsoft Corp', ticker: '3888.HK' },
  'LEN': { name: 'Lenovo Group', ticker: '0992.HK' },
  'LNK': { name: 'Link REIT', ticker: '0823.HK' },
  'MET': { name: 'Meituan', ticker: '3690.HK' },
  'MIU': { name: 'Xiaomi Corp', ticker: '1810.HK' },
  'MOL': { name: 'China Mengniu Dairy', ticker: '2319.HK' },
  'NEC': { name: 'NIO Inc', ticker: '9866.HK' },
  'NTE': { name: 'NetEase Inc', ticker: '9999.HK' },
  'NWD': { name: 'New World Development', ticker: '0017.HK' },
  'PAI': { name: 'Ping An Insurance', ticker: '2318.HK' },
  'PEC': { name: 'PetroChina', ticker: '0857.HK' },
  'PEN': { name: 'Ping An Good Doctor / Ping An HC', ticker: '' },
  'POP': { name: 'Pop Mart International', ticker: '9992.HK' },
  'PRU': { name: 'Prudential', ticker: '2378.HK' },
  'SAN': { name: 'Sands China', ticker: '1928.HK' },
  'SEG': { name: 'SenseTime Group', ticker: '0020.HK' },
  'SHK': { name: 'Sun Hung Kai Properties', ticker: '0016.HK' },
  'SIN': { name: 'Sinopec Corp', ticker: '0386.HK' },
  'SMC': { name: 'SMIC', ticker: '0981.HK' },
  'SUN': { name: 'Sunny Optical', ticker: '2382.HK' },
  'TCH': { name: 'Tencent Holdings', ticker: '0700.HK' },
  'TRA': { name: 'Tracker Fund of HK', ticker: '2800.HK' },
  'TWR': { name: 'CK Infrastructure', ticker: '1038.HK' },
  'VNK': { name: 'China Vanke', ticker: '2202.HK' },
  'WHL': { name: 'Wharf Holdings', ticker: '0004.HK' },
  'XAB': { name: 'XPeng Inc', ticker: '9868.HK' },
  'XBC': { name: 'China Construction Bank', ticker: '0939.HK' },
  'XCC': { name: 'China Merchants Bank', ticker: '3968.HK' },
  'XIC': { name: 'ICBC', ticker: '1398.HK' },
  'XPC': { name: 'China Pacific Insurance', ticker: '2601.HK' },
  'ZJM': { name: 'Zijin Mining', ticker: '2899.HK' },
};

const MONTH_MAP = { 'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
  'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12' };

function parseLine(line) {
  // CSV parsing that handles quoted fields
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue; }
    if (ch === '\r') continue;
    current += ch;
  }
  fields.push(current.trim());
  return fields;
}

function parseRawFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const records = [];

  for (const line of lines) {
    const f = parseLine(line);
    if (f[0] !== '01') continue; // skip header/trailer
    if (f[1] !== 'SOM') continue; // only stock options (not weekly/RMB)

    const stockClass = f[3];
    const expDay = f[4].padStart(2, '0');
    const expMonth = MONTH_MAP[f[5]] || f[5];
    const expYear = '20' + f[6];
    const expiry = `${expYear}-${expMonth}-${expDay}`;
    const strike = parseFloat(f[7]);

    const callGross = parseInt(f[8]) || 0;
    const callNet = parseInt(f[9]) || 0;
    const callChange = parseInt(f[10]) || 0;
    const callTO = parseInt(f[11]) || 0;
    const callDeals = parseInt(f[12]) || 0;
    const callSettle = parseFloat(f[13]) || 0;
    const callPriceChg = parseFloat(f[14]) || 0;

    const putGross = parseInt(f[15]) || 0;
    const putNet = parseInt(f[16]) || 0;
    const putChange = parseInt(f[17]) || 0;
    const putTO = parseInt(f[18]) || 0;
    const putDeals = parseInt(f[19]) || 0;
    const putSettle = parseFloat(f[20]) || 0;
    const putPriceChg = parseFloat(f[21]) || 0;

    records.push({
      stockClass, expiry, strike,
      call: { gross: callGross, net: callNet, change: callChange, to: callTO, deals: callDeals, settle: callSettle, priceChg: callPriceChg },
      put: { gross: putGross, net: putNet, change: putChange, to: putTO, deals: putDeals, settle: putSettle, priceChg: putPriceChg }
    });
  }
  return records;
}

function main() {
  console.log('🔨 Building data from HKEX DTOP files...');

  // Find all DTOP directories
  const dirs = fs.readdirSync(ROOT)
    .filter(d => d.startsWith('DTOP_O_') && fs.statSync(path.join(ROOT, d)).isDirectory())
    .sort();

  console.log(`📁 Found ${dirs.length} DTOP directories`);

  // Collect all data grouped by stock class
  const stockData = {};  // { class: { dates: { date: { expiries: { expiry: [ {strike, call, put} ] } } } } }
  const allDates = [];
  const dailySummary = {};  // { date: { class: { callOI, putOI, callVol, putVol } } }

  for (const dir of dirs) {
    const dateStr = dir.replace('DTOP_O_', '');
    const formattedDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    allDates.push(formattedDate);

    // Find the all.raw file
    const rawFiles = fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('_all.raw'));
    if (rawFiles.length === 0) {
      console.warn(`  ⚠️  No .raw file in ${dir}`);
      continue;
    }

    const rawPath = path.join(ROOT, dir, rawFiles[0]);
    console.log(`  📄 Parsing ${dir}/${rawFiles[0]}...`);
    const records = parseRawFile(rawPath);

    dailySummary[formattedDate] = {};

    for (const rec of records) {
      // Build per-stock data
      if (!stockData[rec.stockClass]) {
        stockData[rec.stockClass] = { dates: {} };
      }
      if (!stockData[rec.stockClass].dates[formattedDate]) {
        stockData[rec.stockClass].dates[formattedDate] = {};
      }
      if (!stockData[rec.stockClass].dates[formattedDate][rec.expiry]) {
        stockData[rec.stockClass].dates[formattedDate][rec.expiry] = [];
      }
      stockData[rec.stockClass].dates[formattedDate][rec.expiry].push({
        k: rec.strike,
        c: [rec.call.gross, rec.call.net, rec.call.to, rec.call.deals, rec.call.settle, rec.call.priceChg],
        p: [rec.put.gross, rec.put.net, rec.put.to, rec.put.deals, rec.put.settle, rec.put.priceChg]
      });

      // Accumulate daily summary
      if (!dailySummary[formattedDate][rec.stockClass]) {
        dailySummary[formattedDate][rec.stockClass] = { cOI: 0, pOI: 0, cVol: 0, pVol: 0 };
      }
      dailySummary[formattedDate][rec.stockClass].cOI += rec.call.net;
      dailySummary[formattedDate][rec.stockClass].pOI += rec.put.net;
      dailySummary[formattedDate][rec.stockClass].cVol += rec.call.to;
      dailySummary[formattedDate][rec.stockClass].pVol += rec.put.to;
    }
  }

  // Create output directory
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Write per-stock JSON files
  const stockClasses = Object.keys(stockData).sort();
  console.log(`\n📊 Writing ${stockClasses.length} stock JSON files...`);

  for (const cls of stockClasses) {
    const outPath = path.join(OUT_DIR, `${cls}.json`);
    fs.writeFileSync(outPath, JSON.stringify(stockData[cls]));
  }

  // Compute aggregated summary for the latest date for the index
  const latestDate = allDates[allDates.length - 1];
  const latestSummary = dailySummary[latestDate] || {};

  // Build stock list with metadata
  const stockList = stockClasses.map(cls => {
    const info = STOCK_NAMES[cls] || { name: cls, ticker: '' };
    const latest = latestSummary[cls] || { cOI: 0, pOI: 0, cVol: 0, pVol: 0 };
    const dateCount = Object.keys(stockData[cls].dates).length;
    return {
      code: cls,
      name: info.name,
      ticker: info.ticker,
      dates: dateCount,
      latestCallOI: latest.cOI,
      latestPutOI: latest.pOI,
      latestCallVol: latest.cVol,
      latestPutVol: latest.pVol,
      totalOI: latest.cOI + latest.pOI
    };
  });

  // Write index
  const index = {
    dates: allDates.sort(),
    stocks: stockList.sort((a, b) => b.totalOI - a.totalOI),
    latestDate,
    fieldMap: {
      c: ['gross', 'net', 'turnover', 'deals', 'settle', 'priceChg'],
      p: ['gross', 'net', 'turnover', 'deals', 'settle', 'priceChg']
    }
  };

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index));

  // Write daily summary
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(dailySummary));

  // Stats
  const totalSize = stockClasses.reduce((sum, cls) => {
    return sum + fs.statSync(path.join(OUT_DIR, `${cls}.json`)).size;
  }, 0);

  console.log(`\n✅ Data build complete!`);
  console.log(`   📊 ${stockClasses.length} stock classes`);
  console.log(`   📅 ${allDates.length} trading days (${allDates[0]} → ${allDates[allDates.length-1]})`);
  console.log(`   💾 Total data size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   📁 Output: ${OUT_DIR}`);
}

main();
