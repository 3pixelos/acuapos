import { create } from 'zustand'

/** UI languages, in switcher order. French is the operating language of the
 * floor, English the fallback, Spanish the local one — Acua is in Spain, so
 * a Spanish-speaking hire must be able to run a till without translating
 * anything in their head. */
export const LANGS = ['fr', 'en', 'es'] as const
export type Lang = (typeof LANGS)[number]

/** Position of each language inside every dict entry. */
const LANG_INDEX: Record<Lang, 0 | 1 | 2> = { fr: 0, en: 1, es: 2 }

/** Label on the language button. */
export const LANG_LABEL: Record<Lang, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
}
export const LANG_SHORT: Record<Lang, string> = { fr: 'FR', en: 'EN', es: 'ES' }

/** Next language in the cycle — the switcher is one button, not a menu. */
export const nextLang = (l: Lang): Lang => LANGS[(LANGS.indexOf(l) + 1) % LANGS.length]

const dict = {
  // generic
  appName: ['ACUA', 'ACUA', 'ACUA'],
  tagline: ['CAFÉ · RESTAURANT · LOUNGE', 'CAFÉ · RESTAURANT · LOUNGE', 'CAFÉ · RESTAURANTE · LOUNGE'],
  logout: ['Quitter', 'Log out', 'Salir'],
  cancel: ['Annuler', 'Cancel', 'Cancelar'],
  confirm: ['Confirmer', 'Confirm', 'Confirmar'],
  close: ['Fermer', 'Close', 'Cerrar'],
  back: ['Retour', 'Back', 'Volver'],
  save: ['Enregistrer', 'Save', 'Guardar'],
  loading: ['Chargement…', 'Loading…', 'Cargando…'],
  offline: [
    'Connexion perdue — reconnexion…',
    'Connection lost — reconnecting…',
    'Conexión perdida — reconectando…',
  ],
  // login
  loginWaiter: ['Code PIN', 'PIN code', 'Código PIN'],
  loginStaff: ['Admin', 'Admin', 'Admin'],
  enterPin: ['Entrez votre code PIN', 'Enter your PIN code', 'Introduce tu código PIN'],
  username: ["Nom d'utilisateur", 'Username', 'Usuario'],
  password: ['Mot de passe', 'Password', 'Contraseña'],
  signIn: ['Se connecter', 'Sign in', 'Iniciar sesión'],
  badCredentials: ['Identifiants incorrects', 'Incorrect credentials', 'Credenciales incorrectas'],
  badPin: ['Code incorrect', 'Incorrect code', 'Código incorrecto'],
  alreadyActive: [
    'Ce compte est déjà connecté sur un autre appareil',
    'This account is already signed in on another device',
    'Esta cuenta ya está conectada en otro dispositivo',
  ],
  kickedMessage: [
    'Vous avez été déconnecté car ce compte a été utilisé sur un autre appareil',
    'You were signed out because this account was used on another device',
    'Se ha cerrado tu sesión porque esta cuenta se usó en otro dispositivo',
  ],
  // statuses
  st_free: ['Libre', 'Free', 'Libre'],
  st_waiting: ['En attente', 'Waiting', 'En espera'],
  st_preparing: ['Commande en cours', 'Preparing order', 'Pedido en preparación'],
  st_served: ['Servie', 'Served', 'Servida'],
  st_late: ['Commande en retard', 'Order late', 'Pedido con retraso'],
  st_closed: ['Fermée', 'Closed', 'Cerrada'],
  st_cancel_pending: [
    'Annulation — admin requis',
    'Cancel — admin required',
    'Anulación — requiere admin',
  ],
  // force login (break a stale device lock without waiting it out)
  forceLogin: ['Forcer la connexion', 'Force login', 'Forzar conexión'],
  forceLoginHint: [
    "L'autre appareil sera déconnecté immédiatement.",
    'The other device will be signed out immediately.',
    'El otro dispositivo se desconectará inmediatamente.',
  ],
  // change calculator (caisse)
  changeCalc: ['Rendu monnaie', 'Change', 'Cambio'],
  amountDue: ['À payer', 'Due', 'A pagar'],
  amountReceived: ['Montant reçu', 'Amount received', 'Importe recibido'],
  changeDue: ['À rendre', 'Change to give back', 'Cambio a devolver'],
  missingAmount: ['Manque', 'Missing', 'Falta'],
  // admin-confirmed cancellation
  cancelPendingBanner: [
    "Annulation demandée — en attente de validation d'un admin.",
    'Cancellation requested — waiting for an admin to confirm.',
    'Anulación solicitada — pendiente de que un admin la confirme.',
  ],
  confirmCancelTitle: ["Confirmer l'annulation", 'Confirm cancellation', 'Confirmar la anulación'],
  adminSecretHint: [
    'Entrez le mot de passe admin pour confirmer.',
    'Enter the admin password to confirm.',
    'Introduce la contraseña de admin para confirmar.',
  ],
  rejectCancel: ["Refuser l'annulation", 'Reject cancellation', 'Rechazar la anulación'],
  badSecret: ['Mot de passe incorrect', 'Incorrect password', 'Contraseña incorrecta'],
  // relevé de ventes (sales report)
  salesReport: ['Relevé de ventes', 'Sales report', 'Informe de ventas'],
  salesReportHint: [
    "Récapitulatif des ventes. L'impression demande l'accord d'un admin.",
    'Sales summary. Printing needs an admin approval.',
    'Resumen de ventas. Imprimir requiere la aprobación de un admin.',
  ],
  report_day: ['Jour', 'Day', 'Día'],
  report_week: ['Semaine', 'Week', 'Semana'],
  report_month: ['Mois', 'Month', 'Mes'],
  report_custom: ['Période', 'Range', 'Periodo'],
  staffReport: ['Relevé Staff', 'Staff report', 'Informe de personal'],
  reportClosedOnly: [
    'Périodes terminées uniquement.',
    'Completed periods only.',
    'Solo periodos finalizados.',
  ],
  reportAsk: ["Demander l'autorisation", 'Request approval', 'Solicitar autorización'],
  reportPending: [
    "En attente de l'accord de l'admin…",
    'Waiting for the admin to approve…',
    'Esperando la aprobación del admin…',
  ],
  reportApproved: [
    'Autorisé — vous pouvez imprimer',
    'Approved — you can print',
    'Autorizado — ya puedes imprimir',
  ],
  reportDenied: ['Demande refusée', 'Request denied', 'Solicitud rechazada'],
  reportPrint: ['Imprimer le relevé', 'Print the report', 'Imprimir el informe'],
  reportRequestFailed: [
    "Échec de l'envoi de la demande",
    'Could not send the request',
    'No se pudo enviar la solicitud',
  ],
  reportRequestTitle: [
    "Autorisation d'impression demandée",
    'Print authorisation requested',
    'Autorización de impresión solicitada',
  ],
  reportApprove: ['Autoriser', 'Approve', 'Autorizar'],
  reportDeny: ['Refuser', 'Deny', 'Rechazar'],
  // push notifications (admin)
  notifEnable: ['Activer les notifications', 'Enable notifications', 'Activar notificaciones'],
  notifHint: [
    'Soyez alerté sur ce téléphone des annulations et demandes d’impression.',
    'Get alerted on this phone for cancellations and print requests.',
    'Recibe avisos en este teléfono de anulaciones y solicitudes de impresión.',
  ],
  notifOn: ['Notifications activées ✓', 'Notifications on ✓', 'Notificaciones activadas ✓'],
  notifDenied: [
    'Notifications bloquées — autorisez-les dans les réglages du téléphone.',
    'Notifications blocked — allow them in your phone settings.',
    'Notificaciones bloqueadas — permítelas en los ajustes del teléfono.',
  ],
  notifInstallHint: [
    'Ajoutez l’app à l’écran d’accueil (Partager › Sur l’écran d’accueil), ouvrez-la depuis l’icône, puis activez les notifications.',
    'Add the app to your home screen (Share › Add to Home Screen), open it from the icon, then enable notifications.',
    'Añade la app a la pantalla de inicio (Compartir › Añadir a pantalla de inicio), ábrela desde el icono y activa las notificaciones.',
  ],
  // analytics
  adminPin: ['Code PIN admin', 'Admin PIN code', 'Código PIN de admin'],
  paymentsBreakdown: [
    'Encaissements (hors VIP & Staff)',
    'Payments (excl. VIP & Staff)',
    'Cobros (sin VIP ni personal)',
  ],
  // printers (caisse desktop app)
  stationCuisine: ['Cuisine', 'Kitchen', 'Cocina'],
  stationBar: ['Bar', 'Bar', 'Barra'],
  // What the badge KNOWS — never more. "OK" is only ever shown once a ticket
  // has really come out of that printer.
  printerHealthOk: ['OK', 'OK', 'OK'],
  printerHealthDown: ['hors ligne', 'offline', 'sin conexión'],
  printerHealthUnset: ['non configurée', 'not set', 'sin configurar'],
  printerHealthUntested: ['non testée', 'untested', 'sin probar'],
  printerTest: ['Tester', 'Test', 'Probar'],
  printerTestOk: [
    '✓ Envoyé — si le ticket sort, c’est la bonne imprimante.',
    '✓ Sent — if a ticket comes out, this is the right printer.',
    '✓ Enviado — si sale un ticket, esta es la impresora correcta.',
  ],
  printerTestFailed: ['✕ Échec', '✕ Failed', '✕ Error'],
  printerNotDetected: [
    'non détectée par Windows',
    'not detected by Windows',
    'no detectada por Windows',
  ],
  printerSettings: ['Imprimantes', 'Printers', 'Impresoras'],
  printerSettingsHint: [
    'Ce qui s’imprime où suit la carte : les catégories « Cuisine » partent en cuisine, « Bar » au bar. Réglages propres à cet appareil.',
    'What prints where follows the menu: "Kitchen" categories go to the kitchen, "Bar" ones to the bar. Settings are per device.',
    'Lo que se imprime dónde sigue la carta: las categorías «Cocina» van a cocina y las de «Barra» a la barra. Ajustes propios de este dispositivo.',
  ],
  // which till this machine is (two tills share one ticket queue)
  tillRoleTitle: ['Cette caisse est', 'This till is', 'Esta caja es'],
  tillRoleHint: [
    'Les deux caisses lisent la même file de tickets — ce choix décide lesquels celle-ci imprime, pour qu’aucun ticket ne sorte en double.',
    'Both tills read the same ticket queue — this decides which ones this one prints, so no ticket comes out twice.',
    'Las dos cajas leen la misma cola de tickets — esto decide cuáles imprime esta, para que ningún ticket salga por duplicado.',
  ],
  tillRoleMain: ['La caisse principale', 'The main till', 'La caja principal'],
  tillRoleMainHint: [
    'Imprime les tickets cuisine, et toutes les additions sauf celles du Bar.',
    'Prints the kitchen tickets, and every bill except the Bar floor’s.',
    'Imprime los tickets de cocina y todas las cuentas salvo las de la Barra.',
  ],
  tillRoleBar: ['La caisse du bar', 'The bar’s till', 'La caja de la barra'],
  tillRoleBarHint: [
    'Imprime les tickets bar, et les additions des tables du Bar.',
    'Prints the bar tickets, and the bills of the Bar floor’s tables.',
    'Imprime los tickets de barra y las cuentas de las mesas de la Barra.',
  ],
  printerManualOption: ['Autre… (saisir un nom ou une IP)', 'Other… (type a name or IP)', 'Otra… (escribir nombre o IP)'],
  printerBackToList: ['← Revenir à la liste', '← Back to the list', '← Volver a la lista'],
  kitchenPrinterName: ['Imprimante cuisine', 'Kitchen printer', 'Impresora de cocina'],
  kitchenPrinterNameHint: [
    'Elle ne reçoit que les plats. Choisissez-la dans la liste Windows, ou « Autre… » pour saisir son IP si elle est en réseau.',
    'It receives food items only. Pick it from the Windows list, or "Other…" to type its IP if it is on the network.',
    'Solo recibe los platos. Elígela en la lista de Windows, o «Otra…» para escribir su IP si está en red.',
  ],
  barPrinterName: ['Imprimante bar', 'Bar printer', 'Impresora de la barra'],
  barPrinterNameHint: [
    'Elle reçoit les boissons et les additions des tables du Bar. Vide = tout part en cuisine.',
    'It receives the drinks and the bills of the Bar floor’s tables. Empty = everything goes to the kitchen.',
    'Recibe las bebidas y las cuentas de las mesas de la Barra. Vacío = todo va a cocina.',
  ],
  cashierPrinterName: ['Imprimante caisse', 'Cashier printer', 'Impresora de caja'],
  refreshList: ['Actualiser', 'Refresh', 'Actualizar'],
  printerListEmptyHint: [
    'Liste Windows indisponible — tapez le nom EXACT de l’imprimante (Paramètres Windows › Imprimantes et scanners).',
    'Windows list unavailable — type the printer’s EXACT name (Windows Settings › Printers & scanners).',
    'Lista de Windows no disponible — escribe el nombre EXACTO de la impresora (Configuración de Windows › Impresoras y escáneres).',
  ],
  cashierPrinterNameHint: [
    'Elle imprime les additions complètes de toutes les salles sauf le Bar.',
    'It prints the full bills for every floor except the Bar.',
    'Imprime las cuentas completas de todas las salas salvo la Barra.',
  ],
  paperWidth: ['Largeur du papier', 'Paper width', 'Ancho del papel'],
  // layers
  layer_frontdoor: ['Entrée', 'Front Door', 'Entrada'],
  layer_salon: ['Salon', 'Salon', 'Salón'],
  layer_terrasse: ['Terrasse', 'Terrace', 'Terraza'],
  layer_bar: ['Bar', 'Bar', 'Barra'],
  layer_emporter: ['À Emporter', 'Takeout', 'Para llevar'],
  // closed-table message (waiter)
  tableClosedTitle: ['Table fermée', 'Table closed', 'Mesa cerrada'],
  tableClosedMsg: [
    "L'addition de cette table a été imprimée. Pour ajouter un article, demandez à la caisse de la rouvrir.",
    'This table’s bill was printed. To add an item, ask the till to reopen it.',
    'La cuenta de esta mesa ya se imprimió. Para añadir un artículo, pide en caja que la reabran.',
  ],
  tableBusyTitle: ['Commande en cours', 'Order in progress', 'Pedido en curso'],
  tableBusyMsg: [
    'est en train de prendre la commande sur cette table. Réessayez dans un instant.',
    'is taking the order on this table right now. Try again in a moment.',
    'está tomando el pedido de esta mesa ahora mismo. Inténtalo dentro de un momento.',
  ],
  // caisse — transfer / reopen / close
  transfer: ['Transférer', 'Transfer', 'Transferir'],
  transferWhole: ['Transférer toute la commande', 'Transfer whole order', 'Transferir todo el pedido'],
  transferTo: ['Transférer vers…', 'Transfer to…', 'Transferir a…'],
  chooseTable: ['Choisir une table', 'Choose a table', 'Elegir una mesa'],
  reopenTable: ['Rouvrir la table', 'Reopen table', 'Reabrir la mesa'],
  closeTable: ['Fermer la table', 'Close table', 'Cerrar la mesa'],
  discount: ['Remise', 'Discount', 'Descuento'],
  vipTitle: ['Commande VIP (offerte)', 'VIP order (comped)', 'Pedido VIP (invitación)'],
  vipHint: [
    "Pour qui ? Enregistré pour l'administration — jamais imprimé sur le ticket client.",
    'For whom? Recorded for the admin — never printed on the customer receipt.',
    '¿Para quién? Se registra para la administración — nunca se imprime en el ticket del cliente.',
  ],
  vipName: ['Nom du VIP', 'VIP name', 'Nombre del VIP'],
  manageFriends: ['Gérer les amis', 'Manage friends', 'Gestionar amigos'],
  manageFriendsHint: [
    "Ajouter, renommer ou retirer un ami. Retirer conserve son historique d'ardoises.",
    'Add, rename or retire a friend. Retiring keeps their tab history.',
    'Añadir, renombrar o retirar un amigo. Retirarlo conserva su historial de cuentas.',
  ],
  friendAdd: ['Ajouter un ami', 'Add a friend', 'Añadir un amigo'],
  friendRemoveConfirm: [
    'Retirer cet ami de la liste ?',
    'Retire this friend from the list?',
    '¿Retirar a este amigo de la lista?',
  ],
  friendDiscountHint: [
    'Comment traiter cette addition ?',
    'How should this bill be treated?',
    '¿Cómo se trata esta cuenta?',
  ],
  friendVipHint: [
    "VIP : l'addition est offerte au nom de l'ami — comptée dans les VIP, pas sur son ardoise.",
    "VIP: the bill is comped under the friend's name — counted as VIP, not on their tab.",
    'VIP: la cuenta se invita a nombre del amigo — cuenta como VIP, no va a su cuenta pendiente.',
  ],
  vipNone: ['sans nom', 'unnamed', 'sin nombre'],
  vipGuests: ['Invités VIP', 'VIP guests', 'Invitados VIP'],
  staffOrder: ['Staff', 'Staff', 'Personal'],
  staffTotal: ['Staff (hors CA)', 'Staff (excl. rev.)', 'Personal (fuera de ingresos)'],
  staffTitle: ['Commande staff (-40%)', 'Staff order (-40%)', 'Pedido de personal (-40%)'],
  staffHint: [
    "Pour quel employé ? Enregistré pour l'administration — jamais imprimé sur le ticket.",
    'For which staff member? Recorded for the admin — never printed on the receipt.',
    '¿Para qué empleado? Se registra para la administración — nunca se imprime en el ticket.',
  ],
  staffName: ["Nom de l'employé", 'Staff name', 'Nombre del empleado'],
  // friends (owed tabs — receivables, not revenue)
  friends: ['Amis', 'Friends', 'Amigos'],
  friendTabHint: [
    "Sur l'ardoise — le montant total est dû par l'ami, réglé plus tard (hors CA).",
    'On the tab — the full amount is owed by the friend, settled later (not revenue).',
    'A cuenta — el importe total lo debe el amigo y se salda más tarde (no son ingresos).',
  ],
  friendPick: ["Mettre sur l'ardoise d'un ami", "Put on a friend's tab", 'Poner a cuenta de un amigo'],
  friendPickHint: [
    "La totalité de l'addition est due par cet ami — jamais comptée comme recette.",
    'The whole bill is owed by this friend — never counted as revenue.',
    'Este amigo debe la cuenta entera — nunca se cuenta como ingreso.',
  ],
  friendNone: ['Aucun ami', 'No friends', 'Ningún amigo'],
  friendRemove: ["Retirer de l'ardoise", 'Remove from tab', 'Quitar de la cuenta'],
  friendsTab: ['Amis', 'Friends', 'Amigos'],
  owed: ['Doit', 'Owed', 'Debe'],
  totalOwed: ['Total dû', 'Total owed', 'Total adeudado'],
  settleUp: ['Régler', 'Settle up', 'Saldar'],
  markPaid: ['Marquer payé', 'Mark paid', 'Marcar como pagado'],
  payMethod: ['Mode de paiement', 'Payment method', 'Forma de pago'],
  printStatement: ["Imprimer l'addition", 'Print statement', 'Imprimir el extracto'],
  friendArchive: ['Archives', 'Archives', 'Archivo'],
  addBacklog: ['Ajouter un historique', 'Add backlog', 'Añadir histórico'],
  backlogHint: [
    'Anciens reçus papier : montant global pour un mois (pas de date précise).',
    'Old paper receipts: a lump sum for a month (no exact date).',
    'Recibos antiguos en papel: importe global de un mes (sin fecha exacta).',
  ],
  amountLabel: ['Montant', 'Amount', 'Importe'],
  monthLabel: ['Mois', 'Month', 'Mes'],
  allFriends: ['Tous', 'All', 'Todos'],
  noOwed: ['Rien dû', 'Nothing owed', 'Nada pendiente'],
  settleForPeriod: [
    'Régler la période choisie',
    'Settle the chosen period',
    'Saldar el periodo elegido',
  ],
  settledOn: ['Réglé le', 'Settled on', 'Saldado el'],
  friendSettleHint: [
    'Choisissez un ami, puis la période à régler — le montant est calculé automatiquement.',
    'Pick a friend, then the period to settle — the amount is worked out for you.',
    'Elige un amigo y luego el periodo a saldar — el importe se calcula solo.',
  ],
  viewDetail: ['voir', 'view', 'ver'],
  noDiscount: ['Sans remise', 'None', 'Sin descuento'],
  unit: ['unité', 'unit', 'unidad'],
  // waiter
  roomMap: ['Plan de salle', 'Floor map', 'Plano de sala'],
  seats: ['places', 'seats', 'plazas'],
  covers: ['couverts', 'guests', 'comensales'],
  howMany: ['Combien de couverts ?', 'How many guests?', '¿Cuántos comensales?'],
  seatTable: ['Installer la table', 'Seat table', 'Sentar la mesa'],
  seating: ['Installation…', 'Seating…', 'Sentando…'],
  joinMode: [
    'Sélection — choisissez une table à joindre',
    'Select a table to join',
    'Selecciona una mesa para unir',
  ],
  joinTables: ['Joindre les tables', 'Join tables', 'Unir mesas'],
  joined: ['Tables jointes', 'Tables joined', 'Mesas unidas'],
  separateTables: ['Séparer les tables', 'Separate tables', 'Separar mesas'],
  separateTablesHint: [
    'Chaque table récupère ses propres articles. Les articles ajoutés après la fusion restent sur la première table. Les tables se rouvrent pour être encaissées séparément.',
    'Each table gets its own items back. Items added after the merge stay on the first table. The tables reopen so each can be settled separately.',
    'Cada mesa recupera sus artículos. Los añadidos tras la unión se quedan en la primera mesa. Las mesas se reabren para cobrarlas por separado.',
  ],
  menu: ['Menu', 'Menu', 'Carta'],
  order: ['Commande', 'Order', 'Pedido'],
  cart: ['Panier', 'Cart', 'Cesta'],
  sent: ['Envoyé', 'Sent', 'Enviado'],
  note: ['Note (ex : sans oignon)…', 'Note (e.g. no onion)…', 'Nota (ej.: sin cebolla)…'],
  sendKitchen: ['Envoyer en cuisine', 'Send to kitchen', 'Enviar a cocina'],
  sendMore: ['Envoyer le complément', 'Send additions', 'Enviar lo añadido'],
  sending: ['Envoi…', 'Sending…', 'Enviando…'],
  sendFailed: [
    'Envoi échoué — connexion instable. Réappuyez sur Envoyer (ne retapez pas la commande).',
    'Send failed — connection dropped. Tap Send again (do NOT re-type the order).',
    'Fallo al enviar — se cayó la conexión. Pulsa Enviar otra vez (NO vuelvas a teclear el pedido).',
  ],
  markServed: ['Marquer servie', 'Mark served', 'Marcar como servida'],
  served: ['Servie', 'Served', 'Servida'],
  total: ['Total', 'Total', 'Total'],
  totalNet: ['Total net', 'Net total', 'Total neto'],
  totalTable: ['Total table', 'Table total', 'Total de la mesa'],
  pendingSend: ["en attente d'envoi", 'waiting to send', 'pendiente de enviar'],
  openedAt: ['ouvert à', 'opened at', 'abierta a las'],
  voidItem: ['Retirer', 'Void', 'Quitar'],
  voidReason: ['Raison du retrait', 'Void reason', 'Motivo de la retirada'],
  freeTable: ['Libérer la table', 'Free the table', 'Liberar la mesa'],
  cancelOrder: ['Annuler', 'Cancel', 'Anular'],
  freeReason: ["Raison de l'annulation", 'Cancellation reason', 'Motivo de la anulación'],
  takenBy: ['Table de', 'Table of', 'Mesa de'],
  takeOver: ['Prendre cette table ?', 'Take over this table?', '¿Hacerte cargo de esta mesa?'],
  takeOverInfo: [
    'Cette table appartient à un autre serveur. Vous pouvez la servir à sa place.',
    'This table belongs to another waiter. You can serve it instead.',
    'Esta mesa es de otro camarero. Puedes atenderla tú en su lugar.',
  ],
  myTables: ['Mes tables', 'My tables', 'Mis mesas'],
  // caisse
  bill: ['Addition', 'Bill', 'Cuenta'],
  printBill: ["Imprimer l'addition", 'Print bill', 'Imprimir la cuenta'],
  splitEqual: ['Partager également', 'Split equally', 'Dividir a partes iguales'],
  splitItems: ['Payer par article', 'Pay by item', 'Pagar por artículo'],
  perPerson: ['par personne', 'per person', 'por persona'],
  collectShare: ['Encaisser une part', 'Collect one share', 'Cobrar una parte'],
  paySelected: ['Encaisser la sélection', 'Pay selected', 'Cobrar lo seleccionado'],
  payAll: ['Encaisser le reste', 'Collect remaining', 'Cobrar el resto'],
  paid: ['Payé', 'Paid', 'Pagado'],
  paidInFull: ['Payé intégralement', 'Paid in full', 'Pagado por completo'],
  remaining: ['Reste à payer', 'Remaining', 'Queda por pagar'],
  cash: ['Espèces', 'Cash', 'Efectivo'],
  card: ['Carte', 'Card', 'Tarjeta'],
  tableFreed: ['Table libérée', 'Table freed', 'Mesa liberada'],
  noItems: ['Aucun article commandé.', 'No items ordered.', 'No hay artículos pedidos.'],
  viewOnlyBy: ['Vue seule — table de', 'View only — table of', 'Solo lectura — mesa de'],
  waitServed: [
    'Encaissement disponible une fois la table servie.',
    'Payment available once the table is served.',
    'Se puede cobrar una vez servida la mesa.',
  ],
  alreadyPaid: ['déjà payé', 'already paid', 'ya pagado'],
  // admin
  analytics: ['Analytique', 'Analytics', 'Analítica'],
  dishesTab: ['Plats', 'Dishes', 'Platos'],
  dishesSold: ['Plats vendus', 'Dishes sold', 'Platos vendidos'],
  orders: ['Commandes', 'Orders', 'Pedidos'],
  staffTab: ['Personnel', 'Staff', 'Personal'],
  journal: ['Journal', 'Activity', 'Actividad'],
  revenue: ["Chiffre d'affaires", 'Revenue', 'Facturación'],
  ordersCount: ['Additions', 'Orders', 'Cuentas'],
  avgTicket: ['Ticket moyen', 'Avg ticket', 'Ticket medio'],
  occupied: ['Tables occupées', 'Tables occupied', 'Mesas ocupadas'],
  /** Marks a card that always shows the situation RIGHT NOW, whatever
   * period is selected — otherwise it reads as a figure for that period. */
  liveNow: ['en direct', 'live now', 'en directo'],
  coversServed: ['Couverts servis', 'Guests served', 'Comensales atendidos'],
  day: ['Jour', 'Day', 'Día'],
  week: ['Semaine', 'Week', 'Semana'],
  month: ['Mois', 'Month', 'Mes'],
  pickMonth: ['Choisir un mois', 'Pick a month', 'Elegir un mes'],
  bestSellers: ['Meilleures ventes', 'Best sellers', 'Más vendidos'],
  byQty: ['Quantité', 'Quantity', 'Cantidad'],
  byRevenue: ['Revenu', 'Revenue', 'Ingresos'],
  busiest: ['Affluence par heure', 'Busiest hours', 'Horas de más afluencia'],
  serviceTime: ['Temps de service', 'Service time', 'Tiempo de servicio'],
  revenueOverTime: ['Revenu par jour', 'Revenue per day', 'Ingresos por día'],
  revenueByEmployee: ['Chiffre par employé', 'Revenue by employee', 'Ingresos por empleado'],
  topByQty: ['Top ventes — quantité', 'Top sellers — quantity', 'Top ventas — cantidad'],
  topByRevenue: ['Top ventes — revenu', 'Top sellers — revenue', 'Top ventas — ingresos'],
  sodas: ['Sodas', 'Sodas', 'Refrescos'],
  sodasSold: ['Sodas vendus', 'Sodas sold', 'Refrescos vendidos'],
  // login help / contact
  helpContact: ['Aide & Contact', 'Help & Contact', 'Ayuda y contacto'],
  contactTitle: ['Besoin d’aide ?', 'Need help?', '¿Necesitas ayuda?'],
  contactHint: [
    'Contactez le support pour toute question sur l’application.',
    'Contact support for any question about the app.',
    'Contacta con soporte para cualquier duda sobre la aplicación.',
  ],
  callUs: ['Appeler', 'Call', 'Llamar'],
  emailUs: ['Email', 'Email', 'Email'],
  addStaff: ['Ajouter un employé', 'Add employee', 'Añadir empleado'],
  editStaff: ['Modifier', 'Edit', 'Editar'],
  deactivate: ['Désactiver', 'Deactivate', 'Desactivar'],
  activate: ['Activer', 'Activate', 'Activar'],
  currentPin: ['Code PIN actuel', 'Current PIN', 'PIN actual'],
  currentPassword: ['Mot de passe actuel', 'Current password', 'Contraseña actual'],
  secretUnknown: [
    'inconnu — définissez-en un nouveau ci-dessous',
    'unknown — set a new one below',
    'desconocido — define uno nuevo abajo',
  ],
  deleteStaff: ['Supprimer', 'Delete', 'Eliminar'],
  deleteStaffConfirm: [
    'Supprimer définitivement cet employé ?',
    'Permanently delete this employee?',
    '¿Eliminar definitivamente a este empleado?',
  ],
  deleteStaffHasHistory: [
    'Impossible de supprimer : cet employé a un historique (tables, paiements). Désactivez-le à la place.',
    'Cannot delete: this employee has history (tables, payments). Deactivate them instead.',
    'No se puede eliminar: este empleado tiene historial (mesas, pagos). Desactívalo en su lugar.',
  ],
  fullName: ['Nom complet', 'Full name', 'Nombre completo'],
  roleLabel: ['Rôle', 'Role', 'Rol'],
  role_waiter: ['Serveur', 'Waiter', 'Camarero'],
  role_cashier: ['Caisse', 'Cashier', 'Caja'],
  role_admin: ['Admin', 'Admin', 'Admin'],
  pinLabel: ['Code PIN (4 chiffres)', 'PIN code (4 digits)', 'Código PIN (4 dígitos)'],
  passwordLabel: ['Mot de passe', 'Password', 'Contraseña'],
  colorLabel: ['Couleur', 'Color', 'Color'],
  newSecretHint: [
    'Laisser vide pour ne pas changer',
    'Leave empty to keep unchanged',
    'Déjalo vacío para no cambiarlo',
  ],
  noOrders: [
    'Aucune commande sur la période.',
    'No orders in this period.',
    'Ningún pedido en este periodo.',
  ],
  waiter: ['Serveur', 'Waiter', 'Camarero'],
  items: ['articles', 'items', 'artículos'],
  lateFlag: ['retard', 'late', 'retraso'],
  voidFlag: ['retrait', 'void', 'retirado'],
  cancelledFlag: ['annulée', 'cancelled', 'anulada'],
  // waiter — join & seat
  otherNumber: ['Autre', 'Other', 'Otro'],
  joinSelected: ['Joindre les tables', 'Join tables', 'Unir mesas'],
  addOrder: ['Commande', 'Order', 'Pedido'],
  takeControl: ['Prendre la table', 'Take control', 'Hacerse cargo'],
  chooseDrink: [
    'Boisson incluse — choisissez laquelle apporter',
    'Included drink — choose which one to bring',
    'Bebida incluida — elige cuál llevar',
  ],
  addedToCart: ['ajouté au panier', 'added to cart', 'añadido a la cesta'],
  stockTab: ['Stock & Prix', 'Stock & Prices', 'Stock y precios'],
  upcomingPayments: ['Encaissements à venir', 'Upcoming payments', 'Cobros pendientes'],
  upcomingTables: ['tables ouvertes', 'open tables', 'mesas abiertas'],
  available: ['Disponible', 'Available', 'Disponible'],
  outOfStock: ['Rupture', 'Out of stock', 'Sin existencias'],
  outOfStockShort: ['rupture', 'out', 'agotado'],
  outOfStockToast: ['Rupture de stock', 'Out of stock', 'Sin existencias'],
  changeDrink: ['changer', 'change', 'cambiar'],
  chooseDrinksColdHot: [
    'Boissons incluses — 1 froide et 1 chaude',
    'Included drinks — 1 cold and 1 hot',
    'Bebidas incluidas — 1 fría y 1 caliente',
  ],
  chooseDrinksColdHot2: [
    'Boissons incluses — 2 froides et 2 chaudes (la même deux fois est possible)',
    'Included drinks — 2 cold and 2 hot (the same one twice is fine)',
    'Bebidas incluidas — 2 frías y 2 calientes (se puede repetir la misma)',
  ],
  coldDrink: ['Boisson froide', 'Cold drink', 'Bebida fría'],
  hotDrink: ['Boisson chaude', 'Hot drink', 'Bebida caliente'],
  eggsCount: ["Nombre d'œufs", 'Number of eggs', 'Número de huevos'],
  preparation: ['Préparation', 'Preparation', 'Preparación'],
  chooseOption: ['Choisissez une option', 'Choose an option', 'Elige una opción'],
  // menu top-level groups. They double as the PRINT ROUTING: everything
  // under `food` prints in the kitchen, everything under `drinks` at the bar.
  main_food: ['Cuisine', 'Kitchen', 'Cocina'],
  main_drinks: ['Bar', 'Bar', 'Barra'],
  branchSharedPrices: [
    'La carte et les prix sont partagés ; le stock gère les ruptures.',
    'The menu and prices are shared; stock tracks what has run out.',
    'La carta y los precios son comunes; el stock controla lo que se ha agotado.',
  ],
  joinModeMulti: [
    'Touchez les tables à joindre',
    'Tap tables to join',
    'Toca las mesas que quieres unir',
  ],
  maxGuests: ['places habituelles', 'usual seats', 'plazas habituales'],
  // caisse — split parts
  guests: ['convives', 'guests', 'comensales'],
  // admin — period
  allDates: ['Toutes dates', 'All dates', 'Todas las fechas'],
  allTime: ['Tout', 'All time', 'Histórico'],
  customRange: ['Période', 'Range', 'Periodo'],
  from: ['Du', 'From', 'Del'],
  to: ['Au', 'To', 'Al'],
  vipCost: ['Offerts VIP', 'VIP comped', 'Invitaciones VIP'],
  ordRevenue: ['Revenu encaissé', 'Revenue collected', 'Ingresos cobrados'],
  ordUnpaid: ['Impayé', 'Unpaid', 'Impagado'],
  ordReconHint: [
    'VIP, Amis, Staff et impayés ne comptent pas dans le revenu.',
    'VIP, Friends, Staff and unpaid are excluded from revenue.',
    'VIP, amigos, personal e impagados no cuentan como ingresos.',
  ],
  specificDay: ['Jour précis', 'Specific day', 'Día concreto'],
  specificMonth: ['Mois précis', 'Specific month', 'Mes concreto'],
  // admin — orders / journal
  viewBill: ["Voir l'addition", 'View bill', 'Ver la cuenta'],
  billStripped: [
    'article(s) non envoyé(s) en cuisine ont été retirés de l’addition.',
    'item(s) never sent to the kitchen were left off the bill.',
    'artículo(s) que nunca se enviaron a cocina se han dejado fuera de la cuenta.',
  ],
  finalBill: ['Addition finale', 'Final bill', 'Cuenta final'],
  filterAll: ['Tout', 'All', 'Todo'],
  filterWaiters: ['Serveurs', 'Waiters', 'Camareros'],
  filterCaisse: ['Caisse', 'Cashier', 'Caja'],
  payFull: ['Paiement total', 'Full payment', 'Pago completo'],
  paySplitEqual: ['Partagé en parts égales', 'Split equally', 'Dividido a partes iguales'],
  payByItems: ['Articles précis', 'Specific items', 'Artículos concretos'],
  paidWord: ['payés', 'paid', 'pagados'],
  remainingWord: ['restants', 'remaining', 'restantes'],
  parts: ['parts', 'parts', 'partes'],
  // activity actions
  act_seat: ['Installation', 'Seated', 'Sentados'],
  act_join: ['Tables jointes', 'Joined tables', 'Mesas unidas'],
  act_split: ['Tables séparées', 'Tables separated', 'Mesas separadas'],
  act_send_kitchen: ['Envoi en cuisine', 'Sent to kitchen', 'Enviado a cocina'],
  act_served: ['Servie', 'Served', 'Servida'],
  act_pay: ['Encaissement', 'Payment', 'Cobro'],
  act_close_table: ['Table clôturée', 'Table closed', 'Mesa cerrada'],
  act_void_item: ['Article retiré', 'Item voided', 'Artículo retirado'],
  act_cancel_table: ['Table annulée', 'Table cancelled', 'Mesa anulada'],
  act_take_over: ['Reprise de table', 'Took over table', 'Mesa asumida'],
  act_print_bill: ['Addition imprimée', 'Bill printed', 'Cuenta impresa'],
  act_lock_table: ['Table fermée', 'Table closed', 'Mesa cerrada'],
  act_reopen_table: ['Table rouverte', 'Table reopened', 'Mesa reabierta'],
  act_auto_free: [
    'Libérée auto (en attente > 1h)',
    'Auto-freed (waiting > 1h)',
    'Liberada automáticamente (en espera > 1 h)',
  ],
  act_auto_dupe: [
    'Doublon supprimé (table déjà ouverte)',
    'Duplicate removed (table already open)',
    'Duplicado eliminado (la mesa ya estaba abierta)',
  ],
  act_transfer: ['Transfert', 'Transfer', 'Transferencia'],
  act_stock: ['Disponibilité', 'Availability', 'Disponibilidad'],
  act_price: ['Prix modifié', 'Price changed', 'Precio cambiado'],
  act_report_request: ['Relevé demandé', 'Report requested', 'Informe solicitado'],
  act_report_approve: ['Relevé autorisé', 'Report approved', 'Informe autorizado'],
  act_report_deny: ['Relevé refusé', 'Report denied', 'Informe rechazado'],
  act_report_print: ['Relevé imprimé', 'Report printed', 'Informe impreso'],
  act_friend_set: ['Ardoise ami', "Friend's tab", 'Cuenta de amigo'],
  act_friend_debt: ['Addition sur ardoise', 'Billed to a tab', 'Cargado a una cuenta'],
  act_friend_add: ['Ami ajouté', 'Friend added', 'Amigo añadido'],
  act_friend_rename: ['Ami renommé', 'Friend renamed', 'Amigo renombrado'],
  act_friend_remove: ['Ami retiré', 'Friend retired', 'Amigo retirado'],
  act_remove_items: ['Articles retirés (caisse)', 'Items removed (till)', 'Artículos retirados (caja)'],
  removeItems: ['Retirer articles', 'Remove items', 'Retirar artículos'],
  removeItemsConfirm: [
    'Retirer les articles sélectionnés de la commande ?',
    'Remove the selected items from the order?',
    '¿Retirar del pedido los artículos seleccionados?',
  ],
} satisfies Record<string, [string, string, string]>

export type TKey = keyof typeof dict

interface I18nState {
  lang: Lang
  setLang: (l: Lang) => void
  t: (k: TKey) => string
}

const makeT =
  (lang: Lang): I18nState['t'] =>
  (k) =>
    dict[k][LANG_INDEX[lang]]

const isLang = (v: string | null): v is Lang => LANGS.includes(v as Lang)

export const useI18n = create<I18nState>((set) => {
  const saved = localStorage.getItem('acua.lang')
  const initialLang: Lang = isLang(saved) ? saved : 'fr'
  return {
    lang: initialLang,
    t: makeT(initialLang),
    setLang: (lang) => {
      localStorage.setItem('acua.lang', lang)
      document.documentElement.lang = lang
      // `t` gets a fresh reference so components that only select `t`
      // (not `lang`) still re-render immediately on language change.
      set({ lang, t: makeT(lang) })
    },
  }
})
