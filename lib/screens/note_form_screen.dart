import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

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
  final stt.SpeechToText _speech = stt.SpeechToText();
  bool _busy = false;
  bool _speechReady = false;
  bool _isListening = false;
  String _speechBaseText = '';

  bool get _isEdit => widget.note != null;

  @override
  void initState() {
    super.initState();
    _textCtrl.text = widget.note?.text ?? '';
    unawaited(_initSpeech());
  }

  @override
  void dispose() {
    _speech.stop();
    _textCtrl.dispose();
    super.dispose();
  }

  Future<void> _initSpeech() async {
    final ready = await _speech.initialize(
      onStatus: (status) {
        if (!mounted) return;
        final listening = status == 'listening';
        if (_isListening != listening) {
          setState(() => _isListening = listening);
        }
      },
      onError: (_) {
        if (!mounted) return;
        setState(() => _isListening = false);
      },
    );
    if (!mounted) return;
    setState(() => _speechReady = ready);
  }

  Future<void> _toggleSpeech() async {
    if (_busy) return;

    if (_isListening) {
      await _speech.stop();
      if (!mounted) return;
      setState(() => _isListening = false);
      return;
    }

    if (!_speechReady) {
      await _initSpeech();
      if (!_speechReady) {
        if (!mounted) return;
        showAppNotice(
          context,
          'Spracheingabe ist auf diesem Geraet nicht verfuegbar.',
          type: AppNoticeType.error,
        );
        return;
      }
    }

    _speechBaseText = _textCtrl.text.trim();
    final started = await _speech.listen(
      localeId: 'de_DE',
      listenOptions: stt.SpeechListenOptions(
        listenMode: stt.ListenMode.dictation,
        partialResults: true,
      ),
      onResult: (result) {
        if (!mounted) return;
        final words = result.recognizedWords.trim();
        final merged = words.isEmpty
            ? _speechBaseText
            : (_speechBaseText.isEmpty ? words : '$_speechBaseText $words');
        _textCtrl.text = merged;
        _textCtrl.selection = TextSelection.fromPosition(
          TextPosition(offset: _textCtrl.text.length),
        );
      },
    );

    if (!mounted) return;
    setState(() => _isListening = started);
    if (!started) {
      showAppNotice(
        context,
        'Mikrofon konnte nicht gestartet werden.',
        type: AppNoticeType.error,
      );
    }
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
                      decoration: InputDecoration(
                        labelText: 'Notiz',
                        suffixIcon: IconButton(
                          tooltip: _isListening
                              ? 'Spracheingabe stoppen'
                              : 'Spracheingabe starten',
                          onPressed: _busy ? null : _toggleSpeech,
                          icon: Icon(
                            _isListening ? Icons.mic : Icons.mic_none_outlined,
                            color: _isListening
                                ? Theme.of(context).colorScheme.primary
                                : null,
                          ),
                        ),
                      ),
                      validator: (v) =>
                          Validators.requiredText(v, label: 'Notiz'),
                    ),
                    if (_isListening)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text(
                            'Spracheingabe aktiv...',
                            style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                          ),
                        ),
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
