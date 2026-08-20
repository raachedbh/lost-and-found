export const demoUser = {
  id: 'demo-user',
  name: 'Yacine',
  initials: 'YA',
  verified: true,
  returns: 2,
  city: 'Tunis',
}

const text = (tn, ar, fr, en) => ({ tn, ar, fr, en })

export const seedCases = [
  {
    id: 'car-key-menzah', kind: 'found', category: 'keys',
    title: text('مفتاح كرهبة', 'مفتاح سيارة', 'Clé de voiture', 'Car key'),
    description: text('لقيناه قريب من محطة المترو. نعطيه كان للي يثبت نوع الكرهبة.', 'وُجد قرب محطة المترو. يُسلّم بعد التحقق.', 'Trouvée près de la station de métro. Remise après vérification.', 'Found near the metro station. Ownership will be verified.'),
    location: text('المنزه، تونس', 'المنزه، تونس', 'El Menzah, Tunis', 'El Menzah, Tunis'),
    date: '2026-08-20', image: '/assets/car-key.jpg', status: 'open',
    author: { id: 'ahmed', name: 'Ahmed B.', initials: 'AB', verified: true, returns: 3 }, comments: 4,
  },
  {
    id: 'green-wallet-ariana', kind: 'lost', category: 'wallets',
    title: text('محفظة خضراء', 'محفظة خضراء', 'Portefeuille vert', 'Green wallet'),
    description: text('ضاعتلي في أريانة. فيها حاجات شخصية، التفاصيل نعطيهم بالخاص.', 'فُقدت في أريانة. التفاصيل الخاصة تُشارك سرًا.', 'Perdu à Ariana. Les détails privés seront partagés en message.', 'Lost in Ariana. Private details will be shared in chat.'),
    location: text('أريانة', 'أريانة', 'Ariana', 'Ariana'),
    date: '2026-08-20', image: '/assets/green-wallet.jpg', status: 'matching', reward: 80, matchCount: 1, matchScore: 92,
    author: { id: 'sarra', name: 'Sarra M.', initials: 'SM', verified: true, returns: 1 }, comments: 8,
  },
  {
    id: 'earbuds-lac', kind: 'found', category: 'electronics',
    title: text('سماعات لاسلكية', 'سماعات لاسلكية', 'Écouteurs sans fil', 'Wireless earbuds'),
    description: text('لقيناهم في الكورنيش. قلنا على لون الكوفر باش تتثبت الملكية.', 'وُجدت قرب الكورنيش. يلزم وصف الغطاء للتحقق.', 'Trouvés près de la corniche. Décrivez la coque pour les récupérer.', 'Found near the corniche. Describe the case to verify ownership.'),
    location: text('البحيرة، تونس', 'البحيرة، تونس', 'Les Berges du Lac', 'Les Berges du Lac'),
    date: '2026-08-20', image: '/assets/earbuds.jpg', status: 'open', source: 'facebook',
    author: { id: 'youssef', name: 'Youssef K.', initials: 'YK', verified: true, returns: 5 }, comments: 2,
  },
  {
    id: 'black-backpack-sousse', kind: 'lost', category: 'bags',
    title: text('حقيبة ظهر سوداء', 'حقيبة ظهر سوداء', 'Sac à dos noir', 'Black backpack'),
    description: text('ضاعت في محطة سوسة. فيها كراريس وخدمة.', 'فُقدت في محطة سوسة وبداخلها دفاتر.', 'Perdu à la gare de Sousse avec des cahiers.', 'Lost at Sousse station with notebooks inside.'),
    location: text('سوسة', 'سوسة', 'Sousse', 'Sousse'),
    date: '2026-08-19', image: '/assets/backpack.jpg', status: 'open', reward: 50,
    author: { id: 'meriem', name: 'Meriem S.', initials: 'MS', verified: false, returns: 0 }, comments: 6,
  },
  {
    id: 'found-wallet-ariana', kind: 'found', category: 'wallets',
    title: text('محفظة خضراء', 'محفظة خضراء', 'Portefeuille vert', 'Green wallet'),
    description: text('لقيتها في أريانة وفيها بطاقات. التفاصيل الخاصة نعطيها كان للمالك.', 'وُجدت في أريانة وبداخلها بطاقات. التفاصيل الخاصة للمالك فقط.', 'Trouvé à Ariana avec des cartes. Les détails privés sont réservés au propriétaire.', 'Found in Ariana with cards inside. Private details are only shared with the owner.'),
    location: text('أريانة', 'أريانة', 'Ariana', 'Ariana'),
    date: '2026-08-20', image: '/assets/green-wallet.jpg', status: 'matching', matchCount: 1, matchScore: 92,
    author: { ...demoUser }, comments: 0,
  },
]
