/* WRBuild – motor da calculadora de dano (Wild Rift, patch de referência 7.3b).
 *
 * Fórmulas (pesquisa em dados/curadoria + notas oficiais de patch):
 *  - atributo por nível: base + crescimento × (nível − 1)
 *  - vel. de ataque: base + razão × bônus; bônus de nível = g × (0,7(L−1) + 0,02(L−1)L) (14g no nível 15); teto 3,0
 *  - resistência: 100/(100+R) se R ≥ 0; 2 − 100/(100−R) se R < 0
 *  - penetração: redução plana → redução % → pen % → pen plana (pen não leva abaixo de 0)
 *  - crítico: 200% (+30% com Gume do Infinito); aceleração: recarga × 100/(100+AH)
 *  - valores "X–Y conforme o nível" (runas/itens): X + (Y−X)(L−1)/14
 * Tudo devolve também a conta escrita, para a tela mostrar de onde veio cada número.
 */
(function (raiz) {
  'use strict';

  var NIVEL_MAX = 15, CRIT_BASE = 200, AS_CAP = 3.0, NIVEIS_ULT = [5, 9, 13];
  var STATS = ['hp', 'mana', 'ad', 'ap', 'arm', 'mr', 'as', 'crit', 'ms', 'msp', 'ah', 'arpen', 'arpenp',
    'mpen', 'mpenp', 'vamp', 'omni', 'hsp', 'hpreg', 'mpreg', 'ten'];

  function interp(par, nivel, ate) {     // [min, max] do nível 1 ao 15 (ou até o nível "ate")
    if (!par) return 0;
    if (par.length === 1) return par[0];
    var fim = ate || NIVEL_MAX;
    return par[0] + (par[1] - par[0]) * (Math.min(Math.max(nivel, 1), fim) - 1) / (fim - 1);
  }
  function porRank(v, rank) {            // lista por rank; 1 valor = fixo
    if (!v || !v.length) return 0;
    if (v.length === 1) return v[0];
    return v[Math.min(Math.max(rank, 1), v.length) - 1];
  }
  function cresce(par, nivel) { return par ? par[0] + (par[1] || 0) * (nivel - 1) : 0; }
  function multResist(r) { return r >= 0 ? 100 / (100 + r) : 2 - 100 / (100 - r); }
  function r1(x) { return Math.round(x * 10) / 10; }

  /** Rank máximo de cada habilidade num nível (ult em 5/9/13; básicas até 4). */
  function rankMaxUlt(nivel) { return NIVEIS_ULT.filter(function (n) { return nivel >= n; }).length; }
  function rankMaxBasica(nivel) { return Math.min(4, Math.ceil(nivel / 2)); }

  /** Distribui os pontos do nível pela ordem de prioridade (ex.: ['1','3','2']). */
  function ranksPadrao(nivel, ordem) {
    var ult = rankMaxUlt(nivel), pontos = nivel - ult, r = { '1': 0, '2': 0, '3': 0, '4': ult };
    ordem = (ordem && ordem.length ? ordem : ['1', '3', '2']).filter(function (k) { return k !== '4'; });
    ['1', '2', '3'].forEach(function (k) { if (ordem.indexOf(k) < 0) ordem.push(k); });
    // primeiro 1 ponto em cada (até nível 3), depois a prioridade
    ordem.forEach(function (k) { if (pontos > 0) { r[k] = 1; pontos--; } });
    var cap = rankMaxBasica(nivel);
    ordem.forEach(function (k) { while (pontos > 0 && r[k] < Math.min(4, cap)) { r[k]++; pontos--; } });
    ordem.forEach(function (k) { while (pontos > 0 && r[k] < 4) { r[k]++; pontos--; } });
    return r;
  }

  /** Soma os atributos de itens e runas, aplica amplificações e conversões. */
  function montaStats(camp, nivel, itens, runas, extra) {
    var st = camp.st || {}, b = {}, base = {};
    base.hp = cresce(st.hp, nivel); base.mana = cresce(st.mana, nivel);
    base.ad = cresce(st.ad, nivel); base.arm = cresce(st.arm, nivel); base.mr = cresce(st.mr, nivel);
    base.ms = st.ms ? st.ms[0] : 0;
    var asBase = st.as ? st.as[0] : 0.625, asG = st.as ? (st.as[1] || 0) : 0;
    var asRatio = st.as && st.as[2] ? st.as[2] : asBase;
    STATS.forEach(function (k) { b[k] = 0; });
    b.as = asG * (0.7 * (nivel - 1) + 0.02 * (nivel - 1) * nivel);   // % de vel. de ataque do nível

    var efeitos = [], fontes = [];
    function soma(lista, tipo) {
      (lista || []).forEach(function (x) {
        if (!x) return;
        var s = x.st || {};
        Object.keys(s).forEach(function (k) { if (b[k] !== undefined) b[k] += Number(s[k]) || 0; });
        (x.ef || []).forEach(function (e) { efeitos.push({ e: e, de: x.n || '', tipo: tipo }); });
        fontes.push(x.n);
      });
    }
    soma(itens, 'item'); soma(runas, 'runa');
    if (extra) Object.keys(extra).forEach(function (k) { if (b[k] !== undefined) b[k] += extra[k]; });

    // adaptativo: vira AD ou AP conforme o maior bônus; sem valor de AP informado, AP = 2 × AD (padrão do jogo)
    var adAD = 0, adAP = 0;
    function somaAdapt(ad, ap) { adAD += ad; adAP += ap == null ? ad * 2 : ap; }
    efeitos.forEach(function (f) {
      var e = f.e;
      if (e.tipo === 'adapt') {
        var vAD = e.nivel ? interp(e.nivel, nivel) : (e.ad || 0);
        somaAdapt(vAD, e.ap_nivel ? interp(e.ap_nivel, nivel) : e.ap);
      }
      if (e.tipo === 'stack' && e.st_por_stack && extra && extra.stacksCheios) {
        var sp = e.st_por_stack, n = e.max || 1;
        if (sp.adapt_nivel || sp.ap_nivel) somaAdapt(interp(sp.adapt_nivel, nivel) * n, sp.ap_nivel ? interp(sp.ap_nivel, nivel) * n : null);
        Object.keys(sp).forEach(function (k) { if (b[k] !== undefined) b[k] += sp[k] * n; });
        if (e.omni_cheio) b.omni += e.omni_cheio;
      }
    });
    var preferAP = camp.adapt === 'ap' || (camp.adapt !== 'ad' && b.ap > b.ad);
    if (adAD || adAP) { if (preferAP) b.ap += adAP; else b.ad += adAD; }

    // conversões e amplificações (depois das somas)
    var tot = {};
    function recalc() {
      tot.hp = base.hp + b.hp; tot.mana = base.mana + b.mana; tot.ad = base.ad + b.ad; tot.ap = b.ap;
      tot.arm = base.arm + b.arm; tot.mr = base.mr + b.mr;
    }
    recalc();
    efeitos.forEach(function (f) {
      var e = f.e;
      if (e.tipo === 'stat_de') {
        var de = { mana: tot.mana, hp: tot.hp, bhp: b.hp, ap: tot.ap, bad: b.ad, ad: tot.ad, bmana: b.mana, ad_base: base.ad }[e.de] || 0;
        b[e.s] = (b[e.s] || 0) + de * e.pct / 100; recalc();
      }
    });
    efeitos.forEach(function (f) {
      var e = f.e;
      if (e.tipo === 'amp_stat' && !e.cond) {
        if (e.s === 'ap') b.ap *= 1 + e.pct / 100; else if (e.s === 'hp') b.hp += tot.hp * e.pct / 100;
        else if (e.s === 'ad') b.ad += b.ad * e.pct / 100;
        else b[e.s] = (b[e.s] || 0) * (1 + e.pct / 100);
        recalc();
      }
    });
    recalc();
    var asTot = Math.min(AS_CAP, asBase + asRatio * b.as / 100);
    var critDano = CRIT_BASE;
    efeitos.forEach(function (f) { if (f.e.tipo === 'crit_dano') critDano += f.e.pct; });
    return {
      nivel: nivel, base: base, bonus: b, efeitos: efeitos,
      hp: tot.hp, mana: tot.mana, ad: tot.ad, ap: tot.ap, arm: tot.arm, mr: tot.mr,
      bad: b.ad, bhp: b.hp, barm: b.arm, bmr: b.mr, bmana: b.mana, adBase: base.ad,
      as: asTot, asBonus: b.as, crit: Math.min(100, b.crit), critDano: critDano,
      ah: b.ah, ms: (base.ms + b.ms) * (1 + b.msp / 100),
      arpen: b.arpen, arpenp: Math.min(b.arpenp, 100), mpen: b.mpen, mpenp: Math.min(b.mpenp, 100),
      hsp: b.hsp, omni: b.omni, vamp: b.vamp, distancia: !!camp.distancia
    };
  }

  function valorAtributo(s, a) {
    switch (s) {
      case 'ap': return a.ap; case 'ad': return a.ad; case 'bad': return a.bad; case 'ad_base': return a.adBase;
      case 'hp': return a.hp; case 'bhp': return a.bhp; case 'arm': return a.arm; case 'barm': return a.barm;
      case 'mr': return a.mr; case 'bmr': return a.bmr; case 'mana': return a.mana; case 'bmana': return a.bmana;
      case 'nivel': return a.nivel; case 'crit': return a.crit; case 'bas': return a.asBonus;
      default: return 0;
    }
  }
  var NOME_ATR = { ap: 'PH', ad: 'AD', bad: 'AD bônus', ad_base: 'AD base', hp: 'vida máx.', bhp: 'vida bônus',
    arm: 'armadura', barm: 'armadura bônus', mr: 'RM', bmr: 'RM bônus', mana: 'mana máx.', bmana: 'mana bônus',
    nivel: 'nível', crit: 'crítico', bas: 'vel. atq. bônus' };

  /** Resistência efetiva do alvo contra o atacante. */
  function resistEfetiva(tipo, atk, alvo, reducoes) {
    var r, pp, pf, red = reducoes || {};
    if (tipo === 'f') { r = alvo.arm; pp = atk.arpenp; pf = atk.arpen; r -= red.armPlana || 0; if (r > 0) r *= 1 - (red.armPct || 0) / 100; }
    else { r = alvo.mr; pp = atk.mpenp; pf = atk.mpen; r -= red.mrPlana || 0; if (r > 0) r *= 1 - (red.mrPct || 0) / 100; }
    if (r > 0) { r *= 1 - pp / 100; r = Math.max(0, r - pf); }
    return r;
  }

  /** Dano bruto de um componente (antes da resistência). */
  function bruto(c, rank, atk, alvo, ctx) {
    var partes = [], v = 0;
    if (c.nivel) { var n = interp(c.nivel, atk.nivel); v += n; partes.push(r1(n) + ' (nível ' + atk.nivel + ')'); }
    else if (c.base && c.base.length) { var bb = porRank(c.base, rank); v += bb; if (bb) partes.push(String(bb)); }
    (c.r || []).forEach(function (r) {
      var pct = r.nivel ? interp(r.nivel, atk.nivel) : porRank(r.v, rank);
      var st = valorAtributo(r.s, atk), add = pct / 100 * st;
      v += add; partes.push(r1(pct) + '% ' + (NOME_ATR[r.s] || r.s) + ' (' + r1(add) + ')');
    });
    if (c.pct) {
      var p = porRank(c.pct.v, rank);
      (c.pct.r || []).forEach(function (r) { p += porRank(r.v, rank) * valorAtributo(r.s, atk) / 100; });
      var dono = c.pct.alvo === false ? atk : alvo, vidaAtual = c.pct.alvo === false ? dono.hp : dono.hp * (ctx.vidaAlvo / 100);
      var ref = c.pct.de === 'perdida' ? dono.hp - vidaAtual : c.pct.de === 'atual' ? vidaAtual : dono.hp;
      var add2 = p / 100 * ref; v += add2;
      partes.push(r1(p) + '% vida ' + ({ max: 'máx.', atual: 'atual', perdida: 'perdida' }[c.pct.de] || '') +
        (c.pct.alvo === false ? ' própria' : ' do alvo') + ' (' + r1(add2) + ')');
    }
    var hits = c.hits || 1, mult = hits;
    if (c.por_seg) mult *= c.dur || 1;
    return { v: v * mult, unit: v, conta: partes.join(' + ') + (mult !== 1 ? ' × ' + r1(mult) + (c.por_seg ? ' (s)' : '') : '') };
  }

  /** Aplica a resistência e as amplificações; cura/escudo usam a potência de cura e escudo. */
  function mitiga(tipo, valor, atk, alvo, ctx) {
    if (tipo === 'cura' || tipo === 'escudo') return { v: valor * (1 + (atk.hsp || 0) / 100), mult: 1 + (atk.hsp || 0) / 100, resist: null };
    var amp = ctx.amp || 1;
    if (tipo === 'v') return { v: valor * amp, mult: amp, resist: null };
    var t = tipo === 'adapt' ? (atk.bad >= atk.ap / 1.67 && atk.bad > 0 ? 'f' : 'm') : tipo;
    var r = resistEfetiva(t, atk, alvo, ctx.reducoes), m = multResist(r) * amp;
    return { v: valor * m, mult: m, resist: r, t: t };
  }

  function recargaComAH(cd, ah) { return cd * 100 / (100 + (ah || 0)); }

  /**
   * cfg = { atk: {camp, nivel, itens, runas, ranks, ordem}, alvo: {camp, nivel, itens, runas},
   *         desligados: {'1:ida': true}, autos: 2, ignite: false, vidaAlvo: 100, stacksCheios: true,
   *         condicoes: {nomeDoEfeito: true} }
   */
  function calcular(cfg) {
    var A = cfg.atk, B = cfg.alvo;
    var atk = montaStats(A.camp, A.nivel, A.itens, A.runas, { stacksCheios: cfg.stacksCheios !== false });
    var alvo = montaStats(B.camp, B.nivel, B.itens, B.runas, { stacksCheios: false });
    var ranks = A.ranks || ranksPadrao(A.nivel, A.ordem);
    var ctx = { vidaAlvo: cfg.vidaAlvo == null ? 100 : cfg.vidaAlvo, reducoes: {}, amp: 1, ampUlt: 1 };

    // efeitos de item/runa: reduções de resistência, amplificações condicionais e procs
    var procs = [], condicoes = [];
    atk.efeitos.forEach(function (f, i) {
      var e = f.e, chave = (f.de || '') + ':' + (e.nome || e.tipo) + ':' + i;
      if (e.tipo === 'reduz_arm') ctx.reducoes.armPct = Math.max(ctx.reducoes.armPct || 0, e.pct);
      if (e.tipo === 'reduz_mr') ctx.reducoes.mrPct = Math.max(ctx.reducoes.mrPct || 0, e.pct);
      if (e.tipo === 'amp_dano') {
        var soUlt = /ultimate/i.test(e.cond || '');
        var on = cfg.condicoes && chave in cfg.condicoes ? cfg.condicoes[chave] : e.combo !== false && (!e.cond || soUlt);
        condicoes.push({ chave: chave, de: f.de, pct: e.pct, cond: e.cond || '', ligado: on });
        if (on) { if (soUlt) ctx.ampUlt *= 1 + e.pct / 100; else ctx.amp *= 1 + e.pct / 100; }
      }
      if (e.tipo === 'proc') procs.push({ chave: chave, de: f.de, e: e });
    });

    var habs = [], totalCombo = 0, curaCombo = 0, escudoCombo = 0, usadas = 0;
    (A.camp.hab || []).forEach(function (h) {
      var rank = h.k === 'P' ? 1 : ranks[h.k] || 0;
      var hb = { k: h.k, n: h.n, rank: rank, comps: [], obs: h.obs || '', txt: h.txt || '' };
      if (h.cd && h.cd.length && rank) {
        var cd = parseFloat(porRank(h.cd, rank));
        if (cd) hb.cd = { base: cd, final: recargaComAH(cd, atk.ah) };
      }
      var algum = false;
      (h.comps || []).forEach(function (c) {
        var id = h.k + ':' + c.id;
        if (h.k !== 'P' && !rank) { hb.comps.push({ id: id, rot: c.rot, t: c.t, bloqueado: true }); return; }
        var ctxH = h.k === '4' && ctx.ampUlt !== 1 ? Object.assign({}, ctx, { amp: ctx.amp * ctx.ampUlt }) : ctx;
        var b = bruto(c, rank || 1, atk, alvo, ctxH), m = mitiga(c.t, b.v, atk, alvo, ctxH);
        var ligado = cfg.desligados && id in cfg.desligados ? !cfg.desligados[id] : c.combo !== false;
        var item = { id: id, rot: c.rot, t: c.t, bruto: b.v, final: m.v, conta: b.conta, resist: m.resist, mult: m.mult,
          ligado: ligado, nota: c.nota || '' };
        hb.comps.push(item);
        if (ligado) {
          if (c.t === 'cura') curaCombo += m.v; else if (c.t === 'escudo') escudoCombo += m.v;
          else { totalCombo += m.v; algum = true; }
        }
      });
      if (algum && h.k !== 'P') usadas++;
      habs.push(hb);
    });

    // ataques básicos
    var critChance = atk.crit / 100, critMult = atk.critDano / 100;
    var mitAuto = mitiga('f', 1, atk, alvo, ctx).mult;
    var autoBruto = atk.ad, autoEsperado = atk.ad * (1 + critChance * (critMult - 1));
    var onHit = 0, onHitTxt = [];
    var procsOut = [];
    procs.forEach(function (p) {
      var e = p.e, c = { nivel: e.nivel && e.nivel_ate ? [interp(e.nivel, atk.nivel, e.nivel_ate)] : e.nivel,
        base: e.base != null ? [e.base] : [], r: (e.r || []).map(function (r) { return { s: r.s, v: [r.v] }; }),
        pct: e.pct ? { v: [e.pct.v], de: e.pct.de, alvo: e.pct.alvo !== false } : null,
        hits: e.hits, por_seg: e.por_seg, dur: e.dur };
      var t = e.t === 'adapt' ? 'adapt' : e.t;
      var b = bruto(c, 1, atk, alvo, ctx), m = mitiga(t, b.v, atk, alvo, ctx);
      var vezes = 0;
      var ligado = cfg.condicoes && p.chave in cfg.condicoes ? cfg.condicoes[p.chave] : e.combo !== false;
      if (e.gatilho === 'ataque') { onHit += m.v; onHitTxt.push(p.de); vezes = cfg.autos || 0; }
      else if (e.gatilho === 'ataque_n') vezes = Math.floor((cfg.autos || 0) / (e.n || 3));
      else if (e.gatilho === 'ataque_apos_hab') vezes = Math.min(usadas, cfg.autos || 0);
      else vezes = 1;
      var tot = ligado ? m.v * vezes : 0;
      if (e.t === 'cura') curaCombo += tot; else if (e.t === 'escudo') escudoCombo += tot; else totalCombo += tot;
      procsOut.push({ chave: p.chave, de: p.de, nome: e.nome || '', t: m.t || e.t, unid: m.v, vezes: vezes, total: tot, conta: b.conta, ligado: ligado, gatilho: e.gatilho });
    });
    var autoFinal = autoEsperado * mitAuto;
    var nAutos = cfg.autos || 0;
    totalCombo += autoFinal * nAutos;

    var ignite = null;
    if (cfg.ignite) {
      ignite = 72 + 22 * (atk.nivel - 1);
      totalCombo += ignite;
    }
    var vidaAtualAlvo = alvo.hp * ctx.vidaAlvo / 100;
    return {
      atk: atk, alvo: alvo, ranks: ranks, habs: habs, procs: procsOut, condicoes: condicoes,
      auto: { bruto: autoBruto, esperado: autoEsperado, final: autoFinal, critMult: critMult, mult: mitAuto,
        dps: atk.as * (autoFinal + onHit), onHit: onHit, onHitDe: onHitTxt },
      ignite: ignite,
      resist: { fisica: resistEfetiva('f', atk, alvo, ctx.reducoes), magica: resistEfetiva('m', atk, alvo, ctx.reducoes),
        multF: multResist(resistEfetiva('f', atk, alvo, ctx.reducoes)), multM: multResist(resistEfetiva('m', atk, alvo, ctx.reducoes)) },
      combo: { dano: totalCombo, cura: curaCombo, escudo: escudoCombo, vidaAlvo: vidaAtualAlvo,
        pct: vidaAtualAlvo ? totalCombo / vidaAtualAlvo * 100 : 0, mata: totalCombo >= vidaAtualAlvo },
      amp: ctx.amp
    };
  }

  var api = { calcular: calcular, montaStats: montaStats, ranksPadrao: ranksPadrao, multResist: multResist,
    resistEfetiva: resistEfetiva, interp: interp, recargaComAH: recargaComAH, rankMaxUlt: rankMaxUlt,
    rankMaxBasica: rankMaxBasica, NIVEL_MAX: NIVEL_MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.WRCalc = api;
})(this);
