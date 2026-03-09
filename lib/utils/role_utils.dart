import '../models/enums.dart';

bool canManageMembers(ProjectRole role) => role == ProjectRole.owner || role == ProjectRole.admin;

bool canWriteMaterials(ProjectRole role) =>
    role == ProjectRole.owner || role == ProjectRole.admin || role == ProjectRole.worker;
