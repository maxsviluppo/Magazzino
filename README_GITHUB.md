# Gestione Magazzino - Guida alla Pubblicazione su GitHub Pages

Questa applicazione è pronta per essere pubblicata su GitHub Pages. Segui questi passaggi per metterla online:

## 1. Preparazione del Repository
1. Crea un nuovo repository su GitHub.
2. Carica tutti i file del progetto nel repository.

## 2. Configurazione Firebase
Assicurati che il file `firebase-applet-config.json` contenga le tue credenziali Firebase reali. 

### **IMPORTANTE: Domini Autorizzati**
Per far funzionare l'autenticazione Google su GitHub Pages, devi aggiungere il tuo dominio GitHub ai domini autorizzati su Firebase:
1. Vai nella [Firebase Console](https://console.firebase.google.com/).
2. Seleziona il tuo progetto.
3. Vai su **Authentication** > **Settings** > **Authorized domains**.
4. Clicca su **Add domain** e aggiungi il tuo dominio (es. `tuo-utente.github.io`).
5. Senza questo passaggio, l'accesso fallirà con un errore di sicurezza.

**Nota:** Su GitHub Pages, queste chiavi saranno visibili nel codice sorgente (essendo un'app client-side), quindi assicurati di configurare correttamente le **Security Rules** su Firebase per proteggere i tuoi dati.

## 3. Pubblicazione Automatica (GitHub Actions)
Ho aggiunto un file di workflow in `.github/workflows/deploy.yml`. 
1. Vai nelle **Settings** del tuo repository su GitHub.
2. Clicca su **Pages** nella barra laterale sinistra.
3. Sotto **Build and deployment > Source**, assicurati che sia selezionato "GitHub Actions".
4. Ogni volta che farai un `push` sul ramo `main`, GitHub costruirà e pubblicherà automaticamente l'app.

## 4. Pubblicazione Manuale
Se preferisci farlo manualmente:
1. Esegui `npm install` e poi `npm run build`.
2. Carica il contenuto della cartella `dist` sul ramo `gh-pages` del tuo repository.

## Note Tecniche
- Il file `vite.config.ts` è stato configurato con `base: './'` per supportare la pubblicazione in sottocartelle (es. `username.github.io/repo-name/`).
- L'app utilizza Firebase per l'autenticazione e il database, quindi funzionerà perfettamente come sito statico.
