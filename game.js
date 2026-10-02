const canvas = document.getElementById("gameCanvas");
const displayCtx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const waveEl = document.getElementById("wave");
const laserEl = document.getElementById("laserCount");
const rocketEl = document.getElementById("rocketCount");
const phoenixEl = document.getElementById("phoenixCount");
const empEl = document.getElementById("empCount");
const gateEl = document.getElementById("gateCount");
const overlay = document.getElementById("overlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const finalScoreEl = document.getElementById("finalScore");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const ENEMY_MAX_Y = HEIGHT / 2;

// All game rendering draws onto a small offscreen buffer (via `ctx`), which is
// then upscaled with nearest-neighbor filtering onto the real canvas — this is
// what gives every sprite its chunky "3D pixel" voxel look for free, with no
// changes needed to the individual draw*() functions below.
const PIXEL_SCALE = 1.5;
const pixelCanvas = document.createElement("canvas");
pixelCanvas.width = Math.round(WIDTH / PIXEL_SCALE);
pixelCanvas.height = Math.round(HEIGHT / PIXEL_SCALE);
const ctx = pixelCanvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.scale(1 / PIXEL_SCALE, 1 / PIXEL_SCALE);

function fitCanvasResolution() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  displayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  displayCtx.imageSmoothingEnabled = false;
}
fitCanvasResolution();
window.addEventListener("resize", fitCanvasResolution);

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
  lives: 20,
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
  gateState: "idle",
  gateStateTimer: 0,
  gateTimer: 0,
};

let bullets = [];
let enemyBullets = [];
let enemies = [];
let particles = [];
let stars = [];
let boss = null;
let stageBanner = { text: "", subtext: "", timer: 0 };
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

const REALM_THEMES = [
  { name: "VIOLET VOID", bg: "#0a0510", star: "#cfc2e8", ember: "#ff8a4c" },
  { name: "BLOOD WASTES", bg: "#1a0508", star: "#ffb3b3", ember: "#ff3030" },
  { name: "PLAGUE MIRE", bg: "#0a140d", star: "#b9ffb0", ember: "#7fff6a" },
  { name: "FROZEN CRYPT", bg: "#050a14", star: "#b3e0ff", ember: "#7fd4ff" },
];

function currentRealm() {
  const tier = Math.floor((state.wave - 1) / 5) % REALM_THEMES.length;
  return REALM_THEMES[tier];
}

function announceStage(n) {
  const enteringRealm = (n - 1) % 5 === 0;
  stageBanner = {
    text: isBossStage(n) ? `STAGE ${n} — BOSS` : `STAGE ${n}`,
    subtext: enteringRealm ? currentRealm().name : "",
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
      ember: Math.random() < 0.12,
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
  state.lives = 20;
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
  player.gateState = "idle";
  player.gateStateTimer = 0;
  player.gateTimer = 0;
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
      ? `Wraith King: READY x${player.phoenixCharge}`
      : `Wraith King: ${player.phoenixKills}/10`;
  empEl.textContent = `EMP: ${player.empCharge}`;
  if (player.gateState === "charging") {
    gateEl.textContent = `Blood Gate: OPENING...`;
  } else if (player.gateState === "firing") {
    gateEl.textContent = `Blood Gate: FIRING ${Math.ceil(player.gateStateTimer / 72)}s`;
  } else if (player.gateTimer > 0) {
    gateEl.textContent = `Blood Gate: ${Math.ceil(player.gateTimer / 72)}s`;
  } else {
    gateEl.textContent = `Blood Gate: READY`;
  }
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

const GATE_CHARGE_TICKS = 58;
const GATE_FIRE_TICKS = 216;
const GATE_COOLDOWN_TICKS = 1080;
const GATE_WIDTH = WIDTH * 0.42;

function activateGateBeam() {
  player.gateState = "charging";
  player.gateStateTimer = GATE_CHARGE_TICKS;
  spawnExplosion(player.x + player.w / 2, player.y, "#ff1c38");
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

  if (keys.has("ArrowLeft") || keys.has("KeyA")) {
    player.x -= player.speed;
  }
  if (keys.has("ArrowRight") || keys.has("KeyD")) {
    player.x += player.speed;
  }
  if (keys.has("ArrowUp") || keys.has("KeyW")) {
    player.y -= player.speed;
  }
  if (keys.has("ArrowDown") || keys.has("KeyS")) {
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
        color: Math.random() < 0.5 ? "#6b4fa0" : "#b9a6ff",
      });
    }

    enemies.forEach((e) => {
      if (e.alive && rectsOverlap(e, player)) {
        e.alive = false;
        state.score += 10;
        spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, "#b9a6ff");
        if (Math.random() < 0.14) spawnPickup(e.x + e.w / 2, e.y + e.h / 2);
      }
    });

    if (boss && !boss.entering && rectsOverlap(boss, player)) {
      boss.hp -= 4;
      boss.hitFlash = 4;
    }
    checkBossDefeat();
  }

  if (player.gateTimer > 0) player.gateTimer--;

  if (player.gateState === "charging") {
    player.gateStateTimer--;
    if (Math.random() < 0.5) {
      particles.push({
        x: player.x + player.w / 2 + (Math.random() - 0.5) * 14,
        y: player.y - 4 - Math.random() * 10,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -Math.random() * 1.5,
        life: 16 + Math.random() * 8,
        color: "#ff1c38",
      });
    }
    if (player.gateStateTimer <= 0) {
      player.gateState = "firing";
      player.gateStateTimer = GATE_FIRE_TICKS;
    }
  } else if (player.gateState === "firing") {
    player.gateStateTimer--;
    const gx0 = player.x + player.w / 2 - GATE_WIDTH / 2;
    const gx1 = player.x + player.w / 2 + GATE_WIDTH / 2;
    enemies.forEach((e) => {
      if (e.alive && e.x < gx1 && e.x + e.w > gx0) {
        e.hp -= 1;
        if (e.hp <= 0) {
          e.alive = false;
          state.score += 10;
          addPhoenixProgress(1);
          spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, "#ff1c38");
          if (Math.random() < 0.14) spawnPickup(e.x + e.w / 2, e.y + e.h / 2);
        }
      }
    });
    if (boss && !boss.entering && boss.x < gx1 && boss.x + boss.w > gx0) {
      boss.hp -= 0.3;
      boss.hitFlash = 4;
    }
    checkBossDefeat();
    if (player.gateStateTimer <= 0) {
      player.gateState = "idle";
      player.gateTimer = GATE_COOLDOWN_TICKS;
    }
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
    spawnExplosion(player.x + player.w / 2, player.y + player.h / 2, "#ded2c3");
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

  // twin crimson engine trails, intense
  const flicker = 8 + Math.random() * 5;
  [-1, 1].forEach((side) => {
    const ex = cx + side * w * 0.16;
    const flameGrad = ctx.createRadialGradient(ex, y + h * 0.95, 1, ex, y + h * 0.95 + flicker, flicker);
    flameGrad.addColorStop(0, "rgba(255,10,30,0.95)");
    flameGrad.addColorStop(1, "rgba(255,10,30,0)");
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.arc(ex, y + h * 0.95, flicker, 0, Math.PI * 2);
    ctx.fill();
  });

  // jagged bone-and-iron wings, serrated like blades
  const wingGrad = ctx.createLinearGradient(cx - w * 0.6, y + h * 0.4, cx + w * 0.6, y + h * 0.85);
  wingGrad.addColorStop(0, "#17141f");
  wingGrad.addColorStop(0.5, "#5a4f45");
  wingGrad.addColorStop(1, "#0e0a10");
  ctx.fillStyle = wingGrad;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(cx, y + h * 0.32);
    ctx.lineTo(cx + side * w * 0.6, y + h * 0.58);
    ctx.lineTo(cx + side * w * 0.48, y + h * 0.66);
    ctx.lineTo(cx + side * w * 0.56, y + h * 0.74);
    ctx.lineTo(cx + side * w * 0.34, y + h * 0.88);
    ctx.lineTo(cx, y + h * 0.58);
    ctx.closePath();
    ctx.fill();
  });

  // blood streaks bleeding down the wings
  ctx.fillStyle = "#8a0e22";
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(cx + side * w * 0.3, y + h * 0.55);
    ctx.lineTo(cx + side * w * 0.32, y + h * 0.55);
    ctx.lineTo(cx + side * w * 0.27, y + h * 0.72);
    ctx.closePath();
    ctx.fill();
  });

  // blade-like tail fins
  ctx.fillStyle = "#1a1420";
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(cx + side * 1.5, y + h * 0.68);
    ctx.lineTo(cx + side * 7, y + h * 0.94);
    ctx.lineTo(cx + side * 1.2, y + h * 0.98);
    ctx.closePath();
    ctx.fill();
  });

  // bone-plated fuselage, aged bone-and-iron gradient
  const bodyGrad = ctx.createLinearGradient(cx - 5, y, cx + 5, y + h);
  bodyGrad.addColorStop(0, "#ede4d0");
  bodyGrad.addColorStop(0.45, "#6b5f52");
  bodyGrad.addColorStop(1, "#17141f");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(cx + 4, y + h * 0.32);
  ctx.lineTo(cx + 3, y + h * 0.84);
  ctx.lineTo(cx, y + h * 0.95);
  ctx.lineTo(cx - 3, y + h * 0.84);
  ctx.lineTo(cx - 4, y + h * 0.32);
  ctx.closePath();
  ctx.fill();

  // gothic rivets along the hull seam
  ctx.fillStyle = "#17141f";
  [0.4, 0.55, 0.7].forEach((f) => {
    ctx.beginPath();
    ctx.arc(cx - 2.2, y + h * f, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 2.2, y + h * f, 0.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // long fanged nose spike, bone
  ctx.fillStyle = "#ede4d0";
  ctx.beginPath();
  ctx.moveTo(cx - 2, y + h * 0.04);
  ctx.lineTo(cx, y - h * 0.14);
  ctx.lineTo(cx + 2, y + h * 0.04);
  ctx.lineTo(cx, y + h * 0.17);
  ctx.closePath();
  ctx.fill();

  // shoulder horns where the wings meet the hull
  ctx.fillStyle = "#1a1420";
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(cx + side * 3, y + h * 0.32);
    ctx.lineTo(cx + side * 8, y + h * 0.26);
    ctx.lineTo(cx + side * 4.5, y + h * 0.4);
    ctx.closePath();
    ctx.fill();
  });

  // crimson blood stripe down the spine
  ctx.fillStyle = "#c21030";
  ctx.fillRect(cx - 0.7, y + h * 0.18, 1.4, h * 0.62);

  // hollow eye socket housing the predator eye
  ctx.fillStyle = "#0e0a10";
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.28, 3.6, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // single glowing predator eye, vertical slit pupil
  ctx.fillStyle = "#ff1c3899";
  ctx.beginPath();
  ctx.arc(cx, y + h * 0.28, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff1c38";
  ctx.beginPath();
  ctx.arc(cx, y + h * 0.28, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#17070a";
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.28, 0.4, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // bared double fangs at the wingtips
  ctx.fillStyle = "#ede4d0";
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(cx + side * w * 0.55, y + h * 0.64);
    ctx.lineTo(cx + side * w * 0.65, y + h * 0.69);
    ctx.lineTo(cx + side * w * 0.53, y + h * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + side * w * 0.5, y + h * 0.72);
    ctx.lineTo(cx + side * w * 0.59, y + h * 0.77);
    ctx.lineTo(cx + side * w * 0.47, y + h * 0.76);
    ctx.closePath();
    ctx.fill();
  });

  ctx.restore();
}

function drawPhoenixShip(x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const t = Date.now() / 1000;
  ctx.save();

  // void aura
  const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, w * 1.5);
  glow.addColorStop(0, "rgba(140,90,220,0.55)");
  glow.addColorStop(1, "rgba(20,5,40,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // tattered spectral wings
  [-1, 1].forEach((side) => {
    const flick = Math.sin(t * 14 + side * 2) * 4;
    ctx.fillStyle = "#3a2050";
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

    ctx.fillStyle = "#6b4fa0";
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

    // taloned wingtip
    ctx.fillStyle = "#170c29";
    ctx.beginPath();
    ctx.moveTo(cx + side * w * 1.6, y + h * 0.75);
    ctx.lineTo(cx + side * w * 1.7, y + h * 0.82);
    ctx.lineTo(cx + side * w * 1.5, y + h * 0.78);
    ctx.closePath();
    ctx.fill();
  });

  // robed body
  ctx.fillStyle = "#241233";
  ctx.beginPath();
  ctx.moveTo(cx, y + h * 0.1);
  ctx.lineTo(cx + 6, y + h * 0.75);
  ctx.lineTo(cx, y + h * 0.6);
  ctx.lineTo(cx - 6, y + h * 0.75);
  ctx.closePath();
  ctx.fill();

  // crowned skull head
  ctx.fillStyle = "#ded2c3";
  ctx.beginPath();
  ctx.moveTo(cx, y + h * 0.1);
  ctx.quadraticCurveTo(cx + 4, y + h * 0.2, cx + 2.5, y + h * 0.32);
  ctx.lineTo(cx, y + h * 0.36);
  ctx.lineTo(cx - 2.5, y + h * 0.32);
  ctx.quadraticCurveTo(cx - 4, y + h * 0.2, cx, y + h * 0.1);
  ctx.closePath();
  ctx.fill();

  // crown spikes
  ctx.fillStyle = "#b9a6ff";
  [-2.2, 0, 2.2].forEach((ox) => {
    ctx.beginPath();
    ctx.moveTo(cx + ox - 1, y + h * 0.1);
    ctx.lineTo(cx + ox, y);
    ctx.lineTo(cx + ox + 1, y + h * 0.1);
    ctx.closePath();
    ctx.fill();
  });

  // glowing soul eye
  ctx.fillStyle = "#b9a6ff";
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.22, 2.6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, y + h * 0.22, 0.8, 0, Math.PI * 2);
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

  // scalloped bat-membrane wings
  ctx.fillStyle = "#2a0f1a";
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(cx, y + h * 0.3);
    ctx.lineTo(cx + side * w * 0.55, y + h * 0.1);
    ctx.quadraticCurveTo(cx + side * w * 0.5, y + h * 0.4, cx + side * w * 0.32, y + h * 0.42);
    ctx.quadraticCurveTo(cx + side * w * 0.42, y + h * 0.55, cx + side * w * 0.2, y + h * 0.6);
    ctx.lineTo(cx, y + h * 0.4);
    ctx.closePath();
    ctx.fill();
  });

  // tiny horn spikes
  ctx.fillStyle = "#2a0f1a";
  ctx.beginPath();
  ctx.moveTo(cx - 2, y + h * 0.2);
  ctx.lineTo(cx - 3.4, y);
  ctx.lineTo(cx - 1, y + h * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 2, y + h * 0.2);
  ctx.lineTo(cx + 3.4, y);
  ctx.lineTo(cx + 1, y + h * 0.18);
  ctx.closePath();
  ctx.fill();

  // imp head, chin pointed down toward the player
  ctx.fillStyle = "#17141f";
  ctx.beginPath();
  ctx.moveTo(cx, y + h);
  ctx.lineTo(cx + 4.5, y + h * 0.5);
  ctx.lineTo(cx - 4.5, y + h * 0.5);
  ctx.closePath();
  ctx.fill();

  // twin glowing eyes
  ctx.fillStyle = "#ff2d4d";
  ctx.beginPath();
  ctx.arc(cx - 1.8, y + h * 0.62, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 1.8, y + h * 0.62, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // gaping fanged maw
  ctx.fillStyle = "#0a0710";
  ctx.beginPath();
  ctx.moveTo(cx - 2.2, y + h * 0.78);
  ctx.lineTo(cx + 2.2, y + h * 0.78);
  ctx.lineTo(cx, y + h * 0.94);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ded2c3";
  [-1.4, 1.4].forEach((fx) => {
    ctx.beginPath();
    ctx.moveTo(cx + fx, y + h * 0.78);
    ctx.lineTo(cx + fx * 0.6, y + h * 0.86);
    ctx.lineTo(cx + fx * 1.3, y + h * 0.8);
    ctx.closePath();
    ctx.fill();
  });

  // clawed wing joints
  ctx.fillStyle = "#0a0710";
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.52, y + h * 0.42);
  ctx.lineTo(cx - w * 0.6, y + h * 0.5);
  ctx.lineTo(cx - w * 0.46, y + h * 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.52, y + h * 0.42);
  ctx.lineTo(cx + w * 0.6, y + h * 0.5);
  ctx.lineTo(cx + w * 0.46, y + h * 0.46);
  ctx.closePath();
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

  // tattered banner streamers
  ctx.fillStyle = "#4a1420";
  [x + w * 0.15, x + w * 0.85].forEach((bx) => {
    ctx.beginPath();
    ctx.moveTo(bx, y + h * 0.1);
    ctx.lineTo(bx, y + h * 0.5);
    ctx.lineTo(bx - 3, y + h * 0.42);
    ctx.lineTo(bx, y + h * 0.34);
    ctx.lineTo(bx - 3, y + h * 0.26);
    ctx.closePath();
    ctx.fill();
  });

  // ribbed bone hull
  ctx.fillStyle = "#2b2733";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.1, y + h * 0.15);
  ctx.lineTo(x + w * 0.9, y + h * 0.15);
  ctx.lineTo(x + w * 0.78, y + h * 0.85);
  ctx.lineTo(x + w * 0.22, y + h * 0.85);
  ctx.closePath();
  ctx.fill();

  // rib struts
  ctx.strokeStyle = "rgba(222,210,195,0.25)";
  ctx.lineWidth = 1;
  [0.32, 0.48, 0.64].forEach((t) => {
    ctx.beginPath();
    ctx.moveTo(x + w * (0.28 + t * 0.06), y + h * t);
    ctx.lineTo(x + w * (0.72 - t * 0.06), y + h * t);
    ctx.stroke();
  });

  // skull emblem with glowing hollow eyes
  ctx.fillStyle = "#ded2c3";
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + h * 0.4, w * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,45,77,0.5)";
  ctx.beginPath();
  ctx.arc(x + w * 0.47, y + h * 0.39, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.53, y + h * 0.39, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff2d4d";
  ctx.beginPath();
  ctx.arc(x + w * 0.47, y + h * 0.39, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.53, y + h * 0.39, 1, 0, Math.PI * 2);
  ctx.fill();

  // fanged jaw beneath the emblem
  ctx.fillStyle = "#17141f";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.44, y + h * 0.47);
  ctx.lineTo(x + w * 0.56, y + h * 0.47);
  ctx.lineTo(x + w * 0.5, y + h * 0.55);
  ctx.closePath();
  ctx.fill();

  // red sensor stripe
  ctx.fillStyle = "#ff2d4d";
  ctx.fillRect(x + w * 0.4, y + h * 0.58, w * 0.2, h * 0.08);

  // spiked tusk cannons
  ctx.fillStyle = "#17141f";
  [0.2, 0.77].forEach((t) => {
    ctx.beginPath();
    ctx.moveTo(x + w * t, y + h * 0.78);
    ctx.lineTo(x + w * t + 3, y + h * 0.78);
    ctx.lineTo(x + w * t + 1.5, y + h * 1.1);
    ctx.closePath();
    ctx.fill();
  });

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

  // trailing wisp tendrils
  ctx.strokeStyle = "rgba(36,18,51,0.8)";
  ctx.lineWidth = 2;
  [-1, 0, 1].forEach((side) => {
    const sway = Math.sin(Date.now() / 300 + side) * 2;
    const tipX = cx + side * 3;
    const tipY = y + h;
    ctx.beginPath();
    ctx.moveTo(cx + side * 4, y + h * 0.7);
    ctx.quadraticCurveTo(cx + side * 6 + sway, y + h * 0.9, tipX, tipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX - 1, tipY - 1);
    ctx.lineTo(tipX + 1.5, tipY + 1.5);
    ctx.stroke();
  });

  // tattered cloak / diamond hull
  ctx.fillStyle = "#241233";
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(x + w, cy);
  ctx.lineTo(cx, y + h * 0.78);
  ctx.lineTo(x, cy);
  ctx.closePath();
  ctx.fill();

  // eyelid spikes
  ctx.fillStyle = "#241233";
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 3, cy - 6);
    ctx.lineTo(cx + i * 3 + 1, cy - 9);
    ctx.lineTo(cx + i * 3 + 2, cy - 6);
    ctx.closePath();
    ctx.fill();
  }

  // glowing tracking eye — layered sclera / iris / pupil
  ctx.fillStyle = "rgba(176,107,255,0.35)";
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ded2c3";
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b06bff";
  ctx.beginPath();
  ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#17141f";
  ctx.beginPath();
  ctx.ellipse(cx, cy, 0.7, 2.6, 0, 0, Math.PI * 2);
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
  const realm = currentRealm();
  const accent = angry ? "#ff2d4d" : realm.star;
  const t = Date.now() / 1000;
  const pulse = 1 + Math.sin(t * 2) * 0.06;
  ctx.save();
  if (b.hitFlash > 0) ctx.globalAlpha = 0.55;

  // soft ambient aura
  const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, b.w * 1.1 * pulse);
  glow.addColorStop(0, accent + (angry ? "80" : "60"));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(cx, cy, b.w * 1.1 * pulse, b.h * 1.05 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();

  // orbiting motes
  const baseAlpha = b.hitFlash > 0 ? 0.55 : 1;
  for (let i = 0; i < 4; i++) {
    const ang = t * 0.7 + (i * Math.PI) / 2;
    const r = b.w * 0.72;
    const mx = cx + Math.cos(ang) * r;
    const my = cy + Math.sin(ang) * r * 0.45 - b.h * 0.08;
    ctx.globalAlpha = baseAlpha * (0.35 + 0.35 * Math.sin(t * 3 + i));
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(mx, my, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = baseAlpha;

  // robe dissolving into mist
  const hemGrad = ctx.createLinearGradient(cx, cy + b.h * 0.04, cx, cy + b.h * 0.6);
  hemGrad.addColorStop(0, "#1c1026");
  hemGrad.addColorStop(1, "#1c102600");
  ctx.fillStyle = hemGrad;
  ctx.beginPath();
  ctx.moveTo(cx - b.w * 0.4, cy + b.h * 0.04);
  ctx.lineTo(cx + b.w * 0.4, cy + b.h * 0.04);
  ctx.lineTo(cx + b.w * 0.26, cy + b.h * 0.6);
  ctx.lineTo(cx - b.w * 0.26, cy + b.h * 0.6);
  ctx.closePath();
  ctx.fill();

  // hooded cloak, smooth silhouette
  ctx.fillStyle = "#1c1026";
  ctx.beginPath();
  ctx.moveTo(cx - b.w * 0.42, cy + b.h * 0.1);
  ctx.quadraticCurveTo(cx - b.w * 0.46, cy - b.h * 0.3, cx - b.w * 0.2, cy - b.h * 0.5);
  ctx.quadraticCurveTo(cx, cy - b.h * 0.6, cx + b.w * 0.2, cy - b.h * 0.5);
  ctx.quadraticCurveTo(cx + b.w * 0.46, cy - b.h * 0.3, cx + b.w * 0.42, cy + b.h * 0.1);
  ctx.quadraticCurveTo(cx, cy + b.h * 0.2, cx - b.w * 0.42, cy + b.h * 0.1);
  ctx.closePath();
  ctx.fill();

  // slender, symmetric crown
  ctx.fillStyle = "#cdbfa0";
  [-0.16, 0, 0.16].forEach((ox) => {
    const hgt = ox === 0 ? 0.32 : 0.18;
    ctx.beginPath();
    ctx.moveTo(cx + b.w * ox - 1.2, cy - b.h * 0.52);
    ctx.lineTo(cx + b.w * ox, cy - b.h * (0.52 + hgt));
    ctx.lineTo(cx + b.w * ox + 1.2, cy - b.h * 0.52);
    ctx.closePath();
    ctx.fill();
  });

  // narrow bone mask, tapered to a chin point
  ctx.fillStyle = "#ede4d0";
  ctx.beginPath();
  ctx.moveTo(cx, cy - b.h * 0.36);
  ctx.quadraticCurveTo(cx + b.w * 0.16, cy - b.h * 0.3, cx + b.w * 0.14, cy - b.h * 0.1);
  ctx.quadraticCurveTo(cx + b.w * 0.09, cy + b.h * 0.1, cx, cy + b.h * 0.16);
  ctx.quadraticCurveTo(cx - b.w * 0.09, cy + b.h * 0.1, cx - b.w * 0.14, cy - b.h * 0.1);
  ctx.quadraticCurveTo(cx - b.w * 0.16, cy - b.h * 0.3, cx, cy - b.h * 0.36);
  ctx.closePath();
  ctx.fill();

  // hairline crack down the mask
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx + b.w * 0.03, cy - b.h * 0.32);
  ctx.lineTo(cx + b.w * 0.05, cy - b.h * 0.14);
  ctx.lineTo(cx + b.w * 0.02, cy + b.h * 0.02);
  ctx.stroke();

  // hollow eye voids, narrow and sunken
  ctx.fillStyle = "#0e0a14";
  ctx.beginPath();
  ctx.ellipse(cx - b.w * 0.07, cy - b.h * 0.16, b.w * 0.04, b.h * 0.12, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + b.w * 0.07, cy - b.h * 0.16, b.w * 0.04, b.h * 0.12, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // faint ember deep in the sockets
  ctx.fillStyle = accent;
  ctx.globalAlpha *= 0.8;
  ctx.beginPath();
  ctx.arc(cx - b.w * 0.07, cy - b.h * 0.12, b.w * 0.014 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + b.w * 0.07, cy - b.h * 0.12, b.w * 0.014 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = baseAlpha;

  // pulsing chest rune, set apart from the face
  ctx.fillStyle = accent + "77";
  ctx.beginPath();
  ctx.ellipse(cx, cy + b.h * 0.4, b.w * 0.06 * pulse, b.h * 0.07 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(cx, cy + b.h * 0.4, b.w * 0.03, b.h * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  drawBossHealthBar(b, "THE HOLLOW CROWN", accent);
}

function drawBossHealthBar(b, label, barColor) {
  if (b.entering) return;
  const barW = 180;
  const barX = WIDTH / 2 - barW / 2;
  ctx.save();
  ctx.fillStyle = "#ded2c3";
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, WIDTH / 2, 10);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(barX, 14, barW, 8);
  ctx.fillStyle = barColor;
  ctx.fillRect(barX, 14, barW * Math.max(b.hp / b.maxHp, 0), 8);
  ctx.strokeStyle = "#ded2c3";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, 14, barW, 8);
  ctx.restore();
}

function drawGhostPirateBoss(b) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const angry = b.phase === 2;
  const realm = currentRealm();
  const accent = angry ? "#ff2d4d" : realm.star;
  const t = Date.now() / 1000;
  const ghostAlpha = 0.74 + Math.sin(t * 2.0 + b.driftPhase) * 0.1;

  ctx.save();
  if (b.hitFlash > 0) ctx.globalAlpha = 0.4;
  else ctx.globalAlpha = ghostAlpha;

  // spectral aura
  const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, b.w * 1.05);
  glow.addColorStop(0, accent + "66");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(cx, cy, b.w * 1.05, b.h * 1.0, 0, 0, Math.PI * 2);
  ctx.fill();

  // drifting mist wisps beneath the wreck
  ctx.strokeStyle = accent + "4d";
  ctx.lineWidth = 2;
  [-0.3, 0, 0.3].forEach((ox, i) => {
    const sway = Math.sin(t * 1.2 + i) * 5;
    ctx.beginPath();
    ctx.moveTo(cx + b.w * ox, b.y + b.h * 0.88);
    ctx.quadraticCurveTo(
      cx + b.w * ox + sway,
      b.y + b.h * 1.08,
      cx + b.w * ox,
      b.y + b.h * 1.25
    );
    ctx.stroke();
  });

  // hull dissolving into mist at the waterline
  const hullGrad = ctx.createLinearGradient(cx, b.y + b.h * 0.4, cx, b.y + b.h * 0.95);
  hullGrad.addColorStop(0, "#132a24");
  hullGrad.addColorStop(1, "#132a2400");
  ctx.fillStyle = hullGrad;
  ctx.beginPath();
  ctx.moveTo(b.x + b.w * 0.12, b.y + b.h * 0.4);
  ctx.lineTo(b.x + b.w * 0.88, b.y + b.h * 0.4);
  ctx.lineTo(b.x + b.w * 0.6, b.y + b.h * 0.95);
  ctx.lineTo(b.x + b.w * 0.4, b.y + b.h * 0.95);
  ctx.closePath();
  ctx.fill();

  // sleek hull
  ctx.fillStyle = "#132a24";
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + b.h * 0.2);
  ctx.quadraticCurveTo(cx, b.y - b.h * 0.1, b.x + b.w, b.y + b.h * 0.2);
  ctx.lineTo(b.x + b.w * 0.85, b.y + b.h * 0.4);
  ctx.lineTo(b.x + b.w * 0.15, b.y + b.h * 0.4);
  ctx.closePath();
  ctx.fill();

  // mast
  ctx.strokeStyle = "#132a24";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, b.y - b.h * 0.1);
  ctx.lineTo(cx, b.y - b.h * 0.4);
  ctx.stroke();

  // single torn sail
  ctx.fillStyle = "#1c1f2b";
  ctx.beginPath();
  ctx.moveTo(cx, b.y - b.h * 0.4);
  ctx.quadraticCurveTo(cx + b.w * 0.26, b.y - b.h * 0.3, cx + b.w * 0.2, b.y - b.h * 0.1);
  ctx.quadraticCurveTo(cx + b.w * 0.1, b.y - b.h * 0.16, cx, b.y - b.h * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent + "99";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, b.y - b.h * 0.4);
  ctx.lineTo(cx, b.y - b.h * 0.08);
  ctx.stroke();

  // single cyclopean eye at the bow
  ctx.fillStyle = accent + "66";
  ctx.beginPath();
  ctx.ellipse(cx, b.y + b.h * 0.14, b.w * 0.17, b.h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(cx, b.y + b.h * 0.14, b.w * 0.09, b.h * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.ellipse(cx, b.y + b.h * 0.14, b.w * 0.02, b.h * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // glowing cannon ports
  ctx.fillStyle = accent + "80";
  [0.26, 0.74].forEach((f) => {
    ctx.beginPath();
    ctx.arc(b.x + b.w * f, b.y + b.h * 0.3, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();

  drawBossHealthBar(b, "THE DROWNED HULL", accent);
}

const PICKUP_STYLE = {
  laser: { color: "#b9a6ff", glow: "rgba(185,166,255,0.55)" },
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
    ctx.moveTo(cx, cy - 1);
    ctx.lineTo(cx - 5, cy - 4);
    ctx.lineTo(cx - 2, cy);
    ctx.lineTo(cx - 5, cy + 3);
    ctx.lineTo(cx, cy + 1.5);
    ctx.lineTo(cx + 5, cy + 3);
    ctx.lineTo(cx + 2, cy);
    ctx.lineTo(cx + 5, cy - 4);
    ctx.closePath();
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

  const realm = currentRealm();
  ctx.fillStyle = realm.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  stars.forEach((s) => {
    ctx.globalAlpha = 0.5 + s.r / 3;
    ctx.fillStyle = s.ember ? realm.ember : realm.star;
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

  bullets.forEach((b) => {
    const mag = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx / mag;
    const uy = b.vy / mag;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(uy, ux) + Math.PI / 2);
    ctx.fillStyle = "rgba(185,166,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(3, 2);
    ctx.lineTo(0, 10);
    ctx.lineTo(-3, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e4d9ff";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(1.4, 1);
    ctx.lineTo(0, 7);
    ctx.lineTo(-1.4, 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  enemyBullets.forEach((b) => {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Date.now() / 300);
    ctx.fillStyle = "#7a0f1f";
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(4, 0);
    ctx.lineTo(0, 4);
    ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ff2d4d";
    ctx.beginPath();
    ctx.arc(0, 0, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

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
    grad.addColorStop(0, "rgba(185,166,255,0)");
    grad.addColorStop(0.5, "rgba(185,166,255,0.95)");
    grad.addColorStop(1, "rgba(185,166,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(laserBeam.x, 0, laserBeam.width, player.y + player.h / 2);
    ctx.restore();
  }

  if (player.gateState === "charging") {
    const progress = 1 - player.gateStateTimer / GATE_CHARGE_TICKS;
    const gcx = player.x + player.w / 2;
    const gcy = player.y - 6;
    const ringR = 4 + progress * (GATE_WIDTH / 2 - 4);
    ctx.save();
    ctx.globalAlpha = 0.5 + progress * 0.5;
    ctx.strokeStyle = "#ff1c38";
    ctx.lineWidth = 2 + progress * 2;
    ctx.beginPath();
    ctx.ellipse(gcx, gcy, ringR, ringR * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,28,56,0.4)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(gcx, gcy, ringR * 0.85, ringR * 0.26, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (player.gateState === "firing") {
    const gcx = player.x + player.w / 2;
    const gx0 = gcx - GATE_WIDTH / 2;
    const beamHeight = player.y + player.h / 2;
    const t = Date.now();
    const bloodShades = ["#3a040d", "#6b0a1c", "#a30f27", "#d4132f", "#ff1c38"];

    ctx.save();

    // dark blood-soaked wash behind everything
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#3a040d";
    ctx.fillRect(gx0, 0, GATE_WIDTH, beamHeight);

    // chunky pixel blood columns, cascading downward with a flowing motion trail
    const colWidth = 4;
    const cols = Math.floor(GATE_WIDTH / colWidth);
    for (let c = 0; c < cols; c++) {
      const seed = c * 12.9898;
      const hash = Math.abs(Math.sin(seed) * 43758.5453) % 1;
      const speed = 50 + hash * 90;
      const offset = (t / speed + hash * beamHeight) % (beamHeight + 40);
      const blockH = 7 + Math.floor(hash * 10);
      const colX = gx0 + c * colWidth;

      for (let trail = 0; trail < 4; trail++) {
        const trailY = offset - blockH - trail * (blockH * 0.85);
        const shade = bloodShades[Math.max(0, bloodShades.length - 1 - trail)];
        ctx.globalAlpha = Math.max(0, 0.85 - trail * 0.2);
        ctx.fillStyle = shade;
        ctx.fillRect(colX, Math.round(trailY), colWidth - 1, blockH * (1 - trail * 0.12));
      }
    }

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
    if (stageBanner.subtext) {
      ctx.font = "bold 14px monospace";
      ctx.fillStyle = realm.star;
      ctx.shadowColor = realm.star;
      ctx.shadowBlur = 10;
      ctx.fillText(stageBanner.subtext, WIDTH / 2, HEIGHT / 2 + 14);
    }
    ctx.restore();
  }

  if (player.phoenixMode) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 14px monospace";
    ctx.fillStyle = "#b9a6ff";
    ctx.shadowColor = "rgba(185, 166, 255, 0.9)";
    ctx.shadowBlur = 10;
    ctx.fillText(
      `👑 WRAITH KING ${Math.ceil(player.phoenixTimer / 60)}s`,
      WIDTH / 2,
      40
    );
    ctx.restore();
  }

  if (paused) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#ded2c3";
    ctx.font = "24px monospace";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", WIDTH / 2, HEIGHT / 2);
  }

  displayCtx.clearRect(0, 0, WIDTH, HEIGHT);
  displayCtx.drawImage(
    pixelCanvas,
    0,
    0,
    pixelCanvas.width,
    pixelCanvas.height,
    0,
    0,
    WIDTH,
    HEIGHT
  );
}

const SPEED_MULTIPLIER = 1.2;
const STEP_MS = 1000 / 60 / SPEED_MULTIPLIER;
const MAX_STEPS_PER_FRAME = 5;
let lastFrameTime = null;
let accumulatorMs = 0;

function loop(now) {
  if (!running) return;
  if (typeof now !== "number") now = performance.now();
  if (lastFrameTime === null) lastFrameTime = now;
  let deltaMs = now - lastFrameTime;
  lastFrameTime = now;

  if (!paused) {
    if (deltaMs > 250) deltaMs = 250;
    accumulatorMs += deltaMs;
    let steps = 0;
    while (accumulatorMs >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      update();
      accumulatorMs -= STEP_MS;
      steps++;
    }
  } else {
    accumulatorMs = 0;
  }
  draw();
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
  lastFrameTime = null;
  accumulatorMs = 0;
  loop();
}

window.addEventListener("keydown", (e) => {
  keys.add(e.key);
  keys.add(e.code);
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
    if (e.key === "ArrowDown" && player.gateState === "idle" && player.gateTimer <= 0) {
      activateGateBeam();
    }
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.key);
  keys.delete(e.code);
});

window.addEventListener("blur", () => {
  keys.clear();
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
