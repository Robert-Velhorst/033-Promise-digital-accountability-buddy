# Promise 3.0 — afspraken uit bestaande communicatie

Promise draait lokaal en bewaakt eigen toezeggingen en ontvangen beloftes. Een tweede deelnemer hoeft geen Promise-account te maken: diens gewone berichten worden verwerkt zodra ze via import, de browserschil of de Gmail-koppeling beschikbaar zijn.

## Starten

Pak het hele pakket uit en dubbelklik **Start-Promise.cmd**. De launcher start de lokale server verborgen en opent http://localhost:4310. Vereist Node.js 22.13 of nieuwer en npm. De app gebruikt parse5 8.0.1 en de vastgelegde entities-dependency voor HTML-e-mail. Voordat een gestopte server start, installeert de launcher deze pakketten uit het lockbestand, bij voorkeur uit de lokale npm-cache. Voor de eerste installatie is toegang tot het npm-register nodig.

Maak een lokale werkruimte met je naam, e-mailadres en een wachtwoord van minimaal 10 tekens. Er wordt geen registratie-e-mail verzonden. Er is geen wachtwoordherstel via e-mail. Bewaar het wachtwoord.

Als een eerdere Promise-server vanuit dezelfde map draait, herstart de launcher die voor deze versie. Een service uit een andere map wordt niet automatisch beëindigd. Sluit die service eerst als poort 4310 bezet is.

Alternatief, in een terminal in deze map:

```sh
npm ci --omit=dev --ignore-scripts
node server.mjs
```

## Eerste gebruik

1. Open **Communicatie**. Controleer je exacte namen en e-mailadressen bij **Dit ben ik in gesprekken**. Andere labels worden als een ontvangen toezegging gelezen.
2. Importeer een WhatsApp chat-export, .eml e-mail, gedateerd JSON-berichtenbestand of transcript met sprekers. Geef ieder gesprek een vaste naam en bronaccount. Hergebruik die waarden bij vervolgimports; opnieuw importeren veroorzaakt geen dubbele bronberichten.
3. Open **Afspraken** of **Vandaag**. Duidelijke persoonlijke toezeggingen worden meteen gevolgd, zonder handmatige bevestiging per belofte. Mogelijkheden en gerapporteerde uitspraken vragen beoordeling.
4. Bekijk de oorspronkelijke woorden, tijd en latere bronreacties. Inspanning, resultaat en terugkoppeling hebben elk een eigen status. Een gemelde reparatiepoging is geen bewezen succesvolle reparatie.
5. Leg afhandeling vast met een toelichting, corrigeer het soort toezegging, verbind een bron uit een ander gesprek of betwist de betekenis. Een afgeleid tijdstip is een voorstel; leg een daadwerkelijk afgesproken tijdstip afzonderlijk vast.
6. Maak indien nodig een opvolgconcept. Controleer het actuele gesprek en pas de tekst aan. Kopieer het naar je gewone communicatiekanaal en verstuur het zelf.

**Voorbeeldgesprek** voegt duidelijk fictieve gegevens toe onder bronaccount `synthetic-demo`. Het is geen analyse van je privécommunicatie. Verwijder dit gesprek via Communicatie als je het niet meer nodig hebt.

## Werkende mogelijkheden

- Historische WhatsApp-import voor veelgebruikte Android/iOS-exportregels, met dag/maand of maand/dag en de bron-tijdzone.
- Transcript- en JSON-import, plus eenvoudige MIME .eml verwerking. Bij ontbrekende verzendtijd wordt de bron niet als vandaag behandeld.
- Lokale Nederlands/Engels-regels voor inspanning, resultaat, terugkoppeling, mogelijkheid, voorwaarden en negatie. De methode wordt in de interface vermeld.
- Persoonlijke tracking zonder bevestigingsritueel bij iedere duidelijke toezegging.
- Gesprekscontext, bronverwijzingen, latere reacties, ontvangen uitvoeringsclaims en afzonderlijke menselijke vastlegging van afhandeling.
- Oorspronkelijke tijdsaanduidingen blijven staan bij een latere datumafspraak. Relatieve datums worden vanuit het bronmoment berekend. 17:00 is een gemarkeerd voorstel wanneer geen tijdstip is genoemd; brede perioden blijven zonder exacte datum.
- Betwisting, pauzeren, heropenen, voorwaarde vastleggen, soort corrigeren en eigen notities.
- Expliciet een bronbericht uit een ander kanaal koppelen, zonder automatische samenvoeging op alleen naam.
- Begrensde opvolgconcepten, maximaal twee per onderwerp en twee per contact per zeven dagen. Stopverzoeken in de communicatie pauzeren opvolging voor die bronidentiteit. Nieuwe relevante reacties trekken bestaande concepten in.
- Interne datumherinneringen zonder automatische kwalificatie als gebroken belofte. De server moet draaien. Desktopmeldingen vereisen daarnaast een open browsertab en browsertoestemming.
- AES-256-GCM voor broninhoud, de nieuwe afsprakenlaag, connectorgegevens en contactbeleid. Verwijderbare gegevens staan buiten het oude append-only dossierlog.
- Gesprekken verwijderen en uitsluiten, met verwijdering van broninhoud, afgeleide afspraken en bijbehorende concepten. Uitsluiting blokkeert herimport in deze installatie.
- JSON-export en herstel van de nieuwe afsprakenlaag in een lege communicatie-werkruimte. Connectorcredentials en extensietoegang worden niet geëxporteerd of hersteld. Concepten worden na herstel opnieuw gemaakt en beoordeeld.
- Eerdere handmatige dossiers, hun historie, voorkeuren, CSV/agenda-export en lokale transcriptinvoer blijven beschikbaar.

## Gmail: alleen-lezen koppeling

De OAuth- en sync-code is geïmplementeerd: toestemming, state en PKCE, tokenverversing, eerste historische synchronisatie, paginering, incrementele history-synchronisatie, verlopen history-herstel en zichtbaar maken van fouten. De app vraagt uitsluitend `gmail.readonly`, geen verzendrecht. Iedere sync verwerkt één pagina; resterende pagina's volgen via de servercontrole. Nieuwe wijzigingen worden ongeveer iedere vijf minuten gecontroleerd terwijl de server draait.

Voor een echte eigen installatie is een Google Cloud-project nodig waarin de Gmail API is ingeschakeld. Maak een OAuth **Web application**, configureer de consent/testgebruikers en registreer exact de redirect die de app toont, normaal:

```text
http://localhost:4310/oauth/gmail/callback
```

Voer de client-ID, client-secret en gewenste historische begindatum in bij Communicatie. Daarna vraagt Google toestemming voor het gekozen mailboxaccount. Secrets worden lokaal versleuteld opgeslagen en niet teruggestuurd naar de browser. Gebruik dezelfde host bij aanmelden en verbinden: `localhost` en `127.0.0.1` hebben verschillende cookies.

Gmail API-authorisatie kan appverificatie of aanvullende voorwaarden vereisen. De gebouwde koppeling is getest met gesimuleerde Google-antwoorden, niet met jouw mailbox. De geschiedenisselectie en API-dekking worden niet als onbeperkte toegang gepresenteerd. Grote berichten boven 20.000 tekens en bijlagen worden overgeslagen. Onderwerp-encoding en sommige complexe MIME-varianten kunnen aanvullende ondersteuning vragen.

Officiële bronnen: https://developers.google.com/identity/protocols/oauth2/web-server en https://developers.google.com/workspace/gmail/api/guides/sync.

## Chrome/Edge-browserschil

Zie **extension/README.md**. Installeer de uitgepakte extensie, maak in Promise een koppelcode en plak die in het extensie-icoon. De code geeft beperkte toegang tot het toevoegen van bronnen; hij geeft geen toegang tot het uitlezen van je communicatie. Nieuwe code genereren of toegang intrekken maakt de vorige code ongeldig.

De schil verschijnt boven Gmail en Outlook Web. In Gmail kun je één zichtbaar gesprek selecteren en daarna nieuwe zichtbare berichten laten verwerken. Lezen staat aanvankelijk uit en wordt bij een ander gesprek gepauzeerd. Het Gmail DOM-adaptergedrag is getest met een synthetische Gmail-structuur; de actuele Gmail-interface kan afwijken. Gebruik de API-koppeling voor betrouwbaardere mailboxsynchronisatie. Outlook ondersteunt in deze versie fragmentinvoer met spreker; er is geen officiële Graph-koppeling gebouwd.

## Opslag, back-up en verwijderen

De database staat in `data/promise.sqlite`; de nieuwe encryptiesleutel in `data/promise.sqlite.key`. Houd beide bij elkaar. De sleutel is geen wachtwoordkluis: iemand met toegang tot beide bestanden en je Windows-account kan de gegevens ontsleutelen. Eerdere handmatige dossiergegevens behouden hun oorspronkelijke opslag en zijn niet met terugwerkende kracht versleuteld. Nieuwe datumherinneringen bevatten geen broninhoud.

Exporteer de nieuwe afsprakenlaag bij Communicatie. De export is **leesbare JSON**, bevat privécommunicatie en moet privé worden bewaard. Herstel kies je in het importformulier met formaat **Promise afsprakenexport herstellen**; gebruik een lege communicatie-werkruimte. De oude handmatige dossiers hebben hun afzonderlijke back-upfunctie bij Instellingen.

Voor een volledige kopie van deze installatie: stop de server en kopieer de hele data-map inclusief sleutel. Zo blijven ook accounts, bestaande uitsluitingen, historische bronversies en connectorconfiguratie behouden. Een JSON-herstel naar een nieuwe installatie herstelt actieve broninhoud en vastleggingen, maar historische bronversies en de opaque uitsluitingsmarkers worden niet overgezet; selecteer bronnen en uitsluitingen daar opnieuw. Verwijdering in de app verwijdert niet zelfstandig eerder gedownloade exports of externe back-ups.

## Praktische grenzen

Dit is een bruikbare lokale versie van de nieuwe afsprakenketen. De herkenning gebruikt taalregels; er is nog geen semantisch taalmodel aangesloten of onafhankelijk gemeten detectienauwkeurigheid. Onderzoek en tests geven geen garantie dat mensen bereid zijn een belofte na te komen.

Geen automatische WhatsApp-accounttoegang, Telegram-integratie, mobiele achtergrondopvang, telefonieopname, publieke betrouwbaarheidsscore, serverloze push, cloudsync of automatische externe verzending. De Outlook-schil heeft alleen expliciete fragmentinvoer. Een bericht kan ontbreken doordat het niet beschikbaar was of in een ander kanaal staat. Een ontvangen claim is geen onafhankelijke verificatie; jouw vastlegging is geen handtekening van de andere deelnemer.

## Controles

```sh
npm test
npm run check
```

Zie **VERIFICATION.md** voor de werkelijk uitgevoerde controles en hun grenzen. Tests werken zonder netwerk, Google-account of API-key.
