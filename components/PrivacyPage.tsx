import React from 'react';
import { Coins, Database, FileText, Globe2, Images, ShieldCheck, User } from 'lucide-react';

const privacySections = [
  {
    icon: Images,
    title: "Photos personnelles",
    body: "Les photos chargees depuis un compte servent a preparer les recommandations et les resultats coiffure. Elles sont privees par defaut, rattachees au compte createur et servies avec des acces temporaires. Une photo personnelle n'est pas ajoutee automatiquement a la vitrine publique."
  },
  {
    icon: User,
    title: "Compte et session",
    body: "Le compte utilise un email, un mot de passe protege cote serveur et une session technique. Le cookie de session sert uniquement a garder la connexion et a limiter l'exposition du jeton au navigateur."
  },
  {
    icon: Coins,
    title: "Credits et quotas",
    body: "Le service conserve les essais du jour, les credits disponibles et les operations utiles pour eviter les consommations injustes, par exemple le remboursement d'un credit si une generation echoue avant resultat exploitable."
  },
  {
    icon: Globe2,
    title: "Vitrine publique",
    body: "La publication est volontaire. Quand une fiche est publiee, la vitrine expose le resultat genere et ses informations de style; la photo d'origine reste hors vitrine publique."
  },
  {
    icon: Database,
    title: "Historique",
    body: "L'historique personnel permet de retrouver les resultats finalises, leurs images et les recommandations associees. Les recommandations peuvent etre reprises depuis une fiche resultat. Une fiche peut etre supprimee depuis l'espace utilisateur; elle est alors retiree des listes actives."
  },
  {
    icon: ShieldCheck,
    title: "Securite",
    body: "Les cles d'IA restent cote serveur. Les images personnelles ne doivent pas etre accessibles sans compte ou lien signe, et les pages publiees sont accompagnees de protections navigateur de base."
  }
];

const PrivacyPage: React.FC = () => (
  <div className="mx-auto max-w-6xl py-10 text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="mb-8">
      <div className="max-w-3xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-black px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-sm">
          <FileText className="h-3.5 w-3.5 text-rose-300" />
          Donnees personnelles
        </div>
        <h1 className="serif text-4xl font-bold leading-tight text-gray-950 sm:text-5xl">Confidentialite</h1>
        <p className="mt-4 max-w-2xl text-sm font-medium leading-7 text-gray-500">
          MorphoStyle Studio traite uniquement les donnees necessaires au conseil coiffure, a la conservation de l'historique et a la securisation des comptes.
        </p>
      </div>
    </div>

    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Points de confidentialite">
      {privacySections.map((section) => (
        <article key={section.title} className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <section.icon className="h-4 w-4" />
          </div>
          <h2 className="text-base font-black text-gray-950">{section.title}</h2>
          <p className="mt-3 text-sm font-medium leading-7 text-gray-500">{section.body}</p>
        </article>
      ))}
    </section>

    <section className="mt-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-rose-500">Conservation</div>
          <h2 className="mt-2 serif text-3xl font-bold text-gray-950">Ce qui reste sous controle</h2>
        </div>
        <div className="space-y-4 text-sm font-medium leading-7 text-gray-500">
          <p>
            Les images, generations et donnees de compte sont conservees pour fournir l'historique, la reprise des recommandations, les telechargements et la gestion des credits. Les elements peuvent etre retires des listes actives depuis l'espace utilisateur quand la suppression est disponible.
          </p>
          <p>
            Le site utilise un cookie technique de session. Ce cookie n'est pas un cookie publicitaire ou de suivi marketing. Le navigateur peut aussi conserver des informations techniques de confort, comme l'historique du jour ou un identifiant local de session.
          </p>
          <p>
            Les demandes de correction, acces ou suppression passent par le canal de contact fourni avec l'acces au service. Une page de mentions legales separee pourra completer les informations administratives du responsable du site.
          </p>
        </div>
      </div>
    </section>

    <p className="mt-5 px-1 text-xs font-bold uppercase tracking-widest text-gray-400">
      Derniere mise a jour: 7 septembre 2026
    </p>
  </div>
);

export default PrivacyPage;
