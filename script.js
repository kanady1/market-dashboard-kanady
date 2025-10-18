// ====== بيانات أولية (عينات بدون API) ======
const SAMPLE = {
  BTCUSDT: [],
  ETHUSDT: []
};

function seedSeries(startPrice, n=240, vol=1.0, startTs=Date.now()/1000 - n*60) {
  let out = [];
  let p = startPrice;
  for (let i=0;i<n;i++){
    const t = Math.floor(startTs + i*60);
    const drift = (Math.random() - 0.5) * vol;
    const o = p;
    const c = p * (1 + drift/200);
    const h = Math.max(o, c) * (1 + Math.random()*0.002);
    const l = Math.min(o, c) * (1 - Math.random()*0.002);
    const v = 10 + Math.random()*40;
    out.push({time:t, open:o, high:h, low:l, close:c, volume:v});
    p = c;
  }
  return out;
}

SAMPLE.BTCUSDT = seedSeries(106000);
SAMPLE.ETHUSDT = seedSeries(3850);

// ====== أدوات حساب المؤشرات ======
function ema(values, period) {
  const k = 2/(period+1);
  let emaArr = [], emaPrev = values[0];
  for (let i=0;i<values.length;i++){
    emaPrev = i===0 ? values[i] : values[i]*k + emaPrev*(1-k);
    emaArr.push(emaPrev);
  }
  return emaArr;
}

function rsi(closes, period=14) {
  let gains=0, losses=0, rsiArr = Array(closes.length).fill(null);
  for (let i=1;i<=period;i++){
    const d = closes[i] - closes[i-1];
    gains += d>0? d:0; losses += d<0? -d:0;
  }
  let avgGain = gains/period, avgLoss = losses/period;
  rsiArr[period] = 100 - (100/(1 + (avgGain/(avgLoss||1e-9))));
  for (let i=period+1;i<closes.length;i++){
    const d = closes[i]-closes[i-1];
    avgGain = (avgGain*(period-1) + (d>0? d:0))/period;
    avgLoss = (avgLoss*(period-1) + (d<0? -d:0))/period;
    const rs = avgLoss===0? 100: avgGain/avgLoss;
    rsiArr[i] = 100 - (100/(1+rs));
  }
  return rsiArr;
}

// SuperTrend
function supertrend(data, atrPeriod=10, multiplier=3) {
  const trs = data.map((d,i)=>{
    if (i===0) return d.high-d.low;
    const prevClose = data[i-1].close;
    return Math.max(
      d.high-d.low,
      Math.abs(d.high - prevClose),
      Math.abs(d.low - prevClose)
    );
  });
  const atr = ema(trs, atrPeriod);
  let upper=[], lower=[], trend=[];
  for (let i=0;i<data.length;i++){
    const mid = (data[i].high + data[i].low)/2;
    upper[i] = mid + multiplier*atr[i];
    lower[i] = mid - multiplier*atr[i];
    if (i===0){ trend[i] = 1; continue; }
    if (data[i].close > upper[i-1]) trend[i] = 1;
    else if (data[i].close < lower[i-1]) trend[i] = -1;
    else trend[i] = trend[i-1];
    if (trend[i]===1 && lower[i] < lower[i-1]) lower[i] = lower[i-1];
    if (trend[i]===-1 && upper[i] > upper[i-1]) upper[i] = upper[i-1];
  }
  return {upper, lower, trend};
}

// دعم/مقاومة
function pivots(data, window=10){
  let supp = null, res = null;
  for (let i=data.length-window;i<data.length-1;i++){
    const slice = data.slice(i-window,i+1);
    const lows = slice.map(d=>d.low), highs = slice.map(d=>d.high);
    const min = Math.min(...lows), max = Math.max(...highs);
    supp = min; res = max;
  }
  return {support: supp, resistance: res};
}

// إشارة مُركبة
function compositeSignal(data) {
  const closes = data.map(d=>d.close);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsi14 = rsi(closes, 14);
  const st = supertrend(data, 10, 3);
  const i = data.length-1;
  let dir = "حيادي", sig = "لا توجد", cls = "";
  const emaCondBuy = ema50[i] > ema200[i];
  const emaCondSell = ema50[i] < ema200[i];
  const stBuy = st.trend[i]===1;
  const stSell = st.trend[i]===-1;
  const rsiBuy = rsi14[i]!==null && rsi14[i] > 55;
  const rsiSell = rsi14[i]!==null && rsi14[i] < 45;
  if (stBuy && emaCondBuy && rsiBuy){ sig="شراء قوي"; cls="buy"; dir="صاعد"; }
  else if (stSell && emaCondSell && rsiSell){ sig="بيع قوي"; cls="sell"; dir="هابط"; }
  return {sig, cls, dir, ema50, ema200, rsi14, st};
}

// إنشاء سهام شراء/بيع
function generateMarkers(data){
  const closes = data.map(d=>d.close);
  const ema50Arr = ema(closes, 50);
  const ema200Arr = ema(closes, 200);
  const rsi14 = rsi(closes, 14);
  const st = supertrend(data, 10, 3);
  const markers = [];
  for (let i=50;i<data.length;i++){
    const buy = (st.trend[i]===1 && ema50Arr[i]>ema200Arr[i] && rsi14[i]>55);
    const sell = (st.trend[i]===-1 && ema50Arr[i]<ema200Arr[i] && rsi14[i]<45);
    if (buy){
      markers.push({ time: data[i].time, position: 'belowBar', color: '#22c55e', shape: 'arrowUp', text: 'BUY' });
    } else if (sell){
      markers.push({ time: data[i].time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'SELL' });
    }
  }
  return markers;
}

// ====== واجهة ======
const state = {
  pairs: ["BTCUSDT","ETHUSDT"],
  favorites: new Set(),
  series: {
    BTCUSDT: SAMPLE.BTCUSDT,
    ETHUSDT: SAMPLE.ETHUSDT
  }
};

const panels = document.getElementById('panels');
const watchlist = document.getElementById('watchlist');
const favorites = document.getElementById('favorites');
const autoUpdate = document.getElementById('autoUpdate');
const search = document.getElementById('search');
const addPairBtn = document.getElementById('addPairBtn');
const fgInput = document.getElementById('fgInput');
const fgLabel = document.getElementById('fgLabel');
const pasteDataBtn = document.getElementById('pasteDataBtn');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const resetBtn = document.getElementById('resetBtn');

function fgText(v){
  if (v<25) return "خوف شديد";
  if (v<45) return "خوف";
  if (v<=55) return "حيادي";
  if (v<=75) return "طمع";
  return "طمع شديد";
}
fgLabel.textContent = fgText(Number(fgInput.value));
fgInput.addEventListener('input', () => fgLabel.textContent = fgText(Number(fgInput.value)));

function createPanel(pair){
  const tpl = document.getElementById('pairTemplate');
  const node = tpl.content.cloneNode(true);
  const panel = node.querySelector('.pairPanel');
  panel.dataset.pair = pair;
  panel.querySelector('.name').textContent = pair;
  const star = panel.querySelector('.star');
  star.onclick = () => {
    if (state.favorites.has(pair)) state.favorites.delete(pair);
    else state.favorites.add(pair);
    renderChips();
  };
  panel.querySelector('.remove').onclick = () => {
    state.pairs = state.pairs.filter(p=>p!==pair);
    panel.remove();
    renderChips();
  };

  const chartDiv = panel.querySelector('.chart');
  const rsiDiv = panel.querySelector('.rsiChart');
  const chart = LightweightCharts.createChart(chartDiv, {
    layout: {background:{type:'solid', color:'#0b1220'}, textColor:'#ced4da'},
    grid: {vertLines:{color:'#1f2937'}, horzLines:{color:'#1f2937'}},
    rightPriceScale:{scaleMargins:{top:0.2,bottom:0.2}},
    timeScale:{timeVisible:true, secondsVisible:false}
  });
  const candleSeries = chart.addCandlestickSeries({upColor:'#26a69a', downColor:'#ef5350', borderUpColor:'#26a69a', borderDownColor:'#ef5350', wickUpColor:'#26a69a', wickDownColor:'#ef5350'});
  const stUpper = chart.addLineSeries({color:'#f59e0b', lineWidth:1});
  const stLower = chart.addLineSeries({color:'#60a5fa', lineWidth:1});
  const ema50Line = chart.addLineSeries({color:'#10b981', lineWidth:1});
  const ema200Line = chart.addLineSeries({color:'#a78bfa', lineWidth:1});

  const rsiChart = LightweightCharts.createChart(rsiDiv, {
    layout: {background:{type:'solid', color:'#0b1220'}, textColor:'#ced4da'},
    grid: {vertLines:{color:'#1f2937'}, horzLines:{color:'#1f2937'}},
    rightPriceScale:{scaleMargins:{top:0.2,bottom:0.2}},
    timeScale:{timeVisible:true, secondsVisible:false}
  });
  const rsiLine = rsiChart.addLineSeries({color:'#22c55e', lineWidth:1});

  function render(){
    const data = state.series[pair];
    candleSeries.setData(data);
    candleSeries.setMarkers(generateMarkers(data));
    const closes = data.map(d=>d.close);
    const ema50Arr = ema(closes, 50);
    const ema200Arr = ema(closes, 200);
    ema50Line.setData(data.map((d,i)=>({time:d.time, value: ema50Arr[i]})));
    ema200Line.setData(data.map((d,i)=>({time:d.time, value: ema200Arr[i]})));

    const st = supertrend(data, 10, 3);
    stUpper.setData(data.map((d,i)=>({time:d.time, value: st.upper[i]})));
    stLower.setData(data.map((d,i)=>({time:d.time, value: st.lower[i]})));

    const rv = rsi(closes, 14);
    rsiLine.setData(data.map((d,i)=>({time:d.time, value: rv[i]||null})));

    const {support, resistance} = pivots(data, 15);
    candleSeries.createPriceLine({price: support, color:'#2563eb', lineWidth:1, lineStyle:2, title:'دعم'});
    candleSeries.createPriceLine({price: resistance, color:'#f59e0b', lineWidth:1, lineStyle:2, title:'مقاومة'});

    const tbody = panel.querySelector('tbody'); tbody.innerHTML='';
    const sigObj = compositeSignal(data);
    const price = data[data.length-1].close;
    panel.querySelector('.price').textContent = price.toFixed(2);
    panel.querySelector('.price').className = 'price pill ' + (price>=data[data.length-2].close?'up':'down');
    const sigSpan = panel.querySelector('.signal');
    sigSpan.textContent = sigObj.sig;
    sigSpan.className = 'signal pill ' + (sigObj.cls||'');

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${(sigObj.rsi14.at(-1)||0).toFixed(1)}</td>
      <td>${sigObj.dir}</td>
      <td>${sigObj.st.trend.at(-1)===1?'صاعد':'هابط'}</td>
      <td>${sigObj.ema50.at(-1).toFixed(1)} / ${sigObj.ema200.at(-1).toFixed(1)}</td>
      <td>${support?support.toFixed(2):'-'}</td>
      <td>${resistance?resistance.toFixed(2):'-'}</td>
      <td>${sigObj.sig}</td>
      <td>${data.at(-1).volume.toFixed(1)}</td>
    `;
    tbody.appendChild(row);
  }

  render();
  return {panel, render, chart, rsiChart};
}

const activePanels = new Map();

function mount(pair){
  if (activePanels.has(pair)) return;
  const {panel, render} = createPanel(pair);
  panels.appendChild(panel);
  activePanels.set(pair, {render});
}

function renderChips(){
  watchlist.innerHTML=''; favorites.innerHTML='';
  state.pairs.forEach(p=>{
    const chip = document.createElement('span');
    chip.className = 'chip active';
    chip.textContent = p;
    chip.onclick = ()=>{
      document.querySelector(`[data-pair="${p}"]`)?.scrollIntoView({behavior:'smooth', block:'center'});
    };
    watchlist.appendChild(chip);
  });
  state.favorites.forEach(p=>{
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = '⭐ '+p;
    chip.onclick = ()=>{
      document.querySelector(`[data-pair="${p}"]`)?.scrollIntoView({behavior:'smooth', block:'center'});
    };
    favorites.appendChild(chip);
  });
}

function addPair(pair){
  pair = pair.toUpperCase().trim();
  if (!pair.endsWith('USDT')) pair += 'USDT';
  if (!state.series[pair]){
    state.series[pair] = seedSeries(1000+Math.random()*2000);
  }
  if (!state.pairs.includes(pair)) state.pairs.push(pair);
  mount(pair);
  renderChips();
}

const addPairBtnEl = document.getElementById('addPairBtn');
addPairBtnEl.addEventListener('click', ()=>{
  const v = document.getElementById('search').value;
  if (!v) return;
  addPair(v);
  document.getElementById('search').value='';
});

function pasteFromText(txt){
  try{
    if (txt.trim().startsWith('[')){
      const arr = JSON.parse(txt);
      const pair = prompt('اسم الزوج لهذه البيانات:','CUSTOMUSDT')||'CUSTOMUSDT';
      state.series[pair] = arr;
      if (!state.pairs.includes(pair)) state.pairs.push(pair);
      mount(pair); renderAll();
    } else {
      const rows = txt.trim().split(/\r?\n/).map(r=>r.split(','));
      const pair = prompt('اسم الزوج لهذه البيانات:','CUSTOMUSDT')||'CUSTOMUSDT';
      state.series[pair] = rows.slice(1).map(r=>({time:Number(r[0]), open:+r[1], high:+r[2], low:+r[3], close:+r[4], volume:+r[5]}));
      if (!state.pairs.includes(pair)) state.pairs.push(pair);
      mount(pair); renderAll();
    }
  }catch(e){ alert('صيغة غير مفهومة.'); }
}

document.getElementById('pasteDataBtn').onclick = async ()=>{
  const txt = await navigator.clipboard.readText().catch(()=>null);
  if (!txt) { alert('لم أستطع قراءة الحافظة. الصق CSV/JSON يدويًا.'); return; }
  pasteFromText(txt);
};

document.getElementById('uploadBtn').onclick = ()=> document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = async (e)=>{
  const file = e.target.files[0]; if (!file) return;
  const text = await file.text();
  pasteFromText(text);
};

document.getElementById('resetBtn').onclick = ()=>{
  document.getElementById('panels').innerHTML='';
  state.pairs = ["BTCUSDT","ETHUSDT"];
  state.series.BTCUSDT = SAMPLE.BTCUSDT;
  state.series.ETHUSDT = SAMPLE.ETHUSDT;
  activePanels.clear();
  state.pairs.forEach(mount);
  renderChips();
};

function renderAll(){
  activePanels.forEach(p=>p.render());
}

state.pairs.forEach(addPair);

function tick(){
  if (!document.getElementById('autoUpdate').checked) return;
  Object.keys(state.series).forEach(pair=>{
    const arr = state.series[pair];
    if (!arr.length) return;
    let last = arr[arr.length-1];
    const jitter = (Math.random()-0.5)* (last.close*0.0008);
    last = {...last};
    last.close = Math.max(last.low*1.0001, Math.min(last.high*0.9999 + Math.abs(jitter), last.close + jitter));
    last.high = Math.max(last.high, last.close);
    last.low = Math.min(last.low, last.close);
    arr[arr.length-1] = last;
  });
  renderAll();
}

setInterval(tick, 1000);
renderChips();
