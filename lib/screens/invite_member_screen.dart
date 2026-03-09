import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/enums.dart';
import '../models/project.dart';
import '../models/workgroup.dart';
import '../providers/auth_provider.dart';
import '../services/invitation_service.dart';
import '../services/workgroup_service.dart';
import '../utils/app_notice.dart';
import '../utils/error_mapper.dart';
import '../utils/validators.dart';
import '../widgets/brand_logo.dart';

class InviteMemberScreen extends StatefulWidget {
  const InviteMemberScreen({super.key, required this.project});

  final Project project;

  @override
  State<InviteMemberScreen> createState() => _InviteMemberScreenState();
}

class _InviteMemberScreenState extends State<InviteMemberScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _service = InvitationService();
  final _workgroupService = WorkgroupService();
  ProjectRole _role = ProjectRole.worker;
  int _mode = 0;
  String? _selectedWorkgroupId;
  bool _busy = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final user = context.read<AuthProvider>().user;
    if (user == null) return;

    setState(() => _busy = true);
    try {
      if (_mode == 0) {
        if (!_formKey.currentState!.validate()) return;
        final inviteEmail = _emailCtrl.text.trim().toLowerCase();
        await _service.inviteByEmail(
          projectId: widget.project.id,
          projectName: widget.project.name,
          email: inviteEmail,
          role: _role,
          invitedBy: user.uid,
        );
        final openMail = await showDialog<bool>(
              context: context,
              builder: (context) => AlertDialog(
                title: const Text('E-Mail senden?'),
                content: const Text('Soll zusaetzlich deine Mail-App mit Einladungstext geoeffnet werden?'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Nein')),
                  FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Ja')),
                ],
              ),
            ) ??
            false;
        if (openMail) {
          final uri = Uri(
            scheme: 'mailto',
            path: inviteEmail,
            queryParameters: {
              'subject': 'WorkShare Einladung: ${widget.project.name}',
              'body':
                  'Du wurdest in WorkShare zum Projekt \"${widget.project.name}\" eingeladen. Bitte in der App anmelden.',
            },
          );
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      } else {
        if (_selectedWorkgroupId == null || _selectedWorkgroupId!.isEmpty) {
          showAppNotice(context, 'Bitte Workgroup auswaehlen.', type: AppNoticeType.error);
          return;
        }
        final created = await _service.inviteWorkgroup(
          projectId: widget.project.id,
          projectName: widget.project.name,
          workgroupId: _selectedWorkgroupId!,
          invitedBy: user.uid,
          role: ProjectRole.owner,
        );
        if (!mounted) return;
        Navigator.pop(context);
        showAppNotice(
          context,
          created > 0
              ? 'Workgroup eingeladen ($created Mitglieder).'
              : 'Keine neuen Mitglieder aus der Workgroup einzuladen.',
          type: AppNoticeType.success,
        );
        return;
      }
      if (mounted) {
        Navigator.pop(context);
        showAppNotice(context, 'Einladung wurde gesendet.', type: AppNoticeType.success);
      }
    } catch (e) {
      showAppNotice(
        context,
        friendlyErrorMessage(e, fallback: 'Einladung konnte nicht gesendet werden.'),
        type: AppNoticeType.error,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    if (user == null) {
      return const SizedBox.shrink();
    }

    return Scaffold(
      appBar: AppBar(title: const WorkShareAppBarTitle('WorkShare')),
      body: IgnorePointer(
        ignoring: _busy,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              children: [
                SegmentedButton<int>(
                  segments: const [
                    ButtonSegment<int>(value: 0, label: Text('Einzeln')),
                    ButtonSegment<int>(value: 1, label: Text('Workgroup')),
                  ],
                  selected: {_mode},
                  onSelectionChanged: (v) {
                    setState(() => _mode = v.first);
                  },
                ),
                const SizedBox(height: 12),
                if (_mode == 0) ...[
                  TextFormField(
                    controller: _emailCtrl,
                    decoration: const InputDecoration(labelText: 'E-Mail'),
                    validator: Validators.email,
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<ProjectRole>(
                    value: _role,
                    decoration: const InputDecoration(labelText: 'Rolle'),
                    items: ProjectRole.values
                        .where((role) => role != ProjectRole.owner)
                        .map((role) => DropdownMenuItem(value: role, child: Text(role.name)))
                        .toList(),
                    onChanged: (value) {
                      if (value != null) {
                        setState(() => _role = value);
                      }
                    },
                  ),
                ] else ...[
                  StreamBuilder<List<Workgroup>>(
                    stream: _workgroupService.streamUserManageableWorkgroups(user.uid),
                    builder: (context, snapshot) {
                      final groups = snapshot.data ?? const <Workgroup>[];
                      return DropdownButtonFormField<String>(
                        value: _selectedWorkgroupId,
                        decoration: const InputDecoration(labelText: 'Workgroup'),
                        items: groups
                            .map((g) => DropdownMenuItem<String>(value: g.id, child: Text(g.name)))
                            .toList(),
                        onChanged: (value) => setState(() => _selectedWorkgroupId = value),
                      );
                    },
                  ),
                  const SizedBox(height: 8),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Alle Mitglieder der Workgroup werden als owner eingeladen.',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _submit,
                    child: const Text('Einladung senden'),
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
        ),
      ),
    );
  }
}

