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

  var btn = document.createElement("a");
  btn.href = "#";
  btn.textContent = "⚡ Split with SunPay";
  btn.setAttribute(
    "style",
    [
      "display:block", "text-align:center", "padding:13px 18px",
      "border-radius:8px", "font-size:16px", "font-weight:600",
      "font-family:inherit", "color:#fff", "text-decoration:none",
      "background:linear-gradient(90deg,#f59e0b,#f97316)", "cursor:pointer",
    ].join(";")
  );
  btn.addEventListener("click", function (e) {
    e.preventDefault();
    btn.textContent = "Connecting to SunPay…";
    fetch(endpoint)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.url) window.location.href = j.url;
        else btn.textContent = "⚡ Split with SunPay";
      })
      .catch(function () { btn.textContent = "⚡ Split with SunPay"; });
  });
  mount.appendChild(btn);
})();
