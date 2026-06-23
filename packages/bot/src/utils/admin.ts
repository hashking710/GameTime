/**
 * Admin user utilities for managing premium testing access
 * 
 * Admin users automatically receive premium tier permissions without
 * database entries or payment, enabling testing of premium features.
 */

import { createLogger } from "@gametime/shared";

const logger = createLogger("admin");

let adminUserIds: Set<string> = new Set();

/**
 * Initialize admin user IDs from environment variable
 * @param adminUserIdsEnv Comma-separated string of Discord user IDs
 */
export function initializeAdminUsers(adminUserIdsEnv?: string) {
  adminUserIds = new Set();
  if (adminUserIdsEnv?.trim()) {
    adminUserIdsEnv
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .forEach((id) => adminUserIds.add(id));
    logger.info({ count: adminUserIds.size, ids: Array.from(adminUserIds) }, "Initialized admin users");
  } else {
    logger.warn("No admin user IDs configured");
  }
}

/**
 * Check if a user is an admin
 * Admin users automatically get premium tier access for testing
 * @param userId Discord user ID to check
 * @returns true if user is an admin
 */
export function isAdminUser(userId: string): boolean {
  return adminUserIds.has(userId);
}

/**
 * Get list of admin user IDs
 * @returns Set of admin user IDs
 */
export function getAdminUserIds(): Set<string> {
  return new Set(adminUserIds);
}
