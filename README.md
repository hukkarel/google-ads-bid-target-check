# Kontrola cílů biddingu po změně Google Ads z 17. 8. 2026

Skript pro Google Ads. Najde kampaně, kterých se týká změna chování tCPA a tROAS u rozpočtem omezených kampaní, a na vyžádání jim srovná cíl na realitu.

## Co to je

Jeden soubor do Google Ads skriptů. Běží na jednom účtu i na celém MCC, režim si pozná sám. Ve výchozím nastavení pouze čte a posílá výsledek e-mailem, volitelně zapisuje historii běhů do Google Sheetu.

## Jaký problém řeší

Google od 17. 8. 2026 přestal u kampaní omezených rozpočtem nechávat tCPA a tROAS přestřelovat cíl. Do té doby uškrcená kampaň běžně doručovala nad svůj cíl, a nikomu to nevadilo, protože cíl byl stejně jen orientační. Po změně se kampaň drží cíle, který jste kdysi nastavili od oka, a objem spadne.

Google k tomu nedal žádnou diagnostiku. V rozhraní nenajdete seznam „tyhle kampaně to zasáhne". Skript ho sestaví za vás a rozdělí kampaně do čtyř skupin, protože každá vyžaduje jinou reakci:

| Sekce | Co v ní je | Co s tím |
|---|---|---|
| **A) Dotčené** | mají cíl, jsou omezené rozpočtem a cíl překonávají | tady spadne objem, řešte první |
| **B) Tikající bomby** | cíl daleko od reality, ale omezené rozpočtem nejsou | zasáhne je to, až přidáte rozpočet |
| **C) Bez cíle** | uškrcené rozpočtem, ale není co vynucovat | změna se jich netýká |
| **D) Nelze určit** | chybí data pro verdikt | **není totéž co „v pořádku"** |

Prahy v nastavení jsou volba, ne definice Googlu. Google žádné procento neuvádí, jeho podmínky jsou dvě: strategie s cílem a stav „Omezeno rozpočtem".

Metodika, prahy a proč tři signály místo jednoho: [karelhuk.cz/blog/jak-pohlidat-zmenu-google-biddingu-2026](https://karelhuk.cz/blog/jak-pohlidat-zmenu-google-biddingu-2026)

## Pro koho je to

Pro toho, kdo spravuje účty s automatickými strategiemi a nechce projít pár set kampaní ručně. Na velkém MCC je to rozdíl mezi odpolednem a třemi minutami.

Programovat nemusíte. Stačí přístup do Google Ads s právem spouštět skripty.

## Jak se používá

1. Google Ads → Nástroje → Hromadné akce → Skripty → **+**
2. Vložte celý obsah `bid-target-check.js`
3. V `CONFIG` nahoře vyplňte `EMAIL` (víc adres oddělte čárkou)
4. Autorizovat → Náhled → zkontrolujte log
5. Spustit ručně. Plánovat netřeba, při plánování týdně bohatě stačí.

Volitelně vyplňte `SPREADSHEET_URL` a skript bude zapisovat historii běhů do Google Sheetu.

### Automatická oprava cílů je ve výchozím nastavení vypnutá

Skript jen čte. Po zapnutí opravy ještě jeden běh pouze vypíše, co by udělal.

Než ji zapnete: **opakované běhy mohou cíl rozkmitat.** Kampaň omezená rozpočtem překonává cíl strukturálně, takže po srovnání na realitu ho překoná znovu, jen z vyšší základny:

```
přestřel  9 %:  100 → 109 → 109 …  (ustálí se)
přestřel 11 %:  100 → 111 → 123 → 137 → 152 → 169
přestřel 50 %:  100 → 150 → 225 → 338 → 506 → 759
```

Hranice stability je přesně práh, od kterého skript kampaň hlásí, a na něm každá opravovaná kampaň z definice leží nebo je nad ním. Proto jsou `MAX_TARGET_ROAS` a `MIN_TARGET_CPA` povinné a proto s opravou spouštějte nejvýš týdně.

## Jaký je příklad

Výstup z účtu s několika desítkami kampaní:

```
A) DOTČENÉ (3)
   Shopping - Elektro        tROAS 400 %   realita 612 %   omezeno rozpočtem
   Search - Brand            tCPA  120 Kč  realita  74 Kč   omezeno rozpočtem
   PMax - Doplňky            tROAS 350 %   realita 489 %   omezeno rozpočtem

B) TIKAJÍCÍ BOMBY (2)
   Shopping - Outlet         tROAS 300 %   realita 505 %   rozpočet zatím stačí

C) BEZ CÍLE (7)
D) NELZE URČIT (4)
```

Sekce A říká, kde objem spadne hned. Sekce B je seznam na příště, až někdo přidá rozpočet.

## Známé omezení

Nedetekuje Target CPC u Demand Gen, ty spadnou do sekce C.

## English summary

Google Ads script that flags campaigns exposed to the 17 August 2026 target-bidding change, where budget-limited campaigns stopped overshooting tCPA and tROAS. Google shipped no diagnostic for this, so the script builds the list.

Four output sections, because each needs a different response: **affected** (target, budget-limited, overshooting — volume drops here), **ticking bombs** (target far from reality but not yet budget-limited), **no target** (throttled but nothing to enforce), and **undetermined** (missing data, which is not the same as fine).

Read-only by default. Optional target correction is guarded by mandatory absolute bounds, because repeated runs can walk a target upward without them. Runs on a single account or a whole MCC. Method and thresholds: [karelhuk.cz/en/blog/how-to-check-google-bidding-change-2026](https://karelhuk.cz/en/blog/how-to-check-google-bidding-change-2026)

## Licence

MIT, viz [LICENSE](LICENSE). Software je poskytován „tak jak je", bez záruky.

---

**Author: Karel Huk**
E-commerce PPC & Google Ads automation
[https://karelhuk.cz](https://karelhuk.cz)
