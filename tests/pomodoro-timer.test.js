const test = require('node:test');
const assert = require('node:assert/strict');
const pomodoro = require('../assets/js/pomodoro-timer.js');
const pomodoroApp = require('../assets/js/pomodoro-app.js');

function createFakeClock() {
  let currentTime = 0;
  let nextTimerId = 1;
  const timers = new Map();
  return {
    now: () => currentTime,
    schedule(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, at: currentTime + delay });
      return id;
    },
    cancel(id) { timers.delete(id); },
    advance(milliseconds) { currentTime += milliseconds; },
    runDue() {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= currentTime);
      due.forEach(([id, timer]) => {
        timers.delete(id);
        timer.callback();
      });
    }
  };
}

function createAppHarness(overrides = {}) {
  const calls = { start: 0, pause: 0, reset: 0, skip: 0, destroy: 0, errors: [] };
  const state = { status: 'paused' };
  const engine = {
    snapshot: () => ({ status: state.status, phase: 'focus' }),
    start() { state.status = 'running'; calls.start += 1; },
    pause() { state.status = 'paused'; calls.pause += 1; },
    resetPhase() { calls.reset += 1; },
    skip() { calls.skip += 1; },
    destroy() { calls.destroy += 1; },
    configure() { if (overrides.configureError) throw overrides.configureError; }
  };
  const invalidInput = {
    validity: { valid: false }, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; }
  };
  const errorElement = { textContent: '' };
  const settings = { open: false };
  const form = {
    elements: {
      focusMinutes: { value: '25' }, shortBreakMinutes: { value: '5' }, longBreakMinutes: { value: '15' },
      longBreakEvery: { value: '4' }, autoStart: { checked: false }, keepAwake: { checked: false },
      notifications: { checked: false }, noise: { value: 'none' }, noiseVolume: { value: '24' }
    },
    querySelectorAll(selector) { return selector.includes('pomodoro-settings input') ? [invalidInput] : []; }
  };
  const windowObject = {
    document: { title: '番茄时钟' }, navigator: overrides.navigator || {},
    addEventListener() {}, crypto: null
  };
  const app = pomodoroApp.createPomodoroApp({
    page: { querySelector(selector) { return selector === '[data-pomodoro-error]' ? errorElement : settings; } },
    form, result: {}, copyButton: {}, engineApi: { presets: pomodoro.presets, createPomodoroEngine: () => engine },
    windowObject, setFormStatus() {}, showError(error) { calls.errors.push(error.message); }
  });
  return { app, calls, engine, form, invalidInput, errorElement, settings, state };
}

test('pomodoro engine calibrates from absolute time and pauses without losing progress', () => {
  const clock = createFakeClock();
  const engine = pomodoro.createPomodoroEngine({
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel
  });

  assert.equal(engine.snapshot().remainingMs, 25 * 60 * 1000);
  engine.start();
  clock.advance(10 * 60 * 1000);
  engine.tick();
  assert.equal(engine.snapshot().remainingMs, 15 * 60 * 1000);

  engine.pause();
  clock.advance(20 * 60 * 1000);
  engine.tick();
  assert.equal(engine.snapshot().remainingMs, 15 * 60 * 1000);

  engine.start();
  clock.advance(15 * 60 * 1000);
  engine.tick();
  assert.deepEqual(
    {
      phase: engine.snapshot().phase,
      status: engine.snapshot().status,
      completedFocusCount: engine.snapshot().completedFocusCount,
      focusMinutes: engine.snapshot().focusMinutes
    },
    { phase: 'shortBreak', status: 'paused', completedFocusCount: 1, focusMinutes: 25 }
  );
});

test('pomodoro engine enters a long break at the configured interval', () => {
  const clock = createFakeClock();
  const engine = pomodoro.createPomodoroEngine({ now: clock.now, schedule: clock.schedule, cancel: clock.cancel });

  for (let focus = 1; focus <= 4; focus += 1) {
    engine.start();
    clock.advance(25 * 60 * 1000);
    engine.tick();
    if (focus < 4) engine.skip();
  }

  assert.equal(engine.snapshot().phase, 'longBreak');
  assert.equal(engine.snapshot().remainingMs, 15 * 60 * 1000);
  assert.equal(engine.snapshot().completedFocusCount, 4);
});

test('auto start continues after natural completion while skip and reset never count focus', () => {
  const clock = createFakeClock();
  const engine = pomodoro.createPomodoroEngine({
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    config: { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 20, longBreakEvery: 4, autoStart: true }
  });

  engine.start();
  clock.advance(50 * 60 * 1000);
  clock.runDue();
  assert.equal(engine.snapshot().phase, 'shortBreak');
  assert.equal(engine.snapshot().status, 'running');
  assert.equal(engine.snapshot().completedFocusCount, 1);

  engine.skip();
  assert.equal(engine.snapshot().phase, 'focus');
  assert.equal(engine.snapshot().status, 'paused');
  engine.start();
  clock.advance(5 * 60 * 1000);
  engine.resetPhase();
  assert.equal(engine.snapshot().completedFocusCount, 1);
  assert.equal(engine.snapshot().remainingMs, 50 * 60 * 1000);

  engine.resetSession();
  assert.equal(engine.snapshot().completedFocusCount, 0);
  assert.equal(engine.snapshot().focusMinutes, 0);
});

test('pomodoro engine validates custom durations', () => {
  assert.throws(
    () => pomodoro.createPomodoroEngine({ config: { focusMinutes: 0 } }),
    /专注时长/
  );
  assert.throws(
    () => pomodoro.createPomodoroEngine({ config: { longBreakEvery: 13 } }),
    /长休间隔/
  );
});

test('notification permission denial stays a recoverable optional capability', async () => {
  let requests = 0;
  const denied = await pomodoroApp.requestNotificationPermission({
    permission: 'default',
    requestPermission: async () => { requests += 1; return 'denied'; }
  });
  assert.deepEqual(denied, { granted: false, reason: 'denied' });
  assert.equal(requests, 1);

  const unsupported = await pomodoroApp.requestNotificationPermission(null);
  assert.deepEqual(unsupported, { granted: false, reason: 'unsupported' });
});

test('pomodoro keyboard shortcuts operate the timer and ignore form controls', () => {
  const { app, calls } = createAppHarness();
  const event = (key, matches = false) => ({ key, target: { matches: () => matches, isContentEditable: false }, preventDefault() {} });
  app.handleShortcut(event(' '));
  app.handleShortcut(event('r'));
  app.handleShortcut(event('n'));
  app.handleShortcut(event(' ', true));
  assert.deepEqual(
    { start: calls.start, reset: calls.reset, skip: calls.skip, pause: calls.pause },
    { start: 1, reset: 1, skip: 1, pause: 0 }
  );
});

test('late wake-lock requests release safely and never restart after page destruction', async () => {
  let resolveLock;
  let releases = 0;
  let requests = 0;
  const navigator = { wakeLock: { request() { requests += 1; return new Promise((resolve) => { resolveLock = resolve; }); } } };
  const { app, engine, form } = createAppHarness({ navigator });
  const lock = { addEventListener() {}, release() { releases += 1; return Promise.resolve(); } };
  form.elements.keepAwake.checked = true;
  engine.start();
  app.syncWakeLock(engine.snapshot());
  app.destroy();
  resolveLock(lock);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(releases, 1);
  assert.equal(requests, 1);
});

test('invalid custom timing opens settings and exposes a field-level error', () => {
  const validationError = new Error('专注时长应在 1–180 分钟之间。');
  const { app, calls, invalidInput, errorElement, settings } = createAppHarness({ configureError: validationError });
  app.configureFromForm();
  assert.equal(settings.open, true);
  assert.equal(invalidInput.attributes['aria-invalid'], 'true');
  assert.equal(errorElement.textContent, validationError.message);
  assert.deepEqual(calls.errors, [validationError.message]);
});
