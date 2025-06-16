document.addEventListener('DOMContentLoaded', function () {
  const incomeValue = document.getElementById('incomeValue');
  const progressBar = document.getElementById('progressBar');
  const incomeDesc = document.getElementById('incomeDesc');
  const incomePercent = document.getElementById('incomePercent');
  const todayValue = document.getElementById('todayValue');
  const countdown = document.getElementById('countdown');
  const setIncomeBtn = document.getElementById('setIncomeBtn');
  const overtimeBtn = document.getElementById('overtimeBtn');


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

  // 添加金钱增长特效（独立的特效系统，根据工作进度动态调整）
  let effectCount = 0;
  const maxEffects = 3; // 限制同时显示的特效数量
  let lastEffectTime = 0; // 上次显示特效的时间
  const minEffectInterval = 500; // 基础特效间隔（毫秒）
  
  // 计算工作进度和对应的情绪状态
  function getWorkMoodState(progressPercent) {
    if (progressPercent < 20) {
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
        colors: ['#ff6b6b', '#ffa726', '#ffeb3b', '#66bb6a', '#3ec6c1'],
        intervalMultiplier: 0.5
      };
    } else {
      return {
        mood: 'explosive',
        name: '终极爆发',
        description: '最后几分钟！！！',
        effectMultiplier: 5.0,
        animationSpeed: 2.0,
        colors: ['#ff1744', '#ff6d00', '#ffea00', '#76ff03', '#00e5ff', '#d500f9'],
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
    
    effect.style.cssText = `
      position: absolute;
      color: ${color};
      font-weight: bold;
      font-size: ${fontSize}em;
      pointer-events: none;
      animation: ${animationName} ${animationDuration}s ease-out forwards;
      left: ${Math.random() * 180 + 60}px;
      top: ${40 + Math.random() * 20}px;
      z-index: 1000;
      text-shadow: 0 0 ${8 * moodState.animationSpeed}px ${color}66;
      transform: ${extraTransform};
    `;
    
    container.style.position = 'relative';
    container.appendChild(effect);
    effectCount++;
    lastEffectTime = now;
    
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

  // 更新收入显示（增强版）
  // 注意：这个函数处理两个独立的系统：
  // 1. 实时收入显示（¥xxxxx）- 严格按用户设置的刷新频率更新
  // 2. 金钱特效（+¥xx.xx）- 有独立的智能显示逻辑，不完全依赖刷新频率
  function updateIncomeEnhanced() {
    chrome.storage.sync.get(['incomeSettings', 'displayIncomeState', 'isAfterWorkOvertime'], function (result) {
      const settings = result.incomeSettings;
      const isZenMode = settings?.zenMode || false;
      
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
      
      // 检查是否在加班状态
      const isAfterWorkOvertime = result.isAfterWorkOvertime || false;
      
      // 计算当前已工作时长（秒级精度）
      const workData = getWorkedSeconds(workStart, workEnd, breaks, isAfterWorkOvertime);
      const normalSeconds = workData.normalSeconds;
      const afterWorkSeconds = workData.afterWorkSeconds;
      
      // 计算正常工作时间的时薪（不包含加班倍数，因为今日工资不包含下班后加班费）
      const normalHourlyRate = dailySalary / dailyWorkHours;
      const normalSecondRate = normalHourlyRate / 3600;
      
      // 计算正常工作时间的收入
      const normalIncome = normalSeconds * normalSecondRate;
      
      // 计算下班后加班收入（如果有的话）
      let afterWorkIncome = 0;
      if (afterWorkSeconds > 0 && todayWorkInfo.afterWorkMultiplier) {
        const afterWorkHourlyRate = normalHourlyRate * todayWorkInfo.afterWorkMultiplier;
        const afterWorkSecondRate = afterWorkHourlyRate / 3600;
        afterWorkIncome = afterWorkSeconds * afterWorkSecondRate;
      }
      
      const currentIncome = normalIncome + afterWorkIncome;
      const totalWorkedSeconds = normalSeconds + afterWorkSeconds;
      

      // 计算进度百分比（基于正常工作时间，不包括下班后加班）
      const progressPercent = Math.min(100, (normalSeconds / dailyWorkSeconds) * 100);
      
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
      if (totalWorkedSeconds > 0) {
        // 计算这段时间应该增加的收入（综合正常工作和加班）
        let incomeIncrease = 0;
        if (normalSeconds > 0) {
          incomeIncrease += normalSecondRate * timeDelta;
        }
        if (afterWorkSeconds > 0 && todayWorkInfo.afterWorkMultiplier) {
          const afterWorkHourlyRate = normalHourlyRate * todayWorkInfo.afterWorkMultiplier;
          const afterWorkSecondRate = afterWorkHourlyRate / 3600;
          incomeIncrease += afterWorkSecondRate * timeDelta;
        }
        displayIncome += incomeIncrease;
        
        // 确保显示收入不超过实际计算的收入
        if (displayIncome > currentIncome) {
          displayIncome = currentIncome;
        }
        
        // 更新显示
        incomeValue.textContent = `${currency}${displayIncome.toFixed(2)}`;
        
        // 添加金钱特效（根据心情状态智能调整频率和概率，佛系模式下禁用）
        if (incomeIncrease > 0.001 && !isZenMode) { // 佛系模式下不显示特效
          const moodState = getWorkMoodState(progressPercent);
          
          // 基础概率计算（根据金额大小）
          let baseProbability = 0;
          if (incomeIncrease >= 0.5) {
            baseProbability = 0.3;
          } else if (incomeIncrease >= 0.1) {
            baseProbability = 0.15;
          } else if (incomeIncrease >= 0.05) {
            baseProbability = 0.08;
          } else if (incomeIncrease >= 0.01) {
            baseProbability = 0.04;
          } else {
            baseProbability = 0.01; // 很小的金额也有机会
          }
          
          // 根据心情状态调整特效概率
          let finalProbability = baseProbability * moodState.effectMultiplier;
          
          // 为不同心情阶段添加额外的触发机制
          if (moodState.mood === 'excited') {
            // 即将胜利阶段：额外30%概率触发
            finalProbability += 0.3;
          } else if (moodState.mood === 'euphoric') {
            // 下班冲刺阶段：额外50%概率触发
            finalProbability += 0.5;
          } else if (moodState.mood === 'explosive') {
            // 终极爆发阶段：几乎每次都触发，并且有连击效果
            finalProbability += 0.8;
            
            // 终极爆发阶段的连击效果：有30%概率触发额外特效
            if (Math.random() < 0.3) {
              setTimeout(() => {
                addMoneyEffect(incomeIncrease * 0.5, progressPercent);
              }, 100);
            }
            if (Math.random() < 0.2) {
              setTimeout(() => {
                addMoneyEffect(incomeIncrease * 0.3, progressPercent);
              }, 200);
            }
          }
          
          // 确保概率不超过1
          finalProbability = Math.min(finalProbability, 1);
          
          if (Math.random() < finalProbability) {
            addMoneyEffect(incomeIncrease, progressPercent);
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
      
      // 显示今日预期收入（不包含下班后加班费，但包含节假日/休息日加班倍数）
      let todayExpectedIncome = dailySalary;
      if (todayWorkInfo.type === 'holiday' || todayWorkInfo.type === 'weekend') {
        todayExpectedIncome = dailySalary * todayWorkInfo.multiplier;
      }
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
        incomeDesc.textContent = `节假日加班 (${todayWorkInfo.multiplier}倍薪资) ${valueText}`;
      } else if (todayWorkInfo.type === 'weekend') {
        incomeDesc.textContent = `休息日加班 (${todayWorkInfo.multiplier}倍薪资) ${valueText}`;
      } else if (todayWorkInfo.afterWorkMultiplier && afterWorkSeconds > 0) {
        incomeDesc.textContent = `工作日 (下班后${todayWorkInfo.afterWorkMultiplier}倍薪资) ${valueText}`;
      } else {
        incomeDesc.textContent = valueText;
      }
      
      // 更新倒计时
      countdown.textContent = getCountdown(workEnd);
      
      // 更新加班按钮显示状态
      updateOvertimeButtonVisibility(todayWorkInfo, normalSeconds, dailyWorkSeconds);
      
      // 更新心情状态显示（考虑加班状态和佛系模式）
      updateMoodDisplay(progressPercent, isAfterWorkOvertime && afterWorkSeconds > 0, isZenMode);
      
      // 终极爆发阶段的特殊效果（降低频率避免卡顿，佛系模式下禁用）
      if (progressPercent >= 95 && !isZenMode) {
        // 降低金钱雨触发概率，减少性能消耗
        if (Math.random() < 0.02) { // 从0.075降低到0.02
          triggerMoneyRain(progressPercent);
        }
        // 降低宝箱爆炸特效触发概率
        if (Math.random() < 0.015) { // 从0.045降低到0.015
          triggerTreasureExplosion(progressPercent);
        }
      }
    });
    }
  
  // 金钱雨特效（终极爆发阶段专用，优化性能）
  function triggerMoneyRain(progressPercent) {
    const rainCount = 3 + Math.floor(Math.random() * 4); // 减少到3-6个特效
    const baseAmounts = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0];
    
    for (let i = 0; i < rainCount; i++) {
      setTimeout(() => {
        const randomAmount = baseAmounts[Math.floor(Math.random() * baseAmounts.length)];
        addMoneyEffect(randomAmount, progressPercent);
      }, i * 80 + Math.random() * 120); // 增加间隔，减少同时特效数量
    }
  }
  
  // 开宝箱式爆炸特效（终极爆发阶段专用）
  function triggerTreasureExplosion(progressPercent) {
    const container = document.querySelector('.income-box');
    if (!container) return;
    
    // 添加震屏效果
    const mainContainer = document.querySelector('.container');
    if (mainContainer) {
      mainContainer.classList.add('treasure-explosion-container');
      setTimeout(() => {
        mainContainer.classList.remove('treasure-explosion-container');
      }, 500);
    }
    
    // 创建爆炸中心点
    const centerX = container.offsetWidth / 2;
    const centerY = container.offsetHeight / 2;
    
    // 生成8-12个金钱粒子（减少数量提升性能）
    const particleCount = 8 + Math.floor(Math.random() * 5);
    const amounts = [0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0];
    const symbols = ['¥', '$', '€', '💰', '💎', '✨', '⭐', '🎉', '🎊', '💸'];
    
    // 添加爆炸闪光效果
    const flash = document.createElement('div');
    flash.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,215,0,0.4) 30%, transparent 70%);
      pointer-events: none;
      z-index: 1000;
      animation: treasureFlash 0.3s ease-out forwards;
    `;
    container.appendChild(flash);
    setTimeout(() => {
      if (flash.parentNode) {
        flash.parentNode.removeChild(flash);
      }
    }, 300);
    
    for (let i = 0; i < particleCount; i++) {
      setTimeout(() => {
        const particle = document.createElement('div');
        particle.className = 'treasure-particle';
        
        // 随机选择内容和颜色
        const isSymbol = Math.random() < 0.3; // 30%概率显示符号
        if (isSymbol) {
          particle.textContent = symbols[Math.floor(Math.random() * symbols.length)];
        } else {
          const amount = amounts[Math.floor(Math.random() * amounts.length)];
          particle.textContent = `+¥${amount.toFixed(1)}`;
        }
        
        // 计算爆炸方向（360度随机分布）
        const angle = (360 / particleCount) * i + Math.random() * 30 - 15; // 每个粒子有小范围随机偏移
        const distance = 80 + Math.random() * 120; // 爆炸距离
        const endX = centerX + Math.cos(angle * Math.PI / 180) * distance;
        const endY = centerY + Math.sin(angle * Math.PI / 180) * distance;
        
        // 设置粒子样式
        const colors = ['#ff1744', '#ff6d00', '#ffea00', '#76ff03', '#00e5ff', '#d500f9', '#ffd700'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = 0.8 + Math.random() * 0.8; // 0.8-1.6em
        
        particle.style.cssText = `
          position: absolute;
          left: ${centerX}px;
          top: ${centerY}px;
          color: ${color};
          font-weight: bold;
          font-size: ${size}em;
          pointer-events: none;
          z-index: 1001;
          text-shadow: 0 0 10px ${color}88;
          animation: treasureExplosion 1.5s ease-out forwards;
          --end-x: ${endX - centerX}px;
          --end-y: ${endY - centerY}px;
        `;
        
        container.style.position = 'relative';
        container.appendChild(particle);
        
        // 清理粒子
        setTimeout(() => {
          if (particle.parentNode) {
            particle.parentNode.removeChild(particle);
          }
        }, 1500);
      }, i * 30); // 稍微增加间隔，减少瞬间计算负荷
    }
  }
  
  // 更新加班按钮显示状态
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

  // 更新心情状态显示
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
      if (moodState.mood === 'excited' || moodState.mood === 'euphoric' || moodState.mood === 'explosive') {
        incomeValue.classList.add(moodState.mood);
      }
    }
    
    const todayValue = document.getElementById('todayValue');
    if (todayValue) {
      todayValue.className = 'today-value';
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
  }
  
  // 启动更新循环，动态调整刷新频率
  let isHighPerformanceMode = false;
  
  function startUpdateLoop() {
    // 清除之前的定时器
    if (currentRefreshInterval) {
      clearInterval(currentRefreshInterval);
    }
    
    // 根据心情状态动态调整刷新频率
    function adaptiveUpdate() {
      chrome.storage.sync.get(['incomeSettings'], function(result) {
        const settings = result.incomeSettings;
        if (!settings) return;
        
        const workStart = settings.workStart || '09:00';
        const workEnd = settings.workEnd || '18:00';
        const breaks = settings.breaks || [];
        const dailyWorkMinutes = calculateWorkMinutes(workStart, workEnd, breaks);
        const dailyWorkSeconds = dailyWorkMinutes * 60;
        const workData = getWorkedSeconds(workStart, workEnd, breaks, false);
        const progressPercent = Math.min(100, (workData.normalSeconds / dailyWorkSeconds) * 100);
        
        // 在爆发阶段降低刷新频率以提升性能
        let updateInterval = 100; // 默认100ms
        if (progressPercent >= 95) {
          updateInterval = 200; // 爆发阶段降低到200ms
          isHighPerformanceMode = true;
        } else if (progressPercent >= 80) {
          updateInterval = 150; // 狂欢阶段150ms
          isHighPerformanceMode = false;
        } else {
          isHighPerformanceMode = false;
        }
        
        clearInterval(currentRefreshInterval);
        currentRefreshInterval = setInterval(updateIncomeEnhanced, updateInterval);
      });
    }
    
    // 初始设置
    adaptiveUpdate();
    // 每30秒重新评估一次刷新频率
    setInterval(adaptiveUpdate, 30000);
  }

  // 设置收入按钮点击事件
  if (setIncomeBtn) {
    setIncomeBtn.addEventListener('click', function() {
      window.open(chrome.runtime.getURL('src/popup/settings.html'), '_blank');
    });
  }

  // 加班按钮点击事件
  if (overtimeBtn) {
    overtimeBtn.addEventListener('click', function() {
      chrome.storage.sync.get(['isAfterWorkOvertime'], function(result) {
        const currentState = result.isAfterWorkOvertime || false;
        const newState = !currentState;
        
        chrome.storage.sync.set({ isAfterWorkOvertime: newState }, function() {
          updateOvertimeButton(newState);
          // 立即更新收入显示，以便心情状态立即生效
          updateIncomeEnhanced();
        });
      });
    });
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

  // 初始化加班按钮状态
  chrome.storage.sync.get(['isAfterWorkOvertime'], function(result) {
    updateOvertimeButton(result.isAfterWorkOvertime || false);
  });
  
  // 初始化按钮显示状态（默认隐藏）
  const overtimeBox = document.querySelector('.overtime-box');
  if (overtimeBox) {
    overtimeBox.style.display = 'none';
  }

  // 初始加载
  updateIncomeEnhanced();
  startUpdateLoop();
});
