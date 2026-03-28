/**
 * README — Efeito "Fluxo volumoso + desenho por mouse" (Primeira seção)
 *
 * Objetivo: fundo orgânico e dramático em 3 camadas (fluxo base) + "pincel" do mouse
 * que desenha fitas curvas elegantes e luminosas (ribbons) com vida própria.
 * Nada de rastro permanente: cada ribbon surge, varia em largura/curvatura/opacidade,
 * deforma o fluxo localmente e desaparece com fade suave. O canvas é limpo por frame.
 *
 * Onde roda: somente na primeira seção (#hero). Se não existir, usa #introduction.
 * Integração: <script type="module" src="hero-effect.js"></script>
 * Acessibilidade: canvas com pointer-events: none; conteúdo acima do canvas por z-index.
 * Mobile: por padrão usa modo sutil (reduz densidade e desativa desenho por ponteiro).
 *
 * Variantes prontas: STYLE_VARIANT = 'SUTIL' | 'DRAMÁTICO'
 * Troque para mudar intensidade, brilho e densidade rapidamente.
 *
 * Principais exports e funções:
 * - init(): inicia o efeito na primeira seção
 * - resize(): ajusta o canvas no resize
 * - onPointerMove(e): atualiza trilha do ponteiro e desenha
 * - spawnRibbon(pt): cria um ribbon a partir de pontos suavizados
 * - drawBaseLayers(): redesenha as camadas de ondas curvas (fluxo)
 * - applyDeformations(x,y): soma deslocamentos causados por ribbons ativos
 * - applyVariant(name): aplica preset SUTIL/DRAMÁTICO
 *
 * TODOs de ajustes visuais:
 * - Ajustar PALETTE para sua paleta
 * - Aumentar LAYERS[*].amp/freq para drama
 * - RIBBON_* (largura, gradiente, decay) para caráter de "pintura"
 * - CONFIG.BLEND ('screen' ou 'lighter') para brilho
 */

// ==================== PARÂMETROS PÚBLICOS ====================
export let STYLE_VARIANT = 'DRAMÁTICO';

export const PALETTE = [ '#071019', '#0b1622', '#78d2ff', '#b4e6ff', '#f0faff' ];

export const CONFIG = {
  DPR_LIMIT: 2,
  RESIZE_DEBOUNCE_MS: 120,
  BLEND: 'lighter',
  CLEAR_EACH_FRAME: true,
  PERFORMANCE_MODE_BREAKPOINT: 900, // width < 900 reduz qualidade
  MOUSE_INFLUENCE_RADIUS: 160, // raio de deformação
};

export const LAYERS = [
  { speed: 0.16, amplitude: 28, thickness: 1.4, alpha: 0.18, parallax: 0.25, freq: 0.003, shadowBlur: 14 },
  { speed: 0.22, amplitude: 36, thickness: 1.8, alpha: 0.28, parallax: 0.55, freq: 0.0036, shadowBlur: 20 },
  { speed: 0.30, amplitude: 44, thickness: 2.2, alpha: 0.35, parallax: 0.85, freq: 0.0042, shadowBlur: 28 },
];

export const RIBBON = {
  MAX: 18,
  MAX_POINTS: 22,
  DECAY: 0.96, // multiplicador por frame
  BASE_WIDTH: 18,
  WIDTH_SLOW_MULT: 1.35, // movimento lento → fita mais larga
  WIDTH_FAST_MULT: 0.85,  // movimento rápido → mais fina
  COLOR_FROM: '#78d2ff',
  COLOR_MID:  '#b4e6ff',
  COLOR_TO:   '#ffffff',
  DISTORT_STRENGTH: 26, // quanto deforma o fluxo localmente
};

export function applyVariant(name) {
  STYLE_VARIANT = name;
  if (name === 'SUTIL') {
    CONFIG.BLEND = 'screen';
    CONFIG.MOUSE_INFLUENCE_RADIUS = 130;
    LAYERS.forEach((l) => { l.amplitude *= 0.85; l.alpha *= 0.9; l.shadowBlur *= 0.8; });
    RIBBON.DECAY = 0.94;
    RIBBON.DISTORT_STRENGTH = 18;
  } else {
    CONFIG.BLEND = 'lighter';
    CONFIG.MOUSE_INFLUENCE_RADIUS = 170;
    // valores base já dramáticos
    RIBBON.DECAY = 0.96;
    RIBBON.DISTORT_STRENGTH = 26;
  }
}

// ==================== ESTADO ====================
const TARGET_IDS = ['hero', 'introduction'];
let section = null;
let canvas = null;
let ctx = null;
let dpr = 1;
let w = 0, h = 0;
let inView = false;
let time = 0;
let perfReduced = false;

// Ponteiro
const pointer = {
  targetX: 0, targetY: 0,
  x: 0, y: 0,
  lastX: 0, lastY: 0,
  speed: 0,
};

// Trilhas e ribbons
const trail = []; // pontos recentes do ponteiro (suavizados)
const ribbons = []; // ativos
const ribbonPool = []; // recicláveis

let resizeTimer = null;

// ==================== UTIL ====================
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function smoothNoise(x, y, t, freq) {
  const a = Math.sin(x * freq + t * 0.9);
  const b = Math.cos(y * freq * 0.6 + t * 0.7);
  const c = Math.sin((x + y) * freq * 0.4 - t * 0.5);
  return (a + b + c) / 3;
}
function toRGBA(hex, alpha) {
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ==================== SETUP ====================
export function init() {
  for (const id of TARGET_IDS) { const el = document.getElementById(id); if (el) { section = el; break; } }
  if (!section) return;
  canvas = document.getElementById('hero-canvas') || document.getElementById('intro-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = section.id === 'hero' ? 'hero-canvas' : 'intro-canvas';
    canvas.setAttribute('aria-hidden','true');
    Object.assign(canvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', pointerEvents:'none', zIndex:'0' });
    if (!section.style.position) section.style.position = 'relative';
    section.style.overflow = section.style.overflow || 'hidden';
    section.appendChild(canvas);
  }
  ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = CONFIG.BLEND;
  section.style.background = `linear-gradient(${PALETTE[0]}, ${PALETTE[1]})`;
  resize();
  setupObserver();
  setupInput();
  requestAnimationFrame(loop);
}

export function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, CONFIG.DPR_LIMIT);
  w = Math.floor(rect.width * dpr);
  h = Math.floor(rect.height * dpr);
  canvas.width = w; canvas.height = h;
  perfReduced = (rect.width < CONFIG.PERFORMANCE_MODE_BREAKPOINT);
}

function debounceResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, CONFIG.RESIZE_DEBOUNCE_MS); }

function setupObserver() {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) { inView = entry.isIntersecting; }
  }, { threshold: 0.1 });
  io.observe(section);
  window.addEventListener('resize', debounceResize);
}

// ==================== INPUT ====================
export function onPointerMove(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.targetX = (e.clientX - rect.left);
  pointer.targetY = (e.clientY - rect.top);
}

function setupInput() {
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (isTouch) {
    // Fallback: reduz complexidade e desativa pincel
    const rect = canvas.getBoundingClientRect();
    let t = 0;
    setInterval(() => {
      t += 0.012;
      pointer.targetX = rect.width * (0.5 + 0.25 * Math.cos(t));
      pointer.targetY = rect.height * (0.5 + 0.25 * Math.sin(t * 0.8));
    }, 16);
  } else {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
  }
}

// ==================== RIBBONS ====================
function newRibbon() {
  return { points: new Array(RIBBON.MAX_POINTS), count: 0, life: 1, width: RIBBON.BASE_WIDTH };
}

function spawnRibbon(pt) {
  // recicla ou cria
  let rb = ribbonPool.pop() || newRibbon();
  rb.count = 0; rb.life = 1;
  // ajusta largura pela velocidade
  const slow = pointer.speed < 3;
  rb.width = RIBBON.BASE_WIDTH * (slow ? RIBBON.WIDTH_SLOW_MULT : RIBBON.WIDTH_FAST_MULT);
  // inicia com ponto atual
  rb.points[rb.count++] = { x: pt.x * dpr, y: pt.y * dpr };
  ribbons.push(rb);
  // limita máximo
  while (ribbons.length > RIBBON.MAX) { ribbonPool.push(ribbons.shift()); }
  return rb;
}

function extendRibbon(rb, pt) {
  if (rb.count >= RIBBON.MAX_POINTS) return;
  rb.points[rb.count++] = { x: pt.x * dpr, y: pt.y * dpr };
}

function updateRibbons() {
  for (let i = ribbons.length - 1; i >= 0; i--) {
    const rb = ribbons[i];
    rb.life *= RIBBON.DECAY;
    if (rb.life < 0.06) { ribbonPool.push(ribbons.splice(i,1)[0]); continue; }
  }
}

function drawRibbon(rb) {
  if (rb.count < 2) return;
  // gradiente ao longo da largura
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = clamp(rb.life, 0, 1);
  const colorA = toRGBA(RIBBON.COLOR_FROM, 0.55);
  const colorB = toRGBA(RIBBON.COLOR_MID, 0.35);
  const colorC = toRGBA(RIBBON.COLOR_TO, 0.25);
  ctx.shadowBlur = 18 * dpr; ctx.shadowColor = colorB;
  // desenha duas passadas para sensação de fita
  ctx.strokeStyle = colorA; ctx.lineWidth = rb.width * 1.1 * dpr; strokeSmooth(rb.points, rb.count);
  ctx.strokeStyle = colorB; ctx.lineWidth = rb.width * 0.75 * dpr; strokeSmooth(rb.points, rb.count);
  ctx.strokeStyle = colorC; ctx.lineWidth = rb.width * 0.45 * dpr; strokeSmooth(rb.points, rb.count);
  ctx.globalAlpha = 1.0;
}

function strokeSmooth(arr, count) {
  ctx.beginPath();
  ctx.moveTo(arr[0].x, arr[0].y);
  for (let i = 1; i < count - 1; i++) {
    const mx = (arr[i].x + arr[i+1].x) * 0.5;
    const my = (arr[i].y + arr[i+1].y) * 0.5;
    ctx.quadraticCurveTo(arr[i].x, arr[i].y, mx, my);
  }
  ctx.lineTo(arr[count-1].x, arr[count-1].y);
  ctx.stroke();
}

// ==================== DEFORMAÇÃO DO FLUXO ====================
export function applyDeformations(x, y) {
  // soma deslocamentos suaves próximos de cada ponto do ribbon
  let ox = 0, oy = 0;
  for (let i = 0; i < ribbons.length; i++) {
    const rb = ribbons[i];
    const strength = RIBBON.DISTORT_STRENGTH * rb.life;
    for (let k = 0; k < rb.count; k++) {
      const px = rb.points[k].x; const py = rb.points[k].y;
      const dx = x - px; const dy = y - py;
      const dist = Math.hypot(dx, dy) / dpr;
      const influence = Math.exp(-(dist*dist)/(2*CONFIG.MOUSE_INFLUENCE_RADIUS*CONFIG.MOUSE_INFLUENCE_RADIUS));
      ox += (dx / (dist*dpr + 0.0001)) * strength * 0.18 * influence * dpr;
      oy += (dy / (dist*dpr + 0.0001)) * strength * 0.42 * influence * dpr;
    }
  }
  return { x: ox, y: oy };
}

// ==================== FLUXO BASE (CAMADAS) ====================
export function drawBaseLayers() {
  for (let li = 0; li < LAYERS.length; li++) {
    const L = LAYERS[li];
    const color = toRGBA('#78d2ff', L.alpha);
    ctx.strokeStyle = color;
    ctx.lineWidth = L.thickness * dpr;
    ctx.shadowBlur = L.shadowBlur * dpr;
    ctx.shadowColor = color;
    const lines = perfReduced ? 5 : 8;
    for (let i = 0; i < lines; i++) {
      const pts = [];
      for (let k = 0; k <= (perfReduced ? 60 : 90); k++) {
        const tt = k / (perfReduced ? 60 : 90);
        let x = w * tt;
        // base curvada com ruído temporal
        let y = h * (0.25 + 0.5 * (0.5 + 0.28 * Math.sin((time*L.speed) + tt*Math.PI*2) + 0.18 * Math.sin((time*L.speed*0.7) + tt*Math.PI*3)));
        const n = smoothNoise(x, y, time*L.speed, L.freq);
        y += n * L.amplitude * dpr;
        // parallax horizontal pela posição do mouse
        x += (pointer.x - w/(2)) * L.parallax;
        // aplica deformações locais dos ribbons
        const off = applyDeformations(x, y);
        x += off.x; y += off.y;
        pts.push({ x, y });
      }
      strokePath(pts);
    }
  }
}

function strokePath(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i+1].x) * 0.5;
    const my = (pts[i].y + pts[i+1].y) * 0.5;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
  ctx.stroke();
}

// ==================== LOOP ====================
function loop(ts) {
  if (!inView) { requestAnimationFrame(loop); return; }
  time = ts * 0.001;
  // suaviza ponteiro
  pointer.x = lerp(pointer.x, pointer.targetX, 0.15);
  pointer.y = lerp(pointer.y, pointer.targetY, 0.15);
  pointer.speed = Math.hypot(pointer.x - pointer.lastX, pointer.y - pointer.lastY);
  pointer.lastX = pointer.x; pointer.lastY = pointer.y;

  if (CONFIG.CLEAR_EACH_FRAME) ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, PALETTE[0]); g.addColorStop(1, PALETTE[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // fluxo base
  drawBaseLayers();

  // atualiza ribbons
  updateTrailAndRibbons();
  updateRibbons();
  for (let i = 0; i < ribbons.length; i++) drawRibbon(ribbons[i]);

  requestAnimationFrame(loop);
}

function updateTrailAndRibbons() {
  // adiciona ponto atual e suaviza trilha
  const pt = { x: pointer.x, y: pointer.y };
  trail.push(pt);
  while (trail.length > RIBBON.MAX_POINTS) trail.shift();
  // suavização simples: reamostra 1/2 dos pontos
  const smoothed = [];
  for (let i = 0; i < trail.length - 1; i++) {
    const mx = (trail[i].x + trail[i+1].x) * 0.5;
    const my = (trail[i].y + trail[i+1].y) * 0.5;
    smoothed.push({ x: mx, y: my });
  }
  // quando mouse move o suficiente, cria/estende um ribbon
  if (smoothed.length > 0 && pointer.speed > 0.6 && !perfReduced) {
    let rb = ribbons[ribbons.length-1];
    if (!rb || rb.life < 0.99) rb = spawnRibbon(smoothed[0]);
    for (let i = 1; i < smoothed.length && rb.count < RIBBON.MAX_POINTS; i++) extendRibbon(rb, smoothed[i]);
  }
}

// inicia automaticamente
init();
