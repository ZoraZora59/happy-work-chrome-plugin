document.addEventListener('DOMContentLoaded', function () {
  const incomeValue = document.getElementById('incomeValue');
  const progressBar = document.getElementById('progressBar');
  const incomeDesc = document.getElementById('incomeDesc');
  const incomePercent = document.getElementById('incomePercent');
  const todayValue = document.getElementById('todayValue');
  const countdown = document.getElementById('countdown');
  const countdownLabel = document.getElementById('countdownLabel');
  const setIncomeBtn = document.getElementById('setIncomeBtn');
  const overtimeBtn = document.getElementById('overtimeBtn');

  // Modal elements
  const coffeeModal = document.getElementById('coffeeModal');
  const buyCoffeeBtn = document.getElementById('buyCoffeeBtn');
  const closeButton = document.querySelector('.close-button');

  let currentRefreshInterval = null;
  let displayIncome = 0; // 用于平滑动画的显示收入
  let lastUpdateTime = Date.now(); // 上次动画更新时间
  let workState = null; // 在内存中维护的工作状态
  let lastSaveTime = 0; // 上次保存状态到硬盘的时间

  // 氛围特效相关状态
  let fxState = null; // 今日已庆祝过的进度里程碑 { date, celebrated }
  let introSnapshot = null; // 上次关闭弹窗时的收入快照，用于开场动画
  let introDone = false;
  let introHoldUntil = 0; // 开场数钱期间，暂停常规的数字刷新和冒字特效
  let lastItemKey = null; // 价值物品切换时重置计数，不补放打勾
  let lastItemCount = 0;

  const MILESTONES = [25, 50, 75, 100];
  const VALUE_ITEMS = {
    cola: { price: 3, unit: '瓶可乐', icon: '🥤' },
    chicken: { price: 14, unit: '个辣翅', icon: '🍗' },
    burger: { price: 28, unit: '个巨无霸', icon: '🍔' }
  };

  HappyFx.mount(document.querySelector('.income-box'));

  // Click listeners for modal
  if(buyCoffeeBtn && coffeeModal && closeButton) {
    buyCoffeeBtn.onclick = function(event) {
      event.preventDefault();
      coffeeModal.style.display = "flex";
    }
  
    closeButton.onclick = function() {
      coffeeModal.style.display = "none";
    }
  
    window.onclick = function(event) {
      if (event.target == coffeeModal) {
        coffeeModal.style.display = "none";
      }
    }
  }

  // 点击设置按钮跳转到设置页面
  setIncomeBtn.onclick = function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/settings.html') });
  };

  // 获取并初始化工作状态
  async function initializeWorkState() {
    const today = new Date().toLocaleDateString();
    // 优先从 local 读取
    let data = await chrome.storage.local.get('workState');
    let loadedState = data.workState;

    // 兼容旧版，如果 local 没有，从 sync 读取
    if (!loadedState) {
        const syncResult = await chrome.storage.sync.get('workState');
        loadedState = syncResult.workState;
    }

    const isNewDay = !loadedState || loadedState.date !== today;
    if (!introDone) {
      introSnapshot = isNewDay
        ? { baseIncome: 0, lastUpdateTime: Date.now(), isNewDay: true }
        : { baseIncome: loadedState.baseIncome || 0, lastUpdateTime: loadedState.lastUpdateTime || Date.now(), isNewDay: false };
    }
    if (!fxState) {
      const fxData = await chrome.storage.local.get('fxState');
      fxState = fxData.fxState || null;
    }

    if (isNewDay) {
      // 新的一天，重置状态
      workState = {
        date: today,
        baseIncome: 0,
        lastUpdateTime: Date.now(),
        overtimeActive: false // 下班后加班状态，只在当天有效
      };
      // 立即保存一次初始状态
      await chrome.storage.local.set({ workState });
      await chrome.storage.sync.set({ workState });
      lastSaveTime = Date.now();
    } else {
        workState = loadedState;
    }
    
    // 从恢复的状态初始化
    if (workState) {
        displayIncome = workState.baseIncome;
        lastUpdateTime = workState.lastUpdateTime;
        // 恢复加班按钮状态（旧版状态没有该字段，按未加班处理）
        updateOvertimeButton(workState.overtimeActive === true);
    }

    startUpdateLoop();
  }

  // 计算工作时长（分钟），排除休息时间
  function calculateWorkMinutes(workStart, workEnd, breaks) {
    const startMinutes = timeToMinutes(workStart);
    const endMinutes = timeToMinutes(workEnd);
    let totalMinutes = endMinutes - startMinutes;
    
    // 减去休息时间
    breaks.forEach(breakTime => {
      const breakStart = timeToMinutes(breakTime.start);
      const breakEnd = timeToMinutes(breakTime.end);
      totalMinutes -= (breakEnd - breakStart);
    });
    
    return Math.max(0, totalMinutes);
  }

  // 时间字符串转换为分钟数
  function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // 时间字符串转换为秒数
  function timeToSeconds(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 3600 + minutes * 60;
  }

  // 判断当前时间是否在工作时间内
  function isCurrentlyInWorkTime(workStart, workEnd, breaks, includeAfterWork = false) {
    const now = new Date();
    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const startSeconds = timeToSeconds(workStart);
    const endSeconds = timeToSeconds(workEnd);
    
    // 如果还没到上班时间，返回false
    if (currentSeconds < startSeconds) {
      return false;
    }
    
    // 如果在正常工作时间内
    if (currentSeconds <= endSeconds) {
      // 检查是否在休息时间内
      for (const breakTime of breaks) {
        const breakStart = timeToSeconds(breakTime.start);
        const breakEnd = timeToSeconds(breakTime.end);
        if (currentSeconds >= breakStart && currentSeconds <= breakEnd) {
          return false; // 在休息时间内
        }
      }
      return true; // 在正常工作时间且不在休息时间
    }
    
    // 超过正常下班时间，只有在加班模式下才算工作时间
    return includeAfterWork;
  }

  // 计算当前时间已工作的秒数（更精确）
  function getWorkedSeconds(workStart, workEnd, breaks, includeAfterWork = false) {
    const now = new Date();
    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const startSeconds = timeToSeconds(workStart);
    const endSeconds = timeToSeconds(workEnd);
    
    if (currentSeconds < startSeconds) {
      return { normalSeconds: 0, afterWorkSeconds: 0 }; // 还没到上班时间
    }
    
    let normalSeconds = 0;
    let afterWorkSeconds = 0;
    
    if (currentSeconds <= endSeconds) {
      // 正常工作时间内
      normalSeconds = currentSeconds - startSeconds;
      
      // 减去已过的休息时间
      breaks.forEach(breakTime => {
        const breakStart = timeToSeconds(breakTime.start);
        const breakEnd = timeToSeconds(breakTime.end);
        
        if (currentSeconds > breakEnd) {
          // 完全过了这个休息时间
          normalSeconds -= (breakEnd - breakStart);
        } else if (currentSeconds > breakStart) {
          // 正在休息中
          normalSeconds -= (currentSeconds - breakStart);
        }
      });
      
      normalSeconds = Math.max(0, normalSeconds);
    } else {
      // 超过了正常下班时间
      // 正常工作时间的秒数
      normalSeconds = endSeconds - startSeconds;
      
      // 减去所有休息时间
      breaks.forEach(breakTime => {
        const breakStart = timeToSeconds(breakTime.start);
        const breakEnd = timeToSeconds(breakTime.end);
        normalSeconds -= (breakEnd - breakStart);
      });
      
      normalSeconds = Math.max(0, normalSeconds);
      
      // 下班后加班时间（只有明确启用时才计算）
      if (includeAfterWork) {
        afterWorkSeconds = currentSeconds - endSeconds;
      }
    }
    
    return { normalSeconds, afterWorkSeconds };
  }

  // 简单的节假日判断（可扩展）
  function isHoliday(date) {
    // 这里可以添加更复杂的节假日判断逻辑
    // 目前简单实现：假设1月1日、5月1日、10月1日为节假日
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    if ((month === 1 && day === 1) || 
        (month === 5 && day === 1) || 
        (month === 10 && day === 1)) {
      return true;
    }
    return false;
  }

  // 判断是否在休息日加班周期内
  function isWeekendOvertimeWeek(baseWeekStart, frequency) {
    if (!baseWeekStart || frequency === 1) return true;
    
    const baseDate = new Date(baseWeekStart);
    const now = new Date();
    const diffWeeks = Math.floor((now - baseDate) / (7 * 24 * 60 * 60 * 1000));
    
    return diffWeeks % frequency === 0;
  }

  // 计算当月实际工作天数
  function getMonthlyWorkDays(workDays, overtimeSettings) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let totalWorkDays = 0;
    let totalOvertimeDays = 0;
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayOfWeek = date.getDay(); // 0=周日, 1=周一, ..., 6=周六
      
      // 工作日但遇到节假日时不计入正常工作日
      if (workDays.includes(dayOfWeek) && !isHoliday(date)) {
        totalWorkDays++;
      }
      
      // 节假日加班
      if (overtimeSettings.holiday?.enabled && isHoliday(date)) {
        totalOvertimeDays += parseFloat(overtimeSettings.holiday.multiplier || 3);
      }
      
      // 普通休息日加班
      if (overtimeSettings.weekend?.enabled && 
          !workDays.includes(dayOfWeek) && 
          !isHoliday(date) &&
          isWeekendOvertimeWeek(overtimeSettings.weekend.baseWeekStart, overtimeSettings.weekend.frequency)) {
        totalOvertimeDays += parseFloat(overtimeSettings.weekend.multiplier || 2);
      }
    }
    
    return { totalWorkDays, totalOvertimeDays };
  }

  // 判断今天是什么类型的日子
  function getTodayWorkType(workDays, overtimeSettings) {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const isWorkDay = workDays.includes(dayOfWeek);
    const isHolidayToday = isHoliday(today);

    // 节假日：默认按休息日处理，除非开启节假日加班
    if (isHolidayToday) {
      if (overtimeSettings.holiday?.enabled) {
        return { type: 'holiday', multiplier: parseFloat(overtimeSettings.holiday.multiplier || 3) };
      }
      return { type: 'off', multiplier: 0 };
    }

    // 普通休息日加班
    if (overtimeSettings.weekend?.enabled &&
        !isWorkDay &&
        isWeekendOvertimeWeek(overtimeSettings.weekend.baseWeekStart, overtimeSettings.weekend.frequency)) {
      return { type: 'weekend', multiplier: parseFloat(overtimeSettings.weekend.multiplier || 2) };
    }
    
    // 工作日下班后加班（这里简化处理，实际可能需要判断是否超过正常工作时间）
    if (isWorkDay && overtimeSettings.afterWork?.enabled) {
      return { type: 'normal', multiplier: 1, afterWorkMultiplier: parseFloat(overtimeSettings.afterWork.multiplier || 1.5) };
    }
    
    // 普通工作日
    if (isWorkDay) {
      return { type: 'normal', multiplier: 1 };
    }
    
    // 休息日
    return { type: 'off', multiplier: 0 };
  }

  // 计算到下班的倒计时
  function getCountdown(workEnd) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const endMinutes = timeToMinutes(workEnd);
    
    if (currentMinutes >= endMinutes) {
      return '00:00:00';
    }
    
    const remainingMinutes = endMinutes - currentMinutes;
    const hours = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    const secs = 59 - now.getSeconds();
    
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // 数字跳动动画
  function animateValue(element, start, end, duration = 500) {
    const token = {};
    element._animToken = token; // 新动画开始时，旧动画自动停下，避免多个动画抢着改数字
    // 差距不到 5 分钱时直接显示目标值：每 100ms 就会重启一次动画、播不到终点，逐帧四舍五入后会卡在差一两分钱的位置
    if (Math.abs(end - start) < 0.05) {
      element.textContent = `¥${end.toFixed(2)}`;
      return;
    }
    let startTimestamp = null;
    const step = (timestamp) => {
      if (element._animToken !== token) return;
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      element.textContent = `¥${(progress * (end - start) + start).toFixed(2)}`;
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        element.textContent = `¥${end.toFixed(2)}`;
      }
    };
    window.requestAnimationFrame(step);
  }

  // 添加金钱增长特效（独立的特效系统，根据工作进度动态调整）
  let effectCount = 0;
  const maxEffects = 3; // 限制同时显示的特效数量
  let lastEffectTime = 0; // 上次显示特效的时间
  const minEffectInterval = 500; // 基础特效间隔（毫秒）
  
  // 计算工作进度和对应的情绪状态
  function getWorkMoodState(progressPercent) {
    // 如果已下班（进度>=100%），返回平静状态，避免过度兴奋的特效
    if (progressPercent >= 100) {
      return {
        mood: 'afterwork',
        name: '下班平静',
        description: '工作已完成，心情平复',
        effectMultiplier: 0.2,
        animationSpeed: 0.7,
        colors: ['#4fd4d1', '#7fb3d3'],
        intervalMultiplier: 3.0
      };
    } else if (progressPercent < 20) {
      return {
        mood: 'calm',
        name: '上班初期',
        description: '刚到公司，心情平静',
        effectMultiplier: 0.3, // 特效概率降低
        animationSpeed: 0.8, // 动画速度慢
        colors: ['#3ec6c1', '#4fd4d1'], // 冷色调
        intervalMultiplier: 2.0 // 特效间隔增加
      };
    } else if (progressPercent < 40) {
      return {
        mood: 'focused',
        name: '专注工作',
        description: '进入工作状态',
        effectMultiplier: 0.5,
        animationSpeed: 0.9,
        colors: ['#3ec6c1', '#5dd5d6'],
        intervalMultiplier: 1.5
      };
    } else if (progressPercent < 60) {
      return {
        mood: 'steady',
        name: '稳定推进',
        description: '工作节奏稳定',
        effectMultiplier: 0.7,
        animationSpeed: 1.0,
        colors: ['#3ec6c1', '#6bd7db'],
        intervalMultiplier: 1.2
      };
    } else if (progressPercent < 80) {
      return {
        mood: 'excited',
        name: '即将胜利',
        description: '距离下班不远了！',
        effectMultiplier: 1.2,
        animationSpeed: 1.2,
        colors: ['#3ec6c1', '#ffb86c', '#ff9f43'],
        intervalMultiplier: 0.8
      };
    } else if (progressPercent < 95) {
      return {
        mood: 'euphoric',
        name: '下班冲刺',
        description: '马上就要下班啦！',
        effectMultiplier: 2.0,
        animationSpeed: 1.5,
        colors: ['#e09a00', '#f2a900', '#d48806', '#3ec6c1'],
        intervalMultiplier: 0.5
      };
    } else {
      return {
        mood: 'explosive',
        name: '终极爆发',
        description: '最后几分钟！！！',
        effectMultiplier: 5.0,
        animationSpeed: 2.0,
        colors: ['#e09a00', '#f2a900', '#d48806', '#ffb300'],
        intervalMultiplier: 0.2
      };
    }
  }
  
  function addMoneyEffect(incomeIncrease, progressPercent = 0) {
    const now = Date.now();
    const moodState = getWorkMoodState(progressPercent);
    
    // 根据心情状态调整特效间隔
    const dynamicInterval = minEffectInterval * moodState.intervalMultiplier;
    if (now - lastEffectTime < dynamicInterval) return;
    
    // 根据心情状态调整最大同时特效数量
    let dynamicMaxEffects = maxEffects;
    if (moodState.mood === 'excited') {
      dynamicMaxEffects = 5; // 即将胜利阶段允许5个
    } else if (moodState.mood === 'euphoric') {
      dynamicMaxEffects = 8; // 下班冲刺阶段允许8个
    } else if (moodState.mood === 'explosive') {
      dynamicMaxEffects = 8; // 终极爆发阶段从15个降低到8个，减少性能消耗
    }
    
    if (effectCount >= dynamicMaxEffects) return;
    
    const container = document.querySelector('.income-box');
    const effect = document.createElement('div');
    effect.className = 'money-effect';
    
    // 根据收入增长显示不同的特效文字
    const increment = incomeIncrease || 0.01;
    effect.textContent = `+¥${increment.toFixed(2)}`;
    
    // 根据心情状态和金额调整特效样式
    const baseFontSize = Math.min(1.2, 0.8 + (increment * 2));
    const fontSize = baseFontSize * (1 + (moodState.animationSpeed - 1) * 0.3);
    
    // 根据心情状态选择颜色
    const colorIndex = Math.floor(Math.random() * moodState.colors.length);
    const color = moodState.colors[colorIndex];
    
    // 根据心情状态调整动画时长
    const animationDuration = 1.5 / moodState.animationSpeed;
    
    // 根据心情状态选择动画和特殊效果
    let extraTransform = '';
    let animationName = 'moneyRise'; // 默认
    
    switch (moodState.mood) {
      case 'calm':
        animationName = 'moneyRiseCalm';
        break;
      case 'afterwork':
        animationName = 'moneyRiseCalm'; // 使用平静的动画
        break;
      case 'focused':
        animationName = 'moneyRiseFocused';
        break;
      case 'steady':
        animationName = 'moneyRise';
        break;
      case 'excited':
        animationName = 'moneyRise';
        extraTransform = `scale(${0.9 + Math.random() * 0.3})`;
        break;
      case 'euphoric':
        animationName = 'moneyRiseEuphoric';
        extraTransform = `scale(${1 + Math.random() * 0.5})`;
        break;
      case 'explosive':
        animationName = 'moneyRiseExplosive';
        extraTransform = `scale(${0.5 + Math.random() * 1.5})`;
        break;
    }
    
    const effectLeft = Math.random() * 180 + 60;
    const effectTop = 40 + Math.random() * 20;
    effect.style.cssText = `
      position: absolute;
      color: ${color};
      font-weight: bold;
      font-size: ${fontSize}em;
      pointer-events: none;
      animation: ${animationName} ${animationDuration}s ease-out forwards;
      left: ${effectLeft}px;
      top: ${effectTop}px;
      z-index: 1000;
      text-shadow: 0 0 ${8 * moodState.animationSpeed}px ${color}66;
      transform: ${extraTransform};
    `;

    container.style.position = 'relative';
    container.appendChild(effect);
    effectCount++;
    lastEffectTime = now;

    // 同时弹出一枚金币飞进钱袋
    const boxRect = container.getBoundingClientRect();
    HappyFx.tickCoin(boxRect.left + effectLeft + 16, boxRect.top + effectTop + 10);
    
    // 根据心情状态调整清理时间
    let cleanupTime = animationDuration * 1000;
    
    // 后期阶段特效持续更久
    if (moodState.mood === 'excited') {
      cleanupTime *= 1.2; // 延长20%
    } else if (moodState.mood === 'euphoric') {
      cleanupTime *= 1.5; // 延长50%
    } else if (moodState.mood === 'explosive') {
      cleanupTime *= 2.0; // 延长100%
    }
    
    setTimeout(() => {
      if (effect.parentNode) {
        effect.parentNode.removeChild(effect);
      }
      effectCount--;
    }, cleanupTime);
  }

  // 核心：更新收入和UI
  async function updateIncomeEnhanced() {
    // 从 sync 存储中获取收入设置
    let { incomeSettings } = await chrome.storage.sync.get('incomeSettings');
    // 为了方便，后续统一使用 settings 变量
    const settings = incomeSettings;

    if (!workState) {
        // 如果状态还未初始化，则不执行任何操作
        return;
    }

    if (!settings || !settings.salary) {
      incomeValue.textContent = '请设置收入';
      todayValue.textContent = '¥0.00';
      incomeDesc.textContent = '请先设置收入信息';
      progressBar.style.width = '0%';
      incomePercent.textContent = '0%';
      countdown.textContent = '00:00:00';
      return;
    }

    const today = new Date().toLocaleDateString();
    if (workState.date !== today) {
      // 如果日期变化（例如跨天），重新初始化
      await initializeWorkState();
      return;
    }
    
    // 使用 settings 对象中正确的、扁平化的属性结构
    const baseMonthlyIncome = parseFloat(settings.salary);
    const annualBonus = settings.bonus ? parseFloat(settings.bonus) : 0;
    const monthlyIncome = baseMonthlyIncome + (annualBonus / 12);
    const workDays = settings.workDays || [1, 2, 3, 4, 5];
    const workStart = settings.workStart || '09:00';
    const workEnd = settings.workEnd || '18:00';
    const breaks = settings.breaks || [];
    const overtimeSettings = settings.overtimeSettings || {};
    const zenMode = settings.zenMode || false;
    const valueItem = settings.valueItem || 'chicken';
    const customItemName = settings.customItemName || '自定义';
    const customItemPrice = settings.customItemPrice || 999;


    const todayWorkInfo = getTodayWorkType(workDays, overtimeSettings);
    // 加班状态以 workState 为准，且只在开启了下班后加班的工作日生效（避免关掉设置后按钮隐藏、状态却关不掉）
    const isOvertimeActive = workState.overtimeActive === true && todayWorkInfo.afterWorkMultiplier !== undefined;
    const isCurrentlyWorkingCheck = isCurrentlyInWorkTime(workStart, workEnd, breaks, isOvertimeActive);

    if (todayWorkInfo.type === 'off' && !isCurrentlyWorkingCheck) {
      incomeValue.textContent = "休息日";
      progressBar.style.width = '0%';
      incomePercent.textContent = '0%';
      todayValue.textContent = '¥0.00';
      incomeDesc.textContent = '今天是休息日，好好放松吧！';
      countdownLabel.textContent = '今天是休息日';
      countdown.textContent = '好好放松吧';
      return;
    }
    
    // 计算总工作秒数
    const dailyWorkMinutes = calculateWorkMinutes(workStart, workEnd, breaks);
    const dailyWorkSeconds = dailyWorkMinutes * 60;

    // 计算每秒收入
    const { totalWorkDays, totalOvertimeDays } = getMonthlyWorkDays(workDays, overtimeSettings);
    const totalEquivalentWorkDays = totalWorkDays + totalOvertimeDays;
    const dailyIncome = totalEquivalentWorkDays > 0 ? monthlyIncome / totalEquivalentWorkDays : 0;
    const incomePerSecond = dailyWorkSeconds > 0 ? dailyIncome / dailyWorkSeconds : 0;
    
    // 获取当前已工作秒数
    const { normalSeconds, afterWorkSeconds } = getWorkedSeconds(workStart, workEnd, breaks, isOvertimeActive);

    // 更新加班按钮显示状态（工作日、已下班、开启了下班后加班时才显示）
    updateOvertimeButtonVisibility(todayWorkInfo, normalSeconds, dailyWorkSeconds);

    // 计算准确的基础收入
    let currentBaseIncome = normalSeconds * incomePerSecond * todayWorkInfo.multiplier;
    if (afterWorkSeconds > 0 && todayWorkInfo.afterWorkMultiplier) {
      currentBaseIncome += afterWorkSeconds * incomePerSecond * todayWorkInfo.afterWorkMultiplier;
    }

    // 平滑更新显示收入
    const now = Date.now();
    lastUpdateTime = now;
    
    // 如果弹窗是重新打开，displayIncome 需要被设置为当前实际收入，以避免从0开始跳动
    if (displayIncome < currentBaseIncome) {
        displayIncome = currentBaseIncome;
    }

    // 更新UI - 实时收入
    displayIncome = currentBaseIncome;
    const previousDisplayIncome = parseFloat(incomeValue.textContent.replace('¥', '')) || displayIncome;
    if (now >= introHoldUntil) {
      animateValue(incomeValue, previousDisplayIncome, displayIncome, 500);
    }
    
    const progressPercent = dailyWorkSeconds > 0 ? (normalSeconds / dailyWorkSeconds) * 100 : 0;
    progressBar.style.width = `${Math.min(100, progressPercent)}%`;
    incomePercent.textContent = `${Math.min(100, progressPercent).toFixed(0)}%`;
    
    // 更新UI - 今日收入
    const targetDailyIncome = dailyIncome * todayWorkInfo.multiplier;
    const hasCompletedWork = progressPercent >= 100;

    const todayIncomeLabel = hasCompletedWork ? '今日实收' : '今日到手';
    const todayDisplayIncome = hasCompletedWork ? currentBaseIncome : targetDailyIncome;
    document.querySelector('.today-label').textContent = todayIncomeLabel;
    todayValue.textContent = `¥${Math.round(todayDisplayIncome)}`;

    // 更新UI - 价值描述
    const item = valueItem === 'custom'
      ? { price: parseFloat(customItemPrice), unit: `个${customItemName}`, icon: '🎁' }
      : VALUE_ITEMS[valueItem];
    const itemCount = item ? Math.floor(currentBaseIncome / item.price) : 0;
    incomeDesc.textContent = item ? `约等于 ${itemCount} ${item.unit}` : '';


    // 更新UI - 倒计时
    const countdownText = getCountdown(workEnd);
    if (progressPercent >= 100 && !isOvertimeActive) {
        countdownLabel.textContent = '今日工作已完成';
        countdown.textContent = '下班快乐！';
    } else if (isOvertimeActive) {
        countdownLabel.textContent = '已下班，正在加班';
        const afterWorkHours = Math.floor(afterWorkSeconds / 3600);
        const afterWorkMins = Math.floor((afterWorkSeconds % 3600) / 60);
        countdown.textContent = `+${afterWorkHours.toString().padStart(2, '0')}:${afterWorkMins.toString().padStart(2, '0')}`;
    } else {
        countdownLabel.textContent = '距离下班';
        countdown.textContent = countdownText;
    }
    
    // 其他UI更新
    const mood = updateMoodDisplay(progressPercent, afterWorkSeconds > 0, zenMode);
    updateAmbientFx(currentBaseIncome, targetDailyIncome, progressPercent, zenMode, mood, item, itemCount);

    const incomeIncreaseSinceLastTick = currentBaseIncome - (workState.baseIncome || 0);
    if (incomeIncreaseSinceLastTick > 0.001 && !zenMode && isCurrentlyWorkingCheck && Date.now() >= introHoldUntil) {
        const moodState = getWorkMoodState(progressPercent);
        
        // 基础概率计算（根据金额大小）
        let baseProbability = 0;
        if (incomeIncreaseSinceLastTick >= 0.5) {
          baseProbability = 0.3;
        } else if (incomeIncreaseSinceLastTick >= 0.1) {
          baseProbability = 0.15;
        } else if (incomeIncreaseSinceLastTick >= 0.05) {
          baseProbability = 0.08;
        } else if (incomeIncreaseSinceLastTick >= 0.01) {
          baseProbability = 0.04;
        } else {
          baseProbability = 0.01;
        }
        
        // 根据心情状态调整特效概率
        let finalProbability = baseProbability * moodState.effectMultiplier;
        
        // 为不同心情阶段添加额外的触发机制
        if (moodState.mood === 'excited') {
          finalProbability += 0.3;
        } else if (moodState.mood === 'euphoric') {
          finalProbability += 0.5;
        } else if (moodState.mood === 'explosive') {
          finalProbability += 0.8;
          if (Math.random() < 0.3) {
            setTimeout(() => addMoneyEffect(incomeIncreaseSinceLastTick * 0.5, progressPercent), 100);
          }
          if (Math.random() < 0.2) {
            setTimeout(() => addMoneyEffect(incomeIncreaseSinceLastTick * 0.3, progressPercent), 200);
          }
        }
        
        finalProbability = Math.min(finalProbability, 1);
        
        if (Math.random() < finalProbability) {
          addMoneyEffect(incomeIncreaseSinceLastTick, progressPercent);
        }
    }
    
    // 实时更新内存中的状态，用于下一次计算
    workState.baseIncome = currentBaseIncome;
    workState.lastUpdateTime = now;

    // 节流：每5秒才将内存中的状态保存到硬盘
    if (now - lastSaveTime > 5000) {
        await chrome.storage.local.set({ workState });
        // 同时写入 sync 兼容旧版
        await chrome.storage.sync.set({ workState });
        lastSaveTime = now;
    }
  }

  // 氛围特效：财宝堆随收入升级、星星密度、开场数钱、金笔打勾、进度里程碑
  function updateAmbientFx(currentBaseIncome, dailyGoal, progressPercent, zenMode, mood, item, itemCount) {
    HappyFx.setEnabled(!zenMode);
    HappyFx.setMood(mood);

    const hasItem = item && item.price > 0;
    const itemKey = hasItem ? `${item.unit}@${item.price}` : '';

    if (!introDone) {
      // 弹窗打开后第一次算出收入：把离开期间赚的钱演一遍
      introDone = true;
      const gained = currentBaseIncome - introSnapshot.baseIncome;
      const awayMs = Date.now() - introSnapshot.lastUpdateTime;
      if (!zenMode && gained >= 0.5 && (introSnapshot.isNewDay || awayMs >= 60000)) {
        introHoldUntil = Date.now() + 1400;
        animateValue(incomeValue, introSnapshot.baseIncome, currentBaseIncome, 1300);
        HappyFx.playIntro({
          from: introSnapshot.baseIncome,
          to: currentBaseIncome,
          awayMs,
          isNewDay: introSnapshot.isNewDay,
          goal: dailyGoal
        });
        const gainedItems = hasItem ? itemCount - Math.floor(introSnapshot.baseIncome / item.price) : 0;
        if (gainedItems > 0) {
          HappyFx.penCheck(gainedItems, item.icon);
        }
      }
    } else if (itemKey === lastItemKey && itemCount > lastItemCount && !zenMode) {
      HappyFx.penCheck(itemCount - lastItemCount, item.icon);
    }
    lastItemKey = itemKey;
    lastItemCount = itemCount;

    HappyFx.setIncome(currentBaseIncome, dailyGoal);
    if (!zenMode) {
      checkMilestones(progressPercent);
    }
  }

  // 进度里程碑：每天每档只庆祝一次；一次跨过多档时只放最高那档
  function checkMilestones(progressPercent) {
    const today = new Date().toLocaleDateString();
    if (!fxState || fxState.date !== today) {
      fxState = { date: today, celebrated: [] };
    }
    const reached = MILESTONES.filter(m => progressPercent >= m && !fxState.celebrated.includes(m));
    if (reached.length === 0) return;
    fxState.celebrated.push(...reached);
    chrome.storage.local.set({ fxState });
    HappyFx.milestone(reached[reached.length - 1]);
  }
  
  function updateOvertimeButtonVisibility(todayWorkInfo, normalSeconds, dailyWorkSeconds) {
    if (!overtimeBtn) return;
    
    const overtimeBox = document.querySelector('.overtime-box');
    if (!overtimeBox) return;
    
    // 检查是否为工作日
    const isWorkDay = todayWorkInfo.type === 'normal';
    // 检查是否已过下班时间
    const isAfterWork = normalSeconds >= dailyWorkSeconds;
    // 检查是否启用了下班后加班设置
    const hasAfterWorkSetting = todayWorkInfo.afterWorkMultiplier !== undefined;
    
    if (isWorkDay && isAfterWork && hasAfterWorkSetting) {
      overtimeBox.style.display = 'block';
    } else {
      overtimeBox.style.display = 'none';
    }
  }

  function updateMoodDisplay(progressPercent, isInAfterWorkOvertime = false, isZenMode = false) {
    let moodState;
    
    // 如果在下班后加班状态，强制使用"心如止水"状态
    if (isInAfterWorkOvertime) {
      moodState = {
        mood: 'calm',
        name: '心如止水',
        description: '加班中，保持平静',
        effectMultiplier: 0.3,
        animationSpeed: 0.8,
        colors: ['#3ec6c1', '#4fd4d1'],
        intervalMultiplier: 2.0
      };
    } else if (progressPercent >= 100) {
      // 如果已经下班（进度>=100%）且不是加班状态，使用"下班安逸"状态
      moodState = {
        mood: 'afterwork',
        name: '下班安逸',
        description: '今日工作已完成，心情逐渐平复',
        effectMultiplier: 0.2, // 特效概率很低
        animationSpeed: 0.7,   // 动画速度较慢
        colors: ['#4fd4d1', '#7fb3d3'], // 温和的蓝绿色
        intervalMultiplier: 3.0 // 特效间隔很长
      };
    } else {
      moodState = getWorkMoodState(progressPercent);
    }
    const todayBox = document.getElementById('todayBox');
    const incomeValue = document.getElementById('incomeValue');
    
    // 将心情状态效果应用到"今日到手"栏目
    if (todayBox) {
      // 移除之前的心情class
      todayBox.className = 'today-box';
      // 添加当前心情class
      todayBox.classList.add(moodState.mood);
    }
    
    // 根据心情状态调整收入数字、今日到手数字和进度条的显示效果
    if (incomeValue) {
      incomeValue.className = 'income-value';
      // 下班安逸状态不应用鬼畜色彩效果
      if (moodState.mood === 'excited' || moodState.mood === 'euphoric' || moodState.mood === 'explosive') {
        incomeValue.classList.add(moodState.mood);
      }
    }
    
    const todayValue = document.getElementById('todayValue');
    if (todayValue) {
      todayValue.className = 'today-value';
      // 下班安逸状态不应用鬼畜色彩效果
      if (moodState.mood === 'excited' || moodState.mood === 'euphoric' || moodState.mood === 'explosive') {
        todayValue.classList.add(moodState.mood);
      }
    }
    
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
      progressBar.className = 'progress-bar';
      // 为所有心情状态添加对应的class
      progressBar.classList.add(moodState.mood);
    }
    
    // 应用佛系模式样式
    const container = document.querySelector('.container');
    if (container) {
      if (isZenMode) {
        container.classList.add('zen-mode');
      } else {
        container.classList.remove('zen-mode');
      }
    }

    return moodState.mood;
  }
  
  // 启动更新循环
  function startUpdateLoop() {
    if (currentRefreshInterval) {
      clearInterval(currentRefreshInterval);
    }
    updateIncomeEnhanced(); // 立即执行一次
    currentRefreshInterval = setInterval(updateIncomeEnhanced, 100); // 然后每100ms更新
  }

  // 更新加班按钮状态
  function updateOvertimeButton(isActive) {
    if (!overtimeBtn) return;
    
    if (isActive) {
      overtimeBtn.textContent = '💰加班中...';
      overtimeBtn.classList.add('active');
    } else {
      overtimeBtn.textContent = '😭我在加班';
      overtimeBtn.classList.remove('active');
    }
  }

  // 加班按钮点击事件：切换下班后加班状态，并立即保存（只在当天有效）
  if (overtimeBtn) {
    overtimeBtn.addEventListener('click', async function () {
      if (!workState) return;

      workState.overtimeActive = !workState.overtimeActive;
      updateOvertimeButton(workState.overtimeActive);

      // 不等 5 秒节流，立即保存，避免马上关闭弹窗后状态丢失
      await chrome.storage.local.set({ workState });
      await chrome.storage.sync.set({ workState });
      lastSaveTime = Date.now();

      // 立即更新收入显示，让加班费和心情状态马上生效
      updateIncomeEnhanced();
    });
  }

  // 初始化
  initializeWorkState();
});
