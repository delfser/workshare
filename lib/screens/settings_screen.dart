import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../providers/theme_provider.dart';
import '../services/firebase_service.dart';
import '../widgets/brand_logo.dart';
import 'workgroups_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final Future<PackageInfo> _packageInfoFuture;

  @override
  void initState() {
    super.initState();
    _packageInfoFuture = PackageInfo.fromPlatform();
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
          const Text('Konto', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
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
                            : (auth.error ?? 'Verifizierungs-E-Mail fehlgeschlagen.'),
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.mark_email_read_outlined),
                label: const Text('Verifizierungs-E-Mail senden'),
              ),
            ),
          const SizedBox(height: 20),
          const Text('Team', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: const Icon(Icons.groups_outlined),
              title: const Text('Workgroups'),
              subtitle: const Text('Gemeinsame Gruppe erstellen oder beitreten'),
              onTap: () {
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const WorkgroupsScreen()));
              },
            ),
          ),
          const SizedBox(height: 20),
          const Text('App-Einstellungen', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          RadioListTile<ThemeMode>(
            value: ThemeMode.system,
            groupValue: theme.themeMode,
            title: const Text('Systemmodus'),
            onChanged: (value) {
              if (value != null) theme.setThemeMode(value);
            },
          ),
          RadioListTile<ThemeMode>(
            value: ThemeMode.light,
            groupValue: theme.themeMode,
            title: const Text('Light Mode'),
            onChanged: (value) {
              if (value != null) theme.setThemeMode(value);
            },
          ),
          RadioListTile<ThemeMode>(
            value: ThemeMode.dark,
            groupValue: theme.themeMode,
            title: const Text('Dark Mode'),
            onChanged: (value) {
              if (value != null) theme.setThemeMode(value);
            },
          ),
          const SizedBox(height: 20),
          const Text('System & Cloud', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Card(
            child: Column(
              children: [
                FutureBuilder<PackageInfo>(
                  future: _packageInfoFuture,
                  builder: (context, snapshot) {
                    final versionText = snapshot.hasData
                        ? '${snapshot.data!.version}+${snapshot.data!.buildNumber}'
                        : 'Laedt...';
                    return ListTile(
                      leading: const Icon(Icons.info_outline),
                      title: const Text('App-Version'),
                      subtitle: Text(versionText),
                    );
                  },
                ),
                const Divider(height: 1),
                const ListTile(
                  leading: Icon(Icons.code_outlined),
                  title: Text('Entwickler'),
                  subtitle: Text('Daniel Delfser'),
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
                      String statusText = 'Pruefe Verbindung...';
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
        ],
      ),
    );
  }
}
