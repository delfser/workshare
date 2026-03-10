import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/project.dart';
import '../providers/auth_provider.dart';
import '../services/work_log_service.dart';
import '../utils/app_notice.dart';
import '../utils/error_mapper.dart';
import '../utils/validators.dart';

class WorkLogFormScreen extends StatefulWidget {
  const WorkLogFormScreen({super.key, required this.project});

  final Project project;

  @override
  State<WorkLogFormScreen> createState() => _WorkLogFormScreenState();
}

class _WorkLogFormScreenState extends State<WorkLogFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _hoursCtrl = TextEditingController();
  final _workerCtrl = TextEditingController();
  final _service = WorkLogService();
  bool _busy = false;

  @override
  void dispose() {
    _hoursCtrl.dispose();
    _workerCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final user = context.read<AuthProvider>().user;
    if (user == null) return;

    final hours = double.tryParse(_hoursCtrl.text.replaceAll(',', '.'));
    if (hours == null || hours <= 0) {
      showAppNotice(context, 'Bitte gueltige Stunden eingeben.',
          type: AppNoticeType.error);
      return;
    }

    setState(() => _busy = true);
    try {
      var queuedOffline = false;
      await _service
          .addWorkLog(
        projectId: widget.project.id,
        hours: hours,
        worker: _workerCtrl.text.trim(),
        createdBy: user.uid,
      )
          .timeout(
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
            : 'Arbeitszeit gespeichert.',
        type: AppNoticeType.success,
      );
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(e,
            fallback: 'Arbeitszeit konnte nicht gespeichert werden.'),
        type: AppNoticeType.error,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Arbeitszeit hinzufuegen')),
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
                      controller: _hoursCtrl,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(labelText: 'Stunden'),
                      validator: (v) =>
                          Validators.positiveNumber(v, label: 'Stunden'),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _workerCtrl,
                      decoration: const InputDecoration(labelText: 'Arbeiter'),
                      validator: (v) =>
                          Validators.requiredText(v, label: 'Arbeiter'),
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
