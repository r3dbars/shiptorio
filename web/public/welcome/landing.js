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

  // The loop loads after the page does, so it never slows the first paint. Phones get a lighter cut
  // and wait for the first scroll or tap, so nobody pays 1MB of video just for opening the page.
  var video = document.getElementById("loop"), toggle = document.getElementById("toggle");
  var still = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.connection && navigator.connection.saveData);
  var phone = matchMedia("(max-width: 759px)").matches, started = false;
  var start = function (play) {
    if (started) return;
    started = true;
    video.src = phone ? "/welcome/loop-640.mp4" : "/welcome/loop.mp4";
    video.addEventListener("playing", function () { video.classList.add("on"); toggle.textContent = "Pause"; });
    if (!play) return;
    video.play().catch(function () { toggle.textContent = "Play"; });
  };
  toggle.hidden = false;
  toggle.textContent = "Play";
  toggle.addEventListener("click", function () {
    if (!started) return start(true);
    if (video.paused) video.play(); else { video.pause(); toggle.textContent = "Play"; }
  });
  if (still) return;
  var go = function () { setTimeout(function () { start(true); }, 300); };
  if (phone) ["scroll", "touchstart", "pointerdown", "keydown"].forEach(function (e) { addEventListener(e, function () { start(true); }, { once: true, passive: true }); });
  else if (document.readyState === "complete") go(); else addEventListener("load", go);
})();
