// PERF ISSUE: Render-blocking synchronous script in <head>
// This runs before any content renders, blocking FCP.
(function () {
  var data = [];
  for (var i = 0; i < 10000; i++) {
    data.push({
      id: i,
      timestamp: Date.now(),
      value: Math.random() * 1000,
      hash: btoa(String(i)).repeat(3),
    });
  }
  window.__ANALYTICS_PRELOAD = data;
})();
