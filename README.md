# R-Maskin Prosjektstyring

Offline prosjektstyringsapp for entreprenørfirma.

Appen er laget for lokal bruk uten server og uten krav til nettilgang i drift. Data lagres i nettleserens localStorage for hver maskin.

## Funksjoner

- Uavhengige prosjekter som holdes adskilt
- Oppgaveoversikt per prosjekt med frister og ferdigmarkering
- Innkjøp/utlegg per prosjekt med dato, beløp og leverandørkontakt
- Kundeinformasjon per prosjekt med kontaktperson, telefon og e-post
- Automatisk summering av totalkostnad per prosjekt
- Redigerbare firmaopplysninger for R-Maskin direkte i appen
- Slettemappe for prosjekter: slettede prosjekter flyttes til eget arkiv i lokal lagring
- Søk i slettemappen, visning av arkivdato og mulighet til å tømme slettemappen med ekstra bekreftelse
- Sortering i slettemappen, eksport av slettemappen som backupfil og egen varsling før permanent sletting av enkeltprosjekt
- Import av slettemappe-backup tilbake inn i appen
- Full backup av hele appen med eksport og import av komplett appdata
- Automatisk backup-påminnelse ved lang tid siden siste eksport
- Backupversjon og historikk over eksport/import i appen
- Enkel gjenopprettingsvisning for full backup-import
- Redigering og sletting av eksisterende oppgaver og innkjøp
- Rapporteksport per prosjekt:
  - PDF-nedlasting med utførende firmaopplysninger, org.nr, kontaktdata og firmalogo
  - E-postkladd via mailto med oppgaver, utlegg, totalsum og firmaopplysninger
- PWA-oppsett for lokal installasjon ("legg til på hjemmeskjerm")

## Teknologi

- React + TypeScript + Vite
- vite-plugin-pwa
- jsPDF

## Kom i gang

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Netlify (Nedlasting + Offline)

Appen kan publiseres på Netlify og installeres som PWA. Etter installasjon kan den brukes uten nett.

Fremgangsmåte:

1. Legg prosjektet i et GitHub-repo.
2. Opprett nytt site i Netlify og koble repoet.
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Deploy.

Denne repoen inneholder `netlify.toml` med:

- SPA redirect (`/* -> /index.html`)
- riktige cache-headers for service worker og assets

Viktig:

- Brukeren må åpne/installere appen minst én gang mens Netlify-siden finnes.
- Etter installasjon fungerer appen offline uten nettilgang.
- Appen kan fortsatt brukes selv om nettsiden senere forsvinner, så lenge appdata/service-worker ikke slettes av brukeren/nettleseren.

## Bruk

1. Opprett prosjekt i venstre panel.
2. Oppdater firmaopplysninger for R-Maskin i toppfeltet ved behov.
3. Velg prosjekt og legg inn oppgaver og innkjøp i detaljer-panelet.
4. Marker oppgaver som ferdig ved avhuking.
5. Ved sletting får du to advarsler, og prosjektet flyttes deretter til slettemappen.
6. Bruk søk i slettemappen for å finne tidligere prosjekter, og se når de ble arkivert.
7. Sorter slettemappen etter nyest, eldst eller navn, og eksporter den som backup ved behov.
8. Importer backupfil tilbake inn i slettemappen ved behov.
9. Eksporter full backup av hele appen og importer den ved bytte av enhet eller gjenoppretting.
10. Bruk gjenopprettingspanelet for sikker import av full backup, med visning av backupversjon og historikk.
11. Rediger selve prosjektinformasjonen, eller rediger/slett oppgaver og innkjøp direkte i prosjektvisningen.
12. Gjenopprett, slett permanent eller tøm hele slettemappen ved behov.
13. Generer PDF eller e-post fra prosjektets handlingsknapper.

## Viktig om lagring

- Data lagres lokalt i nettleseren på enheten.
- Bytte av nettleser/profil eller sletting av nettleserdata fjerner lagret informasjon.
- For produksjonsbruk kan eksportfunksjon brukes som dokumentasjon og sikkerhetskopi.

## Anbefalt Backup-rutine

- Bruk "Eksporter full backup" jevnlig, for eksempel daglig eller ukentlig.
- Lagre backupfilen i skylagring som iCloud Drive, OneDrive, Dropbox eller Google Drive.
- Oppbevar gjerne en ekstra kopi på PC/Mac.
- Hvis telefon eller enhet blir stjålet, ødelagt eller krasjer, installer appen igjen og bruk "Importer full backup".
