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
let currentSocket = null; // Untuk menyimpan koneksi WebSocket

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

        // Jalankan update real-time via WebSocket
        startLiveUpdates();

    } catch (e) {
        console.error("Initialization Error:", e);
    }
}

// 2. Render Table
function renderTable(reset = false) {
    if (reset) {
        displayedCount = 25;
        tableBody.innerHTML = '';
    }

    const currentLength = tableBody.children.length;
    const nextBatch = filteredCoins.slice(currentLength, currentLength + 25);
    
    const rows = nextBatch.map(c => `
        <tr data-symbol="${c.symbol}" onclick="setActiveRow(this); showDetail('${c.symbol}', ${c.price}, ${c.change})" 
            class="cursor-pointer hover:bg-blue-50 border-b border-gray-100 group transition-all">
            <td class="py-5 px-6">
                <div class="text-xl font-extrabold text-gray-900 group-hover:text-blue-600">${c.name}</div>
                <div class="text-xs text-gray-400 font-mono font-bold tracking-widest uppercase">${c.symbol}</div>
            </td>
            <td class="py-5 px-6 text-right">
                <div class="price-val font-mono text-xl font-bold text-gray-900 transition-colors duration-300">$${c.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                <div class="change-val text-xs ${c.change >= 0 ? 'text-green-600' : 'text-red-600'} font-black">
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
    document.querySelectorAll('tr').forEach(r => r.classList.remove('selected-row', 'bg-blue-50'));
    row.classList.add('selected-row', 'bg-blue-50');
}

// 3. WebSocket Real-Time Logic
// --- Inisialisasi Audio di Luar Fungsi ---
const alertSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
alertSound.volume = 0.3; // Volume 30%
let isMuted = true; // Default mati (aturan browser)

// Logika klik tombol suara
document.getElementById('btn-sound').addEventListener('click', () => {
    isMuted = !isMuted;
    const icon = document.getElementById('sound-icon');
    const text = document.getElementById('sound-text');
    
    if (isMuted) {
        icon.innerText = '🔈';
        text.innerText = 'Muted';
    } else {
        icon.innerText = '🔊';
        text.innerText = 'Live Sound';
        alertSound.play().catch(() => {}); // Test suara saat diaktifkan
    }
});

// --- Fungsi startLiveUpdates Baru ---
function startLiveUpdates() {
    if (currentSocket) currentSocket.close();

    // Pantau 40 koin teratas yang tampil untuk efisiensi
    const topSymbols = allCoins.slice(0, 40).map(c => `${c.symbol.toLowerCase()}@ticker`);
    const streamPath = topSymbols.join('/');
    
    currentSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${streamPath}`);

    currentSocket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const symbol = msg.s;
        const newPrice = parseFloat(msg.c);
        const newChange = parseFloat(msg.P);

        // 1. Update di Tabel (Visual Only)
        const row = document.querySelector(`tr[data-symbol="${symbol}"]`);
        if (row) {
            const priceEl = row.querySelector('.price-val');
            const changeEl = row.querySelector('.change-val');
            const oldPriceText = priceEl.innerText.replace('$', '').replace(/,/g, '');
            const oldPrice = parseFloat(oldPriceText);

            if (newPrice > oldPrice) {
                priceEl.classList.add('text-green-500');
                setTimeout(() => priceEl.classList.remove('text-green-500'), 400);
            } else if (newPrice < oldPrice) {
                priceEl.classList.add('text-red-500');
                setTimeout(() => priceEl.classList.remove('text-red-500'), 400);
            }

            priceEl.innerText = `$${newPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            changeEl.innerHTML = `${(newChange >= 0 ? '▲' : '▼')} ${Math.abs(newChange).toFixed(2)}%`;
            changeEl.className = `change-val text-xs ${newChange >= 0 ? 'text-green-600' : 'text-red-600'} font-black`;
        }

        // 2. Update di Detail Panel & Logika Suara
        const activeName = document.getElementById('detail-name').innerText;
        if (symbol.startsWith(activeName)) {
            const detailPriceEl = document.getElementById('detail-price');
            const detailChangeEl = document.getElementById('detail-change');
            
            const oldDetailPrice = parseFloat(detailPriceEl.innerText.replace('$', '').replace(/,/g, ''));

            // TRIGGER SUARA: Jika harga berubah (naik atau turun)
            if (!isMuted && newPrice !== oldDetailPrice) {
                // Mainkan suara hanya jika pergerakannya nyata
                alertSound.currentTime = 0; // Reset ke awal agar suara tidak bertumpuk
                alertSound.play().catch(() => {});
            }

            detailPriceEl.innerText = `$${newPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            detailChangeEl.innerText = (newChange >= 0 ? '+' : '') + `${newChange.toFixed(2)}%`;
            detailChangeEl.className = `text-lg font-black px-3 py-1 rounded-lg ${newChange >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;
        }
    };

    currentSocket.onclose = () => setTimeout(startLiveUpdates, 5000);
}

// 4. Show Detail & News
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

    setTimeout(() => renderRealChart(symbol), 200);
    fetchGlobalEnglishNews(symbol.replace('USDT', ''));
    renderTopCards();
}

// 5. Chart Function
async function renderRealChart(symbol) {
    const container = document.getElementById('chart-container');
    if (!container || typeof LightweightCharts === 'undefined') return;

    container.innerHTML = ''; 
    try {
        tvChart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: 450,
            layout: { background: { color: '#ffffff' }, textColor: '#4b5563' },
            grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
            timeScale: { borderColor: '#e5e7eb' },
            rightPriceScale: { borderColor: '#e5e7eb' },
        });

        areaSeries = tvChart.addSeries(LightweightCharts.AreaSeries, {
            lineColor: '#2563eb',
            topColor: 'rgba(37, 99, 235, 0.2)',
            bottomColor: 'rgba(37, 99, 235, 0.0)',
            lineWidth: 3,
        });

        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`);
        const data = await res.json();
        const formattedData = data.map(d => ({ time: d[0] / 1000, value: parseFloat(d[4]) }));
        
        areaSeries.setData(formattedData);
        tvChart.timeScale().fitContent();
    } catch (e) {
        container.innerHTML = `<div class="p-10 text-center text-red-500 font-bold">Failed to load chart</div>`;
    }
}

// 6. News & Other UI
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
    } catch (e) { newsContainer.innerHTML = '<p>News unavailable.</p>'; }
}

function renderTopCards() {
    let topWidget = document.getElementById('top-widget');
    if (!topWidget) return;
    topWidget.innerHTML = allCoins.slice(0, 4).map(c => `
        <div class="bg-gray-50 p-4 border border-gray-100 rounded-xl">
            <div class="text-[10px] text-gray-400 font-black uppercase tracking-widest">${c.name}</div>
            <div class="text-base font-mono font-bold text-gray-900">$${c.price.toLocaleString()}</div>
            <div class="text-[10px] ${c.change >= 0 ? 'text-green-600' : 'text-red-600'} font-bold">${c.change.toFixed(2)}%</div>
        </div>
    `).join('');
}

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