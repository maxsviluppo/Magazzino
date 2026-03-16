# Gestione Magazzino

Questo progetto è un'applicazione per la gestione del magazzino sviluppata con React, Vite e Firebase.

## Funzionalità
- Gestione prodotti (aggiunta, modifica, eliminazione)
- Tracciamento scorte
- Autenticazione con Google (Firebase)
- Database in tempo reale (Firestore)

## Requisiti Locali
- [Node.js](https://nodejs.org/) (versione 18 o superiore)
- Un account [Firebase](https://console.firebase.google.com/)

## Installazione Locale

1. Clona la repository:
   ```bash
   git clone https://github.com/TUO_UTENTE/NOME_REPO.git
   cd NOME_REPO
   ```

2. Installa le dipendenze:
   ```bash
   npm install
   ```

3. Configura Firebase:
   - Crea un file `firebase-applet-config.json` nella root del progetto (se non presente).
   - Incolla le tue chiavi Firebase (apiKey, projectId, ecc.).

4. Avvia l'applicazione:
   ```bash
   npm run dev
   ```
   L'app sarà disponibile su `http://localhost:3000`.

## Caricamento su GitHub Pages

Per pubblicare l'app su GitHub Pages:
1. Esegui il build: `npm run build`
2. Carica il contenuto della cartella `dist` su un ramo chiamato `gh-pages` o configura una GitHub Action per Vite.
