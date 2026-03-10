import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/catalog_entry.dart';
import '../providers/auth_provider.dart';
import '../services/catalog_service.dart';
import '../utils/app_notice.dart';
import '../utils/error_mapper.dart';
import '../utils/validators.dart';

class CatalogEntryFormScreen extends StatefulWidget {
  const CatalogEntryFormScreen({super.key, this.entry});

  final CatalogEntry? entry;

  @override
  State<CatalogEntryFormScreen> createState() => _CatalogEntryFormScreenState();
}

class _CatalogEntryFormScreenState extends State<CatalogEntryFormScreen> {
  static const _units = ['stk', 'm', 'cm', 'pkg', 'set'];

  final _formKey = GlobalKey<FormState>();
  final _service = CatalogService();

  late final TextEditingController _nameCtrl;
  late final TextEditingController _categoryCtrl;
  late String _selectedUnit;
  bool _isActive = true;
  bool _busy = false;

  bool get _isEdit => widget.entry != null;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.entry?.name ?? '');
    _categoryCtrl = TextEditingController(text: widget.entry?.category ?? '');
    _selectedUnit =
        _units.contains(widget.entry?.unit) ? widget.entry!.unit : 'stk';
    _isActive = widget.entry?.isActive ?? true;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _categoryCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final user = context.read<AuthProvider>().user;
    if (user == null) return;

    setState(() => _busy = true);
    try {
      if (_isEdit) {
        await _service.updateEntry(
          entryId: widget.entry!.id,
          name: _nameCtrl.text,
          unit: _selectedUnit,
          category: _categoryCtrl.text,
          isActive: _isActive,
        );
      } else {
        final defaultWorkgroupId =
            await _service.getDefaultWorkgroupIdForUser(user.uid);
        await _service.createEntry(
          name: _nameCtrl.text,
          unit: _selectedUnit,
          category: _categoryCtrl.text,
          createdBy: user.uid,
          workgroupId: defaultWorkgroupId,
        );
      }
      if (mounted) {
        Navigator.pop(context);
        showAppNotice(
          context,
          _isEdit
              ? 'Katalogeintrag wurde aktualisiert.'
              : 'Katalogeintrag wurde erstellt.',
          type: AppNoticeType.success,
        );
      }
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(e,
            fallback: 'Katalogeintrag konnte nicht gespeichert werden.'),
        type: AppNoticeType.error,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    if (!_isEdit) return;
    setState(() => _busy = true);
    try {
      await _service.deleteEntry(widget.entry!.id);
      if (mounted) {
        Navigator.pop(context);
        showAppNotice(context, 'Katalogeintrag wurde gelöscht.',
            type: AppNoticeType.success);
      }
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(e,
            fallback: 'Katalogeintrag konnte nicht gelöscht werden.'),
        type: AppNoticeType.error,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final keyboardInset = MediaQuery.of(context).viewInsets.bottom;

    return Scaffold(
      appBar: AppBar(
        title: Text(
            _isEdit ? 'Katalogeintrag bearbeiten' : 'Katalogeintrag anlegen'),
        actions: [
          if (_isEdit)
            IconButton(
                onPressed: _busy ? null : _delete,
                icon: const Icon(Icons.delete_outline)),
        ],
      ),
      body: IgnorePointer(
        ignoring: _busy,
        child: SafeArea(
          child: Form(
            key: _formKey,
            child: ListView(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + keyboardInset),
              children: [
                TextFormField(
                  controller: _nameCtrl,
                  decoration: const InputDecoration(labelText: 'Name'),
                  validator: (v) => Validators.requiredText(v, label: 'Name'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _selectedUnit,
                  decoration:
                      const InputDecoration(labelText: 'Standard-Einheit'),
                  items: _units
                      .map((u) =>
                          DropdownMenuItem<String>(value: u, child: Text(u)))
                      .toList(),
                  onChanged: (value) {
                    if (value != null) setState(() => _selectedUnit = value);
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _categoryCtrl,
                  decoration:
                      const InputDecoration(labelText: 'Kategorie (optional)'),
                ),
                const SizedBox(height: 8),
                SwitchListTile(
                  value: _isActive,
                  onChanged: (v) => setState(() => _isActive = v),
                  title: const Text('Aktiv'),
                  contentPadding: EdgeInsets.zero,
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _save,
                    child: Text(_isEdit ? 'Speichern' : 'Anlegen'),
                  ),
                ),
                if (_busy)
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: Center(child: CircularProgressIndicator()),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
