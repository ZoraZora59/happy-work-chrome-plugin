document.addEventListener('DOMContentLoaded', function () {
  const salaryInput = document.getElementById('salary');
  const bonusInput = document.getElementById('bonus');
  const incomeCurrency = document.getElementById('incomeCurrency');
  const displayCurrency = document.getElementById('displayCurrency');
  const workDayCheckboxes = document.querySelectorAll('input[name="workDays"]');
  
  // 加班场景相关元素
  const holidayOvertimeEnabled = document.getElementById('holidayOvertimeEnabled');
  const holidayOvertimeDetail = document.getElementById('holidayOvertimeDetail');
  const holidayMultiplier = document.getElementById('holidayMultiplier');
  
  const weekendOvertimeEnabled = document.getElementById('weekendOvertimeEnabled');
  const weekendOvertimeDetail = document.getElementById('weekendOvertimeDetail');
  const weekendMultiplier = document.getElementById('weekendMultiplier');
  const weekendFrequency = document.getElementById('weekendFrequency');
  const baseWeekSetting = document.getElementById('baseWeekSetting');
  const baseWeekStart = document.getElementById('baseWeekStart');
  const weekendDayCheckboxes = document.querySelectorAll('input[name="weekendDays"]');
  
  const afterWorkOvertimeEnabled = document.getElementById('afterWorkOvertimeEnabled');
  const afterWorkOvertimeDetail = document.getElementById('afterWorkOvertimeDetail');
  const afterWorkMultiplier = document.getElementById('afterWorkMultiplier');
  const workStart = document.getElementById('workStart');
  const workEnd = document.getElementById('workEnd');
  const valueItem = document.getElementById('valueItem');
  const customItemGroup = document.getElementById('customItemGroup');
  const customPriceGroup = document.getElementById('customPriceGroup');
  const customItemName = document.getElementById('customItemName');
  const customItemPrice = document.getElementById('customItemPrice');

  const breaksContainer = document.getElementById('breaksContainer');
  const addBreakBtn = document.getElementById('addBreakBtn');
  const saveBtn = document.getElementById('saveBtn');
  const incomeForm = document.getElementById('incomeForm');
  const zenMode = document.getElementById('zenMode');

  // 动态添加/删除休息时间
  function addBreakRow(start = '', end = '') {
    const row = document.createElement('div');
    row.className = 'break-row';
    row.innerHTML = `
      <input type="time" class="break-start" value="${start}" required> 至
      <input type="time" class="break-end" value="${end}" required>
      <button type="button" class="remove-break">删除</button>
    `;
    row.querySelector('.remove-break').onclick = function () {
      breaksContainer.removeChild(row);
    };
    breaksContainer.appendChild(row);
  }

  addBreakBtn.onclick = function () {
    addBreakRow();
  };

  // 价值衡量选项变化处理
  valueItem.onchange = function () {
    if (this.value === 'custom') {
      customItemGroup.style.display = 'flex';
      customPriceGroup.style.display = 'flex';
    } else {
      customItemGroup.style.display = 'none';
      customPriceGroup.style.display = 'none';
    }
  };



  // 加班场景控制
  holidayOvertimeEnabled.onchange = function () {
    holidayOvertimeDetail.style.display = this.checked ? 'block' : 'none';
  };

  weekendOvertimeEnabled.onchange = function () {
    weekendOvertimeDetail.style.display = this.checked ? 'block' : 'none';
    updateWorkDaysState();
  };

  afterWorkOvertimeEnabled.onchange = function () {
    afterWorkOvertimeDetail.style.display = this.checked ? 'block' : 'none';
  };

  weekendFrequency.onchange = function () {
    baseWeekSetting.style.display = (this.value !== '1') ? 'block' : 'none';
  };

  // 监听工作日变化，更新休息日加班选项状态
  workDayCheckboxes.forEach(checkbox => {
    checkbox.onchange = updateWorkDaysState;
  });

  // 监听休息日加班日期变化
  weekendDayCheckboxes.forEach(checkbox => {
    checkbox.onchange = updateWorkDaysState;
  });

  // 更新工作日和休息日加班选项的状态
  function updateWorkDaysState() {
    if (weekendOvertimeEnabled.checked) {
      // 获取当前选中的工作日
      const selectedWorkDays = Array.from(workDayCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value));

      // 休息日加班选项：与工作日冲突的日期置灰
      weekendDayCheckboxes.forEach(checkbox => {
        const dayValue = parseInt(checkbox.value);
        if (selectedWorkDays.includes(dayValue)) {
          checkbox.disabled = true;
          checkbox.checked = false;
          checkbox.parentElement.style.opacity = '0.5';
        } else {
          checkbox.disabled = false;
          checkbox.parentElement.style.opacity = '1';
        }
      });

      // 工作日选项：不置灰，允许用户自由选择
      workDayCheckboxes.forEach(checkbox => {
        checkbox.disabled = false;
        checkbox.parentElement.style.opacity = '1';
      });
    } else {
      // 未启用休息日加班时，恢复所有选项
      workDayCheckboxes.forEach(checkbox => {
        checkbox.disabled = false;
        checkbox.parentElement.style.opacity = '1';
      });
      weekendDayCheckboxes.forEach(checkbox => {
        checkbox.disabled = false;
        checkbox.parentElement.style.opacity = '1';
      });
    }
  }

  // 加载已保存数据
  chrome.storage.sync.get(['incomeSettings'], function (result) {
    const data = result.incomeSettings || {};
    if (data.salary) salaryInput.value = data.salary;
    if (data.bonus) bonusInput.value = data.bonus;
    if (data.incomeCurrency) incomeCurrency.value = data.incomeCurrency;
    if (data.displayCurrency) displayCurrency.value = data.displayCurrency;
    
    // 加载工作日设置
    if (Array.isArray(data.workDays)) {
      workDayCheckboxes.forEach(checkbox => {
        checkbox.checked = data.workDays.includes(parseInt(checkbox.value));
      });
    }
    
    // 加载加班场景设置
    if (data.holidayOvertimeEnabled) {
      holidayOvertimeEnabled.checked = true;
      holidayOvertimeDetail.style.display = 'block';
      if (data.holidayMultiplier) holidayMultiplier.value = data.holidayMultiplier;
    }
    
    if (data.weekendOvertimeEnabled) {
      weekendOvertimeEnabled.checked = true;
      weekendOvertimeDetail.style.display = 'block';
      if (data.weekendMultiplier) weekendMultiplier.value = data.weekendMultiplier;
      if (data.weekendFrequency) {
        weekendFrequency.value = data.weekendFrequency;
        if (data.weekendFrequency !== '1') {
          baseWeekSetting.style.display = 'block';
          if (data.baseWeekStart) baseWeekStart.value = data.baseWeekStart;
        }
      }
      // 加载休息日加班日期设置
      if (Array.isArray(data.weekendDays)) {
        weekendDayCheckboxes.forEach(checkbox => {
          checkbox.checked = data.weekendDays.includes(parseInt(checkbox.value));
        });
      }
      updateWorkDaysState();
    }
    
    if (data.afterWorkOvertimeEnabled) {
      afterWorkOvertimeEnabled.checked = true;
      afterWorkOvertimeDetail.style.display = 'block';
      if (data.afterWorkMultiplier) afterWorkMultiplier.value = data.afterWorkMultiplier;
    }
    if (data.workStart) workStart.value = data.workStart;
    if (data.workEnd) workEnd.value = data.workEnd;
    
    // 加载价值衡量设置
    if (data.valueItem) {
      valueItem.value = data.valueItem;
      if (data.valueItem === 'custom') {
        customItemGroup.style.display = 'flex';
        customPriceGroup.style.display = 'flex';
        if (data.customItemName) customItemName.value = data.customItemName;
        if (data.customItemPrice) customItemPrice.value = data.customItemPrice;
      }
    }
    

    
    if (Array.isArray(data.breaks)) {
      data.breaks.forEach(b => addBreakRow(b.start, b.end));
    }
    
    // 加载佛系模式设置
    if (data.zenMode) {
      zenMode.checked = data.zenMode;
    }
  });

  // 表单校验和保存
  incomeForm.onsubmit = function (e) {
    e.preventDefault();
    const salary = parseFloat(salaryInput.value);
    if (isNaN(salary) || salary <= 0) {
      alert('月薪必须大于0');
      salaryInput.focus();
      return;
    }
    // 保留两位小数
    const salaryFixed = salary.toFixed(2);
    let bonus = bonusInput.value ? parseFloat(bonusInput.value) : 0;
    if (bonusInput.value && (isNaN(bonus) || bonus < 0)) {
      alert('年终奖不能为负数');
      bonusInput.focus();
      return;
    }
    bonus = bonusInput.value ? bonus.toFixed(2) : '';
    
    // 获取选中的工作日
    const selectedWorkDays = [];
    workDayCheckboxes.forEach(checkbox => {
      if (checkbox.checked) {
        selectedWorkDays.push(parseInt(checkbox.value));
      }
    });
    
    if (selectedWorkDays.length === 0) {
      alert('请至少选择一个工作日');
      return;
    }
    
    // 校验加班场景设置
    const overtimeSettings = {};
    
    if (holidayOvertimeEnabled.checked) {
      const multiplier = parseFloat(holidayMultiplier.value);
      if (isNaN(multiplier) || multiplier < 0) {
        alert('节假日加班薪资倍数必须是大于等于0的数字');
        holidayMultiplier.focus();
        return;
      }
      overtimeSettings.holiday = {
        enabled: true,
        multiplier: multiplier.toFixed(2)
      };
    }
    
    if (weekendOvertimeEnabled.checked) {
      const multiplier = parseFloat(weekendMultiplier.value);
      if (isNaN(multiplier) || multiplier < 0) {
        alert('普通休息日加班薪资倍数必须是大于等于0的数字');
        weekendMultiplier.focus();
        return;
      }
      const frequency = parseInt(weekendFrequency.value);
      const baseWeek = frequency > 1 ? baseWeekStart.value : null;
      
      if (frequency > 1 && !baseWeek) {
        alert('请选择基准周起始日期');
        baseWeekStart.focus();
        return;
      }
      
      // 获取选中的休息日加班日期
      const selectedWeekendDays = [];
      weekendDayCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
          selectedWeekendDays.push(parseInt(checkbox.value));
        }
      });
      
      if (selectedWeekendDays.length === 0) {
        alert('请至少选择一个休息日加班日期');
        return;
      }
      
      overtimeSettings.weekend = {
        enabled: true,
        multiplier: multiplier.toFixed(2),
        frequency: frequency,
        baseWeekStart: baseWeek,
        weekendDays: selectedWeekendDays
      };
    }
    
    if (afterWorkOvertimeEnabled.checked) {
      const multiplier = parseFloat(afterWorkMultiplier.value);
      if (isNaN(multiplier) || multiplier < 0) {
        alert('工作日下班后加班薪资倍数必须是大于等于0的数字');
        afterWorkMultiplier.focus();
        return;
      }
      overtimeSettings.afterWork = {
        enabled: true,
        multiplier: multiplier.toFixed(2)
      };
    }
    
    const breaks = [];
    const breakRows = breaksContainer.querySelectorAll('.break-row');
    for (let row of breakRows) {
      const start = row.querySelector('.break-start').value;
      const end = row.querySelector('.break-end').value;
      if (!start || !end) {
        alert('请填写完整的休息时间');
        return;
      }
      if (start >= end) {
        alert('休息时间的起止顺序不正确');
        return;
      }
      breaks.push({ start, end });
    }
    
    // 校验价值衡量设置
    let valueSettings = {
      item: valueItem.value
    };
    if (valueItem.value === 'custom') {
      if (!customItemName.value.trim()) {
        alert('请填写自定义物品名称');
        customItemName.focus();
        return;
      }
      const price = parseFloat(customItemPrice.value);
      if (isNaN(price) || price < 0.1) {
        alert('自定义物品价格必须大于等于0.1元');
        customItemPrice.focus();
        return;
      }
      valueSettings.name = customItemName.value.trim();
      valueSettings.price = price.toFixed(1);
    }
    
    const settings = {
      salary: salaryFixed,
      bonus,
      incomeCurrency: incomeCurrency.value,
      displayCurrency: displayCurrency.value,
      workDays: selectedWorkDays,
      overtimeSettings: overtimeSettings,
      workStart: workStart.value,
      workEnd: workEnd.value,
      breaks,
      valueItem: valueSettings.item,
      customItemName: valueSettings.name,
      customItemPrice: valueSettings.price,

      // 保存加班场景的详细设置
      holidayOvertimeEnabled: holidayOvertimeEnabled.checked,
      holidayMultiplier: holidayOvertimeEnabled.checked ? holidayMultiplier.value : null,
      weekendOvertimeEnabled: weekendOvertimeEnabled.checked,
      weekendMultiplier: weekendOvertimeEnabled.checked ? weekendMultiplier.value : null,
      weekendFrequency: weekendOvertimeEnabled.checked ? weekendFrequency.value : null,
      baseWeekStart: (weekendOvertimeEnabled.checked && weekendFrequency.value !== '1') ? baseWeekStart.value : null,
      weekendDays: weekendOvertimeEnabled.checked ? Array.from(weekendDayCheckboxes).filter(cb => cb.checked).map(cb => parseInt(cb.value)) : null,
      afterWorkOvertimeEnabled: afterWorkOvertimeEnabled.checked,
      afterWorkMultiplier: afterWorkOvertimeEnabled.checked ? afterWorkMultiplier.value : null,
      
      // 保存佛系模式设置
      zenMode: zenMode.checked
    };
    chrome.storage.sync.set({ incomeSettings: settings }, function () {
      alert('保存成功！');
    });
  };
}); 