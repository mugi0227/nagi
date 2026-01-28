/**
 * 名前表示のユーティリティ関数
 *
 * 優先順序:
 * 1. 姓・名が両方ある場合: "姓 名" (例: "山田 太郎")
 * 2. 姓のみ: 姓を返す
 * 3. 名のみ: 名を返す
 * 4. フォールバック: userId
 */

interface HasName {
  first_name?: string | null;
  last_name?: string | null;
  id?: string;
}

interface HasDisplayName {
  display_name?: string | null;
  member_display_name?: string;
  member_user_id?: string;
  id?: string;
}

/**
 * ユーザーの表示名を取得
 * @param user - first_name, last_name, id を持つオブジェクト
 * @param fallbackId - フォールバック用のID（userオブジェクトにidがない場合）
 * @returns 表示名
 */
export function getDisplayName(
  user: HasName | null | undefined,
  fallbackId?: string
): string {
  if (!user) {
    return fallbackId || 'Unknown';
  }

  const lastName = user.last_name?.trim();
  const firstName = user.first_name?.trim();

  if (lastName && firstName) {
    return `${lastName} ${firstName}`;
  }
  if (lastName) {
    return lastName;
  }
  if (firstName) {
    return firstName;
  }

  return user.id || fallbackId || 'Unknown';
}

/**
 * メンバーの表示名を取得（ProjectMember用）
 * member_display_name が設定されていればそれを使用、
 * なければ member_user_id をフォールバックとして使用
 *
 * @param member - ProjectMember または類似のオブジェクト
 * @returns 表示名
 */
export function getMemberDisplayName(
  member: HasDisplayName | null | undefined
): string {
  if (!member) {
    return 'Unknown';
  }

  const displayName = member.member_display_name?.trim() || member.display_name?.trim();
  if (displayName) {
    return displayName;
  }

  return member.member_user_id || member.id || 'Unknown';
}

/**
 * 複数のフィールドから表示名を決定（汎用）
 * 優先順: 姓名 → display_name → username → userId
 *
 * @param options - 表示名決定に使用するフィールド
 * @returns 表示名
 */
export function resolveDisplayName(options: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  username?: string | null;
  userId?: string | null;
}): string {
  const { firstName, lastName, displayName, username, userId } = options;

  const lastNameTrimmed = lastName?.trim();
  const firstNameTrimmed = firstName?.trim();

  // 姓名優先
  if (lastNameTrimmed && firstNameTrimmed) {
    return `${lastNameTrimmed} ${firstNameTrimmed}`;
  }
  if (lastNameTrimmed) {
    return lastNameTrimmed;
  }
  if (firstNameTrimmed) {
    return firstNameTrimmed;
  }

  // display_name フォールバック（バックエンドで姓名から構築済みの可能性）
  const displayNameTrimmed = displayName?.trim();
  if (displayNameTrimmed) {
    return displayNameTrimmed;
  }

  // userId フォールバック（username は使わない）
  return userId || 'Unknown';
}
