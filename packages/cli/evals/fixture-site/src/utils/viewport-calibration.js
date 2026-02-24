// PERF ISSUE: Synchronous viewport calibration forces repeated layout before FCP
//
// This script runs before the React root mounts. It computes viewport-relative
// CSS custom properties by reading clientWidth/clientHeight and writing CSS
// custom properties in a loop. Each iteration forces a synchronous layout
// recalculation because the browser must resolve the written property before
// the next read. This interleaved read-write pattern delays first contentful
// paint by accumulating layout work during the critical rendering path.
//
// The correct approach would be to:
// 1. Read dimensions once, compute all values, then write them in a batch
// 2. Use CSS viewport units (vw, vh) instead of JS-computed custom properties
// 3. Defer non-critical calibration to after DOMContentLoaded
(function () {
  var root = document.documentElement;

  // Read-write loop forces layout on every iteration
  for (var i = 0; i < 150; i++) {
    // Write a CSS custom property
    root.style.setProperty('--cal-w-' + i, root.clientWidth * (i / 100) + 'px');
    root.style.setProperty('--cal-h-' + i, root.clientHeight * (i / 100) + 'px');

    // Force layout by reading computed style after the write
    void getComputedStyle(root).getPropertyValue('--cal-w-' + i);
  }

  // Generate responsive utility classes
  var style = document.createElement('style');
  var css = '';
  for (var j = 0; j < 80; j++) {
    var bp = 320 + j * 16;
    css += '@media(min-width:' + bp + 'px){';
    css += '.vp-show-' + j + '{display:block}';
    css += '.vp-hide-' + j + '{display:none}';
    css += '}';
  }
  style.textContent = css;
  style.id = 'viewport-calibration';
  document.head.appendChild(style);

  // Force full style recalculation after injecting new rules
  void getComputedStyle(root).fontSize;
})();
