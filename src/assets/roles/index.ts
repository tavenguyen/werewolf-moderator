import werewolf from './werewolf.jpg';

export const ROLE_IMAGES: Record<string, string> = {
  werewolf,
};

export function getRoleImage(roleId: string): string | undefined {
  return ROLE_IMAGES[roleId];
}
