# Kontrola cílů biddingu po změně Google Ads z 17. 8. 2026

Google od 17. 8. 2026 přestal u kampaní omezených rozpočtem nechávat tCPA a tROAS přestřelovat cíl. Tento skript pro Google Ads najde kampaně, kterých se to týká, a na vyžádání jim srovná cíl na realitu.

Metodika, prahy a proč tři signály místo jednoho: [karelhuk.cz/blog/jak-pohlidat-zmenu-google-biddingu-2026](https://karelhuk.cz/blog/jak-pohlidat-zmenu-google-biddingu-2026)

## Co skript vypíše

Čtyři sekce:

- **A) Dotčené**: mají cíl, jsou omezené rozpočtem a cíl překonávají
- **B) Tikající bomby**: cíl daleko od reality, ale rozpočtem omezené nejsou
- **C) Bez cíle**: uškrcené rozpočtem, ale není co vynucovat
- **D) Nelze určit**: chybí data pro verdikt. Není to totéž co „v pořádku"

Prahy v `CONFIG` jsou volba, ne definice Googlu. Google žádné procento neuvádí, jeho podmínky jsou dvě: strategie s cílem a „Omezeno rozpočtem".

## Instalace

1. Google Ads → Nástroje → Hromadné akce → Skripty → nový skript
2. Vložte celý soubor `bid-target-check.js` a v `CONFIG` vyplňte `EMAIL`
3. Autorizujte, spusťte Náhled a zkontrolujte log
4. Spusťte ručně. Plánování týdně bohatě stačí.

Běží na jednom účtu i na celém MCC, režim pozná sám. Volitelně zapisuje historii běhů do Google Sheetu (`SPREADSHEET_URL`).

## Auto-oprava cílů je ve výchozím nastavení vypnutá

Skript jen čte. Po zapnutí opravy ještě jeden běh pouze vypíše, co by udělal.

Opakované běhy mohou cíl rozkmitat: kampaň omezená rozpočtem překonává cíl strukturálně, takže po srovnání na realitu ho překoná znovu, jen z vyšší základny. Proto jsou `MAX_TARGET_ROAS` a `MIN_TARGET_CPA` povinné (bez nich se oprava odmítne spustit) a proto s opravou spouštějte nejvýš týdně.

Známé omezení: nedetekuje Target CPC u Demand Gen, ty spadnou do sekce C.

## English

Google Ads script that flags campaigns exposed to the 17 August 2026 target-bidding change: budget-limited campaigns no longer overshoot tCPA/tROAS. Four output sections (affected, ticking bombs, no target, undetermined), read-only by default, optional target correction with hard bounds. Runs on a single account or a whole MCC. Method and thresholds: [karelhuk.cz/en/blog/how-to-check-google-bidding-change-2026](https://karelhuk.cz/en/blog/how-to-check-google-bidding-change-2026)

## Licence

MIT. Karel Huk, [karelhuk.cz](https://karelhuk.cz). Software je poskytován „tak jak je", bez záruky.
