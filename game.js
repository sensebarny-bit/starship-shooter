const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const waveEl = document.getElementById("wave");
const laserEl = document.getElementById("laserCount");
const rocketEl = document.getElementById("rocketCount");
const phoenixEl = document.getElementById("phoenixCount");
const empEl = document.getElementById("empCount");
const overlay = document.getElementById("overlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const finalScoreEl = document.getElementById("finalScore");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const ENEMY_MAX_Y = HEIGHT / 2;

const ENEMY_TYPES = {
  scout: { w: 28, h: 24, hpBonus: 0, speedMul: 1, fireMin: 90, fireMax: 150 },
  stalker: {
    w: 30,
    h: 26,
    hpBonus: 1,
    speedMul: 0.8,
    fireMin: 110,
    fireMax: 170,
    aimed: true,
  },
  cruiser: {
    w: 42,
    h: 34,
    hpBonus: 2,
    speedMul: 0.55,
    fireMin: 130,
    fireMax: 190,
    twin: true,
  },
};

function enemyTypesForWave(wave) {
  const pool = ["scout"];
  if (wave >= 3) pool.push("stalker");
  if (wave >= 6) pool.push("cruiser");
  return pool;
}

const keys = new Set();
let running = false;
let paused = false;
let animationId = null;
let mouseX = WIDTH / 2;
let mouseY = 0;

const state = {
  score: 0,
  lives: 10,
  wave: 1,
};

const player = {
  w: 36,
  h: 36,
  x: WIDTH / 2 - 18,
  y: HEIGHT - 60,
  speed: 5,
  cooldown: 0,
  fireRate: 10,
  invincible: 0,
  laser: 0,
  rockets: 0,
  phoenixCharge: 0,
  phoenixMode: false,
  phoenixTimer: 0,
  phoenixKills: 0,
  empCharge: 0,
};

let bullets = [];
let enemyBullets = [];
let enemies = [];
let particles = [];
let stars = [];
let boss = null;
let stageBanner = { text: "", timer: 0 };
let pickups = [];
let activeRockets = [];
let laserBeam = null;
let pickupSpawnTimer = 300;
let wingmen = [];
let bossBombs = [];
let empPulse = { timer: 0 };
let dying = false;
let deathTimer = 0;

function isBossStage(wave) {
  return wave % 5 === 0;
}

function announceStage(n) {
  stageBanner = {
    text: isBossStage(n) ? `STAGE ${n} — BOSS` : `STAGE ${n}`,
    timer: 120,
  };
}

function initStars() {
  stars = [];
  for (let i = 0; i < 80; i++) {
    stars.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      r: Math.random() * 1.6 + 0.4,
      speed: Math.random() * 1.5 + 0.3,
    });
  }
}

function bossTypeForWave(wave) {
  const tier = wave / 5;
  return tier % 2 === 1 ? "skull" : "ghost";
}

function spawnBoss(wave) {
  const tier = wave / 5;
  const bossType = bossTypeForWave(wave);
  const maxHp = (70 + tier * 50) * (bossType === "ghost" ? 1.25 : 1);
  bossBombs = [];
  boss = {
    w: 100,
    h: 92,
    x: WIDTH / 2 - 50,
    y: -140,
    targetY: 80,
    entering: true,
    dir: 1,
    speed: (1.5 + tier * 0.2) * (bossType === "ghost" ? 1.15 : 1),
    hp: maxHp,
    maxHp,
    phase: 1,
    bossType,
    spinAngle: 0,
    spinFireCooldown: 10,
    patternIndex: 0,
    patternTimer: 100,
    machineGunBurst: 0,
    machineGunCooldown: 0,
    driftPhase: Math.random() * Math.PI * 2,
    hitFlash: 0,
    stunTimer: 0,
  };
}

function fireBossSpiral() {
  const cx = boss.x + boss.w / 2;
  const cy = boss.y + boss.h / 2;
  const arms = boss.phase === 2 ? 4 : 3;
  const speed = boss.phase === 2 ? 3.2 : 2.6;
  for (let i = 0; i < arms; i++) {
    const angle = boss.spinAngle + ((Math.PI * 2) / arms) * i;
    enemyBullets.push({
      x: cx - 2,
      y: cy - 2,
      w: 4,
      h: 4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }
}

function fireGhostBroadside() {
  const cy = boss.y + boss.h / 2;
  const speed = boss.phase === 2 ? 4.5 : 3.5;
  const count = boss.phase === 2 ? 4 : 3;
  for (let i = 0; i < count; i++) {
    const yOff = (i - (count - 1) / 2) * 12;
    enemyBullets.push({ x: boss.x - 4, y: cy + yOff - 2, w: 4, h: 4, vx: -speed, vy: 0 });
    enemyBullets.push({
      x: boss.x + boss.w,
      y: cy + yOff - 2,
      w: 4,
      h: 4,
      vx: speed,
      vy: 0,
    });
  }
}

function fireGhostCurseVolley() {
  const cx = boss.x + boss.w / 2;
  const cy = boss.y + boss.h * 0.8;
  const targetAngle = Math.atan2(
    player.y + player.h / 2 - cy,
    player.x + player.w / 2 - cx
  );
  const spread = boss.phase === 2 ? [-0.3, -0.1, 0.1, 0.3] : [-0.18, 0, 0.18];
  const speed = boss.phase === 2 ? 4.6 : 3.6;
  spread.forEach((offset) => {
    const angle = targetAngle + offset;
    enemyBullets.push({
      x: cx - 2,
      y: cy,
      w: 5,
      h: 5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  });
}

function fireGhostCannonballs() {
  const count = boss.phase === 2 ? 5 : 3;
  const spacing = boss.w / (count + 1);
  for (let i = 1; i <= count; i++) {
    enemyBullets.push({
      x: boss.x + spacing * i - 4,
      y: boss.y + boss.h,
      w: 8,
      h: 8,
      vx: 0,
      vy: 2.4 + (boss.phase === 2 ? 0.8 : 0),
    });
  }
}

function fireGhostBomb() {
  const cx = boss.x + boss.w / 2;
  const cy = boss.y + boss.h;
  const count = boss.phase === 2 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    bossBombs.push({
      x: cx - 5 + (i - (count - 1) / 2) * 30,
      y: cy,
      w: 10,
      h: 10,
      vy: 2.2,
      fuse: 75,
    });
  }
}

function detonateGhostBomb(x, y) {
  const radius = 55;
  if (player.invincible <= 0 && !player.phoenixMode) {
    const dx = player.x + player.w / 2 - x;
    const dy = player.y + player.h / 2 - y;
    if (Math.hypot(dx, dy) < radius) hitPlayer();
  }
  const count = boss.phase === 2 ? 14 : 10;
  const speed = boss.phase === 2 ? 2.8 : 2.3;
  for (let i = 0; i < count; i++) {
    const angle = ((Math.PI * 2) / count) * i;
    enemyBullets.push({
      x: x - 2,
      y: y - 2,
      w: 4,
      h: 4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }
  spawnExplosion(x, y, "#ff9d4d");
  spawnExplosion(x, y, "#ffcf5c");
}

function fireGhostMachineGunBurst() {
  boss.machineGunBurst = boss.phase === 2 ? 46 : 30;
  boss.machineGunCooldown = 0;
}

function spawnWave(wave) {
  announceStage(wave);
  boss = null;
  enemies = [];
  if (isBossStage(wave)) {
    spawnBoss(wave);
    return;
  }
  const rows = Math.min(2 + Math.floor(wave / 2), 5);
  const cols = Math.min(4 + Math.floor(wave / 3), 7);
  const marginX = 40;
  const gapX = (WIDTH - marginX * 2) / cols;
  const gapY = 44;
  const typePool = enemyTypesForWave(wave);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.45) continue; // thin the formation further
      const typeKey = typePool[Math.floor(Math.random() * typePool.length)];
      const stats = ENEMY_TYPES[typeKey];
      const targetX = marginX + c * gapX + gapX / 2 - stats.w / 2;
      const targetY = Math.min(50 + r * gapY, ENEMY_MAX_Y - 60);
      enemies.push({
        x: targetX,
        y: -40 - r * 50 - Math.random() * 60,
        w: stats.w,
        h: stats.h,
        baseX: targetX,
        targetY,
        entering: true,
        alive: true,
        type: typeKey,
        speedMul: stats.speedMul,
        fireMin: stats.fireMin,
        fireMax: stats.fireMax,
        fireCooldown: Math.random() * (stats.fireMax - stats.fireMin) + stats.fireMin,
        hp: 1 + Math.floor(wave / 4) + stats.hpBonus,
        wobble: Math.random() * Math.PI * 2,
        vx: 0,
        vy: 0,
        driftTimer: Math.random() * 40 + 20,
        stunTimer: 0,
      });
    }
  }
  if (enemies.length === 0) {
    const stats = ENEMY_TYPES.scout;
    enemies.push({
      x: WIDTH / 2 - stats.w / 2,
      y: -60,
      w: stats.w,
      h: stats.h,
      baseX: WIDTH / 2 - stats.w / 2,
      targetY: 60,
      entering: true,
      alive: true,
      type: "scout",
      speedMul: stats.speedMul,
      fireMin: stats.fireMin,
      fireMax: stats.fireMax,
      fireCooldown: stats.fireMin,
      hp: 1 + Math.floor(wave / 4),
      wobble: 0,
      vx: 0,
      vy: 0,
      driftTimer: 30,
      stunTimer: 0,
    });
  }
}

function resetGame() {
  state.score = 0;
  state.lives = 10;
  state.wave = 1;
  player.x = WIDTH / 2 - player.w / 2;
  player.y = HEIGHT - 60;
  player.cooldown = 0;
  player.invincible = 90;
  player.laser = 0;
  player.rockets = 0;
  player.phoenixCharge = 0;
  player.phoenixMode = false;
  player.phoenixTimer = 0;
  player.phoenixKills = 0;
  player.empCharge = 0;
  bullets = [];
  enemyBullets = [];
  particles = [];
  pickups = [];
  activeRockets = [];
  laserBeam = null;
  pickupSpawnTimer = 300;
  wingmen = [];
  bossBombs = [];
  empPulse = { timer: 0 };
  dying = false;
  deathTimer = 0;
  boss = null;
  spawnWave(state.wave);
  updateHud();
}

function updateHud() {
  scoreEl.textContent = `Score: ${state.score}`;
  livesEl.textContent = `Lives: ${state.lives}`;
  waveEl.textContent = `Stage: ${state.wave}`;
  laserEl.textContent = `Laser: ${player.laser}`;
  rocketEl.textContent = `Rocket: ${player.rockets}`;
  phoenixEl.textContent =
    player.phoenixCharge > 0
      ? `Phoenix: READY x${player.phoenixCharge}`
      : `Phoenix: ${player.phoenixKills}/10`;
  empEl.textContent = `EMP: ${player.empCharge}`;
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function findNearestTarget(originX, originY) {
  let nearest = null;
  let minDist = Infinity;
  enemies.forEach((e) => {
    if (!e.alive) return;
    const dx = e.x + e.w / 2 - originX;
    const dy = e.y + e.h / 2 - originY;
    const dist = dx * dx + dy * dy;
    if (dist < minDist) {
      minDist = dist;
      nearest = {
        x: e.x + e.w / 2,
        y: e.y + e.h / 2,
        vx: e.entering ? 0 : e.vx,
        vy: e.entering ? 0 : e.vy,
      };
    }
  });
  if (boss && !boss.entering) {
    const dx = boss.x + boss.w / 2 - originX;
    const dy = boss.y + boss.h / 2 - originY;
    const dist = dx * dx + dy * dy;
    if (dist < minDist) {
      nearest = {
        x: boss.x + boss.w / 2,
        y: boss.y + boss.h / 2,
        vx: boss.dir * boss.speed,
        vy: 0,
      };
    }
  }
  return nearest;
}

function predictInterceptPoint(originX, originY, target, projectileSpeed) {
  let px = target.x;
  let py = target.y;
  for (let i = 0; i < 3; i++) {
    const dist = Math.hypot(px - originX, py - originY);
    const t = dist / projectileSpeed;
    px = target.x + target.vx * t;
    py = target.y + target.vy * t;
  }
  return { x: px, y: py };
}

function randomPickupType() {
  const r = Math.random();
  if (r < 0.08) return "life";
  if (r < 0.16) return "shield";
  if (r < 0.24) return "wingman";
  if (r < 0.32) return "emp";
  return r < 0.66 ? "laser" : "rocket";
}

function spawnPickup(x, y, type) {
  pickups.push({
    x: x - 9,
    y: y - 9,
    w: 18,
    h: 18,
    type: type || randomPickupType(),
    vy: 1.3,
  });
}

function fireLaserBeam() {
  player.laser--;
  laserBeam = { x: player.x + player.w / 2 - 9, width: 18, timer: 24 };
}

function fireRocket() {
  player.rockets--;
  activeRockets.push({
    x: player.x + player.w / 2 - 4,
    y: player.y - 12,
    w: 8,
    h: 16,
    vy: 6.5,
  });
}

function activatePhoenix() {
  player.phoenixCharge--;
  player.phoenixMode = true;
  player.phoenixTimer = 300;
  player.invincible = Math.max(player.invincible, 300);
}

function activateEmp() {
  player.empCharge--;
  enemyBullets = [];
  bossBombs = [];
  enemies.forEach((e) => {
    if (e.alive) e.stunTimer = 120;
  });
  if (boss && !boss.entering) {
    boss.hp -= 15;
    boss.stunTimer = 120;
    boss.hitFlash = 10;
  }
  empPulse = { timer: 24 };
  spawnExplosion(player.x + player.w / 2, player.y, "#9be8ff");
  checkBossDefeat();
}

function addPhoenixProgress(amount) {
  player.phoenixKills += amount;
  while (player.phoenixKills >= 10) {
    player.phoenixKills -= 10;
    player.phoenixCharge = Math.min(player.phoenixCharge + 1, 3);
  }
}

function spawnWingmen() {
  wingmen.push({ offsetX: -34, offsetY: 6, fireCooldown: 20, timer: 600 });
  wingmen.push({ offsetX: 34, offsetY: 6, fireCooldown: 20, timer: 600 });
}

function explodeRocket(x, y) {
  const radius = 70;
  enemies.forEach((e) => {
    if (!e.alive) return;
    const dx = e.x + e.w / 2 - x;
    const dy = e.y + e.h / 2 - y;
    if (Math.sqrt(dx * dx + dy * dy) < radius) {
      e.alive = false;
      state.score += 10;
      addPhoenixProgress(1);
      spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, "#ffcf5c");
      if (Math.random() < 0.14) spawnPickup(e.x + e.w / 2, e.y + e.h / 2);
    }
  });
  if (boss && !boss.entering) {
    const dx = boss.x + boss.w / 2 - x;
    const dy = boss.y + boss.h / 2 - y;
    if (Math.sqrt(dx * dx + dy * dy) < radius + boss.w / 2) {
      boss.hp -= 18;
      boss.hitFlash = 8;
    }
  }
  for (let i = 0; i < 24; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 35 + Math.random() * 10,
      color: "#ffb347",
    });
  }
}

function checkBossDefeat() {
  if (boss && boss.hp <= 0) {
    spawnExplosion(boss.x + boss.w / 2, boss.y + boss.h / 2, "#ffcf5c");
    spawnExplosion(boss.x + boss.w / 2, boss.y + boss.h / 2, "#ff5d73");
    state.score += 500 + (boss.maxHp - 70) * 2;
    player.laser++;
    player.rockets++;
    addPhoenixProgress(3);
    boss = null;
    enemyBullets = [];
    bossBombs = [];
    state.wave++;
    spawnWave(state.wave);
  }
}

function spawnExplosion(x, y, color) {
  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 1;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 30 + Math.random() * 10,
      color,
    });
  }
}

function update() {
  if (dying) {
    deathTimer--;
    if (deathTimer % 4 === 0) {
      spawnExplosion(
        player.x + player.w / 2 + (Math.random() - 0.5) * 26,
        player.y + player.h / 2 + (Math.random() - 0.5) * 26,
        Math.random() < 0.5 ? "#ff5d73" : "#ffcf5c"
      );
    }
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
    });
    particles = particles.filter((p) => p.life > 0);
    if (deathTimer <= 0) {
      endGame();
    }
    return;
  }

  if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) {
    player.x -= player.speed;
  }
  if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) {
    player.x += player.speed;
  }
  if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) {
    player.y -= player.speed;
  }
  if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) {
    player.y += player.speed;
  }
  const edgeMargin = player.phoenixMode ? 50 : 4;
  player.x = Math.max(edgeMargin, Math.min(WIDTH - player.w - edgeMargin, player.x));
  player.y = Math.max(edgeMargin, Math.min(HEIGHT - player.h - edgeMargin, player.y));

  if (player.cooldown > 0) player.cooldown--;
  if (player.invincible > 0) player.invincible--;
  if (stageBanner.timer > 0) stageBanner.timer--;
  if (empPulse.timer > 0) empPulse.timer--;

  if ((keys.has(" ") || keys.has("Spacebar")) && player.cooldown <= 0) {
    const originX = player.x + player.w / 2;
    const originY = player.y;
    const bulletSpeed = 9;
    const target = findNearestTarget(originX, originY);
    let aimAngle;
    if (target) {
      const lead = predictInterceptPoint(originX, originY, target, bulletSpeed);
      aimAngle = Math.atan2(lead.y - originY, lead.x - originX);
    } else {
      aimAngle = Math.atan2(mouseY - originY, mouseX - originX);
    }
    bullets.push({
      x: originX - 2,
      y: originY - 10,
      w: 4,
      h: 4,
      vx: Math.cos(aimAngle) * bulletSpeed,
      vy: Math.sin(aimAngle) * bulletSpeed,
    });
    player.cooldown = player.fireRate;
  }

  pickupSpawnTimer--;
  if (pickupSpawnTimer <= 0) {
    spawnPickup(40 + Math.random() * (WIDTH - 80), -20);
    pickupSpawnTimer = 480 + Math.random() * 360;
  }

  pickups.forEach((p) => (p.y += p.vy));
  pickups = pickups.filter((p) => p.y < HEIGHT);
  pickups.forEach((p) => {
    if (rectsOverlap(p, player)) {
      if (p.type === "laser") player.laser = Math.min(player.laser + 1, 9);
      else if (p.type === "rocket") player.rockets = Math.min(player.rockets + 1, 9);
      else if (p.type === "life") state.lives++;
      else if (p.type === "shield") player.invincible = Math.max(player.invincible, 240);
      else if (p.type === "wingman") spawnWingmen();
      else if (p.type === "emp") player.empCharge = Math.min(player.empCharge + 1, 3);
      p.collected = true;
      spawnExplosion(p.x + p.w / 2, p.y + p.h / 2, PICKUP_STYLE[p.type].color);
    }
  });
  pickups = pickups.filter((p) => !p.collected);

  wingmen.forEach((w) => {
    w.timer--;
    w.fireCooldown--;
    if (w.fireCooldown <= 0) {
      const wx = player.x + player.w / 2 + w.offsetX;
      const wy = player.y + w.offsetY;
      bullets.push({ x: wx - 2, y: wy - 8, w: 4, h: 4, vx: 0, vy: -9 });
      w.fireCooldown = 20;
    }
  });
  wingmen = wingmen.filter((w) => w.timer > 0);

  activeRockets.forEach((r) => (r.y -= r.vy));
  activeRockets.forEach((r) => {
    let hit = r.y <= 0;
    enemies.forEach((e) => {
      if (e.alive && rectsOverlap(r, e)) hit = true;
    });
    if (boss && !boss.entering && rectsOverlap(r, boss)) hit = true;
    if (hit) {
      explodeRocket(r.x + r.w / 2, r.y + r.h / 2);
      r.spent = true;
    }
  });
  activeRockets = activeRockets.filter((r) => !r.spent);
  checkBossDefeat();

  bossBombs.forEach((bomb) => {
    bomb.y += bomb.vy;
    bomb.fuse--;
  });
  bossBombs.forEach((bomb) => {
    if (bomb.fuse <= 0 || bomb.y > HEIGHT - 50 || rectsOverlap(bomb, player)) {
      detonateGhostBomb(bomb.x + bomb.w / 2, bomb.y + bomb.h / 2);
      bomb.spent = true;
    }
  });
  bossBombs = bossBombs.filter((bomb) => !bomb.spent);

  if (laserBeam) {
    const lx0 = laserBeam.x;
    const lx1 = laserBeam.x + laserBeam.width;
    enemies.forEach((e) => {
      if (!e.alive) return;
      if (e.x < lx1 && e.x + e.w > lx0) {
        e.hp -= 1;
        if (e.hp <= 0) {
          e.alive = false;
          state.score += 10;
          addPhoenixProgress(1);
          spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, "#ffcf5c");
          if (Math.random() < 0.14) spawnPickup(e.x + e.w / 2, e.y + e.h / 2);
        }
      }
    });
    if (boss && !boss.entering && boss.x < lx1 && boss.x + boss.w > lx0) {
      boss.hp -= 2;
      boss.hitFlash = 4;
    }
    laserBeam.timer--;
    if (laserBeam.timer <= 0) laserBeam = null;
    checkBossDefeat();
  }

  bullets.forEach((b) => {
    b.x += b.vx;
    b.y += b.vy;
  });
  bullets = bullets.filter(
    (b) => b.y > -20 && b.y < HEIGHT + 20 && b.x > -20 && b.x < WIDTH + 20
  );

  enemyBullets.forEach((b) => {
    b.x += b.vx || 0;
    b.y += b.vy !== undefined ? b.vy : b.speed;
  });
  enemyBullets = enemyBullets.filter(
    (b) => b.y < HEIGHT && b.y > -20 && b.x > -20 && b.x < WIDTH + 20
  );

  const t = Date.now() / 1000;
  enemies.forEach((e) => {
    if (!e.alive) return;
    if (e.stunTimer > 0) {
      e.stunTimer--;
      return;
    }
    if (e.entering) {
      e.y += 3.4;
      e.x = e.baseX + Math.sin(t * 5 + e.wobble) * 14;
      if (e.y >= e.targetY) {
        e.y = e.targetY;
        e.entering = false;
      }
      return;
    }
    e.driftTimer--;
    if (e.driftTimer <= 0) {
      if (Math.random() < 0.18) {
        // sudden dive toward the player's position
        const dx = player.x - e.x;
        e.vx = Math.sign(dx || 1) * (1.4 + Math.random() * 1.4) * e.speedMul;
        e.vy = (1.2 + Math.random() * 1.2) * e.speedMul;
        e.driftTimer = Math.random() * 40 + 30;
      } else {
        e.vx = (Math.random() - 0.5) * 3.2 * e.speedMul;
        e.vy = (Math.random() - 0.5) * 3.2 * e.speedMul;
        e.driftTimer = Math.random() * 60 + 30;
      }
    }
    e.x += e.vx;
    e.y += e.vy;
    e.x = Math.max(8, Math.min(WIDTH - e.w - 8, e.x));
    e.y = Math.max(20, Math.min(ENEMY_MAX_Y - e.h, e.y));
    if (e.x <= 8 || e.x >= WIDTH - e.w - 8) e.vx *= -1;
    if (e.y <= 20 || e.y >= ENEMY_MAX_Y - e.h) e.vy *= -1;
    e.fireCooldown--;
    if (e.fireCooldown <= 0) {
      if (e.type === "cruiser") {
        const speed = 3.2 + state.wave * 0.15;
        enemyBullets.push({ x: e.x + e.w * 0.22 - 2, y: e.y + e.h, w: 4, h: 10, vx: 0, vy: speed });
        enemyBullets.push({ x: e.x + e.w * 0.78 - 2, y: e.y + e.h, w: 4, h: 10, vx: 0, vy: speed });
      } else if (e.type === "stalker") {
        const angle = Math.atan2(
          player.y + player.h / 2 - (e.y + e.h),
          player.x + player.w / 2 - (e.x + e.w / 2)
        );
        const speed = 3.6 + state.wave * 0.15;
        enemyBullets.push({
          x: e.x + e.w / 2 - 2,
          y: e.y + e.h,
          w: 4,
          h: 4,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
        });
      } else {
        enemyBullets.push({
          x: e.x + e.w / 2 - 2,
          y: e.y + e.h,
          w: 4,
          h: 10,
          vx: 0,
          vy: 3.5 + state.wave * 0.2,
        });
      }
      e.fireCooldown = Math.random() * (e.fireMax - e.fireMin) + e.fireMin;
    }
  });

  if (boss) {
    if (boss.hitFlash > 0) boss.hitFlash--;
    if (boss.entering) {
      boss.y += 2.2;
      if (boss.y >= boss.targetY) {
        boss.y = boss.targetY;
        boss.entering = false;
      }
    } else if (boss.stunTimer > 0) {
      boss.stunTimer--;
    } else {
      boss.phase = boss.hp <= boss.maxHp * 0.4 ? 2 : 1;

      boss.x += boss.dir * boss.speed;
      if (boss.x <= 20) {
        boss.x = 20;
        boss.dir = 1;
      } else if (boss.x >= WIDTH - boss.w - 20) {
        boss.x = WIDTH - boss.w - 20;
        boss.dir = -1;
      }

      if (boss.bossType === "ghost") {
        boss.y = boss.targetY + Math.sin(t * 1.1 + boss.driftPhase) * 10;

        if (Math.random() < 0.4) {
          particles.push({
            x: boss.x + Math.random() * boss.w,
            y: boss.y + boss.h * 0.6,
            vx: (Math.random() - 0.5) * 0.4,
            vy: Math.random() * 0.6 + 0.2,
            life: 40 + Math.random() * 20,
            color: "rgba(111,255,224,0.5)",
          });
        }

        boss.patternTimer--;
        if (boss.patternTimer <= 0) {
          boss.patternIndex = (boss.patternIndex + 1) % 5;
          boss.patternTimer = boss.phase === 2 ? 65 : 95;
          if (boss.patternIndex === 0) fireGhostBroadside();
          else if (boss.patternIndex === 1) fireGhostCurseVolley();
          else if (boss.patternIndex === 2) fireGhostCannonballs();
          else if (boss.patternIndex === 3) fireGhostBomb();
          else fireGhostMachineGunBurst();
        }

        if (boss.machineGunBurst > 0) {
          boss.machineGunBurst--;
          boss.machineGunCooldown--;
          if (boss.machineGunCooldown <= 0) {
            const cx = boss.x + boss.w / 2;
            const cy = boss.y + boss.h * 0.8;
            const spray = (Math.random() - 0.5) * 0.18;
            const angle =
              Math.atan2(
                player.y + player.h / 2 - cy,
                player.x + player.w / 2 - cx
              ) + spray;
            const speed = 5.4;
            enemyBullets.push({
              x: cx - 1.5,
              y: cy,
              w: 3,
              h: 3,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
            });
            boss.machineGunCooldown = 4;
          }
        }
      } else {
        boss.spinAngle += boss.phase === 2 ? 0.16 : 0.1;

        boss.spinFireCooldown--;
        if (boss.spinFireCooldown <= 0) {
          fireBossSpiral();
          boss.spinFireCooldown = boss.phase === 2 ? 5 : 9;
        }
      }
    }
  }

  bullets.forEach((b) => {
    enemies.forEach((e) => {
      if (!e.alive) return;
      if (rectsOverlap(b, e)) {
        b.hit = true;
        e.hp--;
        if (e.hp <= 0) {
          e.alive = false;
          state.score += 10;
          addPhoenixProgress(1);
          spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, "#ffcf5c");
          if (Math.random() < 0.14) spawnPickup(e.x + e.w / 2, e.y + e.h / 2);
        }
      }
    });
    if (boss && !boss.entering && rectsOverlap(b, boss)) {
      b.hit = true;
      boss.hp--;
      boss.hitFlash = 6;
    }
  });
  bullets = bullets.filter((b) => !b.hit);
  checkBossDefeat();

  if (player.invincible <= 0) {
    enemyBullets.forEach((b) => {
      if (rectsOverlap(b, player)) {
        b.hit = true;
        hitPlayer();
      }
    });
    enemyBullets = enemyBullets.filter((b) => !b.hit);

    enemies.forEach((e) => {
      if (e.alive && rectsOverlap(e, player)) {
        e.alive = false;
        hitPlayer();
        spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, "#ffcf5c");
      }
    });

    if (boss && !boss.entering && rectsOverlap(boss, player)) {
      hitPlayer();
    }
  }

  if (player.phoenixMode) {
    player.phoenixTimer--;
    if (player.phoenixTimer <= 0) player.phoenixMode = false;

    for (let i = 0; i < 2; i++) {
      particles.push({
        x: player.x + player.w / 2 + (Math.random() - 0.5) * 10,
        y: player.y + player.h * 0.7,
        vx: (Math.random() - 0.5) * 1.5,
        vy: Math.random() * 2 + 1,
        life: 20 + Math.random() * 10,
        color: Math.random() < 0.5 ? "#ff5a1f" : "#ffd166",
      });
    }

    enemies.forEach((e) => {
      if (e.alive && rectsOverlap(e, player)) {
        e.alive = false;
        state.score += 10;
        spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, "#ff5a1f");
        if (Math.random() < 0.14) spawnPickup(e.x + e.w / 2, e.y + e.h / 2);
      }
    });

    if (boss && !boss.entering && rectsOverlap(boss, player)) {
      boss.hp -= 4;
      boss.hitFlash = 4;
    }
    checkBossDefeat();
  }

  particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
  });
  particles = particles.filter((p) => p.life > 0);

  stars.forEach((s) => {
    s.y += s.speed;
    if (s.y > HEIGHT) {
      s.y = 0;
      s.x = Math.random() * WIDTH;
    }
  });

  if (enemies.length && enemies.every((e) => !e.alive)) {
    state.wave++;
    spawnWave(state.wave);
  }

  const bottomBreach = enemies.some((e) => e.alive && e.y + e.h >= HEIGHT - 40);
  if (bottomBreach) {
    state.lives = 0;
  }

  updateHud();

  if (state.lives <= 0 && !dying) {
    dying = true;
    deathTimer = 60;
    spawnExplosion(player.x + player.w / 2, player.y + player.h / 2, "#ff5d73");
    spawnExplosion(player.x + player.w / 2, player.y + player.h / 2, "#ffcf5c");
    spawnExplosion(player.x + player.w / 2, player.y + player.h / 2, "#e8f1ff");
  }
}

function hitPlayer() {
  state.lives--;
  player.invincible = 90;
  spawnExplosion(player.x + player.w / 2, player.y + player.h / 2, "#ff5d73");
}

function drawPlayerShip(x, y, w, h) {
  const cx = x + w / 2;
  ctx.save();

  // engine flame
  const flicker = 8 + Math.random() * 5;
  const flameGrad = ctx.createRadialGradient(cx, y + h, 1, cx, y + h + flicker, flicker);
  flameGrad.addColorStop(0, "rgba(127,255,212,0.9)");
  flameGrad.addColorStop(1, "rgba(127,255,212,0)");
  ctx.fillStyle = flameGrad;
  ctx.beginPath();
  ctx.arc(cx, y + h, flicker, 0, Math.PI * 2);
  ctx.fill();

  // swept wings
  ctx.fillStyle = "#3ab8a6";
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.95);
  ctx.lineTo(cx - 3, y + h * 0.35);
  ctx.lineTo(cx, y + h * 0.65);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + w, y + h * 0.95);
  ctx.lineTo(cx + 3, y + h * 0.35);
  ctx.lineTo(cx, y + h * 0.65);
  ctx.closePath();
  ctx.fill();

  // wingtip glow
  ctx.fillStyle = "#7fffd4";
  ctx.beginPath();
  ctx.arc(x + 1, y + h * 0.95, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w - 1, y + h * 0.95, 2, 0, Math.PI * 2);
  ctx.fill();

  // fuselage / nose cone
  ctx.fillStyle = "#e8fffb";
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(cx + 5, y + h * 0.7);
  ctx.lineTo(cx - 5, y + h * 0.7);
  ctx.closePath();
  ctx.fill();

  // cockpit glass
  ctx.fillStyle = "#133a5e";
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.32, 2.4, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPhoenixShip(x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const t = Date.now() / 1000;
  ctx.save();

  // fiery aura
  const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, w * 1.5);
  glow.addColorStop(0, "rgba(255,160,60,0.55)");
  glow.addColorStop(1, "rgba(255,60,20,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // flickering phoenix wings
  [-1, 1].forEach((side) => {
    const flick = Math.sin(t * 14 + side * 2) * 4;
    ctx.fillStyle = "#ff5a1f";
    ctx.beginPath();
    ctx.moveTo(cx, y + h * 0.5);
    ctx.quadraticCurveTo(
      cx + side * w * 1.3,
      y + h * 0.1 + flick,
      cx + side * w * 1.6,
      y + h * 0.75
    );
    ctx.quadraticCurveTo(cx + side * w * 0.7, y + h * 0.55, cx, y + h * 0.6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffcf5c";
    ctx.beginPath();
    ctx.moveTo(cx, y + h * 0.5);
    ctx.quadraticCurveTo(
      cx + side * w * 0.9,
      y + h * 0.3 + flick * 0.6,
      cx + side * w * 1.05,
      y + h * 0.65
    );
    ctx.closePath();
    ctx.fill();
  });

  // fiery hull
  ctx.fillStyle = "#ff7a3c";
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(cx + 6, y + h * 0.75);
  ctx.lineTo(cx, y + h * 0.6);
  ctx.lineTo(cx - 6, y + h * 0.75);
  ctx.closePath();
  ctx.fill();

  // white-hot core
  ctx.fillStyle = "#fff4cc";
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.35, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawEvilStarship(x, y, w, h) {
  const cx = x + w / 2;
  ctx.save();

  // engine glow at the rear (top, since it's diving toward the player) — flat layers, no gradient
  const flicker = 6 + Math.random() * 4;
  ctx.fillStyle = "rgba(255,70,70,0.35)";
  ctx.beginPath();
  ctx.arc(cx, y, flicker, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,70,70,0.75)";
  ctx.beginPath();
  ctx.arc(cx, y, flicker * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // jagged swept-back wings
  ctx.fillStyle = "#2a0f1a";
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.08);
  ctx.lineTo(cx - 3, y + h * 0.62);
  ctx.lineTo(cx, y + h * 0.38);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + w, y + h * 0.08);
  ctx.lineTo(cx + 3, y + h * 0.62);
  ctx.lineTo(cx, y + h * 0.38);
  ctx.closePath();
  ctx.fill();

  // menacing red wingtip lights
  ctx.fillStyle = "#ff2d4d";
  ctx.beginPath();
  ctx.arc(x + 1, y + h * 0.08, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w - 1, y + h * 0.08, 2, 0, Math.PI * 2);
  ctx.fill();

  // dark hull, nose pointed down toward the player
  ctx.fillStyle = "#17141f";
  ctx.beginPath();
  ctx.moveTo(cx, y + h);
  ctx.lineTo(cx + 5, y + h * 0.32);
  ctx.lineTo(cx - 5, y + h * 0.32);
  ctx.closePath();
  ctx.fill();

  // glowing red cockpit eye
  ctx.fillStyle = "#ff2d4d";
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.62, 2.6, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawCruiser(x, y, w, h) {
  ctx.save();

  // twin engine glow — flat layers, no gradient
  [x + w * 0.25, x + w * 0.75].forEach((ex) => {
    const flicker = 5 + Math.random() * 3;
    ctx.fillStyle = "rgba(255,70,70,0.3)";
    ctx.beginPath();
    ctx.arc(ex, y, flicker, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,70,70,0.7)";
    ctx.beginPath();
    ctx.arc(ex, y, flicker * 0.45, 0, Math.PI * 2);
    ctx.fill();
  });

  // boxy armored hull
  ctx.fillStyle = "#23202b";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.1, y + h * 0.1);
  ctx.lineTo(x + w * 0.9, y + h * 0.1);
  ctx.lineTo(x + w * 0.78, y + h * 0.85);
  ctx.lineTo(x + w * 0.22, y + h * 0.85);
  ctx.closePath();
  ctx.fill();

  // hull plating line
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.18, y + h * 0.45);
  ctx.lineTo(x + w * 0.82, y + h * 0.45);
  ctx.stroke();

  // red sensor stripe
  ctx.fillStyle = "#ff2d4d";
  ctx.fillRect(x + w * 0.4, y + h * 0.3, w * 0.2, h * 0.18);

  // gun barrels
  ctx.fillStyle = "#17141f";
  ctx.fillRect(x + w * 0.2, y + h * 0.78, 3, h * 0.32);
  ctx.fillRect(x + w * 0.77, y + h * 0.78, 3, h * 0.32);

  ctx.restore();
}

function drawStalker(x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();

  // engine glow — flat layers, no gradient
  const flicker = 5 + Math.random() * 3;
  ctx.fillStyle = "rgba(176,107,255,0.3)";
  ctx.beginPath();
  ctx.arc(cx, y, flicker, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(176,107,255,0.7)";
  ctx.beginPath();
  ctx.arc(cx, y, flicker * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // diamond hull
  ctx.fillStyle = "#241233";
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(x + w, cy);
  ctx.lineTo(cx, y + h);
  ctx.lineTo(x, cy);
  ctx.closePath();
  ctx.fill();

  // glowing tracking eye (cheap layered glow instead of shadowBlur)
  ctx.fillStyle = "rgba(176,107,255,0.35)";
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b06bff";
  ctx.beginPath();
  ctx.arc(cx, cy, 3.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBoss(b) {
  if (b.bossType === "ghost") drawGhostPirateBoss(b);
  else drawSkullBoss(b);
}

function drawSkullBoss(b) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const angry = b.phase === 2;
  const eyeColor = angry ? "#ff2d4d" : "#b06bff";
  ctx.save();
  if (b.hitFlash > 0) ctx.globalAlpha = 0.55;

  // ambient aura
  const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, b.w * 0.85);
  glow.addColorStop(0, angry ? "rgba(255,45,77,0.5)" : "rgba(176,107,255,0.35)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(cx, cy, b.w * 0.85, b.h * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();

  // cranium + jaw silhouette
  ctx.fillStyle = "#f2ead9";
  ctx.beginPath();
  ctx.moveTo(cx - b.w * 0.42, cy);
  ctx.quadraticCurveTo(cx - b.w * 0.42, cy - b.h * 0.55, cx, cy - b.h * 0.55);
  ctx.quadraticCurveTo(cx + b.w * 0.42, cy - b.h * 0.55, cx + b.w * 0.42, cy);
  ctx.lineTo(cx + b.w * 0.3, cy + b.h * 0.22);
  ctx.lineTo(cx + b.w * 0.18, cy + b.h * 0.4);
  ctx.lineTo(cx - b.w * 0.18, cy + b.h * 0.4);
  ctx.lineTo(cx - b.w * 0.3, cy + b.h * 0.22);
  ctx.closePath();
  ctx.fill();

  // cheekbone shading
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.beginPath();
  ctx.ellipse(cx - b.w * 0.3, cy + b.h * 0.08, b.w * 0.08, b.h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + b.w * 0.3, cy + b.h * 0.08, b.w * 0.08, b.h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // eye sockets
  ctx.fillStyle = "#1a1420";
  ctx.beginPath();
  ctx.ellipse(cx - b.w * 0.18, cy - b.h * 0.05, b.w * 0.13, b.h * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + b.w * 0.18, cy - b.h * 0.05, b.w * 0.13, b.h * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();

  // glowing pupils (layered glow instead of shadowBlur)
  [-1, 1].forEach((side) => {
    const ex = cx + side * b.w * 0.18;
    const ey = cy - b.h * 0.05;
    ctx.fillStyle = eyeColor + "55";
    ctx.beginPath();
    ctx.arc(ex, ey, b.w * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(ex, ey, b.w * 0.055, 0, Math.PI * 2);
    ctx.fill();
  });

  // nasal cavity
  ctx.fillStyle = "#1a1420";
  ctx.beginPath();
  ctx.moveTo(cx, cy + b.h * 0.06);
  ctx.lineTo(cx - b.w * 0.05, cy + b.h * 0.17);
  ctx.lineTo(cx + b.w * 0.05, cy + b.h * 0.17);
  ctx.closePath();
  ctx.fill();

  // teeth
  ctx.strokeStyle = "#cdbfa0";
  ctx.lineWidth = 1.5;
  const teeth = 6;
  for (let i = 0; i <= teeth; i++) {
    const tx = cx - b.w * 0.18 + ((b.w * 0.36) / teeth) * i;
    ctx.beginPath();
    ctx.moveTo(tx, cy + b.h * 0.22);
    ctx.lineTo(tx, cy + b.h * 0.38);
    ctx.stroke();
  }

  // fancy crown
  ctx.fillStyle = "#e8c15a";
  ctx.fillRect(cx - b.w * 0.32, cy - b.h * 0.56, b.w * 0.64, b.h * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx - b.w * 0.28, cy - b.h * 0.56);
  ctx.lineTo(cx - b.w * 0.22, cy - b.h * 0.72);
  ctx.lineTo(cx - b.w * 0.16, cy - b.h * 0.56);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - b.w * 0.08, cy - b.h * 0.56);
  ctx.lineTo(cx, cy - b.h * 0.78);
  ctx.lineTo(cx + b.w * 0.08, cy - b.h * 0.56);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + b.w * 0.16, cy - b.h * 0.56);
  ctx.lineTo(cx + b.w * 0.22, cy - b.h * 0.72);
  ctx.lineTo(cx + b.w * 0.28, cy - b.h * 0.56);
  ctx.closePath();
  ctx.fill();

  // crown gem (layered glow instead of shadowBlur)
  ctx.fillStyle = eyeColor + "55";
  ctx.beginPath();
  ctx.ellipse(cx, cy - b.h * 0.68, b.w * 0.07, b.h * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = eyeColor;
  ctx.beginPath();
  ctx.ellipse(cx, cy - b.h * 0.68, b.w * 0.04, b.h * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  drawBossHealthBar(b, "SKULL LORD", angry ? "#ff5d73" : "#b06bff");
}

function drawBossHealthBar(b, label, barColor) {
  if (b.entering) return;
  const barW = 180;
  const barX = WIDTH / 2 - barW / 2;
  ctx.save();
  ctx.fillStyle = "#e8f1ff";
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, WIDTH / 2, 10);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(barX, 14, barW, 8);
  ctx.fillStyle = barColor;
  ctx.fillRect(barX, 14, barW * Math.max(b.hp / b.maxHp, 0), 8);
  ctx.strokeStyle = "#e8f1ff";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, 14, barW, 8);
  ctx.restore();
}

function drawGhostPirateBoss(b) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const angry = b.phase === 2;
  const t = Date.now() / 1000;
  const ghostAlpha = 0.68 + Math.sin(t * 2.4 + b.driftPhase) * 0.12;
  const hullColor = angry ? "#8fd9c4" : "#6fffe0";

  ctx.save();
  if (b.hitFlash > 0) ctx.globalAlpha = 0.4;
  else ctx.globalAlpha = ghostAlpha;

  // spectral aura
  const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, b.w * 0.9);
  glow.addColorStop(0, angry ? "rgba(255,93,115,0.4)" : "rgba(111,255,224,0.35)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(cx, cy, b.w * 0.9, b.h * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();

  // tattered ghost trail (ragged bottom edge of the hull)
  ctx.fillStyle = hullColor;
  ctx.beginPath();
  ctx.moveTo(b.x + b.w * 0.1, b.y + b.h * 0.35);
  ctx.lineTo(b.x + b.w * 0.9, b.y + b.h * 0.35);
  ctx.lineTo(b.x + b.w * 0.78, b.y + b.h * 0.95);
  ctx.lineTo(b.x + b.w * 0.63, b.y + b.h * 0.65);
  ctx.lineTo(b.x + b.w * 0.5, b.y + b.h * 0.98);
  ctx.lineTo(b.x + b.w * 0.37, b.y + b.h * 0.65);
  ctx.lineTo(b.x + b.w * 0.22, b.y + b.h * 0.95);
  ctx.closePath();
  ctx.fill();

  // galleon hull body
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + b.h * 0.2);
  ctx.quadraticCurveTo(cx, b.y - b.h * 0.08, b.x + b.w, b.y + b.h * 0.2);
  ctx.lineTo(b.x + b.w * 0.85, b.y + b.h * 0.4);
  ctx.lineTo(b.x + b.w * 0.15, b.y + b.h * 0.4);
  ctx.closePath();
  ctx.fill();

  // mast
  ctx.strokeStyle = hullColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, b.y - b.h * 0.08);
  ctx.lineTo(cx, b.y - b.h * 0.32);
  ctx.stroke();

  // skull-and-crossbones flag
  ctx.fillStyle = angry ? "#ff5d73" : "#2a2f3a";
  ctx.beginPath();
  ctx.moveTo(cx, b.y - b.h * 0.32);
  ctx.lineTo(cx + b.w * 0.22, b.y - b.h * 0.26);
  ctx.lineTo(cx, b.y - b.h * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e8f1ff";
  ctx.beginPath();
  ctx.arc(cx + b.w * 0.09, b.y - b.h * 0.26, 3, 0, Math.PI * 2);
  ctx.fill();

  // glowing cannon ports (layered glow instead of shadowBlur)
  const portColor = angry ? "#ff5d73" : "#aef3e0";
  ctx.fillStyle = portColor + "44";
  [0.22, 0.4, 0.6, 0.78].forEach((f) => {
    ctx.beginPath();
    ctx.arc(b.x + b.w * f, b.y + b.h * 0.3, 4.2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = portColor;
  [0.22, 0.4, 0.6, 0.78].forEach((f) => {
    ctx.beginPath();
    ctx.arc(b.x + b.w * f, b.y + b.h * 0.3, 2.4, 0, Math.PI * 2);
    ctx.fill();
  });

  // eerie bridge eyes (layered glow instead of shadowBlur)
  const eyeFill = angry ? "#ff2d4d" : "#7cffe8";
  ctx.fillStyle = eyeFill + "55";
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.ellipse(cx + side * b.w * 0.12, b.y + b.h * 0.1, 7, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = eyeFill;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.ellipse(cx + side * b.w * 0.12, b.y + b.h * 0.1, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();

  drawBossHealthBar(b, "GHOST PIRATE", angry ? "#ff5d73" : "#6fffe0");
}

const PICKUP_STYLE = {
  laser: { color: "#7fffd4", glow: "rgba(127,255,212,0.55)" },
  rocket: { color: "#ffb347", glow: "rgba(255,179,71,0.55)" },
  life: { color: "#ff5d73", glow: "rgba(255,93,115,0.55)" },
  shield: { color: "#5cc8ff", glow: "rgba(92,200,255,0.55)" },
  wingman: { color: "#4ade80", glow: "rgba(74,222,128,0.55)" },
  emp: { color: "#38bdf8", glow: "rgba(56,189,248,0.55)" },
};

function drawPickup(p) {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const style = PICKUP_STYLE[p.type];
  const color = style.color;
  const glowColor = style.glow;
  const t = Date.now() / 1000;
  const phase = (p.x * 13 + p.y * 7) % (Math.PI * 2);
  const spin = t * 1.8 + phase;
  const pulse = 10 + Math.sin(t * 4 + phase) * 2;

  ctx.save();

  // pulsing outer aura
  const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, pulse + 6);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, pulse + 6, 0, Math.PI * 2);
  ctx.fill();

  // spinning faceted gem
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 0.7;
  const facets = 6;
  ctx.beginPath();
  for (let i = 0; i < facets; i++) {
    const angle = ((Math.PI * 2) / facets) * i;
    const r = i % 2 === 0 ? 8.5 : 5;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.rotate(-spin);
  ctx.translate(-cx, -cy);

  // inner icon — lightning bolt / flame droplet / heart / shield / phoenix
  ctx.fillStyle = "#ffffff";
  if (p.type === "laser") {
    ctx.beginPath();
    ctx.moveTo(cx - 1, cy - 5);
    ctx.lineTo(cx + 2.4, cy - 0.5);
    ctx.lineTo(cx - 0.2, cy - 0.5);
    ctx.lineTo(cx + 1.4, cy + 5);
    ctx.lineTo(cx - 2.6, cy + 0.6);
    ctx.lineTo(cx + 0.2, cy + 0.6);
    ctx.closePath();
    ctx.fill();
  } else if (p.type === "life") {
    ctx.beginPath();
    ctx.moveTo(cx, cy + 4.5);
    ctx.bezierCurveTo(cx - 7, cy - 2.5, cx - 3, cy - 7, cx, cy - 2.8);
    ctx.bezierCurveTo(cx + 3, cy - 7, cx + 7, cy - 2.5, cx, cy + 4.5);
    ctx.closePath();
    ctx.fill();
  } else if (p.type === "shield") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5.5);
    ctx.lineTo(cx + 4, cy - 3);
    ctx.lineTo(cx + 4, cy + 1.5);
    ctx.quadraticCurveTo(cx + 4, cy + 5, cx, cy + 6);
    ctx.quadraticCurveTo(cx - 4, cy + 5, cx - 4, cy + 1.5);
    ctx.lineTo(cx - 4, cy - 3);
    ctx.closePath();
    ctx.fill();
  } else if (p.type === "wingman") {
    ctx.beginPath();
    ctx.arc(cx - 2.6, cy, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 2.6, cy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.type === "emp") {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const angle = ((Math.PI * 2) / 6) * i;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 4.5, cy + Math.sin(angle) * 4.5);
      ctx.lineTo(cx + Math.cos(angle) * 6.5, cy + Math.sin(angle) * 6.5);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.quadraticCurveTo(cx + 4, cy - 1, cx, cy + 5);
    ctx.quadraticCurveTo(cx - 4, cy - 1, cx, cy - 5);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#ffffff";
  stars.forEach((s) => {
    ctx.globalAlpha = 0.5 + s.r / 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  if (!dying) {
    wingmen.forEach((w) => {
      const ww = player.w * 0.6;
      const wh = player.h * 0.6;
      const wx = player.x + player.w / 2 + w.offsetX - ww / 2;
      const wy = player.y + w.offsetY - wh / 2;
      ctx.save();
      if (w.timer < 90) ctx.globalAlpha = Math.max(w.timer / 90, 0.2);
      drawPlayerShip(wx, wy, ww, wh);
      ctx.restore();
    });

    if (player.phoenixMode) {
      drawPhoenixShip(player.x, player.y, player.w, player.h);
    } else if (player.invincible <= 0 || Math.floor(player.invincible / 5) % 2 === 0) {
      drawPlayerShip(player.x, player.y, player.w, player.h);
    }
  }

  ctx.strokeStyle = "#7fffd4";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  bullets.forEach((b) => {
    const mag = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx / mag;
    const uy = b.vy / mag;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - ux * 10, cy - uy * 10);
    ctx.stroke();
  });

  ctx.fillStyle = "#ff2d4d";
  enemyBullets.forEach((b) => ctx.fillRect(b.x, b.y, b.w, b.h));

  enemies.forEach((e) => {
    if (!e.alive) return;
    if (e.type === "cruiser") drawCruiser(e.x, e.y, e.w, e.h);
    else if (e.type === "stalker") drawStalker(e.x, e.y, e.w, e.h);
    else drawEvilStarship(e.x, e.y, e.w, e.h);
    if (e.stunTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 80) * 0.2;
      ctx.strokeStyle = "#9be8ff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(e.x - 2, e.y - 2, e.w + 4, e.h + 4);
      ctx.restore();
    }
  });

  if (boss) {
    drawBoss(boss);
    if (boss.stunTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 80) * 0.2;
      ctx.strokeStyle = "#9be8ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(boss.x - 3, boss.y - 3, boss.w + 6, boss.h + 6);
      ctx.restore();
    }
  }

  pickups.forEach((p) => drawPickup(p));

  ctx.fillStyle = "#ffb347";
  activeRockets.forEach((r) => {
    ctx.beginPath();
    ctx.moveTo(r.x + r.w / 2, r.y);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.lineTo(r.x, r.y + r.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,80,0,0.6)";
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2, r.y + r.h + 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffb347";
  });

  bossBombs.forEach((bomb) => {
    const cx = bomb.x + bomb.w / 2;
    const cy = bomb.y + bomb.h / 2;
    const pulse = 1 + Math.sin(Date.now() / 60) * 0.25;
    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, 14 * pulse);
    glow.addColorStop(0, "rgba(255,157,77,0.7)");
    glow.addColorStop(1, "rgba(255,157,77,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 14 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bomb.fuse < 20 ? "#ff5d73" : "#2a2f3a";
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffcf5c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx + 3, cy - 10);
    ctx.stroke();
    ctx.restore();
  });

  if (laserBeam) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, laserBeam.timer / 24) * 0.8 + 0.2;
    const grad = ctx.createLinearGradient(laserBeam.x, 0, laserBeam.x + laserBeam.width, 0);
    grad.addColorStop(0, "rgba(127,255,212,0)");
    grad.addColorStop(0.5, "rgba(127,255,212,0.95)");
    grad.addColorStop(1, "rgba(127,255,212,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(laserBeam.x, 0, laserBeam.width, player.y + player.h / 2);
    ctx.restore();
  }

  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(p.life / 40, 0);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 3, 3);
  });
  ctx.globalAlpha = 1;

  if (empPulse.timer > 0) {
    const progress = 1 - empPulse.timer / 24;
    ctx.save();
    ctx.globalAlpha = Math.max(1 - progress, 0) * 0.8;
    ctx.strokeStyle = "#9be8ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      player.x + player.w / 2,
      player.y + player.h / 2,
      progress * Math.max(WIDTH, HEIGHT),
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
  }

  if (stageBanner.timer > 0) {
    const fadeIn = Math.min(1, (120 - stageBanner.timer) / 20);
    const fadeOut = Math.min(1, stageBanner.timer / 30);
    ctx.save();
    ctx.globalAlpha = Math.min(fadeIn, fadeOut);
    ctx.textAlign = "center";
    ctx.font = "bold 32px monospace";
    ctx.fillStyle = "#ff5d73";
    ctx.shadowColor = "rgba(255, 93, 115, 0.9)";
    ctx.shadowBlur = 16;
    ctx.fillText(stageBanner.text, WIDTH / 2, HEIGHT / 2 - 20);
    ctx.restore();
  }

  if (player.phoenixMode) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 14px monospace";
    ctx.fillStyle = "#ff5a1f";
    ctx.shadowColor = "rgba(255, 90, 31, 0.9)";
    ctx.shadowBlur = 10;
    ctx.fillText(
      `🔥 PHOENIX MODE ${Math.ceil(player.phoenixTimer / 60)}s`,
      WIDTH / 2,
      40
    );
    ctx.restore();
  }

  if (paused) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#e8f1ff";
    ctx.font = "24px monospace";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", WIDTH / 2, HEIGHT / 2);
  }
}

function loop() {
  if (!running) return;
  if (!paused) {
    update();
    draw();
  }
  animationId = requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  cancelAnimationFrame(animationId);
  finalScoreEl.textContent = `Final Score: ${state.score} — reached stage ${state.wave}`;
  gameOverOverlay.hidden = false;
}

function enterFullscreen() {
  const el = document.documentElement;
  const request =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.msRequestFullscreen;
  if (request) {
    const result = request.call(el);
    if (result && result.catch) result.catch(() => {});
  }
}

function startGame() {
  enterFullscreen();
  overlay.hidden = true;
  gameOverOverlay.hidden = true;
  resetGame();
  running = true;
  paused = false;
  loop();
}

window.addEventListener("keydown", (e) => {
  keys.add(e.key);
  if (e.key === " ") e.preventDefault();
  if ((e.key === "p" || e.key === "P") && running) {
    paused = !paused;
  }
  if (!e.repeat && running && !paused) {
    if (e.key === "ArrowLeft" && player.laser > 0 && !laserBeam) {
      fireLaserBeam();
    }
    if (e.key === "ArrowRight" && player.rockets > 0) {
      fireRocket();
    }
    if (e.key === "Shift" && player.phoenixCharge > 0 && !player.phoenixMode) {
      activatePhoenix();
    }
    if (e.key === "ArrowUp" && player.empCharge > 0) {
      activateEmp();
    }
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.key);
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = ((e.clientX - rect.left) / rect.width) * WIDTH;
  mouseY = ((e.clientY - rect.top) / rect.height) * HEIGHT;
});

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);

initStars();
draw();
