import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../providers/theme_provider.dart';
import '../services/catalog_service.dart';
import '../services/firebase_service.dart';
import '../utils/app_notice.dart';
import '../utils/error_mapper.dart';
import '../widgets/brand_logo.dart';
import 'workgroups_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final Future<PackageInfo> _packageInfoFuture;
  final _catalogService = CatalogService();
  bool _loadingSampleCatalog = false;
  bool _unloadingSampleCatalog = false;

  @override
  void initState() {
    super.initState();
    _packageInfoFuture = PackageInfo.fromPlatform();
  }
  Future<void> _loadSampleCatalog() async {
    final user = context.read<AuthProvider>().user;
    if (user == null) {
      showAppNotice(context, 'Bitte zuerst anmelden.',
          type: AppNoticeType.info);
      return;
    }

    final confirm = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Beispielkatalog laden?'),
            content: const Text(
              'Feste Vorlage wird in deinen persönlichen Katalog importiert. '
              'Bestehende Einträge bleiben erhalten.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(false),
                child: const Text('Abbrechen'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(dialogContext).pop(true),
                child: const Text('Laden'),
              ),
            ],
          ),
        ) ??
        false;
    if (!confirm || !mounted) return;

    setState(() => _loadingSampleCatalog = true);
    try {
      final result =
          await _catalogService.importFixedSampleCatalog(userId: user.uid);
      if (!mounted) return;
      showAppNotice(
        context,
        'Beispielkatalog geladen: ${result.inserted} hinzugefügt, ${result.skipped} übersprungen.',
        type: AppNoticeType.success,
      );
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(e,
            fallback: 'Beispielkatalog konnte nicht geladen werden.'),
        type: AppNoticeType.error,
      );
    } finally {
      if (mounted) {
        setState(() => _loadingSampleCatalog = false);
      }
    }
  }

  Future<void> _unloadSampleCatalog() async {
    final user = context.read<AuthProvider>().user;
    if (user == null) {
      showAppNotice(context, 'Bitte zuerst anmelden.',
          type: AppNoticeType.info);
      return;
    }

    final confirm = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Beispielkatalog entladen?'),
            content: const Text(
              'Es werden nur importierte Beispiel-Einträge entfernt. '
              'Deine eigenen Katalogeinträge bleiben erhalten.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(false),
                child: const Text('Abbrechen'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(dialogContext).pop(true),
                child: const Text('Entladen'),
              ),
            ],
          ),
        ) ??
        false;
    if (!confirm || !mounted) return;

    setState(() => _unloadingSampleCatalog = true);
    try {
      final result =
          await _catalogService.unloadFixedSampleCatalog(userId: user.uid);
      if (!mounted) return;
      showAppNotice(
        context,
        'Beispielkatalog entladen: ${result.removed} entfernt.',
        type: AppNoticeType.success,
      );
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(e,
            fallback: 'Beispielkatalog konnte nicht entladen werden.'),
        type: AppNoticeType.error,
      );
    } finally {
      if (mounted) {
        setState(() => _unloadingSampleCatalog = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final theme = context.watch<ThemeProvider>();
    final uid = auth.user?.uid;

    return Scaffold(
      appBar: AppBar(title: const WorkShareAppBarTitle('WorkShare')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Konto',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: const Icon(Icons.person_outline),
              title: Text(auth.user?.displayName ?? 'Unbekannt'),
              subtitle: Text(auth.user?.email ?? '-'),
            ),
          ),
          if (auth.user != null && !(auth.user!.emailVerified))
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: OutlinedButton.icon(
                onPressed: () async {
                  final ok = await auth.resendVerificationEmail();
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        ok
                            ? 'Verifizierungs-E-Mail wurde gesendet.'
                            : (auth.error ??
                                'Verifizierungs-E-Mail fehlgeschlagen.'),
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.mark_email_read_outlined),
                label: const Text('Verifizierungs-E-Mail senden'),
              ),
            ),
          const SizedBox(height: 20),
          const Text('Team',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: const Icon(Icons.groups_outlined),
              title: const Text('Workgroups'),
              subtitle:
                  const Text('Gemeinsame Gruppe erstellen oder beitreten'),
              onTap: () {
                Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const WorkgroupsScreen()));
              },
            ),
          ),
          const SizedBox(height: 20),
          const Text('App-Einstellungen',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: SegmentedButton<ThemeMode>(
                segments: const [
                  ButtonSegment<ThemeMode>(
                    value: ThemeMode.system,
                    icon: Icon(Icons.settings_suggest_outlined),
                    label: Text('System'),
                  ),
                  ButtonSegment<ThemeMode>(
                    value: ThemeMode.light,
                    icon: Icon(Icons.light_mode_outlined),
                    label: Text('Hell'),
                  ),
                  ButtonSegment<ThemeMode>(
                    value: ThemeMode.dark,
                    icon: Icon(Icons.dark_mode_outlined),
                    label: Text('Dunkel'),
                  ),
                ],
                selected: {theme.themeMode},
                onSelectionChanged: (selection) =>
                    theme.setThemeMode(selection.first),
              ),
            ),
          ),
          const SizedBox(height: 20),
          const Text('System & Cloud',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Card(
            child: Column(
              children: [
                FutureBuilder<PackageInfo>(
                  future: _packageInfoFuture,
                  builder: (context, snapshot) {
                    final versionText = snapshot.hasData
                        ? '${snapshot.data!.version} (${snapshot.data!.buildNumber})'
                        : 'Lädt...';
                    return ListTile(
                      leading: const Icon(Icons.info_outline),
                      title: const Text('App-Version'),
                      subtitle: Text(versionText),
                    );
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  leading: _loadingSampleCatalog
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.playlist_add_check_outlined),
                  title: const Text('Beispielkatalog laden'),
                  subtitle: const Text('Feste Vorlage einmalig importieren'),
                  onTap: _loadingSampleCatalog ? null : _loadSampleCatalog,
                ),
                const Divider(height: 1),
                ListTile(
                  leading: _unloadingSampleCatalog
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.playlist_remove_outlined),
                  title: const Text('Beispielkatalog entladen'),
                  subtitle:
                      const Text('Nur importierte Beispiel-Einträge entfernen'),
                  onTap: _unloadingSampleCatalog ? null : _unloadSampleCatalog,
                ),
                const Divider(height: 1),
                if (uid == null)
                  const ListTile(
                    leading: Icon(Icons.cloud_off_outlined),
                    title: Text('Cloud-Status'),
                    subtitle: Text('Nicht angemeldet'),
                  )
                else
                  StreamBuilder(
                    stream: FirebaseService.users
                        .doc(uid)
                        .snapshots(includeMetadataChanges: true),
                    builder: (context, snapshot) {
                      String statusText = 'Prüfe Verbindung...';
                      IconData statusIcon = Icons.cloud_queue_outlined;
                      Color? statusColor;

                      if (snapshot.hasError) {
                        statusText = 'Nicht verbunden';
                        statusIcon = Icons.cloud_off_outlined;
                        statusColor = Colors.red;
                      } else if (snapshot.hasData) {
                        final meta = snapshot.data!.metadata;
                        if (meta.hasPendingWrites) {
                          statusText = 'Synchronisiert...';
                          statusIcon = Icons.cloud_sync_outlined;
                          statusColor = Colors.orange;
                        } else if (meta.isFromCache) {
                          statusText = 'Offline (Cache)';
                          statusIcon = Icons.cloud_off_outlined;
                          statusColor = Colors.orange;
                        } else {
                          statusText = 'Verbunden';
                          statusIcon = Icons.cloud_done_outlined;
                          statusColor = Colors.green;
                        }
                      }

                      return ListTile(
                        leading: Icon(statusIcon, color: statusColor),
                        title: const Text('Cloud-Status'),
                        subtitle: Text(statusText),
                      );
                    },
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.tonalIcon(
            onPressed: auth.logout,
            icon: const Icon(Icons.logout),
            label: const Text('Logout'),
          ),
          const SizedBox(height: 10),
          Center(
            child: Text(
              'Entwickler: Daniel Delfser',
              style: TextStyle(
                fontSize: 10,
                color: Theme.of(context)
                    .colorScheme
                    .onSurfaceVariant
                    .withValues(alpha: 0.8),
              ),
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}


