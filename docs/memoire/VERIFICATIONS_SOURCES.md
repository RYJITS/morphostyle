# Verifications et sources - MorphoStyle Studio

Derniere mise a jour: 2026-08-25

## Sources Hostinger utiles

- Node.js Web Apps Hostinger: https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/
- Creation base MySQL Hostinger: https://www.hostinger.com/support/1583542-how-to-create-a-new-mysql-database-in-hostinger/
- Port MySQL Hostinger: https://www.hostinger.com/support/1583226-which-database-management-system-is-used-at-hostinger/

## Verification production

Commande utilisee le 2026-08-25:

```powershell
Invoke-WebRequest -Uri "https://morphostyle.c2rdesign.com/api/health" -UseBasicParsing
```

Constat:

- API production disponible.
- Cle image serveur detectee.
- Sharp disponible pour decouper les planches.

## Sources de verite locales

- `server/index.mjs`: routes API, generation image, quota journalier, vitrine publique.
- `App.tsx`: parcours utilisateur, historique local, consultation et fiches.
- `public/demo-profiles/`: bibliotheque statique des profils.
- `docs/memoire/`: memoire de reprise et decisions actives.
