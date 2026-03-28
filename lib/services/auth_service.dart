import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'firebase_service.dart';

class AuthService {
  Stream<User?> authStateChanges() => FirebaseService.auth.authStateChanges();

  Future<bool> verifyCurrentUserStillValid() async {
    final user = FirebaseService.auth.currentUser;
    // On some devices/situations currentUser can be briefly null while restoring
    // auth state. Do not force logout unless Firebase explicitly says the account
    // is invalid.
    if (user == null) return true;
    try {
      await user.reload().timeout(const Duration(seconds: 8));
      return true;
    } on FirebaseAuthException catch (e) {
      if (e.code == 'user-disabled' ||
          e.code == 'user-not-found' ||
          e.code == 'invalid-user-token' ||
          e.code == 'user-token-expired') {
        return false;
      }
      // Transient auth/network/provider errors must not auto-sign out users.
      return true;
    } on TimeoutException {
      // Network hiccups should not force logout.
      return true;
    } catch (_) {
      return true;
    }
  }

  Future<UserCredential> login(
      {required String email, required String password}) {
    return FirebaseService.auth
        .signInWithEmailAndPassword(
          email: email.trim(),
          password: password,
        )
        .timeout(const Duration(seconds: 20));
  }

  Future<void> ensureUserProfile(User user) {
    final now = FirebaseService.now();
    return FirebaseService.users.doc(user.uid).set({
      'id': user.uid,
      'email': (user.email ?? '').trim().toLowerCase(),
      'displayName': (user.displayName ?? '').trim(),
      'updatedAt': now,
      'createdAt': now,
    }, SetOptions(merge: true)).timeout(const Duration(seconds: 15));
  }

  Future<UserCredential> register({
    required String email,
    required String password,
    required String displayName,
  }) async {
    final credential = await FirebaseService.auth
        .createUserWithEmailAndPassword(
          email: email.trim(),
          password: password,
        )
        .timeout(const Duration(seconds: 20));

    await credential.user
        ?.updateDisplayName(displayName.trim())
        .timeout(const Duration(seconds: 10));

    await ensureUserProfile(credential.user!);
    await credential.user
        ?.sendEmailVerification()
        .timeout(const Duration(seconds: 15));

    return credential;
  }

  Future<void> sendPasswordResetEmail(String email) {
    return FirebaseService.auth
        .sendPasswordResetEmail(email: email.trim())
        .timeout(const Duration(seconds: 15));
  }

  Future<void> resendVerificationEmail() async {
    final user = FirebaseService.auth.currentUser;
    if (user == null || user.email == null || user.email!.trim().isEmpty) {
      throw StateError('Kein angemeldeter Benutzer mit E-Mail gefunden.');
    }
    await user.sendEmailVerification().timeout(const Duration(seconds: 15));
  }

  Future<void> logout() => FirebaseService.auth.signOut();
}
