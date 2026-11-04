// オンラインランキングの通信（ブラウザ版）。ゲーム側の窓口は game/ranking.lua
// Lua → JS: Lua が print("@@rank@@" + JSON) → index.html の Module.print がここの handle に渡す
// JS → Lua: 返事を Lua の表を返すコードにして、メモリ上のファイル /rank_res_<id>.lua に書く（Lua が毎フレーム見に来る）
// 送り先: ゲームの game/ranking_config.lua の url（Google Apps Script、tools/web/ranking_gas.js）。
//         空で localhost から開いたときは tools/web/serve.js の試験用ランキング（/__ranking）
// 名前はこの端末の localStorage に覚える（最初に送るときに聞く）
window.rankingBridge = (function () {
  var PREFIX = "@@rank@@";
  var NAME_KEY = "starshooter_rank_name";
  var NAME_MAX = 10;

  function endpoint(url) {
    if (url) return url;
    var h = location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return "/__ranking";
    return null;
  }

  function clean(s) {
    return String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  }
  function getName() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch (e) { return ""; }
  }
  // 名前を聞く（キャンセルなら null）
  function askName() {
    var input = window.prompt("ランキングに載せる名前（" + NAME_MAX + " 文字まで）", getName());
    if (input === null) return null;
    var name = Array.from(clean(input)).slice(0, NAME_MAX).join("");
    if (!name) return null;
    try { localStorage.setItem(NAME_KEY, name); } catch (e) {}
    return name;
  }

  // JS の値 → Lua の式（文字列は制御文字を取り除いて JSON の書き方。Lua 5.1 でも読める）
  function toLua(v) {
    if (v === null || v === undefined) return "nil";
    if (typeof v === "number") return isFinite(v) ? String(v) : "0";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string") return JSON.stringify(clean(v));
    if (Array.isArray(v)) return "{" + v.map(toLua).join(",") + "}";
    var parts = [];
    for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) parts.push("[" + JSON.stringify(clean(k)) + "]=" + toLua(v[k]));
    return "{" + parts.join(",") + "}";
  }

  function respond(id, res) {
    var name = "rank_res_" + id + ".lua";
    var bytes = new TextEncoder().encode("return " + toLua(res));
    try { Module.FS_unlink("/" + name); } catch (e) {}
    Module.FS_createDataFile("/", name, bytes, true, true, true);
  }

  async function post(url, body) {
    // text/plain にすると事前確認（CORS の preflight）が無く、Apps Script にそのまま届く
    var r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  async function get(url, params) {
    var q = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
    var r = await fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + q, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function run(req) {
    var url = endpoint(req.url);
    if (req.op === "rename") {
      var name = askName();
      return name ? { ok: true, name: name } : { ok: false, cancel: true };
    }
    if (!url) return { ok: false, error: "no url" };
    if (req.op === "list") {
      var res = await get(url, { board: req.board });
      res.me = getName() || null;
      return res;
    }
    if (req.op === "submit") {
      var who = getName() || askName();
      if (!who) return { ok: false, cancel: true };
      return post(url, {
        op: "submit", board: req.board, name: who, value: req.value,
        ship: req.ship || "", level: req.level || 0, kills: req.kills || 0,
      });
    }
    return { ok: false, error: "unknown op" };
  }

  function handle(text) {
    // dev/log が print の前に時刻などを付けるので、行の途中からでも探す
    var at = typeof text === "string" ? text.indexOf(PREFIX) : -1;
    if (at < 0) return false;
    var req;
    try { req = JSON.parse(text.slice(at + PREFIX.length)); } catch (e) { console.error("ranking: bad request", text); return true; }
    // prompt を Lua の処理の途中で出さないよう、次の機会に回す
    setTimeout(function () {
      run(req).then(function (res) { respond(req.id, res || { ok: false }); }, function (err) {
        console.error("ranking:", err);
        respond(req.id, { ok: false, error: String(err && err.message || err) });
      });
    }, 0);
    return true;
  }

  // 起動前に呼ぶ（index.html の Module.preRun）。localhost なら試験用ランキングがあることをゲームに知らせる
  function prepare() {
    if (endpoint("") === "/__ranking") Module.FS_createDataFile("/", "rank_local", new Uint8Array([49]), true, true, true);
  }

  return { handle: handle, prepare: prepare };
})();
