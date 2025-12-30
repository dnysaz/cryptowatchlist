const tableBody = document.getElementById('coin-table');
const searchInput = document.getElementById('coin-search');
const detailPanel = document.getElementById('detail-panel');
const emptyState = document.getElementById('empty-state');
const newsContainer = document.getElementById('news-container');
const loadMoreBtn = document.getElementById('btn-load-more');
const loadMoreContainer = document.getElementById('load-more-container');

let allCoins = [];
let filteredCoins = [];
let displayedCount = 25; 
let tvChart = null;
let areaSeries = null;

// 1. Inisialisasi Aplikasi
async function init() {
    try {
        const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const data = await res.json();
        
        allCoins = data
            .filter(c => c.symbol.endsWith('USDT'))
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .map((c, i) => ({
                rank: i + 1,
                symbol: c.symbol,
                name: c.symbol.replace('USDT', ''),
                price: parseFloat(c.lastPrice),
                change: parseFloat(c.priceChangePercent),
                volume: parseFloat(c.quoteVolume)
            }));
        
        filteredCoins = [...allCoins];
        renderTable(true);

        // Jika ada koin, tampilkan Bitcoin sebagai default
        if (allCoins.length > 0) {
            const btc = allCoins.find(c => c.symbol === 'BTCUSDT') || allCoins[0];
            showDetail(btc.symbol, btc.price, btc.change);
        }
    } catch (e) {
        console.error("Initialization Error:", e);
    }
}

// 2. Render Table (Besar & Responsif)
function renderTable(reset = false) {
    if (reset) {
        displayedCount = 25;
        tableBody.innerHTML = '';
    }

    const currentLength = tableBody.children.length;
    const nextBatch = filteredCoins.slice(currentLength, currentLength + 25);
    
    const rows = nextBatch.map(c => `
        <tr onclick="setActiveRow(this); showDetail('${c.symbol}', ${c.price}, ${c.change})" 
            class="cursor-pointer hover:bg-blue-50 border-b border-gray-100 group transition-all">
            <td class="py-5 px-6">
                <div class="text-xl font-extrabold text-gray-900 group-hover:text-blue-600">${c.name}</div>
                <div class="text-xs text-gray-400 font-mono font-bold tracking-widest uppercase">${c.symbol}</div>
            </td>
            <td class="py-5 px-6 text-right">
                <div class="font-mono text-xl font-bold text-gray-900">$${c.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                <div class="text-xs ${c.change >= 0 ? 'text-green-600' : 'text-red-600'} font-black">
                    ${(c.change >= 0 ? '▲' : '▼')} ${Math.abs(c.change).toFixed(2)}%
                </div>
            </td>
        </tr>
    `).join('');

    tableBody.insertAdjacentHTML('beforeend', rows);

    if (tableBody.children.length < filteredCoins.length) {
        loadMoreContainer.classList.remove('hidden');
    } else {
        loadMoreContainer.classList.add('hidden');
    }
}

function setActiveRow(row) {
    document.querySelectorAll('tr').forEach(r => r.classList.remove('selected-row'));
    row.classList.add('selected-row');
}

// 3. Show Detail & News
async function showDetail(symbol, price, change) {
    emptyState.classList.add('hidden');
    detailPanel.classList.remove('hidden');
    
    document.getElementById('detail-name').innerText = symbol.replace('USDT', '');
    document.getElementById('detail-symbol').innerText = `${symbol} | Live Data`;
    document.getElementById('detail-price').innerText = `$${price.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('detail-icon').innerText = symbol.charAt(0);
    
    const changeEl = document.getElementById('detail-change');
    changeEl.innerText = (change >= 0 ? '+' : '') + `${change.toFixed(2)}%`;
    changeEl.className = `text-lg font-black px-3 py-1 rounded-lg ${change >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;

    // Jalankan render chart dengan delay agar kontainer siap
    setTimeout(() => renderRealChart(symbol), 200);
    fetchGlobalEnglishNews(symbol.replace('USDT', ''));
    renderTopCards();
}

// 4. FIX: Fungsi Chart yang Lebih Stabil
async function renderRealChart(symbol) {
    const container = document.getElementById('chart-container');
    if (!container) return;

    if (typeof LightweightCharts === 'undefined') {
        console.error("Library LightweightCharts tidak ditemukan.");
        return;
    }

    container.innerHTML = ''; 

    try {
        // Inisialisasi Chart
        tvChart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: 450,
            layout: { background: { color: '#ffffff' }, textColor: '#4b5563' },
            grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
            timeScale: { borderColor: '#e5e7eb' },
            rightPriceScale: { borderColor: '#e5e7eb' },
        });

        // FIX: Menggunakan sintaks addSeries terbaru
        areaSeries = tvChart.addSeries(LightweightCharts.AreaSeries, {
            lineColor: '#2563eb',
            topColor: 'rgba(37, 99, 235, 0.2)',
            bottomColor: 'rgba(37, 99, 235, 0.0)',
            lineWidth: 3,
        });

        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`);
        const data = await res.json();
        
        const formattedData = data.map(d => ({
            time: d[0] / 1000,
            value: parseFloat(d[4])
        }));
        
        areaSeries.setData(formattedData);
        tvChart.timeScale().fitContent();

    } catch (e) {
        console.error("Chart Error:", e);
        container.innerHTML = `<div class="p-10 text-center text-red-500 font-bold">Failed to load chart for ${symbol}</div>`;
    }
}

// 5. News Feed (Larger Font)
async function fetchGlobalEnglishNews(coin) {
    newsContainer.innerHTML = '<div class="text-gray-400 font-bold animate-pulse">Fetching intelligence...</div>';
    try {
        const res = await fetch(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${coin},Market`);
        const result = await res.json();
        newsContainer.innerHTML = result.Data.slice(0, 6).map(news => `
            <a href="${news.url}" target="_blank" class="block p-6 bg-white border-2 border-gray-50 rounded-2xl hover:border-blue-600 transition-all group">
                <div class="flex flex-col sm:flex-row gap-6">
                    <img src="${news.imageurl}" class="w-full sm:w-24 h-24 rounded-xl object-cover border border-gray-100">
                    <div class="flex-1">
                        <h4 class="font-extrabold text-gray-900 text-lg leading-tight group-hover:text-blue-600 mb-2">${news.title}</h4>
                        <p class="text-xs font-black text-blue-600 uppercase tracking-widest">${news.source_info.name} • ${new Date(news.published_on * 1000).toLocaleDateString()}</p>
                    </div>
                </div>
            </a>
        `).join('');
    } catch (e) {
        newsContainer.innerHTML = '<p class="text-red-500">News unavailable.</p>';
    }
}

// Global Ranking Widget
function renderTopCards() {
    let topWidget = document.getElementById('top-widget');
    if (!topWidget) return;
    const top4 = allCoins.slice(0, 4);
    topWidget.innerHTML = top4.map(c => `
        <div class="bg-gray-50 p-4 border border-gray-100 rounded-xl">
            <div class="text-[10px] text-gray-400 font-black uppercase tracking-widest">${c.name}</div>
            <div class="text-base font-mono font-bold text-gray-900">$${c.price.toLocaleString()}</div>
            <div class="text-[10px] ${c.change >= 0 ? 'text-green-600' : 'text-red-600'} font-bold">${c.change.toFixed(2)}%</div>
        </div>
    `).join('');
}

// Search Logic
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toUpperCase();
    filteredCoins = allCoins.filter(c => c.symbol.includes(term) || c.name.includes(term));
    renderTable(true);
});

loadMoreBtn.addEventListener('click', () => renderTable());

window.addEventListener('resize', () => {
    if (tvChart) tvChart.applyOptions({ width: document.getElementById('chart-container').clientWidth });
});

init();