import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

String friendlyErrorMessage(Object error, {String? fallback}) {
  if (error is FirebaseAuthException) {
    switch (error.code) {
      case 'wrong-password':
      case 'invalid-credential':
        return 'E-Mail oder Passwort ist falsch.';
      case 'user-not-found':
        return 'Kein Konto mit dieser E-Mail gefunden.';
      case 'invalid-email':
        return 'Die E-Mail-Adresse ist ungueltig.';
      case 'email-already-in-use':
        return 'Diese E-Mail wird bereits verwendet.';
      case 'weak-password':
        return 'Das Passwort ist zu schwach.';
      case 'network-request-failed':
        return 'Netzwerkfehler. Bitte Internetverbindung pruefen.';
      default:
        return fallback ?? 'Aktion fehlgeschlagen. Bitte erneut versuchen.';
    }
  }

  if (error is FirebaseException) {
    switch (error.code) {
      case 'permission-denied':
        return 'Keine Berechtigung fuer diese Aktion.';
      case 'unavailable':
        return 'Dienst aktuell nicht verfuegbar. Bitte spaeter erneut versuchen.';
      case 'not-found':
        return 'Eintrag wurde nicht gefunden.';
      case 'already-exists':
        return 'Eintrag existiert bereits.';
      case 'failed-precondition':
        return 'Konfiguration fehlt noch (z. B. Datenbank-Index).';
      case 'deadline-exceeded':
        return 'Die Anfrage dauert zu lange. Bitte erneut versuchen.';
      case 'cancelled':
        return 'Vorgang wurde abgebrochen.';
      default:
        return fallback ?? 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
    }
  }

  if (error is StateError) {
    return error.message.toString();
  }

  return fallback ?? 'Ein unerwarteter Fehler ist aufgetreten.';
}
