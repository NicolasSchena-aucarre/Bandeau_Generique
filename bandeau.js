/* ==========================================================
   bandeau.js — bandeau de navigation pour widgets Grist (version 1.0.0)

   Ce fichier est publié dans le dossier v1/. Les mises à jour de v1/ restent COMPATIBLES : corrections et ajouts
   seulement. Tout changement qui casserait un widget existant sera publié dans un nouveau dossier (v2/).

   UTILISATION, dans le <head> d'un widget personnalisé, APRÈS le script de l'API Grist :

     <script src="https://grist.example/grist-plugin-api.js"></script>
     <script src="https://VOTRE-HEBERGEMENT/v1/bandeau.js" data-titre="Nom du widget"></script>

   et, dans le widget :  grist.ready({ requiredAccess: "full" });

   - data-titre est facultatif : il s'ajoute au titre du menu (« Titre du menu - Nom du widget »).
   - Tout le reste (titre du menu, logo, couleurs, liens, rôles) est lu dans les tables du
     document : Bandeau_config, Bandeau_liens et la table des personnes. Aucun fichier à régénérer.
   - Le fichier n'appelle aucun service externe et n'utilise aucune police web.
   - Dépannage : dans la console du widget, taper  BandeauMenu.etat()

   Les rôles ne servent qu'à masquer des liens dans le menu : ce n'est PAS une sécurité.
   La vraie protection reste dans les règles d'accès de Grist.
   ========================================================== */
(function () {
  "use strict";

  var NOM = "BandeauMenu";
  if (window[NOM]) return;   // fichier chargé deux fois : une seule instance

  var VERSION = "bandeau-1.0.0";
  var T_CONFIG = "Bandeau_config", T_LIENS = "Bandeau_liens";
  var DELAIS = [0, 400, 1000, 2000, 4000, 8000];   // le widget peut appeler grist.ready() après le chargement de ce fichier
  var DELAI_LECTURE = 5000;                         // une lecture sans réponse est abandonnée puis retentée
  var DEFAUT = { fond: "#ffffff", texte: "#111111", accent: "#005fcc" };

  var script = document.currentScript || document.querySelector("script[src*='bandeau'][data-titre]");
  var titreWidget = script ? (script.getAttribute("data-titre") || "").trim() : "";

  var ui = null;   // éléments du bandeau, une fois construit
  var donnees = null, erreurLecture = "";

  // ---------- Utilitaires ----------
  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function msg(e) { return e && e.message ? e.message : String(e); }
  function vide(v) { return v === undefined || v === null || v === ""; }
  function normaliser(s) { return String(s == null ? "" : s).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function liste(v) {   // texte ou liste de choix Grist ["L", "a", "b"] ; ["C"] = cellule masquée
    if (typeof v === "string") return v.trim() ? [v.trim()] : [];
    if (!Array.isArray(v) || v[0] === "C") return [];
    return (v[0] === "L" ? v.slice(1) : v).filter(function (x) { return !vide(x); });
  }
  function urlHttps(u) {
    u = String(u == null ? "" : u).trim();
    if (!/^https:\/\/[^\s]+$/i.test(u)) return "";
    try { return new URL(u).protocol === "https:" ? u : ""; } catch (e) { return ""; }
  }
  function couleur(v, defaut) { return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v || "").trim()) ? String(v).trim() : defaut; }   // jamais de valeur libre dans le CSS
  function lignes(t) {
    var cles = Object.keys(t).filter(function (c) { return c !== "id"; });
    return t.id.map(function (id, i) { var l = { id: id }; cles.forEach(function (c) { l[c] = t[c][i]; }); return l; });
  }
  function avecDelai(p) {
    return new Promise(function (ok, ko) {
      var t = setTimeout(function () { ko(new Error("délai dépassé")); }, DELAI_LECTURE);
      p.then(function (v) { clearTimeout(t); ok(v); }, function (e) { clearTimeout(t); ko(e); });
    });
  }
  function trierLiens(liens) {   // par Ordre ; sans Ordre : après, dans l'ordre de la table
    return liens.map(function (l, i) { return { l: l, i: i }; }).sort(function (a, b) {
      var oa = vide(a.l.Ordre), ob = vide(b.l.Ordre);
      if (oa && ob) return a.i - b.i;
      if (oa) return 1;
      if (ob) return -1;
      return (Number(a.l.Ordre) - Number(b.l.Ordre)) || (a.i - b.i);
    }).map(function (x) { return x.l; });
  }
  // Adresse d'une page du document, déduite de l'adresse d'accès à l'API que Grist fournit :
  //   https://hote/o/org/api/docs/ID  ->  https://hote/o/org/ID/p/N
  function urlPage(base, n) {
    if (!/\/api\/docs\//.test(base || "")) return "";
    return base.replace(/\/api\/docs\//, "/").replace(/\/+$/, "") + "/p/" + n;
  }
  function identite(m) {
    if (!m) return { label: "Non identifié·e", initiales: "?" };
    var complet = String(m.nomComplet || "").trim(), prenom = String(m.prenom || "").trim(), nom = String(m.nom || "").trim();
    var initiales = prenom.charAt(0) + nom.charAt(0);
    if (complet) { var mots = complet.split(/\s+/); initiales = mots[0].charAt(0) + (mots.length > 1 ? mots[mots.length - 1].charAt(0) : ""); }
    return { label: complet || (prenom + " " + nom).trim(), initiales: initiales.toUpperCase() };
  }

  // ---------- Lecture des tables ----------
  // La personne connectée est LA seule ligne dont l'Email est lisible (les autres sont masqués
  // par une règle d'accès). S'il y en a plusieurs ou aucune, on ne devine pas.
  function personne(tab, cfg) {
    var emails = tab[cfg["users.email"]];
    if (!emails) return null;
    var vis = [];
    emails.forEach(function (v, i) { if (typeof v === "string" && v.indexOf("@") > 0) vis.push(i); });
    if (vis.length !== 1) return null;
    var k = vis[0];
    function champ(cle) { var c = cfg[cle] && tab[cfg[cle]]; return c ? c[k] : ""; }
    var roles = [];
    if (cfg["users.role"] && tab[cfg["users.role"]]) roles = liste(tab[cfg["users.role"]][k]);
    return { nomComplet: champ("users.nom_complet"), prenom: champ("users.prenom"), nom: champ("users.nom"), roles: roles };
  }

  async function lireTout() {
    var g = window.grist;
    if (!g || !g.docApi || typeof g.docApi.fetchTable !== "function") throw new Error("API Grist absente (le widget doit charger grist-plugin-api.js)");
    var cfg = {};
    lignes(await avecDelai(g.docApi.fetchTable(T_CONFIG))).forEach(function (l) { if (!vide(l.Cle)) cfg[l.Cle] = vide(l.Valeur) ? "" : String(l.Valeur); });
    var liens = lignes(await avecDelai(g.docApi.fetchTable(T_LIENS)));
    var aPersonnes = !!(cfg["users.table"] && cfg["users.email"]), moi = null;
    if (aPersonnes) {
      try { moi = personne(await avecDelai(g.docApi.fetchTable(cfg["users.table"])), cfg); }
      catch (e) { console.warn("[bandeau] table des personnes illisible :", msg(e)); }
    }
    var base = "";
    if (liens.some(function (l) { return vide(l.Url) && Number(l.Page) > 0; })) {
      try { base = (await avecDelai(g.docApi.getAccessToken({ readOnly: true }))).baseUrl || ""; }
      catch (e) { console.warn("[bandeau] adresse du document introuvable : les liens vers des pages sont ignorés (" + msg(e) + ")"); }
    }
    return { cfg: cfg, liens: liens, aPersonnes: aPersonnes, moi: moi, base: base };
  }

  function preparerLiens(d) {
    var roles = d.moi ? d.moi.roles.map(normaliser).filter(Boolean) : [];
    return trierLiens(d.liens).filter(function (l) { return l.Actif && !vide(l.Titre); }).map(function (l) {
      var href = !vide(l.Url) ? urlHttps(l.Url) : (Number(l.Page) > 0 ? urlPage(d.base, Number(l.Page)) : "");
      if (!href) return null;
      return { nom: String(l.Titre).trim(), href: href, nouvelOnglet: !!l.Nouvel_onglet, icone: vide(l.Icone) ? "" : String(l.Icone).trim(),
        roles: liste(l.Roles).map(normaliser).filter(Boolean) };
    }).filter(Boolean).filter(function (l) {
      return !l.roles.length || l.roles.some(function (r) { return roles.indexOf(r) !== -1; });   // rôle inconnu : seuls les liens sans rôle
    });
  }

  // ---------- Style (valeurs de couleur validées, jamais de texte libre) ----------
  function feuille(c) {
    return [
      ":host{ display:block; position:sticky; top:0; z-index:20; font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif; --f:" + c.fond + "; --t:" + c.texte + "; --a:" + c.accent + "; }",
      "*{ box-sizing:border-box; }",
      "[hidden]{ display:none !important; }",
      ".bm-header{ background:var(--f); color:var(--t); border-bottom:2px solid var(--a); padding:0 16px; }",
      ".bm-inner{ max-width:1240px; margin:0 auto; min-height:56px; display:flex; align-items:center; gap:16px; padding:8px 0; }",
      ".bm-logo{ height:32px; max-width:160px; width:auto; object-fit:contain; display:block; flex:none; }",
      ".bm-titre{ flex:1 1 auto; min-width:0; font-size:16px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }",
      ".bm-droite{ display:flex; align-items:center; gap:12px; flex:none; margin-left:auto; }",
      ".bm-statut{ font-size:13px; opacity:.8; }",
      ".bm-user{ display:flex; align-items:center; gap:8px; }",
      ".bm-user-nom{ font-size:14px; }",
      ".bm-avatar{ width:32px; height:32px; border-radius:50%; background:var(--a); color:var(--f); display:grid; place-items:center; font-size:12px; font-weight:700; }",
      ".bm-burger-wrap{ position:relative; }",
      ".bm-burger{ display:inline-flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; width:44px; height:44px; padding:8px; border:none; border-radius:8px; background:none; color:var(--a); cursor:pointer; }",
      ".bm-burger:hover{ background:#f2f2f2; background:color-mix(in srgb, var(--a) 12%, var(--f)); }",
      ".bm-barre{ display:block; width:24px; height:2px; border-radius:2px; background:currentColor; }",
      ".bm-menu{ position:absolute; top:calc(100% + 8px); right:0; z-index:50; min-width:220px; max-width:min(90vw, 360px); padding:8px; background:var(--f); color:var(--t); border:1.5px solid var(--t); border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,.18); }",
      ".bm-menu ul{ list-style:none; margin:0; padding:0; }",
      ".bm-menu a{ display:flex; align-items:center; gap:8px; padding:8px; border-radius:6px; color:var(--t); text-decoration:none; font-size:14px; }",
      ".bm-menu a:hover{ background:#f2f2f2; background:color-mix(in srgb, var(--a) 12%, var(--f)); text-decoration:underline; }",
      ".bm-vide{ margin:0; padding:8px; font-size:14px; }",
      ".bm-burger:focus-visible, .bm-menu a:focus-visible{ outline:3px solid var(--t); outline-offset:2px; }",
      "@media (max-width:600px){ .bm-header{ padding:0 12px; } .bm-user-nom{ display:none; } }"
    ].join("\n");
  }

  // ---------- Construction ----------
  function construire() {
    if (document.getElementById("bm-bandeau")) return;
    var host = el("div", null, { id: "bm-bandeau" });
    var root = host.attachShadow({ mode: "open" });
    var style = el("style");
    style.textContent = feuille(DEFAUT);
    root.appendChild(style);

    var header = el("header", "bm-header"), inner = el("div", "bm-inner");
    var logo = el("img", "bm-logo", { alt: "Logo" }); logo.hidden = true;
    var titre = el("div", "bm-titre");
    var droite = el("div", "bm-droite");
    var statut = el("span", "bm-statut", { role: "status" });
    var user = el("div", "bm-user"); user.hidden = true;
    var userNom = el("span", "bm-user-nom"), avatar = el("span", "bm-avatar", { "aria-hidden": "true" });
    user.appendChild(userNom); user.appendChild(avatar);
    var wrap = el("div", "bm-burger-wrap"); wrap.hidden = true;
    var btn = el("button", "bm-burger", { type: "button", "aria-label": "Menu", "aria-expanded": "false", "aria-controls": "bm-menu" });
    for (var i = 0; i < 3; i++) btn.appendChild(el("span", "bm-barre"));
    var menu = el("nav", "bm-menu", { id: "bm-menu", "aria-label": "Menu" }); menu.hidden = true;
    wrap.appendChild(btn); wrap.appendChild(menu);
    droite.appendChild(statut); droite.appendChild(user); droite.appendChild(wrap);
    inner.appendChild(logo); inner.appendChild(titre); inner.appendChild(droite);
    header.appendChild(inner); root.appendChild(header);

    ui = { host: host, style: style, logo: logo, titre: titre, statut: statut, user: user, userNom: userNom, avatar: avatar, wrap: wrap, btn: btn, menu: menu };
    titre.textContent = titreWidget;

    btn.addEventListener("click", function (e) { e.stopPropagation(); basculer(menu.hidden); });
    document.addEventListener("click", function (e) { if (e.composedPath().indexOf(wrap) === -1) basculer(false); });   // clic ailleurs : ferme
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { basculer(false); btn.focus(); } });
    document.body.insertBefore(host, document.body.firstChild);
    demarrer(0);
  }

  function basculer(ouvrir) {
    if (!ui) return;
    ui.menu.hidden = !ouvrir;
    ui.btn.setAttribute("aria-expanded", ouvrir ? "true" : "false");
  }

  function appliquer(d) {
    var c = { fond: couleur(d.cfg.couleur_fond, DEFAUT.fond), texte: couleur(d.cfg.couleur_texte, DEFAUT.texte), accent: couleur(d.cfg.couleur_accent, DEFAUT.accent) };
    ui.style.textContent = feuille(c);
    ui.titre.textContent = [String(d.cfg.titre || "").trim(), titreWidget].filter(Boolean).join(" - ");
    var logo = urlHttps(d.cfg.logo_url);
    if (logo) { ui.logo.src = logo; ui.logo.hidden = false; } else ui.logo.hidden = true;
    if (d.aPersonnes) {
      var id = identite(d.moi);
      ui.userNom.textContent = id.label; ui.avatar.textContent = id.initiales; ui.user.hidden = false;
    }
    ui.menu.textContent = "";
    var liens = preparerLiens(d);
    if (!liens.length) {
      var p = el("p", "bm-vide"); p.textContent = "Aucun lien disponible."; ui.menu.appendChild(p);
    } else {
      var ul = el("ul");
      liens.forEach(function (l) {
        var li = el("li"), a = el("a", null, { href: l.href, target: l.nouvelOnglet ? "_blank" : "_top", rel: "noopener" });
        if (l.icone) { var ic = el("span", null, { "aria-hidden": "true" }); ic.textContent = l.icone; a.appendChild(ic); }
        var t = el("span"); t.textContent = l.nom; a.appendChild(t);
        li.appendChild(a); ul.appendChild(li);
      });
      ui.menu.appendChild(ul);
    }
    ui.statut.textContent = "";
    ui.wrap.hidden = false;
  }

  function demarrer(essai) {
    lireTout().then(function (d) { donnees = d; erreurLecture = ""; appliquer(d); }, function (e) {
      if (essai + 1 < DELAIS.length) { setTimeout(function () { demarrer(essai + 1); }, DELAIS[essai + 1]); return; }
      erreurLecture = msg(e);
      console.warn("[bandeau] menu indisponible :", erreurLecture);
      ui.statut.textContent = "Menu indisponible";   // discret : le détail est dans la console
    });
  }

  // ---------- API de diagnostic ----------
  window[NOM] = {
    version: VERSION,
    etat: function () {
      return {
        version: VERSION, titreWidget: titreWidget, erreur: erreurLecture || "(aucune)",
        config: donnees ? donnees.cfg : "(pas encore lue)",
        personne: donnees ? (donnees.moi || (donnees.aPersonnes ? "(non identifiée)" : "(table des personnes non configurée)")) : "(pas encore lue)",
        liensAffiches: donnees ? preparerLiens(donnees).map(function (l) { return { nom: l.nom, href: l.href, roles: l.roles }; }) : "(pas encore lus)"
      };
    }
  };

  if (document.body) construire();
  else document.addEventListener("DOMContentLoaded", construire);
})();
