(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const p1ScoreEl = document.getElementById('p1Score');
  const probEl = document.getElementById('problemText');
  const timerEl = document.getElementById('timer');
  const nameInput = document.getElementById('playerName');
  const transientOverlay = document.getElementById('transientOverlay');
  const transientTitle = document.getElementById('transientTitle');
  const transientBody = document.getElementById('transientBody');
  const startScreen = document.getElementById('startScreen');
  const endScreen = document.getElementById('endScreen');
  const resultTitle = document.getElementById('resultTitle');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const bgm = document.getElementById('bgm');
  const victorySound = document.getElementById('victorySound');
  // Basic game constants and helpers (ensure these exist before other functions)
  let TILE = 32;
  function resizeCanvas(){
    // choose TILE based on available width for small screens
    const w = window.innerWidth;
    if(w <= 360) TILE = 16;
    else if(w <= 420) TILE = 20;
    else if(w <= 600) TILE = 24;
    else TILE = 32;

    // compute grid size to fit the viewport (leave room for HUD ~120px)
    const rawGridW = Math.max(10, Math.floor(window.innerWidth / TILE));
    const rawGridH = Math.max(8, Math.floor((window.innerHeight - 120) / TILE));
    gridW = rawGridW; gridH = rawGridH;

    // handle devicePixelRatio for crisp rendering
    const scale = window.devicePixelRatio || 1;
    canvas.style.width = (gridW * TILE) + 'px';
    canvas.style.height = (gridH * TILE) + 'px';
    canvas.width = gridW * TILE * scale;
    canvas.height = gridH * TILE * scale;
    ctx.setTransform(scale,0,0,scale,0,0);

    W = canvas.width / (window.devicePixelRatio || 1);
    H = canvas.height / (window.devicePixelRatio || 1);
  }
  let W = 0, H = 0, gridW = 12, gridH = 8;
  resizeCanvas(); window.addEventListener('resize', resizeCanvas);

  // Simple helpers
  function rInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
  function choice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function signWrap(n){ return (n<0) ? `(${n})` : String(n); }

  // Core game state (initialize minimal fields)
  const game = { snakes: [], answers: [], powerUps: [], problem: null };
  let scores = { p1: 0 };
  let state = 'start';
  let lastTs = 0;
  let timer = 300000; // 5 minutes default
  let currentLevel = 1;
  let levelProgress = 0;
  let comboCount = 0;
  let comboMultiplier = 1;
  let activePowerUps = [];
  let achievedEliteStreak = false;
  let lastCompletedLevel = 0;
  let playerName = '';
  let acc = 0;

  // desired AI timing per level (seconds for correct AI to reach correct answer)
  const levelTimes = { 1:6, 2:5, 3:5, 4:4, 5:3, 6:3 };

  // Rotate/portrait overlay handling: show overlay when height > width (portrait)
  const rotateOverlay = document.getElementById('rotateOverlay');
  let _wasPlayingBeforeRotate = false;
  function checkOrientation(){
    try{
      const isPortrait = window.innerHeight > window.innerWidth;
      if(isPortrait){
        if(rotateOverlay) rotateOverlay.classList.remove('hidden');
        // pause gameplay while in portrait
        if(state === 'playing'){ _wasPlayingBeforeRotate = true; state = 'paused'; }
      } else {
        if(rotateOverlay) rotateOverlay.classList.add('hidden');
        if(_wasPlayingBeforeRotate){ state = 'playing'; _wasPlayingBeforeRotate = false; }
      }
    }catch(e){ /* ignore */ }
  }
  // run on load and on resize/orientation changes
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', ()=>{ setTimeout(checkOrientation, 120); });
  setTimeout(checkOrientation, 50);
  function genProblem(){
    if(currentLevel===3){
      ops = ['+','-','*']; // add multiplication
      numRange = 20;
    } else {
      ops = ['+','-','*','/']; // all operations
      numRange = currentLevel===4 ? 25 : 30; // level 5 = harder numbers
    }

    const op=choice(ops);
    let a=0,b=0,correct=0;

    if(op==='+'||op==='-'){
      a=rInt(-numRange,numRange); b=rInt(-numRange,numRange);
      correct = op==='+'? a+b : a-b;
    } else if(op==='*'){
      // Multiplication: pick factors within a reasonable range and keep products reasonable
      let tries=0;
      const maxProd = currentLevel===5 ? 200 : 144;
      do {
        a=rInt(-12,12); b=rInt(-12,12);
        correct = a*b;
        tries++;
      } while((Math.abs(correct)>maxProd || (a===0 && b===0)) && tries<200);
    } else { // division with integer result
      // Generate division so the quotient is always an integer by building dividend = divisor * quotient
      let tries=0; let q=0;
      do {
        b = rInt(-12,12); // divisor
        if(b===0){ tries++; continue; }
        q = rInt(-15,15); // quotient (the correct answer) - larger for level 5
        a = b * q; // dividend
        correct = q;
        tries++;
      } while((b===0 || Math.abs(a) > 30) && tries < 500);

      // Fallback: if above failed, pick dividend then choose a divisor from its exact divisors
      if(tries >= 500){
        a = rInt(-numRange,numRange);
        let candidates = [];
        const absA = Math.abs(a);
        for(let i=1;i<=20;i++){
          if(absA % i === 0) { candidates.push(i, -i); }
        }
        if(candidates.length === 0) candidates = [1, -1];
        b = choice(candidates);
        if(b === 0) b = 1;
        correct = Math.trunc(a / b);
      }
    }

    const offsets=[-6,-5,-4,-3,-2,-1,1,2,3,4,5,6];
    const wrongs=new Set();
    while(wrongs.size<3){
      const off=choice(offsets); const cand=correct+off;
      if(cand===correct) continue;
      if(cand<-200||cand>200) continue;
      wrongs.add(cand);
    }
    const all=[...wrongs, correct].map(v=>({value:v,isCorrect:v===correct,x:0,y:0}));
    // shuffle
    for(let i=all.length-1;i>0;i--){const j=rInt(0,i); [all[i],all[j]]=[all[j],all[i]];}
    const sym = op==='*' ? '×' : (op==='/' ? '÷' : op);
    const text=`${signWrap(a)} ${sym} ${signWrap(b)} = ?`;
    return { a,b,op,correct,choices:all, text };
  }

  function occupyMap(){
    const occ=new Set();
    for(const s of game.snakes){for(const seg of s.segs){occ.add(seg.x+','+seg.y);} }
    return occ;
  }
  function placeAnswers(){
    const occ=occupyMap();
    const placed=[];
    const minDist=3;
    function isFarEnough(x,y){
      for(const p of placed){if(Math.abs(p.x-x)+Math.abs(p.y-y)<minDist) return false;}
      return true;
    }
    for(const ch of game.problem.choices){
      let tries=0; let x,y;
      do{
        x=rInt(1,gridW-2); y=rInt(1,gridH-2);
        tries++;
      } while((occ.has(x+','+y) || !isFarEnough(x,y)) && tries<200);
      ch.x=x; ch.y=y; placed.push({x,y});
    }
    game.answers=game.problem.choices;
    // adjust AI speeds/targets whenever answers are placed
    adjustAISpeeds();
    // randomly spawn a power-up (10% chance)
    if(Math.random()<0.1){
      spawnPowerUp();
    }
  }

  function spawnPowerUp(){
    const types = ['speedBoost','aiSlow','shield'];
    const type = choice(types);
    const x = rInt(1,gridW-2);
    const y = rInt(1,gridH-2);
    game.powerUps.push({type, x, y, spawnedAt: lastTs});
  }

  class Snake{
    constructor(x,y,color, moveIntervalMs=120){
      this.color=color; this.dir={x:1,y:0}; this.nextDir={x:1,y:0};
      this.segs=[]; for(let i=0;i<5;i++) this.segs.push({x:x-i,y});
      this.grow=0; this.lastTurnTs=0;
      this.moveInterval = moveIntervalMs; // ms per tile for this snake
      this.lastStepTs = 0;
      this.isAI = false;
      this.target = null;
    }
    setDir(dx,dy){
      if(dx===-this.dir.x && dy===-this.dir.y) return; // no 180 flip
      this.nextDir={x:dx,y:dy};
    }
    step(){
      this.dir=this.nextDir;
      const head=this.segs[0];
      let nx=head.x+this.dir.x, ny=head.y+this.dir.y;
      // bounce on bounds
      if(nx<0||nx>=gridW){ this.dir.x*=-1; nx=head.x+this.dir.x; }
      if(ny<0||ny>=gridH){ this.dir.y*=-1; ny=head.y+this.dir.y; }
      this.segs.unshift({x:nx, y:ny});
      if(this.grow>0){ this.grow--; } else { this.segs.pop(); }
      // self-collision penalty
      for(let i=1;i<this.segs.length;i++){
        if(this.segs[i].x===nx && this.segs[i].y===ny){
          this.segs.pop();
          break;
        }
      }
    }
  }

  class AISnake extends Snake{
    constructor(x,y,color){
      super(x,y,color,120);
      this.isAI = true;
    }
    // simple greedy targeter: set nextDir towards target (avoid 180)
    aimAt(target){
      if(!target) return;
      const head=this.segs[0];
      const dx = target.x - head.x; const dy = target.y - head.y;
      // prefer horizontal or vertical based on larger distance
      let nx=0, ny=0;
      if(Math.abs(dx) >= Math.abs(dy)) nx = Math.sign(dx); else ny = Math.sign(dy);
      // avoid immediate 180
      if(nx === -this.dir.x && ny === -this.dir.y){ // choose the other axis
        if(nx!==0){ nx = 0; ny = Math.sign(dy); } else { ny = 0; nx = Math.sign(dx); }
      }
      if(nx===0 && ny===0) return;
      this.setDir(nx, ny);
    }
  }

  const p1=new Snake(4, Math.floor(gridH/2), '#56f1ff', 120);
  const aiCorrect=new AISnake(Math.max(8, Math.floor(gridW/2)), Math.floor(gridH/3), '#ff7f7f');
  const aiWrong=new AISnake(Math.max(8, Math.floor(gridW/2)), Math.floor(gridH*2/3), '#d1ff7f');
  game.snakes=[p1, aiCorrect, aiWrong];

  // Input
  const keys=new Set();
  window.addEventListener('keydown', (e)=>{
    if(state!=='playing') return;
    // Accept arrow keys primarily; keep WASD as fallback/compatibility
    switch(e.key){
      case 'ArrowUp': case 'w': case 'W': p1.setDir(0,-1); break;
      case 'ArrowLeft': case 'a': case 'A': p1.setDir(-1,0); break;
      case 'ArrowDown': case 's': case 'S': p1.setDir(0,1); break;
      case 'ArrowRight': case 'd': case 'D': p1.setDir(1,0); break;
    }
  });
  document.getElementById('mobileControls').addEventListener('pointerdown', (e)=>{
    const b=e.target.closest('button'); if(!b||state!=='playing') return;
    e.preventDefault();
    const dir=b.getAttribute('data-dir');
    const map={up:[0,-1], down:[0,1], left:[-1,0], right:[1,0]};
    const [dx,dy]=map[dir]; p1.setDir(dx,dy);
  });

  function drawGrid(){
    // canvas background from CSS var if available
    const cs = getComputedStyle(document.documentElement);
    const canvasBg = cs.getPropertyValue('--canvas-bg') || '#0a0d1a';
    ctx.fillStyle=canvasBg.trim() || '#0a0d1a'; ctx.fillRect(0,0,W,H);
    drawWatermark();
  }

  function drawWatermark(){
    const text = 'SUMIMAO NATIONAL HIGH SCHOOL';
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const spacingX = 300; const spacingY = 160;
    for(let y = -spacingY; y < H + spacingY; y += spacingY){
      for(let x = -spacingX; x < W + spacingX; x += spacingX){
        ctx.save();
        ctx.translate(x + (y/4), y);
        ctx.rotate(-0.3);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  function drawSnake(s){
    ctx.fillStyle=s.color; ctx.strokeStyle='#00000040';
    for(let i=0;i<s.segs.length;i++){
      const seg=s.segs[i];
      const x=seg.x*TILE, y=seg.y*TILE;
      ctx.beginPath(); ctx.rect(x+1,y+1,TILE-2,TILE-2); ctx.fill(); ctx.stroke();
    }
  }
  function drawAnswers(){
    ctx.fillStyle='#3b4aa8'; ctx.strokeStyle='#202a6a';
    for(const a of game.answers){
      const x=a.x*TILE, y=a.y*TILE;
      ctx.beginPath(); ctx.rect(x+2,y+2,TILE-4,TILE-4); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#e9ecf1'; ctx.font='bold 14px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(String(a.value), x+TILE/2, y+TILE/2);
      ctx.fillStyle='#3b4aa8';
    }
  }

  function drawPowerUps(){
    for(const p of game.powerUps){
      const x=p.x*TILE, y=p.y*TILE;
      let color='#ffff00'; let sym='⚡';
      if(p.type==='speedBoost'){ color='#00ff00'; sym='⚡'; }
      else if(p.type==='aiSlow'){ color='#00ffff'; sym='❄'; }
      else if(p.type==='shield'){ color='#ff00ff'; sym='🛡'; }
      ctx.fillStyle=color; ctx.strokeStyle='#ffffff40';
      ctx.beginPath(); ctx.arc(x+TILE/2, y+TILE/2, TILE/2-2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#000000'; ctx.font='bold 16px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(sym, x+TILE/2, y+TILE/2);
    }
  }

  function updateHUD(){
    p1ScoreEl.textContent='Score: '+scores.p1;
    probEl.textContent=game.problem?game.problem.text:'Press Start to play!';
    const levelEl = document.getElementById('levelText'); if(levelEl) levelEl.textContent = 'Level: '+currentLevel;
    const nameEl = document.getElementById('playerNameDisplay');
    if(nameEl) nameEl.textContent = playerName ? playerName : '';
    // show combo
    const comboEl = document.getElementById('comboText');
    if(comboEl){
      if(comboCount>0){
        comboEl.textContent = `Combo: ${comboCount}${comboMultiplier>1 ? ' ×'+comboMultiplier.toFixed(1) : ''}`;
        comboEl.style.color = comboMultiplier>1 ? '#ffff00' : '#e9ecf1';
      } else {
        comboEl.textContent = '';
      }
    }
    // show active power-ups
    const powerUpEl = document.getElementById('powerUpText');
    if(powerUpEl){
      const active = activePowerUps.filter(p=>p.expiresAt>lastTs).map(p=>{
        const icons = {speedBoost:'⚡',aiSlow:'❄',shield:'🛡'};
        return icons[p.type]||'?';
      }).join(' ');
      powerUpEl.textContent = active ? `Active: ${active}` : '';
    }
    const t=Math.max(0,Math.floor(timer/1000)); const m=String(Math.floor(t/60)).padStart(2,'0'); const s=String(t%60).padStart(2,'0');
    timerEl.textContent=`${m}:${s}`;
  }

  function checkEats(){
    // check power-up collection
    for(const s of game.snakes){
      const head=s.segs[0];
      for(let i=game.powerUps.length-1;i>=0;i--){
        const p = game.powerUps[i];
        if(head.x===p.x && head.y===p.y && s===p1){
          // collect power-up
          activatePowerUp(p.type);
          game.powerUps.splice(i,1);
          break;
        }
      }
    }
    // check answer collection
    for(const s of game.snakes){
      const head=s.segs[0];
      for(const a of game.answers){
        if(head.x===a.x && head.y===a.y){
          s.grow+=1; // grow for any tile
          if(a.isCorrect){
            if(s===p1){
              // increment combo
              comboCount++;
              comboMultiplier = comboCount>=3 ? 1.5 : 1;
              // mark elite streak if player reaches 5 consecutive correct answers
              if(comboCount>=5) achievedEliteStreak = true;
              // apply combo multiplier to score
              const basePoints = 1;
              const pointsGained = Math.floor(basePoints * comboMultiplier);
              scores.p1 += pointsGained;
              levelProgress += pointsGained;
              // check level progression based on levelProgress (5 points per level)
              if(levelProgress>=5){
                if(currentLevel<6){
                  const completedLevel = currentLevel;
                  lastCompletedLevel = completedLevel;
                  currentLevel++;
                  levelProgress = 0; // keep total score intact
                  comboCount = 0; comboMultiplier = 1; // reset combo on level up
                  // play victory sound
                  if(victorySound){ victorySound.currentTime=0; victorySound.play().catch(()=>{}); }
                  // show transient completion message with player name
                  state='paused';
                  showTransient(`${playerName} completed Level ${completedLevel}`, '', 2000, ()=>{
                    game.problem = genProblem(); placeAnswers(); adjustAISpeeds();
                    state='playing';
                  });
                } else {
                  // Completed final level: congratulate and show name + title
                  lastCompletedLevel = currentLevel;
                  if(victorySound){ victorySound.currentTime=0; victorySound.play().catch(()=>{}); }
                  state='ended'; startScreen.classList.add('hidden'); endScreen.classList.remove('hidden');
                  // choose title based on elite streak
                  const title = achievedEliteStreak ? 'Elite Integer Master' : 'Integer Master';
                  resultTitle.textContent = `Congratulations ${playerName} — ${title}`;
                  if(bgm){ bgm.pause(); bgm.currentTime=0; }
                }
                updateHUD();
                return;
              }
            } else {
              // AI took the correct answer; reset player's combo
              comboCount = 0; comboMultiplier = 1;
            }
            game.problem=genProblem(); placeAnswers();
            return; // answers replaced, stop further processing this tick
          } else {
            // wrong answer: penalize player if they ate it, then remove tile
            if(s===p1){
              // check if shield is active
              const hasShield = activePowerUps.some(p=>p.type==='shield' && p.expiresAt>lastTs);
              if(hasShield){
                // shield protects from wrong answer
                activePowerUps = activePowerUps.filter(p=>!(p.type==='shield' && p.expiresAt>lastTs));
              } else {
                scores.p1 = Math.max(0, scores.p1 - 1);
                comboCount = 0; comboMultiplier = 1; // reset combo on wrong answer
              }
            }
            a.x=-999; a.y=-999;
          }
        }
      }
    }
    // purge off-canvas tiles
    game.answers=game.answers.filter(a=>a.x>=0);
    // purge expired power-ups
    game.powerUps=game.powerUps.filter(p=>p.spawnedAt+10000>lastTs);
  }

  function activatePowerUp(type){
    const expiresAt = lastTs + 10000; // 10 seconds
    activePowerUps.push({type, expiresAt});
    if(type==='speedBoost'){
      p1.moveInterval = 70; // boost speed
    } else if(type==='aiSlow'){
      // slow down AI for 10 seconds
      const aiCorrect = game.snakes.find(s=>s.isAI && s.color==='#ff7f7f');
      const aiWrong = game.snakes.find(s=>s.isAI && s.color==='#d1ff7f');
      if(aiCorrect) aiCorrect._slowedUntil = expiresAt;
      if(aiWrong) aiWrong._slowedUntil = expiresAt;
    }
    // shield type just adds to activePowerUps, checked in checkEats
  }

  function adjustAISpeeds(){
    // Called after answers are placed. Set AI targets and moveIntervals so aiCorrect reaches correct answer in levelTimes[currentLevel] seconds.
    const correct = game.answers.find(a=>a.isCorrect);
    const wrongs = game.answers.filter(a=>!a.isCorrect);
    if(!correct) return;
    const desiredSec = levelTimes[currentLevel] || 5;
    // compute steps (Manhattan) from ai heads to their targets
    const aiCorrect = game.snakes.find(s=>s.isAI && s.color==='#ff7f7f');
    const aiWrong = game.snakes.find(s=>s.isAI && s.color==='#d1ff7f');
    if(aiCorrect){
      aiCorrect.target = {x:correct.x, y:correct.y};
      const steps = Math.max(1, Math.abs(aiCorrect.segs[0].x-correct.x) + Math.abs(aiCorrect.segs[0].y-correct.y));
      aiCorrect.moveInterval = Math.max(50, Math.min(1000, Math.floor((desiredSec*1000)/steps)));
      aiCorrect.lastStepTs = lastTs;
    }
    if(aiWrong){
      const pick = choice(wrongs) || correct;
      aiWrong.target = {x:pick.x, y:pick.y};
      const stepsW = Math.max(1, Math.abs(aiWrong.segs[0].x-pick.x) + Math.abs(aiWrong.segs[0].y-pick.y));
      // make wrong AI a bit slower so it doesn't always beat correct AI
      aiWrong.moveInterval = Math.max(80, Math.min(1200, Math.floor((desiredSec*1200)/stepsW)));
      aiWrong.lastStepTs = lastTs;
    }
    // Boost player speed in level 5 for a fair challenge
    if(currentLevel===5){
      p1.moveInterval = 80; // faster than default 120ms
    }
  }

  function loop(ts){
    const dt = ts - (lastTs || ts); lastTs = ts; if(state!=='playing'){ requestAnimationFrame(loop); return; }
    timer -= dt; if(timer<=0){ endMatch(); }

    // For each snake, perform however many steps are due based on its moveInterval
    for(const s of game.snakes){
      if(!s.lastStepTs) s.lastStepTs = ts;
      // apply slow effect if active
      let interval = s.moveInterval;
      if(s.isAI && s._slowedUntil && s._slowedUntil > ts){
        interval *= 2; // half speed
      }
      const due = Math.floor((ts - s.lastStepTs) / interval);
      if(due > 0){
        for(let i=0;i<due;i++){
          if(s.isAI && s.target) s.aimAt(s.target);
          s.step();
          checkEats();
        }
        s.lastStepTs = ts;
      }
    }

    drawGrid(); drawAnswers(); drawPowerUps(); for(const s of game.snakes) drawSnake(s); updateHUD();
    requestAnimationFrame(loop);
  }

  function startMatch(){
    // ensure player has entered a name
    if(!playerName || !playerName.trim()){
      if(nameInput){ nameInput.focus(); }
      return;
    }
    state='playing'; scores.p1=0; levelProgress=0; comboCount=0; comboMultiplier=1; activePowerUps=[]; timer=300000; acc=0; lastTs=0;
    // reset snake
    // reset player snake
    game.snakes = [p1];
    game.powerUps = [];
    p1.segs = [];
    for(let i=0;i<5;i++){ p1.segs.push({x:4-i,y:Math.floor(gridH/2)}); }
    p1.dir={x:1,y:0}; p1.nextDir=p1.dir; p1.grow=0; p1.moveInterval = 120; p1.lastStepTs = 0;
    // recreate & position AI snakes
    const aiCorrect = new AISnake(Math.max(8, Math.floor(gridW/2)), Math.floor(gridH/3), '#ff7f7f');
    const aiWrong = new AISnake(Math.max(8, Math.floor(gridW/2)), Math.floor(gridH*2/3), '#d1ff7f');
    game.snakes.push(aiCorrect, aiWrong);
    currentLevel = 1;
    game.problem = genProblem(); placeAnswers(); adjustAISpeeds(); updateHUD();
    startScreen.classList.add('hidden'); endScreen.classList.add('hidden');
    if(bgm){ bgm.currentTime=0; bgm.volume=0.6; bgm.play().catch(()=>{}); }
  }
  function endMatch(){
    state='ended'; startScreen.classList.add('hidden'); endScreen.classList.remove('hidden');
    const levelText = lastCompletedLevel>0 ? `Highest Level Completed: ${lastCompletedLevel}` : 'No levels completed';
    let titleSuffix = '';
    if(achievedEliteStreak){ titleSuffix = ' — Elite Integer Master'; }
    resultTitle.textContent=`Game Over — ${playerName ? playerName + ' — ' : ''}Score: ${scores.p1} | ${levelText}${titleSuffix}`;
    if(victorySound){ victorySound.currentTime=0; victorySound.play().catch(()=>{}); }
    if(bgm){ bgm.pause(); bgm.currentTime=0; }
  }

  startBtn.addEventListener('click', ()=>{ startMatch(); });
  // enable/disable start button based on player name input
  if(nameInput){
    nameInput.addEventListener('input', (e)=>{
      playerName = (e.target.value||'').trim();
      startBtn.disabled = !playerName;
    });
  }
  restartBtn.addEventListener('click', ()=>{ startMatch(); });

  // transient overlay helper
  function showTransient(title, body, ms, cb){
    if(!transientOverlay||!transientTitle) { if(cb) cb(); return; }
    transientTitle.textContent = title||'';
    transientBody.textContent = body||'';
    transientOverlay.classList.remove('hidden');
    // keep paused while overlay visible
    setTimeout(()=>{
      transientOverlay.classList.add('hidden');
      if(cb) cb();
    }, ms||2000);
  }

  // Theme buttons
  const themeButtons = document.querySelectorAll('.theme-btn');
  themeButtons.forEach(b=>{
    b.addEventListener('click', ()=>{
      const t = b.getAttribute('data-theme');
      document.body.classList.remove('theme-teal','theme-coral');
      if(t==='teal') document.body.classList.add('theme-teal');
      if(t==='coral') document.body.classList.add('theme-coral');
      // force redraw background var usage
      drawGrid();
    });
  });

  updateHUD(); requestAnimationFrame(loop);
})();