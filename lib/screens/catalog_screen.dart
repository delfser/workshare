import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../services/catalog_service.dart';
import '../widgets/brand_logo.dart';
import 'catalog_entry_form_screen.dart';

class CatalogScreen extends StatelessWidget {
  const CatalogScreen({super.key});

  Future<void> _deleteEntry(
    BuildContext context, {
    required CatalogService service,
    required String entryId,
    required String entryName,
  }) async {
    final confirm = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Eintrag loeschen?'),
            content: Text('Soll "$entryName" wirklich geloescht werden?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(false),
                child: const Text('Abbrechen'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(dialogContext).pop(true),
                child: const Text('Loeschen'),
              ),
            ],
          ),
        ) ??
        false;
    if (!confirm) return;

    try {
      await service.deleteEntry(entryId);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Katalogeintrag geloescht.')),
      );
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Katalogeintrag konnte nicht geloescht werden.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final service = CatalogService();
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      appBar: AppBar(title: const WorkShareAppBarTitle('WorkShare')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          if (user == null) return;
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const CatalogEntryFormScreen()),
          );
        },
        icon: const Icon(Icons.add),
        label: const Text('Eintrag'),
      ),
      body: StreamBuilder(
        stream: user == null ? const Stream.empty() : service.streamCatalogForUser(user.uid),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return const Center(child: Text('Katalog konnte nicht geladen werden.'));
          }
          final entries = snapshot.data ?? const [];
          if (entries.isEmpty) {
            return const Center(child: Text('Katalog ist leer.'));
          }

          return ListView.builder(
            itemCount: entries.length,
            itemBuilder: (context, index) {
              final e = entries[index];
              return ListTile(
                title: Text(e.name),
                subtitle: Text('${e.unit}${e.category != null ? ' - ${e.category}' : ''}'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.edit_outlined),
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => CatalogEntryFormScreen(entry: e)),
                        );
                      },
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () => _deleteEntry(
                        context,
                        service: service,
                        entryId: e.id,
                        entryName: e.name,
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
