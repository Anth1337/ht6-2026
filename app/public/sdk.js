/**
 * SunPay embed SDK (spec §9: GET /sdk.js — public).
 *
 * Usage on a merchant page:
 *   <script src="http://localhost:3000/sdk.js"
 *           data-target="#sunpay-button"
 *           data-handoff-endpoint="/api/handoff/ORDER_ID"></script>
 *
 * The merchant's own server builds and HMAC-signs the handoff URL at the
 * endpoint above — the shared secret never reaches the browser. This script
 * only renders the button and navigates to the signed URL.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var targetSel = script.dataset.target || "#sunpay-button";
  var endpoint = script.dataset.handoffEndpoint;
  var mount = document.querySelector(targetSel);
  if (!mount || !endpoint) return;

  // sdk.js is served from SunPay's origin, so the wordmark is loaded from there
  // too (the merchant page has no copy of the asset).
  var origin = new URL(script.src, window.location.href).origin;

  var btn = document.createElement("a");
  btn.href = "#";
  btn.setAttribute(
    "style",
    [
      "box-sizing:border-box", "display:flex", "width:100%",
      "align-items:center", "justify-content:center", "gap:10px",
      "padding:14px 22px", "border-radius:999px", "font-size:16px",
      "font-weight:700", "font-family:inherit", "color:#f5efe3",
      "text-decoration:none", "background:#0d0d0d", "cursor:pointer",
    ].join(";")
  );
  // Klarna-style pill: "Split with [sunpay]" — dark pill, cream wordmark chip.
  function renderIdle() {
    btn.innerHTML =
      '<span>Split with</span>' +
      '<span style="display:inline-flex;align-items:center;background:#fdf8ee;' +
      'border-radius:8px;padding:4px 10px">' +
      '<img src="' + origin + '/sunpay-wordmark.png" alt="SunPay" ' +
      'style="height:24px;display:block"></span>';
  }
  function renderBusy() {
    btn.textContent = "Connecting to SunPay…";
  }
  renderIdle();
  btn.addEventListener("mouseenter", function () { btn.style.background = "#1a1a1a"; });
  btn.addEventListener("mouseleave", function () { btn.style.background = "#0d0d0d"; });
  btn.addEventListener("click", function (e) {
    e.preventDefault();
    renderBusy();
    fetch(endpoint)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.url) window.location.href = j.url;
        else renderIdle();
      })
      .catch(function () { renderIdle(); });
  });
  mount.appendChild(btn);
})();
