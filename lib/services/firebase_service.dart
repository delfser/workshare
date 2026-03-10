import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

class FirebaseService {
  FirebaseService._();

  static final auth = FirebaseAuth.instance;
  static final db = FirebaseFirestore.instance;
  static final storage = FirebaseStorage.instance;

  static CollectionReference<Map<String, dynamic>> get users =>
      db.collection('users');

  static CollectionReference<Map<String, dynamic>> get projects =>
      db.collection('projects');

  static CollectionReference<Map<String, dynamic>> get members =>
      db.collection('project_members');

  static CollectionReference<Map<String, dynamic>> get materials =>
      db.collection('materials');

  static CollectionReference<Map<String, dynamic>> get catalog =>
      db.collection('catalog_entries');

  static CollectionReference<Map<String, dynamic>> get invitations =>
      db.collection('invitations');
  static CollectionReference<Map<String, dynamic>> get appNotifications =>
      db.collection('app_notifications');

  static CollectionReference<Map<String, dynamic>> get projectNotes =>
      db.collection('project_notes');

  static CollectionReference<Map<String, dynamic>> get workLogs =>
      db.collection('work_logs');

  static CollectionReference<Map<String, dynamic>> get projectPhotos =>
      db.collection('project_photos');

  static CollectionReference<Map<String, dynamic>> get projectJoinCodes =>
      db.collection('project_join_codes');

  static CollectionReference<Map<String, dynamic>> get workgroups =>
      db.collection('workgroups');

  static CollectionReference<Map<String, dynamic>> get workgroupMembers =>
      db.collection('workgroup_members');

  static CollectionReference<Map<String, dynamic>> get workgroupJoinCodes =>
      db.collection('workgroup_join_codes');

  static Timestamp now() => Timestamp.now();

  static String get currentUid => auth.currentUser!.uid;
}
