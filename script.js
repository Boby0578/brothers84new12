// --- CONFIGURATION & STATE ---
const POTION_TYPES = [
    { name: 'Potion S', stat: 'hp', val: 50 }, { name: 'Potion M', stat: 'hp', val: 100 }, { name: 'Potion X', stat: 'hp', val: 500 },
    { name: 'Fiole S', stat: 'mp', val: 20 }, { name: 'Fiole M', stat: 'mp', val: 50 }, { name: 'Fiole X', stat: 'mp', val: 100 }
];
const SYMBOLS_EMOJI = ['🐉', '🔮', '⚔️', '🛡️', '🏰', '🌌', '💀', '👁️', '🌪️', '🔱', '🖤', '⚰️'];
const PREFIXES = ["Pyro", "Aqua", "Geo", "Aero", "Necro", "Cyber", "Veno", "Electro", "Cryo", "Umbr"];
const SUFFIXES = ["saurus", "wing", "fang", "claw", "mant", "fox", "bear", "slug", "drake", "spirit"];

let player = null;
let enemy = null;
let worldMap = [];
let mapCanvas, mapCtx; // Offscreen canvas for map
let game_state = 'TITLE';
let audioCtx = null;
let adsWatched = 0;
let wallet = 0.0;
let enemySeed = 0;

function defaultPlayer() {
    return {
        name: 'Monstre', type: 'fire', level: 1, xp: 0, xpNext: 5000,
        stats: { hp: 200, maxHp: 200, mp: 100, maxMp: 100, force: 10, intelligence: 10, agilite: 10, resistance: 10, magie: 10 },
        inventory: { 'Potion S': 3, 'Fiole S': 2 },
        spells: [], symbols: [], 
        x: 50, y: 50, templesBeaten: 0, finalBossActive: false
    };
}

// --- AUDIO PROCEDURAL ---
function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }

function playNote(freq, duration, type='square') {
    if(!audioCtx) return;
    let osc = audioCtx.createOscillator(); let gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration);
}

let battleMusicInterval = null;
function startBattleMusic() {
    stopBattleMusic(); let notes = [261.6, 329.6, 392, 523.2, 392, 329.6, 293.6, 349.2, 440, 523.2, 440, 349.2]; let i = 0;
    battleMusicInterval = setInterval(() => { playNote(notes[i % notes.length], 0.2, 'sawtooth'); i++; }, 250);
}
function stopBattleMusic() { if (battleMusicInterval) clearInterval(battleMusicInterval); }

// --- AD & WALLET ---
function showAd(isRewardCallback) {
    try {
        if (typeof show_10997672 === "function") {
            show_10997672().then(() => {
                let revenue = 0.002; wallet += revenue / 2; adsWatched++;
                if(isRewardCallback) isRewardCallback();
            });
        } else {
            wallet += 0.001; adsWatched++;
            if(isRewardCallback) isRewardCallback();
        }
    } catch (e) { if(isRewardCallback) isRewardCallback(); }
}

function updateWalletUI() {
    document.getElementById('w-ads').innerText = adsWatched;
    document.getElementById('w-money').innerText = wallet.toFixed(3);
    const wBtn = document.getElementById('withdraw-btn');
    if(wallet >= 1.0) { wBtn.disabled = false; } else { wBtn.disabled = true; }
}

// --- UI UPDATES ---
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function updateWorldUI() {
    document.getElementById('ui-lvl').innerText = player.level;
    document.getElementById('ui-name').innerText = player.name;
    document.getElementById('ui-hp-bar').querySelector('.bar-fill').style.width = (player.stats.hp / player.stats.maxHp * 100) + '%';
    document.getElementById('ui-hp-bar').querySelector('span').innerText = `${player.stats.hp}/${player.stats.maxHp}`;
    document.getElementById('ui-mp-bar').querySelector('.bar-fill').style.width = (player.stats.mp / player.stats.maxMp * 100) + '%';
    document.getElementById('ui-mp-bar').querySelector('span').innerText = `${player.stats.mp}/${player.stats.maxMp}`;
}

// --- STARTER SCREEN LOGIC ---
let selectedType = null;
document.querySelectorAll('.starter-card').forEach(card => {
    card.onclick = () => {
        document.querySelectorAll('.starter-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected'); selectedType = card.dataset.type;
    };
});

document.getElementById('confirm-starter').onclick = () => {
    if (!selectedType) return alert('Choisis un type!');
    let name = document.getElementById('creature-name').value.trim();
    if (!name) return alert('Donne un nom!');
    player = defaultPlayer(); player.name = name; player.type = selectedType;
    player.stats.force += 4; player.stats.intelligence += 4; player.stats.agilite += 4; player.stats.resistance += 4; player.stats.magie += 4;
    initWorld(); showScreen('world-screen'); game_state = 'WORLD'; updateWorldUI(); startWorldLoop();
};

// --- PROCEDURAL MAP GENERATION ---
function initWorld() {
    worldMap = [];
    for(let x=0; x<100; x++) {
        worldMap[x] = [];
        for(let y=0; y<100; y++) {
            let r = Math.random();
            if(r < 0.3) worldMap[x][y] = 'plaine';
            else if(r < 0.6) worldMap[x][y] = 'foret';
            else if(r < 0.75) worldMap[x][y] = 'desert';
            else if(r < 0.85) worldMap[x][y] = 'eau';
            else if(r < 0.95) worldMap[x][y] = 'glace';
            else worldMap[x][y] = 'volcan';
        }
    }
    for(let i=0; i<12; i++) { worldMap[Math.floor(Math.random()*90)+5][Math.floor(Math.random()*90)+5] = 'temple'; }
    if(player.finalBossActive) worldMap[50][50] = 'final_temple';
    
    // Generate offscreen map image for performance
    mapCanvas = document.createElement('canvas'); mapCanvas.width = 3200; mapCanvas.height = 3200;
    mapCtx = mapCanvas.getContext('2d');
    let tileSize = 32;
    for(let x=0; x<100; x++) {
        for(let y=0; y<100; y++) {
            let tx = x * tileSize, ty = y * tileSize;
            let type = worldMap[x][y];
            if(type === 'plaine') { mapCtx.fillStyle = '#4a8c38'; mapCtx.fillRect(tx, ty, tileSize, tileSize); drawGrass(tx, ty); }
            else if(type === 'foret') { mapCtx.fillStyle = '#2d5a1e'; mapCtx.fillRect(tx, ty, tileSize, tileSize); drawTree(tx, ty); }
            else if(type === 'desert') { mapCtx.fillStyle = '#c2b280'; mapCtx.fillRect(tx, ty, tileSize, tileSize); drawSandDune(tx, ty); }
            else if(type === 'eau') { mapCtx.fillStyle = '#2471a3'; mapCtx.fillRect(tx, ty, tileSize, tileSize); drawWave(tx, ty); }
            else if(type === 'glace') { mapCtx.fillStyle = '#d4e6f1'; mapCtx.fillRect(tx, ty, tileSize, tileSize); drawIce(tx, ty); }
            else if(type === 'volcan') { mapCtx.fillStyle = '#4a1a1a'; mapCtx.fillRect(tx, ty, tileSize, tileSize); drawLava(tx, ty); }
            else if(type === 'temple' || type === 'final_temple') { mapCtx.fillStyle = '#4a8c38'; mapCtx.fillRect(tx, ty, tileSize, tileSize); drawTemple(tx, ty, type); }
        }
    }
}

function drawGrass(x,y){ for(let i=0;i<5;i++){mapCtx.strokeStyle="#5a9c48";mapCtx.beginPath();mapCtx.moveTo(x+Math.random()*32,y+16+Math.random()*16);mapCtx.lineTo(x+Math.random()*32,y+16+Math.random()*16);mapCtx.stroke();} }
function drawTree(x,y){mapCtx.fillStyle="#5c3d1e";mapCtx.fillRect(x+14,y+16,4,16);mapCtx.fillStyle="#1e5c1e";mapCtx.beginPath();mapCtx.arc(x+16,y+14,10,0,Math.PI*2);mapCtx.fill();}
function drawSandDune(x,y){mapCtx.fillStyle="#d4c090";mapCtx.beginPath();mapCtx.moveTo(x,y+32);mapCtx.quadraticCurveTo(x+16,y+10,x+32,y+32);mapCtx.fill();}
function drawWave(x,y){mapCtx.strokeStyle="#3a8fbf";mapCtx.beginPath();mapCtx.moveTo(x,y+16);mapCtx.quadraticCurveTo(x+16,y+10,x+32,y+16);mapCtx.stroke();}
function drawIce(x,y){mapCtx.fillStyle="#fff";mapCtx.beginPath();mapCtx.moveTo(x+10,y+10);mapCtx.lineTo(x+20,y+20);mapCtx.lineTo(x+10,y+20);mapCtx.fill();}
function drawLava(x,y){mapCtx.fillStyle="#ff3300";mapCtx.beginPath();mapCtx.arc(x+16,y+16,4+Math.random()*4,0,Math.PI*2);mapCtx.fill();}
function drawTemple(x,y,type){mapCtx.fillStyle="#777";mapCtx.fillRect(x+4,y+4,24,28);mapCtx.fillStyle=type==='final_temple'?"#f0f":"#ff0";mapCtx.beginPath();mapCtx.moveTo(x+16,y+2);mapCtx.lineTo(x+28,y+12);mapCtx.lineTo(x+4,y+12);mapCtx.fill();}

// --- WORLD LOOP & JOYSTICK ---
let worldCanvas, worldCtx; let joyActive = false, joyX=0, joyY=0;

function startWorldLoop() {
    worldCanvas = document.getElementById('world-canvas'); worldCtx = worldCanvas.getContext('2d');
    worldCanvas.width = window.innerWidth; worldCanvas.height = window.innerHeight;
    requestAnimationFrame(drawWorld);
}

const joyZone = document.getElementById('joystick-zone'); const joyThumb = document.getElementById('joystick-thumb');
joyZone.addEventListener('touchstart', (e) => { joyActive = true; e.preventDefault(); }, {passive:false});
joyZone.addEventListener('touchmove', (e) => {
    let touch = e.touches[0]; let rect = joyZone.getBoundingClientRect();
    let cx = rect.left + rect.width/2; let cy = rect.top + rect.height/2;
    joyX = (touch.clientX - cx) / 50; joyY = (touch.clientY - cy) / 50;
    if(Math.abs(joyX) > 1) joyX = Math.sign(joyX); if(Math.abs(joyY) > 1) joyY = Math.sign(joyY);
    joyThumb.style.transform = `translate(calc(-50% + ${joyX*30}px), calc(-50% + ${joyY*30}px))`;
    e.preventDefault();
}, {passive:false});
joyZone.addEventListener('touchend', () => { joyActive = false; joyX=0; joyY=0; joyThumb.style.transform = 'translate(-50%, -50%)'; });

function drawWorld() {
    if(game_state !== 'WORLD') return;
    
    if(joyActive) {
        player.x += joyX * 0.3; player.y += joyY * 0.3;
        if(player.x < 0) player.x = 0; if(player.x > 99) player.x = 99;
        if(player.y < 0) player.y = 0; if(player.y > 99) player.y = 99;
        let tile = worldMap[Math.floor(player.x)][Math.floor(player.y)];
        if(tile === 'temple' || tile === 'final_temple') initBattle(tile === 'final_temple');
        else if(tile === 'foret' && Math.random() < 0.02) initBattle(false);
        else if(tile !== 'eau' && Math.random() < 0.005) findItem();
    }

    worldCtx.fillStyle = '#000'; worldCtx.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
    let scale = 2.5; let tileSize = 32;
    let offsetX = worldCanvas.width/2 - player.x * tileSize * scale; let offsetY = worldCanvas.height/2 - player.y * tileSize * scale;
    
    worldCtx.drawImage(mapCanvas, offsetX, offsetY, mapCanvas.width * scale, mapCanvas.height * scale);
    
    drawCreatureShape(worldCtx, worldCanvas.width/2, worldCanvas.height/2 + 20, player.type, 100, 100, true);
    updateWorldUI();
    requestAnimationFrame(drawWorld);
}

function findItem() { let item = POTION_TYPES[Math.floor(Math.random()*POTION_TYPES.length)]; player.inventory[item.name] = (player.inventory[item.name] || 0) + 1; }

// --- PROCEDURAL CREATURE GENERATION ---
function seededRandom(max) { enemySeed = (enemySeed * 9301 + 49297) % 233280; return (enemySeed / 233280) * max; }

function drawCreatureShape(ctx, x, y, type, width, height, isPlayer) {
    ctx.save(); ctx.translate(x, y);
    if(!isPlayer) ctx.scale(-1,1); // Enemy faces left
    
    let colors = [];
    if(type==='fire') colors = ['#ff4400','#ff8800','#ffcc00'];
    else if(type==='water') colors = ['#0044ff','#0088ff','#00ccff'];
    else colors = ['#00aa00','#44ff00','#88ff44'];
    
    let bodyW = width/2; let bodyH = height/2.5;
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, height/3, bodyW/1.5, bodyH/4, 0, 0, Math.PI*2); ctx.fill();
    
    // Legs
    ctx.fillStyle = colors[0]; 
    ctx.fillRect(-bodyW/2, bodyH/2, bodyW/4, bodyH/1.5); ctx.fillRect(bodyW/4, bodyH/2, bodyW/4, bodyH/1.5);
    
    // Body
    ctx.fillStyle = colors[1]; ctx.beginPath(); ctx.ellipse(0, 0, bodyW, bodyH, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = colors[0]; ctx.lineWidth = 3; ctx.stroke();
    
    // Head
    ctx.fillStyle = colors[1]; ctx.beginPath(); ctx.ellipse(0, -bodyH, bodyW/1.5, bodyH/1.2, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = colors[0]; ctx.stroke();
    
    // Eyes
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-bodyW/4, -bodyH, bodyW/5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(bodyW/4, -bodyH, bodyW/5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-bodyW/4, -bodyH, bodyW/8, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(bodyW/4, -bodyH, bodyW/8, 0, Math.PI*2); ctx.fill();
    
    // Type-specific & Seeded features for enemies
    if(type === 'fire') {
        ctx.fillStyle = '#ff3300'; ctx.beginPath(); ctx.moveTo(-bodyW/2, -bodyH-bodyH/1.2); ctx.lineTo(0, -bodyH-bodyH); ctx.lineTo(bodyW/2, -bodyH-bodyH/1.2); ctx.fill();
    } else if(type === 'water') {
        ctx.fillStyle = colors[2]; ctx.beginPath(); ctx.moveTo(bodyW/2, -bodyH); ctx.lineTo(bodyW*1.5, -bodyH-20); ctx.lineTo(bodyW/2, -bodyH+20); ctx.fill();
    } else if(type === 'plant') {
        ctx.fillStyle = '#2d5a1e'; ctx.beginPath(); ctx.arc(0, -bodyH-bodyH/1.2, bodyW/2, 0, Math.PI*2); ctx.fill();
    }

    if(!isPlayer) {
        let h1 = seededRandom(40)-20; let h2 = seededRandom(40)-20;
        ctx.fillStyle = colors[0]; 
        ctx.beginPath(); ctx.moveTo(-bodyW/2, -bodyH-bodyH/1.2); ctx.lineTo(-bodyW/2+h1, -bodyH-bodyH); ctx.lineTo(-bodyW/2+10, -bodyH); ctx.fill();
        ctx.beginPath(); ctx.moveTo(bodyW/2, -bodyH-bodyH/1.2); ctx.lineTo(bodyW/2+h2, -bodyH-bodyH); ctx.lineTo(bodyW/2-10, -bodyH); ctx.fill();
        
        // Tail
        ctx.strokeStyle = colors[2]; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, bodyH/2); ctx.quadraticCurveTo(bodyW, bodyH, -h1, bodyH*1.5); ctx.stroke();
    }
    
    ctx.restore();
}

// --- BATTLE SYSTEM ---
function generateEnemy(isTemple, isFinal) {
    enemySeed = Math.floor(Math.random() * 100000);
    let lvl = isFinal ? player.level * 2 : (isTemple ? player.level + 5 : player.level + Math.floor(seededRandom(3)));
    let name = PREFIXES[Math.floor(seededRandom(PREFIXES.length))] + SUFFIXES[Math.floor(seededRandom(SUFFIXES.length))];
    let baseHp = 150 + (lvl * 20);
    return { name: isFinal ? "Démon Ultime" : name, type: ['fire','water','plant'][Math.floor(seededRandom(3))], level: lvl, stats: { maxHp: baseHp, hp: baseHp, maxMp: 50+lvl*5, mp: 50+lvl*5, force: 5+lvl*2, resistance: 5+lvl, magie: 5+lvl*2 }, isTemple, isFinal, seed: enemySeed };
}

function initBattle(isFinal) {
    game_state = 'BATTLE'; enemy = generateEnemy(worldMap[Math.floor(player.x)][Math.floor(player.y)] === 'temple', isFinal);
    showScreen('battle-screen'); startBattleMusic(); updateBattleUI();
    document.getElementById('battle-actions').classList.remove('hidden'); document.getElementById('sub-menu').classList.add('hidden');
}

function updateBattleUI() {
    document.getElementById('b-p-name').innerText = `${player.name} (Lvl ${player.level})`;
    document.getElementById('b-e-name').innerText = `${enemy.name} (Lvl ${enemy.level})`;
    updateBar('b-player-stats', player.stats.hp, player.stats.maxHp, player.stats.mp, player.stats.maxMp);
    updateBar('b-enemy-stats', enemy.stats.hp, enemy.stats.maxHp, enemy.stats.mp, enemy.stats.maxMp);
    drawBattleScene();
}

function updateBar(id, hp, maxHp, mp, maxMp) {
    let div = document.getElementById(id);
    div.querySelector('.bar-fill.hp').style.width = (hp/maxHp*100)+'%'; div.querySelector('.hp-txt').innerText = `${hp}/${maxHp}`;
    div.querySelector('.bar-fill.mp').style.width = (mp/maxMp*100)+'%'; div.querySelector('.mp-txt').innerText = `${mp}/${maxMp}`;
}

function drawBattleScene() {
    let bCanvas = document.getElementById('battle-canvas'); let ctx = bCanvas.getContext('2d');
    bCanvas.width = window.innerWidth; bCanvas.height = window.innerHeight * 0.45;
    
    // Draw landscape background
    let grd = ctx.createLinearGradient(0, 0, 0, bCanvas.height);
    grd.addColorStop(0, "#87CEEB"); grd.addColorStop(0.7, "#E0F7FA"); grd.addColorStop(0.7, "#8BC34A"); grd.addColorStop(1, "#4CAF50");
    ctx.fillStyle = grd; ctx.fillRect(0,0,bCanvas.width,bCanvas.height);
    
    enemySeed = enemy.seed; // Reset seed for drawing consistency
    drawCreatureShape(ctx, bCanvas.width * 0.2, bCanvas.height * 0.6, player.type, 120, 120, true);
    drawCreatureShape(ctx, bCanvas.width * 0.8, bCanvas.height * 0.4, enemy.type, 140, 140, false);
}

function playEffect(type) {
    let container = document.getElementById('battle-effects');
    let el = document.createElement('div');
    if(type === 'claw') el.className = 'claw-attack';
    if(type === 'lightning') el.className = 'lightning-attack';
    container.appendChild(el);
    setTimeout(() => el.remove(), 600);
}

function logBattle(msg) { let log = document.getElementById('battle-log'); log.innerHTML += msg + '<br>'; log.scrollTop = log.scrollHeight; }

// Actions
document.getElementById('btn-attack').onclick = () => {
    let dmg = Math.max(1, player.stats.force - enemy.stats.resistance + Math.floor(Math.random()*5));
    enemy.stats.hp -= dmg; logBattle(`${player.name} attaque! -${dmg} HP`); playEffect('claw');
    updateBattleUI(); checkBattleEnd() || setTimeout(() => enemyTurn(), 800);
};

document.getElementById('btn-magic').onclick = () => showSubMenu('magic');
document.getElementById('btn-inventory').onclick = () => showSubMenu('inventory');
document.getElementById('btn-symbols').onclick = () => showSubMenu('symbols');

document.getElementById('btn-back').onclick = () => {
    document.getElementById('battle-actions').classList.remove('hidden'); document.getElementById('sub-menu').classList.add('hidden');
};

document.getElementById('btn-restore').onclick = () => {
    showAd(() => { player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + 50); player.stats.mp = Math.min(player.stats.maxMp, player.stats.mp + 30); logBattle("Stats restaurées!"); updateBattleUI(); });
};

function showSubMenu(type) {
    document.getElementById('battle-actions').classList.add('hidden'); document.getElementById('sub-menu').classList.remove('hidden');
    let list = document.getElementById('sub-menu-list'); list.innerHTML = '';
    
    if(type === 'magic') {
        if(player.spells.length === 0) list.innerHTML = '<p style="padding:5px">Aucun sort</p>';
        player.spells.forEach(sp => {
            let btn = document.createElement('button'); btn.innerText = `${sp.name} (Coût: ${sp.cost} MP)`;
            btn.onclick = () => { 
                if(player.stats.mp < sp.cost) return logBattle("Pas assez de MP!");
                player.stats.mp -= sp.cost; let dmg = Math.max(1, player.stats.magie + sp.power - enemy.stats.resistance);
                enemy.stats.hp -= dmg; logBattle(`${player.name} lance ${sp.name}! -${dmg} HP`); playEffect('lightning');
                updateBattleUI(); checkBattleEnd() || setTimeout(() => enemyTurn(), 800);
            }; list.appendChild(btn);
        });
    } else if(type === 'inventory') {
        for(let [name, qty] of Object.entries(player.inventory)) {
            if(qty <= 0) continue; let item = POTION_TYPES.find(p => p.name === name);
            let btn = document.createElement('button'); btn.innerText = `${name} x${qty}`;
            btn.onclick = () => {
                let useBtn = document.createElement('button'); useBtn.innerText = `UTILISER ${name}`; useBtn.style.color = '#0f0';
                useBtn.onclick = () => {
                    let stat = item.stat === 'hp' ? 'maxHp' : 'maxMp';
                    player.stats[item.stat] = Math.min(player.stats[stat], player.stats[item.stat] + item.val);
                    player.inventory[name]--; logBattle(`Utilisé ${name}!`); updateBattleUI(); setTimeout(() => enemyTurn(), 800);
                }; list.prepend(useBtn);
            }; list.appendChild(btn);
        }
    } else if(type === 'symbols') {
        if(player.symbols.length === 0) list.innerHTML = '<p style="padding:5px">Aucun symbole</p>';
        player.symbols.forEach(s => { let btn = document.createElement('button'); btn.innerText = s; btn.style.fontSize = '2rem'; list.appendChild(btn); });
    }
}

function enemyTurn() {
    let isMagic = Math.random() > 0.5; let dmg = 0;
    if(isMagic) { dmg = Math.max(1, enemy.stats.magie - player.stats.resistance); playEffect('lightning'); }
    else { dmg = Math.max(1, enemy.stats.force - player.stats.resistance); playEffect('claw'); }
    player.stats.hp -= dmg; logBattle(`${enemy.name} attaque! -${dmg} HP`); updateBattleUI(); checkBattleEnd();
    
    if(Math.random() < 0.2 && player.spells.length < 10) {
        let newSpell = { name: PREFIXES[Math.floor(Math.random()*3)]+SUFFIXES[Math.floor(Math.random()*3)], power: 10+player.level*2, cost: 10+player.level };
        if(confirm(`${player.name} essaie d'apprendre ${newSpell.name}. Mémoriser?`)) { player.spells.push(newSpell); logBattle(`Sort ${newSpell.name} appris!`); }
    }
}

function checkBattleEnd() {
    if(enemy.stats.hp <= 0) {
        logBattle(`${enemy.name} vaincu!`); stopBattleMusic();
        let xpGain = 50 + enemy.level * 10; player.xp += xpGain; logBattle(`+${xpGain} XP!`);
        while(player.xp >= player.xpNext) {
            player.xp -= player.xpNext; player.level++; player.xpNext = player.level * 5000;
            player.stats.maxHp += 20; player.stats.maxMp += 10; player.stats.force += 2; player.stats.resistance += 2; player.stats.magie += 2;
            player.stats.hp = player.stats.maxHp; player.stats.mp = player.stats.maxMp; logBattle(`NIVEAU ${player.level}!`);
        }
        let loot = POTION_TYPES[Math.floor(Math.random()*POTION_TYPES.length)]; player.inventory[loot.name] = (player.inventory[loot.name] || 0) + 1; logBattle(`Trouvé: ${loot.name}`);
        
        if(enemy.isTemple) {
            player.templesBeaten++; player.symbols.push(SYMBOLS_EMOJI[player.templesBeaten-1]);
            worldMap[Math.floor(player.x)][Math.floor(player.y)] = 'plaine';
            if(player.templesBeaten >= 12) { player.finalBossActive = true; initWorld(); }
        }
        
        // Check Final Victory
        if(enemy.isFinal) {
            showAd(null);
            setTimeout(() => { game_state = 'WIN'; showScreen('win-screen'); }, 2000);
            return true;
        }

        showAd(null);
        setTimeout(() => { game_state = 'WORLD'; showScreen('world-screen'); drawWorld(); }, 3000);
        return true;
    }
    if(player.stats.hp <= 0) {
        logBattle(`${player.name} est K.O!`); stopBattleMusic(); game_state = 'GAMEOVER'; adsWatched = 0;
        showScreen('gameover-screen'); return true;
    }
    return false;
}

// --- GAME OVER & WALLET ---
document.getElementById('revive-btn').onclick = () => {
    if(adsWatched < 10) {
        showAd(() => { document.getElementById('revive-btn').innerText = `Revive (Encore ${10 - adsWatched} Pubs)`; updateWalletUI(); });
    } else {
        player.stats.hp = Math.floor(player.stats.maxHp / 2); player.stats.mp = Math.floor(player.stats.maxMp / 2);
        game_state = 'WORLD'; showScreen('world-screen'); drawWorld();
    }
}

document.getElementById('world-wallet-btn').onclick = () => { updateWalletUI(); showScreen('wallet-screen'); };
document.getElementById('wallet-back-btn').onclick = () => { if(game_state==='WORLD') showScreen('world-screen'); };
document.getElementById('withdraw-btn').onclick = () => { if(wallet >= 1) { alert("Transfert vers Telegram Wallet lancé!"); wallet -= 1.0; updateWalletUI(); } };

// --- INIT ---
window.onload = () => {
    showScreen('title-screen');
    document.getElementById('start-btn').onclick = () => { initAudio(); showScreen('starter-screen'); };
};