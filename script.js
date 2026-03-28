// ===============================
// Controle de viewport e do loader
// ===============================
// Objetivo:
// - Corrigir o bug de 100vh em mobile definindo a variável CSS --vh via JS
// - Bloquear o scroll do body enquanto o overlay do loader estiver ativo
// - Executar animações das letras com GSAP e, ao final, esconder o overlay
//   liberando o site para interação
window.addEventListener("load", () => {
  // 1) Corrige unidades de viewport em mobile (define --vh)
  // Explicação:
  // Em muitos navegadores móveis, 100vh inclui barras de endereço/gestos,
  // causando valores maiores que a área realmente visível. Usar window.innerHeight
  // dá a altura útil. Convertendo 1% dessa altura em px, criamos --vh para
  // compor medidas: calc(var(--vh) * N) = Ndvh (fallback).
  const setVh = () => {
    const vh = window.innerHeight * 0.01; // 1% da altura visível
    document.documentElement.style.setProperty("--vh", `${vh}px`);
  };
  setVh();
  // Atualiza em redimensionamento/orientação (orientationchange dispara resize)
  window.addEventListener("resize", setVh);

  // 2) Bloqueia o scroll enquanto o loader estiver ativo
  // Racional: impede que o usuário role e veja conteúdo por trás do overlay.
  document.body.classList.add("no-scroll");

  // 3) Seleciona todas as letras do loader
  const letras = document.querySelectorAll(".loader-inicial span");

  // 4) Lista de fontes para efeito (variedade de estilos para animação)
  const fontes = [
    "Roboto, sans-serif",
    "Orbitron, sans-serif",
    "Pacifico, cursive",
    "'Press Start 2P', cursive",
    "'Rubik Mono One', sans-serif",
  ];


  const colors = [
    "#ff6f61", // Coral
    "#6B5B95", // Roxo
    "#8fdb1c", // Verde
    "#ffa2a0", // Rosa claro
    "#5287eb", // Azul claro
    "#FFD700", // Amarelo
    "#c20000", // vermelho
    "#2300a1",
    "#ce0090",
    "#fff"
  ];

  // 5) Aplica troca de fonte com GSAP
  // Detalhes:
  // - delay: index * 0.1 cria sequência de letras
  // - onStart: aplica fonte aleatória antes da animação
  // - onComplete: reverte para a fonte final após breve pausa
  letras.forEach((letra, index) => {
    gsap.to(letra, {
      delay: index * 0.1, // cada letra começa 0.1s após a anterior
      duration: 0.5,      // duração curta para a troca inicial
      onStart: () => {
        const fonteAleatoria = fontes[Math.floor(Math.random() * fontes.length)];
        const colorAleatoria = colors[Math.floor(Math.random() * colors.length)];
        letra.style.color = colorAleatoria;
        letra.style.fontFamily = fonteAleatoria;
      },

      onComplete: () => {
        gsap.to(letra, {
          delay: 0.8,   // pequena pausa para que a fonte aleatória seja percebida
          duration: 1.5, // transição mais suave ao retornar à fonte final
          onStart: () => {
            letra.style.fontFamily = "Roboto, sans-serif";
            letra.style.color = "#fff";
          },
        });
      },

    });
  });

  // 6) Esmaece cada grupo e o overlay
  // Parâmetros GSAP:
  // - opacity: 0 (fade out)
  // - x: -300 (desloca para a esquerda, dando sensação de saída)
  // - duration: 1 (transição de 1 segundo)
  // - delay: controla ordem de desaparecimento
  gsap.to(".loader-otavio", { opacity: 0, x: -300, duration: 1, delay: 5.3 });
  gsap.to(".loader-henrique", { opacity: 0, x: -300, duration: 1, delay: 5.6 });
  gsap.to(".loader-portifolio", { opacity: 0, x: -300, duration: 1, delay: 6.0 });

  // 7) Some com o overlay e libera o scroll
  // Após o fade do overlay, removemos do layout (display:none) e
  // liberamos o scroll do body, tornando o site interativo.
  gsap.to(".loader-inicial", {
    opacity: 0,
    x: -300,
    duration: 1,
    delay: 6.2,
    onComplete: () => {
      const overlay = document.querySelector(".loader-inicial");
      if (overlay) {
        overlay.style.display = "none";
      }
      document.body.classList.remove("no-scroll");
    },
  });


});




// ============================================
// PORTFOLIO CARDS 
// ============================================

/**
 * Carrega o SVG do canto via window.fs ou fetch
 */
async function loadCornerSVG() {
  try {
    if (window.fs && typeof window.fs.readFile === "function") {
      const text = await window.fs.readFile("files/border-circle", "utf-8");
      return text;
    }
    const res = await fetch("files/border-circle");
    return await res.text();
  } catch (e) {
    return "";
  }
}

/**
 * Converte texto SVG em data URL base64 seguro
 */
function svgToDataUrl(svgText) {
  const encoded = encodeURIComponent(svgText)
    .replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode("0x" + p1));
  const base64 = btoa(encoded);
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Insere o SVG como background-image nos elementos .corner-svg
 */
function insertSVGsIntoCorners(svgText) {
  if (!svgText) return;
  const url = svgToDataUrl(svgText);
  const corners = document.querySelectorAll(".corner-svg");
  corners.forEach((el) => {
    el.style.backgroundImage = `url('${url}')`;
  });
}

/**
 * Inicializa: carrega SVG e aplica aos cantos dos cards
 */
async function initPortfolioCards() {
  const svg = await loadCornerSVG();
  insertSVGsIntoCorners(svg);
}

document.addEventListener("DOMContentLoaded", initPortfolioCards);


// ============================================
// Navbar - Exibir nome ao rolar a página e Controle do Menu
// ============================================
document.addEventListener('DOMContentLoaded', function () {
  const nameNav = document.querySelector('.name-nav');
  const menuBar = document.querySelector('.checkboxtoggler');
  const linksNav = document.querySelector('.links-horizontal');
  const firstSection = document.querySelector('section');
  const menuHamburguer = document.getElementById('toggleChecker');
  const menuAberto = document.querySelector('.menu-aberto');

  // Inicializa oculto
  nameNav?.classList.add('hidden');
  menuBar?.classList.add('hidden');

  // Controle do scroll
  window.addEventListener('scroll', function () {
    if (firstSection) {
      const firstSectionHeight = firstSection.offsetHeight;
      const scrollY = window.scrollY;

      if (scrollY < firstSectionHeight * 0.8) {
        linksNav?.classList.remove('hidden');
        nameNav?.classList.add('hidden');
        menuBar?.classList.add('hidden');
        
        // Fecha o menu se estiver aberto ao voltar ao topo
        if (menuHamburguer.checked) {
          menuHamburguer.checked = false;
          menuAberto.classList.remove('ativo');
        }
      } else {
        linksNav?.classList.add('hidden');
        nameNav?.classList.remove('hidden');
        menuBar?.classList.remove('hidden');
      }
    }
  });

  // Controle do clique no hamburguer (via checkbox)
  menuHamburguer?.addEventListener('change', function () {
    if (this.checked) {
      menuAberto.classList.add('ativo');
    } else {
      menuAberto.classList.remove('ativo');
    }
  });

  // Fechar ao clicar fora
  document.addEventListener('click', function (event) {
    const isClickInsideMenu = menuAberto.contains(event.target);
    const isClickOnHamburger = document.querySelector('.menu-haburguer').contains(event.target);

    if (menuHamburguer.checked && !isClickInsideMenu && !isClickOnHamburger) {
      menuHamburguer.checked = false;
      menuAberto.classList.remove('ativo');
    }
  });

  // Fechar ao clicar em um link do menu
  document.querySelectorAll('.links-menu a').forEach(link => {
    link.addEventListener('click', () => {
      menuHamburguer.checked = false;
      menuAberto.classList.remove('ativo');
    });
  });
});

// Scroll suave ao clicar nos links
document.querySelectorAll('.section-label').forEach(label => {
  label.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    target.scrollIntoView({ behavior: 'smooth' });
  });
});

/**
 * Efeitos e animações através do GSAP
 */

// ... (mantenha o código anterior do loader até o item 7)

// 7) Some com o overlay e libera o scroll
gsap.to(".loader-inicial", {
  duration: 6.4,
  onComplete: () => {
    const overlay = document.querySelector(".loader-inicial");
    if (overlay) {
      overlay.style.display = "none";
    }
    document.body.classList.remove("no-scroll");

    // CHAMA AS ANIMAÇÕES DO SITE AQUI!
    startMainAnimations();
  },
});

// Nova função para agrupar as animações do site
function startMainAnimations() {
  // 1) Torna o conteúdo visível
  const elementsToReveal = ["#introduction", "#section-projs", ".navbar", ".sidebar"];
  elementsToReveal.forEach(selector => {
    document.querySelector(selector)?.classList.add("content-visible");
  });

  // 2) Suas animações GSAP que devem rodar depois
  gsap.from(".title", {
    y: 100,
    opacity: 0,
    duration: 1.5,
    ease: "power4.out"
  });

  // ANIMAÇÃO DE REVELAÇÃO CURVA
  // Agora animamos a cortina separadamente para não afetar o conteúdo

  gsap.to(".reveal-curtain", {
    clipPath: "ellipse(150% 100% at 50% 50%)",
    ease: "none",
    scrollTrigger: {
      trigger: "#apresentacao",
      start: "top 30%", // Só começa a achatar quando o topo estiver quase no topo da tela (30%)
      end: "bottom top", // Só fica 100% reto quando o fundo da seção sair da tela
      scrub: true,
    }
  });

  // Animação da seção de projetos (se ainda quiser curva nela)
  gsap.to("#section-projs", {
    clipPath: "ellipse(150% 100% at 50% 50%)",
    ease: "none",
    scrollTrigger: {
      trigger: "#section-projs",
      start: "top 30%",
      end: "bottom top",
      scrub: true,
    }
  });


  // Se você tiver outras animações (ScrollTrigger, etc), coloque-as aqui

}

// ... (resto do seu código como initPortfolioCards, etc)