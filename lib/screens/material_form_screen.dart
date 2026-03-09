import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/catalog_entry.dart';
import '../models/material_item.dart';
import '../models/project.dart';
import '../providers/auth_provider.dart';
import '../services/catalog_service.dart';
import '../services/material_service.dart';
import '../utils/app_notice.dart';
import '../utils/error_mapper.dart';
import '../utils/validators.dart';
import '../widgets/brand_logo.dart';

class MaterialFormScreen extends StatefulWidget {
  const MaterialFormScreen({super.key, required this.project, this.material});

  final Project project;
  final MaterialItem? material;

  @override
  State<MaterialFormScreen> createState() => _MaterialFormScreenState();
}

class _MaterialFormScreenState extends State<MaterialFormScreen> {
  static const _units = ['stk', 'm', 'cm', 'pkg', 'set'];

  final _formKey = GlobalKey<FormState>();
  final _materialService = MaterialService();
  final _catalogService = CatalogService();

  late final TextEditingController _nameCtrl;
  late final TextEditingController _quantityCtrl;
  final FocusNode _quantityFocus = FocusNode();

  Timer? _debounce;
  List<CatalogEntry> _suggestions = [];
  int _searchToken = 0;
  bool _busy = false;
  bool _suppressNameListener = false;
  bool _willMergeExisting = false;
  String? _catalogEntryId;
  String? _selectedCatalogNameLower;
  late String _selectedUnit;

  bool get _isEdit => widget.material != null;

  String _formatNumber(double value) {
    if (value == value.roundToDouble()) {
      return value.toInt().toString();
    }
    return value.toStringAsFixed(2).replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '');
  }

  @override
  void initState() {
    super.initState();
    final material = widget.material;
    _nameCtrl = TextEditingController(text: material?.name ?? '');
    _quantityCtrl = TextEditingController(text: material == null ? '' : _formatNumber(material.quantity));
    _selectedUnit = _units.contains(material?.unit) ? material!.unit : 'stk';
    _catalogEntryId = material?.catalogEntryId;
    _selectedCatalogNameLower = material?.name.trim().toLowerCase();
    _nameCtrl.addListener(_onNameChanged);
    if (!_isEdit) {
      _refreshMergeHint();
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _nameCtrl.dispose();
    _quantityCtrl.dispose();
    _quantityFocus.dispose();
    super.dispose();
  }

  void _onNameChanged() {
    if (_suppressNameListener) return;

    final current = _nameCtrl.text.trim();
    final currentLower = current.toLowerCase();

    if (_selectedCatalogNameLower != null && currentLower == _selectedCatalogNameLower) {
      if (_suggestions.isNotEmpty && mounted) {
        setState(() => _suggestions = []);
      }
      return;
    }

    if (_catalogEntryId != null && currentLower != _selectedCatalogNameLower) {
      _catalogEntryId = null;
      _selectedCatalogNameLower = null;
    }

    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () async {
      final text = _nameCtrl.text.trim();
      if (text.isEmpty) {
        if (mounted) {
          setState(() {
            _suggestions = [];
            _willMergeExisting = false;
          });
        }
        return;
      }
      final token = ++_searchToken;
      try {
        final user = context.read<AuthProvider>().user;
        if (user == null) return;
        final hits = await _catalogService.searchByPrefixForProject(
          prefix: text,
          userId: user.uid,
          projectWorkgroupId: widget.project.workgroupId,
        );
        final willMerge = !_isEdit
            ? await _materialService.willMergeOnAdd(
                projectId: widget.project.id,
                name: text,
                unit: _selectedUnit,
                catalogEntryId: _catalogEntryId,
              )
            : false;
        if (mounted && token == _searchToken) {
          setState(() {
            _suggestions = hits;
            _willMergeExisting = willMerge;
          });
        }
      } catch (e) {
        showAppNotice(
          context,
          friendlyErrorMessage(e, fallback: 'Katalogsuche nicht verfuegbar.'),
          type: AppNoticeType.error,
        );
      }
    });
  }

  void _selectCatalog(CatalogEntry entry) {
    _searchToken++;
    _suppressNameListener = true;
    setState(() {
      _nameCtrl.text = entry.name;
      _selectedUnit = _units.contains(entry.unit) ? entry.unit : _selectedUnit;
      _catalogEntryId = entry.id;
      _selectedCatalogNameLower = entry.name.trim().toLowerCase();
      _suggestions = [];
    });
    _suppressNameListener = false;
    _refreshMergeHint();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _quantityFocus.requestFocus();
      _quantityCtrl.selection = TextSelection(baseOffset: 0, extentOffset: _quantityCtrl.text.length);
    });
  }

  Future<void> _refreshMergeHint() async {
    if (_isEdit) return;
    final text = _nameCtrl.text.trim();
    if (text.isEmpty) {
      if (mounted) setState(() => _willMergeExisting = false);
      return;
    }
    try {
      final willMerge = await _materialService.willMergeOnAdd(
        projectId: widget.project.id,
        name: text,
        unit: _selectedUnit,
        catalogEntryId: _catalogEntryId,
      );
      if (mounted) {
        setState(() => _willMergeExisting = willMerge);
      }
    } catch (_) {
      if (mounted) setState(() => _willMergeExisting = false);
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final user = context.read<AuthProvider>().user;
    if (user == null) return;

    setState(() => _busy = true);
    try {
      final quantity = double.parse(_quantityCtrl.text.replaceAll(',', '.'));
      var queuedOffline = false;
      if (_isEdit) {
        await _materialService
            .updateMaterial(
              materialId: widget.material!.id,
              name: _nameCtrl.text.trim(),
              quantity: quantity,
              unit: _selectedUnit,
              catalogEntryId: _catalogEntryId,
            )
            .timeout(
              const Duration(milliseconds: 1200),
              onTimeout: () {
                queuedOffline = true;
              },
            );
      } else {
        var merged = false;
        merged = await _materialService
            .addMaterial(
              projectId: widget.project.id,
              name: _nameCtrl.text.trim(),
              quantity: quantity,
              unit: _selectedUnit,
              catalogEntryId: _catalogEntryId,
              createdBy: user.uid,
            )
            .timeout(
              const Duration(milliseconds: 1200),
              onTimeout: () {
                queuedOffline = true;
                return false;
              },
            );
        if (mounted) {
          Navigator.pop(context);
          showAppNotice(
            context,
            queuedOffline
                ? 'Offline gespeichert. Sync folgt automatisch.'
                : merged
                ? 'Material existiert bereits, Menge wurde addiert.'
                : 'Material wurde hinzugefuegt.',
            type: AppNoticeType.success,
          );
          return;
        }
      }
      if (mounted) {
        Navigator.pop(context);
        showAppNotice(
          context,
          queuedOffline ? 'Offline gespeichert. Sync folgt automatisch.' : 'Material wurde aktualisiert.',
          type: AppNoticeType.success,
        );
      }
    } catch (e) {
      showAppNotice(
        context,
        friendlyErrorMessage(e, fallback: 'Material konnte nicht gespeichert werden.'),
        type: AppNoticeType.error,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const WorkShareAppBarTitle('WorkShare')),
      body: IgnorePointer(
        ignoring: _busy,
        child: ListView(
          padding: const EdgeInsets.all(14),
          children: [
            Form(
              key: _formKey,
              child: Column(
                children: [
                  _SectionCard(
                    title: 'Materialinformationen',
                    child: Column(
                      children: [
                        TextFormField(
                          controller: _nameCtrl,
                          decoration: const InputDecoration(labelText: 'Name'),
                          validator: (v) => Validators.requiredText(v, label: 'Name'),
                        ),
                        if (_suggestions.isNotEmpty)
                          Container(
                            margin: const EdgeInsets.only(top: 8),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF4F6FA),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Column(
                              children: _suggestions
                                  .map(
                                    (entry) => ListTile(
                                      title: Text(entry.name),
                                      subtitle: Text(entry.unit),
                                      onTap: () => _selectCatalog(entry),
                                    ),
                                  )
                                  .toList(),
                            ),
                          ),
                        if (!_isEdit && _willMergeExisting)
                          Container(
                            width: double.infinity,
                            margin: const EdgeInsets.only(top: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            decoration: BoxDecoration(
                              color: const Color(0xFFEAF2FF),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              'Material existiert bereits. Beim Speichern wird die Menge addiert.',
                              style: TextStyle(fontSize: 12),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  _SectionCard(
                    title: 'Details',
                    child: Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _quantityCtrl,
                            focusNode: _quantityFocus,
                            decoration: const InputDecoration(labelText: 'Menge'),
                            validator: (v) => Validators.positiveNumber(v, label: 'Menge'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            value: _selectedUnit,
                            decoration: const InputDecoration(labelText: 'Einheit'),
                            items: _units
                                .map((u) => DropdownMenuItem<String>(value: u, child: Text(u)))
                                .toList(),
                            onChanged: (value) async {
                              if (value == null) return;
                              setState(() => _selectedUnit = value);
                              await _refreshMergeHint();
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton(onPressed: _save, child: const Text('speichern')),
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
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w500)),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}
