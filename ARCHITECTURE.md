# WorkShare V1 Architektur und Umsetzungsplan

## 1. Zielarchitektur
- Client: Flutter Android App (State Management mit Provider)
- Backend: Firebase Authentication + Cloud Firestore + Firebase Storage
- Live-Update: Firestore Streams fuer Projekte, Mitglieder, Materialien und Katalog
- Offline: Firestore Local Cache aktiviert (default), writes queued und nach Netzrueckkehr synchronisiert
- Export: Materialliste als PDF lokal erzeugen und via Share-Intent teilen

### Schichten
- `lib/models`: Domänenmodelle (UserProfile, Project, ProjectMember, MaterialItem, CatalogEntry, Invitation)
- `lib/services`: Firebase-nahe Services (AuthService, ProjectService, MaterialService, CatalogService, InvitationService, PdfExportService)
- `lib/providers`: App-State (AuthProvider, ThemeProvider)
- `lib/screens`: UI-Screens je Feature
- `lib/widgets`: Wiederverwendbare UI-Bausteine
- `lib/core`: App-Theme und Konstanten
- `lib/utils`: Hilfsfunktionen (Formatierung, Rollen-Helfer)

## 2. Firestore-Datenstruktur

### Collections
- `users/{uid}`
- `projects/{projectId}`
- `project_members/{memberId}`
- `materials/{materialId}`
- `catalog_entries/{entryId}`
- `invitations/{invitationId}`

### Dokumente

#### `users/{uid}`
- `id`: string (uid)
- `email`: string
- `displayName`: string
- `createdAt`: timestamp
- `updatedAt`: timestamp

#### `projects/{projectId}`
- `id`: string
- `name`: string
- `description`: string optional
- `ownerId`: string
- `createdAt`: timestamp
- `updatedAt`: timestamp
- `archived`: bool

#### `project_members/{memberId}`
- `id`: string
- `projectId`: string
- `userId`: string
- `email`: string
- `role`: enum `owner|admin|worker|viewer`
- `invitedBy`: string optional
- `joinedAt`: timestamp

`memberId`-Schema: `${projectId}_${userId}` fuer Eindeutigkeit.

#### `materials/{materialId}`
- `id`: string
- `projectId`: string
- `name`: string
- `quantity`: number
- `unit`: string
- `catalogEntryId`: string optional
- `note`: string optional
- `createdBy`: string
- `createdAt`: timestamp
- `updatedAt`: timestamp

#### `catalog_entries/{entryId}`
- `id`: string
- `name`: string
- `nameLower`: string (Prefix-Query)
- `unit`: string
- `category`: string optional
- `createdBy`: string
- `isActive`: bool
- `createdAt`: timestamp
- `updatedAt`: timestamp

#### `invitations/{invitationId}`
- `id`: string
- `projectId`: string
- `projectName`: string
- `email`: string (lowercase)
- `role`: enum
- `invitedBy`: string
- `status`: enum `pending|accepted|revoked`
- `createdAt`: timestamp
- `acceptedAt`: timestamp optional

## 3. Rollenlogik
- `owner`: Vollzugriff, inklusive Projekt loeschen, Rollen vergeben, Einladungen, Material/Katalog
- `admin`: Mitglieder verwalten (ohne owner-Transfer), Einladungen, Material/Katalog, Projekt bearbeiten
- `worker`: Material lesen/anlegen/bearbeiten/loeschen, Katalog lesen, keine Mitgliederverwaltung
- `viewer`: Nur lesen (Projekt, Material, Katalog), kein Schreiben

### Berechtigungsregeln
- Projektsichtbarkeit: nur wenn Membership in `project_members` vorhanden
- Mitgliederverwaltung: nur `owner` und `admin`
- Material-Schreiben: `owner|admin|worker`
- Material-Lesen: alle Projektmitglieder inkl. `viewer`
- Katalog: globale Lesbarkeit fuer authentifizierte Nutzer; Schreiben fuer `owner|admin|worker` (V1 pragmatisch)

## 4. Navigationsstruktur
- `AuthGate` entscheidet:
  - nicht eingeloggt -> `LoginScreen`
  - eingeloggt -> `HomeShell`
- `HomeShell` mit BottomNavigation:
  - `ProjectsScreen`
  - `CatalogScreen`
  - `SettingsScreen`
- Von `ProjectsScreen`:
  - `ProjectFormScreen` (create/edit)
  - `ProjectDetailScreen` (Materialliste)
- Von `ProjectDetailScreen`:
  - `MaterialFormScreen`
  - `ProjectMembersScreen`
  - `InviteMemberScreen`

## 5. Liste aller Screens
- `SplashScreen` (kurz fuer Initialisierung)
- `LoginScreen`
- `RegisterScreen`
- `ProjectsScreen`
- `ProjectFormScreen`
- `ProjectDetailScreen`
- `MaterialFormScreen`
- `ProjectMembersScreen`
- `InviteMemberScreen`
- `CatalogScreen`
- `CatalogEntryFormScreen`
- `SettingsScreen`

## 6. Security-Rules-Strategie
- Utility-Funktionen in Rules:
  - `isSignedIn()`
  - `memberDoc(projectId)`
  - `isProjectMember(projectId)`
  - `hasRole(projectId, roles)`
- Zugriff strikt anhand Membership-Dokument
- Query Safety:
  - `project_members` nur eigene Dokumente sichtbar oder durch Admin/Owner im selben Projekt
  - `materials` nur falls Projektmitglied
  - `projects` nur falls Mitglied
  - `invitations` nur betroffene E-Mail (einladungsadressiert) oder Admin/Owner des Projekts
- Feldervalidierung:
  - `role` nur aus erlaubten Werten
  - `quantity > 0`
  - nur definierte Felder updatebar (kein Privilege Escalation)
- Index-Hinweise fuer Prefix-Matching und Projektfilter in README

## Umsetzungsphasen
1. Projektstruktur + Firebase-Basis
2. Auth
3. Projekte + Mitglieder
4. Materialverwaltung
5. Katalog + Prefix-Autocomplete
6. Einstellungen + Dark/System Mode
7. PDF-Export nur Material
8. Security Rules + Abschluss

