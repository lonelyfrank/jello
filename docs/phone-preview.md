# Anteprima sul telefono e app di test Android

## Pagina di anteprima

`preview.html` usa il runtime e l’anteprima condivisa (`src/stage`) senza editor, React né
storage. Modi:

| URL | Uso |
| --- | --- |
| `preview.html?material=navbar&object=navbar&scene=app` | scenario dall’URL (stesse chiavi del laboratorio) |
| `preview.html?relay=http://IP:5174&token=…` | stato in tempo reale dal laboratorio |
| `preview.html?fixture=dom&builtin=navbar` | fixture di confronto con i pacchetti esportati |

Senza `relay` la pagina mostra un campo per incollare il link del laboratorio (utile nella
WebView, dove non c’è la barra degli indirizzi).

## Sincronizzazione locale (facoltativa)

```sh
npm run dev      # Vite su 0.0.0.0:5173 (host: true)
npm run relay    # relay su 0.0.0.0:5174, stampa gli IP LAN
```

1. Nel laboratorio: *Proprietà → Anteprima sul telefono*. Il relay predefinito è
   `http://<host della pagina>:5174`. Se il laboratorio è aperto su `localhost`, scrivi l’IP LAN
   del computer (es. `http://192.168.1.20:5174`), così il link funziona anche sul telefono.
2. «Avvia sincronizzazione»: il laboratorio crea un token di sessione e mostra il link
   dell’anteprima. Sostituisci `localhost` con l’IP LAN se necessario e aprilo sul telefono (stessa
   rete Wi-Fi).
3. Ogni modifica invia lo **stato completo** (materiale + opzioni di vista) con debounce di 120 ms.
   Un’anteprima che si collega o si ricollega riceve subito l’ultimo stato.

Protocollo (`src/sync/protocol.ts`, versione 1): solo dati, nessun codice. Il messaggio è validato
per intero (versione del protocollo, opzioni di vista, documento del materiale con lo stesso
parser degli import); se qualcosa non è valido non viene applicato nulla e la pagina lo dice. Un
protocollo più recente viene rifiutato con un messaggio esplicito.

Asset: l’URL `blob:` di un’immagine locale esiste solo nel browser del desktop. Il laboratorio
carica i byte sul relay (`PUT /assets/<sha256>`, hash verificato, solo `image/*`) e l’anteprima
riceve un URL del relay.

### Rete, firewall, contesto sicuro

- Il telefono deve raggiungere il computer: stessa rete, nessun isolamento dei client sul router.
- Firewall (Fedora): `sudo firewall-cmd --add-port=5173/tcp --add-port=5174/tcp` (temporaneo,
  fino al riavvio). Aprire solo sulla rete locale.
- `http://192.168.x.x` **non** è un contesto sicuro. L’anteprima non usa API che lo richiedono
  (il token usa `crypto.getRandomValues`); il laboratorio, che calcola l’hash delle immagini con
  `crypto.subtle`, va usato su `localhost`.
- Il relay è solo per lo sviluppo: tiene i dati in memoria, non autentica oltre il token, non
  entra nel runtime né nei pacchetti esportati.

## App di test Capacitor (`apps/android-preview`)

Contenitore separato dall’editor: impacchetta la build di `preview.html` come pagina iniziale.

```sh
cd apps/android-preview
npm install
npm run sync                      # build della preview in www/ + cap sync android
JELLO_PREVIEW_QUERY="relay=http://192.168.1.20:5174&token=…" npm run sync   # avvio già collegato
npm run apk                       # ./gradlew assembleDebug (richiede JDK e Android SDK)
```

- `androidScheme: "http"` e `cleartext: true` (solo app di test): la pagina può chiamare il relay
  in HTTP sulla LAN senza contenuti misti.
- `webContentsDebuggingEnabled: true`: ispezione con `chrome://inspect`.
- Il wrapper Gradle generato (8.14.3) non gira su JDK 25: è stato portato a Gradle 9.2.1, che
  arriva alla configurazione del progetto. Serve comunque un **JDK con `javac`**: sulla macchina
  di sviluppo c’è solo il JRE 25, quindi l’APK **non è stato costruito** (vedi
  [compatibility.md](compatibility.md)). Con JDK 21 (consigliato da Capacitor 8) si può anche
  tornare al wrapper originale.

## Android nativo

Nessun export Kotlin/Compose/AGSL è disponibile. Il contratto di mappatura previsto è in
[android-mapping.md](android-mapping.md).
