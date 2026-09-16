// 财宝堆：按今日已赚金额，从一个金袋逐步长成三袋、金币箱、三箱、财宝山
// 只负责画面（素材 + 摆放 + 档位切换动画），由 effects.js 驱动
const HappyTreasure = (function () {
  // 档位：min 为该档起点（元）；最后一档在 5000~10000 之间继续长大
  const TIERS = [
    { min: 0, newest: 'b1', kind: 'bag' },
    { min: 500, newest: 'b2', kind: 'bag' },
    { min: 1000, newest: 'b3', kind: 'bag' },
    { min: 2000, newest: 'c1', kind: 'chest' },
    { min: 3000, newest: 'c2', kind: 'chest' },
    { min: 4000, newest: 'c3', kind: 'chest' },
    { min: 5000, newest: 'm', kind: 'mountain' }
  ];
  const TOP_TIER_MAX = 10000;

  const PIECES = ['c1', 'c2', 'b1', 'b2', 'b3', 'c3', 'm']; // 绘制顺序：后面的盖住前面的

  let instanceCount = 0;

  // ---------- 素材 ----------

  function defs(p) {
    return `
      <defs>
        <linearGradient id="${p}gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFE58A"/>
          <stop offset="0.45" stop-color="#FFC928"/>
          <stop offset="1" stop-color="#DE9600"/>
        </linearGradient>
        <linearGradient id="${p}tie" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#C98400"/>
          <stop offset="1" stop-color="#9A5E00"/>
        </linearGradient>
        <radialGradient id="${p}coin" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0" stop-color="#FFF6C4"/>
          <stop offset="0.5" stop-color="#FFD23F"/>
          <stop offset="1" stop-color="#E3A000"/>
        </radialGradient>
        <linearGradient id="${p}wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#B8693A"/>
          <stop offset="0.55" stop-color="#94512A"/>
          <stop offset="1" stop-color="#6E3919"/>
        </linearGradient>
        <linearGradient id="${p}inside" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7A4020"/>
          <stop offset="1" stop-color="#3E1D0A"/>
        </linearGradient>
        <linearGradient id="${p}band" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#D99A00"/>
          <stop offset="0.5" stop-color="#FFE38A"/>
          <stop offset="1" stop-color="#C98400"/>
        </linearGradient>
        <linearGradient id="${p}pile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFF0B3"/>
          <stop offset="0.35" stop-color="#FFD23F"/>
          <stop offset="1" stop-color="#E09A00"/>
        </linearGradient>
        <linearGradient id="${p}pileBack" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFD84D"/>
          <stop offset="1" stop-color="#C98A00"/>
        </linearGradient>
        <radialGradient id="${p}ruby" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stop-color="#FFB3B3"/>
          <stop offset="0.45" stop-color="#E8334A"/>
          <stop offset="1" stop-color="#8E0F22"/>
        </radialGradient>
        <radialGradient id="${p}sapphire" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stop-color="#C6E8FF"/>
          <stop offset="0.45" stop-color="#3D8BEA"/>
          <stop offset="1" stop-color="#1B4A99"/>
        </radialGradient>
        <radialGradient id="${p}emerald" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stop-color="#C2FADF"/>
          <stop offset="0.45" stop-color="#22B67C"/>
          <stop offset="1" stop-color="#0E6B47"/>
        </radialGradient>
        <radialGradient id="${p}aura" cx="0.5" cy="0.6" r="0.5">
          <stop offset="0" stop-color="#FFE066" stop-opacity="0.75"/>
          <stop offset="0.6" stop-color="#FFD23F" stop-opacity="0.25"/>
          <stop offset="1" stop-color="#FFD23F" stop-opacity="0"/>
        </radialGradient>
      </defs>`;
  }

  // 平躺的金币（带厚度）
  function flatCoin(p, x, y, s = 1) {
    return `
      <g transform="translate(${x} ${y}) scale(${s})">
        <ellipse cx="0" cy="0.9" rx="5" ry="2.3" fill="#C98A00"/>
        <ellipse cx="0" cy="0" rx="5" ry="2.3" fill="url(#${p}coin)" stroke="#B87A00" stroke-width="0.6"/>
        <ellipse cx="0" cy="0" rx="3" ry="1.3" fill="none" stroke="#C98A00" stroke-width="0.5" opacity="0.6"/>
      </g>`;
  }

  // 立着/斜着的金币
  function standCoin(p, x, y, r, tilt = 0) {
    return `
      <g transform="translate(${x} ${y}) rotate(${tilt})">
        <ellipse cx="0.9" cy="0" rx="${r * 0.72}" ry="${r}" fill="#C98A00"/>
        <ellipse cx="0" cy="0" rx="${r * 0.72}" ry="${r}" fill="url(#${p}coin)" stroke="#B87A00" stroke-width="0.7"/>
        <ellipse cx="0" cy="0" rx="${r * 0.45}" ry="${r * 0.64}" fill="none" stroke="#C98A00" stroke-width="0.5" opacity="0.65"/>
      </g>`;
  }

  function gem(p, kind, x, y, s = 1, rot = 0) {
    return `
      <g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
        <path d="M-4 -1.5L-2 -4H2L4 -1.5L0 4Z" fill="url(#${p}${kind})" stroke="rgba(0,0,0,0.25)" stroke-width="0.4" stroke-linejoin="round"/>
        <path d="M-2 -4L-0.6 -1.5H0.6L2 -4M-4 -1.5H4" fill="none" stroke="#fff" stroke-width="0.4" opacity="0.55"/>
      </g>`;
  }

  // 闪光：外层定位，内层做闪烁动画
  function sparkle(x, y, s, cls = '') {
    return `
      <g transform="translate(${x} ${y}) scale(${s})">
        <path class="fxt-sparkle ${cls}" d="M0 -6C0.5 -1.5 1.5 -0.5 6 0C1.5 0.5 0.5 1.5 0 6C-0.5 1.5 -1.5 0.5 -6 0C-1.5 -0.5 -0.5 -1.5 0 -6Z" fill="#FFFBEA" stroke="#FFC928" stroke-width="0.6"/>
      </g>`;
  }

  // 金袋：原点在袋底中心，约 48 宽 56 高
  function bag(p) {
    return `
      <ellipse class="fxt-shadow" cx="0" cy="0" rx="21" ry="3.2"/>
      <g transform="translate(-32 -60)">
        <g class="fxt-bag-coin fxt-bag-coin-1">
          ${standCoin(p, 26, 10, 5, -14)}
        </g>
        <g class="fxt-bag-coin fxt-bag-coin-2">
          ${standCoin(p, 37.5, 9, 5, 16)}
          ${standCoin(p, 31.5, 5.5, 4.6, 2)}
        </g>
        <path d="M24 19C21 15 21 10.5 25 9.5C27 12 29.5 13 32 12.2C34.5 13 37 12 39 9.5C43 10.5 43 15 40 19Z" fill="url(#${p}gold)" stroke="#C98A00" stroke-width="1"/>
        <path d="M24 22C13 27 7 38 7 48C7 57 16 60.5 32 60.5C48 60.5 57 57 57 48C57 38 51 27 40 22Z" fill="url(#${p}gold)" stroke="#C98A00" stroke-width="1"/>
        <path d="M13 55C19 58.5 45 58.5 51 55" fill="none" stroke="#C98A00" stroke-width="0.8" opacity="0.5"/>
        <rect x="21.5" y="18" width="21" height="5.5" rx="2.75" fill="url(#${p}tie)"/>
        <path d="M35 23.5c2.5 3 2.5 6 0.5 8.5" stroke="#9A5E00" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <ellipse cx="18.5" cy="40" rx="3.2" ry="8" fill="#fff" opacity="0.38" transform="rotate(20 18.5 40)"/>
        <text x="32" y="52" text-anchor="middle" font-size="19" font-weight="800" fill="#A86A00" font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif">¥</text>
      </g>`;
  }

  // 金币箱：原点在箱底中心，约 58 宽；箱盖打开，金币堆随 --fxt-heap 升起
  function chest(p) {
    return `
      <ellipse class="fxt-shadow" cx="0" cy="0" rx="30" ry="3.4"/>
      <path d="M-25 -30L-23 -47C-12 -53 12 -53 23 -47L25 -30Z" fill="url(#${p}inside)" stroke="#4A230C" stroke-width="0.8"/>
      <path d="M-23 -47C-12 -53 12 -53 23 -47" fill="none" stroke="url(#${p}band)" stroke-width="3"/>
      <path d="M-14 -50.5L-14.8 -31M14 -50.5L14.8 -31" stroke="#C98A00" stroke-width="2" opacity="0.9"/>
      <g class="fxt-heap">
        <path d="M-26 -29C-24 -38 -14 -46 -2 -47C12 -48 23 -40 26 -29Z" fill="url(#${p}pile)" stroke="#C98A00" stroke-width="0.7"/>
        ${flatCoin(p, -15, -36, 0.9)}
        ${flatCoin(p, 12, -38, 0.9)}
        ${standCoin(p, -4, -44, 4.6, -10)}
        ${standCoin(p, 7, -45, 4.2, 18)}
        ${flatCoin(p, 0, -33, 0.95)}
        ${gem(p, 'ruby', -10, -41, 0.9, -8)}
        ${gem(p, 'sapphire', 17, -32, 0.75, 12)}
      </g>
      <g class="fxt-spill">
        ${standCoin(p, -22, -26, 4.2, -30)}
        ${flatCoin(p, 21, -3, 0.85)}
      </g>
      <rect x="-28" y="-30" width="56" height="30" rx="3" fill="url(#${p}wood)" stroke="#4A230C" stroke-width="0.9"/>
      <path d="M-27 -15.5H27" stroke="#5A2C12" stroke-width="0.8" opacity="0.55"/>
      <rect x="-29.5" y="-32.5" width="59" height="5.5" rx="2" fill="url(#${p}band)" stroke="#9A5E00" stroke-width="0.6"/>
      <rect x="-20" y="-27" width="5" height="27" fill="url(#${p}band)" stroke="#9A5E00" stroke-width="0.5"/>
      <rect x="15" y="-27" width="5" height="27" fill="url(#${p}band)" stroke="#9A5E00" stroke-width="0.5"/>
      <path d="M-5.5 -27H5.5V-19C5.5 -15.5 2.5 -13.5 0 -13C-2.5 -13.5 -5.5 -15.5 -5.5 -19Z" fill="url(#${p}band)" stroke="#9A5E00" stroke-width="0.6"/>
      <path d="M0 -22.5V-18.5" stroke="#5A2C12" stroke-width="1.6" stroke-linecap="round"/>
      <rect x="-26" y="-2.5" width="52" height="2.5" rx="1" fill="#5A2C12" opacity="0.35"/>`;
  }

  // 元宝
  function ingot(p, x, y, s = 1) {
    return `
      <g transform="translate(${x} ${y}) scale(${s})">
        <ellipse cx="0" cy="-4" rx="7.5" ry="6.5" fill="url(#${p}gold)" stroke="#B87A00" stroke-width="0.8"/>
        <path d="M-17 -7C-19 -12 -15 -15 -11 -12C-8 -8 8 -8 11 -12C15 -15 19 -12 17 -7C15 2 9 7 0 7C-9 7 -15 2 -17 -7Z" fill="url(#${p}gold)" stroke="#B87A00" stroke-width="0.8"/>
        <path d="M-15 -8C-9 -3 9 -3 15 -8" fill="none" stroke="#B87A00" stroke-width="0.7" opacity="0.7"/>
        <ellipse cx="-3" cy="-6.5" rx="2" ry="3" fill="#fff" opacity="0.5" transform="rotate(25 -3 -6.5)"/>
        <ellipse cx="-9" cy="1" rx="3.5" ry="1.4" fill="#fff" opacity="0.35" transform="rotate(20 -9 1)"/>
      </g>`;
  }

  // 财宝山：原点在山脚中心，约 108 宽 80 高
  function mountain(p) {
    return `
      <ellipse class="fxt-aura" cx="0" cy="-34" rx="62" ry="46" fill="url(#${p}aura)"/>
      <ellipse class="fxt-shadow" cx="0" cy="0" rx="54" ry="4"/>
      <path d="M-50 0C-45 -18 -30 -40 -10 -52C2 -58 14 -55 26 -43C38 -31 46 -15 50 0Z" fill="url(#${p}pileBack)" stroke="#B87A00" stroke-width="0.8"/>
      ${standCoin(p, -24, -38, 4.6, -24)}
      ${standCoin(p, 30, -32, 4.4, 26)}
      <g transform="translate(-28 -15) rotate(-10) scale(0.58)">
        <rect x="-28" y="-30" width="56" height="30" rx="3" fill="url(#${p}wood)" stroke="#4A230C" stroke-width="1.4"/>
        <rect x="-29.5" y="-32.5" width="59" height="5.5" rx="2" fill="url(#${p}band)" stroke="#9A5E00" stroke-width="1"/>
        <rect x="-20" y="-27" width="5" height="27" fill="url(#${p}band)"/>
        <rect x="15" y="-27" width="5" height="27" fill="url(#${p}band)"/>
        <path d="M-5.5 -27H5.5V-19C5.5 -15.5 2.5 -13.5 0 -13C-2.5 -13.5 -5.5 -15.5 -5.5 -19Z" fill="url(#${p}band)"/>
      </g>
      <path d="M-54 0C-48 -10 -38 -20 -22 -25C-8 -30 8 -30 22 -24C36 -18 48 -9 54 0Z" fill="url(#${p}pile)" stroke="#C98A00" stroke-width="0.8"/>
      ${flatCoin(p, -38, -8, 1)}
      ${flatCoin(p, -16, -20, 1)}
      ${flatCoin(p, 8, -22, 1.05)}
      ${flatCoin(p, 30, -12, 1)}
      ${flatCoin(p, -2, -9, 1.1)}
      ${flatCoin(p, 44, -2, 0.9)}
      ${standCoin(p, 18, -30, 5, 14)}
      ${standCoin(p, -8, -36, 4.8, -8)}
      ${gem(p, 'ruby', 12, -40, 1.1, 10)}
      ${gem(p, 'emerald', -16, -30, 1, -12)}
      ${gem(p, 'sapphire', 36, -20, 1, 18)}
      ${ingot(p, 2, -54, 1)}
      ${flatCoin(p, 22, 2, 0.9)}
      ${flatCoin(p, -48, 2, 0.8)}
      ${sparkle(-6, -66, 0.9, 's1')}
      ${sparkle(26, -50, 0.7, 's2')}
      ${sparkle(-34, -30, 0.65, 's3')}`;
  }

  function sceneSvg(p) {
    const art = { b1: bag, b2: bag, b3: bag, c1: chest, c2: chest, c3: chest, m: mountain };
    const pieces = PIECES.map(id => `
      <g class="fxt-piece" data-piece="${id}">
        <g class="fxt-inner">${art[id](p)}</g>
      </g>`).join('');
    return `<svg class="fxt-scene" viewBox="0 0 120 90" aria-hidden="true">${defs(p)}${pieces}</svg>`;
  }

  // ---------- 档位与摆放 ----------

  // 今日目标落在当前档内时，以目标为终点，保证收工时最新那件是满的
  function resolve(income, goal) {
    let index = 0;
    for (let i = 0; i < TIERS.length; i++) {
      if (income >= TIERS[i].min) index = i;
    }
    const lo = TIERS[index].min;
    const hi = index + 1 < TIERS.length ? TIERS[index + 1].min : TOP_TIER_MAX;
    const end = goal > 0 && goal >= lo ? Math.min(hi, goal) : hi; // 没有目标（休息日）时按档位区间算
    const fill = end > lo ? (income - lo) / (end - lo) : 1;
    return { tier: index + 1, fill: Math.max(0, Math.min(1, fill)) };
  }

  const show = (x, y, s, r = 0) => ({ x, y, s, r, o: 1 });
  const hide = (x, y, s = 0.15) => ({ x, y, s, r: 0, o: 0 });

  // 每件物品在各档的位置（viewBox 120×90，地面 y≈88），g 为最新那件的成长比例
  function layout(tier, fill) {
    const g = (lo, hi) => lo + (hi - lo) * fill;
    // 金袋收进箱子、箱子沉进金山时的去向
    const intoChest = hide(80, 76, 0.2);
    const intoMountain = hide(66, 84, 0.3);
    const L = {
      b1: hide(88, 86), b2: hide(93, 88), b3: hide(75, 69),
      c1: hide(80, 88), c2: hide(92, 88), c3: hide(73, 60),
      m: hide(66, 88, 0.3)
    };
    switch (tier) {
      case 1:
        L.b1 = show(90, 86, g(0.78, 1.02));
        break;
      case 2:
        L.b1 = show(68, 84, 0.94, -7);
        L.b2 = show(93, 88, g(0.5, 0.98), 8);
        break;
      case 3:
        L.b1 = show(56, 86, 0.9, -9);
        L.b2 = show(94, 88, 0.92, 8);
        L.b3 = show(75, g(69, 63), g(0.45, 0.82), 3); // 小的时候陷在两袋中间，长大后被顶上去
        break;
      case 4:
        L.b1 = L.b2 = L.b3 = intoChest;
        L.c1 = show(80, 88, g(1.0, 1.12)); // 比三个金袋略显大，升档不显得变少
        break;
      case 5:
        L.b1 = L.b2 = L.b3 = intoChest;
        L.c1 = show(56, 85, 0.86);
        L.c2 = show(91, 88, g(0.55, 0.92));
        break;
      case 6:
        L.b1 = L.b2 = L.b3 = intoChest;
        L.c1 = show(51, 88, 0.8);
        L.c2 = show(94, 88, 0.8);
        L.c3 = show(73, 60, g(0.4, 0.72), -3);
        break;
      default:
        L.b1 = L.b2 = L.b3 = intoMountain;
        L.c1 = L.c2 = L.c3 = intoMountain;
        L.m = show(64, 88, g(0.86, 1.02));
    }
    return L;
  }

  // ---------- 控制器 ----------

  function create(container) {
    const prefix = `fxt${++instanceCount}-`;
    container.insertAdjacentHTML('beforeend', sceneSvg(prefix));
    const svg = container.lastElementChild;
    const pieces = {};
    svg.querySelectorAll('.fxt-piece').forEach(el => {
      pieces[el.dataset.piece] = { el, inner: el.firstElementChild, shown: false };
    });

    let state = { tier: 0, fill: -1 };

    // animate=false 时直接摆好；第一次摆放、降档（跨天清零、取消加班）也不播过渡
    function set(income, goal, animate) {
      const next = resolve(income, goal);
      if (next.tier === state.tier && Math.abs(next.fill - state.fill) < 0.002) return null;
      const prevTier = state.tier;
      state = next;
      const animated = animate && prevTier > 0 && next.tier >= prevTier;

      svg.classList.toggle('fxt-static', !animated);
      svg.dataset.tier = String(next.tier);
      svg.dataset.full = next.fill >= 0.99 ? '1' : '0';
      const L = layout(next.tier, next.fill);
      const newest = TIERS[next.tier - 1].newest;
      const leaving = PIECES.some(id => pieces[id].shown && L[id].o === 0);
      PIECES.forEach(id => {
        const piece = pieces[id];
        const t = L[id];
        const entering = !piece.shown && t.o === 1;
        piece.el.style.transitionDelay = entering && leaving ? '0.2s' : '0s';
        piece.el.style.transform = `translate(${t.x}px, ${t.y}px) rotate(${t.r}deg) scale(${t.s})`;
        piece.el.style.opacity = String(t.o);
        piece.shown = t.o === 1;
        const fill = id === newest ? next.fill : 1;
        piece.el.dataset.level = fill >= 0.99 ? '3' : fill >= 0.67 ? '2' : fill >= 0.34 ? '1' : '0';
        piece.el.style.setProperty('--fxt-heap', fill.toFixed(3));
      });
      if (!animated) {
        void svg.getBoundingClientRect(); // 让无过渡的摆放先生效
        svg.classList.remove('fxt-static');
      }
      return { from: prevTier, to: next.tier, animated };
    }

    function newestPiece() {
      return pieces[TIERS[Math.max(0, state.tier - 1)].newest];
    }

    // 金币飞进来的落点：袋口 / 箱口 / 山顶
    function mouth() {
      const r = newestPiece().inner.getBoundingClientRect();
      const kind = TIERS[Math.max(0, state.tier - 1)].kind;
      const k = kind === 'bag' ? 0.3 : kind === 'chest' ? 0.35 : 0.3;
      return { x: r.left + r.width / 2, y: r.top + r.height * k };
    }

    return {
      el: svg,
      set,
      mouth,
      newestInner: () => newestPiece().inner,
      kind: () => TIERS[Math.max(0, state.tier - 1)].kind,
      tier: () => state.tier
    };
  }

  return { create, resolve, TIERS };
})();
