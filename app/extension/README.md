# Promise browserschil

1. Start Promise en open Communicatie. Maak een koppelcode.
2. Open chrome://extensions of edge://extensions, schakel ontwikkelaarsmodus in en kies Uitgepakte extensie laden. Selecteer deze extension-map.
3. Open het extensie-icoon en plak de code. Promise moet op http://localhost:4310 draaien.
4. Open het gewenste Gmail- of Outlook-gesprek. De Promise-schil staat rechts onderin. Lezen staat aanvankelijk uit.
5. Selecteer in Gmail **Dit gesprek volgen**. Nieuwe zichtbare berichten worden lokaal verwerkt zonder handeling per belofte. Bij navigatie naar een ander gesprek stopt lezen automatisch. Samengevouwen berichten zijn niet beschikbaar.
6. Voor Outlook of gewijzigde Gmail-interfacevelden: voeg een fragment met oorspronkelijke spreker toe. Deze route heeft geen automatische Outlook-geschiedenissynchronisatie. Gebruik voor doorlopend Gmail de officiële API-koppeling in de app.

De extensie heeft geen toegang tot WhatsApp, telefoonoproepen of andere websites. Er wordt geen e-mail verzonden en geen tekst in de mailcomposer geplaatst. De Gmail DOM-adapter is een aanvullende route waarvan de betrouwbaarheid van de actuele interface afhangt. De oorspronkelijke verzendtijd kan bij deze route onbekend zijn; een historische datum wordt dan niet als vandaag ingevuld.

De koppelcode geeft toegang tot het toevoegen van communicatie en een telling van open afspraken, niet tot het uitlezen van broninhoud. Nieuwe code genereren trekt de oude code in. In Promise kun je de toegang volledig intrekken. De schil is ontworpen voor één geselecteerd, individueel gesprek; groepstoegang en toestemming van deelnemers moeten afzonderlijk beoordeeld worden.
