# SARVAL — Sistema de Gestió de Descarregues
## Proposta comercial

---

> **Document elaborat per a la presentació de la solució.**
> Versió demo disponible. Capturas de pantalla a afegir en cada secció indicada.

---

## Què és SARVAL?

SARVAL és una aplicació web dissenyada específicament per planificar, gestionar i controlar les descarregues setmanals de camions a planta. Substitueix els fulls de càlcul manuals per un entorn digital accessible des de qualsevol dispositiu amb navegador: ordinador, tauleta o mòbil.

La solució inclou dos elements:

1. **Aplicació web** — per a l'equip de logística i gestió de planta.
2. **Bot de Telegram** — per als xofers, perquè puguin confirmar viatges, informar de retards o canvis, tot des del mòbil.

---

## Per a qui és?

- **Responsables de logística i planificació** que necesiten saber en tot moment quins camions estan programats, a quina hora i quantes tones porten.
- **Gestors de planta** que volen anticipar-se a possibles parades del silo per falta de matèria primera.
- **Xofers** que necessiten una via ràpida per confirmar o comunicar incidències sense trucar.

---

## Funcionalitats principals

### 1. Dashboard de seguiment setmanal

Pantalla de resum amb els indicadors clau de la setmana:

- Capacitat i nivell actual del silo (en tones).
- Hores de parada estimades (si el silo es queda sense material).
- Estoc mínim previst.
- Total de viatges planificats i quants porten retard.
- Gràfic visual del nivell del silo al llarg de tota la setmana, hora a hora, amb filtre per dia.

📸 *[Captura del Dashboard]*

---

### 2. Planificació setmanal

Càrrega de la planificació de descarregues directament des d'un fitxer Excel o CSV. El sistema importa tots els viatges i els mostra en taula.

- Es pot carregar la planificació de la **setmana actual** o de la **setmana vinent** (per preparar-la amb antelació).
- Edició individual de qualsevol viatge (dia, hora, proveïdor, tones, viatge crític).
- Les planificacions de setmanes anteriors es conserven i es poden consultar.

📸 *[Captura de Planificació]*

---

### 3. Viatges extra

A banda dels viatges planificats, es poden afegir viatges puntuals no previstos inicialment:

- Dia, hora, proveïdor, tones i indicador de viatge crític.
- Els viatges extra s'acumulen sense eliminar els planificats.

📸 *[Captura de Viatges extra]*

---

### 4. Secuenciació i simulació del silo

Un cop carregada la planificació (i/o afegits els viatges extra), el sistema calcula automàticament:

- L'ordre real d'entrada dels camions tenint en compte la capacitat de descàrrega.
- Les hores finals previstes de cada viatge.
- Possibles retards per saturació de la instal·lació.
- Una simulació del nivell del silo hora a hora, detectant quan s'arribarà al mínim o quan hi haurà parada.

📸 *[Captura de Secuenciació]*

---

### 5. Gestió de setmanes

El sistema gestiona de forma automàtica les setmanes:

- **Setmana actual** — la que s'està executant.
- **Setmana vinent** — es pot preparar amb antelació (per exemple, carregar-la el divendres per tenir-ho a punt el dilluns).
- **Historial** — consulta de totes les setmanes anteriors en mode lectura.

Des d'un selector a la barra lateral es pot canviar en qualsevol moment quina setmana s'està visualitzant o editant.

📸 *[Captura del selector de setmana]*

---

### 6. Paràmetres del silo

Configuració bàsica per adaptar el sistema a la instal·lació:

- Capacitat màxima del silo (tones).
- Nivell inicial.
- Consum per hora.
- Pas de càlcul (en minuts).

📸 *[Captura de Paràmetres]*

---

### 7. Gestió de proveïdors

Catàleg de proveïdors editable. S'utilitza al bot de Telegram per identificar l'origen de cada viatge. Es poden activar i desactivar proveïdors sense eliminar-los.

---

### 8. Gestió de xofers (Telegram)

Registre dels xofers que fan servir el bot de Telegram:

- Nom, Telegram ID i telèfon (opcional).
- Alta des de l'aplicació web o automàticament des del bot quan el xofer s'identifica per primera vegada.

---

### 9. Bot de Telegram per a xofers

El xofer interactua amb el sistema directament des del seu mòbil, sense instal·lar cap aplicació.

**Dos modes de funcionament:**

**Mode amb viatge assignat** — el sistema reconeix el xofer i li mostra el seu proper viatge programat:

> *"Hola Ferran, tens programat el següent viatge:*
> num: VJ101 · prov: MAFRICA · tones: 10 · dia: dilluns, 09/03/25 · hora: 08:00
> Si us plau, confirma amb els botons de sota si és correcte o hi ha algun canvi."*

**Mode sense assignació prèvia** — el xofer indica el número de viatge sobre el qual vol consultar o informar, i el sistema li mostra les dades per confirmar o notificar canvis.

📸 *[Captura del bot — mode assignat]*
📸 *[Captura del bot — mode sense assignació]*

**Accions disponibles per al xofer:**

| Acció | Descripció |
|---|---|
| ✅ Sí, és correcte | Confirmació del viatge sense incidències |
| ❌ No, el pes és diferent | Notifica un canvi en les tones |
| ❌ No, l'hora ha canviat | Notifica un retard o canvi d'hora |
| ⚠️ Altres incidències | Text lliure per informar d'altres situacions |

Totes les comunicacions queden registrades al sistema i poden activar alertes o actualitzar dades automàticament.

---

### 10. Configuració avançada i integracions

- Zona horària de la planta.
- Webhooks configurables: el sistema pot notificar a sistemes externs quan es carrega una planificació, es detecta un retard, s'afegeix un viatge extra, etc. (útil per integrar amb ERP, Power BI, email, etc.)

---

## Accés i usuaris

### Aplicació web

L'accés és per usuari i contrasenya. Hi ha dos nivells:

| Perfil | Capacitats |
|---|---|
| **Superadministrador** | Accés total. Crea i gestiona altres usuaris. |
| **Usuari** | Accés a planificació, viatges, secuenciació i dashboard. |

El superadministrador és únic i s'activa en la configuració inicial del sistema.

### Bot de Telegram

Els xofers s'identifiquen automàticament pel seu compte de Telegram. Si el xofer ja està registrat al sistema, el bot el reconeix directament. Si és nou, el bot li demana el nom i el registra per a futures interaccions.

No cal que el xofer instal·li res: Telegram és gratuït i molt habitual entre conductors professionals.

---

## Alojament i accés

L'aplicació és **100% web**. No cal instal·lar res a cap ordinador.

- Es pot allotjar en un servidor dedicat o en núvol (recomanat).
- L'accés es fa des de qualsevol navegador (Chrome, Edge, Safari, Firefox).
- Es pot configurar un **subdomini propi** de l'empresa (per exemple: `sarval.empresa.com`).
- Connexió segura per HTTPS.
- La base de dades és independent i queda sota control de l'empresa.

---

## Resum de la solució

| Element | Descripció |
|---|---|
| Aplicació web | Dashboard, planificació, viatges, secuenciació, configuració |
| Bot Telegram | Confirmació i comunicació d'incidències per als xofers |
| Gestió de setmanes | Actual, vinent i historial |
| Accés | Login amb usuari i contrasenya. Superadmin + usuaris |
| Alojament | Servidor en núvol amb subdomini propi |
| Integracions | Webhooks per connectar amb altres sistemes |
| Xofers | Registre i identificació automàtica per Telegram |
| Proveïdors | Catàleg editable des de l'aplicació |

---

## Propera fase

Aquesta proposta recull les funcionalitats desenvolupades i demostrades en la versió de prova. En cas d'acceptació:

1. Posada en marxa en entorn de producció amb les dades reals de l'empresa.
2. Configuració del subdomini i accés segur.
3. Formació breu a l'equip de logística (estimada: 1-2 hores).
4. Configuració del bot de Telegram i registre dels xofers.
5. Suport i manteniment evolutiu segons necessitats.

---

## Orientació comercial i preus (estructura de cobrament)

### Principi: cobrar per valor, no per cost

El que el client ja tenia (Excel) li donava planificació i càlcul. El que vosaltres entregueu és:

- **Aplicació web** — mateixa lògica, però accessible, centralitzada i sense errors de fulls de càlcul. És una **millora operativa**.
- **Bot de Telegram** — confirmacions i incidències en temps real amb els xofers. Això **no ho tenien** i és el que canvia el dia a dia (menys trucades, menys errors, més control).

El valor real està en el **bot** i en tenir-ho tot en un **únic lloc web**; la implementació és el que fa que això funcioni al seu entorn.

Per tant: **sí es pot (i té sentit) cobrar implementació i, a part, una quota recurrent**. Són dos tipus de valor:

| Concepte | Què és | Com es cobra |
|----------|--------|----------------|
| **Implementació** | Un cop: muntar producció, configurar, formar, posar el bot en marxa | **Un sol cop** (projecte / setup) |
| **Accés a la solució** | Cada mes: tenen l’app, el bot i el suport disponibles | **Recurrent** (mensual/anual, tipus SaaS) |
| **Consum / ús** | Llamades API, interaccions del bot, webhooks, etc. | **Inclòs en paquets** o **per ús** (segons opció) |

---

### Resposta directa a les teves preguntes

1. **Si fem SaaS, es pot cobrar implementació?**  
   **Sí.** L’implementació és el “obrir la botiga”: servidor, domini, dades reals, formació, bot configurat. La quota SaaS és “el lloguer” per seguir tenint la botiga oberta. La majoria de SaaS (Salesforce, HubSpot, etc.) cobren setup/onboarding per separat.

2. **El consum el deixem al seu càrrec?**  
   Depèn del que entens per “consum”:
   - **Hosting, domini, base de dades**: normalment va a càrrec teu (inclòs en la quota) o del client si vol el servidor a casa.
   - **Telegram**: l’API del bot és gratuïta fins a volums molt alts; no cal facturar-la.
   - **Llamades API** (webhooks, integracions, possibles serveis externs): aquí tens dues opcions (més avall).

3. **Fem paquets d’interaccions?**  
   És una bona opció si el consum no està quantificat: defines “interaccions” (per exemple: 1 confirmació o 1 missatge del bot = 1 interacció) i fas plans amb **inclòs X interaccions/mes**; el que passi de X es paga o es limita. Això et dona previsibilitat al client i a tu.

---

### Opcions d’estructura de preus

#### Opció A — Simple: implementació + quota plana

- **Implementació (una sola vegada):** 1.500 € – 3.000 €  
  Inclou: desplegament en producció, subdomini, dades reals, formació 1–2 h, configuració del bot i registre de xofers.  
  *Justificació: el client deixa de dependre de l’Excel i passa a tenir app + bot; el valor és la tranquil·litat i el control.*

- **Quota mensual (SaaS):** 150 € – 350 €/mes  
  Inclou: ús de l’app, bot de Telegram, hosting, manteniment correctiu i suport bàsic. Consum “normal” (bot, API interna) inclòs.  
  *Si el volum de xofers o setmanes és alt, tendeix cap al rang alt.*

**Pros:** molt clar, fàcil d’explicar. **Contres:** si el consum (webhooks, integracions) puja molt, hauràs d’ajustar o renegociar.

---

#### Opció B — Implementació + quota + paquets d’interaccions

Defineix “interacció” (ex.: 1 missatge enviat/rebut del bot = 1 interacció; 1 webhook disparat = 1 interacció).

- **Implementació:** igual que a l’opció A (1.500 € – 3.000 €).

- **Pla base mensual:** 120 € – 250 €/mes  
  Inclou: app, bot, hosting, suport. Inclou **X interaccions/mes** (ex.: 500 o 1.000).

- **Opcional — Overage:** per cada Y interaccions addicionals, Z € (ex.: 0,05 € – 0,15 € per interacció, o blocs de 100 per 5–10 €).

Així el client paga pel que fa servir; tu evites sorpreses si en el futur hi ha molts webhooks o molts xofers.

---

#### Opció C — Consum a càrrec del client

- **Implementació:** igual (1.500 € – 3.000 €).
- **Quota SaaS:** 100 € – 200 €/mes (només “lloguer” de la solució + suport).
- **Consum:** el client paga directament els serveis externs (ex.: servidor que us poseu al seu nom, SMS si en feu, etc.). Les llamades a la vostra API i el bot es poden deixar incloses en la quota si el cost és negligible.

Això redueix la complexitat de facturació per consum; només té sentit si el consum realment és extern (no la vostra API).

---

### Recomanació pràctica

- **Ara mateix:**  
  - Cobra **implementació** (una sola vegada) i **quota mensual** (SaaS).  
  - Deixa el “consum” **inclòs** dins la quota (sense detallar interaccions) mentre no tinguis dades.  
  - Rangs orientatius: **Implementació 2.000 € – 2.500 €** | **Quota 200 € – 300 €/mes**.

- **Quan tinguis mètriques:**  
  - Si veus que el consum (webhooks, etc.) és significatiu, passa a **paquets d’interaccions** (opció B) en plans nous o en renovacions.

- **Missatge al client:**  
  *“La part de desenvolupament i posada en marxa es cobra una vegada; a partir d’aquí, una quota mensual que inclou l’ús de l’aplicació, el bot per als xofers i el suport. El consum habitual (confirmacions, avisos, etc.) va inclòs.”*

---

*Document de presentació comercial — SARVAL · 2026*
