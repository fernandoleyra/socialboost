/**
 * The browser helper: a script the person runs on their OWN LinkedIn activity page
 * (linkedin.com/in/<me>/recent-activity/all/) while logged in. It scrolls the page, opens
 * "…see more", reads their posts plus the visible counts, and hands back JSON to paste into
 * SocialBoost. It never likes, comments, posts or messages anything, and it only reads what the
 * browser already shows. Pure string so the UI can render it and tests can syntax-check it.
 *
 * Written as ES2020 with semicolons, no line comments and no template literals so it survives
 * being squashed into a one-line bookmarklet, and with DOM APIs only (no innerHTML) because
 * LinkedIn enforces Trusted Types.
 */
export const HELPER_SCRIPT = String.raw`(async function () {
  var MAX_POSTS = 200;
  if (!/(^|\.)linkedin\.com$/.test(location.hostname)) {
    alert("SocialBoost helper: open your own LinkedIn activity page first (linkedin.com/in/your-name/recent-activity/all/) and run it there.");
    return;
  }
  if (window.__socialboostHelper) { window.__socialboostHelper.show(); return; }

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var posts = new Map();
  var stopped = false;
  var finished = false;

  var css = function (el, s) { el.setAttribute("style", s); return el; };
  var make = function (tag, text, style) { var el = document.createElement(tag); if (text) { el.textContent = text; } if (style) { css(el, style); } return el; };
  var btnStyle = "border:0;border-radius:999px;padding:8px 14px;font:600 13px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;cursor:pointer;";
  var box = make("div", "", "position:fixed;right:20px;bottom:20px;z-index:2147483647;width:360px;max-width:calc(100vw - 40px);padding:16px;border-radius:20px;background:rgba(255,255,255,.95);color:#111;box-shadow:0 12px 40px rgba(0,0,0,.28);font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;");
  var title = make("div", "SocialBoost helper", "font-weight:700;font-size:15px;margin-bottom:4px;");
  var status = make("div", "Reading your posts…", "color:#444;margin-bottom:10px;");
  var counter = make("div", "0 posts", "font-size:28px;font-weight:700;margin-bottom:10px;");
  var area = make("textarea", "", "display:none;width:100%;height:120px;margin-bottom:10px;border:1px solid #ddd;border-radius:10px;padding:8px;font:12px ui-monospace,Menlo,monospace;color:#111;background:#fafafa;");
  area.readOnly = true;
  var row = make("div", "", "display:flex;gap:8px;flex-wrap:wrap;");
  var stopBtn = make("button", "Stop and copy", btnStyle + "background:#0a66c2;color:#fff;");
  var copyBtn = make("button", "Copy posts", btnStyle + "display:none;background:#0a66c2;color:#fff;");
  var closeBtn = make("button", "Close", btnStyle + "background:#eee;color:#111;");
  row.appendChild(stopBtn); row.appendChild(copyBtn); row.appendChild(closeBtn);
  box.appendChild(title); box.appendChild(status); box.appendChild(counter); box.appendChild(area); box.appendChild(row);
  document.body.appendChild(box);

  window.__socialboostHelper = { show: function () { box.style.display = "block"; } };
  closeBtn.onclick = function () { stopped = true; box.remove(); delete window.__socialboostHelper; };
  stopBtn.onclick = function () { stopped = true; stopBtn.disabled = true; stopBtn.textContent = "Finishing…"; };

  if (!/recent-activity/.test(location.pathname)) {
    status.textContent = "Tip: this works best on linkedin.com/in/your-name/recent-activity/all/ so it only sees your own posts.";
  }

  var num = function (s) {
    if (s === null || s === undefined) { return null; }
    var m = String(s).replace(/\s/g, "").match(/(\d[\d.,]*)([KkMm])?/);
    if (!m) { return null; }
    if (m[2]) { var f = parseFloat(m[1].replace(",", ".")); return isFinite(f) ? Math.round(f * (/m/i.test(m[2]) ? 1e6 : 1e3)) : null; }
    var n = parseInt(m[1].replace(/[.,]/g, ""), 10);
    return isFinite(n) ? n : null;
  };

  var dateOf = function (id) {
    try {
      var ms = Number(BigInt(id) >> BigInt(22));
      if (ms > 1.2e12 && ms < 4e12) { return new Date(ms).toISOString(); }
    } catch (e) { return null; }
    return null;
  };

  var ITEM = "[data-urn^='urn:li:activity:'], [data-id^='urn:li:activity:']";
  var NESTED = ".update-components-mini-update-v2, .feed-shared-mini-update-v2, .update-components-article, .feed-shared-update-v2__content .update-components-update-v2";
  var TEXT = [".update-components-text", ".feed-shared-inline-show-more-text", ".feed-shared-update-v2__description", ".feed-shared-text", "[data-test-id='main-feed-activity-card__commentary']"];
  var SEE_MORE_BTN = "button.feed-shared-inline-show-more-text__see-more-less-toggle, .feed-shared-inline-show-more-text button, .update-components-text button, button.see-more";

  var isOwn = function (el) {
    var header = el.querySelector(".update-components-header, .feed-shared-header");
    if (!header) { return true; }
    var t = (header.innerText || "").trim();
    return !t || /posted this|hat dies gepostet|publicó esto|a publié|publicou|ha pubblicato/i.test(t);
  };

  var textOf = function (el) {
    for (var i = 0; i < TEXT.length; i++) {
      var nodes = el.querySelectorAll(TEXT[i]);
      for (var j = 0; j < nodes.length; j++) {
        if (nodes[j].closest(NESTED)) { continue; }
        var t = (nodes[j].innerText || "").trim();
        if (t) {
          return t
            .replace(/\s*(…|\.\.\.)\s*(see more|more|mehr anzeigen|mehr|ver más|voir plus|ver mais|altro)\s*$/i, "")
            .replace(/hashtag#/g, "#")
            .trim();
        }
      }
    }
    return "";
  };

  var countsOf = function (el) {
    var bar = el.querySelector(".social-details-social-counts");
    var all = (el.innerText || "").replace(/ /g, " ");
    var im = all.match(/([\d.,]+\s*[KkMm]?)\s+(?:impressions?|Impressionen|impresiones|impressões|visualizzazioni)/i);
    if (!bar) { return { reactions: null, comments: null, reposts: null, impressions: im ? num(im[1]) : null }; }
    var txt = (bar.innerText || "").replace(/ /g, " ");
    var reactEl = el.querySelector(".social-details-social-counts__reactions-count");
    var reactions = reactEl ? num(reactEl.innerText) : null;
    if (reactions === null) {
      var o = txt.match(/(?:and|und|y|et|e)\s+([\d.,]+\s*[KkMm]?)\s+(?:others?|weitere|otras? personas|autres?|outras? pessoas|altri)/i);
      if (o) { var v = num(o[1]); reactions = v === null ? null : v + 1; }
    }
    if (reactions === null) { var r = txt.match(/^\s*([\d.,]+\s*[KkMm]?)\b/); reactions = r ? num(r[1]) : 0; }
    var cm = txt.match(/([\d.,]+\s*[KkMm]?)\s+(?:comments?|Kommentare?|comentarios?|commentaires?|comentários?|commenti)/i);
    var rp = txt.match(/([\d.,]+\s*[KkMm]?)\s+(?:reposts?|Reposts|veces compartido|partages?|compartilhamentos?|diffusioni)/i);
    return { reactions: reactions, comments: cm ? num(cm[1]) : 0, reposts: rp ? num(rp[1]) : 0, impressions: im ? num(im[1]) : null };
  };

  var items = function () {
    return Array.prototype.filter.call(document.querySelectorAll(ITEM), function (el) {
      return !(el.parentElement && el.parentElement.closest(ITEM));
    });
  };

  var collect = async function () {
    var list = items();
    var clicked = 0;
    list.forEach(function (el) {
      el.querySelectorAll(SEE_MORE_BTN).forEach(function (b) {
        var label = ((b.getAttribute("aria-label") || "") + " " + (b.innerText || "")).toLowerCase();
        if (b.getAttribute("aria-expanded") === "true" || /less|weniger|menos|moins|meno/.test(label)) { return; }
        b.click(); clicked++;
      });
    });
    if (clicked) { await sleep(350); }
    list.forEach(function (el) {
      var urn = el.getAttribute("data-urn") || el.getAttribute("data-id") || "";
      var id = urn.split(":").pop();
      if (!id || posts.has(id) || !isOwn(el)) { return; }
      var text = textOf(el);
      if (!text) { return; }
      var c = countsOf(el);
      posts.set(id, { text: text, url: "https://www.linkedin.com/feed/update/" + urn + "/", postedAt: dateOf(id), reactions: c.reactions, comments: c.comments, reposts: c.reposts, impressions: c.impressions });
    });
    counter.textContent = posts.size + (posts.size === 1 ? " post" : " posts");
  };

  var showMoreResults = function () {
    var buttons = document.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      if (/show more results|mehr ergebnisse|ver más resultados|afficher plus de résultats|mostrar mais resultados|mostra più risultati/i.test(buttons[i].innerText || "")) { return buttons[i]; }
    }
    return null;
  };

  var copy = function (json) {
    var fallback = function () { area.focus(); area.select(); try { document.execCommand("copy"); status.textContent = "Copied. Now paste it into SocialBoost → Voice → Browser helper."; } catch (e) { status.textContent = "Select the text above and copy it (Cmd/Ctrl+C)."; } };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () { status.textContent = "Copied. Now paste it into SocialBoost → Voice → Browser helper."; copyBtn.textContent = "Copied"; }, fallback);
    } else { fallback(); }
  };

  var finish = function () {
    if (finished) { return; }
    finished = true;
    var list = Array.from(posts.values());
    var json = JSON.stringify(list, null, 2);
    area.value = json;
    area.style.display = "block";
    stopBtn.style.display = "none";
    copyBtn.style.display = "inline-block";
    status.textContent = list.length ? "Done. Click Copy posts, then paste into SocialBoost → Voice → Browser helper." : "No posts found here. Open linkedin.com/in/your-name/recent-activity/all/ and try again.";
    copyBtn.onclick = function () { copy(json); };
    if (list.length) { copy(json); }
  };

  var idle = 0;
  for (var round = 0; round < 150 && !stopped && posts.size < MAX_POSTS; round++) {
    var before = posts.size;
    await collect();
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    var more = showMoreResults();
    if (more) { more.click(); }
    await sleep(1600 + Math.floor(Math.random() * 1200));
    idle = posts.size === before ? idle + 1 : 0;
    if (idle >= 4) { break; }
  }
  if (!box.isConnected) { return; }
  await collect();
  finish();
})();`;

/** The same script as a bookmarklet URL. `void 0` keeps the browser from replacing the page with the script's result. */
export function bookmarkletHref(): string {
  return "javascript:" + encodeURIComponent(HELPER_SCRIPT + "void 0;");
}
