/**
 * ============================================================================
 *  KONTROLA EXPOZICE VŮČI ZMĚNĚ TARGET BIDDINGU (17. 8. 2026)
 * ============================================================================
 *
 *  Google od 17. 8. 2026 přestane u kampaní omezených rozpočtem nechávat
 *  tCPA/tROAS přestřelovat cíl. Skript najde kampaně, kterých se to týká.
 *
 *  Metodika, prahy a proč tři signály místo jednoho:
 *  https://karelhuk.cz/blog/jak-pohlidat-zmenu-google-biddingu-2026
 *
 *  VÝSTUP — čtyři sekce:
 *    A) DOTČENÉ        mají cíl, jsou omezené rozpočtem a cíl překonávají
 *    B) TIKAJÍCÍ BOMBY cíl daleko od reality, ale omezené rozpočtem NEJSOU
 *    C) BEZ CÍLE       uškrcené, ale není co vynucovat
 *    D) NELZE URČIT    chybí data pro verdikt — NENÍ to totéž co „v pořádku"
 *
 *  INSTALACE
 *    1. Google Ads → Nástroje → Hromadné akce → Skripty → +
 *    2. Vlož celý soubor, níže vyplň EMAIL
 *    3. Autorizovat → Náhled → zkontroluj log
 *    4. Spustit ručně. Plánovat netřeba, při plánování týdně bohatě stačí.
 *
 *  Běží na jednom účtu i na celém MCC, režim se pozná sám.
 *
 *  Prahy v nastavení jsou VOLBA, ne Googlí definice. Google žádné procento
 *  neuvádí — jeho podmínky jsou dvě: strategie s cílem a „Limited by budget".
 *
 *  ⚠ Nedetekuje Target CPC u Demand Gen, spadne do sekce C. Známé omezení.
 *
 *  ---------------------------------------------------------------------------
 *  🔴 VE VÝCHOZÍM NASTAVENÍ SKRIPT POUZE ČTE. Auto-oprava cílů je VYPNUTÁ.
 *
 *  Než ji zapneš: OPAKOVANÉ BĚHY MOHOU CÍL ROZKMITAT. Kampaň omezená rozpočtem
 *  překonává cíl strukturálně, takže po srovnání na realitu ho bude překonávat
 *  znovu, jen z vyšší základny. A tak pořád dokola:
 *
 *      přestřel  9 %:  100 → 109 → 109 …  (ustálí se)
 *      přestřel 11 %:  100 → 111 → 123 → 137 → 152 → 169
 *      přestřel 50 %:  100 → 150 → 225 → 338 → 506 → 759
 *
 *  Hranice stability je přesně OVERSHOOT_THRESHOLD a na té každá opravovaná
 *  kampaň z definice leží nebo je nad ní. Proto jsou MAX_TARGET_ROAS
 *  a MIN_TARGET_CPA povinné a proto s auto-opravou spouštěj NEJVÝŠ TÝDNĚ.
 *  ---------------------------------------------------------------------------
 *
 *  Copyright (c) 2026 Karel Huk — karelhuk.cz · licence MIT
 *  Software je poskytován „tak jak je", bez záruky. Autor nenese odpovědnost
 *  za následky, škody ani nároky vzniklé v souvislosti s jeho používáním.
 */

// ============================================================================
//  NASTAVENÍ
// ============================================================================

var CONFIG = {

  // --- výstup ---
  EMAIL: '',                 // víc adres oddělte čárkou; prázdné = neposílat
  SPREADSHEET_URL: '',       // volitelný Google Sheet pro historii běhů; prázdné = nezapisovat

  // --- okno a rozsah ---
  WINDOW_DAYS: 28,           // délka okna; násobek 7, ať nezkreslí den v týdnu
  LAG_DAYS: 3,               // kolik posledních dní vynechat kvůli zpoždění konverzí
  MIN_COST: 1000,            // ignoruj kampaně s menší útratou za okno (v MĚNĚ ÚČTU — viz níže)
  MAX_ACCOUNTS: 0,           // jen MCC: strop počtu účtů, 0 = všechny (běh má limit 30 min)

  // MIN_COST je v měně každého účtu zvlášť. Na MCC s víc měnami si ho nastav
  // podle té nejslabší, jinak z reportu vypadnou zahraniční účty.

  // --- prahy detekce --- 10 % = 0.1, 100 % = 1.0 atd.
  LOST_IS_THRESHOLD: 0.05,     // signál 1: ztráta zobrazení rozpočtem (práh 0 nafoukne počet 8×)
  BUDGET_UTIL_THRESHOLD: 0.90, // signál 3: čerpání rozpočtu; jediný signál dostupný u Demand Gen
  OVERSHOOT_THRESHOLD: 0.10,   // od jakého překonání cíle kampaň hlásit; zvyš, pokud chceš jen velké dopady
  BOMB_OVERSHOOT: 0.25,        // totéž pro sekci B, kde kampaň omezená (zatím) není — proto vyšší bar
  NO_TARGET_LOST_IS: 0.15,     // sekce C: od jaké ztráty hlásit kampaň úplně bez cíle

  // --- automatická oprava cílů; VAROVÁNÍ ČTI V HLAVIČCE SOUBORU ---
  AUTO_FIX: {
    ENABLED: false,          // hlavní vypínač; false = skript pouze čte
    DRY_RUN: true,           // jen vypíše, co by změnil; nech aspoň na jeden běh
    STRETCH: 0,              // 0 = srovnat na realitu; 0.05 = cíl o 5 % náročnější (= míň objemu)
    MIN_CONVERSIONS: 30,     // pod tímhle počtem konverzí se cíl neladí, byl by to šum
    MAX_CHANGE: 0.5,         // strop JEDNOHO kroku; NEstropuje součet napříč běhy
    MAX_TARGET_ROAS: 0,      // POVINNÉ (např. 8 = 800 %); absolutní strop proti rozkmitání
    MIN_TARGET_CPA: 0        // POVINNÉ (v měně účtu); absolutní podlaha proti rozkmitání
  }
};

// Povolený rozsah STRETCH. Mimo něj se auto-oprava odmítne spustit —
// překlep „5" místo „0.05" by jinak zapsal nesmyslný cíl.
var STRETCH_MIN = -0.20;
var STRETCH_MAX = 0.30;

// Odkaz na web autora. UTM odliší v GA4 návštěvy z e-mailu od přímých.
var ARTICLE_URL = 'https://karelhuk.cz/blog/bidding-omezeny-rozpocet-zmena-2026';
var UTM_CONTENT = 'bid-target-check';

// ============================================================================
//  VSTUPNÍ BOD
// ============================================================================

function main() {
  var range = dateRange();
  Logger.log('Okno: ' + range.from + ' .. ' + range.to);

  var fixGate = autoFixGate();
  if (CONFIG.AUTO_FIX.ENABLED && !fixGate.ok) {
    Logger.log('AUTO-OPRAVA NESPUŠTĚNA: ' + fixGate.reason);
  }

  var results = [];
  var failures = [];

  if (typeof AdsManagerApp !== 'undefined') {
    Logger.log('Režim: MCC');
    var selector = AdsManagerApp.accounts();
    if (CONFIG.MAX_ACCOUNTS > 0) selector = selector.withLimit(CONFIG.MAX_ACCOUNTS);

    var accounts = selector.get();
    var checked = 0;
    while (accounts.hasNext()) {
      var account = accounts.next();
      AdsManagerApp.select(account);
      checked++;
      try {
        var r = analyzeAccount(range);
        // Opravovat se musí TEĎ, dokud je účet vybraný.
        if (CONFIG.AUTO_FIX.ENABLED && fixGate.ok) applyFixes(r);
        if (r.campaignsScanned > 0) results.push(r);
      } catch (e) {
        // Spadlý účet musí být vidět v reportu — jinak „0 dotčených" znamená
        // totéž jako „polovina účtů se neprojela".
        failures.push({ name: account.getName(), error: String(e) });
        Logger.log('CHYBA na účtu ' + account.getName() + ': ' + e);
      }
    }
    Logger.log('Prohledáno účtů: ' + checked + ', s daty: ' + results.length +
               ', se selháním: ' + failures.length);

  } else {
    Logger.log('Režim: jeden účet');
    try {
      var single = analyzeAccount(range);
      if (CONFIG.AUTO_FIX.ENABLED && fixGate.ok) applyFixes(single);
      if (single.campaignsScanned > 0) results.push(single);
    } catch (e2) {
      failures.push({ name: AdsApp.currentAccount().getName(), error: String(e2) });
      Logger.log('CHYBA: ' + e2);
    }
  }

  var report = buildReport(results, range, failures, fixGate);

  // Logger má strop 100 KB a uřízne konec bez varování.
  Logger.log(clip(report.text, 90000, '\n[…] výpis useknut kvůli limitu logu, úplný je v e-mailu'));

  if (CONFIG.EMAIL) {
    try {
      // Limit těla zprávy je 200 KB (consumer) / 400 KB (Workspace).
      MailApp.sendEmail({
        to: CONFIG.EMAIL,
        subject: report.subject,
        htmlBody: clip(report.html, 180000, '<p><b>[…] report useknut kvůli limitu velikosti e-mailu. Zvyš MIN_COST nebo použij SPREADSHEET_URL.]</b></p>'),
        body: clip(report.text, 180000, '\n[…] useknuto')
      });
      Logger.log('E-mail odeslán na: ' + CONFIG.EMAIL);
    } catch (eMail) {
      // E-mail nesmí shodit zápis do Sheetu, který běží až po něm.
      Logger.log('E-MAIL SE NEPODAŘILO ODESLAT: ' + eMail);
    }
  }

  if (CONFIG.SPREADSHEET_URL) {
    try {
      writeSheet(results, range);
    } catch (eSheet) {
      Logger.log('ZÁPIS DO SHEETU SELHAL: ' + eSheet);
    }
  }
}

/** Auto-oprava se bez povinných absolutních mezí a s nesmyslným STRETCH nespustí. */
function autoFixGate() {
  var c = CONFIG.AUTO_FIX;
  if (!c.ENABLED) return { ok: false, reason: 'vypnuto' };
  if (!(c.STRETCH >= STRETCH_MIN && c.STRETCH <= STRETCH_MAX)) {
    return { ok: false, reason: 'STRETCH mimo povolený rozsah ' + STRETCH_MIN + ' až ' + STRETCH_MAX +
                                ' (zadáno ' + c.STRETCH + ') — nechtěl jsi napsat 0.05 místo 5?' };
  }
  if (!(c.MAX_CHANGE > 0 && c.MAX_CHANGE < 1)) {
    return { ok: false, reason: 'MAX_CHANGE musí být mezi 0 a 1 (zadáno ' + c.MAX_CHANGE + ')' };
  }
  if (!(c.MAX_TARGET_ROAS > 0) || !(c.MIN_TARGET_CPA > 0)) {
    return { ok: false, reason: 'MAX_TARGET_ROAS a MIN_TARGET_CPA jsou POVINNÉ — jsou to jediná ' +
                                'ochrana proti rozkmitání cíle při opakovaných bězích (viz hlavička)' };
  }
  return { ok: true, reason: '' };
}

// ============================================================================
//  ANALÝZA JEDNOHO ÚČTU
// ============================================================================

function analyzeAccount(range) {
  var account = AdsApp.currentAccount();
  var out = {
    accountName: account.getName(),
    accountId: account.getCustomerId(),
    currency: account.getCurrencyCode(),
    campaignsScanned: 0,
    totalCost: 0,
    portfolioLoadFailed: false,
    affected: [],
    bombs: [],
    noTarget: [],
    unknown: []
  };

  var portfolio = fetchPortfolioTargets();
  out.portfolioLoadFailed = portfolio.failed;

  var gaql =
    'SELECT campaign.id, campaign.name, campaign.bidding_strategy_type, ' +
    'campaign.advertising_channel_type, campaign.bidding_strategy, ' +
    'campaign.primary_status_reasons, ' +
    'campaign.maximize_conversion_value.target_roas, ' +
    'campaign.maximize_conversions.target_cpa_micros, ' +
    'campaign.target_roas.target_roas, ' +
    'campaign.target_cpa.target_cpa_micros, ' +
    'campaign_budget.amount_micros, campaign_budget.explicitly_shared, ' +
    'metrics.search_budget_lost_impression_share, ' +
    'metrics.cost_micros, metrics.conversions, metrics.conversions_value ' +
    'FROM campaign ' +
    "WHERE segments.date BETWEEN '" + range.from + "' AND '" + range.to + "' " +
    "AND campaign.status = 'ENABLED' " +
    // Bez tohoto filtru se experimentální větev počítá jako samostatná kampaň
    // a auto-oprava by přepsala cíl i běžícímu testu.
    "AND campaign.experiment_type = 'BASE'";

  var rows = AdsApp.search(gaql);

  while (rows.hasNext()) {
    var row = rows.next();
    var cost = micros(pick(row, ['metrics', 'costMicros']));
    if (cost < CONFIG.MIN_COST) continue;

    out.campaignsScanned++;
    out.totalCost += cost;

    var conv = numOr(pick(row, ['metrics', 'conversions']), 0);
    var value = numOr(pick(row, ['metrics', 'conversionsValue']), 0);
    var target = extractTarget(row, portfolio.map);
    var limited = detectLimited(row, cost);

    var base = {
      id: pick(row, ['campaign', 'id']),
      name: pick(row, ['campaign', 'name']),
      channel: pick(row, ['campaign', 'advertisingChannelType']),
      strategy: pick(row, ['campaign', 'biddingStrategyType']),
      cost: cost,
      conv: conv,
      value: value,
      roas: cost > 0 ? value / cost : 0,
      cpa: conv > 0 ? cost / conv : 0,
      limited: limited.state,
      limitWhy: limited.why,
      lostIs: limited.lostIs
    };

    // --- Sekce C: bez cíle ---
    if (!target) {
      // Uškrcená = buď měřitelně (lost IS), nebo prokazatelně (ostatní signály).
      if (limited.state === true ||
          (limited.lostIs !== null && limited.lostIs >= CONFIG.NO_TARGET_LOST_IS)) {
        out.noTarget.push(base);
      }
      continue;
    }

    base.targetKind = target.kind;
    base.targetValue = target.value;
    base.fromPortfolio = target.portfolio === true;

    // Kolikrát je kampaň LEPŠÍ než cíl. Poměr, ne rozdíl: podíl z cíle
    // stropuje hodnotu u tCPA na 100 %, takže tCPA kampaně pak vycházejí
    // slabší než stejně výkonné tROAS.
    var beat = null;
    if (target.kind === 'tROAS' && target.value > 0 && base.roas > 0) {
      beat = base.roas / target.value;
    } else if (target.kind === 'tCPA' && target.value > 0 && base.cpa > 0) {
      beat = target.value / base.cpa;
    }

    // --- Sekce D: cíl je, ale výsledek se nedá změřit ---
    // Kampaň s cílem, velkou útratou a nulou konverzí je ten nejnaléhavější
    // nález v účtu. Nesmí vypadnout jen proto, že se u ní nedá spočítat,
    // o kolik cíl překonává — a nesmí ředit „% v sázce".
    if (beat === null) {
      base.unknownWhy = conv === 0
        ? 'cíl nastaven, ale žádné konverze za okno'
        : 'cíl nastaven, ale chybí konverzní hodnota';
      out.unknown.push(base);
      continue;
    }

    base.beat = beat;
    base.overshoot = beat - 1;

    if (limited.state === null) {
      // Nevíme, jestli je omezená → nesmí spadnout ani do A, ani do B.
      base.unknownWhy = 'nelze určit, zda je omezená rozpočtem (' + limited.why + ')';
      out.unknown.push(base);
    } else if (limited.state === true && base.overshoot >= CONFIG.OVERSHOOT_THRESHOLD) {
      out.affected.push(base);
    } else if (limited.state === false && base.overshoot >= CONFIG.BOMB_OVERSHOOT) {
      out.bombs.push(base);
    }
    // Kampaň, která NENÍ omezená rozpočtem a překonává cíl mezi
    // OVERSHOOT_THRESHOLD a BOMB_OVERSHOOT, se nehlásí: dnes dotčená není
    // a dopad by byl malý. Chceš ji vidět? Sniž BOMB_OVERSHOOT.
  }

  sortDesc(out.affected, 'cost');
  sortDesc(out.bombs, 'cost');
  sortDesc(out.noTarget, 'cost');
  sortDesc(out.unknown, 'cost');
  return out;
}

/**
 * Je kampaň omezená rozpočtem? Vrací {state: true|false|null, why, lostIs}.
 * `null` znamená „nedá se určit" — NIKDY ne „není omezená".
 */
function detectLimited(row, cost) {
  var lostIs = numOr(pick(row, ['metrics', 'searchBudgetLostImpressionShare']), null);
  var reasons = pick(row, ['campaign', 'primaryStatusReasons']);
  var budget = micros(pick(row, ['campaignBudget', 'amountMicros']));
  var shared = pick(row, ['campaignBudget', 'explicitlyShared']) === true;

  var hits = [];
  var haveSignal = false;

  // Signál 1 — ztráta zobrazení rozpočtem. Search a Nákupy.
  if (lostIs !== null) {
    haveSignal = true;
    if (lostIs >= CONFIG.LOST_IS_THRESHOLD) hits.push('ztráta IS ' + pct(lostIs));
  }

  // Signál 2 — Googlí vlastní stav kampaně. Chytí PMax, kde signál 1 selhává.
  // Pozor: je to snímek DNEŠKA, ne agregát za okno.
  if (hasReason(reasons, 'BUDGET_CONSTRAINED')) {
    haveSignal = true;
    hits.push('Google hlásí BUDGET_CONSTRAINED');
  }

  // Signál 3 — čerpání rozpočtu. Jediný dostupný u Demand Gen.
  // U sdíleného rozpočtu nevypovídající, tam se přeskakuje.
  if (budget > 0 && !shared) {
    haveSignal = true;
    var util = cost / (budget * CONFIG.WINDOW_DAYS);
    if (util >= CONFIG.BUDGET_UTIL_THRESHOLD) hits.push('čerpání rozpočtu ' + pct(util));
  }

  if (hits.length) return { state: true, why: hits.join(', '), lostIs: lostIs };
  if (!haveSignal) return { state: null, why: 'žádný ze tří signálů není dostupný', lostIs: lostIs };
  return { state: false, why: 'žádný signál nad prahem', lostIs: lostIs };
}

/** Repeated enum pole — může přijít jako pole i jako řetězec. */
function hasReason(reasons, needle) {
  if (!reasons) return false;
  if (typeof reasons === 'string') return reasons.indexOf(needle) !== -1;
  for (var i = 0; i < reasons.length; i++) {
    if (String(reasons[i]).indexOf(needle) !== -1) return true;
  }
  return false;
}

/**
 * Cíle z portfoliových strategií. Vrací {map, failed}.
 *
 * `accessible_bidding_strategy` (ne `bidding_strategy`!) obsahuje i strategie
 * vlastněné manažerským účtem a sdílené do tohoto účtu. Agentury s cross-account
 * biddingem jinak vidí své kampaně jako „bez cíle".
 */
function fetchPortfolioTargets() {
  var map = {};
  var gaql =
    'SELECT accessible_bidding_strategy.resource_name, accessible_bidding_strategy.type, ' +
    'accessible_bidding_strategy.target_roas.target_roas, ' +
    'accessible_bidding_strategy.target_cpa.target_cpa_micros, ' +
    'accessible_bidding_strategy.maximize_conversion_value.target_roas, ' +
    'accessible_bidding_strategy.maximize_conversions.target_cpa_micros ' +
    'FROM accessible_bidding_strategy';
  try {
    var rows = AdsApp.search(gaql);
    while (rows.hasNext()) {
      var r = rows.next();
      var b = r.accessibleBiddingStrategy;
      if (!b || !b.resourceName) continue;
      var tRoas = numOr(pick(b, ['targetRoas', 'targetRoas']), 0) ||
                  numOr(pick(b, ['maximizeConversionValue', 'targetRoas']), 0);
      var tCpa = micros(pick(b, ['targetCpa', 'targetCpaMicros'])) ||
                 micros(pick(b, ['maximizeConversions', 'targetCpaMicros']));
      if (tRoas > 0) map[b.resourceName] = { kind: 'tROAS', value: tRoas };
      else if (tCpa > 0) map[b.resourceName] = { kind: 'tCPA', value: tCpa };
    }
    return { map: map, failed: false };
  } catch (e) {
    // Tiché selhání by přesunulo VŠECHNY portfoliové kampaně do „bez cíle"
    // a report by vypadal věrohodně. Proto se to musí objevit ve výstupu.
    Logger.log('Portfoliové strategie se nepodařilo načíst: ' + e);
    return { map: map, failed: true };
  }
}

/** Cíl z libovolné varianty strategie — na kampani i na portfoliu. */
function extractTarget(row, portfolio) {
  var tRoas = numOr(pick(row, ['campaign', 'targetRoas', 'targetRoas']), 0) ||
              numOr(pick(row, ['campaign', 'maximizeConversionValue', 'targetRoas']), 0);
  if (tRoas > 0) return { kind: 'tROAS', value: tRoas };

  var tCpa = micros(pick(row, ['campaign', 'targetCpa', 'targetCpaMicros'])) ||
             micros(pick(row, ['campaign', 'maximizeConversions', 'targetCpaMicros']));
  if (tCpa > 0) return { kind: 'tCPA', value: tCpa };

  var rn = pick(row, ['campaign', 'biddingStrategy']);
  if (rn && portfolio[rn]) {
    return { kind: portfolio[rn].kind, value: portfolio[rn].value, portfolio: true };
  }
  return null;
}

// ============================================================================
//  AUTOMATICKÁ OPRAVA CÍLŮ
// ============================================================================

/**
 * Srovná cíl na realitu u kampaní ze sekce A. Zapisuje do acc.fixes.
 *
 * JEDNOTKY: GAQL vrací tROAS jako NÁSOBEK (3.0 = 300 %), Scripts getter i setter
 * pracují s PROCENTY (300 = 300 %) — rozdíl přesně 100×. Proto se cíl nikdy
 * nezapisuje jako absolutní hodnota spočítaná z GAQL: přečte se getterem,
 * vynásobí BEZROZMĚRNÝM poměrem a zapíše zpět. Jednotky se vykrátí.
 */
function applyFixes(acc) {
  var cfg = CONFIG.AUTO_FIX;
  acc.fixes = [];

  for (var i = 0; i < acc.affected.length; i++) {
    var c = acc.affected[i];
    var skip = null;

    if (c.conv < cfg.MIN_CONVERSIONS) {
      skip = 'málo konverzí (' + fmtNum(c.conv) + ' < ' + cfg.MIN_CONVERSIONS + ')';
    } else if (c.fromPortfolio) {
      // Sdílená strategie ovlivňuje i kampaně, které skript nevyhodnotil.
      // Není to volitelné — getter u portfoliové kampaně vrací hodnotu
      // strategie, takže by zápis prošel a přepsal cíl všem.
      skip = 'portfoliová strategie — změna by dopadla i na jiné kampaně';
    }
    if (skip) {
      acc.fixes.push({ name: c.name, status: 'přeskočeno', note: skip });
      continue;
    }

    var desired = c.targetKind === 'tROAS'
      ? c.roas * (1 + cfg.STRETCH)    // vyšší ROAS = lepší
      : c.cpa * (1 - cfg.STRETCH);    // nižší CPA = lepší

    // Absolutní mez — jediná ochrana proti rozkmitání při opakovaných bězích.
    var bounded = false;
    if (c.targetKind === 'tROAS' && desired > cfg.MAX_TARGET_ROAS) {
      desired = cfg.MAX_TARGET_ROAS; bounded = true;
    } else if (c.targetKind === 'tCPA' && desired < cfg.MIN_TARGET_CPA) {
      desired = cfg.MIN_TARGET_CPA; bounded = true;
    }

    var ratio = desired / c.targetValue;

    // Sanity check MUSÍ být PŘED ořezem — ořez by z každého nesmyslu
    // (záporný, nula, Infinity) udělal validních 1 ± MAX_CHANGE.
    if (!isFinite(ratio) || ratio <= 0) {
      acc.fixes.push({ name: c.name, status: 'přeskočeno', note: 'nesmyslný poměr (' + ratio + ')' });
      continue;
    }

    var capped = false;
    var hi = 1 + cfg.MAX_CHANGE, lo = 1 - cfg.MAX_CHANGE;
    if (ratio > hi) { ratio = hi; capped = true; }
    if (ratio < lo) { ratio = lo; capped = true; }

    // Cíl, který po ořezu SKUTEČNĚ vznikne, v jednotkách GAQL.
    var effective = c.targetValue * ratio;

    if (Math.abs(ratio - 1) < 0.001) {
      acc.fixes.push({ name: c.name, status: 'přeskočeno', note: 'cíl už odpovídá realitě' });
      continue;
    }

    var campaign = findCampaign(c.id, c.channel);
    if (!campaign) {
      acc.fixes.push({ name: c.name, status: 'přeskočeno',
                       note: 'typ kampaně ' + c.channel + ' nemá v Google Ads Scripts selektor pro úpravu cíle' });
      continue;
    }

    var current, applied;
    try {
      var bidding = campaign.bidding();
      current = c.targetKind === 'tROAS' ? bidding.getTargetRoas() : bidding.getTargetCpa();
    } catch (e) {
      acc.fixes.push({ name: c.name, status: 'přeskočeno', note: 'cíl nelze přečíst: ' + e });
      continue;
    }

    if (current === null || current === undefined || !isFinite(current) || current <= 0) {
      acc.fixes.push({ name: c.name, status: 'přeskočeno', note: 'cíl na kampani nenastaven' });
      continue;
    }

    applied = current * ratio;

    // Poznámka tiskne EFEKTIVNÍ cíl po ořezu, ne vysněný — jinak by i náhled
    // hlásil jinou hodnotu, než jaká se zapíše.
    var note = c.targetKind + ' ' + fmtTarget(c.targetKind, c.targetValue) +
               ' -> ' + fmtTarget(c.targetKind, effective) +
               ' (realita ' + fmtTarget(c.targetKind, c.targetKind === 'tROAS' ? c.roas : c.cpa) + ')' +
               (cfg.STRETCH ? ', stretch ' + fmtNum(cfg.STRETCH * 100) + ' %' : '') +
               (bounded ? ', na absolutní mezi' : '') +
               (capped ? ', OŘÍZNUTO stropem jednoho kroku' : '');

    if (cfg.DRY_RUN) {
      acc.fixes.push({ name: c.name, status: 'jen náhled', note: note });
      Logger.log('[NÁHLED] ' + acc.accountName + ' / ' + c.name + ': ' + note);
      continue;
    }

    try {
      var b2 = campaign.bidding();
      if (c.targetKind === 'tROAS') b2.setTargetRoas(applied);
      else b2.setTargetCpa(applied);
      acc.fixes.push({ name: c.name, status: 'ZMĚNĚNO', note: note });
      Logger.log('[ZMĚNA] ' + acc.accountName + ' / ' + c.name + ': ' + note);
    } catch (e2) {
      acc.fixes.push({ name: c.name, status: 'chyba', note: String(e2) });
      Logger.log('[CHYBA] ' + acc.accountName + ' / ' + c.name + ': ' + e2);
    }
  }
}

/**
 * Každý typ kampaně má vlastní selektor. Typy bez selektoru (Video, Demand Gen,
 * App, Hotel) vrací null — auto-oprava je vynechá s vysvětlením.
 */
function findCampaign(id, channel) {
  var selector;
  if (channel === 'PERFORMANCE_MAX') selector = AdsApp.performanceMaxCampaigns();
  else if (channel === 'SHOPPING') selector = AdsApp.shoppingCampaigns();
  else if (channel === 'SEARCH' || channel === 'DISPLAY') selector = AdsApp.campaigns();
  else return null;
  try {
    // withIds() vyžaduje číslo. Řetězec bez pomlček tiše nenajde nic.
    var it = selector.withIds([Number(id)]).get();
    return it.hasNext() ? it.next() : null;
  } catch (e) {
    Logger.log('findCampaign selhalo pro ' + id + ': ' + e);
    return null;
  }
}

// ============================================================================
//  VÝSTUP
// ============================================================================

function buildReport(results, range, failures, fixGate) {
  var totA = 0, totB = 0, totC = 0, totD = 0;
  var byCur = {};          // měny se NESMÍ sčítat dohromady
  var portfolioFails = 0;

  for (var i = 0; i < results.length; i++) {
    var acc = results[i];
    totA += acc.affected.length;
    totB += acc.bombs.length;
    totC += acc.noTarget.length;
    totD += acc.unknown.length;
    if (acc.portfolioLoadFailed) portfolioFails++;

    if (!byCur[acc.currency]) byCur[acc.currency] = { total: 0, atRisk: 0 };
    byCur[acc.currency].total += acc.totalCost;
    for (var j = 0; j < acc.affected.length; j++) {
      byCur[acc.currency].atRisk += acc.affected[j].cost;
    }
  }

  var curKeys = [];
  for (var k in byCur) if (byCur.hasOwnProperty(k)) curKeys.push(k);
  curKeys.sort();

  var subject = '[17. 8. 2026] Dotčených: ' + totA + ' · bomby: ' + totB + ' · nelze určit: ' + totD;
  if (curKeys.length === 1) {
    var only = byCur[curKeys[0]];
    var sh = only.total > 0 ? (only.atRisk / only.total) * 100 : 0;
    subject += ' · v sázce ' + sh.toFixed(1) + ' %';
  } else if (curKeys.length > 1) {
    subject += ' · ' + curKeys.length + ' měn (viz report)';
  }

  var text = 'Okno ' + range.from + ' .. ' + range.to + '\n';
  text += 'Dotcene: ' + totA + ' | bomby: ' + totB + ' | bez cile: ' + totC + ' | nelze urcit: ' + totD + '\n';

  var html = '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5">';
  html += '<h2 style="margin:0 0 4px">Expozice vůči změně target biddingu</h2>';
  html += '<p style="margin:0 0 16px;color:#666">Okno ' + range.from + ' .. ' + range.to +
          ' · účtů s daty: ' + results.length + '</p>';
  html += '<p><b>Dotčené: ' + totA + '</b> · tikající bomby: ' + totB +
          ' · bez cíle a uškrcené: ' + totC + ' · <b>nelze určit: ' + totD + '</b></p>';

  // Per měnu, nikdy dohromady.
  html += '<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;font-size:13px;margin-bottom:8px">';
  html += '<tr style="background:#f4f4f4;text-align:left"><th>Měna</th><th>Útrata celkem</th><th>V sázce</th><th>Podíl</th></tr>';
  for (var ci = 0; ci < curKeys.length; ci++) {
    var cur = curKeys[ci], v = byCur[cur];
    var share = v.total > 0 ? (v.atRisk / v.total) * 100 : 0;
    html += '<tr style="border-bottom:1px solid #eee"><td>' + esc(cur) + '</td><td>' + fmtNum(v.total) +
            '</td><td>' + fmtNum(v.atRisk) + '</td><td><b>' + share.toFixed(1) + ' %</b></td></tr>';
    text += 'V sazce (' + cur + '): ' + fmtNum(v.atRisk) + ' z ' + fmtNum(v.total) + ' = ' + share.toFixed(1) + ' %\n';
  }
  html += '</table>';

  // Varování, která nesmí zapadnout.
  var warn = [];
  if (failures && failures.length) {
    var names = [];
    for (var f = 0; f < failures.length; f++) names.push(esc(failures[f].name));
    warn.push('<b>' + failures.length + ' účtů se nepodařilo zpracovat</b> — jejich kampaně v reportu NEJSOU: ' +
              names.join(', '));
  }
  if (portfolioFails) {
    warn.push('<b>U ' + portfolioFails + ' účtů se nepodařilo načíst portfoliové strategie</b> — kampaně na ' +
              'sdílených strategiích tam mohou být chybně vedené jako „bez cíle".');
  }
  if (CONFIG.AUTO_FIX.ENABLED && !fixGate.ok) {
    warn.push('<b>Auto-oprava byla zapnutá, ale nespustila se:</b> ' + esc(fixGate.reason));
  }
  if (warn.length) {
    html += '<div style="background:#fff4f4;border:1px solid #f0c0c0;padding:10px;margin:12px 0">' +
            warn.join('<br>') + '</div>';
  }

  html += section('A) Dotčené — tady se 17. 8. něco stane',
    'Splňují všechny tři podmínky. Akce: buď zvedni rozpočet, nebo srovnej cíl s realitou. Cíl odvozuj z marže, ne z historie.',
    results, 'affected');
  html += section('B) Tikající bomby — Googlí nástroj je neukáže',
    'Cíl je daleko od reality, ale kampaň prokazatelně omezená rozpočtem není. Jakmile na strop narazí, Google ji „pustí" k cíli.',
    results, 'bombs');
  html += section('C) Bez cíle a uškrcené — změna se jich netýká',
    'Není co vynucovat, protože cíl neexistuje. Jedou naslepo už dnes.',
    results, 'noTarget');
  html += section('D) Nelze určit — chybí data pro verdikt',
    'Není to totéž co „v pořádku". Buď u kampaně nejde změřit, jestli je omezená rozpočtem, nebo nemá měřitelný výsledek (cíl bez konverzí). Projdi ručně.',
    results, 'unknown');

  text += textSection('A) DOTCENE', results, 'affected');
  text += textSection('B) TIKAJICI BOMBY', results, 'bombs');
  text += textSection('C) BEZ CILE A USKRCENE', results, 'noTarget');
  text += textSection('D) NELZE URCIT', results, 'unknown');
  text += '\nSkript: ' + withUtm(ARTICLE_URL, 'email') + '\n';

  html += fixesSection(results);

  html += '<p style="margin-top:24px;padding-top:12px;border-top:1px solid #ddd;color:#666;font-size:12px">' +
          'Po 17. 8. nesleduj odchylku od cíle — ta klesne k nule právě proto, že změna zafungovala. ' +
          'Sleduj propad konverzí a konverzní hodnoty při stabilní útratě.<br>' +
          'Skript: <a href="' + esc(withUtm(ARTICLE_URL, 'email')) + '" style="color:#666">karelhuk.cz/blog/bidding-omezeny-rozpocet-zmena-2026</a></p></div>';

  return { subject: subject, html: html, text: text };
}

function section(title, note, results, key) {
  var any = false;
  for (var i = 0; i < results.length; i++) if (results[i][key].length) any = true;

  var h = '<h3 style="margin:24px 0 4px">' + title + '</h3>';
  h += '<p style="margin:0 0 10px;color:#666;font-size:13px">' + note + '</p>';
  if (!any) return h + '<p style="color:#0a0">Nic. Čisté.</p>';

  h += '<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;font-size:13px">';
  h += '<tr style="background:#f4f4f4;text-align:left">' +
       '<th>Účet</th><th>Kampaň</th><th>Typ</th><th>Cíl</th><th>Realita</th>' +
       '<th>Rozdíl</th><th>Omezená rozpočtem?</th><th>Útrata</th></tr>';

  for (var a = 0; a < results.length; a++) {
    var acc = results[a];
    for (var c = 0; c < acc[key].length; c++) {
      var r = acc[key][c];
      var targetTxt = r.targetKind
        ? fmtTarget(r.targetKind, r.targetValue)
        : '<span style="color:#c00">žádný</span>';
      var realTxt = realityText(r);
      var diffTxt = (r.overshoot === undefined || r.overshoot === null)
        ? '—'
        : '<b>' + fmtNum(r.overshoot * 100) + ' %</b>';
      var limTxt = r.limited === true ? 'ano — ' + esc(r.limitWhy)
                 : r.limited === false ? 'ne'
                 : '<span style="color:#b60">nelze určit</span>';
      if (r.unknownWhy) limTxt = '<span style="color:#b60">' + esc(r.unknownWhy) + '</span>';
      h += '<tr style="border-bottom:1px solid #eee">' +
           '<td>' + esc(acc.accountName) + '</td>' +
           '<td>' + esc(r.name) + '</td>' +
           '<td>' + esc(shortChannel(r.channel)) + '</td>' +
           '<td>' + targetTxt + '</td>' +
           '<td>' + realTxt + '</td>' +
           '<td>' + diffTxt + '</td>' +
           '<td>' + limTxt + '</td>' +
           '<td>' + fmtNum(r.cost) + ' ' + esc(acc.currency) + '</td></tr>';
    }
  }
  return h + '</table>';
}

/**
 * Realita ve stejné metrice jako cíl. U lead-genu bez konverzní hodnoty by
 * „ROAS 0.00" vypadal jako naměřený fakt, přitom je to jen 0/cost.
 */
function realityText(r) {
  if (r.targetKind === 'tCPA') return 'CPA ' + fmtNum(r.cpa);
  if (r.targetKind === 'tROAS') return 'ROAS ' + fmtNum(r.roas * 100) + ' %';
  if (r.value > 0) return 'ROAS ' + fmtNum(r.roas * 100) + ' %';
  if (r.conv > 0) return 'CPA ' + fmtNum(r.cpa);
  return 'bez konverzí';
}

/** tROAS se v Google Ads UI zadává v procentech — tisknout ho jako násobek mate. */
function fmtTarget(kind, v) {
  return kind === 'tROAS' ? fmtNum(v * 100) + ' %' : fmtNum(v);
}

function shortChannel(ch) {
  if (!ch) return '?';
  return String(ch).replace('PERFORMANCE_MAX', 'PMax').replace('DEMAND_GEN', 'DemandGen')
                   .replace('SEARCH', 'Search').replace('SHOPPING', 'Shopping')
                   .replace('DISPLAY', 'Display').replace('VIDEO', 'Video');
}

function fixesSection(results) {
  if (!CONFIG.AUTO_FIX.ENABLED) return '';
  var rows = [];
  for (var a = 0; a < results.length; a++) {
    var f = results[a].fixes || [];
    for (var i = 0; i < f.length; i++) rows.push({ acc: results[a].accountName, f: f[i] });
  }

  var mode = CONFIG.AUTO_FIX.DRY_RUN
    ? '<span style="color:#b60">POUZE NÁHLED — v účtu se nic nezměnilo</span>'
    : '<span style="color:#c00"><b>OSTRÝ REŽIM — cíle byly v účtu změněny</b></span>';

  var h = '<h3 style="margin:24px 0 4px">Automatická oprava cílů</h3>';
  h += '<p style="margin:0 0 10px;font-size:13px">Režim: ' + mode +
       ' · stretch ' + fmtNum(CONFIG.AUTO_FIX.STRETCH * 100) + ' %' +
       ' · min. konverzí ' + CONFIG.AUTO_FIX.MIN_CONVERSIONS + '</p>';
  h += '<p style="margin:0 0 10px;font-size:12px;color:#b60">Opakované ostré běhy mohou cíl rozkmitat. ' +
       'Spouštěj nejvýš týdně a výsledek kontroluj.</p>';

  if (!rows.length) return h + '<p>Nebylo co opravovat.</p>';

  h += '<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;font-size:13px">';
  h += '<tr style="background:#f4f4f4;text-align:left"><th>Účet</th><th>Kampaň</th><th>Stav</th><th>Detail</th></tr>';
  for (var r = 0; r < rows.length; r++) {
    var color = (rows[r].f.status === 'ZMĚNĚNO' || rows[r].f.status === 'chyba') ? '#c00' : '#666';
    h += '<tr style="border-bottom:1px solid #eee">' +
         '<td>' + esc(rows[r].acc) + '</td>' +
         '<td>' + esc(rows[r].f.name) + '</td>' +
         '<td style="color:' + color + '">' + esc(rows[r].f.status) + '</td>' +
         '<td>' + esc(rows[r].f.note) + '</td></tr>';
  }
  return h + '</table>';
}

function textSection(title, results, key) {
  var t = '\n=== ' + title + ' ===\n';
  var any = false;
  for (var a = 0; a < results.length; a++) {
    var acc = results[a];
    for (var c = 0; c < acc[key].length; c++) {
      var r = acc[key][c];
      any = true;
      t += acc.accountName + ' | ' + r.name + ' | ' + shortChannel(r.channel) +
           ' | cil ' + (r.targetKind ? fmtTarget(r.targetKind, r.targetValue) : 'zadny') +
           ' | rozdil ' + (r.overshoot != null ? fmtNum(r.overshoot * 100) + '%' : '-') +
           ' | omezena: ' + (r.limited === true ? 'ano' : r.limited === false ? 'ne' : 'nelze urcit') +
           ' | ' + fmtNum(r.cost) + ' ' + acc.currency + '\n';
    }
  }
  return any ? t : t + 'nic\n';
}

function writeSheet(results, range) {
  var ss = SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);
  var sheet = ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Datum běhu', 'Od', 'Do', 'Sekce', 'Účet', 'ID účtu', 'Kampaň', 'Typ',
                     'Typ cíle', 'Cíl', 'Realita', 'Rozdíl %', 'Omezená rozpočtem', 'Proč',
                     'Útrata', 'Měna']);
  }
  var today = Utilities.formatDate(new Date(), AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');
  var keys = [['affected', 'A dotčené'], ['bombs', 'B bomba'],
              ['noTarget', 'C bez cíle'], ['unknown', 'D nelze určit']];
  var buffer = [];
  for (var a = 0; a < results.length; a++) {
    var acc = results[a];
    for (var k = 0; k < keys.length; k++) {
      var list = acc[keys[k][0]];
      for (var c = 0; c < list.length; c++) {
        var r = list[c];
        buffer.push([today, range.from, range.to, keys[k][1], acc.accountName, acc.accountId,
                     r.name, shortChannel(r.channel), r.targetKind || '',
                     r.targetValue != null ? r.targetValue : '',
                     r.targetKind === 'tCPA' ? r.cpa : r.roas,
                     r.overshoot != null ? r.overshoot * 100 : '',
                     r.limited === true ? 'ano' : r.limited === false ? 'ne' : 'nelze určit',
                     r.unknownWhy || r.limitWhy || '', r.cost, acc.currency]);
      }
    }
    // Mutační log patří do trvalého výstupu, ne jen do e-mailu.
    var fx = acc.fixes || [];
    for (var x = 0; x < fx.length; x++) {
      buffer.push([today, range.from, range.to, 'OPRAVA: ' + fx[x].status, acc.accountName,
                   acc.accountId, fx[x].name, '', '', '', '', '', '', fx[x].note, '', acc.currency]);
    }
  }
  if (buffer.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, buffer.length, buffer[0].length).setValues(buffer);
    Logger.log('Zapsáno do Sheetu: ' + buffer.length + ' řádků');
  }
}

// ============================================================================
//  POMOCNÉ FUNKCE
// ============================================================================

function dateRange() {
  var tz = AdsApp.currentAccount().getTimeZone();
  var end = new Date();
  end.setDate(end.getDate() - CONFIG.LAG_DAYS);
  var start = new Date(end);
  start.setDate(start.getDate() - (CONFIG.WINDOW_DAYS - 1));
  return {
    from: Utilities.formatDate(start, tz, 'yyyy-MM-dd'),
    to: Utilities.formatDate(end, tz, 'yyyy-MM-dd')
  };
}

/** Bezpečné čtení vnořeného pole — AdsApp.search vrací nenastavená pole jako undefined. */
function pick(obj, path) {
  var cur = obj;
  for (var i = 0; i < path.length; i++) {
    if (cur === null || cur === undefined) return null;
    cur = cur[path[i]];
  }
  return cur === undefined ? null : cur;
}

function numOr(v, fallback) {
  if (v === null || v === undefined || v === '') return fallback;
  var n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

/** AdsApp.search vrací micros — na rozdíl od exportů z UI se nepřevádí samo. */
function micros(v) {
  var n = parseFloat(v);
  return isNaN(n) ? 0 : n / 1000000;
}

function sortDesc(arr, key) {
  arr.sort(function (a, b) { return b[key] - a[key]; });
}

function pct(v) { return (v * 100).toFixed(1) + ' %'; }

function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n) || !isFinite(n)) return '—';
  var r = Math.round(n * 100) / 100;
  return r === Math.round(n) ? String(Math.round(n)) : r.toFixed(2);
}

/** Přidá k odkazu na karelhuk.cz UTM. E-mail jde v GA4 do kanálu Email, ostatní do Referral. */
function withUtm(url, source) {
  var medium = source === 'email' ? 'email' : 'referral';
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 'utm_source=' + source + '&utm_medium=' + medium +
    '&utm_campaign=github-scripts&utm_content=' + UTM_CONTENT;
}

function clip(s, max, suffix) {
  s = String(s);
  return s.length <= max ? s : s.substring(0, max) + suffix;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
