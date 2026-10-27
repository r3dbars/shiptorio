(function () {
  var form = document.getElementById("join"), note = document.getElementById("note");
  var say = function (text, kind) { note.textContent = text; note.className = "note" + (kind ? " " + kind : ""); };
  if (/[?&]joined=1/.test(location.search)) say("You're on the list. We'll email you when your island is ready.", "ok");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = form.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say("That email doesn't look right. Try again?", "err"); form.email.focus(); return; }
    var button = form.querySelector("button"); button.disabled = true; say("Joining…");
    fetch("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email, website: form.website.value, ref: document.referrer.slice(0, 200) }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); })
      .then(function (r) {
        if (r.ok) { say("You're on the list. We'll email you when your island is ready.", "ok"); form.reset(); }
        else say(r.status === 429 ? "Too many tries from here. Give it an hour." : (r.body.error || "That didn't work. Try again in a minute."), "err");
      })
      .catch(function () { say("Couldn't reach the factory. Check your connection and try again.", "err"); })
      .then(function () { button.disabled = false; });
  });

  // The still paints first. The quiet loop of the same view fades in after load, never under
  // reduced motion or Save-Data. Phones get the tall cut.
  var video = document.getElementById("loop"), toggle = document.getElementById("toggle");
  var PLAY = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1h2v1h2v1h2v1h2v1h1v2h-1v1h-2v1h-2v1h-2v1h-2z"/></svg>';
  var PAUSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1h3v10h-3zM7 1h3v10h-3z"/></svg>';
  var show = function (on) { toggle.innerHTML = on ? PAUSE : PLAY; toggle.setAttribute("aria-label", on ? "Pause the factory" : "Play the factory"); };
  var still = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.connection && navigator.connection.saveData);
  var started = false;
  var start = function () {
    if (started) return;
    started = true;
    video.src = matchMedia("(max-width: 759px)").matches ? "/welcome/hero-phone.mp4" : "/welcome/hero.mp4";
    video.addEventListener("playing", function () { video.classList.add("on"); show(true); });
    video.addEventListener("pause", function () { show(false); });
    video.play().catch(function () { show(false); });
  };
  toggle.hidden = false;
  show(false);
  toggle.addEventListener("click", function () {
    if (!started) return start();
    if (video.paused) video.play(); else video.pause();
  });
  if (still) return;
  var go = function () { setTimeout(start, 300); };
  if (document.readyState === "complete") go(); else addEventListener("load", go);
})();
