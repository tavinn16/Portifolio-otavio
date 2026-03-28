/**
 * Efeito Fluido Curvo sem Rastro — Primeira Seção (#introduction)
 *
 * Conceito: formas curvas volumosas e luminosas (ondas energéticas) em 3 camadas
 * com parallax e blur, seguindo o mouse com distorção suave (warping) e sem rastro.
 * O canvas é limpo a cada frame; as curvas são redesenhadas dinamicamente.
 *
 * Integração:
 * - Este script cria <canvas id="intro-canvas"> dentro de #introduction, atrás do conteúdo
 * - Inclua em index.html: <script type="module" src="effect.js"></script>
 * - Ajuste parâmetros em CONFIG e LAYERS abaixo
 */

// ========================= PARÂMETROS =========================
/**
 * CONFIG: parâmetros globais de visual/performance/interação
 * - DPR_CAP: limite de devicePixelRatio para performance
 * - RESIZE_DEBOUNCE_MS: debounce do resize
 * - BG_TOP/BG_BOTTOM: gradiente de fundo (cores frias)
 * - BLEND: modo de blend das curvas ("screen" ou "lighter")
 * - CLEAR_EACH_FRAME: limpa o canvas a cada frame (sem rastro)
 * - ENABLE_TOUCH_FALLBACK: animação suave autônoma em touch devices
 * - MOUSE_SPRING: força de interpolação do ponteiro
 * - MOUSE_DAMPING: amortecimento leve do movimento do ponteiro
 * - DISTORT_RADIUS: raio (px @1x) da influência ao redor do ponteiro
 * - DISTORT_STRENGTH: intensidade da distorção (dobrar/flexionar curvas)
 */
const CONFIG = {
  DPR_CAP: 2,
  RESIZE_DEBOUNCE_MS: 120,
  BG_TOP: "#071019",
  BG_BOTTOM: "#0b1622",
  BLEND: "screen",
  CLEAR_EACH_FRAME: true,
  ENABLE_TOUCH_FALLBACK: true,
  MOUSE_SPRING: 0.15,
  MOUSE_DAMPING: 0.90,
  DISTORT_RADIUS: 150,
  DISTORT_STRENGTH: 28,
};

/**
 * LAYERS: três camadas independentes com parallax, blur e dinâmica
 * - ribbons: quantidade de "fitas" curvas desenhadas por camada
 * - stroke: cor/alpha da curva (tonalidade fria)
 * - width: espessura base da linha
 * - step: passo de integração do fluxo (px @1x)
 * - steps: quantidade de pontos por fita (controle da suavidade)
 * - speed: fator de evolução temporal; maior = mais dramático
 * - amp/freq: parâmetros do campo de ruído que deformam as curvas
 * - parallax: deslocamento horizontal proporcional ao mouse
 * - shadowBlur: brilho volumétrico da camada
 * - baseRadius/angularSpeed: definem a geometria dos seeds (radiais)
 */
const LAYERS = [
  {
    ribbons: 8,
    stroke: "rgba(120, 210, 255, 0.18)",
    width: 1.4,
    step: 9,
    steps: 80,
    speed: 0.16,
    amp: 28,
    freq: 0.003,
    parallax: 0.25,
    shadowBlur: 14,
    baseRadius: 140,
    angularSpeed: 0.4,
  },
  {
    ribbons: 6,
    stroke: "rgba(180, 230, 255, 0.28)",
    width: 1.8,
    step: 10,
    steps: 90,
    speed: 0.22,
    amp: 36,
    freq: 0.0036,
    parallax: 0.55,
    shadowBlur: 20,
    baseRadius: 180,
    angularSpeed: 0.55,
  },
  {
    ribbons: 4,
    stroke: "rgba(240, 250, 255, 0.35)",
    width: 2.2,
    step: 11,
    steps: 100,
    speed: 0.30,
    amp: 44,
    freq: 0.0042,
    parallax: 0.85,
    shadowBlur: 28,
    baseRadius: 220,
    angularSpeed: 0.7,
  },
];

// Presets prontos para rapidamente mudar o caráter do efeito
export const PRESET_SUBTLE = { DISTORT_STRENGTH: 16, DISTORT_RADIUS: 120, BLEND: "screen" };
export const PRESET_DRAMATIC = { DISTORT_STRENGTH: 34, DISTORT_RADIUS: 170, BLEND: "lighter" };

// ========================= ESTADO =========================
const TARGET_ID = "introduction";
const CANVAS_ID = "intro-canvas";

const state = {
  canvas: null,
  ctx: null,
  width: 0,
  height: 0,
  dpr: 1,
  running: false,
  inView: false,
  time: 0,
  mouseTarget: { x: 0, y: 0 },
  mouse: { x: 0, y: 0 },
  resizeTimer: null,
};

// ========================= UTIL =========================
/**
 * Ruído suave barato (soma de senoides), determinístico e contínuo
 * Retorna ~[-1, 1]
 */
function smoothNoise(x, y, t, freq) {
  const a = Math.sin(x * freq + t * 0.9);
  const b = Math.cos(y * freq * 0.6 + t * 0.7);
  const c = Math.sin((x + y) * freq * 0.4 - t * 0.5);
  return (a + b + c) / 3;
}

/**
 * Campo de distorção suave (sem redemoinho/espiral):
 * combina ruído direcional com empurrão radial do mouse
 */
function warpPoint(x, y, t, layer) {
  const mx = state.mouse.x * state.dpr;
  const my = state.mouse.y * state.dpr;
  const dx = x - mx;
  const dy = y - my;
  const d = Math.hypot(dx, dy) / state.dpr;
  const influence = Math.exp(-(d * d) / (2 * CONFIG.DISTORT_RADIUS * CONFIG.DISTORT_RADIUS));
  const push = CONFIG.DISTORT_STRENGTH * influence * state.dpr;

  // ruído direcional para evitar linhas retas e estáticas
  const n1 = smoothNoise(x, y, t * layer.speed, layer.freq);
  const n2 = smoothNoise(x + 320, y - 240, t * layer.speed, layer.freq * 1.2);
  const nx = Math.cos(n1 * Math.PI) * layer.amp * 0.25 * state.dpr;
  const ny = Math.sin(n2 * Math.PI) * layer.amp * 0.45 * state.dpr;

  // empurrão radial (sem giro tangencial)
  const rx = (dx / (d * state.dpr + 0.0001)) * push * 0.25; // menor em X
  const ry = (dy / (d * state.dpr + 0.0001)) * push;        // maior em Y para dobrar curvas

  return { x: x + nx + rx, y: y + ny + ry };
}

/**
 * Converte uma lista de pontos em traço suave usando Quadratic Beziers
 */
function strokeSmooth(ctx, pts) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) * 0.5;
    const midY = (pts[i].y + pts[i + 1].y) * 0.5;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.stroke();
}

// ========================= SETUP =========================
/** Cria o canvas full-size na #introduction e prepara contexto */
function initCanvas() {
  const section = document.getElementById(TARGET_ID);
  if (!section) return false;
  let canvas = document.getElementById(CANVAS_ID);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = CANVAS_ID;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "0";
    section.style.position = section.style.position || "relative";
    section.style.overflow = section.style.overflow || "hidden";
    section.appendChild(canvas);
  }
  state.canvas = canvas;
  state.ctx = canvas.getContext("2d");
  state.ctx.globalCompositeOperation = CONFIG.BLEND;
  section.style.background = `linear-gradient(${CONFIG.BG_TOP}, ${CONFIG.BG_BOTTOM})`;
  updateCanvasSize();
  return true;
}

/** Dimensiona o canvas considerando DPR com limite */
function updateCanvasSize() {
  const rect = state.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.DPR_CAP);
  state.dpr = dpr;
  state.width = Math.floor(rect.width * dpr);
  state.height = Math.floor(rect.height * dpr);
  state.canvas.width = state.width;
  state.canvas.height = state.height;
}

/** Debounce do resize para evitar custo excessivo */
function debounceResize() {
  clearTimeout(state.resizeTimer);
  state.resizeTimer = setTimeout(updateCanvasSize, CONFIG.RESIZE_DEBOUNCE_MS);
}

// ========================= DESENHO =========================
/**
 * Gera pontos de uma fita ao longo de um caminho curvo contínuo (não horizontal),
 * depois aplica distorção suave baseada em ruído e proximidade do mouse.
 */
function buildRibbonPoints(li, i) {
  const layer = LAYERS[li];
  const pts = [];
  const t0 = state.time;
  // parallax horizontal
  const px = (state.mouse.x - state.width / (2 * state.dpr)) * layer.parallax * state.dpr;

  for (let k = 0; k <= layer.steps; k++) {
    const tt = k / layer.steps;
    const phase = t0 * layer.speed + i * 0.35;
    // caminho base diagonal-curvo (sem linhas retas)
    let x = state.width * (tt + 0.08 * Math.sin(phase + tt * Math.PI * 2)) + px;
    let y = state.height * (0.25 + 0.5 * (0.5 + 0.32 * Math.sin(phase * 1.1 + tt * Math.PI * 1.8) + 0.18 * Math.sin(phase * 0.7 + tt * Math.PI * 3.1)));
    const w = warpPoint(x, y, t0, layer);
    pts.push(w);
  }
  return pts;
}

/** Desenha pontos suavizados usando cadeias de bezier cúbicas */
function strokeCubic(ctx, pts, tension = 0.18) {
  if (pts.length < 4) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 3; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const p2 = pts[i + 2];
    const p3 = pts[i + 3];
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.stroke();
}

/** Desenha fitas curvas para uma camada (sem espirais/círculos) */
function drawRibbonsForLayer(li) {
  const ctx = state.ctx;
  const layer = LAYERS[li];
  ctx.strokeStyle = layer.stroke;
  ctx.lineWidth = layer.width * state.dpr;
  ctx.shadowBlur = layer.shadowBlur * state.dpr;
  ctx.shadowColor = layer.stroke;
  for (let i = 0; i < layer.ribbons; i++) {
    const pts = buildRibbonPoints(li, i);
    strokeCubic(ctx, pts);
  }
}

/** Loop de animação: limpa e redesenha tudo sem rastro */
function animate(ts) {
  if (!state.running) return;
  state.time = ts * 0.001;
  const ctx = state.ctx;
  if (CONFIG.CLEAR_EACH_FRAME) ctx.clearRect(0, 0, state.width, state.height);
  const g = ctx.createLinearGradient(0, 0, 0, state.height);
  g.addColorStop(0, CONFIG.BG_TOP);
  g.addColorStop(1, CONFIG.BG_BOTTOM);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, state.width, state.height);
  for (let li = 0; li < LAYERS.length; li++) drawRibbonsForLayer(li);
  requestAnimationFrame(animate);
}

// ========================= INPUT =========================
/** Atualiza alvo do mouse (sem suavização) */
function onMouseMove(e) {
  const rect = state.canvas.getBoundingClientRect();
  state.mouseTarget.x = e.clientX - rect.left;
  state.mouseTarget.y = e.clientY - rect.top;
}

/** Configura entrada e suavização por spring/damping */
function setupInput() {
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  if (isTouch && CONFIG.ENABLE_TOUCH_FALLBACK) {
    let t = 0;
    const rect = state.canvas.getBoundingClientRect();
    setInterval(() => {
      t += 0.012;
      state.mouseTarget.x = rect.width * (0.5 + 0.25 * Math.cos(t));
      state.mouseTarget.y = rect.height * (0.5 + 0.25 * Math.sin(t * 0.8));
    }, 16);
  } else {
    window.addEventListener("mousemove", onMouseMove, { passive: true });
  }
  const smooth = () => {
    state.mouse.x += (state.mouseTarget.x - state.mouse.x) * CONFIG.MOUSE_SPRING;
    state.mouse.y += (state.mouseTarget.y - state.mouse.y) * CONFIG.MOUSE_SPRING;
    state.mouse.x = state.mouse.x * CONFIG.MOUSE_DAMPING + state.mouseTarget.x * (1 - CONFIG.MOUSE_DAMPING);
    state.mouse.y = state.mouse.y * CONFIG.MOUSE_DAMPING + state.mouseTarget.y * (1 - CONFIG.MOUSE_DAMPING);
    requestAnimationFrame(smooth);
  };
  smooth();
}

// ========================= VISIBILIDADE =========================
/** Pausa/retoma animação conforme a seção entra/sai da viewport */
function setupObserver() {
  const section = document.getElementById(TARGET_ID);
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      state.inView = entry.isIntersecting;
      state.running = state.inView;
      if (state.running) requestAnimationFrame(animate);
    }
  }, { threshold: 0.1 });
  io.observe(section);
}

// ========================= API =========================
/** Aplica preset de caráter visual */
export function applyPreset(preset) { Object.assign(CONFIG, preset); }

/** Troca cores gerais e por camada */
export function setColors({ bgTop, bgBottom, layers }) {
  if (bgTop) CONFIG.BG_TOP = bgTop;
  if (bgBottom) CONFIG.BG_BOTTOM = bgBottom;
  if (layers && Array.isArray(layers)) {
    for (let i = 0; i < Math.min(layers.length, LAYERS.length); i++) {
      Object.assign(LAYERS[i], layers[i]);
    }
  }
}

// ========================= INIT =========================
/** Inicializa canvas, input, observador e resize */
function init() {
  if (!initCanvas()) return;
  setupInput();
  setupObserver();
  window.addEventListener("resize", debounceResize);
}

init();