(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JackPomodoroApp = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var phaseLabels = { focus: '专注时间', shortBreak: '短暂休息', longBreak: '长休息' };

  function formatRemaining(milliseconds) {
    var totalSeconds = Math.ceil(milliseconds / 1000);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  function requestNotificationPermission(notificationApi) {
    if (!notificationApi) return Promise.resolve({ granted: false, reason: 'unsupported' });
    if (notificationApi.permission === 'granted') return Promise.resolve({ granted: true, reason: 'granted' });
    if (notificationApi.permission === 'denied') return Promise.resolve({ granted: false, reason: 'denied' });
    return Promise.resolve().then(function () { return notificationApi.requestPermission(); }).then(function (permission) {
      return { granted: permission === 'granted', reason: permission };
    }).catch(function () { return { granted: false, reason: 'denied' }; });
  }

  function SoundController(windowObject) {
    this.windowObject = windowObject;
    this.audioContext = null;
    this.noiseSource = null;
    this.noiseGain = null;
    this.activeNoise = 'none';
  }

  SoundController.prototype.context = function () {
    if (!this.audioContext) {
      var AudioContext = this.windowObject.AudioContext || this.windowObject.webkitAudioContext;
      if (AudioContext) this.audioContext = new AudioContext();
    }
    if (this.audioContext && this.audioContext.state === 'suspended') this.audioContext.resume().catch(function () {});
    return this.audioContext;
  };

  SoundController.prototype.prepare = function () { return this.context(); };

  SoundController.prototype.randomValues = function (length) {
    var values = new Float32Array(length);
    var cryptoObject = this.windowObject.crypto;
    var offset = 0;
    while (cryptoObject && offset < length) {
      var count = Math.min(16384, length - offset);
      var integers = new Uint32Array(count);
      cryptoObject.getRandomValues(integers);
      for (var index = 0; index < count; index += 1) values[offset + index] = integers[index] / 2147483648 - 1;
      offset += count;
    }
    if (!cryptoObject) {
      var seed = 2463534242;
      for (var fallbackIndex = 0; fallbackIndex < length; fallbackIndex += 1) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        values[fallbackIndex] = (seed >>> 0) / 2147483648 - 1;
      }
    }
    return values;
  };

  SoundController.prototype.noiseBuffer = function (type) {
    var audio = this.context();
    var buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    var channel = buffer.getChannelData(0);
    var white = this.randomValues(channel.length);
    var previous = 0;
    for (var index = 0; index < channel.length; index += 1) {
      previous = type === 'brown' ? (previous + white[index] * 0.02) / 1.02 : white[index];
      channel[index] = type === 'brown' ? previous * 3.5 : previous * 0.72;
    }
    return buffer;
  };

  SoundController.prototype.stopNoise = function () {
    if (this.noiseSource) { try { this.noiseSource.stop(); } catch (error) {} this.noiseSource.disconnect(); }
    if (this.noiseGain) this.noiseGain.disconnect();
    this.noiseSource = null;
    this.noiseGain = null;
    this.activeNoise = 'none';
  };

  SoundController.prototype.startNoise = function (type, volume) {
    if (type === 'none') { this.stopNoise(); return; }
    var audio = this.context();
    if (!audio) return;
    if (this.activeNoise === type && this.noiseGain) { this.noiseGain.gain.value = volume; return; }
    this.stopNoise();
    this.noiseSource = audio.createBufferSource();
    this.noiseGain = audio.createGain();
    this.noiseSource.buffer = this.noiseBuffer(type);
    this.noiseSource.loop = true;
    this.noiseGain.gain.value = volume;
    this.noiseSource.connect(this.noiseGain).connect(audio.destination);
    this.noiseSource.start();
    this.activeNoise = type;
  };

  SoundController.prototype.playChime = function () {
    var audio = this.context();
    if (!audio) return;
    [660, 880].forEach(function (frequency, index) {
      var oscillator = audio.createOscillator();
      var gain = audio.createGain();
      var startsAt = audio.currentTime + index * 0.18;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startsAt);
      gain.gain.exponentialRampToValueAtTime(0.2, startsAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.32);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + 0.34);
    });
  };

  function PomodoroController(options) {
    this.page = options.page;
    this.form = options.form;
    this.result = options.result;
    this.copyButton = options.copyButton;
    this.setFormStatus = options.setFormStatus;
    this.showError = options.showError;
    this.engineApi = options.engineApi;
    this.windowObject = options.windowObject || window;
    this.originalTitle = this.windowObject.document.title;
    this.sound = new SoundController(this.windowObject);
    this.wakeLock = null;
    this.wakeLockRequest = null;
    this.wakeLockGeneration = 0;
    this.destroyed = false;
    this.lastStatsSignature = '';
    this.engine = this.engineApi.createPomodoroEngine({ onChange: this.render.bind(this), onPhaseEnd: this.phaseEnded.bind(this) });
  }

  PomodoroController.prototype.formConfig = function () {
    return {
      focusMinutes: Number(this.form.elements.focusMinutes.value), shortBreakMinutes: Number(this.form.elements.shortBreakMinutes.value),
      longBreakMinutes: Number(this.form.elements.longBreakMinutes.value), longBreakEvery: Number(this.form.elements.longBreakEvery.value),
      autoStart: this.form.elements.autoStart.checked
    };
  };

  PomodoroController.prototype.setPresetValues = function (presetName) {
    var controller = this;
    var preset = this.engineApi.presets[presetName];
    if (!preset) return;
    Object.keys(preset).forEach(function (name) { controller.form.elements[name].value = preset[name]; });
  };

  PomodoroController.prototype.selectedPresetName = function () {
    var selected = this.form.querySelector('[name="preset"]:checked');
    return selected ? selected.value : 'custom';
  };

  PomodoroController.prototype.renderCycles = function (snapshot) {
    var container = this.page.querySelector('[data-pomodoro-cycles]');
    var documentObject = this.page.ownerDocument;
    container.innerHTML = '';
    for (var index = 0; index < snapshot.config.longBreakEvery; index += 1) {
      var dot = documentObject.createElement('span');
      dot.className = index < snapshot.cyclePosition ? 'is-complete' : index === snapshot.cyclePosition && snapshot.phase === 'focus' ? 'is-current' : '';
      dot.setAttribute('aria-hidden', 'true');
      container.appendChild(dot);
    }
    container.setAttribute('aria-label', '长休前已完成 ' + snapshot.cyclePosition + ' / ' + snapshot.config.longBreakEvery + ' 轮专注');
  };

  PomodoroController.prototype.presetLabel = function () {
    var presetName = this.selectedPresetName();
    if (presetName === 'custom') return '自定义';
    if (presetName === 'classic') return '经典';
    return presetName === 'deep' ? '深度' : '长专注';
  };

  PomodoroController.prototype.renderStats = function (snapshot) {
    var signature = [snapshot.completedFocusCount, snapshot.focusMinutes, snapshot.config.focusMinutes, this.selectedPresetName()].join('|');
    if (signature === this.lastStatsSignature) return;
    this.lastStatsSignature = signature;
    this.result.classList.remove('is-error');
    this.result.innerHTML = '<div class="pomodoro-session"><span class="eyebrow">Current session</span><h3>本页专注记录</h3><div class="tool-summary-grid"><div><span>完成专注</span><strong>' + snapshot.completedFocusCount + ' 轮</strong></div><div><span>累计专注</span><strong>' + snapshot.focusMinutes + ' 分钟</strong></div><div><span>当前节奏</span><strong>' + this.presetLabel() + '</strong></div></div><p class="tool-result-note">完成一次自然结束的专注阶段才会计入统计；跳过和重置不会计数。</p></div>';
    this.result._copyValue = '完成专注：' + snapshot.completedFocusCount + ' 轮\n累计专注：' + snapshot.focusMinutes + ' 分钟';
    this.copyButton.hidden = false;
  };

  PomodoroController.prototype.syncNoise = function (snapshot) {
    var shouldPlay = snapshot.status === 'running' && snapshot.phase === 'focus';
    var volume = Number(this.form.elements.noiseVolume.value) / 100;
    if (shouldPlay) this.sound.startNoise(this.form.elements.noise.value, volume);
    else this.sound.stopNoise();
  };

  PomodoroController.prototype.releaseWakeLock = function () {
    this.wakeLockGeneration += 1;
    if (this.wakeLock) this.wakeLock.release().catch(function () {});
    this.wakeLock = null;
  };

  PomodoroController.prototype.syncWakeLock = function (snapshot) {
    var controller = this;
    var shouldHold = snapshot.status === 'running' && this.form.elements.keepAwake.checked;
    if (!shouldHold) { this.releaseWakeLock(); return; }
    if (!this.windowObject.navigator.wakeLock || this.wakeLock || this.wakeLockRequest) return;
    var generation = ++this.wakeLockGeneration;
    var request = this.windowObject.navigator.wakeLock.request('screen');
    this.wakeLockRequest = request;
    request.then(function (lock) {
      if (controller.wakeLockRequest === request) controller.wakeLockRequest = null;
      var latest = controller.engine.snapshot();
      var stillNeeded = generation === controller.wakeLockGeneration && latest.status === 'running' && controller.form.elements.keepAwake.checked;
      if (!stillNeeded) {
        lock.release().catch(function () {}).then(function () { if (!controller.destroyed) controller.syncWakeLock(controller.engine.snapshot()); });
        return;
      }
      controller.wakeLock = lock;
      lock.addEventListener('release', function () { if (controller.wakeLock === lock) controller.wakeLock = null; });
    }).catch(function () {
      if (controller.wakeLockRequest === request) controller.wakeLockRequest = null;
      if (generation !== controller.wakeLockGeneration) return;
      controller.form.elements.keepAwake.checked = false;
      controller.setFormStatus('浏览器未允许屏幕常亮，计时仍会继续。', 'error');
    });
  };

  PomodoroController.prototype.render = function (snapshot) {
    var clock = this.page.querySelector('[data-pomodoro-clock]');
    var label = phaseLabels[snapshot.phase];
    this.page.querySelector('[data-pomodoro-phase]').textContent = label;
    this.page.querySelector('[data-pomodoro-time]').textContent = formatRemaining(snapshot.remainingMs);
    this.page.querySelector('[data-pomodoro-state]').textContent = snapshot.status === 'running' ? '正在计时' : '已暂停';
    this.page.querySelector('[data-pomodoro-toggle-label]').textContent = snapshot.status === 'running' ? '暂停' : snapshot.phase === 'focus' ? '开始专注' : '开始休息';
    this.page.querySelector('[data-pomodoro-toggle] .material-symbols-rounded').textContent = snapshot.status === 'running' ? 'pause' : 'play_arrow';
    clock.style.setProperty('--pomodoro-progress', Math.round(snapshot.progress * 360) + 'deg');
    clock.classList.toggle('is-break', snapshot.phase !== 'focus');
    this.renderCycles(snapshot);
    this.renderStats(snapshot);
    this.syncNoise(snapshot);
    this.syncWakeLock(snapshot);
    this.windowObject.document.title = formatRemaining(snapshot.remainingMs) + ' · ' + label + ' | 番茄时钟';
  };

  PomodoroController.prototype.phaseEnded = function (event) {
    if (!event.completedNaturally) return;
    this.sound.playChime();
    if (this.form.elements.notifications.checked && this.windowObject.Notification && this.windowObject.Notification.permission === 'granted') {
      new this.windowObject.Notification(phaseLabels[event.completedPhase] + '结束', { body: '下一阶段：' + phaseLabels[event.nextPhase] });
    }
    this.setFormStatus(phaseLabels[event.completedPhase] + '已完成，下一阶段已准备好。', 'success');
  };

  PomodoroController.prototype.enableNotifications = function () {
    var controller = this;
    if (!this.form.elements.notifications.checked) return;
    requestNotificationPermission(this.windowObject.Notification).then(function (permission) {
      if (!permission.granted) {
        controller.form.elements.notifications.checked = false;
        controller.setFormStatus(permission.reason === 'unsupported' ? '当前浏览器不支持系统通知。' : '未获得通知权限，阶段提示音仍可正常使用。', 'error');
      }
    });
  };

  PomodoroController.prototype.configureFromForm = function () {
    var errorElement = this.page.querySelector('[data-pomodoro-error]');
    errorElement.textContent = '';
    Array.prototype.forEach.call(this.form.querySelectorAll('.pomodoro-settings input[aria-invalid="true"]'), function (input) { input.removeAttribute('aria-invalid'); });
    try {
      this.engine.configure(this.formConfig());
      this.setFormStatus('计时设置已更新，本页统计已重置。', 'success');
    } catch (error) {
      this.page.querySelector('.pomodoro-settings').open = true;
      Array.prototype.forEach.call(this.form.querySelectorAll('.pomodoro-settings input'), function (input) {
        if (input.validity && !input.validity.valid) input.setAttribute('aria-invalid', 'true');
      });
      errorElement.textContent = error.message || String(error);
      this.showError(error);
    }
  };

  PomodoroController.prototype.handle = function (action) {
    if (action === 'toggle') {
      if (this.engine.snapshot().status === 'running') this.engine.pause();
      else { this.sound.prepare(); this.engine.start(); }
    } else if (action === 'reset-phase') {
      this.engine.resetPhase();
      this.setFormStatus('当前阶段已重置，不计入完成统计。', 'success');
    } else if (action === 'skip') {
      this.engine.skip();
      this.setFormStatus('已跳到下一阶段，本次不计入完成统计。', 'success');
    }
  };

  PomodoroController.prototype.handleShortcut = function (event) {
    var target = event.target;
    if (target && (target.matches('input, select, textarea, button') || target.isContentEditable)) return;
    var key = event.key.toLocaleLowerCase();
    if (key === ' ' || key === 'r' || key === 'n') event.preventDefault();
    if (key === ' ') this.handle('toggle');
    if (key === 'r') this.handle('reset-phase');
    if (key === 'n') this.handle('skip');
  };

  PomodoroController.prototype.formChanged = function (event) {
    if (event.target.name === 'preset') {
      if (event.target.value !== 'custom') this.setPresetValues(event.target.value);
      else this.page.querySelector('.pomodoro-settings').open = true;
      this.configureFromForm();
    }
    if (['focusMinutes', 'shortBreakMinutes', 'longBreakMinutes', 'longBreakEvery', 'autoStart'].indexOf(event.target.name) !== -1) {
      this.form.querySelector('[name="preset"][value="custom"]').checked = true;
      this.configureFromForm();
    }
    if (event.target.name === 'notifications') this.enableNotifications();
    if (event.target.name === 'keepAwake') this.syncWakeLock(this.engine.snapshot());
    if (event.target.name === 'noise') this.syncNoise(this.engine.snapshot());
  };

  PomodoroController.prototype.initialize = function () {
    var controller = this;
    this.form.addEventListener('change', function (event) { controller.formChanged(event); });
    this.form.elements.noiseVolume.addEventListener('input', function () { controller.syncNoise(controller.engine.snapshot()); });
    this.page.addEventListener('keydown', function (event) { controller.handleShortcut(event); });
    this.windowObject.addEventListener('pagehide', function () { controller.destroy(); });
    this.render(this.engine.snapshot());
    this.setFormStatus('选择节奏后即可开始，本页不会保存专注记录。', 'success');
  };

  PomodoroController.prototype.reset = function () {
    this.setPresetValues('classic');
    this.engine.configure(Object.assign({}, this.engineApi.presets.classic, { autoStart: false }));
    this.lastStatsSignature = '';
    this.render(this.engine.snapshot());
  };

  PomodoroController.prototype.destroy = function () {
    this.destroyed = true;
    this.engine.destroy();
    this.sound.stopNoise();
    this.releaseWakeLock();
    this.windowObject.document.title = this.originalTitle;
  };

  function createPomodoroApp(options) { return new PomodoroController(options); }

  return { createPomodoroApp: createPomodoroApp, formatRemaining: formatRemaining, requestNotificationPermission: requestNotificationPermission };
}));
