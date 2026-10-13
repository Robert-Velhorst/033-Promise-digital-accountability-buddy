# Promise 3.0 — verificatie

Datum: 1 oktober 2026. Windows, Node.js 25.2.1. De browsercontrole gebruikt lokaal Google Chrome via Playwright, omdat de beschikbare Browserbase-dienst extern draait en de lokale testserver niet rechtstreeks bereikt.

## Functioneel

36 Node-tests zijn geslaagd. Deze omvatten de bestaande account/dossiercontroles en de nieuwe communicatieketen:

- Persoonlijke tracking met één gebruiker, exacte eigen labels en gescheiden bronidentiteiten.
- Inspanningsbelofte versus mogelijkheid; negatieve taal; mislukte poging zonder geslaagd resultaat.
- Historisch bronmoment, relatieve datums, onmogelijke kalenderdatums en niet-bestaande lokale zomertijdmomenten.
- Onbekende verzendtijd wordt niet als vandaag opgeslagen.
- Ontvangstreactie en inhoudelijke terugkoppeling; latere datumvoorstellen veranderen de oorspronkelijke datum niet.
- Een nieuwe toezegging over een ander onderwerp wordt niet aan het oude onderwerp gekoppeld.
- Herimport veroorzaakt geen duplicaten en behoudt handmatige vastleggingen.
- Voorwaardelijke toezegging vereist vastlegging van de ingetreden voorwaarde.
- Stopverzoeken, ingetrokken concepten, contact-/onderwerplimieten en ingetrokken extensietoegang.
- Bronquotes worden niet opnieuw als nieuwe eigen toezegging gedetecteerd.
- Expliciete bronkoppeling over kanalen zonder naam-only identity merge.
- Verwijdering en uitsluiting van broninhoud en afgeleide afspraken.
- Versleutelde bronopslag blijft leesbaar voor de app na herstart; brontext staat niet leesbaar in SQLite.
- Export/herstel van broninhoud, handmatige uitkomst en stopbeleid naar een lege werkruimte; tokens worden niet hersteld.
- HTTP sessies, CSRF, origin, gebruikersisolatie, localhost-hostcontrole en beperkte extensie-bridge.
- Gmail MIME-alternatieven en bijlagen, alleen-lezen OAuth, gebruikersgebonden state, scopecontrole en gesimuleerde historische/incrementele sync.

Dit is geen onafhankelijk geannoteerde detectorbenchmark. Testvoorbeelden zijn synthetisch en bevestigen technische gevallen; ze bewijzen geen algemeen nauwkeurigheidspercentage of gedragseffect.

## Browserbediening

Playwright controleerde een echte lokale app op desktop (1440 × 1100) en mobiel (390 × 844): account aanmaken, voorbeeldgesprek importeren, vier interpretaties bekijken, broncontext openen, een inspanning afronden met toelichting, opvolgconcept voorbereiden, een extensiecode maken het soort toezegging corrigeren, een bron koppelen en de navigatie gebruiken. Geen JavaScript-consolefouten; geen horizontale overflow op mobiel. Screenshots zijn visueel bekeken op leesbaarheid, de bestaande donkere kleuren, tekstcontrast, acties en mobiele indeling. Een gevonden modal-formulierprobleem en een onleesbare hoverkleur zijn hersteld.

De browserschil kreeg een afzonderlijke synthetische Gmail DOM-proef via de echte lokale bridge. Geverifieerd: lezen begint pas na selectie, nieuwe zichtbare tekst wordt passief verwerkt, quoted HTML wordt uitgesloten, bronupdates blijven één bron met een eerdere versie en pauzeren stopt verwerking. Het extensie-runtimegedeelte was gesimuleerd. Dit was geen geïnstalleerde-extensieproef of echte Gmail/Outlook-mailboxproef.

## Nog niet bewezen

Geen echte Google OAuth-toestemming, mailbox, live Gmail-DOM, geïnstalleerde extensie, Outlook Graph, WhatsApp-livekoppeling, semantisch AI-model, onafhankelijke annotatie of deelnemerspilot is getest. Geen prestatie- of beschikbaarheidsgarantie voor grote mailboxen, meerdere apparaten of productiegebruik. Connectorfouten en onvolledige brondekking blijven zichtbaar; er is geen externe verzending die ondanks deze onzekerheden doorgaat.

