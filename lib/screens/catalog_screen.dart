import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../services/catalog_service.dart';
import '../widgets/brand_logo.dart';
import 'catalog_entry_form_screen.dart';

class CatalogScreen extends StatelessWidget {
  const CatalogScreen({super.key});

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
                trailing: IconButton(
                  icon: const Icon(Icons.edit_outlined),
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => CatalogEntryFormScreen(entry: e)),
                    );
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}
