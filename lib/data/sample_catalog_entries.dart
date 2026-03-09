class SampleCatalogEntryData {
  const SampleCatalogEntryData({
    required this.name,
    required this.unit,
    this.category,
  });

  final String name;
  final String unit;
  final String? category;
}

const sampleCatalogEntries = <SampleCatalogEntryData>[
  SampleCatalogEntryData(name: 'NYM-J 3x1.5', unit: 'm', category: 'Kabel'),
  SampleCatalogEntryData(name: 'NYM-J 5x1.5', unit: 'm', category: 'Kabel'),
  SampleCatalogEntryData(name: 'NYM-J 3x2.5', unit: 'm', category: 'Kabel'),
  SampleCatalogEntryData(name: 'CAT7 Datenkabel', unit: 'm', category: 'Netzwerk'),
  SampleCatalogEntryData(name: 'Leerrohr M20', unit: 'm', category: 'Installation'),
  SampleCatalogEntryData(name: 'Leerrohr M25', unit: 'm', category: 'Installation'),
  SampleCatalogEntryData(name: 'Kabelkanal 40x60', unit: 'm', category: 'Installation'),
  SampleCatalogEntryData(name: 'Sicherung B16', unit: 'stk', category: 'Verteiler'),
  SampleCatalogEntryData(name: 'Sicherung C16', unit: 'stk', category: 'Verteiler'),
  SampleCatalogEntryData(name: 'FI-Schalter 40A', unit: 'stk', category: 'Verteiler'),
  SampleCatalogEntryData(name: 'LS-Schalter 3-polig', unit: 'stk', category: 'Verteiler'),
  SampleCatalogEntryData(name: 'Unterputzdose', unit: 'stk', category: 'Installation'),
  SampleCatalogEntryData(name: 'Hohlwanddose', unit: 'stk', category: 'Installation'),
  SampleCatalogEntryData(name: 'Schalter', unit: 'stk', category: 'Schalterprogramm'),
  SampleCatalogEntryData(name: 'Steckdose', unit: 'stk', category: 'Schalterprogramm'),
  SampleCatalogEntryData(name: 'Taster', unit: 'stk', category: 'Schalterprogramm'),
  SampleCatalogEntryData(name: 'Abdeckrahmen 1-fach', unit: 'stk', category: 'Schalterprogramm'),
  SampleCatalogEntryData(name: 'Abdeckrahmen 2-fach', unit: 'stk', category: 'Schalterprogramm'),
  SampleCatalogEntryData(name: 'Abzweigdose', unit: 'stk', category: 'Installation'),
  SampleCatalogEntryData(name: 'Wago Klemme 2-fach', unit: 'pkg', category: 'Klemmen'),
  SampleCatalogEntryData(name: 'Wago Klemme 3-fach', unit: 'pkg', category: 'Klemmen'),
  SampleCatalogEntryData(name: 'Kabelbinder', unit: 'pkg', category: 'Befestigung'),
  SampleCatalogEntryData(name: 'Duebelschraube', unit: 'pkg', category: 'Befestigung'),
  SampleCatalogEntryData(name: 'Montageschiene', unit: 'm', category: 'Befestigung'),
  SampleCatalogEntryData(name: 'LED Panel 60x60', unit: 'stk', category: 'Leuchten'),
  SampleCatalogEntryData(name: 'Einbauspot', unit: 'stk', category: 'Leuchten'),
  SampleCatalogEntryData(name: 'Installationsklemme', unit: 'pkg', category: 'Klemmen'),
  SampleCatalogEntryData(name: 'Isolierband', unit: 'stk', category: 'Verbrauch'),
  SampleCatalogEntryData(name: 'Schrumpfschlauch Set', unit: 'set', category: 'Verbrauch'),
  SampleCatalogEntryData(name: 'Potentialausgleichsschiene', unit: 'stk', category: 'Verteiler'),
];
