# Installation - morphostyle

```powershell
git clone https://github.com/RYJITS/morphostyle.git
cd morphostyle
```

```powershell
npm install
npm run dev
```

Pour tester le mode photo personnelle OpenAI, renseigner d'abord `OPENAI_API_KEY` dans `.env` ou dans l'environnement serveur, puis lancer aussi l'API:

```powershell
npm run dev:api
```

Le mode OpenAI applique par defaut `OPENAI_DAILY_TRIAL_LIMIT=1`, soit un essai complet par jour et par navigateur.
