document.addEventListener('DOMContentLoaded', function () {
  const incomeValue = document.getElementById('incomeValue');
  const progressBar = document.getElementById('progressBar');
  const incomeDesc = document.getElementById('incomeDesc');
  const incomePercent = document.getElementById('incomePercent');
  const todayValue = document.getElementById('todayValue');
  const countdown = document.getElementById('countdown');
  const setIncomeBtn = document.getElementById('setIncomeBtn');


  let lastIncome = 0;
  let currentRefreshInterval = null;
  let baseIncome = 0; // 基础收入（按秒计算的准确值）
  let displayIncome = 0; // 显示用的收入（平滑增长）
  let lastUpdateTime = Date.now(); // 上次更新时间
  let lastSaveTime = 0; // 上次保存显示收入的时间

  // 点击设置按钮跳转到设置页面
  setIncomeBtn.onclick = function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/settings.html') });
  };



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

  // 计算当前时间已工作的秒数（更精确）
  function getWorkedSeconds(workStart, workEnd, breaks) {
    const now = new Date();
    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const startSeconds = timeToSeconds(workStart);
    const endSeconds = timeToSeconds(workEnd);
    
    if (currentSeconds < startSeconds || currentSeconds > endSeconds) {
      return 0; // 不在工作时间内
    }
    
    let workedSeconds = currentSeconds - startSeconds;
    
    // 减去已过的休息时间
    breaks.forEach(breakTime => {
      const breakStart = timeToSeconds(breakTime.start);
      const breakEnd = timeToSeconds(breakTime.end);
      
      if (currentSeconds > breakEnd) {
        // 完全过了这个休息时间
        workedSeconds -= (breakEnd - breakStart);
      } else if (currentSeconds > breakStart) {
        // 正在休息中
        workedSeconds -= (currentSeconds - breakStart);
      }
    });
    
    return Math.max(0, workedSeconds);
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
      
      if (workDays.includes(dayOfWeek)) {
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
    
    // 节假日加班
    if (overtimeSettings.holiday?.enabled && isHoliday(today)) {
      return { type: 'holiday', multiplier: parseFloat(overtimeSettings.holiday.multiplier || 3) };
    }
    
    // 普通休息日加班
    if (overtimeSettings.weekend?.enabled && 
        !isWorkDay && 
        !isHoliday(today) &&
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
    const startTime = performance.now();
    const startVal = parseFloat(start) || 0;
    const endVal = parseFloat(end) || 0;
    const diff = endVal - startVal;
    
    function updateValue(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // 使用缓动函数让动画更自然
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentVal = startVal + (diff * easeOut);
      
      // 获取币种符号
      const currency = element.textContent.charAt(0);
      element.textContent = `${currency}${currentVal.toFixed(2)}`;
      
      if (progress < 1) {
        requestAnimationFrame(updateValue);
      }
    }
    
    requestAnimationFrame(updateValue);
  }

  // 添加金钱增长特效（独立的特效系统）
  let effectCount = 0;
  const maxEffects = 3; // 限制同时显示的特效数量
  let lastEffectTime = 0; // 上次显示特效的时间
  const minEffectInterval = 50; // 最小特效间隔（毫秒）- 增加到1秒避免过于频繁
  
  function addMoneyEffect(incomeIncrease) {
    const now = Date.now();
    
    // 控制特效显示频率，避免过于频繁
    if (now - lastEffectTime < minEffectInterval) return;
    if (effectCount >= maxEffects) return;
    
    const container = document.querySelector('.income-box');
    const effect = document.createElement('div');
    effect.className = 'money-effect';
    
    // 根据收入增长显示不同的特效文字
    const increment = incomeIncrease || 0.01;
    effect.textContent = `+¥${increment.toFixed(2)}`;
    
    // 根据增长金额调整特效样式
    const fontSize = Math.min(1.2, 0.8 + (increment * 2)); // 金额越大字体越大
    const color = increment > 0.5 ? '#ff6b6b' : '#3ec6c1'; // 大金额用红色
    
    effect.style.cssText = `
      position: absolute;
      color: ${color};
      font-weight: bold;
      font-size: ${fontSize}em;
      pointer-events: none;
      animation: moneyRise 1.5s ease-out forwards;
      left: ${Math.random() * 180 + 60}px;
      top: ${40 + Math.random() * 20}px;
      z-index: 1000;
      text-shadow: 0 0 8px rgba(62,198,193,0.6);
    `;
    
    container.style.position = 'relative';
    container.appendChild(effect);
    effectCount++;
    lastEffectTime = now;
    
    setTimeout(() => {
      if (effect.parentNode) {
        effect.parentNode.removeChild(effect);
      }
      effectCount--;
    }, 1500);
  }

  // 更新收入显示（增强版）
  // 注意：这个函数处理两个独立的系统：
  // 1. 实时收入显示（¥xxxxx）- 严格按用户设置的刷新频率更新
  // 2. 金钱特效（+¥xx.xx）- 有独立的智能显示逻辑，不完全依赖刷新频率
  function updateIncomeEnhanced() {
    chrome.storage.sync.get(['incomeSettings', 'displayIncomeState'], function (result) {
      const settings = result.incomeSettings;
      
      if (!settings || !settings.salary) {
        incomeValue.textContent = '¥0.00';
        todayValue.textContent = '¥0.00';
        incomeDesc.textContent = '请先设置收入信息';
        progressBar.style.width = '0%';
        incomePercent.textContent = '0%';
        countdown.textContent = '00:00:00';
        return;
      }

      const monthlySalary = parseFloat(settings.salary);
      const workDays = settings.workDays || [1, 2, 3, 4, 5]; // 默认周一到周五
      const overtimeSettings = settings.overtimeSettings || {};
      const workStart = settings.workStart || '09:00';
      const workEnd = settings.workEnd || '18:00';
      const breaks = settings.breaks || [];
      
      // 计算当月实际工作天数
      const { totalWorkDays, totalOvertimeDays } = getMonthlyWorkDays(workDays, overtimeSettings);
      
      // 计算每日工作时长
      const dailyWorkMinutes = calculateWorkMinutes(workStart, workEnd, breaks);
      const dailyWorkSeconds = dailyWorkMinutes * 60;
      const dailyWorkHours = dailyWorkMinutes / 60;
      
      // 计算日薪和时薪
      const totalEffectiveWorkDays = totalWorkDays + totalOvertimeDays;
      const dailySalary = monthlySalary / totalEffectiveWorkDays;
      
      // 判断今天是什么类型的日子
      const todayWorkInfo = getTodayWorkType(workDays, overtimeSettings);
      const todayMultiplier = todayWorkInfo.multiplier;
      
      const todayHourlyRate = (dailySalary * todayMultiplier) / dailyWorkHours;
      const todaySecondRate = todayHourlyRate / 3600; // 今日每秒收入
      
      // 计算当前已工作时长（秒级精度）
      const workedSeconds = getWorkedSeconds(workStart, workEnd, breaks);
      const currentIncome = workedSeconds * todaySecondRate;
      

      
      // 计算进度百分比
      const progressPercent = Math.min(100, (workedSeconds / dailyWorkSeconds) * 100);
      
      // 更新显示 - 创建平滑连续的收入增长效果
      const currency = settings.displayCurrency === 'USD' ? '$' : 
                     settings.displayCurrency === 'EUR' ? '€' : '¥';
      
      const now = Date.now();
      const timeDelta = (now - lastUpdateTime) / 1000; // 时间差（秒）
      
      // 从存储中恢复显示收入状态
      const displayState = result.displayIncomeState;
      const todayStr = new Date().toDateString();
      
             if (displayState && displayState.date === todayStr && displayState.income > 0) {
        // 如果是同一天的数据且有效，使用保存的显示收入
        if (displayIncome === 0) {
          displayIncome = Math.min(displayState.income, currentIncome);
        }
      } else {
        // 新的一天或没有保存数据，重新开始
        displayIncome = currentIncome;
      }
      
      // 如果在工作时间内，让显示收入平滑增长
      if (workedSeconds > 0 && todaySecondRate > 0) {
        // 计算这段时间应该增加的收入
        const incomeIncrease = todaySecondRate * timeDelta;
        displayIncome += incomeIncrease;
        
        // 确保显示收入不超过实际计算的收入
        if (displayIncome > currentIncome) {
          displayIncome = currentIncome;
        }
        
        // 更新显示
        incomeValue.textContent = `${currency}${displayIncome.toFixed(2)}`;
        
        // 添加金钱特效（独立于实时收入更新频率）
        if (incomeIncrease > 0.01) {
          // 金钱特效有自己的智能显示逻辑
          let effectProbability = 0;
          
          if (incomeIncrease >= 0.5) {
            effectProbability = 0.2;
          } else if (incomeIncrease >= 0.1) {
            effectProbability = 0.1;
          } else if (incomeIncrease >= 0.05) {
            effectProbability = 0.05;
          } else {
            effectProbability = 0.01;
          }
          
          if (Math.random() < effectProbability) {
            addMoneyEffect(incomeIncrease);
          }
        }
      } else {
        // 不在工作时间或没有收入，直接显示计算值
        displayIncome = currentIncome;
        incomeValue.textContent = `${currency}${currentIncome.toFixed(2)}`;
      }
      
             lastUpdateTime = now;
       
       // 每5秒保存一次显示收入状态到存储，避免过于频繁
       if (now - lastSaveTime > 5000) {
         chrome.storage.sync.set({
           displayIncomeState: {
             date: todayStr,
             income: displayIncome,
             timestamp: now
           }
         });
         lastSaveTime = now;
       }
       
       // 进度条平滑更新
       progressBar.style.transition = 'width 0.1s linear';
       
       lastIncome = currentIncome;
      
      // 显示今日预期收入（考虑加班倍数）
      const todayExpectedIncome = dailySalary * todayMultiplier;
      todayValue.textContent = `${currency}${todayExpectedIncome.toFixed(0)}`;
      progressBar.style.width = `${progressPercent}%`;
      incomePercent.textContent = `${Math.round(progressPercent)}%`;
      
      // 根据用户设置的价值衡量计算
      let valueText = '';
      const valueItem = settings.valueItem || 'burger';
      
      if (valueItem === 'cola') {
        const count = Math.floor(currentIncome / 3);
        valueText = `约等于 ${count} 瓶可乐`;
      } else if (valueItem === 'chicken') {
        const count = Math.floor(currentIncome / 14);
        valueText = `约等于 ${count} 个辣翅`;
      } else if (valueItem === 'burger') {
        const count = Math.floor(currentIncome / 28);
        valueText = `约等于 ${count} 个巨无霸`;
      } else if (valueItem === 'custom' && settings.customItemName && settings.customItemPrice) {
        const count = Math.floor(currentIncome / parseFloat(settings.customItemPrice));
        valueText = `约等于 ${count} 个${settings.customItemName}`;
      } else {
        // 默认显示
        const count = Math.floor(currentIncome / 28);
        valueText = `约等于 ${count} 个巨无霸`;
      }
      
      // 根据工作类型显示不同提示
      if (todayWorkInfo.type === 'off') {
        incomeDesc.textContent = '今天是休息日，好好放松吧！';
      } else if (todayWorkInfo.type === 'holiday') {
        incomeDesc.textContent = `节假日加班 (${todayMultiplier}倍薪资) ${valueText}`;
      } else if (todayWorkInfo.type === 'weekend') {
        incomeDesc.textContent = `休息日加班 (${todayMultiplier}倍薪资) ${valueText}`;
      } else if (todayWorkInfo.afterWorkMultiplier) {
        incomeDesc.textContent = `工作日 (下班后${todayWorkInfo.afterWorkMultiplier}倍薪资) ${valueText}`;
      } else {
        incomeDesc.textContent = valueText;
      }
      
      // 更新倒计时
      countdown.textContent = getCountdown(workEnd);
    });
  }

  // 启动更新循环，固定快速刷新让收入持续变化
  function startUpdateLoop() {
    // 清除之前的定时器
    if (currentRefreshInterval) {
      clearInterval(currentRefreshInterval);
    }
    
    // 设置固定的快速刷新间隔（100ms，每秒10次更新，平衡性能和流畅度）
    currentRefreshInterval = setInterval(updateIncomeEnhanced, 100);
  }

  // 初始加载
  updateIncomeEnhanced();
  startUpdateLoop();
});
