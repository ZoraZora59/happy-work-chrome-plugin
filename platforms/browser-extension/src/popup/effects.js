// 氛围特效：财宝堆攒钱（金袋 → 宝箱 → 财宝山）、金币入袋、金笔打勾、小星星、里程碑庆祝
// 只负责"演出"，不参与收入计算，由 popup.js 在合适的时机调用
const HappyFx = (function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 各心情阶段同时闪烁的星星数量
  const STAR_LEVELS = { afterwork: 1, calm: 1, focused: 2, steady: 3, excited: 5, euphoric: 8, explosive: 12 };
  const MAX_STARS = 12;

  const MILESTONE_TEXT = {
    25: '干完 1/4 啦，稳住',
    50: '过半啦，胜利在望',
    75: '只剩 1/4，冲！'
  };

  // 下班那一刻，按当时攒到的财宝说一句
  const DONE_TEXT = {
    bag: '今天的钱袋装满啦，收工！',
    chest: '今天的宝箱装满啦，收工！',
    mountain: '今天攒出一座金山，收工！'
  };

  // 升档提示，key 为升到的档位
  const TIER_UP_TEXT = {
    2: '攒够 ¥500，钱袋多了一个',
    3: '破 ¥1000，三袋金子啦',
    4: '¥2000！三袋金子装进宝箱',
    5: '¥3000！又装满一箱',
    6: '¥4000！宝箱摞起来了',
    7: '¥5000！堆出一座财宝山'
  };

  const STAR_PATH = 'M12 0C12.9 8.2 15.8 11.1 24 12C15.8 12.9 12.9 15.8 12 24C11.1 15.8 8.2 12.9 0 12C8.2 11.1 11.1 8.2 12 0Z';

  // 笔尖在 viewBox 的 (12, 23)，绕笔尖旋转，方便让笔尖沿着勾的轨迹走
  const PEN_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="fxPenGold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#E09A00"/>
          <stop offset="0.45" stop-color="#FFE38A"/>
          <stop offset="1" stop-color="#D08A00"/>
        </linearGradient>
      </defs>
      <g transform="rotate(38 12 23)">
        <rect x="9" y="1" width="6" height="12.5" rx="2.6" fill="url(#fxPenGold)" stroke="#A86A00" stroke-width="0.6"/>
        <rect x="13.2" y="2.5" width="1" height="7" rx="0.5" fill="#fff" opacity="0.65"/>
        <rect x="8.8" y="13" width="6.4" height="2.2" fill="#9A5E00"/>
        <path d="M9.4 15.2L12 23L14.6 15.2Z" fill="#FFD54F" stroke="#A86A00" stroke-width="0.6" stroke-linejoin="round"/>
        <path d="M12 17.5V20.8" stroke="#8A5600" stroke-width="0.6"/>
      </g>
    </svg>`;

  const CHECK_POINTS = [[4, 12.5], [9.5, 18], [20, 6.5]];
  const CHECK_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12.5L9.5 18L20 6.5" fill="none" stroke="#27B36A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" pathLength="24" stroke-dasharray="24" stroke-dashoffset="24"/>
    </svg>`;

  const STAR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;

  let box = null;
  let sceneEl = null;
  let sceneBody = null; // 下班庆祝时整体摇晃、炸开的那一层
  let treasure = null;
  let toastEl = null;
  let toastTimer = null;
  let stars = [];
  let starLevel = 0;
  let enabled = true;
  let targetIncome = 0;
  let targetGoal = 0;
  let treasureReady = false; // 拿到第一笔真实收入前只摆个空钱袋，第一次摆放不播升档动画
  let introActive = false; // 开场动画期间，财宝由金币一枚枚"喂"大
  let queue = Promise.resolve();

  // ---------- 挂载 ----------

  function mount(incomeBox) {
    box = incomeBox;

    const starsEl = document.createElement('div');
    starsEl.className = 'fx-stars';
    for (let i = 0; i < MAX_STARS; i++) {
      const el = document.createElement('span');
      el.className = 'fx-star';
      el.innerHTML = STAR_SVG;
      el.style.setProperty('--fx-dur', `${(1.6 + Math.random() * 1.2).toFixed(2)}s`);
      const star = { el, on: false };
      // 每轮闪烁结束（此时透明）换个位置
      el.addEventListener('animationiteration', () => placeStar(star));
      stars.push(star);
      starsEl.appendChild(el);
    }
    box.appendChild(starsEl);

    sceneEl = document.createElement('div');
    sceneEl.className = 'fx-treasure';
    sceneEl.innerHTML = '<div class="fx-treasure-body"></div>';
    sceneBody = sceneEl.firstElementChild;
    treasure = HappyTreasure.create(sceneBody);
    treasure.set(0, Infinity, false);
    box.appendChild(sceneEl);

    toastEl = document.createElement('div');
    toastEl.className = 'fx-toast';
    box.appendChild(toastEl);
  }

  // 佛系模式下关闭全部特效
  function setEnabled(on) {
    if (on === enabled) return;
    enabled = on;
    if (box) box.classList.toggle('fx-off', !on);
    if (!on) {
      particles = [];
      clearCanvas();
    }
  }

  function canAnimate() {
    return enabled && !reduceMotion && box !== null;
  }

  // ---------- 财宝堆 ----------

  // income 为今日已赚，goal 为今日应得（决定收工时最新那件是否装满）
  function setIncome(income, goal) {
    targetIncome = income;
    targetGoal = goal;
    if (!introActive) applyIncome(income, true);
  }

  function applyIncome(income, announce) {
    if (!treasure) return;
    const wasReady = treasureReady;
    const change = treasure.set(income, targetGoal, canAnimate() && wasReady);
    treasureReady = true;
    if (wasReady && change && change.to > change.from) {
      tierUp(change.to, announce);
    }
  }

  // 升档：新的一件弹出来时冒一把金币；开场回放期间不弹提示，免得盖住开场文案
  // 减少动态效果时不冒金币，只留文字提示
  function tierUp(tier, announce) {
    const at = mouth();
    setTimeout(() => {
      if (!canAnimate()) return;
      for (let i = 0; i < 10; i++) {
        const kind = i % 3 === 0 ? 'star' : 'coin';
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
        const speed = 90 + Math.random() * 110;
        spawnFly(kind, at, {
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          gravity: 380,
          life: 0.7 + Math.random() * 0.3,
          size: kind === 'coin' ? 11 + Math.random() * 4 : 10 + Math.random() * 5
        });
      }
    }, 320);
    if (announce && TIER_UP_TEXT[tier]) {
      enqueue(() => new Promise(resolve => {
        toast(TIER_UP_TEXT[tier], 2600);
        setTimeout(resolve, 1200);
      }));
    }
  }

  function gulp() {
    if (!canAnimate()) return;
    treasure.newestInner().animate([
      { transform: 'scale(1, 1)' },
      { transform: 'scale(1.12, 0.88)', offset: 0.3 },
      { transform: 'scale(0.95, 1.06)', offset: 0.6 },
      { transform: 'scale(1, 1)' }
    ], { duration: 320, easing: 'ease-out' });
  }

  // 金币飞进来的落点：最新那件的袋口 / 箱口 / 山顶
  function mouth() {
    return treasure.mouth();
  }

  // ---------- 小星星 ----------

  function setMood(mood) {
    const level = canAnimate() ? (STAR_LEVELS[mood] || 0) : 0;
    if (level === starLevel) return;
    starLevel = level;
    stars.forEach((star, i) => {
      const on = i < level;
      if (on === star.on) return;
      star.on = on;
      if (on) {
        placeStar(star);
        star.el.style.animationDelay = `${(Math.random() * 1.2).toFixed(2)}s`;
      }
      star.el.classList.toggle('on', on);
    });
  }

  // 星星只落在数字、文字、进度条之外的空白处，不挡收入数字
  function placeStar(star) {
    const base = box.getBoundingClientRect();
    const blocked = [
      textRect(box.querySelector('.income-label')),
      textRect(box.querySelector('.income-value')),
      box.querySelector('.income-desc').getBoundingClientRect(),
      box.querySelector('.income-percent').getBoundingClientRect(),
      box.querySelector('.income-progress').getBoundingClientRect()
    ].map(r => toLocal(r, base, 4));
    blocked.push(toLocal(sceneEl.getBoundingClientRect(), base, -8));

    const size = 8 + Math.random() * 7;
    let x = 0;
    let y = 0;
    for (let i = 0; i < 12; i++) {
      x = 4 + Math.random() * (base.width - size - 8);
      y = 4 + Math.random() * (base.height - size - 8);
      const hit = blocked.some(r => x < r.right && x + size > r.left && y < r.bottom && y + size > r.top);
      if (!hit) break;
    }
    star.el.style.left = `${x.toFixed(1)}px`;
    star.el.style.top = `${y.toFixed(1)}px`;
    star.el.style.width = `${size.toFixed(1)}px`;
    star.el.style.height = `${size.toFixed(1)}px`;
  }

  function textRect(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return r.width > 0 ? r : el.getBoundingClientRect();
  }

  function toLocal(r, base, pad) {
    return {
      left: r.left - base.left - pad,
      top: r.top - base.top - pad,
      right: r.right - base.left + pad,
      bottom: r.bottom - base.top + pad
    };
  }

  // ---------- 提示条 ----------

  function toast(text, ms) {
    clearTimeout(toastTimer);
    toastEl.textContent = text;
    toastEl.classList.remove('show');
    void toastEl.offsetWidth; // 重新触发入场过渡
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  function formatAway(ms) {
    const minutes = Math.max(1, Math.round(ms / 60000));
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
  }

  // ---------- 演出队列：开场、打勾、里程碑依次播放，不互相抢戏 ----------

  function enqueue(task) {
    queue = queue.then(() => (enabled ? task() : null)).catch(err => console.warn('[HappyFx]', err));
    return queue;
  }

  // 开场：离开期间赚的钱化作金币飞进财宝堆，一路回放金袋变多、装箱的过程
  function playIntro(info) {
    introActive = !reduceMotion;
    targetIncome = info.to;
    targetGoal = info.goal;
    if (introActive) {
      treasure.set(info.from, info.goal, false);
      treasureReady = true;
    }

    return enqueue(() => new Promise(resolve => {
      const gained = info.to - info.from;
      const text = info.isNewDay
        ? `今天已经进账 ¥${gained.toFixed(2)}，继续搞钱`
        : `离开 ${formatAway(info.awayMs)}，又进账 ¥${gained.toFixed(2)}`;
      toast(text, 3200);

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        introActive = false;
        applyIncome(targetIncome, false);
        setTimeout(resolve, 250);
      };
      if (!canAnimate()) {
        finish();
        return;
      }

      const count = Math.max(4, Math.min(24, Math.round(4 + Math.log2(1 + gained) * 2.5)));
      const src = textRect(box.querySelector('.income-value'));
      let arrived = 0;
      for (let i = 0; i < count; i++) {
        const from = { x: src.left + Math.random() * src.width, y: src.top + src.height * 0.5 };
        const to = mouth();
        spawnArc('coin', from, to, {
          ctrl: { x: from.x + (to.x - from.x) * 0.3, y: Math.min(from.y, to.y) - 50 - Math.random() * 40 },
          delay: i * (1 / count) + Math.random() * 0.05,
          dur: 0.75 + Math.random() * 0.2,
          size: 14 + Math.random() * 6,
          onArrive: () => {
            arrived++;
            applyIncome(info.from + gained * (arrived / count), false);
            gulp();
            if (arrived === count) {
              sparkleAt(mouth(), 5);
              finish();
            }
          }
        });
      }
      setTimeout(finish, 3000); // 兜底，避免队列卡住
    }));
  }

  // 金笔打勾：又挣够了 N 个"价值物品"
  function penCheck(gain, icon) {
    return enqueue(() => new Promise(resolve => {
      const desc = box.querySelector('.income-desc');
      if (!canAnimate()) {
        toast(`又挣到 +${gain} ${icon}`, 1800);
        setTimeout(resolve, 400);
        return;
      }
      const base = box.getBoundingClientRect();
      const d = desc.getBoundingClientRect();
      const size = 22;
      const checkLeft = Math.max(2, d.left - base.left - size - 4);
      const checkTop = d.top - base.top + (d.height - size) / 2;

      const check = addLayerEl('fx-check', checkLeft, checkTop);
      check.innerHTML = CHECK_SVG;
      const pen = addLayerEl('fx-pen', 0, 0);
      pen.innerHTML = PEN_SVG;

      const k = size / 24;
      const tipX = 12 * k;
      const tipY = 23 * k;
      const pts = CHECK_POINTS.map(([x, y]) => [checkLeft + x * k, checkTop + y * k]);
      const at = ([x, y], dx = 0, dy = 0) => `translate(${x - tipX + dx}px, ${y - tipY + dy}px)`;
      const timing = { duration: 750, easing: 'ease-in-out', fill: 'forwards' };
      pen.animate([
        { transform: at(pts[0], -8, -10), opacity: 0 },
        { transform: at(pts[0]), opacity: 1, offset: 0.15 },
        { transform: at(pts[1]), offset: 0.38 },
        { transform: at(pts[2]), opacity: 1, offset: 0.8 },
        { transform: at(pts[2], 8, -12), opacity: 0 }
      ], timing);
      // 勾的第一笔占总长约 1/3（pathLength=24 → 8）
      check.querySelector('path').animate([
        { strokeDashoffset: 24 },
        { strokeDashoffset: 24, offset: 0.15 },
        { strokeDashoffset: 16, offset: 0.38 },
        { strokeDashoffset: 0, offset: 0.8 },
        { strokeDashoffset: 0 }
      ], timing);

      // 气泡从进度条上方冒出，不压住进度条
      const bar = box.querySelector('.income-progress').getBoundingClientRect();
      const bubbleX = d.left - base.left + d.width / 2;
      const bubbleY = bar.top - base.top - 2;
      let bubble = null;
      setTimeout(() => {
        bubble = addLayerEl('fx-bubble', bubbleX, bubbleY);
        bubble.textContent = `+${gain} ${icon}`;
        bubble.animate([
          { transform: 'translate(-50%, -60%) scale(0.4)', opacity: 0 },
          { transform: 'translate(-50%, -120%) scale(1.15)', opacity: 1, offset: 0.3 },
          { transform: 'translate(-50%, -130%) scale(1)', opacity: 1, offset: 0.7 },
          { transform: 'translate(-50%, -150%) scale(1)', opacity: 0 }
        ], { duration: 1100, easing: 'ease-out', fill: 'forwards' });

        // 物品图标飞进钱袋
        const flyer = addLayerEl('fx-flyer', 0, 0);
        flyer.textContent = icon;
        const target = mouth();
        flyDom(flyer, { x: bubbleX, y: bubbleY - 18 }, { x: target.x - base.left, y: target.y - base.top }, 650, 350, gulp);
      }, 520);

      setTimeout(() => check.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }), 1300);
      setTimeout(() => {
        check.remove();
        pen.remove();
        if (bubble) bubble.remove();
        resolve();
      }, 1700);
    }));
  }

  // 进度里程碑：25/50/75 在进度条对应位置迸出星星；100 时财宝堆炸开
  function milestone(percent) {
    return enqueue(() => (percent >= 100 ? burstTreasure() : burstProgress(percent)));
  }

  function burstProgress(percent) {
    return new Promise(resolve => {
      toast(MILESTONE_TEXT[percent], 2400);
      if (!canAnimate()) {
        setTimeout(resolve, 500);
        return;
      }
      const bar = box.querySelector('.income-progress').getBoundingClientRect();
      const origin = { x: bar.left + bar.width * percent / 100, y: bar.top + bar.height / 2 };
      for (let i = 0; i < 16; i++) {
        const kind = i % 3 === 0 ? 'coin' : 'star';
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
        const speed = 140 + Math.random() * 160;
        spawnFly(kind, origin, {
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          gravity: 420,
          life: 0.9 + Math.random() * 0.4,
          size: kind === 'coin' ? 13 : 12 + Math.random() * 6
        });
      }
      setTimeout(resolve, 900);
    });
  }

  function burstTreasure() {
    return new Promise(resolve => {
      toast(DONE_TEXT[treasure.kind()], 3200);
      if (!canAnimate()) {
        setTimeout(resolve, 500);
        return;
      }
      const wiggle = sceneBody.animate([
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-14deg)', offset: 0.2 },
        { transform: 'rotate(12deg)', offset: 0.4 },
        { transform: 'rotate(-10deg)', offset: 0.6 },
        { transform: 'rotate(8deg)', offset: 0.8 },
        { transform: 'rotate(0deg)' }
      ], { duration: 520, easing: 'ease-in-out' });

      wiggle.onfinish = () => {
        const r = sceneEl.getBoundingClientRect();
        const center = { x: r.left + r.width * 0.6, y: r.top + r.height * 0.6 };
        const base = box.getBoundingClientRect();

        sceneBody.animate([
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(1.5)', opacity: 0 }
        ], { duration: 220, easing: 'ease-out', fill: 'forwards' });

        const flash = addLayerEl('fx-flash', center.x - base.left, center.y - base.top);
        flash.animate([
          { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 1 },
          { transform: 'translate(-50%, -50%) scale(2.2)', opacity: 0 }
        ], { duration: 380, easing: 'ease-out', fill: 'forwards' }).onfinish = () => flash.remove();

        for (let i = 0; i < 30; i++) {
          const kind = i % 3 === 2 ? 'star' : 'coin';
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.8;
          const speed = 160 + Math.random() * 180;
          spawnFly(kind, center, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            gravity: 520,
            life: 1.1 + Math.random() * 0.5,
            size: kind === 'coin' ? 14 + Math.random() * 6 : 12 + Math.random() * 8
          });
        }

        setTimeout(() => {
          sceneBody.animate([
            { transform: 'scale(0)', opacity: 0 },
            { transform: 'scale(1.15)', opacity: 1, offset: 0.6 },
            { transform: 'scale(1)', opacity: 1 }
          ], { duration: 480, easing: 'ease-out', fill: 'forwards' });
          setTimeout(resolve, 500);
        }, 700);
      };
    });
  }

  // 常规收入跳动时，顺手弹一枚金币进财宝堆
  function tickCoin(x, y) {
    if (!canAnimate()) return;
    const to = mouth();
    spawnArc('coin', { x, y }, to, {
      ctrl: { x: (x + to.x) / 2, y: Math.min(y, to.y) - 40 - Math.random() * 30 },
      dur: 0.7 + Math.random() * 0.2,
      size: 16,
      onArrive: gulp
    });
  }

  function sparkleAt(point, count) {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
      const speed = 60 + Math.random() * 80;
      spawnFly('star', point, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 120,
        life: 0.6 + Math.random() * 0.3,
        size: 10 + Math.random() * 6
      });
    }
  }

  // ---------- DOM 小元素 ----------

  function addLayerEl(className, left, top) {
    const el = document.createElement('div');
    el.className = className;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    box.appendChild(el);
    return el;
  }

  // 沿二次贝塞尔曲线飞行（坐标相对 income-box）
  function flyDom(el, from, to, duration, delay, onDone) {
    const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 45 };
    const frames = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const u = 1 - t;
      const x = u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x;
      const y = u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y;
      frames.push({
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${(1 - 0.5 * t * t).toFixed(3)})`,
        opacity: t > 0.9 ? 0 : 1
      });
    }
    el.style.opacity = '0';
    const anim = el.animate(frames, { duration, delay, easing: 'ease-in', fill: 'forwards' });
    anim.onfinish = () => {
      el.remove();
      if (onDone) onDone();
    };
  }

  // ---------- canvas 粒子层（金币雨、爆开这类数量多的效果） ----------

  let canvas = null;
  let ctx = null;
  let cssW = 0;
  let cssH = 0;
  let particles = [];
  let rafId = null;
  let lastFrame = 0;
  const sprites = {};

  function ensureCanvas() {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'fx-canvas';
      document.body.appendChild(canvas);
      ctx = canvas.getContext('2d');
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === cssW && h === cssH) return;
    const dpr = window.devicePixelRatio || 1;
    cssW = w;
    cssH = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearCanvas() {
    if (ctx) ctx.clearRect(0, 0, cssW, cssH);
  }

  // 预渲染金币、星星贴图，逐帧只做 drawImage
  function getSprite(kind) {
    if (sprites[kind]) return sprites[kind];
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    if (kind === 'coin') {
      const grad = g.createRadialGradient(24, 22, 4, 32, 32, 26);
      grad.addColorStop(0, '#FFF6C4');
      grad.addColorStop(0.5, '#FFD23F');
      grad.addColorStop(1, '#E3A000');
      g.beginPath();
      g.arc(32, 32, 26, 0, Math.PI * 2);
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#C98A00';
      g.stroke();
      g.beginPath();
      g.arc(32, 32, 19, 0, Math.PI * 2);
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(169, 106, 0, 0.45)';
      g.stroke();
      g.fillStyle = '#A86A00';
      g.font = '800 28px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('¥', 32, 34);
    } else {
      g.translate(8, 8);
      g.scale(2, 2);
      g.shadowColor = 'rgba(255, 190, 0, 0.9)';
      g.shadowBlur = 8;
      g.fillStyle = '#FFC21A';
      g.fill(new Path2D(STAR_PATH));
    }
    sprites[kind] = c;
    return c;
  }

  function spawnArc(kind, from, to, opts) {
    particles.push({
      kind,
      mode: 'arc',
      x: from.x,
      y: from.y,
      from,
      to,
      ctrl: opts.ctrl,
      delay: opts.delay || 0,
      dur: opts.dur,
      size: opts.size,
      age: 0,
      alpha: 1,
      scale: 1,
      rot: 0,
      spin: Math.random() * Math.PI,
      spinSpeed: 8 + Math.random() * 6,
      onArrive: opts.onArrive
    });
    start();
  }

  function spawnFly(kind, origin, opts) {
    particles.push({
      kind,
      mode: 'fly',
      x: origin.x,
      y: origin.y,
      vx: opts.vx,
      vy: opts.vy,
      gravity: opts.gravity,
      life: opts.life,
      delay: opts.delay || 0,
      size: opts.size,
      age: 0,
      alpha: 1,
      scale: 1,
      rot: 0,
      rotSpeed: (Math.random() - 0.5) * 6,
      spin: Math.random() * Math.PI,
      spinSpeed: 6 + Math.random() * 8
    });
    start();
  }

  function start() {
    ensureCanvas();
    if (rafId) return;
    lastFrame = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function frame(ts) {
    const dt = Math.min(0.05, Math.max(0, (ts - lastFrame) / 1000));
    lastFrame = ts;
    ensureCanvas();
    clearCanvas();

    const arrivals = [];
    particles = particles.filter(p => {
      const alive = step(p, dt);
      if (!alive && p.onArrive) arrivals.push(p.onArrive);
      return alive;
    });
    particles.forEach(draw);
    arrivals.forEach(fn => fn());

    rafId = particles.length > 0 ? requestAnimationFrame(frame) : null;
    if (!rafId) clearCanvas();
  }

  function step(p, dt) {
    if (p.delay > 0) {
      p.delay -= dt;
      return true;
    }
    p.age += dt;
    p.spin += p.spinSpeed * dt;

    if (p.mode === 'arc') {
      const t = Math.min(1, p.age / p.dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const u = 1 - e;
      p.x = u * u * p.from.x + 2 * u * e * p.ctrl.x + e * e * p.to.x;
      p.y = u * u * p.from.y + 2 * u * e * p.ctrl.y + e * e * p.to.y;
      p.scale = 1 - 0.45 * t * t * t;
      return t < 1;
    }

    p.vy += p.gravity * dt;
    p.vx *= 1 - 1.2 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.rotSpeed * dt;
    const t = p.age / p.life;
    p.alpha = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1;
    if (p.kind === 'star') p.scale = 0.7 + 0.3 * Math.abs(Math.sin(p.age * 12));
    return t < 1;
  }

  function draw(p) {
    if (p.delay > 0) return;
    const s = p.size * p.scale;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.kind === 'coin') {
      ctx.scale(Math.max(0.2, Math.abs(Math.cos(p.spin))), 1); // 翻转的金币
    }
    ctx.drawImage(getSprite(p.kind), -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  return {
    mount,
    setEnabled,
    setIncome,
    setMood,
    tickCoin,
    playIntro,
    penCheck,
    milestone
  };
})();
