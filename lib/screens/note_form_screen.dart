import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/project.dart';
import '../models/project_note.dart';
import '../providers/auth_provider.dart';
import '../services/project_note_service.dart';
import '../utils/app_notice.dart';
import '../utils/error_mapper.dart';
import '../utils/validators.dart';

class NoteFormScreen extends StatefulWidget {
  const NoteFormScreen({
    super.key,
    required this.project,
    this.note,
  });

  final Project project;
  final ProjectNote? note;

  @override
  State<NoteFormScreen> createState() => _NoteFormScreenState();
}

class _NoteFormScreenState extends State<NoteFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _textCtrl = TextEditingController();
  final _service = ProjectNoteService();
  bool _busy = false;

  bool get _isEdit => widget.note != null;

  @override
  void initState() {
    super.initState();
    _textCtrl.text = widget.note?.text ?? '';
  }

  @override
  void dispose() {
    _textCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final user = context.read<AuthProvider>().user;
    if (user == null) return;

    setState(() => _busy = true);
    try {
      var queuedOffline = false;
      final future = _isEdit
          ? _service.updateNote(
              noteId: widget.note!.id,
              text: _textCtrl.text.trim(),
            )
          : _service.addNote(
              projectId: widget.project.id,
              text: _textCtrl.text.trim(),
              createdBy: user.uid,
              type: 'note',
            );
      await future.timeout(
        const Duration(milliseconds: 1200),
        onTimeout: () {
          queuedOffline = true;
        },
      );
      if (!mounted) return;
      Navigator.pop(context);
      showAppNotice(
        context,
        queuedOffline
            ? 'Offline gespeichert. Sync folgt automatisch.'
            : (_isEdit ? 'Notiz aktualisiert.' : 'Notiz gespeichert.'),
        type: AppNoticeType.success,
      );
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(e,
            fallback: _isEdit
                ? 'Notiz konnte nicht aktualisiert werden.'
                : 'Notiz konnte nicht gespeichert werden.'),
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
        title: Text(_isEdit ? 'Notiz bearbeiten' : 'Notiz hinzufuegen'),
      ),
      body: IgnorePointer(
        ignoring: _busy,
        child: ListView(
          padding: const EdgeInsets.all(14),
          children: [
            Form(
              key: _formKey,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .surfaceContainerHighest
                      .withValues(
                        alpha: Theme.of(context).brightness == Brightness.dark
                            ? 0.22
                            : 0.45,
                      ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  children: [
                    TextFormField(
                      controller: _textCtrl,
                      minLines: 3,
                      maxLines: 8,
                      decoration: const InputDecoration(labelText: 'Notiz'),
                      validator: (v) =>
                          Validators.requiredText(v, label: 'Notiz'),
                    ),
                    const SizedBox(height: 16),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.icon(
                        onPressed: _save,
                        icon: const Icon(Icons.save_outlined),
                        label: const Text('Speichern'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
