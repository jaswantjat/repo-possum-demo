// Repo Possum — static demo RGS shim (c20).
// Intercepts fetch() calls to the rgs_url host and answers them from a
// weighted pack of REAL books sampled from the frozen publish set.
// Demo only — production serves from Stake Engine RGS.
(function () {
  'use strict';
  var RGS_HOST = 'demo-rgs.local';
  var MICRO = 1e6;
  var state = {
    balance: 10000 * MICRO,
    pendingPayout: 0,
    packs: {},   // mode -> [{w, b}]
    totals: {},  // mode -> total weight
  };
  var BET_MODES = {
    base: { mode: 'base', costMultiplier: 1, feature: false },
    ante: { mode: 'ante', costMultiplier: 1.5, feature: false },
    hookspin: { mode: 'hookspin', costMultiplier: 5, feature: true },
    bonus: { mode: 'bonus', costMultiplier: 100, feature: true },
    super: { mode: 'super', costMultiplier: 250, feature: true },
    epic: { mode: 'epic', costMultiplier: 500, feature: true },
    maxzero: { mode: 'maxzero', costMultiplier: 1000, feature: true },
    random: { mode: 'random', costMultiplier: 125, feature: true },
  };
  var JUR = { socialCasino: true, disabledFullscreen: false, disabledTurbo: false, disabledSuperTurbo: false, disabledAutoplay: false, disabledSlamstop: false, disabledSpacebar: false, disabledBuyFeature: false, displayNetPosition: false, displayRTP: true, displaySessionTimer: false, minimumRoundDuration: 0 };

  function packUrl(mode) {
    var base = new URL('.', window.location.href);
    return new URL('demo-pack/pack_' + mode + '.json', base).href;
  }
  function loadPack(mode) {
    if (state.packs[mode]) return Promise.resolve(state.packs[mode]);
    return fetch(packUrl(mode)).then(function (r) {
      if (!r.ok) throw new Error('pack missing: ' + mode);
      return r.json();
    }).then(function (pack) {
      state.packs[mode] = pack;
      state.totals[mode] = pack.reduce(function (s, p) { return s + p.w; }, 0);
      return pack;
    });
  }
  function drawBook(mode) {
    return loadPack(mode).then(function (pack) {
      var t = Math.random() * state.totals[mode];
      for (var i = 0; i < pack.length; i++) {
        t -= pack[i].w;
        if (t <= 0) return pack[i].b;
      }
      return pack[pack.length - 1].b;
    });
  }
  function json(obj) {
    return new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  function balance() { return { amount: state.balance, currency: 'USD' }; }

  var origFetch = window.fetch.bind(window);
  function isRgsUrl(url) {
    if (url.indexOf(RGS_HOST) !== -1) return true;
    try {
      var h = new URL(url, window.location.href).host;
      return h === 'demo' || h === 'demo:443' || h === 'demo-rgs.local';
    } catch (e) { return false; }
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!isRgsUrl(url)) return origFetch(input, init);
    var body = {};
    try { body = JSON.parse((init && init.body) || (typeof input !== 'string' && input.bodyUsed === false ? null : null) || '{}'); } catch (e) { body = {}; }
    if (url.indexOf('/wallet/authenticate') !== -1) {
      return Promise.resolve(json({
        status: { statusCode: 'SUCCESS' }, balance: balance(), round: null,
        config: {
          betLevels: [0.1, 0.2, 0.5, 1, 2, 3, 5, 10, 20, 50, 100].map(function (x) { return x * MICRO; }),
          defaultBetLevel: MICRO, betModes: BET_MODES, jurisdiction: JUR,
        },
      }));
    }
    if (url.indexOf('/wallet/play') !== -1) {
      var amount = body.amount || MICRO;
      var mode = body.mode || 'base';
      return drawBook(mode).then(function (book) {
        var payout = Math.round((book.payoutMultiplier / 100) * amount);
        // real RGS charges base bet x mode cost (e.g. RANDOM BONUS = 125 x bet)
        state.balance -= Math.round(amount * ((MODES[mode] || { costMultiplier: 1 }).costMultiplier));
        state.pendingPayout = payout;
        return json({
          status: { statusCode: 'SUCCESS' }, balance: balance(),
          round: { roundID: Date.now(), amount: amount, payout: payout, payoutMultiplier: book.payoutMultiplier / 100, active: true, mode: mode, event: '0', state: book.events },
        });
      });
    }
    if (url.indexOf('/wallet/end-round') !== -1) {
      state.balance += state.pendingPayout;
      state.pendingPayout = 0;
      return Promise.resolve(json({ status: { statusCode: 'SUCCESS' }, balance: balance() }));
    }
    if (url.indexOf('/bet/event') !== -1) {
      return Promise.resolve(json({ status: { statusCode: 'SUCCESS' }, event: body.event || '0' }));
    }
    return Promise.resolve(json({ status: { statusCode: 'SUCCESS' }, balance: balance() }));
  };

  // bootstrap query params if missing (Pages visitors land on a bare URL)
  if (window.location.search.indexOf('sessionID') === -1) {
    var device = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
    var q = '?sessionID=demo-session&rgs_url=' + RGS_HOST + '&lang=en&currency=USD&device=' + device;
    window.location.replace(window.location.pathname + q);
  }
})();
