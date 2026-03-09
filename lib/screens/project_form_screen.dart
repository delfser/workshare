import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/project.dart';
import '../providers/auth_provider.dart';
import '../services/project_service.dart';
import '../utils/app_notice.dart';
import '../utils/error_mapper.dart';
import '../utils/validators.dart';
import '../widgets/brand_logo.dart';

class ProjectFormScreen extends StatefulWidget {
  const ProjectFormScreen({super.key, this.project});

  final Project? project;

  @override
  State<ProjectFormScreen> createState() => _ProjectFormScreenState();
}

class _ProjectFormScreenState extends State<ProjectFormScreen> {
  final _service = ProjectService();
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameCtrl;
  late final TextEditingController _descCtrl;
  bool _busy = false;

  bool get _isEdit => widget.project != null;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.project?.name ?? '');
    _descCtrl = TextEditingController(text: widget.project?.description ?? '');
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final user = context.read<AuthProvider>().user;
    if (user == null) return;

    setState(() => _busy = true);
    try {
      var queuedOffline = false;
      if (_isEdit) {
        await _service
            .updateProject(
              projectId: widget.project!.id,
              name: _nameCtrl.text,
              description: _descCtrl.text,
            )
            .timeout(
              const Duration(milliseconds: 1200),
              onTimeout: () {
                queuedOffline = true;
              },
            );
      } else {
        await _service
            .createProject(
              ownerId: user.uid,
              ownerEmail: user.email ?? '',
              name: _nameCtrl.text,
              description: _descCtrl.text,
            )
            .timeout(
              const Duration(milliseconds: 1200),
              onTimeout: () {
                queuedOffline = true;
              },
            );
      }

      if (mounted) {
        Navigator.pop(context);
        showAppNotice(
          context,
          queuedOffline
              ? 'Offline gespeichert. Sync folgt automatisch.'
              : (_isEdit ? 'Projekt wurde aktualisiert.' : 'Projekt wurde erstellt.'),
          type: AppNoticeType.success,
        );
      }
    } catch (e) {
      showAppNotice(
        context,
        friendlyErrorMessage(e, fallback: 'Projekt konnte nicht gespeichert werden.'),
        type: AppNoticeType.error,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    if (!_isEdit) return;
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Projekt loeschen?'),
            content: const Text('Alle Material- und Mitgliedsdaten werden geloescht.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Abbrechen')),
              FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Loeschen')),
            ],
          ),
        ) ??
        false;
    if (!confirmed) return;

    setState(() => _busy = true);
    try {
      await _service.deleteProject(widget.project!.id);
      if (mounted) {
        Navigator.pop(context);
        showAppNotice(context, 'Projekt wurde geloescht.', type: AppNoticeType.success);
      }
    } on TimeoutException {
      showAppNotice(context, 'Loeschen dauert zu lange. Bitte erneut versuchen.', type: AppNoticeType.error);
    } catch (e) {
      showAppNotice(
        context,
        friendlyErrorMessage(e, fallback: 'Projekt konnte nicht geloescht werden.'),
        type: AppNoticeType.error,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const WorkShareAppBarTitle('WorkShare'),
        actions: [
          if (_isEdit)
            IconButton(
              onPressed: _busy ? null : _delete,
              icon: const Icon(Icons.delete_outline),
            ),
        ],
      ),
      body: IgnorePointer(
        ignoring: _busy,
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Form(
                key: _formKey,
                child: Column(
                  children: [
                    TextFormField(
                      controller: _nameCtrl,
                      decoration: const InputDecoration(labelText: 'Projektname'),
                      validator: (v) => Validators.requiredText(v, label: 'Projektname'),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _descCtrl,
                      maxLines: 3,
                      decoration: const InputDecoration(labelText: 'Beschreibung (optional)'),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _save,
                        child: Text(_isEdit ? 'Speichern' : 'Erstellen'),
                      ),
                    ),
                    if (_busy)
                      const Padding(
                        padding: EdgeInsets.only(top: 12),
                        child: CircularProgressIndicator(),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
