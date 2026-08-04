/*
 * Compatibility shim for the older phones on the floor.
 *
 * The build target rewrites modern SYNTAX, but it cannot conjure up runtime
 * APIs that a 2018 WebView simply doesn't have. Without these, an old handset
 * parses the bundle fine and then dies the first time a waiter taps
 * something — which looked like a blank white page with no explanation.
 *
 * Deliberately a plain classic script in ES5, served from /public untouched
 * by the bundler, and loaded BEFORE the app: classic scripts run ahead of
 * module scripts, so everything below exists by the time React boots. It has
 * to run on the very browsers that can't run the app itself.
 *
 * Each polyfill is guarded, so on a current phone this file costs one cached
 * request and does nothing.
 */
(function () {
  'use strict'

  /* globalThis — Chrome 71 */
  if (typeof window.globalThis === 'undefined') {
    window.globalThis = window
  }

  /* Object.fromEntries — Chrome 73. Must accept any ITERABLE, not just an
   * array: the app feeds it Maps, and a slice() of a Map yields nothing at
   * all, which would have quietly produced empty objects instead of an
   * error. */
  if (!Object.fromEntries) {
    Object.fromEntries = function (entries) {
      var out = {}
      if (Array.isArray(entries)) {
        for (var i = 0; i < entries.length; i++) out[entries[i][0]] = entries[i][1]
        return out
      }
      var iterator = entries[Symbol.iterator]()
      var step
      while (!(step = iterator.next()).done) out[step.value[0]] = step.value[1]
      return out
    }
  }

  /* Array.prototype.flat / flatMap — Chrome 69 */
  if (!Array.prototype.flat) {
    Object.defineProperty(Array.prototype, 'flat', {
      configurable: true,
      writable: true,
      value: function (depth) {
        var d = depth === undefined ? 1 : Number(depth) || 0
        var out = []
        for (var i = 0; i < this.length; i++) {
          var v = this[i]
          if (Array.isArray(v) && d > 0) out = out.concat(v.flat(d - 1))
          else if (i in this) out.push(v)
        }
        return out
      },
    })
  }
  if (!Array.prototype.flatMap) {
    Object.defineProperty(Array.prototype, 'flatMap', {
      configurable: true,
      writable: true,
      value: function (fn, thisArg) {
        return this.map(fn, thisArg).flat(1)
      },
    })
  }

  /* crypto.randomUUID — Chrome 92 (Android 12!). Every order line the app
   * creates gets an id from this, so on an older phone ordering anything at
   * all threw. Uses real entropy when the browser has it. */
  if (!window.crypto) window.crypto = {}
  if (typeof window.crypto.randomUUID !== 'function') {
    window.crypto.randomUUID = function () {
      var b = new Uint8Array(16)
      if (window.crypto.getRandomValues) {
        window.crypto.getRandomValues(b)
      } else {
        for (var j = 0; j < 16; j++) b[j] = Math.floor(Math.random() * 256)
      }
      b[6] = (b[6] & 0x0f) | 0x40 // version 4
      b[8] = (b[8] & 0x3f) | 0x80 // variant 1
      var hex = []
      for (var k = 0; k < 256; k++) hex[k] = (k + 0x100).toString(16).slice(1)
      return (
        hex[b[0]] + hex[b[1]] + hex[b[2]] + hex[b[3]] + '-' +
        hex[b[4]] + hex[b[5]] + '-' +
        hex[b[6]] + hex[b[7]] + '-' +
        hex[b[8]] + hex[b[9]] + '-' +
        hex[b[10]] + hex[b[11]] + hex[b[12]] + hex[b[13]] + hex[b[14]] + hex[b[15]]
      )
    }
  }

  /* structuredClone — Chrome 98. Only ever used here on plain JSON-ish
   * data, so a JSON round-trip is a faithful stand-in. */
  if (typeof window.structuredClone !== 'function') {
    window.structuredClone = function (value) {
      return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
    }
  }

  /* ResizeObserver — Chrome 64. Recharts' responsive containers need it, so
   * without it the admin charts throw and take the whole screen with them.
   * This is a genuine fallback rather than a no-op stub: it measures on the
   * next frame and on window resize, which is every case that matters here
   * (charts resize when the window does, not when a sibling div moves). */
  if (typeof window.ResizeObserver !== 'function') {
    window.ResizeObserver = function (callback) {
      var targets = []
      var self = this
      function emit() {
        if (!targets.length) return
        var entries = []
        for (var i = 0; i < targets.length; i++) {
          var r = targets[i].getBoundingClientRect()
          entries.push({
            target: targets[i],
            contentRect: r,
            borderBoxSize: [{ inlineSize: r.width, blockSize: r.height }],
            contentBoxSize: [{ inlineSize: r.width, blockSize: r.height }],
          })
        }
        callback(entries, self)
      }
      this.observe = function (el) {
        if (targets.indexOf(el) === -1) targets.push(el)
        window.requestAnimationFrame(emit)
      }
      this.unobserve = function (el) {
        var i = targets.indexOf(el)
        if (i !== -1) targets.splice(i, 1)
      }
      this.disconnect = function () {
        targets = []
        window.removeEventListener('resize', emit)
      }
      window.addEventListener('resize', emit)
    }
  }
})()
