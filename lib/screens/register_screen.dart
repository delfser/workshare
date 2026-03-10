import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../utils/app_notice.dart';
import '../utils/validators.dart';
import '../widgets/brand_logo.dart';
import '../widgets/loading_overlay.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit(AuthProvider auth) async {
    if (!_formKey.currentState!.validate()) return;
    final ok = await auth.register(
        _emailCtrl.text, _passwordCtrl.text, _nameCtrl.text);
    if (!mounted) return;

    if (ok) {
      showAppNotice(
        context,
        'Registrierung erfolgreich. Verifizierungs-E-Mail wurde gesendet.',
        type: AppNoticeType.success,
      );
      if (Navigator.of(context).canPop()) {
        Navigator.pop(context);
      }
    } else {
      showAppNotice(context, auth.error ?? 'Registrierung fehlgeschlagen.',
          type: AppNoticeType.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final keyboardInset = MediaQuery.of(context).viewInsets.bottom;
    return Consumer<AuthProvider>(
      builder: (context, auth, _) {
        return LoadingOverlay(
          loading: auth.isLoading,
          child: Scaffold(
            appBar: AppBar(
                title: const WorkShareAppBarTitle('WorkShare Registrierung')),
            body: SafeArea(
              child: Form(
                key: _formKey,
                child: ListView(
                  padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + keyboardInset),
                  children: [
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.only(bottom: 18),
                        child: WorkShareLogo(size: 110),
                      ),
                    ),
                    TextFormField(
                      controller: _nameCtrl,
                      decoration: const InputDecoration(labelText: 'Name'),
                      validator: (v) =>
                          Validators.requiredText(v, label: 'Name'),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _emailCtrl,
                      decoration: const InputDecoration(labelText: 'E-Mail'),
                      validator: Validators.email,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _passwordCtrl,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Passwort'),
                      validator: (v) {
                        if (v == null || v.length < 6) {
                          return 'Mindestens 6 Zeichen';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: () => _submit(auth),
                        child: const Text('Registrieren'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
