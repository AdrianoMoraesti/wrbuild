/* WRBuild — builds de Wild Rift offline. Dados em dados.js (window.WR), builds do usuário no localStorage. */
(function () {
  'use strict';
  var D = window.WR || { meta: {}, campeoes: [], itens: {}, runas: {}, feiticos: {} };
  var M = D.meta, I = D.itens, R = D.runas, F = D.feiticos;
  var C = {};
  D.campeoes.forEach(function (c) { C[c.id] = c; });
  var ROTAS = M.rotas || {};
  var ELOS = M.elos || {};
  var SECOES = { inicial: 'Item inicial', principais: 'Itens importantes', botas: 'Botas', final: 'Build final', situacionais: 'Situacionais' };
  var CHAVE = 'wrbuild.builds.v1';
  /* árvore de runas do jogo: 1 essencial + 3 da árvore principal (1 por linha) + 1 de outra árvore */
  var ARV = M.arvores || { essenciais: [], arvores: [], principal: 3, secundaria: 1 };
  var ESS = {}, ARV_DE = {}, LINHA_DE = {}, ARV_K = {};
  ARV.essenciais.forEach(function (id) { ESS[id] = 1; });
  ARV.arvores.forEach(function (a) {
    ARV_K[a.k] = a;
    a.linhas.forEach(function (l, i) { l.forEach(function (id) { ARV_DE[id] = a.k; LINHA_DE[id] = i; }); });
  });
  var IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var tela = document.getElementById('tela');
  var modal = document.getElementById('modal');
  var estado = { busca: '', rota: 0, ordem: 'tier', elo: '1', buscaItem: '', atrib: '', soCompletos: true };

  try { Object.assign(estado, JSON.parse(localStorage.getItem('wrbuild.pref') || '{}')); } catch (e) { /* sem preferências */ }
  function guardaPref() {
    try { localStorage.setItem('wrbuild.pref', JSON.stringify({ rota: estado.rota, ordem: estado.ordem, elo: estado.elo, soCompletos: estado.soCompletos })); } catch (e) { }
  }

  /* ---------- utilitários ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function img(src, alt, cls) {
    return src ? '<img src="' + esc(src) + '" alt="' + esc(alt || '') + '"' + (cls ? ' class="' + cls + '"' : '') + ' loading="lazy">'
      : '<div class="sem' + (cls ? ' ' + cls : '') + '">' + esc((alt || '?').slice(0, 10)) + '</div>';
  }
  function aviso(txt) {
    var a = document.getElementById('aviso');
    a.textContent = txt; a.classList.add('on');
    clearTimeout(aviso.t); aviso.t = setTimeout(function () { a.classList.remove('on'); }, 2400);
  }
  function melhorTier(c, rota) {
    var ordem = ['S+', 'S', 'A', 'B', 'C', 'D'], melhor = '';
    Object.keys(c.tier || {}).forEach(function (r) {
      if (rota && +r !== +rota) return;
      var t = c.tier[r];
      if (!melhor || ordem.indexOf(t) < ordem.indexOf(melhor)) melhor = t;
    });
    return melhor;
  }
  function kpiPrincipal(c, rota) {
    var k = (c.kpi || {})[estado.elo] || {};
    var melhor = null;
    Object.keys(k).forEach(function (r) {
      if (rota && +r !== +rota) return;
      if (!melhor || k[r][1] > melhor[1]) melhor = k[r];
    });
    return melhor; // [vitória, presença, banimento, força, posição]
  }
  function pct(v) { return v == null ? '—' : v.toFixed(2).replace('.', ',') + '%'; }
  function moeda(v) { return (v || 0).toLocaleString('pt-BR'); }

  /* ---------- builds do usuário ---------- */
  function minhas() { try { return JSON.parse(localStorage.getItem(CHAVE) || '[]'); } catch (e) { return []; } }
  function gravaMinhas(l) {
    try { localStorage.setItem(CHAVE, JSON.stringify(l)); return true; } catch (e) { aviso('Não foi possível salvar no aparelho'); return false; }
  }

  /* índice: item -> onde aparece nas builds prontas */
  var usoItem = {};
  D.campeoes.forEach(function (c) {
    c.guias.forEach(function (g) {
      Object.keys(g.builds).forEach(function (sec) {
        g.builds[sec].forEach(function (id) {
          var l = usoItem[id] = usoItem[id] || {};
          var e = l[c.id] = l[c.id] || { secoes: {}, rotas: {}, guias: {} };
          e.secoes[sec] = 1; if (g.rota) e.rotas[g.rota] = 1; e.guias[g.id] = 1;
        });
      });
    });
  });

  /* ---------- roteamento ---------- */
  var rotas = [
    [/^#\/campeoes$/, vCampeoes, 'campeoes'],
    [/^#\/c\/([^/]+)(?:\/g\/(\d+))?$/, vCampeao, 'campeoes'],
    [/^#\/itens$/, vItens, 'itens'],
    [/^#\/i\/(\d+)$/, vItem, 'itens'],
    [/^#\/montar(?:\/([\w-]+))?$/, vMontar, 'montar'],
    [/^#\/minhas$/, vMinhas, 'minhas'],
  ];
  function navegar() {
    fechaModal();
    var h = decodeURIComponent(location.hash || '#/campeoes');
    for (var i = 0; i < rotas.length; i++) {
      var m = h.match(rotas[i][0]);
      if (m) {
        document.querySelectorAll('.abas a').forEach(function (a) { a.classList.toggle('ativa', a.dataset.aba === rotas[i][2]); });
        var rolagem = navegar.rolagem[h] || 0;
        rotas[i][1].apply(null, m.slice(1));
        window.scrollTo(0, rolagem);
        return;
      }
    }
    location.replace('#/campeoes');
  }
  navegar.rolagem = {};
  window.addEventListener('scroll', function () { navegar.rolagem[decodeURIComponent(location.hash)] = window.scrollY; }, { passive: true });
  window.addEventListener('hashchange', navegar);

  document.getElementById('topoInfo').innerHTML = esc('Patch ' + (M.patch || '?')) + '<br>' + esc('dados de ' + (M.gerado || '').slice(0, 10));

  /* ---------- Campeões ---------- */
  function vCampeoes() {
    tela.innerHTML =
      '<div class="busca"><svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 015.6 11.2l5 5-1.4 1.4-5-5A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z"/></svg>' +
      '<input id="q" type="search" placeholder="Buscar campeão…" autocomplete="off" value="' + esc(estado.busca) + '"></div>' +
      '<div class="chips" id="rotasF">' + chipsRotas(estado.rota) + '</div>' +
      '<div class="linha"><span class="contagem esq" id="cont"></span>' +
      '<select id="ord" aria-label="Ordenar"><option value="tier">Tier</option><option value="vit">Vitória</option><option value="pres">Presença</option><option value="ban">Banimento</option><option value="nome">Nome</option></select>' +
      '<select id="elo" aria-label="Elo">' + Object.keys(ELOS).map(function (k) { return '<option value="' + k + '">' + esc(ELOS[k]) + '</option>'; }).join('') + '</select></div>' +
      '<div class="grade" id="grade"></div>' +
      '<p class="rodape">Fonte: ' + esc(M.fonte) + ' · KPIs do servidor chinês em ' + esc(M.ranking) + '</p>';
    var q = document.getElementById('q');
    document.getElementById('ord').value = estado.ordem;
    document.getElementById('elo').value = estado.elo;
    q.addEventListener('input', function () { estado.busca = q.value; desenha(); });
    document.getElementById('ord').onchange = function () { estado.ordem = this.value; guardaPref(); desenha(); };
    document.getElementById('elo').onchange = function () { estado.elo = this.value; guardaPref(); desenha(); };
    document.getElementById('rotasF').onclick = function (e) {
      var b = e.target.closest('[data-rota]'); if (!b) return;
      estado.rota = +b.dataset.rota; guardaPref();
      this.innerHTML = chipsRotas(estado.rota); desenha();
    };
    function desenha() {
      var t = norm(estado.busca);
      var ordT = { 'S+': 0, S: 1, A: 2, B: 3, C: 4, D: 5, '': 9 };
      var l = D.campeoes.filter(function (c) {
        return (!t || norm(c.n).indexOf(t) >= 0 || norm(c.id).indexOf(t) >= 0) && (!estado.rota || c.rotas.indexOf(estado.rota) >= 0);
      });
      var idx = { vit: 0, pres: 1, ban: 2 }[estado.ordem];
      l.sort(function (a, b) {
        if (estado.ordem === 'nome') return a.n.localeCompare(b.n);
        if (estado.ordem === 'tier') {
          var d = ordT[melhorTier(a, estado.rota)] - ordT[melhorTier(b, estado.rota)];
          if (d) return d;
          idx = 0;
        }
        var ka = kpiPrincipal(a, estado.rota), kb = kpiPrincipal(b, estado.rota);
        return (kb ? kb[idx] : -1) - (ka ? ka[idx] : -1) || a.n.localeCompare(b.n);
      });
      document.getElementById('cont').textContent = l.length + ' campeões';
      document.getElementById('grade').innerHTML = l.length ? l.map(function (c) {
        var tr = melhorTier(c, estado.rota), k = kpiPrincipal(c, estado.rota);
        var sub = k ? 'V ' + pct(k[0]) : (c.guias.length ? c.guias.length + ' build(s)' : 'sem dados');
        if (k && estado.ordem === 'pres') sub = 'P ' + pct(k[1]);
        if (k && estado.ordem === 'ban') sub = 'B ' + pct(k[2]);
        return '<a class="camp" href="#/c/' + encodeURIComponent(c.id) + '">' + img(c.i, c.n) +
          (tr ? '<span class="tier tier-' + tr + '">' + tr + '</span>' : '') +
          '<div class="nome">' + esc(c.n) + '</div><div class="sub">' + sub + '</div></a>';
      }).join('') : '<div class="vazio">Nenhum campeão encontrado.</div>';
    }
    desenha();
  }
  function chipsRotas(sel) {
    return '<button class="chip' + (!sel ? ' on' : '') + '" data-rota="0">Todas</button>' + Object.keys(ROTAS).map(function (r) {
      return '<button class="chip' + (+sel === +r ? ' on' : '') + '" data-rota="' + r + '">' + esc(ROTAS[r]) + '</button>';
    }).join('');
  }

  function vCampeao(id, guiaId) {
    var c = C[id];
    if (!c) { location.replace('#/campeoes'); return; }
    var g = c.guias.filter(function (x) { return String(x.id) === String(guiaId); })[0] || c.guias[0];
    var k = (c.kpi || {})[estado.elo] || {};
    var html =
      '<section class="heroi">' + (c.c ? '<img class="arte" src="' + esc(c.c) + '" alt="">' : '') +
      '<div class="info">' + img(c.i, c.n, 'ic') + '<h1>' + esc(c.n) + '</h1><div class="titulo">' + esc(c.t) + '</div>' +
      '<div class="rotas">' + c.rotas.map(function (r) {
        var t = (c.tier || {})[r];
        return '<span class="rota">' + esc(ROTAS[r] || r) + (t ? ' · <b class="tier-' + t + '">' + t + '</b>' : '') + '</span>';
      }).join('') + '</div></div></section>';

    html += '<div class="linha"><h2 class="secao esq">Desempenho (servidor CN)</h2><select id="elo">' +
      Object.keys(ELOS).map(function (e) { return '<option value="' + e + '">' + esc(ELOS[e]) + '</option>'; }).join('') + '</select></div>';
    var rk = Object.keys(k);
    html += rk.length ? '<div class="kpis">' + rk.map(function (r) {
      var v = k[r];
      return '<div class="kpi"><div class="r"><span>' + esc(ROTAS[r] || r) + '</span><span>#' + v[4] + '</span></div><div class="vals">' +
        '<div class="v"><b class="' + (v[0] >= 51 ? 'bom' : v[0] < 49 ? 'ruim' : '') + '">' + pct(v[0]) + '</b><span>Vitória</span></div>' +
        '<div class="v"><b>' + pct(v[1]) + '</b><span>Presença</span></div><div class="v"><b>' + pct(v[2]) + '</b><span>Banimento</span></div></div></div>';
    }).join('') + '</div>' : '<div class="vazio">Sem estatísticas deste campeão no elo escolhido.</div>';

    if (c.perfil) {
      var nomesP = ['Dificuldade', 'Dano', 'Sobrevivência', 'Utilidade'];
      html += '<h2 class="secao">Perfil</h2><div class="perfil">' + c.perfil.map(function (v, i) {
        return '<div class="barra">' + nomesP[i] + '<i style="--p:' + Math.round(v / 3 * 100) + '%"></i></div>';
      }).join('') + '</div>';
    }

    if (c.skills.length) {
      html += '<h2 class="secao">Habilidades</h2><div class="hab-abas" id="habAbas">' + c.skills.map(function (s, i) {
        return '<button class="hab-aba' + (i === 0 ? ' on' : '') + '" data-hab="' + i + '">' + img(s.i, s.n) + '<span>' + rotuloSkill(s.k) + '</span></button>';
      }).join('') + '</div><div class="hab" id="hab"></div>';
    }
    html += '<h2 class="secao">Builds prontas</h2>';
    if (!c.guias.length) html += '<div class="vazio">Este campeão ainda não tem build no site. Monte a sua!</div>';
    else {
      if (c.guias.length > 1) html += '<div class="chips">' + c.guias.map(function (x) {
        return '<a class="chip' + (x === g ? ' on' : '') + '" href="#/c/' + encodeURIComponent(c.id) + '/g/' + x.id + '">' +
          esc(ROTAS[x.rota] || '') + (x.titulo ? ' · ' + esc(x.titulo) : '') + '</a>';
      }).join('') + '</div>';
      html += guiaHtml(c, g);
    }
    html += '<div class="botoes">' +
      (g ? '<button class="btn pri cheio" id="usar">Personalizar esta build</button><button class="btn cheio" id="printG">Gerar print</button>'
        : '<a class="btn pri cheio" href="#/montar">Montar build</a>') + '</div>';
    var meus = minhas().filter(function (b) { return b.campeao === c.id; });
    if (meus.length) html += '<h2 class="secao">Suas builds de ' + esc(c.n) + '</h2>' + meus.map(cartaoMinha).join('');
    tela.innerHTML = html;
    if (c.skills.length) {
      var mostraHab = function (i, tocar) {
        var s = c.skills[i];
        document.querySelectorAll('#habAbas .hab-aba').forEach(function (b) { b.classList.toggle('on', +b.dataset.hab === i); });
        document.getElementById('hab').innerHTML = '<div class="hab-cab"><b>' + esc(s.n) + '</b><span class="tag">' + rotuloSkill(s.k, true) + '</span></div>' +
          (s.v ? '<div class="hab-video"><video src="' + esc(s.v) + '" muted loop playsinline controls preload="none"' + (tocar ? ' autoplay' : '') + '></video>' +
            '<div class="hab-off" hidden>O vídeo da habilidade vem do site oficial do Wild Rift e precisa de internet.</div></div>' : '') +
          '<div class="desc">' + (s.d || 'Sem descrição.') + '</div>';
        var v = document.querySelector('#hab video');
        if (v) v.onerror = function () { v.hidden = true; v.nextElementSibling.hidden = false; };
      };
      mostraHab(0, false);
      document.getElementById('habAbas').onclick = function (e) { var b = e.target.closest('[data-hab]'); if (b) mostraHab(+b.dataset.hab, true); };
    }
    document.getElementById('elo').value = estado.elo;
    document.getElementById('elo').onchange = function () { estado.elo = this.value; guardaPref(); vCampeao(id, guiaId); };
    ligaInfo(tela);
    if (g) {
      document.getElementById('usar').onclick = function () {
        sessionStorage.setItem('wrbuild.rascunho', JSON.stringify(deGuia(c, g)));
        location.hash = '#/montar/rascunho';
      };
      document.getElementById('printG').onclick = function () { abrePrint(deGuia(c, g)); };
    }
    ligaCartoes(tela);
  }

  function guiaHtml(c, g) {
    var h = '<div class="guia"><div class="guia-cab">' +
      (g.rota ? '<span class="rota">' + esc(ROTAS[g.rota]) + '</span>' : '') +
      (g.tier ? '<span class="rota">Tier <b class="tier-' + g.tier + '">' + g.tier + '</b></span>' : '') +
      (g.patch ? '<span>Patch ' + esc(g.patch) + '</span>' : '') + '<span>· ' + esc(g.atualizado) + '</span>' +
      (g.likes ? '<span>· ♥ ' + g.likes + '</span>' : '') + '</div>' +
      (g.titulo ? '<b>' + esc(g.titulo) + '</b>' : '');
    ['final', 'inicial', 'principais', 'botas', 'situacionais'].forEach(function (sec) {
      var l = g.builds[sec];
      if (!l || !l.length) return;
      h += '<div class="bloco"><h3>' + SECOES[sec] + (sec === 'final' ? ' · <span class="preco">' + moeda(custo(l)) + '</span>' : '') + '</h3><div class="icones">' +
        l.map(function (id) { return icoItem(id); }).join('') + '</div></div>';
    });
    if (g.runas.length) h += '<div class="bloco"><h3>Runas</h3>' + runasHtml(g.runas) + '</div>';
    if (g.feiticos.length) h += '<div class="bloco"><h3>Feitiços</h3><div class="icones">' + g.feiticos.map(icoFeitico).join('') + '</div></div>';
    if (g.skills.length) h += '<div class="bloco"><h3>Ordem de habilidades</h3>' + skillsHtml(c, g.skills) + '</div>';
    if (g.fortes.length || g.fracos.length) {
      h += '<div class="bloco"><h3>Forte contra</h3><div class="icones">' + (g.fortes.map(icoCamp).join('') || '<small>—</small>') + '</div></div>' +
        '<div class="bloco"><h3>Fraco contra</h3><div class="icones">' + (g.fracos.map(icoCamp).join('') || '<small>—</small>') + '</div></div>';
    }
    return h + '</div>';
  }
  function skillsHtml(c, ordem) {
    var letras = ['1', '2', '3', '4'];
    var nomes = {};
    (c.skills || []).forEach(function (s) { nomes[s.k] = s; });
    var h = '<div class="skills"><div class="l"></div>';
    for (var n = 1; n <= 15; n++) h += '<div class="n">' + n + '</div>';
    letras.forEach(function (L) {
      var s = nomes[L];
      h += '<div class="l" title="' + esc(s ? s.n : '') + '">' + (L === '4' ? 'Ult' : L + 'ª') + '</div>';
      for (var i = 0; i < 15; i++) h += '<div class="' + (ordem[i] === L ? 'on' : '') + '">' + (ordem[i] === L ? i + 1 : '') + '</div>';
    });
    return h + '</div>';
  }
  function rotuloSkill(k, longo) {
    return { P: 'Passiva', '1': longo ? '1ª habilidade' : '1ª', '2': longo ? '2ª habilidade' : '2ª', '3': longo ? '3ª habilidade' : '3ª', '4': longo ? 'Ultimate' : 'Ult' }[k] || k;
  }
  function custo(l) { return l.reduce(function (s, id) { return s + ((I[id] || {}).p || 0); }, 0); }
  function icoItem(id) {
    var it = I[id] || { n: 'Item ' + id };
    return '<a class="ico" href="#/i/' + id + '">' + img(it.i, it.n) + '<span>' + esc(it.n) + '</span></a>';
  }
  /* separa uma lista de runas em essencial / principal / secundária (dica: árvores já escolhidas) */
  function organizaRunas(lista, dica) {
    var o = { ess: null, prim: (dica || {}).p || null, primSel: [], sec: (dica || {}).s || null, secSel: null, outras: [] };
    var nArv = {};
    (lista || []).forEach(function (id) {
      id = +id;
      if (ESS[id]) { if (o.ess == null) o.ess = id; else o.outras.push(id); }
      else if (ARV_DE[id]) nArv[ARV_DE[id]] = (nArv[ARV_DE[id]] || 0) + 1;
      else o.outras.push(id);
    });
    if (!o.prim || !ARV_K[o.prim]) {
      o.prim = null;
      Object.keys(nArv).forEach(function (k) { if (!o.prim || nArv[k] > nArv[o.prim]) o.prim = k; });
    }
    var linhas = ((ARV_K[o.prim] || {}).linhas || []).map(function () { return null; });
    (lista || []).forEach(function (id) {
      id = +id;
      if (ARV_DE[id] === o.prim && linhas[LINHA_DE[id]] === null) linhas[LINHA_DE[id]] = id;
      else if (ARV_DE[id] && ARV_DE[id] !== o.prim && o.secSel == null && (!o.sec || o.sec === ARV_DE[id])) { o.secSel = id; o.sec = ARV_DE[id]; }
    });
    o.primSel = linhas;
    if (o.sec === o.prim) { o.sec = null; o.secSel = null; }
    return o;
  }
  function listaRunas(o) {
    return [o.ess].concat(o.primSel, [o.secSel]).filter(function (x) { return x != null; });
  }
  function runasHtml(lista, dica) {
    var o = organizaRunas(lista, dica);
    var h = '<div class="arv-runas">';
    if (o.ess != null) h += '<div class="arv-bloco"><small>Essencial</small><div class="icones">' + icoRuna(o.ess) + '</div></div>';
    var p = ARV_K[o.prim], sel = o.primSel.filter(function (x) { return x != null; });
    if (p && sel.length) h += '<div class="arv-bloco"><small>' + (p.i ? '<img src="' + esc(p.i) + '" alt="">' : '') + 'Principal · ' + esc(p.n) + '</small><div class="icones">' + sel.map(icoRuna).join('') + '</div></div>';
    var sc = ARV_K[o.sec];
    if (sc && o.secSel != null) h += '<div class="arv-bloco"><small>' + (sc.i ? '<img src="' + esc(sc.i) + '" alt="">' : '') + 'Secundária · ' + esc(sc.n) + '</small><div class="icones">' + icoRuna(o.secSel) + '</div></div>';
    if (o.outras.length) h += '<div class="arv-bloco"><small>Outras</small><div class="icones">' + o.outras.map(icoRuna).join('') + '</div></div>';
    return h + '</div>';
  }
  function icoRuna(id) {
    var r = R[id] || { n: '?' };
    return '<div class="ico redondo" data-info="runa:' + id + '">' + img(r.i, r.n) + '<span>' + esc(r.n) + '</span></div>';
  }
  function icoFeitico(id) {
    var f = F[id] || { n: '?' };
    return '<div class="ico" data-info="feitico:' + id + '">' + img(f.i, f.n) + '<span>' + esc(f.n) + '</span></div>';
  }
  function icoCamp(id) {
    var c = C[id];
    if (!c) return '';
    return '<a class="ico peq" href="#/c/' + encodeURIComponent(id) + '">' + img(c.i, c.n) + '<span>' + esc(c.n) + '</span></a>';
  }
  function ligaInfo(raiz) {
    raiz.querySelectorAll('[data-info]').forEach(function (el) {
      el.onclick = function () {
        var p = el.dataset.info.split(':'), o = (p[0] === 'runa' ? R : F)[p[1]];
        if (!o) return;
        abreModal(o.n, '<div class="item-cab">' + img(o.i, o.n) + '<div><h1>' + esc(o.n) + '</h1>' +
          (p[0] === 'runa' && o.t ? '<div class="tags"><span class="tag">' + esc((M.tiposRuna || {})[o.t] || '') + '</span></div>' : '') +
          '</div></div><div class="desc">' + (o.d || 'Sem descrição.') + '</div>');
      };
    });
  }

  /* ---------- Itens ---------- */
  function vItens() {
    var atribs = {};
    Object.keys(I).forEach(function (id) { (I[id].a || []).forEach(function (a) { atribs[a] = 1; }); });
    tela.innerHTML =
      '<div class="busca"><svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 015.6 11.2l5 5-1.4 1.4-5-5A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z"/></svg>' +
      '<input id="q" type="search" placeholder="Buscar item da build…" autocomplete="off" value="' + esc(estado.buscaItem) + '"></div>' +
      '<div class="chips" id="atr"></div>' +
      '<div class="linha"><span class="contagem esq" id="cont"></span><button class="chip' + (estado.soCompletos ? ' on' : '') + '" id="comp">Só usados em builds</button></div>' +
      '<div class="lista" id="lista"></div>';
    var chips = document.getElementById('atr');
    function desenhaChips() {
      chips.innerHTML = '<button class="chip' + (!estado.atrib ? ' on' : '') + '" data-a="">Todos</button>' + Object.keys(atribs).sort().map(function (a) {
        return '<button class="chip' + (estado.atrib === a ? ' on' : '') + '" data-a="' + esc(a) + '">' + esc(a) + '</button>';
      }).join('');
    }
    desenhaChips();
    chips.onclick = function (e) { var b = e.target.closest('[data-a]'); if (!b) return; estado.atrib = b.dataset.a; desenhaChips(); desenha(); };
    document.getElementById('comp').onclick = function () { estado.soCompletos = !estado.soCompletos; guardaPref(); this.classList.toggle('on', estado.soCompletos); desenha(); };
    var q = document.getElementById('q');
    q.addEventListener('input', function () { estado.buscaItem = q.value; desenha(); });
    function desenha() {
      var t = norm(estado.buscaItem);
      var l = Object.keys(I).filter(function (id) {
        var it = I[id];
        return (!t || norm(it.n).indexOf(t) >= 0) && (!estado.atrib || (it.a || []).indexOf(estado.atrib) >= 0) &&
          (!estado.soCompletos || usoItem[id]);
      }).sort(function (a, b) {
        return Object.keys(usoItem[b] || {}).length - Object.keys(usoItem[a] || {}).length || I[a].n.localeCompare(I[b].n);
      });
      document.getElementById('cont').textContent = l.length + ' itens';
      document.getElementById('lista').innerHTML = l.length ? l.map(function (id) {
        var it = I[id], n = Object.keys(usoItem[id] || {}).length;
        return '<a class="item-l" href="#/i/' + id + '">' + img(it.i, it.n) + '<div class="t"><b>' + esc(it.n) + '</b><small><span class="preco">' + moeda(it.p) + '</span> · ' +
          (n ? n + ' campeão(ões)' : 'fora das builds prontas') + '</small></div></a>';
      }).join('') : '<div class="vazio">Nenhum item encontrado.</div>';
    }
    desenha();
  }

  function vItem(id) {
    var it = I[id];
    if (!it) { location.replace('#/itens'); return; }
    var uso = usoItem[id] || {};
    var ids = Object.keys(uso).sort(function (a, b) { return C[a].n.localeCompare(C[b].n); });
    var meus = minhas().filter(function (b) { return (b.itens || []).indexOf(+id) >= 0; });
    tela.innerHTML =
      '<div class="item-cab">' + img(it.i, it.n) + '<div><h1>' + esc(it.n) + '</h1><span class="preco">' + moeda(it.p) + ' de ouro</span>' +
      '<div class="tags">' + (it.a || []).map(function (a) { return '<span class="tag">' + esc(a) + '</span>'; }).join('') + '</div></div></div>' +
      '<div class="desc">' + (it.d || 'Sem descrição.') + '</div>' +
      '<h2 class="secao">Campeões que usam (' + ids.length + ')</h2>' +
      (ids.length ? '<div class="uso">' + ids.map(function (cid) {
        var c = C[cid], u = uso[cid];
        var secs = Object.keys(u.secoes).map(function (s) { return SECOES[s]; }).join(', ');
        var rs = Object.keys(u.rotas).map(function (r) { return ROTAS[r]; }).join(', ');
        return '<a href="#/c/' + encodeURIComponent(cid) + '/g/' + Object.keys(u.guias)[0] + '">' + img(c.i, c.n) + '<div><b>' + esc(c.n) + '</b><small>' + esc(rs || '—') + '<br>' + esc(secs) + '</small></div></a>';
      }).join('') + '</div>' : '<div class="vazio">Nenhuma build pronta usa este item.</div>') +
      (meus.length ? '<h2 class="secao">Nas suas builds (' + meus.length + ')</h2>' + meus.map(cartaoMinha).join('') : '');
    ligaCartoes(tela);
  }

  /* ---------- Montar / editar ---------- */
  function novaBuild() {
    return { id: '', nome: '', campeao: '', rota: 0, itens: [], runas: [], feiticos: [], notas: '' };
  }
  function deGuia(c, g) {
    var b = novaBuild();
    b.campeao = c.id; b.rota = g.rota || c.rotas[0] || 0;
    b.nome = (g.titulo || 'Build') + (g.rota ? ' ' + ROTAS[g.rota] : '');
    var base = g.builds.final.length ? g.builds.final : g.builds.principais.concat(g.builds.botas);
    b.itens = base.slice(0, 6);
    var o = organizaRunas(g.runas);
    b.runas = listaRunas(o); b.arvores = { p: o.prim, s: o.sec }; b.feiticos = g.feiticos.slice(0, 2); b.origem = g.id;
    return b;
  }
  var rasc = null;
  function vMontar(id) {
    if (id === 'rascunho') {
      try { rasc = JSON.parse(sessionStorage.getItem('wrbuild.rascunho')) || novaBuild(); } catch (e) { rasc = novaBuild(); }
    } else if (id) {
      rasc = JSON.parse(JSON.stringify(minhas().filter(function (b) { return b.id === id; })[0] || novaBuild()));
    } else if (!rasc || rasc.id) {
      rasc = novaBuild();
    }
    desenhaMontar();
  }
  function salvaRascunho() { try { sessionStorage.setItem('wrbuild.rascunho', JSON.stringify(rasc)); } catch (e) { } }
  function desenhaMontar() {
    var b = rasc, c = C[b.campeao];
    var slots = '';
    for (var i = 0; i < 6; i++) {
      var it = I[b.itens[i]];
      slots += '<div class="slot' + (it ? ' cheio' : '') + '" data-slot="' + i + '">' + (it ? img(it.i, it.n) + '<span class="x" data-tira="' + i + '">×</span>' : '+') + '</div>';
    }
    var atr = {};
    b.itens.forEach(function (id) { ((I[id] || {}).a || []).forEach(function (a) { atr[a] = (atr[a] || 0) + 1; }); });
    tela.innerHTML =
      '<h2 class="secao" style="margin-top:4px">' + (b.id ? 'Editar build' : 'Montar build') + '</h2>' +
      '<div class="escolhe-camp" id="campBtn">' + (c ? img(c.i, c.n) : '<div class="sem">?</div>') +
      '<div><b>' + (c ? esc(c.n) : 'Escolher campeão') + '</b><br><small style="color:var(--suave)">' + (c ? esc(c.t) : 'Toque para escolher') + '</small></div></div>' +
      '<h2 class="secao">Rota</h2><div class="chips" id="rotaB">' + Object.keys(ROTAS).map(function (r) {
        return '<button class="chip' + (+b.rota === +r ? ' on' : '') + '" data-r="' + r + '">' + esc(ROTAS[r]) + '</button>';
      }).join('') + '</div>' +
      '<h2 class="secao">Itens (até 6)</h2><div class="slots" id="slots">' + slots + '</div>' +
      '<div class="resumo"><span>' + (Object.keys(atr).map(function (a) { return a + (atr[a] > 1 ? ' ×' + atr[a] : ''); }).join(' · ') || 'Toque num espaço para escolher o item') + '</span>' +
      '<span class="preco">' + moeda(custo(b.itens)) + '</span></div>' +
      '<h2 class="secao">Runas</h2>' + (b.runas.length ? runasHtml(b.runas, b.arvores) : '') + '<div class="icones" id="runasB">' +
      '<button class="btn" id="runasBtn">' + (b.runas.length ? 'Trocar' : 'Escolher runas') + '</button></div>' +
      '<h2 class="secao">Feitiços</h2><div class="icones" id="feitB">' + b.feiticos.map(icoFeitico).join('') +
      '<button class="btn" id="feitBtn">' + (b.feiticos.length ? 'Trocar' : 'Escolher feitiços') + '</button></div>' +
      '<h2 class="secao">Detalhes</h2>' +
      '<div class="campo"><label for="nome">Nome da build</label><input id="nome" maxlength="40" placeholder="Ex.: Ahri burst" value="' + esc(b.nome) + '"></div>' +
      '<div class="campo"><label for="notas">Observações</label><input id="notas" maxlength="120" placeholder="Opcional" value="' + esc(b.notas) + '"></div>' +
      '<div class="botoes"><button class="btn pri cheio" id="salvar">' + (b.id ? 'Salvar alterações' : 'Salvar build') + '</button>' +
      '<button class="btn cheio" id="printB">Gerar print</button></div>' +
      (b.id ? '<div class="botoes"><button class="btn cheio" id="copiar">Duplicar</button><button class="btn perigo cheio" id="apagar">Excluir</button></div>' : '<div class="botoes"><button class="btn cheio" id="limpar">Limpar</button></div>');

    document.getElementById('campBtn').onclick = escolheCampeao;
    document.getElementById('rotaB').onclick = function (e) { var x = e.target.closest('[data-r]'); if (!x) return; b.rota = +x.dataset.r; salvaRascunho(); desenhaMontar(); };
    document.getElementById('slots').onclick = function (e) {
      var t = e.target.closest('[data-tira]');
      if (t) { b.itens.splice(+t.dataset.tira, 1); salvaRascunho(); desenhaMontar(); return; }
      var s = e.target.closest('[data-slot]'); if (s) escolheItem(+s.dataset.slot);
    };
    document.getElementById('runasBtn').onclick = escolheRunas;
    document.getElementById('feitBtn').onclick = escolheFeiticos;
    ['nome', 'notas'].forEach(function (k) { document.getElementById(k).oninput = function () { b[k] = this.value; salvaRascunho(); }; });
    document.getElementById('salvar').onclick = function () {
      if (!b.campeao) { aviso('Escolha o campeão'); return; }
      if (!b.itens.length) { aviso('Escolha pelo menos um item'); return; }
      var l = minhas();
      if (!b.nome.trim()) b.nome = C[b.campeao].n + ' ' + (ROTAS[b.rota] || '');
      b.atualizado = Date.now();
      if (b.id) l = l.map(function (x) { return x.id === b.id ? b : x; });
      else { b.id = 'b' + Date.now().toString(36); b.criado = b.atualizado; l.unshift(b); }
      if (gravaMinhas(l)) { aviso('Build salva no aparelho'); sessionStorage.removeItem('wrbuild.rascunho'); location.hash = '#/montar/' + b.id; }
    };
    document.getElementById('printB').onclick = function () {
      if (!b.campeao) { aviso('Escolha o campeão'); return; }
      abrePrint(b);
    };
    var el;
    if ((el = document.getElementById('limpar'))) el.onclick = function () { rasc = novaBuild(); salvaRascunho(); desenhaMontar(); };
    if ((el = document.getElementById('copiar'))) el.onclick = function () {
      var n = JSON.parse(JSON.stringify(b)); n.id = ''; n.nome = b.nome + ' (cópia)'; rasc = n; salvaRascunho(); location.hash = '#/montar/rascunho';
    };
    if ((el = document.getElementById('apagar'))) el.onclick = function () {
      if (!confirm('Excluir a build "' + b.nome + '"?')) return;
      gravaMinhas(minhas().filter(function (x) { return x.id !== b.id; }));
      rasc = null; aviso('Build excluída'); location.hash = '#/minhas';
    };
    ligaInfo(tela);
  }

  function escolheCampeao() {
    abreModal('Escolher campeão', '<div class="busca"><input id="mq" type="search" placeholder="Buscar campeão…" autocomplete="off"></div><div class="escolhas" id="mlista"></div>');
    var q = document.getElementById('mq');
    function desenha() {
      var t = norm(q.value);
      document.getElementById('mlista').innerHTML = D.campeoes.filter(function (c) { return !t || norm(c.n).indexOf(t) >= 0; }).map(function (c) {
        return '<div class="ico' + (rasc.campeao === c.id ? ' sel' : '') + '" data-c="' + esc(c.id) + '">' + img(c.i, c.n) + '<span>' + esc(c.n) + '</span></div>';
      }).join('');
    }
    q.oninput = desenha; desenha();
    document.getElementById('mlista').onclick = function (e) {
      var x = e.target.closest('[data-c]'); if (!x) return;
      rasc.campeao = x.dataset.c;
      if (!rasc.rota || C[rasc.campeao].rotas.indexOf(+rasc.rota) < 0) rasc.rota = C[rasc.campeao].rotas[0] || 0;
      salvaRascunho(); fechaModal(); desenhaMontar();
    };
  }
  function escolheItem(slot) {
    var atual = rasc.itens[slot];
    var sugeridos = {};
    var c = C[rasc.campeao];
    if (c) c.guias.forEach(function (g) { Object.keys(g.builds).forEach(function (s) { g.builds[s].forEach(function (id) { sugeridos[id] = 1; }); }); });
    abreModal('Escolher item', '<div class="busca"><input id="mq" type="search" placeholder="Buscar item…" autocomplete="off"></div>' +
      '<div class="chips" id="mf"><button class="chip on" data-f="todos">Todos</button>' + (c ? '<button class="chip" data-f="sug">Usados por ' + esc(c.n) + '</button>' : '') +
      '<button class="chip" data-f="botas">Botas</button></div><div class="escolhas" id="mlista"></div>');
    var q = document.getElementById('mq'), filtro = 'todos';
    function desenha() {
      var t = norm(q.value);
      var l = Object.keys(I).filter(function (id) {
        var it = I[id];
        if (t && norm(it.n).indexOf(t) < 0) return false;
        if (filtro === 'sug') return sugeridos[id];
        if (filtro === 'botas') return it.b;
        return it.p >= 900 || usoItem[id];
      }).sort(function (a, b) { return (I[b].p - I[a].p) || I[a].n.localeCompare(I[b].n); });
      document.getElementById('mlista').innerHTML = l.map(function (id) {
        var it = I[id], ja = rasc.itens.indexOf(+id) >= 0 && +id !== +atual;
        return '<div class="ico' + (+id === +atual ? ' sel' : '') + '" data-i="' + id + '" style="' + (ja ? 'opacity:.35' : '') + '">' + img(it.i, it.n) + '<span>' + esc(it.n) + '</span></div>';
      }).join('') || '<div class="vazio">Nenhum item.</div>';
    }
    q.oninput = desenha; desenha();
    document.getElementById('mf').onclick = function (e) {
      var x = e.target.closest('[data-f]'); if (!x) return; filtro = x.dataset.f;
      this.querySelectorAll('.chip').forEach(function (b) { b.classList.toggle('on', b === x); }); desenha();
    };
    document.getElementById('mlista').onclick = function (e) {
      var x = e.target.closest('[data-i]'); if (!x) return;
      var id = +x.dataset.i, ja = rasc.itens.indexOf(id);
      if (ja >= 0 && ja !== slot) { aviso('Esse item já está na build'); return; }
      if (slot < rasc.itens.length) rasc.itens[slot] = id; else rasc.itens.push(id);
      salvaRascunho(); fechaModal(); desenhaMontar();
    };
  }
  function escolheRunas() {
    var o = organizaRunas(rasc.runas, rasc.arvores);
    var nP = ARV.principal || 3, nS = ARV.secundaria || 1;
    function icoSel(id, sel, attr) {
      var r = R[id] || { n: '?' };
      return '<div class="ico redondo' + (sel ? ' sel' : '') + '" ' + attr + '>' + img(r.i, r.n) + '<span>' + esc(r.n) + '</span></div>';
    }
    function chipsArv(sel, proibida, attr) {
      return '<div class="chips">' + ARV.arvores.map(function (a) {
        if (a.k === proibida) return '';
        return '<button class="chip' + (a.k === sel ? ' on' : '') + '" ' + attr + '="' + a.k + '">' + (a.i ? '<img class="arv-ic" src="' + esc(a.i) + '" alt="">' : '') + esc(a.n) + '</button>';
      }).join('') + '</div>';
    }
    function linhasHtml(arv, marcado, attr) {
      return arv.linhas.map(function (l, i) {
        return '<div class="linha-runa"><span class="num">' + (i + 1) + '</span><div class="escolhas">' +
          l.map(function (id) { return icoSel(id, marcado(id, i), attr + '="' + id + '"'); }).join('') + '</div></div>';
      }).join('');
    }
    function desenha() {
      var nPrim = o.primSel.filter(function (x) { return x != null; }).length;
      var h = '<p class="regra">1 runa essencial · ' + nP + ' da árvore principal (uma por linha) · ' + nS + ' de outra árvore</p>' +
        '<h2 class="secao">Essencial <small>' + (o.ess != null ? 1 : 0) + '/1</small></h2><div class="escolhas">' +
        ARV.essenciais.map(function (id) { return icoSel(id, o.ess === id, 'data-ess="' + id + '"'); }).join('') + '</div>' +
        '<h2 class="secao">Árvore principal <small>' + nPrim + '/' + nP + '</small></h2>' + chipsArv(o.prim, null, 'data-parv');
      var p = ARV_K[o.prim];
      h += p ? linhasHtml(p, function (id, i) { return o.primSel[i] === id; }, 'data-prim') : '<div class="vazio">Escolha a árvore principal.</div>';
      h += '<h2 class="secao">Árvore secundária <small>' + (o.secSel != null ? 1 : 0) + '/' + nS + '</small></h2>';
      if (!p) h += '<div class="vazio">Escolha antes a árvore principal.</div>';
      else {
        h += chipsArv(o.sec, o.prim, 'data-sarv');
        var sc = ARV_K[o.sec];
        if (sc) h += linhasHtml(sc, function (id) { return o.secSel === id; }, 'data-sec');
      }
      h += '<div class="botoes"><button class="btn cheio" id="limparR">Limpar</button><button class="btn pri cheio" id="ok">Usar (' +
        listaRunas(o).length + '/' + (1 + nP + nS) + ')</button></div>';
      corpo.innerHTML = h;
    }
    abreModal('Runas', '');
    var corpo = modal.querySelector('.folha-corpo');
    desenha();
    corpo.onclick = function (e) {
      var x;
      if ((x = e.target.closest('[data-ess]'))) { var id = +x.dataset.ess; o.ess = o.ess === id ? null : id; }
      else if ((x = e.target.closest('[data-parv]'))) {
        if (o.prim !== x.dataset.parv) { o.prim = x.dataset.parv; o.primSel = ARV_K[o.prim].linhas.map(function () { return null; }); }
        if (o.sec === o.prim) { o.sec = null; o.secSel = null; }
      }
      else if ((x = e.target.closest('[data-prim]'))) { var pid = +x.dataset.prim, li = LINHA_DE[pid]; o.primSel[li] = o.primSel[li] === pid ? null : pid; }
      else if ((x = e.target.closest('[data-sarv]'))) { if (o.sec !== x.dataset.sarv) { o.sec = x.dataset.sarv; o.secSel = null; } }
      else if ((x = e.target.closest('[data-sec]'))) { var sid = +x.dataset.sec; o.secSel = o.secSel === sid ? null : sid; }
      else if (e.target.closest('#limparR')) { o = organizaRunas([]); }
      else if (e.target.closest('#ok')) {
        if (o.ess == null) { aviso('Escolha a runa essencial'); return; }
        rasc.runas = listaRunas(o); rasc.arvores = { p: o.prim, s: o.sec };
        salvaRascunho(); fechaModal(); desenhaMontar(); return;
      } else return;
      var rol = corpo.scrollTop; desenha(); corpo.scrollTop = rol;
    };
  }
  function escolheFeiticos() {
    var sel = rasc.feiticos.slice();
    abreModal('Feitiços (2)', '<div class="escolhas" id="mlista">' + Object.keys(F).map(function (id) {
      return '<div class="ico" data-f="' + id + '">' + img(F[id].i, F[id].n) + '<span>' + esc(F[id].n) + '</span></div>';
    }).join('') + '</div><div class="botoes"><button class="btn pri cheio" id="ok">Usar</button></div>');
    var corpo = modal.querySelector('.folha-corpo');
    function marca() { corpo.querySelectorAll('[data-f]').forEach(function (el) { el.classList.toggle('sel', sel.indexOf(+el.dataset.f) >= 0); }); }
    marca();
    corpo.onclick = function (e) {
      var x = e.target.closest('[data-f]');
      if (x) {
        var id = +x.dataset.f, i = sel.indexOf(id);
        if (i >= 0) sel.splice(i, 1); else { sel.push(id); if (sel.length > 2) sel.shift(); }
        marca();
      }
      if (e.target.closest('#ok')) { rasc.feiticos = sel; salvaRascunho(); fechaModal(); desenhaMontar(); }
    };
  }

  /* ---------- Minhas builds ---------- */
  function cartaoMinha(b) {
    var c = C[b.campeao] || { n: '?', i: null };
    return '<div class="cartao">' + img(c.i, c.n) + '<a class="meio" href="#/montar/' + esc(b.id) + '"><b>' + esc(b.nome) + '</b><small>' + esc(c.n) + ' · ' + esc(ROTAS[b.rota] || '') +
      ' · <span class="preco">' + moeda(custo(b.itens)) + '</span></small><div class="mini">' +
      b.itens.map(function (id) { var it = I[id] || {}; return img(it.i, it.n); }).join('') + '</div></a>' +
      '<button class="btn" data-print="' + esc(b.id) + '" >Print</button></div>';
  }
  function ligaCartoes(raiz) {
    raiz.querySelectorAll('[data-print]').forEach(function (bt) {
      bt.onclick = function () { var b = minhas().filter(function (x) { return x.id === bt.dataset.print; })[0]; if (b) abrePrint(b); };
    });
  }
  function vMinhas() {
    var l = minhas();
    tela.innerHTML = '<div class="linha"><h2 class="secao esq" style="margin-top:4px">Minhas builds (' + l.length + ')</h2><a class="btn pri" href="#/montar">+ Nova</a></div>' +
      (l.length ? l.map(cartaoMinha).join('') : '<div class="vazio">Você ainda não salvou nenhuma build. Monte uma do zero ou abra um campeão e toque em “Personalizar esta build”.</div>') +
      '<h2 class="secao">Cópia de segurança</h2><div class="botoes"><button class="btn cheio" id="exp">Exportar</button><button class="btn cheio" id="imp">Importar</button></div>' +
      '<p class="rodape">As builds ficam guardadas só neste aparelho.</p>';
    ligaCartoes(tela);
    document.getElementById('exp').onclick = function () {
      var txt = JSON.stringify({ app: 'WRBuild', versao: 1, builds: minhas() });
      if (window.Nativo && Nativo.compartilharTexto) { Nativo.compartilharTexto(txt); return; }
      if (IOS && navigator.share) { navigator.share({ title: 'Backup WRBuild', text: txt }).catch(function () { }); return; }
      abreModal('Exportar', '<div class="campo"><label>Copie e guarde este texto</label><textarea readonly>' + esc(txt) + '</textarea></div>');
      modal.querySelector('textarea').select();
    };
    document.getElementById('imp').onclick = function () {
      abreModal('Importar builds', '<div class="campo"><label for="txt">Cole aqui o texto exportado</label><textarea id="txt"></textarea></div><div class="botoes"><button class="btn pri cheio" id="ok">Importar</button></div>');
      document.getElementById('ok').onclick = function () {
        try {
          var d = JSON.parse(document.getElementById('txt').value), novas = (d.builds || []).filter(function (b) { return b && b.id && C[b.campeao]; });
          var atuais = minhas(), ids = {};
          atuais.forEach(function (b) { ids[b.id] = 1; });
          var n = 0;
          novas.forEach(function (b) { if (!ids[b.id]) { atuais.push(b); n++; } });
          gravaMinhas(atuais); fechaModal(); aviso(n + ' build(s) importada(s)'); vMinhas();
        } catch (e) { aviso('Texto inválido'); }
      };
    };
  }

  /* ---------- modal ---------- */
  function abreModal(titulo, corpo) {
    modal.innerHTML = '<div class="folha" role="dialog" aria-modal="true" aria-label="' + esc(titulo) + '"><div class="folha-cab"><h2>' + esc(titulo) + '</h2>' +
      '<button class="fechar" aria-label="Fechar">×</button></div><div class="folha-corpo">' + corpo + '</div></div>';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('.fechar').onclick = fechaModal;
    modal.onclick = function (e) { if (e.target === modal) fechaModal(); };
    ligaInfo(modal);
  }
  function fechaModal() { modal.hidden = true; modal.innerHTML = ''; document.body.style.overflow = ''; }

  /* ---------- print para redes sociais ---------- */
  function carregaImg(src) {
    return new Promise(function (ok) {
      if (!src) return ok(null);
      var im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = function () { ok(null); };
      // no app Android as imagens vêm pela ponte nativa em base64, para o canvas não ficar "contaminado"
      if (window.Nativo && Nativo.asset) {
        try { var b64 = Nativo.asset(src); if (b64) { im.src = 'data:image/webp;base64,' + b64; return; } } catch (e) { }
      }
      im.src = src;
    });
  }
  function texto(ctx, t, x, y, tam, cor, peso, max) {
    ctx.font = (peso || 400) + ' ' + tam + 'px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = cor;
    if (max) {
      while (ctx.measureText(t).width > max && t.length > 3) t = t.slice(0, -2) + '…';
      if (t.length > 3 && t.slice(-2) === '……') t = t.slice(0, -1);
    }
    ctx.fillText(t, x, y);
  }
  function quebra(ctx, t, max) {
    var palavras = t.split(' '), linhas = [], l = '';
    palavras.forEach(function (p) {
      var teste = l ? l + ' ' + p : p;
      if (ctx.measureText(teste).width > max && l) { linhas.push(l); l = p; } else l = teste;
    });
    if (l) linhas.push(l);
    return linhas;
  }
  function retArred(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function desenhaPrint(b, formato) {
    var c = C[b.campeao];
    var W = 1080, H = formato === 'story' ? 1920 : 1350;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var fontes = [c.c, c.i].concat(b.itens.map(function (id) { return (I[id] || {}).i; }), b.runas.map(function (id) { return (R[id] || {}).i; }),
      b.feiticos.map(function (id) { return (F[id] || {}).i; }));
    return Promise.all(fontes.map(carregaImg)).then(function (ims) {
      var arte = ims[0], icone = ims[1], pi = 2;
      var imItens = ims.slice(pi, pi += b.itens.length), imRunas = ims.slice(pi, pi += b.runas.length), imFeit = ims.slice(pi);
      // fundo
      var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0b0f14'); g.addColorStop(1, '#1a2230');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // arte do campeão à esquerda, ocupando a altura toda
      var LA = Math.round(W * 0.44);
      if (arte) {
        var esc2 = Math.max(LA / arte.width, H / arte.height), aw = arte.width * esc2, ah = arte.height * esc2;
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, LA + 120, H); ctx.clip();
        ctx.drawImage(arte, (LA + 120 - aw) / 2, 0, aw, ah); ctx.restore();
      }
      var fade = ctx.createLinearGradient(LA - 160, 0, LA + 120, 0);
      fade.addColorStop(0, 'rgba(11,15,20,0)'); fade.addColorStop(1, 'rgba(14,19,27,1)');
      ctx.fillStyle = fade; ctx.fillRect(LA - 160, 0, 280, H);
      ctx.fillStyle = '#0e131b'; ctx.fillRect(LA + 120, 0, W - LA - 120, H);
      var base = ctx.createLinearGradient(0, H - 260, 0, H); base.addColorStop(0, 'rgba(11,15,20,0)'); base.addColorStop(1, 'rgba(11,15,20,.9)');
      ctx.fillStyle = base; ctx.fillRect(0, H - 260, LA + 120, 260);
      // moldura
      ctx.strokeStyle = '#c8aa6e'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.strokeStyle = 'rgba(200,170,110,.35)'; ctx.lineWidth = 2; ctx.strokeRect(18, 18, W - 36, H - 36);
      // nome na base da arte
      texto(ctx, c.n.toUpperCase(), 48, H - 120, 76, '#ffffff', 900, LA + 40);
      texto(ctx, c.t, 50, H - 74, 30, '#c9cdd3', 400, LA + 20);
      // coluna direita
      var X = LA + 20, LW = W - X - 50, y = formato === 'story' ? 240 : 92;
      texto(ctx, 'WR', X, y, 44, '#c8aa6e', 900); texto(ctx, 'BUILD', X + ctx.measureText('WR').width + 2, y, 44, '#e8e6e1', 900);
      if (icone) { ctx.save(); retArred(ctx, W - 50 - 84, y - 52, 84, 84, 16); ctx.clip(); ctx.drawImage(icone, W - 50 - 84, y - 52, 84, 84); ctx.restore(); }
      y += 64;
      ctx.font = '800 40px system-ui, sans-serif';
      var linhasNome = quebra(ctx, b.nome || 'Minha build', LW).slice(0, 2);
      linhasNome.forEach(function (l) { texto(ctx, l, X, y, 40, '#f0d58c', 800, LW); y += 48; });
      var sub = [ROTAS[b.rota], M.patch ? 'Patch ' + M.patch : ''].filter(Boolean).join('  ·  ');
      texto(ctx, sub, X, y, 26, '#9aa4b1', 500, LW); y += 30;
      var story = formato === 'story';
      var esp = story ? 2 : 1.3;
      y += 26 * esp;
      texto(ctx, 'ITENS', X, y, 24, '#c8aa6e', 700); y += 18;
      var tam = story ? 124 : 112, gap = 18, colW = (LW - gap) / 2;
      for (var i = 0; i < b.itens.length; i++) {
        var col = i % 2, lin = Math.floor(i / 2);
        var ix = X + col * (colW + gap), iy = y + lin * (tam + 22 * esp);
        ctx.fillStyle = '#1c232c'; retArred(ctx, ix, iy, tam, tam, 14); ctx.fill();
        if (imItens[i]) { ctx.save(); retArred(ctx, ix, iy, tam, tam, 14); ctx.clip(); ctx.drawImage(imItens[i], ix, iy, tam, tam); ctx.restore(); }
        ctx.strokeStyle = '#c8aa6e'; ctx.lineWidth = 2; retArred(ctx, ix, iy, tam, tam, 14); ctx.stroke();
        texto(ctx, String(i + 1), ix + 8, iy + 28, 22, '#f0d58c', 800);
        var nomeIt = (I[b.itens[i]] || {}).n || '', ft = 22;
        ctx.font = '600 22px system-ui, sans-serif';
        while (ft > 16 && nomeIt.split(' ').some(function (p) { return ctx.measureText(p).width > colW - tam - 14; })) {
          ft -= 1; ctx.font = '600 ' + ft + 'px system-ui, sans-serif';
        }
        var nl = quebra(ctx, nomeIt, colW - tam - 14).slice(0, 3);
        nl.forEach(function (l, k) { texto(ctx, l, ix + tam + 12, iy + 30 + k * (ft + 5), ft, '#e8e6e1', 600, colW - tam - 14); });
      }
      y += Math.ceil(b.itens.length / 2) * (tam + 22 * esp) + 8 * esp;
      texto(ctx, 'Custo total: ' + moeda(custo(b.itens)) + ' de ouro', X, y, 24, '#f0d58c', 600, LW); y += 54 * esp;
      if (b.runas.length) {
        texto(ctx, 'RUNAS', X, y, 24, '#c8aa6e', 700); y += 16;
        var rt = Math.min(84, (LW - 12 * (b.runas.length - 1)) / b.runas.length);
        imRunas.forEach(function (im, k) {
          var rx = X + k * (rt + 12);
          ctx.fillStyle = '#1c232c'; ctx.beginPath(); ctx.arc(rx + rt / 2, y + rt / 2, rt / 2, 0, 7); ctx.fill();
          if (im) { ctx.save(); ctx.beginPath(); ctx.arc(rx + rt / 2, y + rt / 2, rt / 2, 0, 7); ctx.clip(); ctx.drawImage(im, rx, y, rt, rt); ctx.restore(); }
          if (k === 0) { ctx.strokeStyle = '#c8aa6e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(rx + rt / 2, y + rt / 2, rt / 2, 0, 7); ctx.stroke(); }
        });
        y += rt + 14;
        texto(ctx, (R[b.runas[0]] || {}).n || '', X, y + 12, 22, '#9aa4b1', 500, LW); y += 56 * esp;
      }
      if (b.feiticos.length) {
        texto(ctx, 'FEITIÇOS', X, y, 24, '#c8aa6e', 700); y += 16;
        imFeit.forEach(function (im, k) {
          var fx = X + k * (LW / 2);
          ctx.fillStyle = '#1c232c'; retArred(ctx, fx, y, 72, 72, 12); ctx.fill();
          if (im) { ctx.save(); retArred(ctx, fx, y, 72, 72, 12); ctx.clip(); ctx.drawImage(im, fx, y, 72, 72); ctx.restore(); }
          texto(ctx, (F[b.feiticos[k]] || {}).n || '', fx + 84, y + 46, 24, '#e8e6e1', 600, LW / 2 - 90);
        });
        y += 90;
      }
      if (b.notas) {
        y += 20 * esp; ctx.font = 'italic 400 22px system-ui, sans-serif';
        quebra(ctx, '“' + b.notas + '”', LW).slice(0, 3).forEach(function (l) { texto(ctx, l, X, y, 22, '#9aa4b1', 400, LW); y += 30; });
      }
      texto(ctx, 'Feito no WRBuild', W - 50 - 220, H - 44, 24, 'rgba(200,170,110,.85)', 700, 230);
      return cv;
    });
  }
  function abrePrint(b) {
    var formato = 'feed';
    abreModal('Print para redes sociais',
      '<div class="chips" id="fmt"><button class="chip on" data-f="feed">Feed 4:5</button><button class="chip" data-f="story">Story 9:16</button></div>' +
      '<canvas class="print-prev" id="prev"></canvas>' +
      '<div class="botoes"><button class="btn pri cheio" id="salvarImg">' + (IOS ? 'Salvar nas Fotos' : 'Salvar na galeria') + '</button><button class="btn cheio" id="compImg">Compartilhar</button></div>');
    var atual = null, blobAtual = null;
    function gera() {
      desenhaPrint(b, formato).then(function (cv) {
        atual = cv; blobAtual = null;
        if (cv.toBlob) cv.toBlob(function (bl) { if (atual === cv) blobAtual = bl; }, 'image/png');
        var p = document.getElementById('prev'); if (!p) return;
        p.width = cv.width; p.height = cv.height; p.getContext('2d').drawImage(cv, 0, 0);
      });
    }
    gera();
    document.getElementById('fmt').onclick = function (e) {
      var x = e.target.closest('[data-f]'); if (!x) return; formato = x.dataset.f;
      this.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('on', c === x); }); gera();
    };
    function nomeArq() { return 'WRBuild-' + norm(C[b.campeao].n) + '-' + Date.now() + '.png'; }
    function exporta(compartilhar) {
      if (!atual) return;
      var url;
      try { url = atual.toDataURL('image/png'); } catch (e) { aviso('Não foi possível gerar a imagem'); return; }
      if (window.Nativo && Nativo.salvarImagem) {
        var b64 = url.split(',')[1];
        var r = compartilhar ? Nativo.compartilharImagem(b64, nomeArq()) : Nativo.salvarImagem(b64, nomeArq());
        aviso(r || (compartilhar ? 'Abrindo compartilhamento…' : 'Imagem salva em Imagens/WRBuild'));
        return;
      }
      // iPhone/Safari: a folha de compartilhar tem "Salvar Imagem" (vai para o app Fotos).
      // O arquivo já fica pronto (blobAtual) para o share sair no mesmo toque, como o Safari exige.
      var arq = blobAtual && typeof File === 'function' ? new File([blobAtual], nomeArq(), { type: 'image/png' }) : null;
      if (arq && navigator.canShare && navigator.canShare({ files: [arq] }) && (compartilhar || IOS)) {
        navigator.share({ files: [arq], title: 'WRBuild' }).catch(function (e) { if (e && e.name !== 'AbortError') mostraImagem(url); });
        return;
      }
      if (IOS) { mostraImagem(url); return; }
      baixa(url);
    }
    function mostraImagem(url) {
      var p = document.getElementById('prev'); if (!p) return;
      var im = document.createElement('img'); im.src = url; im.className = 'print-prev'; im.alt = 'Print da build';
      p.replaceWith(im);
      aviso('Toque e segure a imagem e escolha “Salvar no app Fotos”');
    }
    function baixa(url) { var a = document.createElement('a'); a.href = url; a.download = nomeArq(); document.body.appendChild(a); a.click(); a.remove(); aviso('Imagem baixada'); }
    document.getElementById('salvarImg').onclick = function () { exporta(false); };
    document.getElementById('compImg').onclick = function () { exporta(true); };
  }

  navegar();

  // versão iPhone (PWA): o service worker guarda o app inteiro para funcionar sem internet
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.Nativo) {
    navigator.serviceWorker.register('sw.js').then(function () {
      // a cada abertura, termina de guardar as imagens que ainda faltam (se o app foi fechado no meio)
      return navigator.serviceWorker.ready;
    }).then(function (r) { if (r.active) r.active.postMessage('completar'); }).catch(function () { /* sem sw.js no modo de desenvolvimento */ });
  }
})();
