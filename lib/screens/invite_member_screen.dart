import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/enums.dart';
import '../models/project.dart';
import '../providers/auth_provider.dart';
import '../services/invitation_service.dart';
import '../utils/app_notice.dart';
import '../utils/error_mapper.dart';
import '../widgets/brand_logo.dart';

class InviteMemberScreen extends StatefulWidget {
  const InviteMemberScreen({super.key, required this.project});

  final Project project;

  @override
  State<InviteMemberScreen> createState() => _InviteMemberScreenState();
}

class _InviteMemberScreenState extends State<InviteMemberScreen> {
  final _service = InvitationService();
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  ProjectRole _role = ProjectRole.worker;
  bool _busy = false;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final user = context.read<AuthProvider>().user;
    if (user == null) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() => _busy = true);
    try {
      await _service.inviteByEmail(
        projectId: widget.project.id,
        projectName: widget.project.name,
        email: _emailController.text,
        role: _role,
        invitedBy: user.uid,
      );
      if (!mounted) return;
      Navigator.pop(context);
      showAppNotice(context, 'Einladung in der App gesendet.',
          type: AppNoticeType.success);
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        friendlyErrorMessage(
          e,
          fallback: 'Einladung konnte nicht gesendet werden.',
        ),
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
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        Navigator.of(context, rootNavigator: true).popUntil((r) => r.isFirst);
      });
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(title: const WorkShareAppBarTitle('WorkShare')),
      body: IgnorePointer(
        ignoring: _busy,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'Einladung wird direkt in der App zugestellt (keine Mail-App).',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            Form(
              key: _formKey,
              child: TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) => _submit(),
                decoration: const InputDecoration(
                  labelText: 'E-Mail',
                  hintText: 'name@firma.at',
                ),
                validator: (value) {
                  final email = value?.trim() ?? '';
                  if (email.isEmpty) return 'Bitte E-Mail eingeben.';
                  final valid =
                      RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email);
                  if (!valid) return 'Bitte gültige E-Mail eingeben.';
                  return null;
                },
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<ProjectRole>(
              initialValue: _role,
              decoration: const InputDecoration(labelText: 'Rolle'),
              items: const [
                DropdownMenuItem(
                  value: ProjectRole.admin,
                  child: Text('Admin'),
                ),
                DropdownMenuItem(
                  value: ProjectRole.worker,
                  child: Text('Worker'),
                ),
                DropdownMenuItem(
                  value: ProjectRole.viewer,
                  child: Text('Viewer (Nur lesen)'),
                ),
              ],
              onChanged: (value) =>
                  setState(() => _role = value ?? ProjectRole.worker),
            ),
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
                child: Center(child: CircularProgressIndicator()),
              ),
          ],
        ),
      ),
    );
  }
}
