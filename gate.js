// 公開版（GitHub Pages）のパスワードの入り口。tools\web_publish.py が {{...}} を埋めて index.html の前に読ませる。
// game.data は AES-256-GCM で暗号化した game.data.enc（先頭 12 バイトが IV）として置き、ここで復号して
// Module.gameData に渡す（game.js はそれがあればダウンロードせずに使う）。
// 鍵の作り方・保存場所は競馬予想サイト（tmp4/src/publish/crypto.py）と同じなので、
// 同じ端末であちらでパスワードを入れていれば、ここでは入力しなくてよい
window.gate = function (Module, start) {
  var SALT = "ZXu0gWUZwveeFGdHmV8PxQ==", ITERS = 300000, SS = "keiba_site_key";
  var loading = document.getElementById("loading");

  function b64(s) {
    var bin = atob(s), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function hex(a) {
    return Array.from(new Uint8Array(a)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
  }
  function unhex(s) {
    var a = new Uint8Array(s.length / 2);
    for (var i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16);
    return a;
  }

  var encrypted = null;
  function fetchData() {
    if (!encrypted) {
      loading.textContent = "読み込み中…";
      encrypted = fetch("game.data.enc", { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error("download failed: " + r.status);
        return r.arrayBuffer();
      });
    }
    return encrypted;
  }
  async function deriveBits(pw) {
    var km = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    return crypto.subtle.deriveBits({ name: "PBKDF2", salt: b64(SALT), iterations: ITERS, hash: "SHA-256" }, km, 256);
  }
  async function decrypt(raw) {
    var buf = await fetchData();
    var key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(buf, 0, 12) }, key, new Uint8Array(buf, 12));
  }
  function open(data, raw) {
    try { localStorage.setItem(SS, hex(raw)); } catch (e) {}
    var form = document.getElementById("gate");
    if (form) form.remove();
    Module.gameData = data;
    start();
  }

  function showForm() {
    loading.style.display = "none";
    var box = document.createElement("form");
    box.id = "gate";
    box.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;" +
      "justify-content:center;gap:12px;color:#8ec3e3;font:16px sans-serif;z-index:5";
    box.innerHTML = '<div>パスワードを入力してください</div>' +
      '<input type="password" id="gate-pw" autocomplete="current-password" ' +
      'style="width:min(80vw,280px);padding:10px;font-size:16px;border-radius:8px;border:1px solid #446">' +
      '<button id="gate-btn" style="width:min(80vw,280px);padding:10px;font-size:15px;border:none;' +
      'border-radius:8px;background:#2563eb;color:#fff">開く</button>' +
      '<div id="gate-err" style="color:#f87171;min-height:1.2em;font-size:13px"></div>';
    document.body.appendChild(box);
    box.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var btn = document.getElementById("gate-btn"), err = document.getElementById("gate-err");
      btn.disabled = true;
      err.textContent = "確認中…";
      deriveBits(document.getElementById("gate-pw").value).then(function (raw) {
        return decrypt(raw).then(function (data) { open(data, raw); });
      }).catch(function () {
        err.textContent = "パスワードが違います";
        btn.disabled = false;
      });
    });
    document.getElementById("gate-pw").focus();
  }

  var saved = null;
  try { saved = localStorage.getItem(SS); } catch (e) {}
  if (saved) {
    var raw = unhex(saved).buffer;
    decrypt(raw).then(function (data) { open(data, raw); }).catch(function (e) {
      if (e && e.name === "OperationError") {
        // 鍵が合わない（パスワードが変わった）ときだけ捨てて入力してもらう
        try { localStorage.removeItem(SS); } catch (e2) {}
        showForm();
      } else {
        loading.textContent = "読み込めませんでした。\nページを読み込み直してください。";
      }
    });
  } else {
    showForm();
  }
};
