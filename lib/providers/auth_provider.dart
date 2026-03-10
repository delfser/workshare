import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/auth_service.dart';
import '../services/invitation_service.dart';
import '../services/notification_service.dart';

class AuthProvider extends ChangeNotifier {
  AuthProvider(
    this._authService,
    this._invitationService,
    this._notificationService,
  ) {
    _sub = _authService.authStateChanges().listen(_onAuthChanged);
  }

  final AuthService _authService;
  final InvitationService _invitationService;
  final NotificationService _notificationService;

  static const _notificationCleanupLastRunKey =
      'notification_cleanup_last_run_ms';

  StreamSubscription<User?>? _sub;
  StreamSubscription<int>? _pendingInvitationsSub;
  Timer? _sessionGuardTimer;
  User? _user;
  bool _loading = false;
  String? _error;

  User? get user => _user;
  bool get isLoggedIn => _user != null;
  bool get isLoading => _loading;
  String? get error => _error;

  Future<void> _onAuthChanged(User? user) async {
    _sessionGuardTimer?.cancel();
    _sessionGuardTimer = null;
    await _pendingInvitationsSub?.cancel();
    _pendingInvitationsSub = null;
    _user = user;
    notifyListeners();

    final userEmail = user?.email ?? '';
    if (userEmail.isNotEmpty) {
      _startSessionGuard();
      try {
        await _authService.ensureUserProfile(user!);
      } catch (_) {
        // Profil-Sync darf Loginfluss nicht blockieren.
      }
      unawaited(_runNotificationCleanup(user!.uid));
      _pendingInvitationsSub = _invitationService
          .streamPendingInvitationCount(userEmail)
          .listen((_) {
        // Listener nur aktiv halten, damit neue Einladungen sofort sichtbar werden.
      });
    }
  }

  void _startSessionGuard() {
    _sessionGuardTimer = Timer.periodic(const Duration(seconds: 20), (_) async {
      final current = _user;
      if (current == null) return;
      try {
        final valid = await _authService.verifyCurrentUserStillValid();
        if (!valid) {
          _error = 'Konto deaktiviert oder gelöscht. Du wurdest abgemeldet.';
          notifyListeners();
          await _authService.logout();
        }
      } catch (_) {
        // Ignore transient errors and retry on next cycle.
      }
    });
  }

  Future<bool> login(String email, String password) async {
    _setLoading(true);
    _error = null;
    try {
      await _authService.login(email: email, password: password);
      return true;
    } on FirebaseAuthException catch (e) {
      _error = _friendlyAuthError(e, isLogin: true);
      notifyListeners();
      return false;
    } catch (_) {
      _error = 'Unerwarteter Fehler beim Login. Bitte erneut versuchen.';
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> register(
      String email, String password, String displayName) async {
    _setLoading(true);
    _error = null;
    try {
      await _authService.register(
          email: email, password: password, displayName: displayName);
      return true;
    } on FirebaseAuthException catch (e) {
      _error = _friendlyAuthError(e, isLogin: false);
      notifyListeners();
      return false;
    } catch (_) {
      _error =
          'Unerwarteter Fehler bei der Registrierung. Bitte erneut versuchen.';
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  String _friendlyAuthError(FirebaseAuthException e, {required bool isLogin}) {
    switch (e.code) {
      case 'wrong-password':
        return 'Das Passwort ist falsch.';
      case 'invalid-credential':
        return 'E-Mail oder Passwort ist falsch.';
      case 'user-not-found':
        return 'Kein Konto mit dieser E-Mail gefunden.';
      case 'invalid-email':
        return 'Die E-Mail-Adresse ist ungültig.';
      case 'email-already-in-use':
        return 'Diese E-Mail wird bereits verwendet.';
      case 'weak-password':
        return 'Das Passwort ist zu schwach (mindestens 6 Zeichen).';
      case 'operation-not-allowed':
        return 'E-Mail/Passwort-Anmeldung ist in Firebase nicht aktiviert.';
      case 'too-many-requests':
        return 'Zu viele Versuche. Bitte später erneut versuchen.';
      case 'network-request-failed':
        return 'Netzwerkfehler. Bitte Internetverbindung prüfen.';
      case 'user-disabled':
        return 'Dieses Benutzerkonto wurde deaktiviert.';
      case 'timeout':
        return isLogin
            ? 'Login dauert zu lange. Bitte erneut versuchen.'
            : 'Registrierung dauert zu lange. Bitte erneut versuchen.';
      default:
        return isLogin
            ? 'Login fehlgeschlagen. Bitte Eingaben prüfen.'
            : 'Registrierung fehlgeschlagen. Bitte Eingaben prüfen.';
    }
  }

  Future<void> logout() => _authService.logout();

  Future<bool> sendPasswordResetEmail(String email) async {
    _error = null;
    try {
      await _authService.sendPasswordResetEmail(email);
      return true;
    } on FirebaseAuthException catch (e) {
      _error = _friendlyAuthError(e, isLogin: true);
      notifyListeners();
      return false;
    } catch (_) {
      _error = 'Reset-E-Mail konnte nicht gesendet werden.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> resendVerificationEmail() async {
    _setLoading(true);
    _error = null;
    try {
      await _authService.resendVerificationEmail();
      return true;
    } on FirebaseAuthException catch (e) {
      _error = _friendlyAuthError(e, isLogin: false);
      notifyListeners();
      return false;
    } catch (_) {
      _error = 'Verifizierungs-E-Mail konnte nicht gesendet werden.';
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  void _setLoading(bool value) {
    _loading = value;
    notifyListeners();
  }

  Future<void> _runNotificationCleanup(String userId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      final lastRunMs = prefs.getInt(_notificationCleanupLastRunKey) ?? 0;
      const minIntervalMs = 24 * 60 * 60 * 1000; // 1 day
      if (nowMs - lastRunMs < minIntervalMs) return;

      await _notificationService.deleteNotificationsOlderThanDays(
        userId: userId,
        days: 30,
      );
      await prefs.setInt(_notificationCleanupLastRunKey, nowMs);
    } catch (_) {
      // Cleanup should never block auth flow.
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    _pendingInvitationsSub?.cancel();
    _sessionGuardTimer?.cancel();
    super.dispose();
  }
}
