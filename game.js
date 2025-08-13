window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const gameoverEl = document.getElementById('gameover');
  const startScreen = document.getElementById('startScreen');
  const playBtn = document.getElementById('playBtn');
  if (playBtn) {
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startGame();
    });
  }
  const coinsValueEl = document.getElementById('coinsValue');
  const levelNameEl = document.getElementById('levelValue');
  const recordValueEl = document.getElementById('recordValue');
  let bestScore = Number(localStorage.getItem('bestScore')) || 0;

  // ===== Облака (статичные) =====
  let cloudsFar = [], cloudsMid = [], cloudsNear = [];
  function generateClouds(){
    const w = canvas.clientWidth, h = canvas.clientHeight; const baseSpacing = 420; const rng = mulberry32(987654321);
    cloudsFar = []; cloudsMid = []; cloudsNear = [];
    const y1 = Math.max(16, h * 0.12), y2 = Math.max(32, h * 0.20), y3 = Math.max(48, h * 0.28);
    for(let x = 0; x < w + baseSpacing; x += baseSpacing){ if(rng() > 0.5) cloudsFar.push({ x: x + rng()*80, y: y1 + rng()*10, s: 28 + rng()*8 }); }
    for(let x = 0; x < w + baseSpacing; x += baseSpacing){ if(rng() > 0.5) cloudsMid.push({ x: x + rng()*80, y: y2 + rng()*12, s: 34 + rng()*10 }); }
    for(let x = 0; x < w + baseSpacing; x += baseSpacing){ if(rng() > 0.5) cloudsNear.push({ x: x + rng()*80, y: y3 + rng()*14, s: 40 + rng()*12 }); }
  }

  // ===== Canvas scaling =====
  function resizeCanvas(){
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    generateClouds();
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ===== Константы =====
  const GROUND_Y = () => canvas.clientHeight * 0.8;
  const GRAVITY = 0.8;
  const JUMP_VELOCITY = -14;
  const MAX_JUMP_HEIGHT = Math.abs(JUMP_VELOCITY) ** 2 / (2 * GRAVITY);
  const SCROLL_SPEED_BASE = 6;
  const SPAWN_INTERVAL_MIN = 1400;
  const SPAWN_INTERVAL_MAX = 2000;

  const levels = [
    { name: 'Ларёк',          min: 0  },
    { name: 'Магазин',        min: 10 },
    { name: 'Супермаркет',    min: 20 },
    { name: 'Торговый центр', min: 35 },
    { name: 'Мегацентр',      min: 55 },
  ];

  // ===== Состояние =====
  const state = { running:false, time:0, lastSpawn:0, rng: mulberry32(123456789), coins:0, scroll:0 };
  let started = false;

  // Игрок
  const player = { x: () => canvas.clientWidth * 0.18, y: 0, vy: 0, w: 36, h: 54, onGround: false, frame: 0, frameTime: 0 };
  player.y = GROUND_Y() - player.h;

  const obstacles = [], coins = [];

  // ===== Утилиты =====
  function mulberry32(a){ return function(){ let t = a += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; } }
  function rand(min,max){ return min + (max - min) * state.rng(); }
  function getCSS(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  // ===== Ввод =====
  function jump(){ if(!state.running || !started) return; if(player.onGround){ player.vy = JUMP_VELOCITY; player.onGround = false; } }

  // Клавиши: старт по Space/↑/W, затем прыжок
  window.addEventListener('keydown', (e) => {
    if(['Space','ArrowUp','KeyW'].includes(e.code)){
      e.preventDefault();
      if(!started){ startGame(); } else { jump(); }
    }
    if(e.code === 'KeyR'){ e.preventDefault(); if(started) restart(); }
  });

  // Тап/клик: старт, далее прыжок
  window.addEventListener('pointerdown', () => { if(!started){ startGame(); } else { jump(); } });

  function startGame(){ if (started) return; started = true; startScreen.style.display = 'none'; restart(); }
  if (startScreen) startScreen.addEventListener('click', (e) => { if(e.target && e.target.id === 'playBtn') return; startGame(); });

  // ===== Цикл =====
  let last; requestAnimationFrame(tick);
  function tick(ts){ if(!last) last = ts; const dt = Math.min(32, ts - last); last = ts; if(state.running){ update(dt/16.6667); } draw(); requestAnimationFrame(tick); }

  // ===== Update =====
  function update(t){
    state.time += t * 16.6667;
    const speed = SCROLL_SPEED_BASE + Math.min(8, state.coins * 0.08);
    state.scroll += speed * t;

    // Физика игрока
    player.vy += GRAVITY * t; player.y  += player.vy * t;
    const ground = GROUND_Y() - player.h;
    if(player.y >= ground){ player.y = ground; player.vy = 0; if(!player.onGround) player.frameTime = 0; player.onGround = true; } else { player.onGround = false; }

    // Анимация бега
    if(player.onGround){ player.frameTime += t * 16.6667; if(player.frameTime > 120){ player.frame = 1 - player.frame; player.frameTime = 0; } } else { player.frame = 0; }

    // Спавн
    const due = rand(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX) / (1 + state.coins * 0.01);
    if(state.time - state.lastSpawn > due){ spawnChunk(); state.lastSpawn = state.time; }

    // Движение мира
    for(const o of obstacles){ o.x -= speed * t; }
    for(const c of coins){     c.x -= speed * t; }

    // Столкновения
    for(const o of obstacles){ if(rectIntersect(player.x(), player.y, player.w, player.h, o.x, o.y, o.w, o.h)){ gameOver(); break; } }

    // Подбор монет
    let picked = 0;
    for(let i = coins.length - 1; i >= 0; i--){
      const c = coins[i];
      if(circleRectIntersect(c.x, c.y, c.r, player.x(), player.y, player.w, player.h)){
        coins.splice(i, 1);
        const val = c.type === 'red' ? -3 : 1;
        state.coins += val;
        picked += val;
      }
    }
    if(picked !== 0) updateProgressHUD();

    // Удаляем ушедшие
    while(obstacles[0] && obstacles[0].x + obstacles[0].w < -50) obstacles.shift();
    while(coins[0]     && coins[0].x + coins[0].r < -50)     coins.shift();
  }

  function spawnChunk(){
    const baseY = GROUND_Y();
    const height = 24 + Math.floor(rand(0, 18));
    const width  = 24 + Math.floor(rand(0, 18));
    const minDist = state.coins >= 30 ? 30 : 60; const maxDist = 200; const offsetX = rand(minDist, maxDist);
    obstacles.push({ x: canvas.clientWidth + 40 + offsetX, y: baseY - height, w: width, h: height });
    const curr = obstacles[obstacles.length - 1];
    const prev = obstacles[obstacles.length - 2];
    if(prev && curr){
      const gapStart = prev.x + prev.w;
      const gapEnd = curr.x;
      const margin = 12;
      if(gapEnd - gapStart > margin * 2){
        const coinX = gapStart + margin + (gapEnd - gapStart - margin * 2) / 2;
        const type = state.rng() < 0.3 ? 'red' : 'yellow';
        const coinY = baseY - rand(player.h + 10, Math.min(player.h + MAX_JUMP_HEIGHT - 10, player.h + 140));
        coins.push({ x: coinX, y: coinY, r: 9, type });
      }
    }
  }

  // ===== Параллакс =====
  function drawParallax(w, h){
    const ground = GROUND_Y();
    drawCloudsLayer(w, h); // облака статичны
    drawMountainsLayer(w, h, ground, 0.22, 150, '#0b1325');
    drawMountainsLayer(w, h, ground, 0.35, 110, '#121a2c');
    drawCityLayer(w, h, ground, 0.6, 90, '#1b2234', '#263147');
  }

  function drawMountainsLayer(w, h, ground, factor, peakH, color){
    const patternW = 240; const offset = -((state.scroll * factor) % patternW);
    ctx.save(); ctx.fillStyle = color;
    for(let x = offset - patternW; x < w + patternW; x += patternW){ ctx.beginPath(); ctx.moveTo(x, ground); ctx.lineTo(x + patternW*0.25, ground - peakH*0.7); ctx.lineTo(x + patternW*0.5, ground - peakH); ctx.lineTo(x + patternW*0.75, ground - peakH*0.65); ctx.lineTo(x + patternW, ground); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }

  function drawCityLayer(w, h, ground, factor, maxH, body, accents){
    const patternW = 220; const offset = -((state.scroll * factor) % patternW);
    ctx.save();
    for(let x = offset - patternW; x < w + patternW; x += patternW){
      const base = ground - 6; const buildings = [ {w:40,h:maxH*0.9}, {w:26,h:maxH*0.6}, {w:32,h:maxH*0.75}, {w:24,h:maxH*0.55}, {w:36,h:maxH*0.8} ];
      let curX = x;
      for(const b of buildings){ ctx.fillStyle = body; ctx.fillRect(curX, base - b.h, b.w, b.h); ctx.fillStyle = accents; ctx.fillRect(curX, base - b.h - 4, b.w, 4); ctx.fillStyle = '#8ea3c2'; const winSize = 3, gap = 6; for(let wy = base - b.h + 10; wy < base - 8; wy += gap + winSize){ for(let wx = curX + 4; wx < curX + b.w - 6; wx += gap + winSize){ ctx.globalAlpha = ((wx + wy) % 2 === 0) ? 0.55 : 0.25; ctx.fillRect(wx, wy, winSize, winSize); } } ctx.globalAlpha = 1; curX += b.w + 6; }
    }
    ctx.restore();
  }

  function drawCloudsLayer(w, h){ ctx.save(); ctx.imageSmoothingEnabled = true; ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.15; for(const c of cloudsFar){ cloudShape(c.x, c.y, c.s); } ctx.globalAlpha = 0.25; for(const c of cloudsMid){ cloudShape(c.x, c.y, c.s); } ctx.globalAlpha = 0.35; for(const c of cloudsNear){ cloudShape(c.x, c.y, c.s); } ctx.globalAlpha = 1; ctx.restore(); }
  function cloudShape(cx, cy, size){ ctx.beginPath(); ctx.arc(cx, cy, size*0.38, 0, Math.PI*2); ctx.arc(cx - size*0.50, cy + size*0.05, size*0.33, 0, Math.PI*2); ctx.arc(cx + size*0.50, cy + size*0.05, size*0.33, 0, Math.PI*2); ctx.arc(cx - size*0.20, cy - size*0.18, size*0.28, 0, Math.PI*2); ctx.arc(cx + size*0.20, cy - size*0.18, size*0.28, 0, Math.PI*2); ctx.fill(); }

  // ===== Отрисовка =====
  function draw(){
    const w = canvas.clientWidth, h = canvas.clientHeight; ctx.clearRect(0, 0, w, h); drawParallax(w, h);
    ctx.strokeStyle = getCSS('--muted'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, GROUND_Y() + 0.5); ctx.lineTo(w, GROUND_Y() + 0.5); ctx.stroke();
    for(const c of coins){
      ctx.fillStyle = c.type === 'red' ? getCSS('--danger') : getCSS('--accent');
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for(const o of obstacles){ ctx.fillStyle = getCSS('--danger'); ctx.fillRect(o.x, o.y, o.w, o.h); }
    drawPixelDude(player.x(), player.y, player.w, player.h, player.frame, !player.onGround);
  }

  // Спрайт персонажа
  const RUN0 = ['000011100000','000111110000','000111110000','000011100000','000022200000','000022200000','000222220000','000022200000','000222220000','000020214440','000020144400','000030044400','000030000000','000030000000','000300000000','000300000000'];
  const RUN1 = ['000011100000','000111110000','000111110000','000011100000','000022200000','000022200000','000222220000','000022200000','000222220000','000020214440','000020144400','003000044400','003000000000','000300000000','000000300000','000000300000'];
  function drawPixelDude(x,y,w,h,frame,isJump){ const grid = (frame === 0 || isJump) ? RUN0 : RUN1; const colSkin = '#f1c27d', colShirt = '#ffffff', colLegs = '#333333', colCase = '#5c4433'; const cols = 12, rows = 16; const sx = w/cols, sy = h/rows; ctx.save(); ctx.imageSmoothingEnabled = false; for(let r=0;r<rows;r++){ const line = grid[r]; for(let c=0;c<cols;c++){ const code=line[c]; if(code==='0') continue; ctx.fillStyle = (code==='1') ? colSkin : (code==='2') ? colShirt : (code==='3') ? colLegs : colCase; ctx.fillRect(Math.floor(x + c*sx), Math.floor(y + r*sy), Math.ceil(sx), Math.ceil(sy)); } } ctx.restore(); }

  // ===== HUD =====
  function getLevelName(coins){ let name = levels[0].name; for(const l of levels){ if(coins >= l.min) name = l.name; } return name; }
  function updateProgressHUD(){ coinsValueEl.textContent = state.coins; levelNameEl.textContent = getLevelName(state.coins); recordValueEl.textContent = bestScore; }

  // ===== Game over / Restart =====
  function gameOver(){
    state.running = false;
    const levelName = getLevelName(state.coins);
    if(state.coins > bestScore){ bestScore = state.coins; localStorage.setItem('bestScore', bestScore); }
    updateProgressHUD();
    gameoverEl.innerHTML = `<div class=\"gameover-card\"><div class=\"gameover-title\">Всё!</div><div class=\"gameover-sub\">Вы заработали <strong>${state.coins}</strong> монет</div><div class=\"gameover-sub\">Ваш уровень: <strong>${levelName}</strong></div><div class=\"gameover-sub\">Рекорд: <strong>${bestScore}</strong></div><button id=\"retryBtn\" class=\"btn btn-accent\" type=\"button\">Ещё раз</button></div>`;
    gameoverEl.style.display='flex';
    const retryBtn = document.getElementById('retryBtn');
    if(retryBtn){ retryBtn.addEventListener('click', () => { gameoverEl.style.display='none'; started = true; restart(); }); }
  }
  function restart(){ obstacles.length=0; coins.length=0; state.running=true; state.coins=0; state.time=0; state.lastSpawn=0; state.scroll=0; player.y=GROUND_Y()-player.h; player.vy=0; player.onGround=true; player.frame=0; player.frameTime=0; updateProgressHUD(); spawnChunk(); }

  // ===== Геометрия =====
  function rectIntersect(x1,y1,w1,h1,x2,y2,w2,h2){ return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2; }
  function circleRectIntersect(cx,cy,cr,rx,ry,rw,rh){ const closestX = Math.max(rx, Math.min(cx, rx + rw)); const closestY = Math.max(ry, Math.min(cy, ry + rh)); const dx = cx - closestX, dy = cy - closestY; return (dx*dx + dy*dy) <= cr*cr; }
});
