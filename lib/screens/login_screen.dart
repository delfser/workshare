import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../utils/app_notice.dart';
import '../utils/validators.dart';
import '../widgets/brand_logo.dart';
import '../widgets/loading_overlay.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit(AuthProvider auth) async {
    if (!_formKey.currentState!.validate()) return;
    final ok = await auth.login(_emailCtrl.text, _passwordCtrl.text);
    if (!mounted) return;

    if (ok) {
      showAppNotice(context, 'Login erfolgreich. Willkommen bei WorkShare.', type: AppNoticeType.success);
    } else {
      showAppNotice(context, auth.error ?? 'Login fehlgeschlagen.', type: AppNoticeType.error);
    }
  }

  Future<void> _forgotPassword(AuthProvider auth) async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) {
      showAppNotice(
        context,
        'Bitte zuerst deine E-Mail im Feld eingeben.',
        type: AppNoticeType.info,
      );
      return;
    }
    final ok = await auth.sendPasswordResetEmail(email);
    if (!mounted) return;
    if (ok) {
      showAppNotice(
        context,
        'Reset-Link wurde an deine E-Mail gesendet.',
        type: AppNoticeType.success,
      );
    } else {
      showAppNotice(context, auth.error ?? 'Reset-E-Mail fehlgeschlagen.', type: AppNoticeType.error);
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
            appBar: AppBar(title: const WorkShareAppBarTitle('WorkShare Login')),
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
                      controller: _emailCtrl,
                      decoration: const InputDecoration(labelText: 'E-Mail'),
                      validator: Validators.email,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _passwordCtrl,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Passwort'),
                      validator: (v) => Validators.requiredText(v, label: 'Passwort'),
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: () => _submit(auth),
                        child: const Text('Einloggen'),
                      ),
                    ),
                    TextButton(
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const RegisterScreen()),
                        );
                      },
                      child: const Text('Neu registrieren'),
                    ),
                    TextButton(
                      onPressed: () => _forgotPassword(auth),
                      child: const Text('Passwort vergessen?'),
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

