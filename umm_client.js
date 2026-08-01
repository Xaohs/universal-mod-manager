"use strict";

// =====================================================================
// UMM client library - Universal Mod Manager
//
// Optional convenience library. The recommended way to integrate is the
// copy-paste snippet at https://xaohs.github.io/universal-mod-manager/authors/
// integration/, with no file to vendor or sync. This
// wrapper is for authors with lots of settings who'd rather use a
// UMM.register() API; both speak the same umm:1 bus protocol.
//
// Source of truth: umm/umm_client.js. Copy it into your mod's
// src/panorama/scripts/ and include it from your layout before your own script:
//
//   <scripts>
//     <include src="s2r://panorama/scripts/umm_client.vjs_c" />
//     <include src="s2r://panorama/scripts/your_mod.vjs_c" />
//   </scripts>
//
// Copy it rather than including it out of UMM's VPK: a cross-VPK include only
// resolves when UMM is installed, and if it's absent the include fails and
// takes your whole layout down with it. This file has no dependencies and falls
// back to your declared defaults when UMM isn't installed.
//
// Usage:
//
//   var settings = UMM.register({
//     id: "your_mod",                 // stable; namespaces your stored values
//     name: "Your Mod",               // shown as the tab title
//     settings: [
//       { id: "enabled", type: "toggle", label: "Enabled", default: true,
//         description: "Optional. Shown as a tooltip when the row is hovered." },
//       { id: "opacity", type: "slider", label: "Opacity",
//         min: 20, max: 100, step: 5, default: 90, unit: "%" },
//       { id: "corner",  type: "select", label: "Corner", default: "tl",
//         options: [ { value: "tl", label: "Top Left" },
//                    { value: "tr", label: "Top Right" } ] }
//     ],
//     onChange: function (key, value, all) { /* apply it */ }
//   });
//
//   settings.get("opacity");   // current value, or the declared default
//
// register() fires onChange once per setting with the declared default, then
// again for every value UMM pushes back that differs from it, then on every
// change after that. So there's only ever one code path to write: react to
// onChange, and keep it idempotent. Never read your settings before registering.
// =====================================================================

var UMM = (function () {

  // The only broadcast channel Panorama gives us. ClientUI_FireOutput is a real
  // engine-declared event that happens to carry a string payload; arbitrary
  // event names aren't dispatchable. Every mod framework piggybacks on it, so
  // namespacing has to live inside the payload (the `umm` field below) and we
  // have to tolerate other mods' traffic on the same channel.
  //
  // This is the only thing that crosses panel contexts. GameUI.CustomUIConfig()
  // looks like shared state but is per-context, so the manifest has to travel
  // inside the register message itself.
  var CHANNEL = "ClientUI_FireOutput";
  var PROTOCOL = 1;

  // Registered mods in THIS panel context, keyed by mod id.
  var mods = Object.create(null);
  var subscribed = false;


  function send(payload) {
    try { $.DispatchEvent(CHANNEL, JSON.stringify(payload)); } catch (e) {}
  }

  // Strip everything down to plain data, since this has to survive a JSON round-trip.
  function plainSettings(manifest) {
    var settings = [];
    for (var i = 0; i < manifest.settings.length; i++) {
      var s = manifest.settings[i];
      // A group is a titled divider, not a control, so it carries only a label.
      if (s.type === "group") {
        settings.push({ type: "group", label: String(s.label || "") });
        continue;
      }
      // A "checks" row is a composite with NO id/value of its own: it renders
      // several boolean options, each backed by its own setting id. Serialize
      // the label/description plus the options (id/label/default); the seed and
      // default loops below descend into these.
      if (s.type === "checks") {
        var checks = { type: "checks", label: String(s.label || ""), options: [] };
        if (s.description) checks.description = String(s.description);
        for (var ci = 0; ci < (s.options || []).length; ci++) {
          var co = s.options[ci];
          checks.options.push({
            id: String(co.id),
            label: String(co.label || co.id),
            "default": co["default"]
          });
        }
        settings.push(checks);
        continue;
      }
      var out = {
        id: String(s.id),
        type: String(s.type),
        label: String(s.label || s.id),
        "default": s["default"]
      };
      // Optional. UMM shows it as a hover tooltip on the row; a mod that omits
      // it gets a row with no tooltip.
      if (s.description) out.description = String(s.description);
      if (s.type === "slider") {
        out.min = Number(s.min);
        out.max = Number(s.max);
        out.step = Number(s.step) > 0 ? Number(s.step) : 1;
        if (s.unit) out.unit = String(s.unit);
      } else if (s.type === "select") {
        // Optional rendering hints, forwarded so a mod can request them:
        //   icons: "hero" - draw a portrait per option (needs a per-option img)
        //   sort:  true   - list options alphabetically by label
        if (s.icons) out.icons = String(s.icons);
        if (s.sort) out.sort = true;
        out.options = [];
        for (var j = 0; j < (s.options || []).length; j++) {
          var o = s.options[j];
          var opt = { value: o.value, label: String(o.label) };
          if (o.img) opt.img = String(o.img);
          out.options.push(opt);
        }
      }
      settings.push(out);
    }
    return settings;
  }

  function announce(entry) {
    send({
      umm: PROTOCOL,
      t: "register",
      id: entry.id,
      name: entry.name,
      settings: entry.settings,
      values: entry.values
    });
  }

  function fire(entry, key, value) {
    if (typeof entry.onChange !== "function") return;
    try { entry.onChange(key, value, entry.values); } catch (e) {
      try { $.Msg("[UMM] onChange threw for " + entry.id + "." + key + ": " + e); } catch (e2) {}
    }
  }

  // Other mods share this channel, so bail out cheaply on anything that isn't
  // ours and never let a malformed third-party payload throw out of here.
  function onBusMessage(payload) {
    if (typeof payload !== "string" || payload.indexOf("\"umm\"") === -1) return;
    var msg;
    try { msg = JSON.parse(payload); } catch (e) { return; }
    if (!msg || msg.umm !== PROTOCOL) return;

    if (msg.t === "set") {
      var entry = mods[msg.id];
      if (!entry) return;
      if (entry.values[msg.key] === msg.value) return;
      entry.values[msg.key] = msg.value;
      fire(entry, msg.key, msg.value);
      return;
    }

    // UMM booted after us and has no idea we exist. Say it again.
    if (msg.t === "hello") {
      for (var id in mods) announce(mods[id]);
    }
  }

  function ensureBus() {
    if (subscribed) return;
    subscribed = true;
    try { $.RegisterForUnhandledEvent(CHANNEL, onBusMessage); } catch (e) {}
  }

  // Register a mod and its settings schema. Safe to call again with the same
  // id (a layout can be instantiated many times): the manifest is simply
  // overwritten and UMM dedupes.
  function register(manifest) {
    if (!manifest || !manifest.id || !manifest.settings) {
      try { $.Msg("[UMM] register() needs { id, settings }"); } catch (e) {}
      return null;
    }

    var id = String(manifest.id);
    var settings = plainSettings(manifest);

    // Start from the declared defaults. If UMM is already running and holds a
    // value the user picked earlier this session, it answers our announce with
    // a `set` and we converge on that instead.
    var values = {};
    for (var i = 0; i < settings.length; i++) {
      var si = settings[i];
      if (si.type === "group") continue;   // no value
      // A "checks" row has no value; seed each option id like a toggle.
      if (si.type === "checks") {
        for (var ci = 0; ci < (si.options || []).length; ci++)
          values[si.options[ci].id] = si.options[ci]["default"];
        continue;
      }
      values[si.id] = si["default"];
    }

    var entry = {
      id: id,
      name: String(manifest.name || id),
      settings: settings,
      values: values,
      onChange: manifest.onChange
    };
    mods[id] = entry;

    ensureBus();

    // Apply defaults immediately so the mod is in a good state even if UMM is
    // not installed at all. Anything UMM has stored arrives right after, as a
    // `set` per setting, and simply overwrites.
    for (var j = 0; j < settings.length; j++) {
      var sj = settings[j];
      if (sj.type === "group") continue;
      // A "checks" row has no value; fire each option id like a toggle.
      if (sj.type === "checks") {
        for (var cj = 0; cj < (sj.options || []).length; cj++) {
          var ck = sj.options[cj].id;
          fire(entry, ck, values[ck]);
        }
        continue;
      }
      var key = sj.id;
      fire(entry, key, values[key]);
    }

    announce(entry);

    return {
      get: function (key) { return entry.values[key]; },
      all: function () { return entry.values; }
    };
  }

  function get(modId, key) {
    var entry = mods[modId];
    return entry ? entry.values[key] : undefined;
  }

  return { register: register, get: get, PROTOCOL: PROTOCOL };
})();
