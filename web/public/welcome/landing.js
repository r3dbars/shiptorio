(function () {
  var form = document.getElementById("join"), note = document.getElementById("note");
  var dialog = document.getElementById("signup-dialog");
  document.getElementById("open-signup").addEventListener("click", function () { dialog.showModal(); });
  dialog.addEventListener("click", function (event) {
    var box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
  });
  var say = function (text, kind) { note.textContent = text; note.className = "note" + (kind ? " " + kind : ""); };
  if (/[?&]joined=1/.test(location.search)) { dialog.showModal(); say("You're on the list. We'll email you when your island is ready.", "ok"); }
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

  // A recording of our own music and SFX engine. Only an explicit click starts audio.
  var audio = document.getElementById("game-audio"), soundToggle = document.getElementById("sound-toggle");
  audio.loop = true; audio.preload = "none"; audio.volume = 0.8;
  var speaker = '<path d="M3 8h4l5-4v16l-5-4H3z"/>';
  var showSound = function () {
    var playing = !audio.paused;
    soundToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + speaker + (playing ? '<path d="M16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/>' : '<path d="m16 9 6 6m0-6-6 6"/>') + '</svg>';
    var label = playing ? "Mute game music and sounds" : "Unmute game music and sounds";
    soundToggle.setAttribute("aria-label", label); soundToggle.title = label;
    soundToggle.setAttribute("aria-pressed", String(playing));
  };
  soundToggle.hidden = false; showSound();
  soundToggle.addEventListener("click", function () {
    if (!audio.paused) return audio.pause();
    if (!audio.getAttribute("src")) audio.src = "/welcome/factory-audio.m4a";
    audio.play().catch(function () { showSound(); soundToggle.title = "Audio unavailable. Click to try again."; });
  });
  audio.addEventListener("play", showSound); audio.addEventListener("pause", showSound);
  document.addEventListener("visibilitychange", function () { if (document.hidden) audio.pause(); });

  // The still paints first. The quiet loop of the same view fades in after load, never under
  // reduced motion or Save-Data. Phones get the tall cut.
  var video = document.getElementById("loop"), toggle = document.getElementById("toggle");
  var PLAY = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1h2v1h2v1h2v1h2v1h1v2h-1v1h-2v1h-2v1h-2v1h-2z"/></svg>';
  var PAUSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1h3v10h-3zM7 1h3v10h-3z"/></svg>';
  var show = function (on) { toggle.innerHTML = on ? PAUSE : PLAY; var label = on ? "Pause the factory" : "Play the factory"; toggle.setAttribute("aria-label", label); toggle.title = label; };
  var still = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.connection && navigator.connection.saveData);
  var started = false;
  var start = function () {
    if (started) return;
    started = true;
    video.src = matchMedia("(max-width: 759px)").matches ? "/welcome/factory-phone-loop.mp4" : "/welcome/factory-loop.mp4";
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
