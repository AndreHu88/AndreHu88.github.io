(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JackPomodoroTimer = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var presets = {
    classic: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
    deep: { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 20, longBreakEvery: 4 },
    long: { focusMinutes: 90, shortBreakMinutes: 20, longBreakMinutes: 30, longBreakEvery: 2 }
  };

  function validatedConfig(input) {
    var config = Object.assign({}, presets.classic, { autoStart: false }, input || {});
    [
      ['focusMinutes', '专注时长', 1, 180],
      ['shortBreakMinutes', '短休时长', 1, 60],
      ['longBreakMinutes', '长休时长', 1, 60]
    ].forEach(function (rule) {
      var value = Number(config[rule[0]]);
      if (!Number.isFinite(value) || value < rule[2] || value > rule[3]) throw new Error(rule[1] + '应在 ' + rule[2] + '–' + rule[3] + ' 分钟之间。');
      config[rule[0]] = value;
    });
    config.longBreakEvery = Number(config.longBreakEvery);
    if (!Number.isInteger(config.longBreakEvery) || config.longBreakEvery < 1 || config.longBreakEvery > 12) throw new Error('长休间隔应为 1–12 轮。');
    config.autoStart = Boolean(config.autoStart);
    return config;
  }

  function PomodoroEngine(options) {
    var settings = options || {};
    this.now = settings.now || Date.now;
    this.schedule = settings.schedule || function (callback, delay) { return setTimeout(callback, delay); };
    this.cancel = settings.cancel || function (timerId) { clearTimeout(timerId); };
    this.onChange = settings.onChange || function () {};
    this.onPhaseEnd = settings.onPhaseEnd || function () {};
    this.config = validatedConfig(settings.config);
    this.timerId = null;
    this.state = this.createInitialState();
  }

  PomodoroEngine.prototype.phaseDuration = function (phase) {
    var key = phase === 'focus' ? 'focusMinutes' : phase === 'shortBreak' ? 'shortBreakMinutes' : 'longBreakMinutes';
    return this.config[key] * 60 * 1000;
  };

  PomodoroEngine.prototype.createInitialState = function () {
    return { phase: 'focus', status: 'paused', remainingMs: this.config.focusMinutes * 60 * 1000, endAt: null, completedFocusCount: 0, focusMinutes: 0 };
  };

  PomodoroEngine.prototype.currentRemaining = function () {
    return this.state.status === 'running' ? Math.max(0, this.state.endAt - this.now()) : this.state.remainingMs;
  };

  PomodoroEngine.prototype.snapshot = function () {
    var remainingMs = this.currentRemaining();
    var durationMs = this.phaseDuration(this.state.phase);
    return {
      phase: this.state.phase, status: this.state.status, remainingMs: remainingMs, durationMs: durationMs,
      progress: durationMs ? Math.min(1, Math.max(0, 1 - remainingMs / durationMs)) : 0,
      completedFocusCount: this.state.completedFocusCount, focusMinutes: this.state.focusMinutes,
      cyclePosition: this.state.completedFocusCount % this.config.longBreakEvery, config: Object.assign({}, this.config)
    };
  };

  PomodoroEngine.prototype.notifyChange = function () { this.onChange(this.snapshot()); };

  PomodoroEngine.prototype.clearScheduledTick = function () {
    if (this.timerId !== null) this.cancel(this.timerId);
    this.timerId = null;
  };

  PomodoroEngine.prototype.scheduleTick = function () {
    this.clearScheduledTick();
    if (this.state.status !== 'running') return;
    this.timerId = this.schedule(this.tick.bind(this), Math.max(50, Math.min(1000, this.currentRemaining())));
  };

  PomodoroEngine.prototype.nextPhase = function (completedPhase) {
    if (completedPhase !== 'focus') return 'focus';
    return this.state.completedFocusCount > 0 && this.state.completedFocusCount % this.config.longBreakEvery === 0 ? 'longBreak' : 'shortBreak';
  };

  PomodoroEngine.prototype.moveToNextPhase = function (completedNaturally) {
    var completedPhase = this.state.phase;
    this.clearScheduledTick();
    if (completedNaturally && completedPhase === 'focus') {
      this.state.completedFocusCount += 1;
      this.state.focusMinutes += this.config.focusMinutes;
    }
    this.state.phase = this.nextPhase(completedPhase);
    this.state.status = 'paused';
    this.state.endAt = null;
    this.state.remainingMs = this.phaseDuration(this.state.phase);
    this.onPhaseEnd({ completedPhase: completedPhase, nextPhase: this.state.phase, completedNaturally: completedNaturally, snapshot: this.snapshot() });
    if (completedNaturally && this.config.autoStart) this.start();
    else this.notifyChange();
  };

  PomodoroEngine.prototype.start = function () {
    if (this.state.status === 'running') return this.snapshot();
    this.state.status = 'running';
    this.state.endAt = this.now() + this.state.remainingMs;
    this.scheduleTick();
    this.notifyChange();
    return this.snapshot();
  };

  PomodoroEngine.prototype.pause = function () {
    if (this.state.status !== 'running') return this.snapshot();
    this.state.remainingMs = this.currentRemaining();
    this.state.status = 'paused';
    this.state.endAt = null;
    this.clearScheduledTick();
    this.notifyChange();
    return this.snapshot();
  };

  PomodoroEngine.prototype.tick = function () {
    if (this.state.status !== 'running') return this.snapshot();
    this.state.remainingMs = this.currentRemaining();
    if (this.state.remainingMs <= 0) this.moveToNextPhase(true);
    else { this.scheduleTick(); this.notifyChange(); }
    return this.snapshot();
  };

  PomodoroEngine.prototype.skip = function () { this.moveToNextPhase(false); return this.snapshot(); };

  PomodoroEngine.prototype.resetPhase = function () {
    this.clearScheduledTick();
    this.state.status = 'paused';
    this.state.endAt = null;
    this.state.remainingMs = this.phaseDuration(this.state.phase);
    this.notifyChange();
    return this.snapshot();
  };

  PomodoroEngine.prototype.resetSession = function () {
    this.clearScheduledTick();
    this.state = this.createInitialState();
    this.notifyChange();
    return this.snapshot();
  };

  PomodoroEngine.prototype.configure = function (nextConfig) {
    this.config = validatedConfig(Object.assign({}, this.config, nextConfig || {}));
    return this.resetSession();
  };

  PomodoroEngine.prototype.destroy = function () { this.clearScheduledTick(); };

  function createPomodoroEngine(options) { return new PomodoroEngine(options); }

  return { presets: presets, validatedConfig: validatedConfig, createPomodoroEngine: createPomodoroEngine };
}));
