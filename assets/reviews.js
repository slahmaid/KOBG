/* Avis clients affichés sur l'accueil et les fiches produit (rendu : script.js, bloc « customer reviews »).
   RÈGLE : uniquement de VRAIS messages de clients (commentaire public, message privé ou WhatsApp), recopiés tels quels
   (on peut raccourcir, jamais réécrire), avec l'accord du client pour un message privé. Liste vide : la section
   n'apparaît nulle part.

   Un avis = une ligne :
     { name: 'Prénom N.', city: 'Casablanca', text: 'Le message du client.', source: 'instagram',
       date: '2026-11', product: 'rb10-intelli-shock', img: 'assets/reviews/prenom-n.jpg' }

     name     prénom + initiale (ou pseudo public du commentaire)                         obligatoire
     text     le message du client, mot pour mot                                          obligatoire (sauf si img)
     source   'instagram' | 'facebook' | 'whatsapp' | 'tiktok'                            obligatoire
     city     ville                                                                       facultatif
     date     'AAAA-MM'                                                                   facultatif
     product  début de l'adresse de la fiche (ex. 'rs100-professional') : l'avis passe en premier sur ces fiches   facultatif
     img      capture d'écran du message (dans assets/reviews/, numéro et photo de profil masqués)                  facultatif
*/
window.KOBG_REVIEWS = [];
